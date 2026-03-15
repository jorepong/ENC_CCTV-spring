package com.github.jorepong.safetycctv.analysis;

import com.github.jorepong.safetycctv.analysis.dto.AnalysisLogDetailPayload;
import com.github.jorepong.safetycctv.analysis.dto.CongestionHeatmapPayload;
import com.github.jorepong.safetycctv.analysis.dto.DensityPointPayload;
import com.github.jorepong.safetycctv.analysis.dto.StatisticalAnomalyPayload;
import com.github.jorepong.safetycctv.camera.CameraRepository;
import com.github.jorepong.safetycctv.camera.CameraStatisticsPayload;
import com.github.jorepong.safetycctv.camera.TrainingStatus;
import com.github.jorepong.safetycctv.dashboard.DashboardCameraView;
import com.github.jorepong.safetycctv.dashboard.DashboardSummary;
import com.github.jorepong.safetycctv.entity.AnalysisLog;
import com.github.jorepong.safetycctv.entity.AnalysisStatus;
import com.github.jorepong.safetycctv.entity.Camera;
import com.github.jorepong.safetycctv.repository.AnalysisLogRepository;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AnalysisInsightsService {

    private static final double CAUTION_THRESHOLD = 0.463;  // LOS C (raw 0.9) - log scaled
    private static final double DANGER_THRESHOLD = 1.0;     // LOS E (raw 3.0) - log scaled
    private static final long ETA_NOTICE_WINDOW_SECONDS = 600;
    private static final int RECENT_SAMPLE_LIMIT = 3;
    private static final int DEFAULT_ALERT_LIMIT = 10;
    private static final int STATS_MIN_DATA_POINTS = 20;
    private static final int STATS_HISTORY_WEEKS = 4;
    private static final int STATS_HOUR_WINDOW = 1;

    private final AnalysisLogRepository analysisLogRepository;
    private final CameraRepository cameraRepository;
    private final com.github.jorepong.safetycctv.repository.SafetyAlertRepository safetyAlertRepository;

    public List<CameraStatisticsPayload> getCameraStatistics(int days) {
        List<Camera> cameras = cameraRepository.findAll();

        return cameras.parallelStream()
                .map(camera -> {
                    LocalDateTime since = LocalDateTime.now().minusDays(days);

                    List<AnalysisLog> logs = findReadyLogsAsc(camera.getId(), since, null);

                    if (logs.isEmpty()) {
                        return null;
                    }

                    List<Double> densities = logs.stream().map(AnalysisLog::getDensity).toList();
                    double peakDensity = densities.stream().mapToDouble(d -> d).max().orElse(0.0);

                    double sum = densities.stream().mapToDouble(d -> d).sum();
                    double average = sum / densities.size();
                    double sumOfSquares = densities.stream().mapToDouble(d -> (d - average) * (d - average)).sum();
                    double stdDev = Math.sqrt(sumOfSquares / densities.size());

                    return new CameraStatisticsPayload(camera.getId(), camera.getName(), peakDensity, stdDev);
                })
                .filter(Objects::nonNull) // Filter out nulls if any
                .collect(Collectors.toList());
    }

    public StatisticalAnomalyPayload getStatisticalAnomaly(Long cameraId) {
        Optional<AnalysisLog> latestLogOpt = analysisLogRepository
                .findFirstByCameraIdAndAnalysisStatusOrderByTimestampDesc(
                        cameraId,
                        AnalysisStatus.READY);
        if (latestLogOpt.isEmpty()) {
            return StatisticalAnomalyPayload.notAnalyzable("현재 데이터 없음", null);
        }
        AnalysisLog latestLog = latestLogOpt.get();
        double currentDensity = latestLog.getDensity();
        LocalDateTime now = latestLog.getTimestamp();

        int dayOfWeekMysql = (now.getDayOfWeek().getValue() % 7) + 1;
        int currentHour = now.getHour();
        LocalDateTime since = now.minusWeeks(STATS_HISTORY_WEEKS);

        List<Double> densities = analysisLogRepository.findHistoricalDensities(
                cameraId,
                since,
                dayOfWeekMysql,
                Math.max(0, currentHour - STATS_HOUR_WINDOW),
                Math.min(23, currentHour + STATS_HOUR_WINDOW));

        if (densities.size() < STATS_MIN_DATA_POINTS) {
            return StatisticalAnomalyPayload.notAnalyzable("과거 데이터 부족 (" + densities.size() + "개)", currentDensity);
        }

        double sum = 0.0;
        for (double d : densities) {
            sum += d;
        }
        double average = sum / densities.size();

        double sumOfSquares = 0.0;
        for (double d : densities) {
            sumOfSquares += (d - average) * (d - average);
        }
        double stdDeviation = Math.sqrt(sumOfSquares / densities.size());

        if (stdDeviation < 1e-6) {
            return new StatisticalAnomalyPayload(true, "변동 없음", currentDensity, average, stdDeviation, 0.0);
        }

        double zScore = (currentDensity - average) / stdDeviation;
        String message;
        if (zScore > 2.5) {
            message = "이례적으로 높음";
        } else if (zScore > 1.5) {
            message = "평소보다 높음";
        } else if (zScore < -1.5) {
            message = "평소보다 낮음";
        } else {
            message = "정상 범위";
        }

        return new StatisticalAnomalyPayload(true, message, currentDensity, average, stdDeviation, zScore);
    }

    public List<CongestionHeatmapPayload> getCongestionHeatmapForLast7Days(Long cameraId) {
        if (cameraId == null) {
            return List.of();
        }

        LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
        List<AnalysisLog> logs = findReadyLogsAsc(cameraId, sevenDaysAgo, null);

        Map<DayOfWeek, Map<Integer, DoubleSummaryStatistics>> hourlyStatsByDay = logs.stream()
                .collect(Collectors.groupingBy(
                        log -> log.getTimestamp().getDayOfWeek(),
                        () -> new EnumMap<>(DayOfWeek.class),
                        Collectors.groupingBy(
                                log -> log.getTimestamp().getHour(),
                                Collectors.summarizingDouble(AnalysisLog::getDensity))));

        List<CongestionHeatmapPayload> heatmap = new ArrayList<>();
        for (DayOfWeek day : DayOfWeek.values()) {
            Map<Integer, DoubleSummaryStatistics> hourlyStats = hourlyStatsByDay.getOrDefault(day, Map.of());

            List<Double> averageDensities = new ArrayList<>();
            List<Double> maxDensities = new ArrayList<>();

            for (int hour = 0; hour < 24; hour++) {
                DoubleSummaryStatistics stats = hourlyStats.get(hour);
                if (stats != null && stats.getCount() > 0) {
                    averageDensities.add(stats.getAverage());
                    maxDensities.add(stats.getMax());
                } else {
                    averageDensities.add(0.0);
                    maxDensities.add(0.0);
                }
            }

            heatmap.add(new CongestionHeatmapPayload(
                    day.getDisplayName(TextStyle.SHORT, Locale.KOREAN),
                    day.getValue(),
                    averageDensities,
                    maxDensities));
        }
        return heatmap;
    }

    public Map<Long, CameraAnalyticsSummary> summarizeCameras(List<Camera> cameras) {
        if (cameras == null || cameras.isEmpty()) {
            return Map.of();
        }
        return cameras.stream()
                .map(camera -> summarizeCamera(camera).orElseGet(() -> buildEmptySummary(camera)))
                .collect(Collectors.toMap(CameraAnalyticsSummary::cameraId, summary -> summary));
    }

    public Optional<CameraAnalyticsSummary> summarizeCamera(Camera camera) {
        if (camera == null) {
            return Optional.empty();
        }

        List<AnalysisLog> logs = loadRecentLogs(camera);
        if (logs.isEmpty()) {
            log.debug("[Summary] Camera {} has no ready analysis logs. Returning empty summary.", camera.getId());
            return Optional.of(buildEmptySummary(camera));
        }
        return Optional.of(buildSummary(camera, logs));
    }

    public List<StageAlertView> findStageAlerts(Long cameraId, int limit) {
        if (cameraId == null) {
            return List.of();
        }

        List<com.github.jorepong.safetycctv.entity.SafetyAlert> alerts = safetyAlertRepository
                .findTop10ByCameraIdOrderByTimestampDesc(cameraId);
        return alerts.stream()
                .map(this::toStageAlertView)
                .limit(limit)
                .toList();
    }

    public List<StageAlertView> findStageAlertsSince(Long cameraId, LocalDateTime since) {
        if (cameraId == null || since == null) {
            return List.of();
        }

        List<com.github.jorepong.safetycctv.entity.SafetyAlert> alerts = safetyAlertRepository
                .findByCameraIdAndTimestampGreaterThanEqualOrderByTimestampDesc(cameraId, since);
        return alerts.stream()
                .map(this::toStageAlertView)
                .toList();
    }

    private StageAlertView toStageAlertView(com.github.jorepong.safetycctv.entity.SafetyAlert alert) {
        com.github.jorepong.safetycctv.entity.AnalysisLog log = alert.getAnalysisLog();
        Double density = log != null ? log.getDensity() : 0.0;

        return new StageAlertView(
                alert.getAnalysisLogId(),
                alert.getAlertType().name(),
                alert.getAlertType().getDisplayName(),
                alert.getMessage(),
                mapToStageSeverity(alert.getAlertLevel()),
                alert.getTimestamp(),
                density);
    }

    private StageSeverity mapToStageSeverity(com.github.jorepong.safetycctv.alert.AlertLevel level) {
        if (level == null)
            return StageSeverity.INFO;
        return switch (level) {
            case INFO -> StageSeverity.INFO;
            case WARNING -> StageSeverity.WARNING;
            case CRITICAL -> StageSeverity.DANGER;
        };
    }

    public DashboardSummary buildDashboardSummary(
            List<Camera> allCameras,
            List<DashboardCameraView> streamingCameras,
            Map<Long, CameraAnalyticsSummary> summaries) {
        long total = allCameras != null ? allCameras.size() : 0;
        long streaming = streamingCameras != null ? streamingCameras.size() : 0;
        var dataSummaries = summaries != null ? summaries.values() : List.<CameraAnalyticsSummary>of();

        long camerasWithData = dataSummaries.stream().filter(CameraAnalyticsSummary::hasData).count();
        long dangerCameras = dataSummaries.stream()
                .filter(summary -> summary.hasData() && summary.level() == CongestionLevel.DANGER)
                .count();

        long recentEvents = analysisLogRepository.countLogsWithStatusSince(
                LocalDateTime.now().minusMinutes(30),
                AnalysisStatus.READY);

        return new DashboardSummary(
                total,
                streaming,
                camerasWithData,
                dangerCameras,
                recentEvents);
    }

    private record EtaResult(Long seconds, EtaType type, String message) {
        static final EtaResult NONE = new EtaResult(null, EtaType.NONE, "현재 추세상 위험 단계 변동 징후 없음");
    }

    private record DangerWindow(Long seconds, LocalDateTime since) {
        static final DangerWindow EMPTY = new DangerWindow(0L, null);
    }

    private CameraAnalyticsSummary buildSummary(Camera camera, List<AnalysisLog> logsDesc) {
        AnalysisLog latest = logsDesc.get(0);
        List<AnalysisLog> ascLogs = new ArrayList<>(logsDesc);
        Collections.reverse(ascLogs);
        List<DensitySample> densitySeries = ascLogs.stream()
                .map(log -> new DensitySample(log.getTimestamp(), log.getDensity(), log.getPersonCount()))
                .toList();

        Double velocity = convertVelocityToPerMinute(latest.getDensityVelocity());
        Double acceleration = convertAccelerationToPerMinute2(latest.getDensityAcceleration());
        EtaResult eta = computeEta(latest.getDensity(), velocity, acceleration);
        DangerWindow dangerWindow = computeDangerWindow(logsDesc);
        CongestionLevel level = resolveLevel(latest.getDensity());
        List<StageAlertView> stageAlerts = buildStageAlertsTimeline(logsDesc, DEFAULT_ALERT_LIMIT);

        StageAlertView latestPersistedAlert = safetyAlertRepository
                .findTop10ByCameraIdOrderByTimestampDesc(camera.getId())
                .stream()
                .findFirst()
                .map(this::toStageAlertView)
                .orElse(null);

        return new CameraAnalyticsSummary(
                camera.getId(),
                camera.getName(),
                true,
                level,
                latest.getDensity(),
                latest.getPersonCount(),
                latest.getTimestamp(),
                velocity,
                acceleration,
                eta.seconds(),
                eta.type(),
                eta.message(),
                dangerWindow.seconds(),
                dangerWindow.since(),
                densitySeries,
                stageAlerts,
                latestPersistedAlert,
                camera.getTrainingStatus() // Pass trainingStatus from camera
        );
    }

    private CameraAnalyticsSummary buildEmptySummary(Camera camera) {
        TrainingStatus trainingStatus = camera != null && camera.getTrainingStatus() != null
                ? camera.getTrainingStatus()
                : TrainingStatus.UNKNOWN;
        return new CameraAnalyticsSummary(
                camera.getId(),
                camera.getName(),
                false,
                CongestionLevel.NO_DATA,
                null,
                null,
                null,
                null,
                null,
                null,
                EtaType.NONE,
                "ETA 정보 없음",
                0L,
                null,
                List.of(),
                List.of(),
                null,
                trainingStatus);
    }

    private List<AnalysisLog> loadRecentLogs(Camera camera) {
        if (camera == null) {
            return List.of();
        }
        return analysisLogRepository.findTop60ByCameraIdAndAnalysisStatusOrderByTimestampDesc(
                camera.getId(),
                AnalysisStatus.READY);
    }

    private List<AnalysisLog> loadLogsSince(Camera camera, LocalDateTime since) {
        if (camera == null) {
            return List.of();
        }
        if (since == null) {
            return loadRecentLogs(camera);
        }
        return analysisLogRepository.findByCameraIdAndAnalysisStatusAndTimestampGreaterThanEqualOrderByTimestampDesc(
                camera.getId(),
                AnalysisStatus.READY,
                since);
    }

    private Double convertVelocityToPerMinute(Double velocityPerSecond) {
        if (velocityPerSecond == null) {
            return null;
        }
        return velocityPerSecond * 60d;
    }

    private Double convertAccelerationToPerMinute2(Double accelerationPerSecond2) {
        if (accelerationPerSecond2 == null) {
            return null;
        }
        return accelerationPerSecond2 * 3600d;
    }

    private EtaResult computeEta(Double currentDensity, Double velocity, Double acceleration) {
        if (currentDensity == null) {
            return new EtaResult(null, EtaType.NONE, "최근 분석 데이터 부족");
        }
        if (velocity == null) {
            return new EtaResult(null, EtaType.NONE, "추세 계산 표본 부족");
        }

        double v = velocity;
        double a = acceleration != null ? acceleration : 0d;

        if (currentDensity < DANGER_THRESHOLD && v > 0) {
            Optional<Long> seconds = calculateEtaForThreshold(currentDensity, v, a, DANGER_THRESHOLD);
            if (seconds.isEmpty()) {
                return new EtaResult(null, EtaType.NONE, "추세 변동성 높아 위험 진입 ETA 산출 불가");
            }
            long etaSeconds = seconds.get();
            return new EtaResult(
                    etaSeconds,
                    EtaType.ENTERING_DANGER,
                    "약 " + formatMinutes(etaSeconds) + " 후 '위험' 진입 예상");
        }

        if (currentDensity >= DANGER_THRESHOLD && v < 0) {
            Optional<Long> seconds = calculateEtaForThreshold(currentDensity, v, a, DANGER_THRESHOLD);
            if (seconds.isEmpty()) {
                return new EtaResult(null, EtaType.NONE, "추세 변동성 높아 위험 완화 ETA 산출 불가");
            }
            long etaSeconds = seconds.get();
            return new EtaResult(
                    etaSeconds,
                    EtaType.EXITING_DANGER,
                    "약 " + formatMinutes(etaSeconds) + " 후 '주의' 복귀 예상");
        }

        return new EtaResult(null, EtaType.NONE, "현재 추세상 위험 단계 변동 징후 없음");
    }

    private Optional<Long> calculateEtaForThreshold(double currentDensity, double v, double a, double targetThreshold) {
        double diff = currentDensity - targetThreshold;

        if (Math.abs(a) < 1e-6) { // Linear case (no acceleration)
            if (Math.abs(v) < 1e-6)
                return Optional.empty();
            double minutes = -diff / v;
            return (minutes > 0) ? Optional.of((long) Math.round(minutes * 60)) : Optional.empty();
        }

        // Quadratic case
        double A = 0.5 * a;
        double B = v;
        double C = diff;
        double discriminant = B * B - 4 * A * C;

        if (discriminant < 0) {
            return Optional.empty();
        }

        double sqrt = Math.sqrt(discriminant);
        double denom = 2 * A;
        double t1 = (-B + sqrt) / denom;
        double t2 = (-B - sqrt) / denom;

        return pickPositiveMinimum(t1, t2)
                .map(minutes -> (long) Math.round(minutes * 60));
    }

    private Optional<Double> pickPositiveMinimum(double t1, double t2) {
        Double candidate = null;
        if (t1 > 0) {
            candidate = t1;
        }
        if (t2 > 0) {
            if (candidate == null || t2 < candidate) {
                candidate = t2;
            }
        }
        return Optional.ofNullable(candidate);
    }

    private DangerWindow computeDangerWindow(List<AnalysisLog> logs) {
        if (logs.isEmpty() || logs.get(0).getDensity() < DANGER_THRESHOLD) {
            return DangerWindow.EMPTY;
        }

        LocalDateTime end = logs.get(0).getTimestamp();
        LocalDateTime start = end;

        for (int i = 1; i < logs.size(); i++) {
            AnalysisLog log = logs.get(i);
            if (log.getDensity() < DANGER_THRESHOLD) {
                break;
            }
            start = log.getTimestamp();
        }

        long seconds = Duration.between(start, end).getSeconds();
        long safeSeconds = Math.max(seconds, 0L);
        return new DangerWindow(safeSeconds, start);
    }

    private CongestionLevel resolveLevel(Double density) {
        if (density == null) {
            return CongestionLevel.NO_DATA;
        }
        if (density >= DANGER_THRESHOLD) {
            return CongestionLevel.DANGER;
        }
        if (density >= CAUTION_THRESHOLD) {
            return CongestionLevel.CAUTION;
        }
        return CongestionLevel.FREE;
    }

    private List<StageAlertView> buildStageAlertsTimeline(List<AnalysisLog> logs, int limit) {
        List<StageAlertView> alerts = new ArrayList<>();
        if (logs.isEmpty() || limit <= 0) {
            return alerts;
        }

        for (int i = 0; i < logs.size() && alerts.size() < limit; i++) {
            AnalysisLog current = logs.get(i);
            AnalysisLog previous = i + 1 < logs.size() ? logs.get(i + 1) : null;

            Double velocity = convertVelocityToPerMinute(current.getDensityVelocity());
            Double acceleration = convertAccelerationToPerMinute2(current.getDensityAcceleration());
            EtaResult eta = computeEta(current.getDensity(), velocity, acceleration);

            List<StageAlertView> events = buildAlertsForLog(current, previous, velocity, eta);
            for (StageAlertView view : events) {
                alerts.add(view);
                if (alerts.size() >= limit) {
                    break;
                }
            }
        }

        return alerts;
    }

    private List<StageAlertView> buildAlertsForLog(
            AnalysisLog current,
            AnalysisLog previous,
            Double velocity,
            EtaResult eta) {
        List<StageAlertView> alerts = new ArrayList<>();
        LocalDateTime timestamp = current.getTimestamp();
        double density = current.getDensity();

        if (eta.type() == EtaType.ENTERING_DANGER
                && eta.seconds() != null
                && eta.seconds() > 0
                && eta.seconds() <= ETA_NOTICE_WINDOW_SECONDS) {
            alerts.add(new StageAlertView(
                    current.getId(),
                    "A1",
                    "위험 임박",
                    "약 " + formatMinutes(eta.seconds()) + " 후 위험 수위 도달 예상",
                    StageSeverity.WARNING,
                    timestamp,
                    density));
        }

        if (density >= DANGER_THRESHOLD) {
            alerts.add(new StageAlertView(
                    current.getId(),
                    "A3",
                    "위험 수위 돌파",
                    String.format("밀집도 %.2f가 임계 %.2f를 초과했습니다.", density, DANGER_THRESHOLD),
                    StageSeverity.DANGER,
                    timestamp,
                    density));

            if (velocity != null && velocity > 0.02) {
                alerts.add(new StageAlertView(
                        current.getId(),
                        "A4",
                        "혼잡 심화",
                        String.format("분당 +%.2f포인트 속도로 증가 중", velocity * 100),
                        StageSeverity.DANGER,
                        timestamp,
                        density));
            }
        } else if (previous != null && previous.getDensity() >= DANGER_THRESHOLD) {
            alerts.add(new StageAlertView(
                    current.getId(),
                    "A6",
                    "위험 해소",
                    "밀집도가 위험 기준 아래로 감소했습니다.",
                    StageSeverity.INFO,
                    timestamp,
                    density));
        }

        return alerts;
    }

    private String formatMinutes(long etaSeconds) {
        long minutes = (long) Math.ceil(etaSeconds / 60d);
        return minutes + "분";
    }

    private List<AnalysisLog> findReadyLogsAsc(Long cameraId, LocalDateTime start, LocalDateTime end) {
        if (cameraId == null || start == null) {
            return List.of();
        }
        if (end == null) {
            // "After" query
            return analysisLogRepository.findByCameraIdAndAnalysisStatusAndTimestampAfterOrderByTimestampAsc(
                    cameraId,
                    AnalysisStatus.READY,
                    start);
        } else {
            // "Between" query
            return analysisLogRepository.findByCameraIdAndAnalysisStatusAndTimestampBetweenOrderByTimestampAsc(
                    cameraId,
                    AnalysisStatus.READY,
                    start,
                    end);
        }
    }

    public List<DensityPointPayload> getDensityHistory(Long cameraId, LocalDateTime start, LocalDateTime end) {
        if (cameraId == null || start == null || end == null) {
            return List.of();
        }

        List<AnalysisLog> logs = findReadyLogsAsc(cameraId, start, end);

        return logs.stream()
                .map(log -> new DensityPointPayload(
                        log.getTimestamp(),
                        log.getDensity(),
                        log.getPersonCount(),
                        log.getAnnotatedImagePath()))
                .toList();
    }

    public Optional<AnalysisLogDetailPayload> getLogDetails(Long logId) {
        Optional<AnalysisLog> logOpt = analysisLogRepository.findByIdAndAnalysisStatus(logId, AnalysisStatus.READY);
        if (logOpt.isEmpty()) {
            return Optional.empty();
        }

        AnalysisLog log = logOpt.get();
        LocalDateTime start = log.getTimestamp().minusMinutes(5);
        LocalDateTime end = log.getTimestamp().plusMinutes(5);

        List<DensityPointPayload> history = getDensityHistory(log.getCamera().getId(), start, end);

        return Optional.of(AnalysisLogDetailPayload.from(log, history));
    }

    public com.github.jorepong.safetycctv.analysis.dto.ComparisonSummaryPayload getComparisonSummary(Long cameraId) {
        if (cameraId == null) {
            return com.github.jorepong.safetycctv.analysis.dto.ComparisonSummaryPayload.empty();
        }

        LocalDateTime now = LocalDateTime.now();
        Double currentAvg = getAverageDensity(cameraId, now.minusMinutes(7), now.plusMinutes(7));

        LocalDateTime yesterday = now.minusDays(1);
        Double yesterdayAvg = getAverageDensity(cameraId, yesterday.minusMinutes(7), yesterday.plusMinutes(7));

        LocalDateTime lastWeek = now.minusWeeks(1);
        Double lastWeekAvg = getAverageDensity(cameraId, lastWeek.minusMinutes(7), lastWeek.plusMinutes(7));

        Double yesterdayChange = calculateChange(currentAvg, yesterdayAvg);
        Double lastWeekChange = calculateChange(currentAvg, lastWeekAvg);

        return new com.github.jorepong.safetycctv.analysis.dto.ComparisonSummaryPayload(
                yesterdayAvg,
                yesterdayChange,
                lastWeekAvg,
                lastWeekChange);
    }

    private Double getAverageDensity(Long cameraId, LocalDateTime start, LocalDateTime end) {
        return analysisLogRepository.findAverageDensityByCameraIdAndAnalysisStatusAndTimestampBetween(
                cameraId,
                AnalysisStatus.READY,
                start,
                end);
    }

    private Double calculateChange(Double current, Double past) {
        if (current == null || past == null) {
            return null;
        }
        return current - past;
    }
}
