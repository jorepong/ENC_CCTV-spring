package com.github.jorepong.safetycctv.analysis.dto;

import java.time.LocalDateTime;

public record DensityPointPayload(
        LocalDateTime timestamp,
        double density,
        Integer personCount,
        String annotatedImagePath) {
}