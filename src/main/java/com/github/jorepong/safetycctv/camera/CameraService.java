package com.github.jorepong.safetycctv.camera;

import com.github.jorepong.safetycctv.dashboard.DashboardCameraView;
import com.github.jorepong.safetycctv.entity.AnalysisLog;
import com.github.jorepong.safetycctv.entity.Camera;
import com.github.jorepong.safetycctv.repository.AnalysisLogRepository;
import com.github.jorepong.safetycctv.repository.DetectedObjectRepository;
import com.github.jorepong.safetycctv.repository.SafetyAlertRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CameraService {

    private final CameraRepository cameraRepository;
    private final AnalysisLogRepository analysisLogRepository;
    private final DetectedObjectRepository detectedObjectRepository;
    private final SafetyAlertRepository safetyAlertRepository;

    public List<Camera> fetchAll() {
        return cameraRepository.findAllByOrderByCreatedAtDesc();
    }

    public Optional<Camera> findById(Long id) {
        return id == null ? Optional.empty() : cameraRepository.findById(id);
    }

    @Transactional
    public Camera create(CameraForm form) {
        return cameraRepository.save(form.toEntity());
    }

    @Transactional
    public void delete(Long cameraId) {
        if (cameraId == null) {
            return;
        }
        if (!cameraRepository.existsById(cameraId)) {
            return;
        }
        // Remove dependent records to satisfy FK constraints before deleting the camera itself.
        detectedObjectRepository.deleteByAnalysisLogCameraId(cameraId);
        analysisLogRepository.deleteByCameraId(cameraId);
        safetyAlertRepository.deleteByCameraId(cameraId);
        cameraRepository.deleteById(cameraId);
    }

    @Transactional
    public void updateTrainingStatus(Long cameraId, TrainingStatus trainingStatus) {
        if (cameraId == null || trainingStatus == null) {
            return;
        }
        cameraRepository.findById(cameraId).ifPresent(camera -> {
            camera.setTrainingStatus(trainingStatus);
            cameraRepository.save(camera);
        });
    }

    public CameraSummary summarize() {
        long total = cameraRepository.count();
        long healthy = cameraRepository.countByStatus(CameraStatus.HEALTHY);
        long warning = cameraRepository.countByStatus(CameraStatus.WARNING);
        long offline = cameraRepository.countByStatus(CameraStatus.OFFLINE);
        return new CameraSummary(total, healthy, warning, offline);
    }

    public List<DashboardCameraView> fetchYoutubeCameras() {
        return cameraRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(DashboardCameraView::from)
            .flatMap(Optional::stream)
            .toList();
    }

    public List<CameraListView> listView() {
        return cameraRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(CameraListView::from)
            .toList();
    }
}
