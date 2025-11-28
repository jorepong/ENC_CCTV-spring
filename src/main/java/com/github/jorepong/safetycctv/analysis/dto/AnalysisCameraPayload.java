package com.github.jorepong.safetycctv.analysis.dto;

import com.github.jorepong.safetycctv.analysis.CameraAnalyticsSummary;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

public record AnalysisCameraPayload(
        Long cameraId,
        String cameraName,
        boolean hasData,
        String congestionLevel,
        String congestionLabel,
        String statusTone,
        Double latestDensity,
        Integer latestPersonCount,
        String latestTimestamp,
        Double densityVelocityPerMin,
        Double densityAccelerationPerMin2,
        Long etaSeconds,
        String etaType,
        String etaMessage,
        Long timeInDangerSeconds,
        String dangerStartTimestamp,
        List<DensityPointPayload> densitySeries,
        List<StageAlertPayload> stageAlerts,
    com.github.jorepong.safetycctv.alert.dto.RecentAlertPayload latestAlert) {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    public static AnalysisCameraPayload from(CameraAnalyticsSummary summary) {
        return new AnalysisCameraPayload(
                summary.cameraId(),
                summary.cameraName(),
                summary.hasData(),
                summary.level().name(),
                summary.level().label(),
                summary.level().tone(),
                summary.latestDensity(),
                summary.latestPersonCount(),
                format(summary.latestTimestamp()),
                summary.densityVelocityPerMin(),
                summary.densityAccelerationPerMin2(),
                summary.etaSeconds(),
                summary.etaType().name(),
                summary.etaMessage(),
                summary.timeInDangerSeconds(),
                format(summary.timeInDangerSince()),
                summary.densitySeries().stream()
                        .map(sample -> new DensityPointPayload(sample.timestamp(), sample.density(),
                                sample.personCount(), null))
                        .toList(),
                summary.stageAlerts().stream().map(StageAlertPayload::from).toList(),
                summary.latestPersistedAlert() != null
                        ? new com.github.jorepong.safetycctv.alert.dto.RecentAlertPayload(
                                summary.cameraId(),
                                summary.cameraName(),
                                null, // Location not needed here as it's context-aware
                                summary.latestPersistedAlert().title(),
                                summary.latestPersistedAlert().message(),
                                summary.latestPersistedAlert().severity().name().toLowerCase(),
                                format(summary.latestPersistedAlert().timestamp()))
                        : null);
    }

    private static String format(LocalDateTime timestamp) {
        return timestamp != null ? timestamp.format(FORMATTER) : null;
    }
}
