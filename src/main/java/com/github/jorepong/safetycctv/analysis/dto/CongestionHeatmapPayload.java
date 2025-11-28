package com.github.jorepong.safetycctv.analysis.dto;

import java.util.List;

public record CongestionHeatmapPayload(
        String dayOfWeek,
        int dayOfWeekIndex, // 1 for Monday, 7 for Sunday
        List<Double> hourlyAverageDensities, // 24 elements, one for each hour
        List<Double> hourlyMaxDensities // 24 elements, one for each hour
) {

}
