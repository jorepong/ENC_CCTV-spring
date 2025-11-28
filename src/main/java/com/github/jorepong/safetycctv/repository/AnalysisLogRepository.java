package com.github.jorepong.safetycctv.repository;

import com.github.jorepong.safetycctv.camera.TrainingStatus;
import com.github.jorepong.safetycctv.entity.AnalysisLog;
import com.github.jorepong.safetycctv.entity.AnalysisStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AnalysisLogRepository extends JpaRepository<AnalysisLog, Long> {

    List<AnalysisLog> findByCameraIdAndTimestampBetweenOrderByTimestampAsc(Long cameraId, LocalDateTime start,
            LocalDateTime end);

    List<AnalysisLog> findByCameraIdAndTimestampAfterOrderByTimestampAsc(Long cameraId, LocalDateTime start);

    /**
     * Finds the most recent analysis log for a given camera ID.
     *
     * @param cameraId The ID of the camera.
     * @return an Optional containing the most recent AnalysisLog, or an empty
     *         Optional if none found.
     */
    Optional<AnalysisLog> findFirstByCameraIdOrderByTimestampDesc(Long cameraId);

    /**
     * Returns the latest analysis logs (up to 60 entries) for the given camera.
     *
     * @param cameraId camera identifier
     * @return ordered list (newest first) limited to at most 60 rows
     */
    List<AnalysisLog> findTop60ByCameraIdOrderByTimestampDesc(Long cameraId);

    List<AnalysisLog> findTop60ByCameraIdAndTimestampGreaterThanEqualOrderByTimestampDesc(
            Long cameraId,
            LocalDateTime timestamp);

    List<AnalysisLog> findByCameraIdAndTimestampGreaterThanEqualOrderByTimestampDesc(Long cameraId,
            LocalDateTime timestamp);

    @Modifying(clearAutomatically = true)
    @Transactional
    void deleteByCameraId(Long cameraId);

    Optional<AnalysisLog> findFirstByCameraIdAndAnalysisStatusOrderByTimestampDesc(Long cameraId,
            AnalysisStatus status);

    @Query(value = """
            SELECT al.density FROM analysis_logs al
            WHERE al.camera_id = :cameraId
              AND al.analysis_status = 'READY'
              AND al.timestamp >= :since
              AND DAYOFWEEK(al.timestamp) = :dayOfWeek
              AND HOUR(al.timestamp) BETWEEN :startHour AND :endHour
            """, nativeQuery = true)
    List<Double> findHistoricalDensities(
            @Param("cameraId") Long cameraId,
            @Param("since") LocalDateTime since,
            @Param("dayOfWeek") int dayOfWeek,
            @Param("startHour") int startHour,
            @Param("endHour") int endHour);

    // =================================================================================================================
    // New methods for refactoring to use analysisStatus
    // =================================================================================================================

    List<AnalysisLog> findByCameraIdAndAnalysisStatusAndTimestampBetweenOrderByTimestampAsc(
            Long cameraId,
            AnalysisStatus analysisStatus,
            LocalDateTime start,
            LocalDateTime end);

    List<AnalysisLog> findByCameraIdAndAnalysisStatusAndTimestampAfterOrderByTimestampAsc(
            Long cameraId,
            AnalysisStatus analysisStatus,
            LocalDateTime start);

    List<AnalysisLog> findTop60ByCameraIdAndAnalysisStatusOrderByTimestampDesc(Long cameraId,
            AnalysisStatus analysisStatus);

    List<AnalysisLog> findByCameraIdAndAnalysisStatusAndTimestampGreaterThanEqualOrderByTimestampDesc(
            Long cameraId,
            AnalysisStatus analysisStatus,
            LocalDateTime timestamp);

    @Query("SELECT COUNT(al) FROM AnalysisLog al WHERE al.timestamp >= :timestamp AND al.analysisStatus = :status")
    long countLogsWithStatusSince(@Param("timestamp") LocalDateTime timestamp, @Param("status") AnalysisStatus status);

    Optional<AnalysisLog> findByIdAndAnalysisStatus(Long id, AnalysisStatus status);

    @Query("SELECT AVG(al.density) FROM AnalysisLog al WHERE al.camera.id = :cameraId AND al.analysisStatus = :status AND al.timestamp BETWEEN :start AND :end")
    Double findAverageDensityByCameraIdAndAnalysisStatusAndTimestampBetween(
            @Param("cameraId") Long cameraId,
            @Param("status") AnalysisStatus status,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}
