package com.github.jorepong.safetycctv.alert;

import lombok.Getter;

/**
 * Defines the severity level of a safety alert.
 * Matches Django's AlertLevel model.
 */
@Getter
public enum AlertLevel {
    INFO("정보"),
    WARNING("경고"),
    CRITICAL("심각");

    private final String displayName;

    AlertLevel(String displayName) {
        this.displayName = displayName;
    }
}
