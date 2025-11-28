package com.github.jorepong.safetycctv.analysis.dto;

/**
 * Payload for comparison analysis summary (Yesterday vs Last Week).
 *
 * @param yesterdayDensity Average density at the same time yesterday (10-min
 *                         window).
 * @param yesterdayChange  Change rate compared to yesterday (current -
 *                         yesterday).
 * @param lastWeekDensity  Average density at the same time last week (10-min
 *                         window).
 * @param lastWeekChange   Change rate compared to last week (current -
 *                         lastWeek).
 */
public record ComparisonSummaryPayload(
        Double yesterdayDensity,
        Double yesterdayChange,
        Double lastWeekDensity,
        Double lastWeekChange) {
    public static ComparisonSummaryPayload empty() {
        return new ComparisonSummaryPayload(null, null, null, null);
    }
}
