# Spring 웹 애플리케이션 - 대시보드 페이지 문서

## 1. 페이지 개요

대시보드 페이지는 E-N-C 캠퍼스 안전 시스템의 메인 페이지로, 전체 카메라의 실시간 상황을 한눈에 파악할 수 있도록 설계되었습니다. 이 페이지는 시스템의 중앙 통제실 역할을 하며, 관리자가 캠퍼스 전체의 안전 상황을 모니터링하고 즉각적으로 대응할 수 있도록 돕습니다.

**접근 경로**: `/` (루트 경로)  
**컨트롤러**: `WebController.dashboard()`  
**템플릿**: `dashboard.html`  
**JavaScript**: `dashboard.js`

## 2. 페이지 구성 요소

### 2.1. 헤더 영역

#### 2.1.1. 페이지 제목 및 타임스탬프
- 페이지 상단에 "실시간 상황 대시보드" 제목이 표시됩니다.
- 현재 시각이 "yyyy-MM-dd HH:mm:ss KST 기준" 형식으로 표시되며, 페이지 진입 시점의 서버 시각을 기준으로 합니다.
- "페이지 진입 후 자동 새로고침" 배지가 표시되어 사용자에게 자동 갱신 기능을 알립니다.

#### 2.1.2. 원근 맵 학습 카운트다운
- Django 서버에서 다음 원근 맵 학습이 예정되어 있는 경우, 학습까지 남은 시간을 실시간으로 카운트다운합니다.
- `TrainingScheduleTracker`가 제공하는 `nextTrainingTime`을 기반으로 JavaScript에서 1초마다 갱신됩니다.
- "다음 원근 맵 학습까지 X분 Y초" 형식으로 표시되며, 시간이 경과하면 "다음 학습 대기 중..."으로 변경됩니다.

#### 2.1.3. 요약 통계 스트립
페이지 상단에 3개의 요약 카드가 가로로 배치되어 전체 시스템 상태를 한눈에 보여줍니다:

**전체 카메라**
- 시스템에 등록된 전체 카메라 대수를 표시합니다.
- 하위 정보로 YouTube Live로 연결된 카메라 수를 표시합니다.
- 데이터는 `DashboardSummary.totalCameras`와 `streamingCameras`에서 가져옵니다.

**위험 경보**
- 현재 밀집도가 위험 임계값(1.00) 이상인 카메라 수를 빨간색으로 강조 표시합니다.
- 데이터는 `DashboardSummary.camerasInDanger`에서 가져옵니다.
- 이 값은 `AnalysisInsightsService`가 모든 카메라의 최신 밀집도를 분석하여 `CongestionLevel.DANGER` 상태인 카메라를 카운트한 결과입니다.

**최근 경보**
- 최근 30분간 발생한 경보 건수를 표시합니다.
- 데이터는 `AlertService.countRecentAlertsSince()`를 통해 계산됩니다.
- 이 값은 최근 30분 이내에 생성된 모든 `StageAlertView` 객체의 총 개수입니다.

#### 2.1.4. 카메라 선택 모드 상태
- 현재 선택된 카메라의 이름과 "실시간" 상태 배지를 표시합니다.
- 카메라가 선택되지 않은 경우 "재생 가능한 카메라가 없습니다"라는 메시지를 표시합니다.
- "자동 순환 30초" 안내 문구가 표시되어 사용자에게 카메라 자동 전환 기능을 알립니다.

### 2.2. 메인 콘텐츠 영역

#### 2.2.1. 카메라 스테이지

**실시간 스트림 뷰**
- 선택된 카메라의 YouTube Live 스트림을 iframe으로 임베드하여 표시합니다.
- `DashboardCameraView.embedUrl()`이 제공하는 YouTube 임베드 URL을 사용합니다.
- iframe은 autoplay, encrypted-media, picture-in-picture 권한을 가지며 lazy loading이 적용됩니다.
- 재생 가능한 카메라가 없는 경우 "카메라 등록" 버튼이 포함된 안내 메시지를 표시합니다.

**분석 스냅샷 뷰**
- Django 서버가 30초마다 캡처하여 AI 분석을 수행한 최신 스냅샷 이미지를 표시합니다.
- 이미지 경로는 `AnalysisLog.annotatedImagePath`에서 가져오며, `/media/` 경로로 변환되어 웹에서 접근 가능합니다.
- JavaScript는 5초마다 `/api/v1/cameras/{cameraId}/latest-snapshot-path` API를 호출하여 최신 이미지 경로를 확인하고, 변경되었으면 이미지를 갱신합니다.
- 스냅샷이 없는 경우 "분석 스냅샷이 없습니다. AI 분석이 완료되면 자동으로 표시됩니다."라는 플레이스홀더를 표시합니다.

**최신 경보 배너**
- 선택된 카메라에서 최근 10분 이내에 발생한 가장 최신 경보를 배너 형태로 표시합니다.
- 경보의 심각도(danger, warning, info)에 따라 배너 색상이 변경됩니다.
- 경보 제목, 메시지, 발생 시각이 표시됩니다.
- 10분이 경과한 경보는 자동으로 숨겨집니다.
- 데이터는 `CameraAnalyticsSummary.latestPersistedAlert`에서 가져옵니다.

#### 2.2.2. 주간 통계 패널

**주간 최고 혼잡 장소 Top 5**
- 지난 7일간 가장 높은 밀집도를 기록한 카메라 5개를 순위별로 표시합니다.
- 각 항목은 순위 번호, 카메라 이름, 최고 밀집도 값(백분율)을 포함합니다.
- 데이터는 `/api/v1/cameras/statistics?days=7` API를 호출하여 가져옵니다.
- `CameraStatisticsPayload.peakDensity`를 기준으로 내림차순 정렬됩니다.

**가장 예측이 어려운 장소 Top 5**
- 혼잡도 변화가 가장 심했던 카메라 5개를 변동성(표준편차) 기준으로 표시합니다.
- 각 항목은 순위 번호, 카메라 이름, 표준편차 값을 포함합니다.
- 데이터는 동일한 API에서 가져오며, `CameraStatisticsPayload.densityStdDev`를 기준으로 내림차순 정렬됩니다.
- 변동성이 높다는 것은 밀집도가 급격하게 변화하여 예측이 어렵다는 의미입니다.

#### 2.2.3. 최근 알림 패널
- 전체 카메라에서 발생한 최근 경보 10건을 시간 역순으로 표시합니다.
- 각 알림 항목은 다음 정보를 포함합니다:
  - 발생 시각 (HH:mm:ss 형식)
  - 카메라 이름 및 위치
  - 경보 제목 및 메시지
- 경보의 심각도에 따라 항목의 배경색이 다르게 표시됩니다:
  - `alerts-item--high`: 위험(danger) 경보 - 빨간색 계열
  - `alerts-item--medium`: 주의(warning) 경보 - 주황색 계열
  - `alerts-item--low`: 정보(info) 경보 - 파란색 계열
- 데이터는 `AlertService.getRecentAlerts(10)`에서 가져오며, 5초마다 자동으로 갱신됩니다.

### 2.3. 사이드바 영역

#### 2.3.1. 전체 카메라 목록
- 시스템에 등록된 모든 카메라를 목록으로 표시합니다.
- 각 카메라 항목은 다음 정보를 포함합니다:
  - 카메라 이름
  - 설치 위치 (address 또는 locationZone)
  - 현재 혼잡도 상태 칩 (여유/주의/위험/학습중)
- 현재 선택된 카메라는 `camera-list__item--active` 클래스로 강조 표시됩니다.
- 카메라를 클릭하면 해당 카메라를 선택하여 페이지를 새로고침합니다 (`/?cameraId={id}`).

**상태 칩 표시 로직**
- 카메라의 `trainingStatus`가 `PENDING`인 경우 "학습중" 칩을 파란색으로 표시합니다.
- 그 외의 경우 혼잡도 수준에 따라 칩을 표시합니다:
  - `NO_DATA`: 회색 "데이터 없음"
  - `FREE`: 초록색 "여유"
  - `CAUTION`: 주황색 "주의"
  - `DANGER`: 빨간색 "위험"

**실시간 상태 갱신**
- JavaScript는 5초마다 `/api/v1/cameras/analytics-summary` API를 호출하여 모든 카메라의 최신 상태를 가져옵니다.
- 상태가 변경된 카메라는 시각적 피드백을 제공합니다:
  - 혼잡도가 악화된 경우 (예: FREE → CAUTION) 빨간색 플래시 애니메이션
  - 혼잡도가 개선된 경우 (예: DANGER → CAUTION) 초록색 플래시 애니메이션
- 상태 변화는 `CONGESTION_LEVEL_ORDER` 객체로 정의된 순서를 기준으로 판단됩니다.

#### 2.3.2. 종합 분석 패널
선택된 카메라의 상세 분석 정보를 표시하는 패널입니다.

**학습 상태에 따른 표시**
- `trainingStatus`가 `PENDING`인 경우:
  - "최근 학습 진행 중" 칩을 표시합니다.
  - 지표 영역에 "학습이 곧 완료됩니다. 여기에 지표가 표시됩니다." 플레이스홀더를 표시합니다.
- `READY` 상태인 경우 실제 분석 지표를 표시합니다.

**상태 칩**
- 현재 혼잡도 수준을 나타내는 칩을 표시합니다 (여유/주의/위험).
- 위험 상태인 경우 추가로 "지속 시간" 칩을 표시합니다.
  - 위험 상태가 시작된 시각부터 현재까지의 경과 시간을 "HH:MM:SS" 형식으로 표시합니다.
  - JavaScript 타이머가 1초마다 시간을 증가시켜 실시간으로 갱신합니다.

**혼잡도 지표**
- 주요 지표로 현재 밀집도 값을 큰 글씨로 표시합니다.
- 밀집도는 소수점 둘째 자리까지 표시됩니다 (예: 0.45).
- 하위 정보로 최신 분석 시각을 "HH:mm:ss" 형식으로 표시합니다.
- 이 시각은 JavaScript의 `startLiveClock()` 함수에 의해 1초마다 현재 시각으로 갱신됩니다.

**혼잡도 추세**
- 밀집도의 변화 속도(velocity)를 텍스트로 표현합니다.
- `densityVelocityPerMin` 값을 기준으로 다음과 같이 분류됩니다:
  - `> 0.05`: "급격한 증가" (빨간색)
  - `> 0.005`: "완만한 증가" (빨간색)
  - `< -0.05`: "급격한 감소" (초록색)
  - `< -0.005`: "완만한 감소" (초록색)
  - 그 외: "거의 정체" (회색)
- 데이터가 없는 경우 "--"를 표시합니다.

#### 2.3.3. 시간별 알림 추세 차트
- 최근 12시간 동안의 시간별 경보 발생 건수를 막대 그래프로 시각화합니다.
- 각 막대는 해당 시간대의 경보 건수를 나타내며, 높이는 최대값 대비 백분율로 계산됩니다.
- 막대 위에 마우스를 올리면 "X시 Y건" 형식의 툴팁이 표시됩니다.
- 데이터는 `AlertService.getHourlyTrendForLast24Hours()`에서 가져옵니다.
- 60초마다 자동으로 갱신됩니다.

**데이터 소스 우선순위**
1. 먼저 `SafetyAlertRepository`에서 실제 저장된 경보 데이터를 조회합니다.
2. 저장된 경보가 없는 경우, `AnalysisInsightsService`를 통해 분석 로그에서 동적으로 경보를 생성합니다.
3. 이는 시스템 초기 단계에서도 의미 있는 추세 정보를 제공하기 위함입니다.

## 3. 데이터 흐름 및 갱신 메커니즘

### 3.1. 초기 페이지 로드
1. 사용자가 `/` 또는 `/?cameraId={id}` 경로로 접근합니다.
2. `WebController.dashboard()` 메서드가 실행됩니다.
3. 컨트롤러는 다음 순서로 데이터를 수집합니다:
   - `CameraService.fetchAll()`로 모든 카메라 정보를 가져옵니다.
   - YouTube Live 스트림이 있는 카메라만 필터링하여 `streamingCameras` 리스트를 생성합니다.
   - 요청 파라미터의 `cameraId` 또는 첫 번째 스트리밍 카메라를 `primaryCamera`로 선택합니다.
   - `AnalysisInsightsService.summarizeCameras()`를 호출하여 모든 카메라의 분석 요약을 생성합니다.
   - `AnalysisInsightsService.buildDashboardSummary()`로 전체 시스템 요약 통계를 생성합니다.
   - `AlertService.getRecentAlerts(10)`로 최근 경보 10건을 가져옵니다.
   - `AlertService.getHourlyTrendForLast24Hours()`로 시간별 경보 추세를 가져옵니다.
4. 모든 데이터를 Model에 담아 Thymeleaf 템플릿에 전달합니다.
5. 템플릿이 렌더링되어 HTML을 생성하고 브라우저로 전송됩니다.
6. 브라우저에서 JavaScript가 로드되고 `DOMContentLoaded` 이벤트가 발생합니다.

### 3.2. JavaScript 초기화
`dashboard.js`의 `DOMContentLoaded` 이벤트 핸들러에서 다음 작업을 수행합니다:

1. **타이머 및 시계 초기화**
   - `initializeTrainingCountdown()`: 원근 맵 학습 카운트다운 시작
   - `startLiveClock('panel-density-time')`: 밀집도 시각 실시간 시계 시작
   - `updateDangerDurationTimer()`: 위험 지속 시간 타이머 시작

2. **초기 데이터 렌더링**
   - `window.initialPanelData`가 있으면 즉시 패널 렌더링 (SSR 데이터 활용)
   - 없으면 `fetchAndRenderPanel(cameraId)` 호출하여 API로 데이터 가져오기
   - `fetchAndRenderAlertTrend()`: 시간별 경보 추세 차트 렌더링
   - `fetchAndRenderAlerts()`: 최근 경보 목록 렌더링
   - `fetchAndRenderCameraListStatus()`: 카메라 목록 상태 갱신
   - `fetchAndRenderSummary()`: 요약 통계 갱신
   - `fetchAndRenderSummaryPanels()`: 주간 통계 패널 렌더링

3. **폴링 인터벌 설정**
   - 스냅샷 이미지: 5초마다 갱신
   - 패널 데이터: 5초마다 갱신
   - 경보 목록: 5초마다 갱신
   - 카메라 상태: 5초마다 갱신
   - 요약 통계: 15초마다 갱신
   - 경보 추세: 60초마다 갱신

### 3.3. 실시간 데이터 갱신 상세

#### 3.3.1. 스냅샷 이미지 갱신
- 함수: `updateSnapshotImage(cameraId)`
- API: `GET /api/v1/cameras/{cameraId}/latest-snapshot-path`
- 동작:
  1. API를 호출하여 최신 스냅샷 경로를 가져옵니다.
  2. 현재 표시 중인 이미지와 경로가 다르면 새 이미지로 교체합니다.
  3. 이미지 URL에 타임스탬프 쿼리 파라미터(`?t={timestamp}`)를 추가하여 브라우저 캐시를 우회합니다.
  4. 스냅샷이 없었다가 새로 생성된 경우, 플레이스홀더를 제거하고 이미지 요소를 동적으로 생성합니다.

#### 3.3.2. 패널 데이터 갱신
- 함수: `fetchAndRenderPanel(cameraId)`
- API: `GET /api/v1/cameras/{cameraId}/analytics`
- 동작:
  1. API를 호출하여 `AnalysisCameraPayload` 데이터를 가져옵니다.
  2. `renderPanel(data)` 함수를 호출하여 UI를 갱신합니다.
  3. 밀집도 값, 혼잡도 추세, 상태 칩, 위험 지속 시간 등을 업데이트합니다.
  4. 최신 경보가 있으면 경보 배너를 표시합니다.

#### 3.3.3. 경보 목록 갱신
- 함수: `fetchAndRenderAlerts()`
- API: `GET /api/v1/alerts/recent?limit=10`
- 동작:
  1. API를 호출하여 최근 경보 10건을 가져옵니다.
  2. 기존 목록을 완전히 지우고 새 데이터로 재구성합니다.
  3. 각 경보 항목을 심각도에 따라 스타일링하여 DOM에 추가합니다.
  4. 경보가 없으면 "아직 생성된 경보가 없습니다" 메시지를 표시합니다.

#### 3.3.4. 카메라 상태 갱신
- 함수: `fetchAndRenderCameraListStatus()`
- API: `GET /api/v1/cameras/analytics-summary`
- 동작:
  1. API를 호출하여 모든 카메라의 최신 분석 요약을 가져옵니다.
  2. 각 카메라 항목의 `data-level` 속성과 새 데이터를 비교합니다.
  3. 상태가 변경된 경우:
     - 상태 칩의 텍스트와 색상을 업데이트합니다.
     - 혼잡도가 악화되었으면 빨간색 플래시 애니메이션을 재생합니다.
     - 혼잡도가 개선되었으면 초록색 플래시 애니메이션을 재생합니다.
  4. `trainingStatus`가 `PENDING`인 카메라는 "학습 중" 칩을 표시하고 애니메이션을 건너뜁니다.

## 4. 서비스 로직 상세

### 4.1. AnalysisInsightsService

#### 4.1.1. summarizeCameras()
- 목적: 여러 카메라의 분석 요약을 한 번에 생성합니다.
- 입력: `List<Camera>` - 요약할 카메라 목록
- 출력: `Map<Long, CameraAnalyticsSummary>` - 카메라 ID를 키로 하는 요약 맵
- 동작:
  1. 각 카메라에 대해 `summarizeCamera()`를 호출합니다.
  2. 데이터가 없는 카메라는 `buildEmptySummary()`로 빈 요약을 생성합니다.
  3. 모든 요약을 카메라 ID를 키로 하는 맵으로 변환하여 반환합니다.
  4. 이 맵은 O(1) 조회 성능을 제공하여 효율적인 데이터 접근을 가능하게 합니다.

#### 4.1.2. summarizeCamera()
- 목적: 단일 카메라의 상세 분석 요약을 생성합니다.
- 입력: `Camera` - 분석할 카메라
- 출력: `Optional<CameraAnalyticsSummary>` - 분석 요약 (데이터가 없으면 빈 요약)
- 동작:
  1. `loadRecentLogs(camera)`를 호출하여 최근 60개의 `READY` 상태 분석 로그를 가져옵니다.
  2. 로그가 없으면 `buildEmptySummary()`를 반환합니다.
  3. 로그가 있으면 `buildSummary(camera, logs)`를 호출하여 상세 요약을 생성합니다.

#### 4.1.3. buildSummary()
- 목적: 분석 로그 데이터를 기반으로 `CameraAnalyticsSummary` 객체를 구성합니다.
- 주요 계산 항목:
  1. **최신 밀집도 및 인원수**: 가장 최근 로그의 `density`와 `personCount`
  2. **속도 및 가속도**: Django에서 계산한 초당 값을 분당 값으로 변환
     - 속도: `velocityPerSecond * 60`
     - 가속도: `accelerationPerSecond² * 3600`
  3. **ETA (도달 예상 시간)**: `computeEta()` 메서드로 계산
  4. **위험 지속 시간**: `computeDangerWindow()` 메서드로 계산
  5. **혼잡도 수준**: `resolveLevel()` 메서드로 결정
  6. **스테이지 경보**: `buildStageAlertsTimeline()` 메서드로 생성
  7. **최신 저장된 경보**: `SafetyAlertRepository`에서 조회

#### 4.1.4. computeEta()
- 목적: 현재 밀집도, 속도, 가속도를 기반으로 위험 임계값 도달 예상 시간을 계산합니다.
- 입력:
  - `currentDensity`: 현재 밀집도
  - `velocity`: 밀집도 변화율 (분당)
  - `acceleration`: 밀집도 변화 가속도 (분²당)
- 출력: `EtaResult` - 예상 시간(초), ETA 유형, 메시지
- 계산 로직:
  1. **위험 진입 예측** (현재 밀집도 < 1.0 && 속도 > 0):
     - 2차 방정식 `d + v*t + 0.5*a*t² = 1.0`을 풀어 시간 t를 계산합니다.
     - 가속도가 거의 0이면 선형 방정식 `t = (1.0 - d) / v`를 사용합니다.
  2. **위험 해제 예측** (현재 밀집도 >= 1.0 && 속도 < 0):
     - 동일한 방정식을 사용하되, 속도가 음수이므로 밀집도가 감소하는 시점을 계산합니다.
  3. **예측 불가**:
     - 판별식이 음수인 경우 (현재 추세로는 임계값에 도달하지 않음)
     - 속도가 0에 가까운 경우 (정체 상태)

#### 4.1.5. computeDangerWindow()
- 목적: 현재 위험 상태가 얼마나 지속되었는지 계산합니다.
- 입력: `List<AnalysisLog>` - 시간 역순으로 정렬된 분석 로그
- 출력: `DangerWindow` - 지속 시간(초), 시작 시각
- 동작:
  1. 최신 로그의 밀집도가 1.0 미만이면 위험 상태가 아니므로 빈 결과를 반환합니다.
  2. 로그를 역순으로 순회하며 밀집도가 1.0 이상인 연속된 구간을 찾습니다.
  3. 밀집도가 1.0 미만으로 떨어지는 시점을 위험 시작 시각으로 기록합니다.
  4. 시작 시각부터 현재까지의 Duration을 계산하여 반환합니다.

#### 4.1.6. buildDashboardSummary()
- 목적: 대시보드 상단의 요약 통계를 생성합니다.
- 입력:
  - `allCameras`: 전체 카메라 목록
  - `streamingCameras`: YouTube Live 스트리밍 카메라 목록
  - `summaries`: 카메라별 분석 요약 맵
- 출력: `DashboardSummary` - 요약 통계 객체
- 계산 항목:
  1. **전체 카메라 수**: `allCameras.size()`
  2. **스트리밍 카메라 수**: `streamingCameras.size()`
  3. **데이터가 있는 카메라 수**: `summaries`에서 `hasData() == true`인 카메라 카운트
  4. **위험 상태 카메라 수**: `summaries`에서 `level == DANGER`인 카메라 카운트
  5. **최근 분석 이벤트 수**: 최근 30분간 생성된 `READY` 상태 분석 로그 수

### 4.2. AlertService

#### 4.2.1. getRecentAlerts()
- 목적: 전체 카메라에서 발생한 최근 경보를 시간순으로 가져옵니다.
- 입력: `limit` - 가져올 최대 경보 수
- 출력: `List<RecentAlertView>` - 최근 경보 목록
- 동작:
  1. 모든 카메라를 순회하며 각 카메라의 최근 경보를 가져옵니다.
  2. 각 카메라에서 `limit * 2` (최대 50개)의 경보를 가져와 충분한 데이터를 확보합니다.
  3. 모든 경보를 하나의 리스트로 병합합니다.
  4. 타임스탬프 기준 내림차순으로 정렬합니다.
  5. 상위 `limit`개만 선택하여 반환합니다.

#### 4.2.2. getHourlyTrendForLast24Hours()
- 목적: 최근 12시간 동안의 시간별 경보 발생 건수를 계산합니다.
- 출력: `AlertTrend` - 시간별 경보 건수와 최대값
- 동작:
  1. 먼저 `SafetyAlertRepository`에서 최근 12시간의 경보 타임스탬프를 조회합니다.
  2. 타임스탬프가 있으면 시간별로 그룹화하여 건수를 계산합니다.
  3. 타임스탬프가 없으면 `buildTrendFromStageAlerts()`를 호출하여 분석 로그에서 동적으로 경보를 생성합니다.
  4. 현재 시각 기준 과거 12시간의 각 시간대별 건수를 `AlertsPerHour` 객체로 생성합니다.
  5. 최대 건수를 계산하여 차트의 높이 비율 계산에 사용합니다.

#### 4.2.3. buildTrendFromStageAlerts()
- 목적: 저장된 경보가 없을 때 분석 로그에서 동적으로 경보를 생성하여 추세를 계산합니다.
- 동작:
  1. 모든 카메라를 순회합니다.
  2. 각 카메라의 최근 분석 로그를 가져옵니다.
  3. `AnalysisInsightsService.findStageAlertsSince()`를 호출하여 로그에서 경보를 생성합니다.
  4. "A0" 코드의 경보는 제외합니다 (정상 상태 알림).
  5. 각 경보의 발생 시각을 시간별로 그룹화하여 건수를 계산합니다.
  6. `buildTrendFromHourlyCounts()`를 호출하여 최종 추세 객체를 생성합니다.

## 5. 설계 의도 및 특징

### 5.1. 서버 사이드 렌더링 (SSR) 활용
- 초기 페이지 로드 시 서버에서 대부분의 데이터를 미리 렌더링하여 전송합니다.
- 이는 초기 로딩 속도를 개선하고 검색 엔진 최적화(SEO)에 유리합니다.
- `window.initialPanelData`를 통해 JavaScript에 초기 데이터를 주입하여 불필요한 API 호출을 방지합니다.

### 5.2. 폴링 기반 실시간 갱신
- WebSocket 대신 HTTP 폴링 방식을 사용하여 실시간 데이터를 갱신합니다.
- 각 데이터 유형마다 적절한 갱신 주기를 설정하여 서버 부하와 실시간성의 균형을 맞춥니다.
- 중요도가 높은 데이터(스냅샷, 패널, 경보)는 5초마다, 덜 중요한 데이터(추세)는 60초마다 갱신합니다.

### 5.3. 사용자 피드백 강화
- 카메라 상태 변화 시 플래시 애니메이션으로 시각적 피드백을 제공합니다.
- 위험 지속 시간을 실시간 타이머로 표시하여 긴급성을 강조합니다.
- 경보 배너를 통해 최신 경보를 눈에 띄게 표시합니다.

### 5.4. 효율적인 데이터 구조
- `Map<Long, CameraAnalyticsSummary>` 구조를 사용하여 O(1) 시간 복잡도로 카메라 데이터에 접근합니다.
- 서버에서 한 번에 모든 카메라의 데이터를 계산하여 반복적인 데이터베이스 조회를 최소화합니다.

### 5.5. 유연한 경보 시스템
- 저장된 경보가 없어도 분석 로그에서 동적으로 경보를 생성하여 표시합니다.
- 이는 시스템 초기 단계나 경보 저장 기능이 비활성화된 경우에도 의미 있는 정보를 제공합니다.

### 5.6. 카메라 자동 순환
- 사용자가 카메라를 선택하지 않으면 첫 번째 스트리밍 카메라를 자동으로 선택합니다.
- 이는 관리자가 별도의 조작 없이도 즉시 상황을 파악할 수 있도록 합니다.

## 6. 주요 API 엔드포인트

대시보드 페이지에서 사용하는 주요 API 엔드포인트는 다음과 같습니다:

| 엔드포인트 | 메서드 | 용도 | 갱신 주기 |
|-----------|--------|------|----------|
| `/api/v1/cameras/{id}/latest-snapshot-path` | GET | 최신 스냅샷 이미지 경로 조회 | 5초 |
| `/api/v1/cameras/{id}/analytics` | GET | 카메라 분석 요약 조회 | 5초 |
| `/api/v1/cameras/analytics-summary` | GET | 전체 카메라 상태 요약 조회 | 5초 |
| `/api/v1/cameras/statistics?days=7` | GET | 주간 통계 조회 | 초기 1회 |
| `/api/v1/alerts/recent?limit=10` | GET | 최근 경보 목록 조회 | 5초 |
| `/api/v1/alerts/trend` | GET | 시간별 경보 추세 조회 | 60초 |
| `/api/v1/dashboard/summary` | GET | 대시보드 요약 통계 조회 | 15초 |

## 7. 데이터 모델

### 7.1. DashboardSummary
```java
record DashboardSummary(
    long totalCameras,           // 전체 카메라 수
    long streamingCameras,       // 스트리밍 카메라 수
    long camerasWithData,        // 데이터가 있는 카메라 수
    long camerasInDanger,        // 위험 상태 카메라 수
    long recentAnalysisEvents    // 최근 30분 경보 수
)
```

### 7.2. CameraAnalyticsSummary
```java
record CameraAnalyticsSummary(
    Long cameraId,
    String cameraName,
    boolean hasData,
    CongestionLevel level,
    Double latestDensity,
    Integer personCount,
    LocalDateTime latestTimestamp,
    Double densityVelocityPerMin,
    Double densityAccelerationPerMin2,
    Long etaSeconds,
    EtaType etaType,
    String etaMessage,
    Long timeInDangerSeconds,
    LocalDateTime dangerStartTimestamp,
    List<DensitySample> recentDensitySnapshots,
    List<StageAlertView> stageAlerts,
    StageAlertView latestPersistedAlert,
    TrainingStatus trainingStatus
)
```

### 7.3. RecentAlertView
```java
record RecentAlertView(
    Long cameraId,
    String cameraName,
    String cameraLocation,
    String title,
    String message,
    StageSeverity severity,
    LocalDateTime timestamp
)
```

### 7.4. AlertTrend
```java
record AlertTrend(
    List<AlertsPerHour> points,  // 시간별 경보 건수
    long maxCount                // 최대 건수 (차트 스케일링용)
)
```
