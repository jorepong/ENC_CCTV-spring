package com.github.jorepong.safetycctv.entity;

import com.github.jorepong.safetycctv.entity.Camera;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import com.github.jorepong.safetycctv.entity.AnalysisStatus;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Represents the result of a single AI analysis performed on a camera snapshot at a specific time.
 */
@Entity
@Table(name = "analysis_logs")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The camera that was analyzed.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "camera_id")
    private Camera camera;

    /**
     * The exact timestamp when the snapshot for this analysis was taken.
     */
    @Column(nullable = false)
    private LocalDateTime timestamp;

    /**
     * Indicates if the analysis used a trained perspective map ('READY') or a uniform map ('PENDING')
     * while accumulating data.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AnalysisStatus analysisStatus;

    /**
     * The final calculated density value (normalized, based on the 2nd semester's algorithm).
     * e.g., 1.0 means the area is at its standard capacity.
     */
    @Column(nullable = false)
    private Double density;

    /**
     * The number of people detected or tracked in this snapshot.
     */
    @Column(nullable = false)
    private Integer personCount;

    /**
     * The rate of change of density (1st derivative), indicating how fast the congestion is changing.
     */
    private Double densityVelocity;

    /**
     * The acceleration of density change (2nd derivative), indicating if the congestion change is speeding up or slowing down.
     */
    private Double densityAcceleration;

    /**
     * Estimated Time to Alert (ETA) for a specific threshold, if applicable. (e.g., ETA to DANGER_THRESHOLD)
     * This value represents the estimated time in minutes.
     */
    private Double eta;

    /**
     * The path to the raw captured frame image stored in the shared storage.
     */
    @Column(length = 512)
    private String rawImagePath;

    /**
     * The path to the annotated image (with bounding boxes) stored in the shared storage.
     */
    @Column(length = 512)
    private String annotatedImagePath;

    /**
     * A list of all individual objects detected in this analysis frame.
     * This relationship is cascaded, meaning operations on AnalysisLog will propagate to its DetectedObjects.
     */
    @Builder.Default
    @OneToMany(mappedBy = "analysisLog", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<DetectedObject> detectedObjects = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        if (this.timestamp == null) {
            this.timestamp = LocalDateTime.now();
        }
    }
}
