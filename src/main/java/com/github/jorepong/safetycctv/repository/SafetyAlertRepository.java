package com.github.jorepong.safetycctv.repository;

import com.github.jorepong.safetycctv.entity.SafetyAlert;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface SafetyAlertRepository extends JpaRepository<SafetyAlert, Long>, JpaSpecificationExecutor<SafetyAlert> {

        @Query("""
                        SELECT s.timestamp
                        FROM SafetyAlert s
                        LEFT JOIN s.analysisLog al
                        WHERE s.timestamp >= :startTime
                        AND (al.id IS NULL OR al.analysisStatus = com.github.jorepong.safetycctv.entity.AnalysisStatus.READY)
                        ORDER BY s.timestamp ASC
                        """)
        List<LocalDateTime> findAlertTimestampsSince(@Param("startTime") LocalDateTime startTime);

        @Deprecated
        @Query("""
                        SELECT FUNCTION('HOUR', s.timestamp), COUNT(s)
                        FROM SafetyAlert s
                        LEFT JOIN s.analysisLog al
                        WHERE s.timestamp >= :startTime
                        AND (al.id IS NULL OR al.analysisStatus = com.github.jorepong.safetycctv.entity.AnalysisStatus.READY)
                        GROUP BY FUNCTION('HOUR', s.timestamp)
                        ORDER BY FUNCTION('HOUR', s.timestamp) ASC
                        """)
        List<Object[]> findAlertsPerHourSince(@Param("startTime") LocalDateTime startTime);

        @Modifying(clearAutomatically = true)
        @Transactional
        void deleteByCameraId(Long cameraId);

        List<SafetyAlert> findTop10ByCameraIdOrderByTimestampDesc(Long cameraId);

        List<SafetyAlert> findByCameraIdAndTimestampGreaterThanEqualOrderByTimestampDesc(Long cameraId,
                        LocalDateTime timestamp);
}
