package com.github.jorepong.safetycctv.capture;

import com.github.jorepong.safetycctv.camera.CameraRepository;
import com.github.jorepong.safetycctv.entity.Camera;
import com.github.jorepong.safetycctv.repository.DetectedObjectRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ensures that each camera keeps only a bounded number of data points that are used for perspective-map training.
 * Older detected objects beyond the configured limit are deleted before a new training run so that data storage does not grow indefinitely.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PerspectiveTrainingDataPruner {

    private static final int MAX_DATA_POINTS_PER_CAMERA = 20_000;

    private final CameraRepository cameraRepository;
    private final DetectedObjectRepository detectedObjectRepository;

    /**
     * Removes old analysis logs for every camera so that only the most recent {@value #MAX_DATA_POINTS_PER_CAMERA}
     * entries remain per camera. This method should be invoked right before triggering perspective-map training.
     */
    @Transactional
    public void pruneAllCameras() {
        List<Camera> cameras = cameraRepository.findAll();
        if (cameras.isEmpty()) {
            log.debug("[PerspectivePrune] No cameras registered. Skipping pruning step.");
            return;
        }

        cameras.forEach(camera -> pruneSingleCamera(camera.getId(), camera.getName()));
    }

    private void pruneSingleCamera(Long cameraId, String cameraName) {
        if (cameraId == null) {
            return;
        }
        long totalSamples = detectedObjectRepository.countByAnalysisLogCameraId(cameraId);
        if (totalSamples <= MAX_DATA_POINTS_PER_CAMERA) {
            return;
        }

        int deletedRows = detectedObjectRepository.deleteOlderThanLimit(cameraId, MAX_DATA_POINTS_PER_CAMERA);
        log.info(
            "[PerspectivePrune] Camera {}({}) removed {} stale detected objects (before={}, limit={}).",
            cameraId,
            cameraName,
            deletedRows,
            totalSamples,
            MAX_DATA_POINTS_PER_CAMERA
        );
    }
}
