package com.github.jorepong.safetycctv.controller;

import com.github.jorepong.safetycctv.alert.AlertService;
import com.github.jorepong.safetycctv.alert.AlertTrend;
import com.github.jorepong.safetycctv.analysis.AnalysisInsightsService;
import com.github.jorepong.safetycctv.analysis.CameraAnalyticsSummary;
import com.github.jorepong.safetycctv.analysis.CongestionLevel;
import com.github.jorepong.safetycctv.analysis.dto.AnalysisCameraPayload;
import com.github.jorepong.safetycctv.camera.CameraListView;
import com.github.jorepong.safetycctv.camera.CameraService;
import com.github.jorepong.safetycctv.capture.CaptureScheduler;
import com.github.jorepong.safetycctv.capture.TrainingScheduleTracker;
import com.github.jorepong.safetycctv.dashboard.DashboardCameraView;
import com.github.jorepong.safetycctv.dashboard.DashboardSidebarCamera;
import com.github.jorepong.safetycctv.dashboard.DashboardSummary;
import com.github.jorepong.safetycctv.entity.AnalysisLog;
import com.github.jorepong.safetycctv.entity.Camera;
import com.github.jorepong.safetycctv.map.MapCameraView;
import com.github.jorepong.safetycctv.repository.AnalysisLogRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@Slf4j
@RequiredArgsConstructor
public class WebController {

    private final CameraService cameraService;
    private final AnalysisLogRepository analysisLogRepository;
    private final AnalysisInsightsService analysisInsightsService;
    private final AlertService alertService;
    private final TrainingScheduleTracker trainingScheduleTracker;
    private final CaptureScheduler captureScheduler;

    @Value("${naver.map.client-id:}")
    private String naverMapClientId;

    @GetMapping("/")
    public String dashboard(
            @RequestParam(value = "cameraId", required = false) Long cameraId,
        Model model
    ) {
        List<Camera> allCameras = cameraService.fetchAll();

        List<DashboardCameraView> streamingCameras = allCameras.stream()
            .map(DashboardCameraView::from)
            .flatMap(Optional::stream)
            .toList();

        DashboardCameraView primaryCamera = streamingCameras.stream()
            .filter(camera -> Objects.equals(camera.id(), cameraId))
            .findFirst()
            .or(() -> streamingCameras.stream().findFirst())
            .orElse(null);

        log.info("[Dashboard] cameraId={}, total={}, streaming={}", cameraId, allCameras.size(), streamingCameras.size());

        Map<Long, CameraAnalyticsSummary> analyticsSummaryMap =
            analysisInsightsService.summarizeCameras(allCameras);

        DashboardSummary baseSummary =
            analysisInsightsService.buildDashboardSummary(allCameras, streamingCameras, analyticsSummaryMap);
        DashboardSummary dashboardSummary = enrichSummaryWithAlerts(baseSummary);
        model.addAttribute("dashboardSummary", dashboardSummary);

        Optional<CameraAnalyticsSummary> primaryAnalyticsOpt = Optional.ofNullable(primaryCamera)
            .map(DashboardCameraView::id)
            .map(analyticsSummaryMap::get);
        log.info(
            "[Dashboard] primary camera={}, analyticsPresent={}, trainingStatus={}",
            primaryCamera != null ? primaryCamera.name() : "NONE",
            primaryAnalyticsOpt.isPresent(),
            primaryAnalyticsOpt.map(CameraAnalyticsSummary::trainingStatus).map(Enum::name).orElse("NONE")
        );

        List<DashboardSidebarCamera> sidebarCameras = allCameras.stream()
            .map(camera -> {
                CameraAnalyticsSummary summary = analyticsSummaryMap.get(camera.getId());
                String location = camera.getAddress() != null && !camera.getAddress().isBlank()
                    ? camera.getAddress()
                    : camera.getLocationZone();
                return new DashboardSidebarCamera(
                    camera.getId(),
                    camera.getName(),
                    location,
                    summary != null ? summary.level() : CongestionLevel.NO_DATA,
                    camera.getTrainingStatus()
                );
            })
            .toList();
        model.addAttribute("sidebarCameras", sidebarCameras);


        model.addAttribute("streamingCameras", streamingCameras);
        model.addAttribute("primaryCamera", primaryCamera);
        model.addAttribute("primaryCameraAnalytics", primaryAnalyticsOpt.orElse(null));
        model.addAttribute("dashboardPanelData", primaryAnalyticsOpt.map(AnalysisCameraPayload::from).orElse(null));
        model.addAttribute("recentAlerts", alertService.getRecentAlerts(10));
        AlertTrend alertTrend = alertService.getHourlyTrendForLast24Hours();
        log.info(
            "[Dashboard] alertTrend points={} maxCount={}",
            alertTrend != null && alertTrend.points() != null ? alertTrend.points().size() : 0,
            alertTrend != null ? alertTrend.maxCount() : 0
        );
        model.addAttribute("alertTrend", alertTrend);

        primaryAnalyticsOpt.flatMap(summary ->
                analysisLogRepository.findFirstByCameraIdOrderByTimestampDesc(summary.cameraId())
            )
            .map(AnalysisLog::getAnnotatedImagePath)
            .filter(path -> !path.isBlank())
            .ifPresent(imagePath -> {
                String webPath = "/media/" + imagePath.replace("\\\\", "/");
                model.addAttribute("latestAnnotatedImagePath", webPath);
            });

        LocalDateTime nextTrainingTime = trainingScheduleTracker.getNextTrainingTime();
        if (nextTrainingTime != null) {
            model.addAttribute("nextTrainingTime", nextTrainingTime);
        }

        return "dashboard";
    }

    private DashboardSummary enrichSummaryWithAlerts(DashboardSummary baseSummary) {
        long recentAlerts = alertService.countRecentAlertsSince(LocalDateTime.now().minusMinutes(30));
        return new DashboardSummary(
            baseSummary.totalCameras(),
            baseSummary.streamingCameras(),
            baseSummary.camerasWithData(),
            baseSummary.camerasInDanger(),
            recentAlerts
        );
    }

    @GetMapping("/analysis")
    public String analysisPage(
        @RequestParam(value = "cameraId", required = false) Long cameraId,
        Model model
    ) {
        List<Camera> allCameras = cameraService.fetchAll();
        model.addAttribute("allCameras", allCameras);

        Camera selectedCamera = allCameras.stream()
            .filter(c -> Objects.equals(c.getId(), cameraId))
            .findFirst()
            .or(() -> allCameras.stream().findFirst())
            .orElse(null);

        if (selectedCamera == null) {
            return "analysis"; // No cameras available, render the empty state
        }
        model.addAttribute("selectedCamera", selectedCamera);

        analysisLogRepository.findFirstByCameraIdOrderByTimestampDesc(selectedCamera.getId())
            .map(AnalysisLog::getAnnotatedImagePath)
            .filter(path -> !path.isBlank())
            .ifPresent(imagePath -> {
                String webPath = "/media/" + imagePath.replace("\\\\", "/");
                model.addAttribute("latestAnnotatedImagePath", webPath);
            });

        analysisInsightsService.summarizeCamera(selectedCamera)
            .ifPresent(summary -> model.addAttribute("cameraAnalytics", summary));

        return "analysis";
    }

    @GetMapping("/comparison")
    public String comparisonPage(Model model) {
        List<CameraListView> cameraList = cameraService.listView();
        model.addAttribute("cameraListData", cameraList);
        return "comparison";
    }

    @GetMapping("/map")
    public String mapPage(Model model) {
        List<Camera> allCameras = cameraService.fetchAll();
        Map<Long, CameraAnalyticsSummary> summaries = analysisInsightsService.summarizeCameras(allCameras);
        List<MapCameraView> cameras = allCameras.stream()
            .map(camera -> MapCameraView.from(camera, summaries.get(camera.getId())))
            .filter(Objects::nonNull)
            .toList();
        model.addAttribute("mapCameras", cameras);
        model.addAttribute("naverMapClientId", naverMapClientId);
        return "map";
    }

    @GetMapping("/alerts")
    public String alertsPage(Model model) {
        List<CameraListView> cameraList = cameraService.listView();
        model.addAttribute("cameraListData", cameraList);
        return "alerts";
    }

    @GetMapping("/debug/train-perspective-map")
    public String triggerTrainingManually(RedirectAttributes redirectAttributes) {
        captureScheduler.triggerPerspectiveMapTraining();
        redirectAttributes.addFlashAttribute("toastMessage", "원근 맵 학습을 시작했습니다. 결과는 잠시 후 로그를 확인하세요.");
        return "redirect:/";
    }

    @GetMapping("/admin/density-verification")
    public String densityVerificationPage(Model model) {
        List<CameraListView> cameraList = cameraService.listView();
        model.addAttribute("cameras", cameraList != null ? cameraList : List.of());
        return "debug-density";
    }
}
