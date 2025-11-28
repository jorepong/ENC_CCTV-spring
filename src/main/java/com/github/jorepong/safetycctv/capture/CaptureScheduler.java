package com.github.jorepong.safetycctv.capture;

import com.github.jorepong.safetycctv.camera.CameraService;
import com.github.jorepong.safetycctv.camera.TrainingStatus;
import com.github.jorepong.safetycctv.capture.dto.AiAnalysisResponse;
import com.github.jorepong.safetycctv.capture.dto.PerspectiveMapTrainingResponse;
import com.github.jorepong.safetycctv.entity.Camera;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.persistence.EntityNotFoundException;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Component
@Slf4j
public class CaptureScheduler {

    private final CameraService cameraService;
    private final WebClient webClient;
    private final TrainingScheduleTracker trainingScheduleTracker;
    private final PerspectiveTrainingDataPruner perspectiveTrainingDataPruner;

    private final int groupSize;
    private final int groupIntervalSeconds;

    private final AtomicInteger lastProcessedIndex = new AtomicInteger(-1);
    private final AtomicInteger consecutiveErrorCount = new AtomicInteger(0);
    private static final long INITIAL_ERROR_DELAY_SECONDS = 300; // 5분
    private static final long MAX_ERROR_DELAY_SECONDS = 3600;    // 1시간

    private ScheduledExecutorService executorService;

    public CaptureScheduler(
            CameraService cameraService,
            WebClient.Builder webClientBuilder,
            @Value("${ai.server.base-url}") String aiServerBaseUrl,
            TrainingScheduleTracker trainingScheduleTracker,
            PerspectiveTrainingDataPruner perspectiveTrainingDataPruner,
            @Value("${camera.scheduler.group-size}") int groupSize,
            @Value("${camera.scheduler.group-interval-seconds}") int groupIntervalSeconds) {
        this.cameraService = cameraService;
        this.webClient = webClientBuilder.baseUrl(aiServerBaseUrl).build();
        this.trainingScheduleTracker = trainingScheduleTracker;
        this.perspectiveTrainingDataPruner = perspectiveTrainingDataPruner;
        this.groupSize = groupSize;
        this.groupIntervalSeconds = groupIntervalSeconds;
    }

    @PostConstruct
    public void initialize() {
        log.info("그룹 분석 스케줄러를 초기화합니다. 그룹 크기: {}, 그룹 간격: {}초", groupSize, groupIntervalSeconds);
        // A single-threaded scheduler is sufficient to run our sequential-group logic.
        this.executorService = Executors.newSingleThreadScheduledExecutor();
        // Schedule the first run of the task with an initial delay.
        this.executorService.schedule(this::executeAnalysisGroup, 10, TimeUnit.SECONDS);
    }

    private void executeAnalysisGroup() {
        // Default delay is the configured group interval
        long nextDelaySeconds = groupIntervalSeconds;

        try {
            List<Camera> allCameras = cameraService.fetchAll();
            if (allCameras.isEmpty()) {
                log.info("등록된 카메라가 없어 그룹 분석 작업을 건너뜁니다.");
                return;
            }

            int totalCameras = allCameras.size();
            int startIndex = (lastProcessedIndex.get() + 1) % totalCameras;

            List<Camera> groupToProcess = new java.util.ArrayList<>();
            for (int i = 0; i < groupSize; i++) {
                int cameraIndex = (startIndex + i) % totalCameras;
                groupToProcess.add(allCameras.get(cameraIndex));
            }

            int lastIndexInGroup = (startIndex + groupSize - 1) % totalCameras;
            lastProcessedIndex.set(lastIndexInGroup);

            List<String> cameraNames = groupToProcess.stream().map(Camera::getName).toList();
            log.info("[스케줄러] 전체 {}대의 카메라를 찾았습니다. 그룹(크기: {}/{}) 분석을 {}번 인덱스부터 시작합니다: {}",
                    totalCameras,
                    groupToProcess.size(),
                    groupSize,
                    startIndex,
                    cameraNames);

            // Trigger analysis for the selected group and wait for all to complete.
            // Check if any analysis returned an ERROR status
            Boolean hasError = Flux.fromIterable(groupToProcess)
                    .flatMap(this::requestAnalysis)
                    .reduce(false, (acc, isError) -> acc || isError) // Combine results: true if any is true
                    .block(); // Block until done

            if (Boolean.TRUE.equals(hasError)) {
                int errorCount = consecutiveErrorCount.incrementAndGet();
                
                // 지수 백오프 계산: 300 * 2^(n-1)
                long backoffDelay = INITIAL_ERROR_DELAY_SECONDS * (long) Math.pow(2, errorCount - 1);
                
                // 최대 시간 제한
//                nextDelaySeconds = Math.min(backoffDelay, MAX_ERROR_DELAY_SECONDS);
                nextDelaySeconds = 10;

                log.warn("분석 중 ERROR 상태가 감지되었습니다. (연속 {}회). 다음 분석까지 {}초 대기합니다.", 
                        errorCount, nextDelaySeconds);
            } else {
                if (consecutiveErrorCount.get() > 0) {
                    log.info("분석이 정상적으로 복구되었습니다. 에러 카운트를 초기화합니다.");
                    consecutiveErrorCount.set(0);
                }
                log.info("그룹 분석 완료: {}", cameraNames);
            }

        } catch (Exception e) {
            log.error("그룹 분석 스케줄러 작업 중 예기치 않은 오류가 발생했습니다", e);
        } finally {
            // Schedule the next run after the interval.
            // This creates the sequential, correctly-paced loop.
            if (executorService != null && !executorService.isShutdown()) {
                executorService.schedule(this::executeAnalysisGroup, nextDelaySeconds, TimeUnit.SECONDS);
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        log.info("그룹 분석 스케줄러의 Executor 서비스를 종료합니다.");
        if (executorService != null) {
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(10, TimeUnit.SECONDS)) {
                    log.warn("Executor 서비스가 10초 내에 종료되지 않았습니다. 강제 종료를 시도합니다.");
                    executorService.shutdownNow();
                }
            } catch (InterruptedException e) {
                log.error("Executor 서비스 종료 대기 중 오류가 발생했습니다", e);
                executorService.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Periodically triggers the AI server to train perspective maps for all
     * cameras.
     * Runs every hour.
     */
    @Scheduled(initialDelay = 600000, fixedRate = 3600000) // 10-min delay, 1-hour rate
    public void triggerPerspectiveMapTraining() {
        log.info("--- 원근 맵 학습 스케줄링 작업을 시작합니다 ---");
        // Set the next training time as soon as the task starts
        trainingScheduleTracker.updateNextTrainingTime(LocalDateTime.now().plusHours(1));
        perspectiveTrainingDataPruner.pruneAllCameras();

        webClient.post()
                .uri("/api/v1/perspective-map/train/")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Collections.emptyMap()) // Empty body to train all cameras
                .retrieve()
                .bodyToMono(PerspectiveMapTrainingResponse.class)
                .doOnSuccess(response -> {
                    if ("SUCCESS".equals(response.getStatus())) {
                        log.info("원근 맵 학습이 완료되었습니다. {}", response.getMessage());
                        response.getTrainedCameras().forEach(cam -> log.info("  - 학습 완료: {} ({}개 샘플 사용)",
                                cam.getCameraName(), cam.getSamplesUsed()));
                        response.getSkippedCameras()
                                .forEach(cam -> log.warn("  - 건너뜀: 카메라 ID {} (사유: {}, 사용 가능 샘플: {})", cam.getCameraId(),
                                        cam.getReason(), cam.getSamplesAvailable()));
                    } else {
                        log.error("원근 맵 학습에 실패했습니다. 응답: {}", response);
                    }
                })
                .onErrorResume(WebClientResponseException.class, ex -> {
                    log.error(
                            "원근 맵 학습 중 AI 서버가 {} 코드를 반환했습니다. 본문: {}",
                            ex.getStatusCode(),
                            ex.getResponseBodyAsString());
                    return Mono.empty();
                })
                .onErrorResume(WebClientRequestException.class, ex -> {
                    log.error("원근 맵 학습을 위해 AI 서버에 연결하지 못했습니다: {}", ex.getMessage());
                    return Mono.empty();
                })
                .onErrorResume(ex -> {
                    log.error("원근 맵 학습 중 예기치 않은 오류가 발생했습니다", ex);
                    return Mono.empty();
                })
                .subscribe();
    }

    /**
     * Sends a request to the AI server to process a single camera.
     *
     * @param camera The camera to be processed.
     * @return A Mono emitting true if the status was ERROR, false otherwise.
     */
    private Mono<Boolean> requestAnalysis(Camera camera) {
        return webClient.post()
                .uri("/api/v1/analysis/process-camera/")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("cameraId", camera.getId()))
                .retrieve()
                .bodyToMono(AiAnalysisResponse.class)
                .map(response -> {
                    log.info("카메라 [{}]에 대한 AI 서버 응답: {}", camera.getName(), response);

                    boolean isError = "ERROR".equalsIgnoreCase(response.getStatus());

                    if (response.getTrainingStatus() != null) {
                        try {
                            TrainingStatus status = TrainingStatus.valueOf(response.getTrainingStatus());
                            cameraService.updateTrainingStatus(camera.getId(), status);
                        } catch (IllegalArgumentException e) {
                            log.warn("카메라 [{}]로부터 알 수 없는 학습 상태를 받았습니다: {}", camera.getName(),
                                    response.getTrainingStatus());
                            cameraService.updateTrainingStatus(camera.getId(), TrainingStatus.UNKNOWN);
                        } catch (EntityNotFoundException e) {
                            log.warn("분석 중 카메라 '{}'(ID: {})가 삭제되었습니다. 상태 업데이트를 건너뜁니다.", camera.getName(),
                                    camera.getId());
                        }
                    }
                    return isError;
                })
                .onErrorResume(WebClientResponseException.class, ex -> {
                    log.error(
                            "카메라 [{}] 처리 중 AI 서버가 {} 코드를 반환했습니다. 본문: {}",
                            ex.getStatusCode(),
                            camera.getName(),
                            ex.getResponseBodyAsString());

                    // Attempt to parse the error body to check for "ERROR" status
                    try {
                        AiAnalysisResponse errorResponse = ex.getResponseBodyAs(AiAnalysisResponse.class);
                        if (errorResponse != null && "ERROR".equalsIgnoreCase(errorResponse.getStatus())) {
                            log.warn("카메라 [{}]에서 명시적인 ERROR 상태가 감지되었습니다: {}", camera.getName(),
                                    errorResponse.getMessage());
                            return Mono.just(true); // Trigger 5-minute delay
                        }
                    } catch (Exception parseEx) {
                        log.warn("에러 응답 본문 파싱 실패: {}", parseEx.getMessage());
                    }

                    return Mono.just(false); // Network error is not an explicit "ERROR" status from logic
                })
                .onErrorResume(WebClientRequestException.class, ex -> {
                    log.error("카메라 [{}] 분석을 위해 AI 서버에 연결하지 못했습니다: {}", camera.getName(), ex.getMessage());
                    return Mono.just(false);
                })
                .onErrorResume(ex -> {
                    log.error("카메라 [{}]에 대한 분석 요청 중 예기치 않은 오류가 발생했습니다", camera.getName(), ex);
                    return Mono.just(false);
                });
    }
}
