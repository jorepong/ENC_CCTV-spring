# 🚨 ENC: 실시간 군중 밀집도 관제 및 지능형 예측 시스템

<img width="734" height="525" alt="image" src="https://github.com/user-attachments/assets/a985bcfe-713f-49ed-a7f1-9ed4d202cf33" />

ENC (Electric-Network-CCTV)는 기존의 평면 CCTV 영상만으로 3D 공간의 깊이를 스스로 학습하여, 군중 밀집도를 정확하게 산출하고 위험을 사전에 예측하는 실시간 안전 관제 플랫폼입니다. 고가의 뎁스 카메라나 라이다 없이, 범용 CCTV가 설치된 어느 곳에서나 즉시 도입할 수 있는 저비용·고효율의 확장이 가능합니다.

## 🔍 기획 배경 및 핵심 문제 해결
기존의 객체 탐지 기반 밀집도 산출은 원근 왜곡(가까운 사람은 크게, 먼 사람은 작게 보이는 현상)으로 인해 치명적인 오류가 발생했습니다. 

이를 해결하기 위해 본 프로젝트는 '영상 속 사람을 동적인 픽셀 기준자로 활용하는 원근 맵' 알고리즘을 독자적으로 고안했습니다. 이를 통해 카메라의 화각이나 설치 높이에 구애받지 않고, 실제 공간이 수용 가능한 '표준 사람 단위'의 일관된 밀집도를 계산해 냅니다.


## 💡 핵심 기능 및 아키텍처

### 1. 원근 맵 기반 공간 정규화
<img width="904" height="430" alt="image" src="https://github.com/user-attachments/assets/b8fbe007-d9dd-497c-86dc-808dd3e30fbe" />

* 논리적 수식: $D=\frac{\sum_{i}\frac{A_{i}}{E(x_{i},y_{i})}}{\iint_{\Omega}\frac{1}{E(x,y)}dxdy}$
* 탐지된 각 객체의 픽셀 면적($A_i$)을 해당 위치의 기대 면적($E$)으로 나누어 원근 효과를 상쇄합니다.
* 분모는 해당 공간(ROI)이 수용할 수 있는 최대 표준 사람 수를 적분하여 도출함으로써, 밀집도 1.0 초과 시 '위험(물리적 접촉 발생)'을 의미하는 직관적 지표를 제공합니다.

### 2. 시계열 데이터 분석 기반 지능형 예측 경보
* 단순한 현재 밀집도(정적 데이터) 표기를 넘어, 밀집도의 변화율(속도)과 가속도를 계산합니다.
* 현재 추세가 지속될 경우 위험 임계치에 도달하는 ETA(도달 예정 시간)를 예측하여 '임박', '진입', '심화' 등의 선제적 알림을 발송합니다.

### 3. 실시간 통합 관제 대시보드
* Spring Boot와 Nginx 리버스 프록시를 활용한 다중 CCTV 실시간 스트리밍 관제.
* 요일/시간대별 밀집도 히트맵 및 과거 이력 분석 기능 제공.


## ⚙️ 시스템 아키텍처

본 시스템은 안정성과 AI 연산 부하 분산을 위해 Docker 기반의 마이크로서비스 아키텍처로 설계되었습니다. 사용자 트래픽을 처리하는 Spring 서버와 무거운 영상 처리를 담당하는 Django 서버를 물리적으로 분리했습니다.

<img width="1215" height="562" alt="image" src="https://github.com/user-attachments/assets/1964f3c4-d26a-4259-ac8b-5bb1088c6f0c" />

* Backend & Web: Java 17, Spring Boot, Nginx, MySQL
* AI Inference: Python, Django REST Framework, YOLOv8, DeepSORT
* Infra: Docker Compose, GCP (Google Cloud Platform)


## 👥 팀 구성 및 역할
본 프로젝트는 동국대학교 종합설계 교과목을 통해 3인 팀으로 진행되었습니다.

* 조현빈: 백엔드 시스템 구축, 원근 맵(ROI) 알고리즘 설계 및 수학적 모델링, Docker 인프라 배포
* 홍승민: AI 모델(YOLO) 최적화 및 객체 겹침(DeepSORT) 해결 방안 연구
* 이수연: 시계열 기반 예측 경보 로직 고안, 대시보드 기획 및 교내 실증 테스트 협의
