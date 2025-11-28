# Spring 웹 애플리케이션 - 나머지 페이지 문서

## 1. 지도 기반 모니터링 페이지

### 1.1. 페이지 개요
지도 페이지는 등록된 모든 카메라의 위치를 Naver Map 위에 마커로 표시하여 지리적 분포와 상태를 한눈에 파악할 수 있도록 합니다.

**접근 경로**: `/map`  
**컨트롤러**: `WebController.mapPage()`  
**템플릿**: `map.html`  
**JavaScript**: `map.js`

### 1.2. 주요 기능

#### 1.2.1. Naver Map 통합
- Naver Maps API를 사용하여 지도 렌더링
- API 키는 `NAVER_MAP_CLIENT_ID` 환경 변수에서 로드
- 기본 중심 좌표: 서울 (37.5665, 126.9780)
- `initCampusMap` 콜백 함수로 초기화

#### 1.2.2. 카메라 마커
- 각 카메라의 위도/경도에 마커 표시
- 마커 색상은 혼잡도 수준에 따라 변경:
  - 위험: 빨간색
  - 주의: 주황색
  - 여유: 초록색
  - 데이터 없음: 회색
- 마커 클릭 시 정보 패널 표시

#### 1.2.3. 필터 기능
- 상태별 필터 버튼: 전체, 위험, 주의, 여유, 데이터 없음
- 필터 선택 시 해당 상태의 카메라만 마커 및 목록에 표시
- 필터는 토글 방식으로 작동

#### 1.2.4. 카메라 목록 사이드바
- 모든 카메라를 목록으로 표시
- 각 항목은 카메라 이름, 위치, 상태 칩 포함
- 항목 클릭 시 지도가 해당 카메라로 이동하고 정보 패널 표시
- 필터 적용 시 목록도 동기화

#### 1.2.5. 정보 패널
- 선택된 카메라의 상세 정보 표시:
  - 카메라 이름
  - 위치 정보 (locationZone)
  - 주소
  - 현재 혼잡도 상태 칩
  - 현재 밀집도 값
  - 마지막 분석 시각
  - 위도/경도 좌표
- "카메라 분석 →" 링크로 분석 페이지로 이동

#### 1.2.6. 내 위치 버튼
- 사용자의 현재 위치로 지도 이동
- Geolocation API 사용
- 권한 거부 시 오류 메시지 표시

### 1.3. 데이터 흐름
1. 컨트롤러에서 모든 카메라 조회
2. 각 카메라의 분석 요약 조회 (`AnalysisInsightsService.summarizeCameras()`)
3. `MapCameraView` 객체로 변환하여 템플릿에 전달
4. JavaScript에서 `window.safetyCameras` 배열로 카메라 데이터 접근
5. Naver Map 초기화 후 각 카메라에 대해 마커 생성

### 1.4. MapCameraView 데이터 모델
```java
record MapCameraView(
    Long id,
    String name,
    String locationZone,
    String address,
    Double latitude,
    Double longitude,
    CongestionLevel level,
    Double latestDensity,
    LocalDateTime latestTimestamp
)
```

---

## 2. 알림 이력 페이지

### 2.1. 페이지 개요
알림 이력 페이지는 과거에 발생한 모든 경보를 조회하고 필터링할 수 있는 고급 검색 인터페이스를 제공합니다.

**접근 경로**: `/alerts`  
**컨트롤러**: `WebController.alertsPage()`  
**템플릿**: `alerts.html`  
**JavaScript**: `alerts.js`

### 2.2. 주요 기능

#### 2.2.1. 필터 바
**기간 선택**
- Flatpickr 라이브러리를 사용한 날짜 범위 선택기
- 한국어 로케일 지원
- 기본값: 최근 7일

**등급 필터**
- 드롭다운: 전체, 위험(DANGER), 주의(WARNING), 정보(INFO)

**카메라 필터**
- 드롭다운: 모든 카메라 또는 특정 카메라 선택
- 카메라 목록은 서버에서 전달된 `cameraListData`로 동적 생성

**밀집도 필터**
- 칩 그룹으로 프리셋 선택:
  - 전체
  - 주의 (0.3 이상)
  - 위험 (0.6 이상)
  - 직접 입력
- 직접 입력 선택 시 최소값/최대값 입력 필드 표시

**검색 필터**
- 텍스트 검색: 카메라 이름, 알림 유형, 내용 등
- 대소문자 구분 없음

#### 2.2.2. 알림 테이블
**컬럼**
- 발생 시각 (정렬 가능)
- 카메라 이름 (정렬 가능)
- 밀집도 (정렬 가능)
- 알림 유형
- 상세 내용
- 등급 (정렬 가능)

**정렬 기능**
- 컬럼 헤더 클릭 시 오름차순/내림차순 토글
- 기본 정렬: 발생 시각 내림차순

**행 클릭**
- 행 클릭 시 상세 모달 표시

#### 2.2.3. 페이지네이션
- 한 페이지당 20개 항목 표시
- 페이지 번호 버튼으로 이동
- 이전/다음 버튼 제공

#### 2.2.4. 알림 상세 모달
**원본 스냅샷 및 분석 스냅샷**
- 좌우로 나란히 표시
- 원본: AI 분석 전 캡처 이미지
- 분석: 바운딩 박스와 밀집도 정보가 표시된 이미지

**메트릭 바**
- 밀집도, 탐지 인원, 변화율(분당), 가속도(분²당) 표시

**밀집도 변화 추이 차트**
- 해당 경보 발생 시각 ±5분 구간의 밀집도 변화를 Chart.js로 시각화
- 경보 발생 시점을 수직선으로 강조
- API: `GET /api/v1/analysis-logs/{logId}/details`

### 2.3. 데이터 흐름
1. 페이지 로드 시 기본 필터(최근 7일, 전체)로 API 호출
2. API: `GET /api/v1/alerts/history?start={start}&end={end}&severity={severity}&cameraId={cameraId}&minDensity={min}&maxDensity={max}&search={search}&page={page}&size={size}&sort={sort}`
3. 응답: `AlertHistoryResponse` (페이지네이션 정보 포함)
4. 테이블 렌더링
5. 필터 변경 시 API 재호출 및 테이블 갱신

### 2.4. AlertHistoryPayload 데이터 모델
```java
record AlertHistoryPayload(
    Long analysisLogId,
    Long cameraId,
    String cameraName,
    String cameraLocation,
    String alertType,
    String alertTitle,
    String alertMessage,
    StageSeverity severity,
    LocalDateTime timestamp,
    Double density
)
```

---

## 3. 패턴/비교 분석 페이지

### 3.1. 페이지 개요
패턴/비교 분석 페이지는 여러 카메라의 밀집도 데이터를 동일한 차트에 겹쳐서 표시하여 패턴을 비교할 수 있도록 합니다.

**접근 경로**: `/comparison`  
**컨트롤러**: `WebController.comparisonPage()`  
**템플릿**: `comparison.html`  
**JavaScript**: `comparison.js`

### 3.2. 주요 기능

#### 3.2.1. 카메라 선택 패널
**체크리스트**
- 모든 카메라를 체크박스 목록으로 표시
- 다중 선택 가능
- "전체 선택" / "전체 해제" 버튼 제공

**검색 기능**
- 카메라 이름으로 실시간 검색
- 검색어와 일치하지 않는 항목은 숨김

#### 3.2.2. 분석 기간 선택
- 드롭다운: 최근 24시간, 지난 7일, 지난 30일

#### 3.2.3. 혼잡도 비교 차트
**차트 렌더링**
- Chart.js Line 차트
- 각 카메라를 서로 다른 색상의 선으로 표시
- X축: 시간
- Y축: 밀집도

**데이터 로딩**
- "분석 실행" 버튼 클릭 시 선택된 카메라들의 데이터 병렬 페칭
- API: `GET /api/v1/cameras/{id}/density-history?start={start}&end={end}`
- 각 카메라의 데이터를 하나의 차트에 통합

**범례**
- 차트 상단에 각 카메라의 색상과 이름 표시
- 범례 클릭으로 해당 카메라 데이터 표시/숨김 토글

#### 3.2.4. 주간 통계 패널
**주간 최고 혼잡 장소 Top 5**
- API: `GET /api/v1/cameras/statistics?days=7`
- 최고 밀집도 기준 정렬

**가장 예측이 어려운 장소 Top 5**
- 동일 API 사용
- 밀집도 표준편차 기준 정렬

### 3.3. 데이터 흐름
1. 페이지 로드 시 카메라 목록 표시 (서버에서 전달)
2. 사용자가 카메라 선택 및 기간 선택
3. "분석 실행" 버튼 클릭
4. 선택된 각 카메라에 대해 밀집도 히스토리 API 호출
5. 모든 데이터를 하나의 차트 데이터셋으로 병합
6. Chart.js로 렌더링
7. 주간 통계는 페이지 로드 시 한 번만 조회

---

## 4. 카메라 관리 페이지

### 4.1. 페이지 개요
카메라 관리 페이지는 카메라를 등록, 조회, 삭제할 수 있는 관리 인터페이스를 제공합니다.

**접근 경로**: `/cameras`  
**컨트롤러**: `CameraController` (별도 컨트롤러)
**템플릿**: `cameras.html`  
**JavaScript**: `cameras.js`, `camera-map.js`

### 4.2. 주요 기능

#### 4.2.1. 카메라 현황 요약
**3개의 요약 카드**
- 전체 카메라: 등록된 총 카메라 수
- 정상 상태: `status == HEALTHY`인 카메라 수
- 주의/오프라인: `status == WARNING` 또는 `OFFLINE`인 카메라 수

#### 4.2.2. 등록된 카메라 목록
**테이블 형식**
- 컬럼: 카메라명, 주소/좌표, 상태, 스트리밍 유형, 스트리밍 주소, 작업
- 각 행은 하나의 카메라 정보 표시
- 카메라명 아래에 설명(description) 표시 (있는 경우)
- 주소 아래에 좌표 표시 (있는 경우)

**상태 칩**
- `HEALTHY`: 초록색 "정상"
- `WARNING`: 주황색 "주의"
- `OFFLINE`: 회색 "오프라인"

**삭제 버튼**
- 각 행의 "작업" 컬럼에 삭제 버튼 표시
- 클릭 시 확인 다이얼로그 표시
- 확인 시 `POST /cameras/{id}/delete` 요청

#### 4.2.3. 카메라 등록 폼
**기본 정보**
- 카메라명 (필수)
- 스트리밍 유형 (라디오 버튼): RTSP 또는 YouTube Live
- 스트리밍 주소 (필수)
  - RTSP 선택 시: `rtsp://`로 시작하는 URL
  - YouTube Live 선택 시: YouTube Live 전체 URL
- 카메라 설명 (선택)

**위치 정보**
- Naver Map 통합
- 지도 클릭 시 마커 추가 및 좌표 자동 입력
- 역지오코딩으로 주소 자동 채우기
- 주소 검색 기능: 주소 입력 후 "주소 검색" 버튼 클릭 시 해당 위치로 지도 이동
- 위도/경도 직접 입력 가능
- 내 위치 버튼: 현재 위치로 지도 이동

**폼 제출**
- "저장" 버튼 클릭 시 `POST /cameras` 요청
- 서버 측 유효성 검사 실패 시 오류 메시지 표시
- 성공 시 페이지 새로고침 및 토스트 메시지 표시

#### 4.2.4. 스트리밍 유형 동적 UI
- 스트리밍 유형 라디오 버튼 변경 시:
  - 스트리밍 주소 입력 필드의 placeholder 변경
  - 도움말 텍스트 변경
- JavaScript로 구현

### 4.3. 데이터 흐름
1. **페이지 로드**
   - `GET /cameras` 요청
   - 컨트롤러에서 모든 카메라 조회
   - 요약 통계 계산 (`CameraSummary`)
   - 빈 `CameraForm` 객체 생성
   - 템플릿 렌더링

2. **카메라 등록**
   - 사용자가 폼 작성
   - `POST /cameras` 요청
   - `CameraForm` 객체 바인딩 및 유효성 검사
   - `CameraService.createCamera()` 호출
   - 성공 시 리다이렉트 및 토스트 메시지
   - 실패 시 오류 메시지와 함께 폼 재표시

3. **카메라 삭제**
   - 삭제 버튼 클릭
   - 확인 다이얼로그 표시
   - `POST /cameras/{id}/delete` 요청
   - `CameraService.deleteCamera()` 호출
   - 성공 시 리다이렉트 및 토스트 메시지

### 4.4. CameraForm 데이터 모델
```java
class CameraForm {
    String name;
    String description;
    StreamType streamType;  // RTSP, YOUTUBE
    String streamUrl;
    String address;
    Double latitude;
    Double longitude;
}
```

### 4.5. CameraSummary 데이터 모델
```java
record CameraSummary(
    long total,
    long healthy,
    long warning,
    long offline
)
```

---

## 5. 공통 설계 특징

### 5.1. 서버 사이드 렌더링 (SSR)
- 모든 페이지는 Thymeleaf 템플릿 엔진으로 서버에서 HTML 생성
- 초기 데이터는 템플릿에 직접 렌더링되어 빠른 초기 로딩 제공
- JavaScript는 인터랙티브 기능 및 동적 데이터 갱신에만 사용

### 5.2. 레이아웃 템플릿
- 모든 페이지는 `layout.html`을 공통 레이아웃으로 사용
- 네비게이션 바, 사이드바, 푸터 등 공통 요소 포함
- `th:replace` 디렉티브로 레이아웃 상속

### 5.3. 반응형 디자인
- CSS Grid 및 Flexbox를 사용한 유연한 레이아웃
- 모바일, 태블릿, 데스크톱 화면 크기에 대응
- 미디어 쿼리로 화면 크기별 스타일 조정

### 5.4. 접근성
- ARIA 레이블 및 역할 속성 사용
- 키보드 네비게이션 지원
- 스크린 리더 친화적인 마크업

### 5.5. 오류 처리
- 서버 측 유효성 검사 오류를 Thymeleaf로 표시
- JavaScript에서 API 호출 실패 시 사용자 친화적인 오류 메시지 표시
- 네트워크 오류, 타임아웃 등에 대한 적절한 피드백

### 5.6. 토스트 메시지
- 작업 완료 시 임시 알림 메시지 표시
- 서버에서 `RedirectAttributes.addFlashAttribute()`로 메시지 전달
- 템플릿에서 조건부 렌더링
- CSS 애니메이션으로 자동 사라짐

---

## 6. 주요 API 엔드포인트 요약

### 6.1. 지도 페이지
- `GET /map`: 페이지 렌더링
- 데이터는 서버 렌더링 시 `window.safetyCameras`로 주입

### 6.2. 알림 이력 페이지
- `GET /alerts`: 페이지 렌더링
- `GET /api/v1/alerts/history`: 알림 이력 조회 (필터링, 페이지네이션, 정렬)
- `GET /api/v1/analysis-logs/{logId}/details`: 알림 상세 정보 조회

### 6.3. 패턴/비교 분석 페이지
- `GET /comparison`: 페이지 렌더링
- `GET /api/v1/cameras/{id}/density-history`: 카메라별 밀집도 히스토리
- `GET /api/v1/cameras/statistics?days=7`: 주간 통계

### 6.4. 카메라 관리 페이지
- `GET /cameras`: 페이지 렌더링 (목록 조회)
- `POST /cameras`: 카메라 등록
- `POST /cameras/{id}/delete`: 카메라 삭제
