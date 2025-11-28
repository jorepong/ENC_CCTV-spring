package com.github.jorepong.safetycctv.alert;

import com.github.jorepong.safetycctv.alert.dto.AlertHistoryPayload;
import com.github.jorepong.safetycctv.alert.dto.AlertHistoryQuery;
import com.github.jorepong.safetycctv.alert.dto.AlertHistoryResponse;
import com.github.jorepong.safetycctv.alert.dto.AlertsPerHour;
import com.github.jorepong.safetycctv.analysis.AnalysisInsightsService;
import com.github.jorepong.safetycctv.analysis.StageAlertView;
import com.github.jorepong.safetycctv.analysis.StageSeverity;
import com.github.jorepong.safetycctv.camera.CameraService;
import com.github.jorepong.safetycctv.entity.Camera;
import com.github.jorepong.safetycctv.repository.SafetyAlertRepository;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AlertService {

    private final SafetyAlertRepository safetyAlertRepository;
    private final CameraService cameraService;
    private final AnalysisInsightsService analysisInsightsService;

    private static final int TREND_WINDOW_HOURS = 12;

    public AlertTrend getHourlyTrendForLast24Hours() {
        final LocalDateTime since = LocalDateTime.now().minus(TREND_WINDOW_HOURS, ChronoUnit.HOURS);
        final List<LocalDateTime> timestamps = safetyAlertRepository.findAlertTimestampsSince(since);

        if (!timestamps.isEmpty()) {
            final Map<Integer, Long> countsByHourMap = timestamps.stream()
                    .collect(Collectors.groupingBy(LocalDateTime::getHour, Collectors.counting()));
            return buildTrendFromHourlyCounts(countsByHourMap);
        }

        return buildTrendFromStageAlerts(LocalDateTime.now().minusHours(TREND_WINDOW_HOURS));
    }

    public List<RecentAlertView> getRecentAlerts(int limit) {
        final int normalizedLimit = Math.max(1, Math.min(limit, 30));
        final List<Camera> cameras = cameraService.fetchAll();
        if (cameras.isEmpty()) {
            return List.of();
        }

        final int perCameraLimit = Math.min(normalizedLimit * 2, 50);
        final List<RecentAlertView> collected = new ArrayList<>();
        for (Camera camera : cameras) {
            List<StageAlertView> alerts = analysisInsightsService.findStageAlerts(camera.getId(), perCameraLimit);
            for (StageAlertView alert : alerts) {
                if (alert == null || alert.timestamp() == null) {
                    continue;
                }
                collected.add(new RecentAlertView(
                        camera.getId(),
                        camera.getName(),
                        resolveCameraLocation(camera),
                        alert.title(),
                        alert.message(),
                        alert.severity(),
                        alert.timestamp()));
            }
        }

        final Comparator<RecentAlertView> byTimestamp = Comparator.comparing(
                RecentAlertView::timestamp,
                Comparator.nullsLast(LocalDateTime::compareTo)).reversed();

        return collected.stream()
                .sorted(byTimestamp)
                .limit(normalizedLimit)
                .toList();
    }

    public long countRecentAlertsSince(LocalDateTime since) {
        if (since == null) {
            return 0L;
        }
        List<Camera> cameras = cameraService.fetchAll();
        if (cameras.isEmpty()) {
            return 0L;
        }
        long total = 0L;
        for (Camera camera : cameras) {
            List<StageAlertView> alerts = analysisInsightsService.findStageAlertsSince(camera.getId(), since);
            total += alerts.size();
        }
        return total;
    }

    public AlertHistoryResponse getAlertHistory(AlertHistoryQuery query) {
        LocalDateTime defaultStart = LocalDateTime.now().minusDays(7);
        LocalDateTime start = query.start() != null ? query.start() : defaultStart;
        LocalDateTime end = query.end();
        String search = query.search() != null ? query.search().toLowerCase(Locale.KOREAN) : null;

        List<Camera> cameras = cameraService.fetchAll();
        List<Camera> targetCameras = query.cameraId() != null
                ? cameras.stream().filter(c -> Objects.equals(c.getId(), query.cameraId())).toList()
                : cameras;

        List<AlertHistoryPayload> records = new ArrayList<>();
        for (Camera camera : targetCameras) {
            if (camera == null) {
                continue;
            }
            List<StageAlertView> alerts = analysisInsightsService.findStageAlertsSince(
                    camera.getId(),
                    start);
            for (StageAlertView alert : alerts) {
                if (alert == null || alert.timestamp() == null) {
                    continue;
                }
                if (alert.timestamp().isBefore(start)) {
                    continue;
                }
                if (end != null && alert.timestamp().isAfter(end)) {
                    continue;

                }
                if (query.severity() != null && alert.severity() != query.severity()) {
                    continue;
                }
                if (query.minDensity() != null && alert.density() < query.minDensity()) {
                    continue;
                }
                if (query.maxDensity() != null && alert.density() > query.maxDensity()) {
                    continue;
                }
                if (search != null && !matchesSearch(camera, alert, search)) {
                    continue;
                }
                records.add(AlertHistoryPayload.from(camera, alert));
            }
        }

        sortRecords(records, query.sortOrder());

        int totalElements = records.size();
        int totalPages = totalElements == 0 ? 0 : (int) Math.ceil((double) totalElements / query.size());
        int fromIndex = Math.min(query.page() * query.size(), totalElements);
        int toIndex = Math.min(fromIndex + query.size(), totalElements);
        List<AlertHistoryPayload> pageContent = records.subList(fromIndex, toIndex);

        return new AlertHistoryResponse(
                pageContent,
                totalElements,
                totalPages,
                query.page(),
                query.size());
    }

    private AlertTrend buildTrendFromStageAlerts(LocalDateTime cutoff) {
        final Map<Integer, Long> countsByHourMap = new HashMap<>();
        final List<Camera> cameras = cameraService.fetchAll();
        for (Camera camera : cameras) {
            List<StageAlertView> alerts = analysisInsightsService.findStageAlertsSince(camera.getId(), cutoff);
            for (StageAlertView alert : alerts) {
                if (alert == null || alert.timestamp() == null || alert.timestamp().isBefore(cutoff)) {
                    continue;
                }
                if ("A0".equals(alert.code())) {
                    continue;
                }
                countsByHourMap.merge(alert.timestamp().getHour(), 1L, Long::sum);
            }
        }
        return buildTrendFromHourlyCounts(countsByHourMap);
    }

    private AlertTrend buildTrendFromHourlyCounts(Map<Integer, Long> countsByHourMap) {
        final int currentHour = LocalDateTime.now().getHour();
        final int startHour = currentHour - TREND_WINDOW_HOURS + 1;
        final List<AlertsPerHour> fullTrend = IntStream.range(0, TREND_WINDOW_HOURS)
                .map(i -> (startHour + i + 24) % 24)
                .mapToObj(hour -> {
                    long count = countsByHourMap.getOrDefault(hour, 0L);
                    return new AlertsPerHour(hour, count);
                })
                .toList();
        final long maxCount = fullTrend.stream()
                .mapToLong(AlertsPerHour::count)
                .max()
                .orElse(0L);
        return new AlertTrend(fullTrend, maxCount);
    }

    private boolean matchesSearch(Camera camera, StageAlertView alert, String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        String cameraName = camera != null && camera.getName() != null ? camera.getName().toLowerCase(Locale.KOREAN)
                : "";
        String title = alert.title() != null ? alert.title().toLowerCase(Locale.KOREAN) : "";
        String message = alert.message() != null ? alert.message().toLowerCase(Locale.KOREAN) : "";
        return cameraName.contains(keyword)
                || title.contains(keyword)
                || message.contains(keyword);
    }

    private void sortRecords(List<AlertHistoryPayload> records, Sort.Order order) {
        Comparator<AlertHistoryPayload> comparator;
        String property = order.getProperty();
        if ("cameraName".equalsIgnoreCase(property)) {
            comparator = Comparator.comparing(AlertHistoryPayload::cameraName,
                    Comparator.nullsLast(String::compareToIgnoreCase));
        } else if ("severity".equalsIgnoreCase(property)) {
            comparator = Comparator.comparing(payload -> severityRank(payload.severity()), Comparator.naturalOrder());
        } else if ("density".equalsIgnoreCase(property)) {
            comparator = Comparator.comparing(AlertHistoryPayload::density);
        } else {
            comparator = Comparator.comparing(AlertHistoryPayload::timestamp,
                    Comparator.nullsLast(LocalDateTime::compareTo));
        }

        if (order.getDirection() == Sort.Direction.DESC) {
            comparator = comparator.reversed();
        }
        records.sort(comparator);
    }

    private int severityRank(StageSeverity severity) {
        if (severity == null) {
            return 3;
        }
        return switch (severity) {
            case DANGER -> 0;
            case WARNING -> 1;
            case INFO -> 2;
        };
    }

    private String resolveCameraLocation(Camera camera) {
        if (camera == null) {
            return null;
        }
        if (camera.getAddress() != null && !camera.getAddress().isBlank()) {
            return camera.getAddress();
        }
        if (camera.getLocationZone() != null && !camera.getLocationZone().isBlank()) {
            return camera.getLocationZone();
        }
        return null;
    }
}
