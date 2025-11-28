# Spring Boot - REST API 명세서

## 1. API 개요

Spring Boot 서버는 웹 UI를 위한 REST API를 제공합니다. 모든 API는 `/api/v1` 경로 아래에 정의되어 있으며, JSON 형식으로 데이터를 주고받습니다.

**Base URL**: `https://dogcctv.ggm.kr/api/v1` (프로덕션)  
**Content-Type**: `application/json`  
**컨트롤러**: `AnalysisApiController`

---

## 2. 카메라 통계 API

### 2.1. 카메라 통계 조회

지정된 기간 동안의 카메라별 통계 정보를 조회합니다.

**Endpoint**: `GET /cameras/statistics`

**Query Parameters**:
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| days | int | No | 7 | 통계 조회 기간 (일) |

**Response**: `200 OK`
```json
[
  {
    "cameraId": 1,
    "cameraName": "본관 로비 1번",
    "peakDensity": 0.85,
    "densityStdDev": 0.23
  },
  {
    "cameraId": 2,
    "cameraName": "정문 입구",
    "peakDensity": 0.72,
    "densityStdDev": 0.31
  }
]
```

**Response Fields**:
- `cameraId`: 카메라 ID
- `cameraName`: 카메라 이름
- `peakDensity`: 기간 내 최고 밀집도
- `densityStdDev`: 밀집도 표준편차 (변동성)

**사용 페이지**: 대시보드, 패턴/비교 분석

---

### 2.2. 전체 카메라 분석 요약

모든 카메라의 현재 분석 상태를 요약하여 반환합니다.

**Endpoint**: `GET /cameras/analytics-summary`

**Response**: `200 OK`
```json
[
  {
    "cameraId": 1,
    "cameraName": "본관 로비 1번",
    "level": "CAUTION",
    "latestDensity": 0.52,
    "latestTimestamp": "2025-12-08T13:00:00",
    "trainingStatus": "READY"
  }
]
```

**Response Fields**:
- `cameraId`: 카메라 ID
- `cameraName`: 카메라 이름
- `level`: 혼잡도 수준 (`FREE`, `CAUTION`, `DANGER`, `NO_DATA`)
- `latestDensity`: 최신 밀집도
- `latestTimestamp`: 최신 분석 시각
- `trainingStatus`: 학습 상태 (`READY`, `PENDING`, `UNKNOWN`)

**사용 페이지**: 대시보드 (사이드바 카메라 목록 상태 갱신)

---

## 3. 카메라별 분석 API

### 3.1. 카메라 분석 정보

특정 카메라의 상세 분석 정보를 조회합니다.

**Endpoint**: `GET /cameras/{cameraId}/analytics`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Response**: `200 OK`
```json
{
  "cameraId": 1,
  "cameraName": "본관 로비 1번",
  "hasData": true,
  "level": "CAUTION",
  "latestDensity": 0.52,
  "personCount": 8,
  "latestTimestamp": "2025-12-08T13:00:00",
  "densityVelocityPerMin": 0.012,
  "densityAccelerationPerMin2": 0.0003,
  "etaSeconds": 180,
  "etaType": "ENTERING_DANGER",
  "etaMessage": "약 3분 후 '위험' 진입 예상",
  "timeInDangerSeconds": 0,
  "dangerStartTimestamp": null,
  "trainingStatus": "READY"
}
```

**Response Fields**:
- `hasData`: 분석 데이터 존재 여부
- `level`: 혼잡도 수준
- `latestDensity`: 현재 밀집도
- `personCount`: 탐지된 인원 수
- `densityVelocityPerMin`: 밀집도 변화율 (분당)
- `densityAccelerationPerMin2`: 밀집도 가속도 (분²당)
- `etaSeconds`: 위험 도달/해제 예상 시간 (초)
- `etaType`: ETA 유형 (`ENTERING_DANGER`, `EXITING_DANGER`, `NONE`)
- `etaMessage`: ETA 메시지
- `timeInDangerSeconds`: 위험 상태 지속 시간 (초)
- `dangerStartTimestamp`: 위험 상태 시작 시각

**Error Response**: `404 Not Found` (카메라가 존재하지 않거나 데이터 없음)

**사용 페이지**: 대시보드 (패널 데이터 갱신)

---

### 3.2. 최신 스냅샷 경로

카메라의 최신 분석 스냅샷 이미지 경로를 조회합니다.

**Endpoint**: `GET /cameras/{cameraId}/latest-snapshot-path`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Response**: `200 OK`
```json
{
  "path": "/media/snapshots/annotated/camera_1_20251208_130000.jpg"
}
```

**Response Fields**:
- `path`: 웹 접근 가능한 이미지 경로 (`/media/` 접두사 포함)

**Error Response**: `404 Not Found` (스냅샷 없음)

**사용 페이지**: 대시보드, 분석

---

### 3.3. 밀집도 히스토리

특정 기간 동안의 밀집도 시계열 데이터를 조회합니다.

**Endpoint**: `GET /cameras/{cameraId}/density-history`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Query Parameters**:
| 파라미터 | 타입 | 필수 | 형식 | 설명 |
|---------|------|------|------|------|
| start | LocalDateTime | Yes | ISO-8601 | 시작 시각 |
| end | LocalDateTime | Yes | ISO-8601 | 종료 시각 |

**Request Example**:
```
GET /cameras/1/density-history?start=2025-12-08T10:00:00&end=2025-12-08T12:00:00
```

**Response**: `200 OK`
```json
[
  {
    "timestamp": "2025-12-08T10:00:00",
    "density": 0.45,
    "personCount": 6,
    "annotatedImagePath": "snapshots/annotated/camera_1_20251208_100000.jpg"
  },
  {
    "timestamp": "2025-12-08T10:00:30",
    "density": 0.47,
    "personCount": 7,
    "annotatedImagePath": "snapshots/annotated/camera_1_20251208_100030.jpg"
  }
]
```

**Response Fields**:
- `timestamp`: 분석 시각
- `density`: 밀집도
- `personCount`: 탐지된 인원 수
- `annotatedImagePath`: 분석 이미지 경로 (상대 경로)

**사용 페이지**: 분석 (시계열 차트), 패턴/비교 분석

---

### 3.4. 혼잡도 히트맵

지난 7일간의 요일-시간대별 혼잡도 히트맵 데이터를 조회합니다.

**Endpoint**: `GET /cameras/{cameraId}/congestion-heatmap`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Response**: `200 OK`
```json
[
  {
    "dayOfWeek": "월",
    "dayOfWeekIndex": 1,
    "hourlyAverageDensities": [0.12, 0.15, 0.18, ..., 0.25],
    "hourlyMaxDensities": [0.20, 0.28, 0.35, ..., 0.42]
  },
  {
    "dayOfWeek": "화",
    "dayOfWeekIndex": 2,
    "hourlyAverageDensities": [0.10, 0.13, 0.16, ..., 0.22],
    "hourlyMaxDensities": [0.18, 0.25, 0.30, ..., 0.38]
  }
]
```

**Response Fields**:
- `dayOfWeek`: 요일 이름 (한글)
- `dayOfWeekIndex`: 요일 인덱스 (1=월요일, 7=일요일)
- `hourlyAverageDensities`: 시간별 평균 밀집도 배열 (24개, 0시~23시)
- `hourlyMaxDensities`: 시간별 최대 밀집도 배열 (24개, 0시~23시)

**사용 페이지**: 분석 (히트맵)

---

### 3.5. 통계적 이상 감지

현재 밀집도가 과거 패턴과 비교하여 이상한지 통계적으로 판단합니다.

**Endpoint**: `GET /cameras/{cameraId}/statistical-anomaly`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Response**: `200 OK`
```json
{
  "isAnalyzable": true,
  "message": "이례적으로 높음",
  "currentDensity": 0.85,
  "averageDensity": 0.45,
  "stdDeviation": 0.12,
  "zScore": 3.33
}
```

**Response Fields**:
- `isAnalyzable`: 분석 가능 여부 (과거 데이터 충분 여부)
- `message`: 상태 메시지 (`이례적으로 높음`, `평소보다 높음`, `정상 범위`, `평소보다 낮음`)
- `currentDensity`: 현재 밀집도
- `averageDensity`: 과거 평균 밀집도
- `stdDeviation`: 표준편차
- `zScore`: Z-점수 (표준편차 단위로 평균에서 얼마나 떨어져 있는지)

**분석 불가 응답**:
```json
{
  "isAnalyzable": false,
  "message": "과거 데이터 부족 (15개)",
  "currentDensity": 0.52,
  "averageDensity": null,
  "stdDeviation": null,
  "zScore": null
}
```

**사용 페이지**: 분석 (이상 패턴 감지 카드)

---

### 3.6. 비교 분석 요약

현재 밀집도를 어제/지난주 동시간과 비교합니다.

**Endpoint**: `GET /cameras/{cameraId}/comparison-summary`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Response**: `200 OK`
```json
{
  "yesterdayDensity": 0.42,
  "yesterdayChange": 0.10,
  "lastWeekDensity": 0.38,
  "lastWeekChange": 0.14
}
```

**Response Fields**:
- `yesterdayDensity`: 어제 동시간 평균 밀집도
- `yesterdayChange`: 어제 대비 변화량 (현재 - 어제)
- `lastWeekDensity`: 지난주 동시간 평균 밀집도
- `lastWeekChange`: 지난주 대비 변화량 (현재 - 지난주)

**참고**: 변화량은 단순 차이값이며, UI에서 백분율로 표시됩니다.

**사용 페이지**: 분석 (종합 분석 카드)

---

### 3.7. 카메라별 경보 목록

특정 카메라의 최근 경보를 조회합니다.

**Endpoint**: `GET /cameras/{cameraId}/alerts`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| cameraId | Long | 카메라 ID |

**Query Parameters**:
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| limit | int | No | 10 | 조회할 경보 수 |

**Response**: `200 OK`
```json
[
  {
    "analysisLogId": 12345,
    "code": "A3",
    "title": "위험 수위 돌파",
    "message": "밀집도 1.05가 임계 1.00을 초과했습니다.",
    "severity": "DANGER",
    "timestamp": "2025-12-08T13:00:00",
    "density": 1.05
  }
]
```

**Response Fields**:
- `analysisLogId`: 분석 로그 ID
- `code`: 경보 코드 (`A1`~`A6`)
- `title`: 경보 제목
- `message`: 경보 메시지
- `severity`: 심각도 (`INFO`, `WARNING`, `DANGER`)
- `timestamp`: 발생 시각
- `density`: 발생 시점의 밀집도

**사용 페이지**: 분석 (최근 알림 테이블)

---

## 4. 경보 API

### 4.1. 최근 경보 목록

전체 카메라의 최근 경보를 시간순으로 조회합니다.

**Endpoint**: `GET /alerts/recent`

**Query Parameters**:
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| limit | int | No | 10 | 조회할 경보 수 |

**Response**: `200 OK`
```json
[
  {
    "cameraId": 1,
    "cameraName": "본관 로비 1번",
    "cameraLocation": "본관 1층",
    "title": "위험 수위 돌파",
    "message": "밀집도 1.05가 임계 1.00을 초과했습니다.",
    "severity": "DANGER",
    "timestamp": "2025-12-08T13:00:00"
  }
]
```

**Response Fields**:
- `cameraId`: 카메라 ID
- `cameraName`: 카메라 이름
- `cameraLocation`: 카메라 위치
- `title`: 경보 제목
- `message`: 경보 메시지
- `severity`: 심각도
- `timestamp`: 발생 시각

**사용 페이지**: 대시보드 (최근 알림 목록)

---

### 4.2. 경보 이력 조회

고급 필터링 및 페이지네이션을 지원하는 경보 이력 조회 API입니다.

**Endpoint**: `GET /alerts/history`

**Query Parameters**:
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| page | int | No | 0 | 페이지 번호 (0부터 시작) |
| size | int | No | 20 | 페이지당 항목 수 |
| sort | String | No | timestamp,desc | 정렬 기준 (`timestamp`, `cameraName`, `density`, `level`) |
| level | String | No | - | 심각도 필터 (`DANGER`, `WARNING`, `INFO`) |
| cameraId | Long | No | - | 카메라 ID 필터 |
| search | String | No | - | 검색어 (카메라 이름, 경보 제목, 메시지) |
| start | String | No | 7일 전 | 시작 시각 (ISO-8601) |
| end | String | No | - | 종료 시각 (ISO-8601) |
| minDensity | Double | No | - | 최소 밀집도 |
| maxDensity | Double | No | - | 최대 밀집도 |

**Request Example**:
```
GET /alerts/history?page=0&size=20&sort=timestamp,desc&level=DANGER&minDensity=0.6
```

**Response**: `200 OK`
```json
{
  "content": [
    {
      "analysisLogId": 12345,
      "cameraId": 1,
      "cameraName": "본관 로비 1번",
      "cameraLocation": "본관 1층",
      "alertType": "A3",
      "alertTitle": "위험 수위 돌파",
      "alertMessage": "밀집도 1.05가 임계 1.00을 초과했습니다.",
      "severity": "DANGER",
      "timestamp": "2025-12-08T13:00:00",
      "density": 1.05
    }
  ],
  "totalElements": 150,
  "totalPages": 8,
  "currentPage": 0,
  "pageSize": 20
}
```

**Response Fields**:
- `content`: 경보 목록
- `totalElements`: 전체 경보 수
- `totalPages`: 전체 페이지 수
- `currentPage`: 현재 페이지 번호
- `pageSize`: 페이지당 항목 수

**사용 페이지**: 알림 이력

---

### 4.3. 경보 추세

최근 12시간 동안의 시간별 경보 발생 건수를 조회합니다.

**Endpoint**: `GET /alerts/trend`

**Response**: `200 OK`
```json
{
  "points": [
    { "hour": 1, "count": 3 },
    { "hour": 2, "count": 5 },
    { "hour": 3, "count": 2 },
    ...
    { "hour": 12, "count": 8 }
  ],
  "maxCount": 12
}
```

**Response Fields**:
- `points`: 시간별 경보 건수 배열
  - `hour`: 시간 (0~23)
  - `count`: 경보 발생 건수
- `maxCount`: 최대 건수 (차트 스케일링용)

**사용 페이지**: 대시보드 (시간별 알림 추세 차트)

---

## 5. 분석 로그 API

### 5.1. 분석 로그 상세

특정 분석 로그의 상세 정보와 전후 맥락을 조회합니다.

**Endpoint**: `GET /analysis-logs/{logId}/details`

**Path Parameters**:
| 파라미터 | 타입 | 설명 |
|---------|------|------|
| logId | Long | 분석 로그 ID |

**Response**: `200 OK`
```json
{
  "logId": 12345,
  "cameraId": 1,
  "cameraName": "본관 로비 1번",
  "timestamp": "2025-12-08T13:00:00",
  "density": 1.05,
  "personCount": 15,
  "densityVelocity": 0.012,
  "densityAcceleration": 0.0003,
  "rawImagePath": "snapshots/raw/camera_1_20251208_130000.jpg",
  "annotatedImagePath": "snapshots/annotated/camera_1_20251208_130000.jpg",
  "contextHistory": [
    {
      "timestamp": "2025-12-08T12:55:00",
      "density": 0.95,
      "personCount": 13,
      "annotatedImagePath": "snapshots/annotated/camera_1_20251208_125500.jpg"
    },
    ...
  ]
}
```

**Response Fields**:
- `logId`: 분석 로그 ID
- `cameraId`: 카메라 ID
- `cameraName`: 카메라 이름
- `timestamp`: 분석 시각
- `density`: 밀집도
- `personCount`: 탐지된 인원 수
- `densityVelocity`: 밀집도 변화율 (초당)
- `densityAcceleration`: 밀집도 가속도 (초²당)
- `rawImagePath`: 원본 이미지 경로
- `annotatedImagePath`: 분석 이미지 경로
- `contextHistory`: 전후 5분간의 밀집도 히스토리

**Error Response**: `404 Not Found` (로그 없음)

**사용 페이지**: 알림 이력 (상세 모달)

---

## 6. 대시보드 API

### 6.1. 대시보드 요약

대시보드 상단의 요약 통계를 조회합니다.

**Endpoint**: `GET /dashboard/summary`

**Response**: `200 OK`
```json
{
  "totalCameras": 10,
  "streamingCameras": 8,
  "camerasWithData": 7,
  "camerasInDanger": 2,
  "recentAnalysisEvents": 45
}
```

**Response Fields**:
- `totalCameras`: 전체 카메라 수
- `streamingCameras`: 스트리밍 카메라 수
- `camerasWithData`: 분석 데이터가 있는 카메라 수
- `camerasInDanger`: 위험 상태 카메라 수
- `recentAnalysisEvents`: 최근 30분간 경보 수

**사용 페이지**: 대시보드 (요약 통계 카드)

---

## 7. 에러 응답

모든 API는 다음과 같은 표준 에러 응답을 반환할 수 있습니다.

### 7.1. 404 Not Found
```json
{
  "timestamp": "2025-12-08T13:00:00",
  "status": 404,
  "error": "Not Found",
  "message": "Camera not found",
  "path": "/api/v1/cameras/999/analytics"
}
```

### 7.2. 400 Bad Request
```json
{
  "timestamp": "2025-12-08T13:00:00",
  "status": 400,
  "error": "Bad Request",
  "message": "Invalid date format",
  "path": "/api/v1/cameras/1/density-history"
}
```

### 7.3. 500 Internal Server Error
```json
{
  "timestamp": "2025-12-08T13:00:00",
  "status": 500,
  "error": "Internal Server Error",
  "message": "An unexpected error occurred",
  "path": "/api/v1/cameras/1/analytics"
}
```

---

## 8. 데이터 타입 참고

### 8.1. CongestionLevel (혼잡도 수준)
- `FREE`: 여유 (밀집도 < 0.463)
- `CAUTION`: 주의 (0.463 ≤ 밀집도 < 1.0)
- `DANGER`: 위험 (밀집도 ≥ 1.0)
- `NO_DATA`: 데이터 없음

### 8.2. StageSeverity (경보 심각도)
- `INFO`: 정보
- `WARNING`: 주의
- `DANGER`: 위험

### 8.3. EtaType (ETA 유형)
- `ENTERING_DANGER`: 위험 진입 예상
- `EXITING_DANGER`: 위험 해제 예상
- `NONE`: 특이사항 없음

### 8.4. TrainingStatus (학습 상태)
- `READY`: 학습 완료, 분석 가능
- `PENDING`: 학습 진행 중
- `UNKNOWN`: 알 수 없음

---

## 9. API 사용 예시

### 9.1. 대시보드 초기 로딩
```javascript
// 1. 전체 카메라 상태 조회
const camerasResponse = await fetch('/api/v1/cameras/analytics-summary');
const cameras = await camerasResponse.json();

// 2. 대시보드 요약 통계 조회
const summaryResponse = await fetch('/api/v1/dashboard/summary');
const summary = await summaryResponse.json();

// 3. 최근 경보 조회
const alertsResponse = await fetch('/api/v1/alerts/recent?limit=10');
const alerts = await alertsResponse.json();

// 4. 경보 추세 조회
const trendResponse = await fetch('/api/v1/alerts/trend');
const trend = await trendResponse.json();
```

### 9.2. 분석 페이지 차트 데이터 로딩
```javascript
const cameraId = 1;
const start = '2025-12-08T10:00:00';
const end = '2025-12-08T12:00:00';

const response = await fetch(
  `/api/v1/cameras/${cameraId}/density-history?start=${start}&end=${end}`
);
const historyData = await response.json();

// Chart.js로 시각화
renderChart(historyData);
```

### 9.3. 알림 이력 필터링
```javascript
const params = new URLSearchParams({
  page: 0,
  size: 20,
  sort: 'timestamp,desc',
  level: 'DANGER',
  minDensity: 0.6,
  search: '본관'
});

const response = await fetch(`/api/v1/alerts/history?${params}`);
const historyResponse = await response.json();

console.log(`총 ${historyResponse.totalElements}개의 경보 발견`);
```
