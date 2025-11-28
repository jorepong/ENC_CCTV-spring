package com.github.jorepong.safetycctv.analysis;

import com.github.jorepong.safetycctv.camera.TrainingStatus; // Import TrainingStatus
import java.time.LocalDateTime;
import java.util.List;

public record CameraAnalyticsSummary(
    Long cameraId,
    String cameraName,
    boolean hasData,
    CongestionLevel level,
    Double latestDensity,
    Integer latestPersonCount,
    LocalDateTime latestTimestamp,
    Double densityVelocityPerMin,
    Double densityAccelerationPerMin2,
    Long etaSeconds,
    EtaType etaType,
    String etaMessage,
    Long timeInDangerSeconds,
    LocalDateTime timeInDangerSince,
    List<DensitySample> densitySeries,
    List<StageAlertView> stageAlerts,
    StageAlertView latestPersistedAlert,
    TrainingStatus trainingStatus // New field
) {

    public String timeInDangerFormatted() {
        if (timeInDangerSeconds == null || timeInDangerSeconds <= 0) {
            return "00:00:00";
        }
        long seconds = timeInDangerSeconds;
        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;
        long secs = seconds % 60;
        return String.format("%02d:%02d:%02d", hours, minutes, secs);
    }

    public double gaugeDensity() {
        if (latestDensity == null) {
            return 0.0;
        }
        return Math.min(latestDensity, 1.0);
    }
}
