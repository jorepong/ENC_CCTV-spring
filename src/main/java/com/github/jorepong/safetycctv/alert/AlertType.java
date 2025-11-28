package com.github.jorepong.safetycctv.alert;

import lombok.Getter;

@Getter
public enum AlertType {
    CONGESTION_ENTERED("혼잡 진입"),
    CONGESTION_EXITED("혼잡 해소"),

    // Advanced Analysis Alerts
    A1("A1. 위험 임박"),
    A2("A2. 급상승 감지"),
    A3("A3. 위험 수위 돌파"),
    A4("A4. 혼잡 심화"),
    A5("A5. 혼잡-정체 지속"),

    A6("A6. 위험 해소");

    private final String displayName;

    AlertType(String displayName) {
        this.displayName = displayName;
    }
}