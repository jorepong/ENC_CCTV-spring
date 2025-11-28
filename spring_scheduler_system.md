# Spring Boot - 스케줄러 시스템 문서

## 1. 스케줄러 시스템 개요

Spring Boot 서버는 Django AI 서버와의 통신을 자동화하는 스케줄러 시스템을 운영합니다. 이 시스템은 주기적으로 카메라 분석을 요청하고, 원근 맵 학습을 트리거하며, 학습 데이터를 관리합니다.

**핵심 컴포넌트**:
1. `CaptureScheduler` - 카메라 분석 및 원근 맵 학습 스케줄링
2. `TrainingScheduleTracker` - 다음 원근 맵 학습 시간 추적
3. `PerspectiveTrainingDataPruner` - 학습 데이터 정리

---

## 2. CaptureScheduler

### 2.1. 역할 및 책임

`CaptureScheduler`는 시스템의 자동화 엔진으로, 다음 두 가지 주요 작업을 수행합니다:

1. **카메라 그룹 분석**: 등록된 카메라들을 그룹으로 나누어 순차적으로 Django AI 서버에 분석 요청
2. **원근 맵 학습**: 1시간마다 모든 카메라의 원근 맵을 재학습

### 2.2. 카메라 그룹 분석

#### 2.2.1. 동작 원리

카메라 그룹 분석은 라운드 로빈 방식으로 작동합니다. 예를 들어 8대의 카메라가 있고 그룹 크기가 3이면, [A,B,C] → [D,E,F] → [G,H,A] → [B,C,D] 순서로 순환하며 분석합니다. 각 그룹 처리 후 설정된 간격만큼 대기한 후 다음 그룹을 처리합니다.

**핵심 특징**:
- 전체 카메라를 순환하며 모든 카메라가 공평하게 분석됨
- 그룹 크기와 간격을 조정하여 서버 부하 제어
- 한 그룹의 모든 카메라 분석이 완료된 후 다음 그룹 시작

#### 2.2.2. 설정 파라미터

**application.properties**:
```properties
# 한 번에 처리할 카메라 수
camera.scheduler.group-size=1

# 그룹 처리 후 대기 시간 (초)
camera.scheduler.group-interval-seconds=6
```

**권장 설정**:
- **순차 처리**: `group-size=1`, `group-interval-seconds=6`
  - 카메라를 하나씩 처리, 6초 간격
  - 안정적이지만 느림
- **병렬 처리**: `group-size=3`, `group-interval-seconds=10`
  - 3대씩 동시 처리, 10초 간격
  - 빠르지만 서버 부하 증가

#### 2.2.3. 초기화 및 시작

스케줄러는 애플리케이션 시작 시 자동으로 초기화되며, 단일 스레드 실행자를 생성하여 순차적인 그룹 분석을 보장합니다.

**초기 지연**: 애플리케이션 시작 후 10초 대기
- 이유: 데이터베이스 및 Django 서버 초기화 시간 확보

#### 2.2.4. 그룹 분석 실행 흐름

**주요 단계**:
1. **카메라 조회**: 데이터베이스에서 모든 카메라 정보 가져오기
2. **그룹 선택**: 마지막 처리 인덱스 다음부터 설정된 그룹 크기만큼 선택 (라운드 로빈)
3. **병렬 분석**: 그룹 내 카메라들을 동시에 Django 서버에 요청하여 처리
4. **에러 감지**: 하나라도 ERROR 상태 반환 시 에러로 간주
5. **재스케줄링**: 성공 여부와 관계없이 설정된 간격 후 다음 그룹 실행 예약

#### 2.2.5. AI 서버 통신

Spring 서버는 WebClient를 사용하여 Django AI 서버에 비동기 HTTP 요청을 보냅니다. 각 카메라에 대해 분석을 요청하고, 응답에서 ERROR 상태 여부를 확인하며, 학습 상태(TrainingStatus)를 업데이트합니다.

**Django API**: `POST /api/v1/analysis/process-camera/`

**요청 본문**:
```json
{
  "cameraId": 1
}
```

**응답 예시 (성공)**:
```json
{
  "status": "SUCCESS",
  "cameraId": 1,
  "cameraName": "본관 로비 1번",
  "personCount": 8,
  "density": 0.52,
  "rawImagePath": "snapshots/raw/camera_1_20251208_130000.jpg",
  "annotatedImagePath": "snapshots/annotated/camera_1_20251208_130000.jpg",
  "trainingStatus": "READY",
  "message": "분석 완료"
}
```

**응답 예시 (에러)**:
```json
{
  "status": "ERROR",
  "cameraId": 1,
  "cameraName": "본관 로비 1번",
  "trainingStatus": "PENDING",
  "message": "원근 맵이 학습되지 않았습니다. 학습 데이터를 수집 중입니다."
}
```

#### 2.2.6. 에러 처리 및 백오프

**에러 감지 조건**:
1. Django 서버가 `status: "ERROR"` 반환
2. HTTP 에러 응답 본문에 `status: "ERROR"` 포함

**현재 동작**: 에러 발생 시에도 10초 후 재시도

**이유**: 원근 맵 학습 중 일시적인 ERROR 상태는 정상이므로, 빠르게 재시도하여 학습 완료 후 즉시 분석 재개합니다. 지수 백오프 전략은 구현되어 있으나 현재는 비활성화되어 있습니다.

#### 2.2.7. 학습 상태 동기화

Django 서버는 각 응답에 `trainingStatus` 필드를 포함하여 카메라의 학습 상태를 전달합니다. Spring 서버는 이 값을 파싱하여 데이터베이스의 카메라 학습 상태를 업데이트합니다.

**TrainingStatus 값**:
- `READY`: 원근 맵 학습 완료, 분석 가능
- `PENDING`: 원근 맵 학습 진행 중 또는 학습 데이터 수집 중
- `UNKNOWN`: 알 수 없는 상태

**UI 반영**:
- `PENDING` 상태인 카메라는 대시보드와 분석 페이지에서 "학습 중" 칩 표시
- 분석 데이터 대신 플레이스홀더 메시지 표시

### 2.3. 원근 맵 학습 스케줄링

#### 2.3.1. 동작 원리

원근 맵 학습은 Spring의 스케줄링 기능을 사용하여 주기적으로 실행됩니다.

**스케줄 설정**:
- 초기 지연: 애플리케이션 시작 후 10분 대기
- 실행 주기: 1시간마다 반복

**실행 순서**:
1. **다음 학습 시간 업데이트**: UI에 표시할 카운트다운 시작 (1시간 후로 설정)
2. **학습 데이터 정리**: 오래된 DetectedObject 데이터 삭제 (메모리 절약)
3. **Django 서버 호출**: 모든 카메라의 원근 맵 학습 비동기 요청

#### 2.3.2. Django API 통신

**요청**:
- **URL**: `POST /api/v1/perspective-map/train/`
- **본문**: `{}` (빈 객체 = 모든 카메라 학습)

**응답 예시**:
```json
{
  "status": "SUCCESS",
  "message": "원근 맵 학습이 완료되었습니다.",
  "trainedCameras": [
    {
      "cameraId": 1,
      "cameraName": "본관 로비 1번",
      "samplesUsed": 150
    },
    {
      "cameraId": 2,
      "cameraName": "정문 입구",
      "samplesUsed": 200
    }
  ],
  "skippedCameras": [
    {
      "cameraId": 3,
      "reason": "샘플 부족",
      "samplesAvailable": 5
    }
  ]
}
```

**응답 처리**:

Django 서버로부터 학습 결과를 받으면, 학습에 성공한 카메라 목록과 건너뛴 카메라 목록을 로그에 기록합니다. 각 카메라에 대해 사용된 샘플 수와 건너뛴 이유를 함께 출력하여 학습 상태를 추적할 수 있습니다.

#### 2.3.3. 에러 처리

원근 맵 학습 실패는 시스템 전체에 영향을 주지 않도록 조용히 처리됩니다.

**에러 발생 시**:
- 로그에 에러 기록 (HTTP 상태 코드 및 에러 메시지 포함)
- 다음 1시간 후 자동 재시도
- 카메라 분석은 계속 진행 (기존 원근 맵 사용)

### 2.4. 종료 처리

애플리케이션 종료 시 스케줄러를 안전하게 종료합니다.

**종료 절차**:
1. 새로운 작업 수락 거부, 진행 중인 작업은 완료 대기
2. 10초 동안 정상 종료 대기
3. 10초 내에 종료되지 않으면 강제 종료

---

## 3. TrainingScheduleTracker

### 3.1. 역할 및 책임

`TrainingScheduleTracker`는 다음 원근 맵 학습 예정 시간을 추적하고 제공합니다.

**사용처**:
- 대시보드 헤더의 "다음 원근 맵 학습까지 X분 Y초" 카운트다운

### 3.2. 구현

이 컴포넌트는 다음 학습 예정 시간을 `LocalDateTime` 형식으로 저장하고, 읽기/쓰기 락을 사용하여 스레드 안전성을 보장합니다. 초기값은 애플리케이션 시작 후 10분으로 설정됩니다.

### 3.3. 스레드 안전성

**ReentrantReadWriteLock 사용 이유**:
- 읽기 작업(UI 조회)은 동시에 여러 스레드가 수행 가능
- 쓰기 작업(스케줄러 업데이트)은 배타적으로 수행
- 읽기/쓰기 간 데이터 일관성 보장

### 3.4. 업데이트 시점

**업데이트 타이밍**: 학습 작업이 시작되는 즉시 다음 예정 시간을 1시간 후로 설정
- 이유: 학습은 비동기로 진행되므로, 완료를 기다리지 않고 즉시 다음 예정 시간 설정

---

## 4. PerspectiveTrainingDataPruner

### 4.1. 역할 및 책임

`PerspectiveTrainingDataPruner`는 원근 맵 학습에 사용되는 `DetectedObject` 데이터를 정리하여 데이터베이스 크기를 제한합니다.

**문제**: 30초마다 분석 시 하루 2,880개, 한 달 86,400개의 객체 데이터 누적
**해결**: 카메라당 최대 20,000개로 제한, 오래된 데이터 자동 삭제

### 4.2. 구현

이 서비스는 모든 카메라를 순회하며 각 카메라의 DetectedObject 개수를 확인합니다. 20,000개를 초과하는 경우, 타임스탬프 기준으로 가장 오래된 데이터부터 삭제하여 최신 20,000개만 유지합니다.

**제한값**: 카메라당 최대 20,000개의 DetectedObject

### 4.3. 삭제 로직

**동작 원리**:
1. 카메라의 모든 DetectedObject를 타임스탬프 내림차순으로 정렬
2. 최신 20,000개의 ID를 서브쿼리로 선택
3. 서브쿼리에 포함되지 않은 나머지 오래된 데이터를 일괄 삭제

### 4.4. 실행 시점

**실행 타이밍**: 원근 맵 학습 직전 (1시간마다)
- 이유: 학습에 사용할 데이터를 최신 상태로 유지하면서 데이터베이스 크기 제한

### 4.5. 성능 고려사항

**트랜잭션 범위**: 각 카메라별로 별도 트랜잭션
- 장점: 한 카메라 삭제 실패가 다른 카메라에 영향 없음
- 단점: 카메라 수가 많으면 트랜잭션 오버헤드 증가

**삭제 쿼리 최적화**:
- 서브쿼리로 최신 20,000개 ID 선택
- `NOT IN` 절로 나머지 삭제
- 인덱스 활용: `analysisLog.camera.id`, `analysisLog.timestamp`

---

## 5. 스케줄러 시스템 흐름도

### 5.1. 카메라 분석 흐름

```
[애플리케이션 시작]
        ↓
  10초 대기
        ↓
[executeAnalysisGroup 시작]
        ↓
  모든 카메라 조회
        ↓
  다음 그룹 선택 (라운드 로빈)
        ↓
  그룹 내 카메라들 병렬 분석 요청
        ↓
  Django 서버 응답 대기
        ↓
  학습 상태 업데이트
        ↓
  ERROR 상태 확인
        ↓
  ┌─────────────┬─────────────┐
  │   에러 발생  │   정상 완료  │
  ↓             ↓
10초 대기    설정된 간격 대기
  │             │
  └─────────────┴─────────────┘
        ↓
[다음 executeAnalysisGroup 스케줄링]
        ↓
  (무한 반복)
```

### 5.2. 원근 맵 학습 흐름

```
[애플리케이션 시작]
        ↓
  10분 대기
        ↓
[triggerPerspectiveMapTraining 시작]
        ↓
  다음 학습 시간 업데이트 (1시간 후)
        ↓
  학습 데이터 정리 (pruneAllCameras)
        ↓
  Django 서버에 학습 요청
        ↓
  비동기 응답 처리
        ↓
  로그 기록
        ↓
  1시간 대기
        ↓
[다음 triggerPerspectiveMapTraining]
        ↓
  (무한 반복)
```

---

## 6. 설정 가이드

### 6.1. application.properties

```properties
# AI 서버 URL
ai.server.base-url=http://localhost:8000

# 카메라 분석 스케줄러 설정
camera.scheduler.group-size=1
camera.scheduler.group-interval-seconds=6
```

### 6.2. 환경별 권장 설정

#### 개발 환경
```properties
camera.scheduler.group-size=1
camera.scheduler.group-interval-seconds=10
```
- 느리지만 안정적
- 디버깅 용이

#### 프로덕션 환경 (카메라 10대 이하)
```properties
camera.scheduler.group-size=1
camera.scheduler.group-interval-seconds=6
```
- 카메라당 6초 간격으로 순차 분석
- 10대 기준 1분마다 전체 순환

#### 프로덕션 환경 (카메라 20대 이상)
```properties
camera.scheduler.group-size=3
camera.scheduler.group-interval-seconds=10
```
- 3대씩 동시 분석, 10초 간격
- 20대 기준 약 70초마다 전체 순환
- Django 서버 리소스 충분 시 권장

---

## 7. 모니터링 및 로그

### 7.1. 주요 로그 메시지

**스케줄러 초기화**:
```
그룹 분석 스케줄러를 초기화합니다. 그룹 크기: 1, 그룹 간격: 6초
```

**그룹 분석 시작**:
```
[스케줄러] 전체 10대의 카메라를 찾았습니다. 그룹(크기: 1/1) 분석을 0번 인덱스부터 시작합니다: [본관 로비 1번]
```

**AI 서버 응답**:
```
카메라 [본관 로비 1번]에 대한 AI 서버 응답: AiAnalysisResponse(status=SUCCESS, cameraId=1, ...)
```

**그룹 분석 완료**:
```
그룹 분석 완료: [본관 로비 1번]
```

**에러 감지**:
```
분석 중 ERROR 상태가 감지되었습니다. (연속 1회). 다음 분석까지 10초 대기합니다.
```

**원근 맵 학습 시작**:
```
--- 원근 맵 학습 스케줄링 작업을 시작합니다 ---
```

**학습 완료**:
```
원근 맵 학습이 완료되었습니다. 3개 카메라 학습 완료, 1개 건너뜀
  - 학습 완료: 본관 로비 1번 (150개 샘플 사용)
  - 학습 완료: 정문 입구 (200개 샘플 사용)
  - 건너뜀: 카메라 ID 3 (사유: 샘플 부족, 사용 가능 샘플: 5)
```

**데이터 정리**:
```
[PerspectivePrune] Camera 1(본관 로비 1번) removed 5000 stale detected objects (before=25000, limit=20000).
```

### 7.2. 로그 레벨 설정

**application.properties**:
```properties
# 스케줄러 로그 레벨
logging.level.com.github.jorepong.safetycctv.capture=INFO

# 상세 디버깅 (개발 환경)
logging.level.com.github.jorepong.safetycctv.capture=DEBUG
```

---

## 8. 트러블슈팅

### 8.1. 카메라 분석이 멈춤

**증상**: 로그에 "그룹 분석 완료" 메시지가 나타나지 않음

**원인**:
1. Django 서버 다운 또는 응답 없음
2. 네트워크 연결 문제

**해결**:
1. Django 서버 상태 확인: `docker-compose logs django-container`
2. 네트워크 연결 확인: `curl http://django-container:8000/api/v1/analysis/process-camera/`
3. Spring 재시작: `docker-compose restart spring-container`

### 8.2. 원근 맵 학습 실패

**증상**: 로그에 "원근 맵 학습 중 AI 서버가 ... 코드를 반환했습니다" 메시지

**원인**:
1. 학습 데이터 부족 (샘플 < 최소 요구량)
2. Django 서버 메모리 부족

**해결**:
1. 충분한 시간 대기 (학습 데이터 수집)
2. Django 서버 리소스 확인: `docker stats enc-django`
3. 필요 시 메모리 증설

### 8.3. 데이터베이스 크기 증가

**증상**: MySQL 데이터베이스 크기가 계속 증가

**원인**: `PerspectiveTrainingDataPruner`가 작동하지 않음

**해결**:
1. 로그 확인: `[PerspectivePrune]` 메시지 검색
2. 수동 정리 실행 (필요 시):
   ```sql
   DELETE FROM detected_object
   WHERE id NOT IN (
       SELECT id FROM (
           SELECT id FROM detected_object
           WHERE analysis_log_id IN (
               SELECT id FROM analysis_log WHERE camera_id = 1
           )
           ORDER BY id DESC
           LIMIT 20000
       ) AS subquery
   );
   ```

---

## 9. 성능 최적화

### 9.1. 그룹 크기 조정

**목표**: 전체 카메라를 N초 이내에 순환

**계산**:
```
순환 시간 = (카메라 수 / 그룹 크기) × 그룹 간격
```

**예시**:
- 카메라 20대, 목표 순환 시간 60초
- `그룹 크기 = 20 / (60 / 그룹 간격)`
- 그룹 간격 10초 가정: `그룹 크기 = 20 / 6 ≈ 3`

### 9.2. Django 서버 성능

**병목 지점**: AI 모델 추론 시간

**최적화**:
1. GPU 사용 (CUDA)
2. 모델 경량화 (YOLO Nano)
3. 배치 처리 (여러 카메라 동시 처리)

### 9.3. 데이터베이스 쿼리

**인덱스 추가**:
```sql
CREATE INDEX idx_analysis_log_camera_timestamp 
ON analysis_log(camera_id, timestamp DESC);

CREATE INDEX idx_detected_object_analysis_log 
ON detected_object(analysis_log_id);
```

**효과**: 데이터 정리 쿼리 속도 향상
