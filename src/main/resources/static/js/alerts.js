const LEVEL_CLASS_MAP = {
    DANGER: 'danger',
    WARNING: 'warning',
    INFO: 'info',
};

document.addEventListener('DOMContentLoaded', () => {
    const cameras = Array.isArray(window.cameraData) ? window.cameraData : [];

    // --- Main UI Elements ---
    const alertsTableBody = document.querySelector('#alertsTable tbody');
    const paginationContainer = document.getElementById('pagination');
    const cameraFilter = document.getElementById('cameraFilter');
    const levelFilter = document.getElementById('levelFilter');
    const searchFilter = document.getElementById('searchFilter');
    const dateRangeInput = document.getElementById('dateRange');
    const densityChipGroup = document.getElementById('densityChipGroup');
    const customDensityFilter = document.getElementById('customDensityFilter');
    const minDensityFilter = document.getElementById('minDensityFilter');
    const maxDensityFilter = document.getElementById('maxDensityFilter');


    // --- Modal UI Elements ---
    const modal = document.getElementById('alertDetailModal');
    const modalCloseButton = document.getElementById('modalCloseButton');
    const modalTimestamp = document.getElementById('modalTimestamp');
    const modalRawImage = document.getElementById('modalRawImage');
    const modalAnnotatedImage = document.getElementById('modalAnnotatedImage');
    const modalDensity = document.getElementById('modalDensity');
    const modalPersonCount = document.getElementById('modalPersonCount');
    const modalVelocity = document.getElementById('modalVelocity');
    const modalAcceleration = document.getElementById('modalAcceleration');
    const modalLoading = document.getElementById('modalLoading');
    const modalChartCanvas = document.getElementById('modalDensityChart');
    let densityChart = null;

    const state = {
        page: 1,
        size: 15,
        totalPages: 1,
        sortColumn: 'timestamp',
        sortDirection: 'desc',
        level: 'all',
        cameraId: 'all',
        search: '',
        dateRange: { start: null, end: null },
        minDensity: '',
        maxDensity: '',
        loading: false,
    };

    populateCameraFilter();
    attachEventHandlers();
    initializeDatePicker();
    fetchAndRenderAlerts();

    function populateCameraFilter() {
        cameras.forEach((camera) => {
            const option = document.createElement('option');
            option.value = camera.id;
            option.textContent = camera.name;
            cameraFilter.appendChild(option);
        });
    }

    function attachEventHandlers() {
        // Filter and Search handlers
        [levelFilter, cameraFilter].forEach((element) => {
            element.addEventListener('change', () => {
                state.level = levelFilter.value;
                state.cameraId = cameraFilter.value;
                state.page = 1;
                fetchAndRenderAlerts();
            });
        });

        // Debounced input handlers for search and custom density
        [
            { el: searchFilter, key: 'search' },
            { el: minDensityFilter, key: 'minDensity' },
            { el: maxDensityFilter, key: 'maxDensity' },
        ].forEach(({ el, key }) => {
            el.addEventListener('input', debounce(() => {
                state[key] = el.value.trim();
                state.page = 1;
                fetchAndRenderAlerts();
            }, 300));
        });

        // Density Chip group handler
        densityChipGroup.addEventListener('click', (event) => {
            const chip = event.target.closest('.chip');
            if (!chip) return;

            // Update active chip UI
            densityChipGroup.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
            chip.classList.add('is-active');

            const preset = chip.dataset.preset;
            let needsFetch = true;

            // Reset custom inputs before setting new state
            minDensityFilter.value = '';
            maxDensityFilter.value = '';

            switch (preset) {
                case 'all':
                    state.minDensity = '';
                    state.maxDensity = '';
                    customDensityFilter.style.display = 'none';
                    break;
                case 'caution':
                    state.minDensity = '0.463';  // LOS C (log scaled)
                    state.maxDensity = '1.0';    // LOS E (log scaled)
                    customDensityFilter.style.display = 'none';
                    break;
                case 'danger':
                    state.minDensity = '1.0';    // LOS E (log scaled)
                    state.maxDensity = '';
                    customDensityFilter.style.display = 'none';
                    break;
                case 'custom':
                    state.minDensity = '';
                    state.maxDensity = '';
                    customDensityFilter.style.display = 'flex';
                    needsFetch = false; // Don't fetch until user types
                    break;
            }

            if (needsFetch) {
                state.page = 1;
                fetchAndRenderAlerts();
            }
        });


        // Table sort handler
        document.querySelector('#alertsTable thead').addEventListener('click', (event) => {
            const header = event.target.closest('th');
            if (!header || !header.dataset.sort) return;
            const newSortColumn = header.dataset.sort;
            if (state.sortColumn === newSortColumn) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = newSortColumn;
                state.sortDirection = 'desc';
            }
            state.page = 1;
            fetchAndRenderAlerts();
        });

        // Pagination handler
        paginationContainer.addEventListener('click', (event) => {
            if (event.target.tagName !== 'BUTTON' || event.target.disabled) return;
            const page = Number(event.target.dataset.page);
            if (!Number.isNaN(page) && page !== state.page) {
                state.page = page;
                fetchAndRenderAlerts();
            }
        });

        // --- Modal and Table Row Click Handlers ---
        alertsTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr.clickable-row');
            if (row && row.dataset.logId) {
                openAlertModal(row.dataset.logId);
            }
        });

        modalCloseButton.addEventListener('click', closeAlertModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeAlertModal();
            }
        });
    }

    function initializeDatePicker() {
        flatpickr(dateRangeInput, {
            mode: 'range',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'Y년 m월 d일',
            locale: flatpickr.l10ns.ko,
            onChange: (selectedDates) => {
                if (selectedDates.length === 2) {
                    state.dateRange.start = new Date(selectedDates[0].setHours(0, 0, 0, 0));
                    state.dateRange.end = new Date(selectedDates[1].setHours(23, 59, 59, 999));
                } else {
                    state.dateRange.start = null;
                    state.dateRange.end = null;
                }
                state.page = 1;
                fetchAndRenderAlerts();
            },
        });
    }

    async function fetchAndRenderAlerts() {
        if (state.loading) return;
        state.loading = true;
        renderLoadingRow();

        try {
            const params = new URLSearchParams();
            params.set('page', state.page - 1);
            params.set('size', state.size);
            params.set('sort', `${state.sortColumn},${state.sortDirection}`);
            if (state.level && state.level !== 'all') params.set('level', state.level);
            if (state.cameraId && state.cameraId !== 'all') params.set('cameraId', state.cameraId);
            if (state.search) params.set('search', state.search);
            if (state.dateRange.start) params.set('start', state.dateRange.start.toISOString());
            if (state.dateRange.end) params.set('end', state.dateRange.end.toISOString());
            if (state.minDensity) params.set('minDensity', state.minDensity);
            if (state.maxDensity) params.set('maxDensity', state.maxDensity);

            const response = await fetch(`/api/v1/alerts/history?${params.toString()}`);
            if (!response.ok) throw new Error(`Failed to fetch alerts: ${response.status}`);

            const data = await response.json();
            state.totalPages = data.totalPages ?? 1;
            renderTable(data.content ?? []);
            renderPagination(state.totalPages, (data.page ?? 0) + 1);
        } catch (error) {
            console.error(error);
            renderErrorRow();
        } finally {
            state.loading = false;
        }
    }

    function renderTable(alerts) {
        alertsTableBody.innerHTML = '';
        if (!alerts.length) {
            alertsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">표시할 알림이 없습니다.</td></tr>';
            return;
        }

        alerts.forEach((alert) => {
            const tone = alert.severityTone || LEVEL_CLASS_MAP[alert.severity] || 'info';
            const row = document.createElement('tr');
            row.className = 'clickable-row';
            row.dataset.logId = alert.analysisLogId;

            row.innerHTML = `
                <td>${formatTimestamp(alert.timestamp)}</td>
                <td>${alert.cameraName || '-'}</td>
                <td>${typeof alert.density === 'number' ? alert.density.toFixed(3) : '-'}</td>
                <td>${alert.title || '-'}</td>
                <td>${alert.message || '-'}</td>
                <td><span class="level-chip level-chip--${tone}">${alert.severityLabel || alert.severity || '-'}</span></td>
            `;
            alertsTableBody.appendChild(row);
        });
    }

    // --- Modal Functions ---

    async function openAlertModal(logId) {
        modal.style.display = 'flex';
        modalLoading.style.display = 'block';

        // Reset content
        modalTimestamp.textContent = '데이터 로딩 중...';
        modalRawImage.src = '';
        modalAnnotatedImage.src = '';
        modalDensity.textContent = '-';
        modalPersonCount.textContent = '-';
        modalVelocity.textContent = '-';
        modalAcceleration.textContent = '-';

        try {
            const response = await fetch(`/api/v1/analysis-logs/${logId}/details`);
            if (!response.ok) throw new Error(`Failed to fetch alert details: ${response.status}`);
            const data = await response.json();
            populateModal(data);
        } catch (error) {
            console.error(error);
            modalTimestamp.textContent = '오류 발생';
        } finally {
            modalLoading.style.display = 'none';
        }
    }

    function populateModal(data) {
        modalTimestamp.textContent = formatTimestamp(data.timestamp, true);
        modalRawImage.src = data.rawImagePath || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        modalAnnotatedImage.src = data.annotatedImagePath || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        modalDensity.textContent = data.density?.toFixed(3) ?? '-';
        modalPersonCount.textContent = data.personCount !== undefined ? `${data.personCount}명` : '-';
        modalVelocity.textContent = data.densityVelocity?.toFixed(3) ?? '-';
        modalAcceleration.textContent = data.densityAcceleration?.toFixed(3) ?? '-';
        renderDensityChart(data.surroundingHistory, data.timestamp);
    }

    function renderDensityChart(history, highlightTimestamp) {
        if (densityChart) {
            densityChart.destroy();
        }
        const ctx = modalChartCanvas.getContext('2d');
        const labels = history.map(p => new Date(p.timestamp));
        const dataPoints = history.map(p => p.density);

        const highlightIndex = history.findIndex(p => p.timestamp === highlightTimestamp);

        densityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '밀집도',
                    data: dataPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: (context) => (context.dataIndex === highlightIndex ? 6 : 3),
                    pointBackgroundColor: (context) => (context.dataIndex === highlightIndex ? '#ef4444' : '#3b82f6'),
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'minute',
                            tooltipFormat: 'HH:mm:ss',
                            displayFormats: {
                                minute: 'HH:mm'
                            }
                        },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: 1.0
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    function closeAlertModal() {
        modal.style.display = 'none';
    }

    // --- Utility Functions ---

    function renderPagination(totalPages, currentPageFromServer) {
        paginationContainer.innerHTML = '';
        const total = Math.max(totalPages, 1);
        const current = Math.min(Math.max(currentPageFromServer, 1), total);
        state.page = current;

        if (total <= 1) return;

        const createButton = (label, page, disabled = false, active = false) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.dataset.page = page;
            button.disabled = disabled;
            if (active) button.classList.add('is-active');
            return button;
        };

        const createEllipsis = () => {
            const span = document.createElement('span');
            span.className = 'pagination-ellipsis';
            span.textContent = '...';
            return span;
        };

        paginationContainer.appendChild(createButton('이전', current - 1, current === 1));

        const windowSize = 2; // 현재 페이지 기준 앞/뒤로 2개씩 표시
        const pages = new Set();

        // 항상 첫 페이지와 마지막 페이지 추가
        pages.add(1);
        pages.add(total);

        // 현재 페이지 주변 페이지 추가
        for (let i = 0; i <= windowSize; i++) {
            pages.add(Math.max(1, current - i));
            pages.add(Math.min(total, current + i));
        }

        const sortedPages = Array.from(pages).sort((a, b) => a - b);
        let lastPage = 0;

        sortedPages.forEach(page => {
            if (lastPage !== 0 && page > lastPage + 1) {
                paginationContainer.appendChild(createEllipsis());
            }
            paginationContainer.appendChild(createButton(String(page), page, false, page === current));
            lastPage = page;
        });


        paginationContainer.appendChild(createButton('다음', current + 1, current === total));
    }

    function renderLoadingRow() {
        alertsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">데이터를 불러오는 중...</td></tr>';
    }

    function renderErrorRow() {
        alertsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#b91c1c;">알림 데이터를 불러오는 중 오류가 발생했습니다.</td></tr>';
    }
});

function formatTimestamp(value, withSeconds = false) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const options = { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    if (withSeconds) {
        options.second = '2-digit';
    }
    return date.toLocaleString('ko-KR', options);
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

