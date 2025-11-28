let dangerDurationTimer = null;
let dangerDurationSeconds = 0;

document.addEventListener('DOMContentLoaded', () => {

    const cameraStage = document.querySelector('[data-camera-id]');
    if (!cameraStage) {
        return;
    }

    const cameraId = cameraStage.dataset.cameraId;
    if (!cameraId) {
        return;
    }

    const SNAPSHOT_POLLING_INTERVAL = 5000;
    const ALERT_POLLING_INTERVAL = 5000;
    const PANEL_POLLING_INTERVAL = 5000;
    const TREND_POLLING_INTERVAL = 60000;
    const STATUS_POLLING_INTERVAL = 5000;
    const SUMMARY_POLLING_INTERVAL = 15000;

    // Initialize timers and clocks based on server-rendered state
    initializeTrainingCountdown();
    startLiveClock('panel-density-time');
    const infoPanel = document.querySelector('.info-panel');
    if (infoPanel) {
        const initialLevel = infoPanel.dataset.level;
        const initialSeconds = parseInt(infoPanel.dataset.durationSeconds || '0', 10);
        const initialSince = infoPanel.dataset.dangerSince || null;
        updateDangerDurationTimer(initialLevel, initialSeconds, initialSince);
    }

    // Initial fetch for data not included in the main page model
    fetchAndRenderAlertTrend();
    fetchAndRenderAlerts();
    fetchAndRenderCameraListStatus();
    fetchAndRenderSummary();
    fetchAndRenderSummaryPanels();

    // Render initial panel data immediately if available (SSR injection)
    if (window.initialPanelData) {
        renderPanel(window.initialPanelData);
    } else {
        // Only fetch if no initial data was provided
        fetchAndRenderPanel(cameraId);
    }

    // Set up polling intervals to fetch fresh data periodically
    setInterval(() => updateSnapshotImage(cameraId), SNAPSHOT_POLLING_INTERVAL);
    setInterval(() => fetchAndRenderPanel(cameraId), PANEL_POLLING_INTERVAL);
    setInterval(() => fetchAndRenderAlerts(), ALERT_POLLING_INTERVAL);
    setInterval(() => fetchAndRenderAlertTrend(), TREND_POLLING_INTERVAL);
    setInterval(() => fetchAndRenderCameraListStatus(), STATUS_POLLING_INTERVAL);
    setInterval(() => fetchAndRenderSummary(), SUMMARY_POLLING_INTERVAL);
});

async function fetchAndRenderSummaryPanels() {
    const hotspotList = document.getElementById('dashboard-hotspotList');
    const volatilityList = document.getElementById('dashboard-volatilityList');
    if (!hotspotList || !volatilityList) return;

    try {
        const response = await fetch('/api/v1/cameras/statistics?days=7');
        if (!response.ok) throw new Error('통계 정보를 불러오지 못했습니다.');
        const stats = await response.json();

        // Hotspot List
        stats.sort((a, b) => b.peakDensity - a.peakDensity);
        hotspotList.innerHTML = stats.slice(0, 5).map((s, i) => `<li><span class="rank">${i+1}</span><span class="item-name">${s.cameraName}</span><span class="item-value">${(s.peakDensity * 100).toFixed(1)}%</span></li>`).join('');
        if (stats.length === 0) {
            hotspotList.innerHTML = '<li>분석 데이터가 없습니다.</li>';
        }

        // Volatility List
        stats.sort((a, b) => b.densityStdDev - a.densityStdDev);
        volatilityList.innerHTML = stats.slice(0, 5).map((s, i) => `<li><span class="rank">${i+1}</span><span class="item-name">${s.cameraName}</span><span class="item-value">${s.densityStdDev.toFixed(3)}</span></li>`).join('');
        if (stats.length === 0) {
            volatilityList.innerHTML = '<li>분석 데이터가 없습니다.</li>';
        }

    } catch (error) {
        console.error('Failed to render summary panels:', error);
        hotspotList.innerHTML = '<li>데이터를 불러오는 데 실패했습니다.</li>';
        volatilityList.innerHTML = '<li>데이터를 불러오는 데 실패했습니다.</li>';
    }
}


const CONGESTION_LEVEL_ORDER = {
    'NO_DATA': 0,
    'FREE': 1,
    'CAUTION': 2,
    'DANGER': 3,
};

async function fetchAndRenderCameraListStatus() {
    try {
        const response = await fetch('/api/v1/cameras/analytics-summary');
        if (!response.ok) {
            console.warn(`Failed to fetch camera status list: ${response.status}`);
            return;
        }
        const data = await response.json();
        if (!Array.isArray(data)) return;

        data.forEach(cameraStatus => {
            const listItem = document.querySelector(`.camera-list__item[data-camera-id='${cameraStatus.cameraId}']`);
            if (!listItem) return;

            const chip = listItem.querySelector('.chip');
            if (!chip) return;

            // Handle PENDING status first
            if (cameraStatus.trainingStatus === 'PENDING') {
                chip.textContent = '학습 중';
                chip.className = 'chip chip--sm chip--info';
                listItem.classList.remove('flash-red', 'flash-green');
                listItem.dataset.level = 'PENDING'; // Update data attribute for consistency
                return; // Skip to next camera
            }

            // If not PENDING, proceed with normal level comparison
            const oldLevel = listItem.dataset.level;
            const newLevel = cameraStatus.level;

            if (oldLevel !== newLevel) {
                const oldLevelOrder = CONGESTION_LEVEL_ORDER[oldLevel] ?? -1;
                const newLevelOrder = CONGESTION_LEVEL_ORDER[newLevel] ?? -1;

                listItem.classList.remove('flash-red', 'flash-green');
                void listItem.offsetWidth; // Trigger reflow to restart animation

                if (newLevelOrder > oldLevelOrder) {
                    listItem.classList.add('flash-red');
                } else if (newLevelOrder < oldLevelOrder) {
                    listItem.classList.add('flash-green');
                }

                chip.textContent = cameraStatus.levelLabel;
                chip.className = `chip chip--sm chip--${cameraStatus.tone}`;
                listItem.dataset.level = newLevel;
            }
        });
    } catch (error) {
        console.error('카메라 상태 목록을 불러오는 중 오류 발생:', error);
    }
}


function startLiveClock(elementId) {
    const clockElement = document.getElementById(elementId);
    if (!clockElement) return;

    function updateClock() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        clockElement.textContent = `${h}:${m}:${s}`;
    }

    updateClock();
    setInterval(updateClock, 1000);
}

function updateDangerDurationTimer(level, initialSeconds, dangerSince) {
    const durationEl = document.getElementById('panel-duration-chip');
    if (!durationEl) return;

    if (dangerDurationTimer) {
        clearInterval(dangerDurationTimer);
        dangerDurationTimer = null;
    }

    dangerDurationSeconds = 0;
    durationEl.classList.add('chip-duration--hidden');
    durationEl.textContent = '';

    if (level !== 'DANGER') {
        return;
    }

    let baseSeconds = 0;
    let parsedStart = null;

    if (dangerSince) {
        const parsed = new Date(dangerSince);
        if (!Number.isNaN(parsed.getTime())) {
            parsedStart = parsed;
            baseSeconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
        }
    }

    if (!parsedStart && typeof initialSeconds === 'number' && !Number.isNaN(initialSeconds)) {
        baseSeconds = Math.max(0, initialSeconds);
        parsedStart = new Date(Date.now() - baseSeconds * 1000);
    }

    dangerDurationSeconds = baseSeconds;
    const updateText = () => {
        durationEl.textContent = `지속 시간 ${formatDuration(dangerDurationSeconds)}`;
    };
    durationEl.classList.remove('chip-duration--hidden');
    updateText();
    dangerDurationTimer = setInterval(() => {
        dangerDurationSeconds++;
        updateText();
    }, 1000);
}


async function updateSnapshotImage(cameraId) {
    const snapshotContainer = document.getElementById('snapshot-container');
    if (!snapshotContainer) return;

    try {
        const response = await fetch(`/api/v1/cameras/${cameraId}/latest-snapshot-path`);
        if (!response.ok) {
            console.warn(`카메라에 대한 스냅샷을 찾을 수 없습니다 ${cameraId}. 상태: ${response.status}`);
            return;
        }

        const data = await response.json();
        const newImagePath = data.path;
        if (!newImagePath) return;

        let snapshotImage = document.getElementById('snapshot-image');
        if (!snapshotImage) {
            snapshotImage = document.createElement('img');
            snapshotImage.id = 'snapshot-image';
            snapshotImage.alt = '최신 스냅샷';

            const placeholder = snapshotContainer.querySelector('.camera-view__display--placeholder');
            if (placeholder) {
                placeholder.remove();
            }
            snapshotContainer.appendChild(snapshotImage);
        }

        snapshotImage.src = `${newImagePath}?t=${Date.now()}`;
    } catch (error) {
        console.error('최신 스냅샷을 불러오는 중 오류 발생:', error);
    }
}

async function fetchAndRenderPanel(cameraId) {
    try {
        const response = await fetch(`/api/v1/cameras/${cameraId}/analytics`);
        if (!response.ok) {
            console.warn(`카메라 패널 데이터를 불러오지 못했습니다 ${cameraId}: ${response.status}`);
            return;
        }
        const data = await response.json();
        renderPanel(data);
    } catch (error) {
        console.error('패널 데이터를 불러오는 중 오류 발생:', error);
    }
}

async function fetchAndRenderAlerts() {
    try {
        const response = await fetch('/api/v1/alerts/recent?limit=10');
        if (!response.ok) {
            console.warn(`최근 알림을 불러오지 못했습니다: ${response.status}`);
            return;
        }
        const data = await response.json();
        renderAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
        console.error('알림을 불러오는 중 오류 발생:', error);
    }
}

function renderAlerts(alerts) {
    const listEl = document.getElementById('dashboard-alerts-list');
    const emptyEl = document.getElementById('dashboard-alerts-empty');
    if (!listEl || !emptyEl) {
        return;
    }

    listEl.innerHTML = '';
    if (!alerts.length) {
        emptyEl.hidden = false;
        return;
    }

    emptyEl.hidden = true;
    alerts.slice(0, 10).forEach((alert) => {
        const severity = (alert.severity || 'info').toLowerCase();
        const li = document.createElement('li');
        li.className = `alerts-item ${
            severity === 'danger'
                ? 'alerts-item--high'
                : severity === 'warning'
                    ? 'alerts-item--medium'
                    : 'alerts-item--low'
        }`;

        const time = document.createElement('time');
        time.textContent = formatAlertTime(alert.timestamp);

        const content = document.createElement('div');
        const title = document.createElement('p');
        title.textContent = alert.title || '알림';
        const message = document.createElement('span');
        message.textContent = alert.message || '';
        const cameraMeta = document.createElement('div');
        cameraMeta.className = 'alerts-item__camera';
        const cameraName = document.createElement('strong');
        cameraName.textContent = alert.cameraName || '알 수 없는 카메라';
        const cameraLocation = document.createElement('span');
        cameraLocation.textContent = alert.cameraLocation || '알 수 없는 위치';
        cameraMeta.append(cameraName, cameraLocation);
        content.append(cameraMeta, title, message);

        li.append(time, content);
        listEl.appendChild(li);
    });
}

function renderPanel(data) {
    if (!data) {
        return;
    }
    const hasData = data && data.hasData;

    setText('panel-location', hasData ? data.location : '알 수 없는 위치');
    setText('panel-density', hasData && typeof data.latestDensity === 'number'
        ? data.latestDensity.toFixed(2)
        : '--');

    updateVelocityText('panel-roc', hasData ? data.densityVelocityPerMin : null);

    const levelChip = document.getElementById('panel-level-chip');
    if (levelChip) {
        levelChip.textContent = hasData ? data.congestionLabel : '상태';
        levelChip.className = `chip chip--${hasData ? data.statusTone : 'neutral'}`;
    }

    // const etaChip = document.getElementById('panel-eta-chip');
    // if (etaChip) {
    //     if (!hasData || data.congestionLevel === 'DANGER') {
    //         etaChip.style.display = 'none';
    //         etaChip.textContent = '예상 시간 정보 없음';
    //     } else {
    //         etaChip.style.display = 'inline-flex';
    //         const etaText = data.etaMessage
    //             || (data.etaType === 'ENTERING_DANGER' && data.etaSeconds > 0
    //                 ? `${Math.ceil(data.etaSeconds / 60)}분 후 위험 진입 예상`
    //                 : data.etaType === 'EXITING_DANGER' && data.etaSeconds > 0
    //                     ? `${Math.ceil(data.etaSeconds / 60)}분 후 위험 해제 예상`
    //                     : '주요 추세 변화 감지되지 않음.');
    //         etaChip.textContent = etaText;
    //     }
    // }

    renderTimeline(data);

    if (hasData) {
        updateDangerDurationTimer(data.congestionLevel, data.timeInDangerSeconds, data.dangerStartTimestamp);
    } else {
        updateDangerDurationTimer('FREE', 0, null);
    }

    renderAlertBanner(data.latestAlert);
}

function renderAlertBanner(alert) {
    const banner = document.getElementById('camera-alert-banner');
    if (!banner) return;

    if (!alert) {
        banner.classList.add('alert-banner--hidden');
        return;
    }

    // Check if the alert is recent (within 10 minutes)
    const alertTime = new Date(alert.timestamp);
    const now = new Date();
    const diffMs = now - alertTime;
    const tenMinutesMs = 10 * 60 * 1000;

    if (isNaN(alertTime.getTime()) || diffMs > tenMinutesMs) {
        banner.classList.add('alert-banner--hidden');
        return;
    }

    banner.classList.remove('alert-banner--hidden');
    banner.classList.remove('alert-banner--danger', 'alert-banner--warning', 'alert-banner--info');

    const severity = (alert.severity || 'info').toLowerCase();
    banner.classList.add(`alert-banner--${severity}`);

    const titleEl = document.getElementById('camera-alert-title');
    const msgEl = document.getElementById('camera-alert-message');
    const timeEl = document.getElementById('camera-alert-time');

    if (titleEl) titleEl.textContent = alert.title || '알림';
    if (msgEl) msgEl.textContent = alert.message || '';
    if (timeEl) timeEl.textContent = formatAlertTime(alert.timestamp);
}

function renderTimeline(data) {
    const list = document.getElementById('panel-timeline');
    const empty = document.getElementById('panel-timeline-empty');
    if (!list || !empty) {
        return;
    }
    list.innerHTML = '';

    const points = data && Array.isArray(data.recentDensitySnapshots) ? data.recentDensitySnapshots : [];
    if (!points.length) {
        empty.hidden = false;
        return;
    }

    empty.hidden = true;
    points.forEach((point) => {
        const li = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = formatTime(point.timestamp);
        const value = document.createElement('span');
        value.textContent = typeof point.density === 'number' ? point.density.toFixed(2) : '--';
        li.append(time, value);
        list.appendChild(li);
    });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text ?? '--';
    }
}

function updateVelocityText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    const emptyEl = document.getElementById(`${id}-empty`);

    if (typeof value !== 'number') {
        el.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        return;
    }

    el.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    el.classList.remove('positive', 'negative', 'neutral');

    if (value > 0.05) {
        el.textContent = '급격한 증가';
        el.classList.add('negative');
    } else if (value > 0.005) {
        el.textContent = '완만한 증가';
        el.classList.add('negative');
    } else if (value < -0.05) {
        el.textContent = '급격한 감소';
        el.classList.add('positive');
    } else if (value < -0.005) {
        el.textContent = '완만한 감소';
        el.classList.add('positive');
    } else {
        el.textContent = '거의 정체';
        el.classList.add('neutral');
    }
}


function formatDuration(seconds) {
    if (!seconds || seconds <= 0) {
        return '00:00:00';
    }
    const total = Math.floor(seconds);
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function formatTime(value) {
    if (!value) {
        return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function fetchAndRenderAlertTrend() {
    try {
        const response = await fetch('/api/v1/alerts/trend');
        if (!response.ok) {
            console.warn(`알림 추세 데이터를 불러오지 못했습니다: ${response.status}`);
            return;
        }
        const data = await response.json();
        renderAlertTrend(data);
    } catch (error) {
        console.error('알림 추세 데이터를 불러오는 중 오류 발생:', error);
    }
}

function renderAlertTrend(data) {
    const container = document.getElementById('alert-trend-bars');
    const note = document.getElementById('alert-trend-note');
    if (!container || !note) {
        return;
    }

    container.innerHTML = '';

    if (!data || !Array.isArray(data.points) || data.points.length === 0) {
        note.textContent = '지난 12시간 동안 감지된 알림이 없습니다.';
        return;
    }

    note.textContent = '지난 12시간 동안의 시간별 알림';
    const points = data.points.slice(-12);

    const maxCount = data.maxCount > 0 ? data.maxCount : 1;

    points.forEach(point => {
        const wrapper = document.createElement('div');
        wrapper.className = 'alert-trend__bar-item';

        const bar = document.createElement('span');
        bar.className = 'alert-trend__bar';
        const count = typeof point.count === 'number' ? point.count : 0;

        const height = (count * 100) / maxCount;
        bar.style.height = `${height}%`;

        const hourLabel = formatHourLabel(point.hour);
        const tooltip = `${count}개`;
        bar.title = tooltip;
        bar.setAttribute('aria-label', tooltip);

        const label = document.createElement('span');
        label.className = 'alert-trend__label';
        label.textContent = hourLabel;

        wrapper.append(bar, label);
        container.appendChild(wrapper);
    });
}

function formatHourLabel(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '--';
    }
    const normalized = ((Math.floor(value) % 24) + 24) % 24;
    return `${String(normalized).padStart(2, '0')}`;
}

function formatAlertTime(value) {
    if (!value) {
        return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function initializeTrainingCountdown() {
    const countdownElement = document.getElementById('training-countdown');
    if (!countdownElement) {
        return;
    }

    const nextTrainingTimeStr = countdownElement.dataset.nextTrainingTime;
    if (!nextTrainingTimeStr) {
        countdownElement.textContent = '학습 일정 알 수 없음';
        return;
    }

    const targetDate = new Date(nextTrainingTimeStr);
    if (isNaN(targetDate.getTime())) {
        countdownElement.textContent = '유효하지 않은 일정';
        return;
    }

    const updateCountdown = () => {
        const now = new Date();
        const remaining = targetDate - now;

        if (remaining <= 0) {
            countdownElement.textContent = '다음 학습 대기 중...';
            clearInterval(countdownInterval);
            return;
        }

        const totalSeconds = Math.floor(remaining / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        countdownElement.textContent = `다음 원근 맵 학습까지 ${minutes}분 ${String(seconds).padStart(2, '0')}초`;
    };

    const countdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown(); // Initial call to display immediately
}

async function fetchAndRenderSummary() {
    try {
        const response = await fetch('/api/v1/dashboard/summary');
        if (!response.ok) {
            console.warn(`대시보드 요약을 불러오지 못했습니다: ${response.status}`);
            return;
        }
        const data = await response.json();
        renderSummaryCards(data);
    } catch (error) {
        console.error('대시보드 요약을 불러오는 중 오류 발생:', error);
    }
}

function renderSummaryCards(summary) {
    if (!summary) {
        return;
    }
    const totalEl = document.getElementById('summary-total-cameras');
    if (totalEl) {
        const total = typeof summary.totalCameras === 'number' ? summary.totalCameras : 0;
        totalEl.textContent = `${total}대`;
    }
    const streamingNote = document.getElementById('summary-streaming-note');
    if (streamingNote) {
        const streaming = typeof summary.streamingCameras === 'number' ? summary.streamingCameras : 0;
        streamingNote.textContent = streaming > 0
            ? `YouTube Live ${streaming}대 연결`
            : '등록된 카메라가 없습니다.';
    }
    const dangerEl = document.getElementById('summary-danger-cameras');
    if (dangerEl) {
        const danger = typeof summary.camerasInDanger === 'number' ? summary.camerasInDanger : 0;
        dangerEl.textContent = `${danger}대`;
    }
    const alertEl = document.getElementById('summary-alert-count');
    if (alertEl) {
        const count = typeof summary.recentAnalysisEvents === 'number' ? summary.recentAnalysisEvents : 0;
        alertEl.textContent = `${count}건`;
    }
}
