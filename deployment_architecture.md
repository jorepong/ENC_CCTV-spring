# E-N-C 캠퍼스 안전 시스템 - 배포 아키텍처 문서

## 1. 시스템 개요

E-N-C 캠퍼스 안전 시스템은 Docker 컨테이너 기반의 마이크로서비스 아키텍처로 구성되어 있으며, Google Cloud Platform(GCP)에 배포되어 운영 중입니다.

**배포 도메인**: `dogcctv.ggm.kr`  
**프로토콜**: HTTPS (Let's Encrypt SSL 인증서)  
**컨테이너 오케스트레이션**: Docker Compose

## 2. 전체 아키텍처

### 2.1. 시스템 구성도

```
[인터넷]
    ↓ HTTPS (443)
[Nginx Reverse Proxy]
    ├─→ /                          → [Spring Boot Container] (웹 UI)
    ├─→ /api/v1/analysis/          → [Django Container] (AI 분석)
    ├─→ /api/v1/perspective-map/   → [Django Container] (원근 맵 학습)
    ├─→ /api/v1/density-verification/ → [Django Container] (밀집도 검증)
    └─→ /media/                    → [Nginx 직접 서빙] (정적 파일)
         ↓
    [Shared Media Storage]
         ↑
    [Django Container] ←→ [MySQL Container]
         ↑
    [Spring Boot Container]
```

### 2.2. 컨테이너 구성

시스템은 총 5개의 Docker 컨테이너로 구성됩니다:

1. **nginx-container**: 리버스 프록시 및 SSL 종료
2. **spring-container**: 웹 UI 및 백엔드 로직
3. **django-container**: AI 분석 서버
4. **mysql-container**: 데이터베이스
5. **certbot**: SSL 인증서 자동 갱신 (일회성 실행)

## 3. 컨테이너 상세

### 3.1. Nginx Container

**이미지**: `nginx:latest`  
**컨테이너명**: `enc-nginx`  
**역할**: 리버스 프록시, SSL 종료, 정적 파일 서빙

#### 포트 매핑
- `80:80` - HTTP (HTTPS 리다이렉트용)
- `443:443` - HTTPS

#### 볼륨 마운트
- `./nginx/nginx.conf:/etc/nginx/nginx.conf` - Nginx 설정 파일
- `./shared-media:/usr/share/nginx/html/media` - 정적 미디어 파일 (읽기 전용)
- `./certbot/conf:/etc/letsencrypt` - SSL 인증서
- `./certbot/www:/var/www/certbot` - ACME 챌린지 파일

#### 주요 기능

**1. HTTP → HTTPS 리다이렉트**
- 모든 HTTP(80) 요청을 HTTPS(443)로 자동 리다이렉트
- ACME 챌린지 경로(`/.well-known/acme-challenge/`)는 예외 처리

**2. 라우팅 규칙**
- `/media/` → Nginx가 직접 서빙 (성능 최적화)
  - 캐시 만료: 30일
  - Cache-Control 헤더 추가
- `/api/v1/analysis/` → Django 컨테이너로 프록시
  - 타임아웃: 300초 (AI 분석 시간 고려)
- `/api/v1/perspective-map/` → Django 컨테이너로 프록시
  - 타임아웃: 300초 (학습 시간 고려)
- `/api/v1/density-verification/` → Django 컨테이너로 프록시
  - 타임아웃: 300초
- `/` → Spring Boot 컨테이너로 프록시 (기본 라우트)

**3. SSL/TLS 설정**
- Let's Encrypt 인증서 사용
- 인증서 경로: `/etc/letsencrypt/live/dogcctv.ggm.kr/`

**4. 업로드 크기 제한**
- `client_max_body_size: 10M` - 이미지 업로드 지원

### 3.2. Spring Boot Container

**이미지**: `jorepong/enc-spring:latest` (Docker Hub)  
**컨테이너명**: `enc-spring`  
**역할**: 웹 UI 서버 (SSR), 백엔드 API

#### 포트 매핑
- `8080:8080` - 내부 네트워크에서만 접근 (Nginx를 통해 외부 노출)

#### 환경 변수
- `SPRING_PROFILES_ACTIVE=prod` - 프로덕션 프로필 활성화
- `DB_USERNAME` - MySQL 사용자명
- `DB_PASSWORD` - MySQL 비밀번호
- `TZ=Asia/Seoul` - 타임존 설정
- `NAVER_MAP_CLIENT_ID` - Naver Map API 클라이언트 ID

#### 볼륨 마운트
- `./shared-media:/app/media` - Django와 공유하는 미디어 스토리지

#### 의존성
- `mysql-container` (healthcheck 통과 필요)
- `django-container` (시작 완료 필요)

#### Dockerfile 분석

**빌드 스테이지 (Multi-stage Build)**
```dockerfile
FROM gradle:8.5-jdk17 AS builder
```
- Gradle 8.5 + JDK 17 이미지 사용
- 의존성 캐싱 최적화: `build.gradle`, `settings.gradle` 먼저 복사
- `gradle bootJar -x test --no-daemon` 실행
  - 테스트 제외 (`-x test`)
  - 데몬 모드 비활성화 (`--no-daemon`) - 컨테이너 환경에 적합

**런타임 스테이지**
```dockerfile
FROM eclipse-temurin:17-jre-alpine
```
- 경량 Alpine Linux 기반 JRE 17 이미지
- 빌드 스테이지에서 생성된 JAR 파일만 복사
- 이미지 크기 최소화 (JDK → JRE)

**실행 명령**
```dockerfile
ENTRYPOINT ["java", "-jar", "app.jar"]
```
- Spring Boot 내장 Tomcat으로 실행

### 3.3. Django Container

**이미지**: `jorepong/enc-django:latest` (Docker Hub)  
**컨테이너명**: `enc-django`  
**역할**: AI 분석 서버 (YOLO, DeepSORT, 밀집도 계산)

#### 포트 매핑
- `8000:8000` - 내부 네트워크에서만 접근

#### 환경 변수
- `DB_HOST=mysql-container` - MySQL 호스트명
- `DB_NAME`, `DB_USER`, `DB_PASSWORD` - 데이터베이스 연결 정보
- `DJANGO_SECRET_KEY` - Django 비밀 키
- `DJANGO_ALLOWED_HOSTS` - 허용된 호스트 목록
- `TZ=Asia/Seoul` - 타임존 설정
- **멀티스레딩 제한 환경 변수**:
  - `OMP_NUM_THREADS=4`
  - `MKL_NUM_THREADS=4`
  - `OPENBLAS_NUM_THREADS=4`
  - `VECLIB_MAXIMUM_THREADS=4`
  - `NUMEXPR_NUM_THREADS=4`
  - 목적: CPU 과부하 방지 및 성능 최적화

#### 리소스 제한
```yaml
deploy:
  resources:
    limits:
      cpus: '7.0'
```
- 최대 7개 CPU 코어 사용 제한

#### 볼륨 마운트
- `./shared-media:/app/media` - Spring과 공유하는 미디어 스토리지

#### 실행 명령 (Gunicorn)
```bash
gunicorn DjangoProject.wsgi:application \
  --chdir /app \
  --bind 0.0.0.0:8000 \
  --workers 2 \
  --threads 2 \
  --timeout 120 \
  --max-requests 500 \
  --max-requests-jitter 50
```

**Gunicorn 설정 분석**:
- `--workers 2`: 2개의 워커 프로세스
- `--threads 2`: 각 워커당 2개의 스레드 (총 4개 동시 요청 처리)
- `--timeout 120`: 요청 타임아웃 120초 (AI 분석 시간 고려)
- `--max-requests 500`: 워커당 500개 요청 처리 후 재시작 (메모리 누수 방지)
- `--max-requests-jitter 50`: 재시작 시점에 무작위성 추가 (동시 재시작 방지)

#### Dockerfile 분석

**베이스 이미지**
```dockerfile
FROM python:3.13-slim
```
- Python 3.13 Slim 이미지 (Debian 기반)

**시스템 의존성**
```dockerfile
RUN apt-get update && apt-get install -y \
    gcc \
    pkg-config \
    default-libmysqlclient-dev \
    libgl1 \
    libglib2.0-0
```
- `gcc`, `pkg-config`: Python 패키지 컴파일용
- `default-libmysqlclient-dev`: MySQL 클라이언트 라이브러리
- `libgl1`, `libglib2.0-0`: OpenCV 의존성

**Python 패키지 설치**
- `requirements.txt`에서 패키지 설치
- `gunicorn` 추가 설치

**환경 변수**
```dockerfile
ENV DJANGO_SETTINGS_MODULE=DjangoProject.settings.prod
```
- 프로덕션 설정 모듈 사용

### 3.4. MySQL Container

**이미지**: `mysql:8.0`  
**컨테이너명**: `enc-mysql`  
**역할**: 관계형 데이터베이스

#### 환경 변수
- `MYSQL_ROOT_PASSWORD` - 루트 비밀번호
- `MYSQL_DATABASE` - 기본 데이터베이스명
- `TZ=Asia/Seoul` - 타임존 설정

#### 볼륨 마운트
- `mysql-data:/var/lib/mysql` - 데이터 영속성 (Named Volume)

#### 문자 인코딩
```bash
--character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
```
- UTF-8 4바이트 문자 지원 (이모지 등)

#### Health Check
```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_PASSWORD}"]
  interval: 10s
  timeout: 5s
  retries: 5
```
- 10초마다 MySQL 연결 상태 확인
- 5회 실패 시 unhealthy 상태로 전환
- Spring 컨테이너는 MySQL이 healthy 상태가 될 때까지 대기

### 3.5. Certbot Container

**이미지**: `certbot/certbot`  
**컨테이너명**: `enc-certbot`  
**역할**: Let's Encrypt SSL 인증서 발급 및 갱신

#### 실행 명령
```bash
certonly --webroot -w /var/www/certbot \
  --force-renewal \
  -d dogcctv.ggm.kr \
  --email jorepong123@gmail.com \
  --agree-tos \
  --no-eff-email
```

**옵션 설명**:
- `certonly`: 인증서만 발급 (웹 서버 설정 변경 안 함)
- `--webroot`: Webroot 플러그인 사용
- `-w /var/www/certbot`: Webroot 경로
- `--force-renewal`: 강제 갱신
- `-d dogcctv.ggm.kr`: 도메인명
- `--agree-tos`: 서비스 약관 동의
- `--no-eff-email`: EFF 이메일 수신 거부

#### 볼륨 마운트
- `./certbot/conf:/etc/letsencrypt` - 인증서 저장
- `./certbot/www:/var/www/certbot` - ACME 챌린지 파일

**참고**: 이 컨테이너는 일회성으로 실행되며, 인증서 갱신은 별도의 cron 작업으로 관리됩니다.

## 4. 네트워크 구성

### 4.1. Docker Network

**네트워크명**: `enc-network`  
**드라이버**: `bridge`

모든 컨테이너는 동일한 브리지 네트워크에 연결되어 있어 컨테이너 이름으로 서로 통신할 수 있습니다.

**내부 통신 예시**:
- Spring → MySQL: `jdbc:mysql://mysql-container:3306/...`
- Spring → Django: `http://django-container:8000/api/v1/analysis/...`
- Django → MySQL: `HOST=mysql-container, PORT=3306`

### 4.2. 외부 접근 경로

```
사용자 → dogcctv.ggm.kr:443 (HTTPS)
  → Nginx Container:443
    → Spring Container:8080 (웹 UI)
    → Django Container:8000 (AI API)
    → Nginx 직접 서빙 (미디어 파일)
```

## 5. 데이터 저장소

### 5.1. Named Volume

**mysql-data**
- MySQL 데이터베이스 파일 저장
- 컨테이너 재시작 시에도 데이터 유지
- 호스트 경로: Docker가 관리하는 볼륨 경로

### 5.2. Bind Mount

**./shared-media**
- Django가 생성한 분석 이미지를 저장
- Spring이 이미지 경로를 조회하여 사용자에게 제공
- Nginx가 직접 서빙하여 성능 최적화
- 호스트 경로: `./shared-media` (docker-compose.yml 기준 상대 경로)

**디렉토리 구조 예시**:
```
shared-media/
├── snapshots/
│   ├── raw/          # 원본 캡처 이미지
│   └── annotated/    # AI 분석 결과 이미지
└── perspective_maps/ # 원근 맵 학습 결과
```

## 6. 환경 변수 관리

환경 변수는 `.env` 파일에서 관리되며, Docker Compose가 자동으로 로드합니다.

**필수 환경 변수**:
```env
# 데이터베이스
DB_NAME=enc_database
DB_USER=enc_user
DB_PASSWORD=<secure_password>

# Django
DJANGO_SECRET_KEY=<django_secret_key>

# Naver Map API
NAVER_MAP_CLIENT_ID=<naver_map_client_id>
```

## 7. 배포 프로세스

### 7.1. 초기 배포

1. **환경 변수 설정**
   ```bash
   cp .env.example .env
   vim .env  # 환경 변수 입력
   ```

2. **SSL 인증서 발급**
   ```bash
   docker-compose up certbot
   ```

3. **컨테이너 시작**
   ```bash
   docker-compose up -d
   ```

4. **로그 확인**
   ```bash
   docker-compose logs -f
   ```

### 7.2. 업데이트 배포

1. **새 이미지 빌드 및 푸시** (로컬 개발 환경)
   ```bash
   # Spring
   docker build -t jorepong/enc-spring:latest .
   docker push jorepong/enc-spring:latest

   # Django
   docker build -t jorepong/enc-django:latest .
   docker push jorepong/enc-django:latest
   ```

2. **서버에서 이미지 풀 및 재시작**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

3. **무중단 배포** (선택)
   ```bash
   docker-compose up -d --no-deps --build spring-container
   docker-compose up -d --no-deps --build django-container
   ```

### 7.3. SSL 인증서 갱신

Let's Encrypt 인증서는 90일마다 갱신이 필요합니다.

**수동 갱신**:
```bash
docker-compose run --rm certbot renew
docker-compose exec nginx-container nginx -s reload
```

**자동 갱신** (Cron 설정 권장):
```cron
0 3 * * 0 cd /path/to/project && docker-compose run --rm certbot renew && docker-compose exec nginx-container nginx -s reload
```

## 8. 모니터링 및 로그

### 8.1. 컨테이너 상태 확인

```bash
docker-compose ps
```

### 8.2. 로그 조회

```bash
# 전체 로그
docker-compose logs -f

# 특정 컨테이너 로그
docker-compose logs -f spring-container
docker-compose logs -f django-container
docker-compose logs -f nginx-container
```

### 8.3. 리소스 사용량 확인

```bash
docker stats
```

## 9. 보안 고려사항

### 9.1. 네트워크 격리
- 모든 컨테이너는 내부 브리지 네트워크에서만 통신
- 외부에는 Nginx(80, 443)만 노출
- Django, Spring, MySQL은 외부 직접 접근 불가

### 9.2. HTTPS 강제
- 모든 HTTP 요청을 HTTPS로 리다이렉트
- Let's Encrypt 인증서로 암호화 통신

### 9.3. 환경 변수 보안
- 민감한 정보는 `.env` 파일에 저장
- `.env` 파일은 `.gitignore`에 추가하여 버전 관리 제외

### 9.4. 컨테이너 재시작 정책
- `restart: always` 설정으로 장애 시 자동 재시작
- MySQL은 healthcheck로 안정성 확보

## 10. 성능 최적화

### 10.1. Nginx 정적 파일 서빙
- `/media/` 경로는 Nginx가 직접 서빙
- Django/Spring을 거치지 않아 응답 속도 향상
- 30일 캐시 설정으로 반복 요청 최소화

### 10.2. Gunicorn 워커 설정
- 2 workers × 2 threads = 4개 동시 요청 처리
- CPU 코어 수와 메모리를 고려한 최적 설정

### 10.3. Django 멀티스레딩 제한
- AI 라이브러리의 스레드 수를 4개로 제한
- CPU 과부하 방지 및 안정적인 성능 유지

### 10.4. MySQL 커넥션 풀
- Spring Boot의 HikariCP 사용
- 커넥션 재사용으로 데이터베이스 부하 감소

## 11. 트러블슈팅

### 11.1. 컨테이너 시작 실패

**증상**: 컨테이너가 계속 재시작됨

**해결 방법**:
1. 로그 확인: `docker-compose logs <container-name>`
2. 환경 변수 확인: `.env` 파일의 값이 올바른지 검증
3. 의존성 확인: MySQL이 healthy 상태인지 확인

### 11.2. Nginx 502 Bad Gateway

**증상**: 웹 페이지 접근 시 502 오류

**해결 방법**:
1. Spring/Django 컨테이너 상태 확인: `docker-compose ps`
2. 백엔드 로그 확인: `docker-compose logs spring-container django-container`
3. 네트워크 연결 확인: `docker network inspect enc-network`

### 11.3. 이미지 로딩 실패

**증상**: 웹 페이지에서 이미지가 표시되지 않음

**해결 방법**:
1. `./shared-media` 디렉토리 권한 확인
2. Nginx 로그 확인: `docker-compose logs nginx-container`
3. 이미지 경로가 올바른지 확인 (Django에서 저장한 경로와 일치하는지)

## 12. 기술 스택 요약

| 계층 | 기술 | 버전 | 역할 |
|------|------|------|------|
| **프록시** | Nginx | latest | 리버스 프록시, SSL 종료, 정적 파일 서빙 |
| **웹 UI** | Spring Boot | 3.x | SSR 웹 애플리케이션, REST API |
| **AI 서버** | Django | 5.x | AI 분석, 밀집도 계산 |
| **WSGI 서버** | Gunicorn | latest | Django 프로덕션 서버 |
| **데이터베이스** | MySQL | 8.0 | 관계형 데이터베이스 |
| **언어** | Java | 17 (JRE) | Spring Boot 런타임 |
| **언어** | Python | 3.13 | Django 런타임 |
| **빌드 도구** | Gradle | 8.5 | Spring Boot 빌드 |
| **컨테이너** | Docker | - | 컨테이너화 |
| **오케스트레이션** | Docker Compose | 3.8 | 멀티 컨테이너 관리 |
| **SSL** | Let's Encrypt | - | 무료 SSL 인증서 |
| **인증서 관리** | Certbot | latest | 자동 인증서 발급/갱신 |

## 13. 시스템 요구사항

### 13.1. 하드웨어
- **CPU**: 최소 8코어 (Django AI 분석용 7코어 + 기타 1코어)
- **메모리**: 최소 16GB (Django AI 모델 로딩 및 분석)
- **디스크**: 최소 100GB (이미지 저장 공간)

### 13.2. 소프트웨어
- **OS**: Linux (Ubuntu 20.04 LTS 권장)
- **Docker**: 20.10 이상
- **Docker Compose**: 1.29 이상

## 14. 향후 개선 사항

### 14.1. 컨테이너 오케스트레이션
- Kubernetes로 마이그레이션하여 자동 스케일링 및 고가용성 확보

### 14.2. 모니터링 시스템
- Prometheus + Grafana 도입으로 실시간 메트릭 수집 및 시각화
- ELK Stack (Elasticsearch, Logstash, Kibana)으로 중앙 집중식 로그 관리

### 14.3. CI/CD 파이프라인
- GitHub Actions 또는 Jenkins로 자동 빌드 및 배포
- 테스트 자동화 및 무중단 배포

### 14.4. 백업 자동화
- MySQL 데이터베이스 정기 백업
- 미디어 파일 클라우드 스토리지 동기화

### 14.5. CDN 도입
- 정적 파일 및 이미지를 CDN으로 서빙하여 글로벌 성능 향상
