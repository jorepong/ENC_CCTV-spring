package com.github.jorepong.safetycctv.analysis.dto;

import com.github.jorepong.safetycctv.entity.AnalysisLog;
import java.time.LocalDateTime;
import java.util.List;

public record AnalysisLogDetailPayload(
        Long analysisLogId,
        LocalDateTime timestamp,
        String rawImagePath,
        String annotatedImagePath,
        Double density,
        Double densityVelocity,
        Double densityAcceleration,
        Integer personCount,
        List<DensityPointPayload> surroundingHistory) {
    public static AnalysisLogDetailPayload from(AnalysisLog log, List<DensityPointPayload> history) {
        String rawPath = log.getRawImagePath() != null && !log.getRawImagePath().isBlank()
                ? "/media/" + log.getRawImagePath().replace("\\", "/")
                : null;
        String annotatedPath = log.getAnnotatedImagePath() != null && !log.getAnnotatedImagePath().isBlank()
                ? "/media/" + log.getAnnotatedImagePath().replace("\\", "/")
                : null;

        // Convert to per-minute values for frontend display
        Double velocityPerMinute = log.getDensityVelocity() != null ? log.getDensityVelocity() * 60 : null;
        Double accelerationPerMinute2 = log.getDensityAcceleration() != null ? log.getDensityAcceleration() * 3600
                : null;

        return new AnalysisLogDetailPayload(
                log.getId(),
                log.getTimestamp(),
                rawPath,
                annotatedPath,
                log.getDensity(),
                velocityPerMinute,
                accelerationPerMinute2,
                log.getPersonCount(),
                history);
    }
}
