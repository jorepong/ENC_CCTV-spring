document.addEventListener('DOMContentLoaded', () => {
    const gridEl = document.querySelector('[data-selected-camera-id]');
    if (!gridEl) {
        console.log('No selected camera found on this page. Analysis scripts will not run.');
        return;
    }

    const cameraId = gridEl.dataset.selectedCameraId;

    // --- Element Selectors ---
    const chartCanvas = document.getElementById('interactiveTimeSeriesChart');
    const chartPlaceholder = document.getElementById('analysisChartPlaceholder');
    const periodControls = document.querySelector('.interactive-chart-controls .control-buttons');
    const compareControls = document.getElementById('compare-buttons-container');
    const heatmapContainer = document.getElementById('congestion-heatmap');
    const alertTableBody = document.querySelector('#alertTable tbody');
    const anomalyStatusEl = document.getElementById('anomalyStatus');
    const anomalyGraphEl = document.querySelector('.anomaly-graph');
    const anomalyRangeEl = document.getElementById('anomalyRange');
    const anomalyValueEl = document.getElementById('anomalyValue');
    const anomalyInfoEl = document.getElementById('anomalyInfo');
    const anomalyDeviationEl = document.getElementById('anomalyDeviation');


    // --- State ---
    let trendChart = null;
    let activePeriod = '2h';
    let activeCompare = null;
    let tooltipPinned = false;  // 툴팁 고정 상태

    // --- Helper ---
    const toISOStringWithTimezone = (date) => {
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    // --- Chart Functions ---
    const fetchDataForPeriod = async (start, end) => {
        const url = `/api/v1/cameras/${cameraId}/density-history?start=${toISOStringWithTimezone(start)}&end=${toISOStringWithTimezone(end)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
        return response.json();
    };

    const updateChart = async () => {
        if (!chartCanvas || !periodControls || !compareControls) return;
        chartPlaceholder.textContent = '분석 데이터를 불러오는 중입니다...';
        chartPlaceholder.hidden = false;
        chartCanvas.style.display = 'none';

        const now = new Date();
        let primaryStart, primaryEnd;
        let periodLabel = "현재";

        // 1. Calculate Primary Range (Using Timestamps for precision)
        primaryEnd = now;
        if (activePeriod === '24h') {
            primaryStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            periodLabel = "오늘";
        } else if (activePeriod === '7d') {
            primaryStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            periodLabel = "이번 주";
        } else {
            // Default 2h
            primaryStart = new Date(now.getTime() - (2 * 60 * 60 * 1000));
        }

        const promises = [fetchDataForPeriod(primaryStart, primaryEnd)];
        let compareLabel = null;

        // 2. Calculate Compare Range
        if (activeCompare) {
            let compareStart, compareEnd;
            if (activeCompare === 'yesterday') {
                // Compare with same window yesterday (minus 24h)
                compareStart = new Date(primaryStart.getTime() - (24 * 60 * 60 * 1000));
                compareEnd = new Date(primaryEnd.getTime() - (24 * 60 * 60 * 1000));
                compareLabel = "어제";
            } else if (activeCompare === 'lastWeek') {
                // Compare with same window last week (minus 7d)
                compareStart = new Date(primaryStart.getTime() - (7 * 24 * 60 * 60 * 1000));
                compareEnd = new Date(primaryEnd.getTime() - (7 * 24 * 60 * 60 * 1000));
                compareLabel = "지난 주";
            }
            promises.push(fetchDataForPeriod(compareStart, compareEnd));
        }

        try {
            const [primaryData, compareData] = await Promise.all(promises);
            if (!primaryData || primaryData.length === 0) {
                chartPlaceholder.textContent = '해당 기간에 대한 분석 데이터가 없습니다.';
                return;
            }

            // 3. Resample Data to align X-axis
            // Determine interval: 1h for 7d, 5min for 24h, 5min for 2h
            let intervalMs;
            if (activePeriod === '7d') intervalMs = 60 * 60 * 1000;
            else if (activePeriod === '24h') intervalMs = 5 * 60 * 1000;
            else intervalMs = 5 * 60 * 1000;

            const resampledPrimary = resampleData(primaryData, primaryStart, primaryEnd, intervalMs);

            // Extract arrays for chart
            const primaryAvg = resampledPrimary.map(d => d ? d.avg : null);
            const primaryMin = resampledPrimary.map(d => d ? d.min : null);
            const primaryMax = resampledPrimary.map(d => d ? d.max : null);

            let resampledCompare = null;
            let compareAvg = null;

            if (compareData && compareData.length > 0) {
                // Shift compare data timestamps to match primary range
                const timeOffset = activeCompare === 'yesterday'
                    ? 24 * 60 * 60 * 1000
                    : 7 * 24 * 60 * 60 * 1000;

                const shiftedCompareData = compareData.map(point => ({
                    ...point,
                    timestamp: new Date(new Date(point.timestamp).getTime() + timeOffset).toISOString()
                }));

                resampledCompare = resampleData(shiftedCompareData, primaryStart, primaryEnd, intervalMs);
                compareAvg = resampledCompare.map(d => d ? d.avg : null);
            }

            // Generate labels from the time buckets
            const labels = generateTimeLabels(primaryStart, primaryEnd, intervalMs);

            const datasets = [
                // 1. Range Min (Visible line for lower bound)
                {
                    label: 'Range Min',
                    data: primaryMin,
                    borderColor: 'rgba(37, 99, 235, 0.3)', // Light blue border
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                },
                // 2. Range Max (Visible line for upper bound + Fill to Min)
                {
                    label: '변동 범위',
                    data: primaryMax,
                    borderColor: 'rgba(37, 99, 235, 0.3)', // Light blue border
                    borderWidth: 1,
                    backgroundColor: 'rgba(37, 99, 235, 0.25)', // Darker shading
                    pointRadius: 0,
                    fill: '-1', // Fill to previous dataset (Range Min)
                    tension: 0.1,
                    order: 3
                },
                // 3. Average (Main Line - Stronger color)
                {
                    label: periodLabel,
                    data: primaryAvg,
                    borderColor: '#1d4ed8', // Darker blue for contrast
                    backgroundColor: 'transparent',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2.5, // Slightly thicker
                    order: 1
                }
            ];

            if (compareAvg) {
                datasets.push({
                    label: compareLabel,
                    data: compareAvg,
                    borderColor: '#94a3b8',
                    backgroundColor: 'transparent',
                    tension: 0.1,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    borderWidth: 2,
                    order: 2
                });
            }

            renderChart(labels, datasets, resampledPrimary, compareAvg);
            chartPlaceholder.hidden = true;
            chartCanvas.style.display = 'block';
        } catch (error) {
            console.error('Failed to fetch or render chart:', error);
            chartPlaceholder.textContent = '차트 데이터를 불러오는 데 실패했습니다.';
        }
    };

    const updateControlStates = () => {
        const btnYesterday = compareControls.querySelector('[data-compare="yesterday"]');
        const btn7d = periodControls.querySelector('[data-period="7d"]');

        if (btnYesterday && btn7d) {
            if (activeCompare === 'yesterday') {
                btn7d.disabled = true;
                btn7d.classList.add('is-disabled');
            } else {
                btn7d.disabled = false;
                btn7d.classList.remove('is-disabled');
            }

            if (activePeriod === '7d') {
                btnYesterday.disabled = true;
                btnYesterday.classList.add('is-disabled');
            } else {
                btnYesterday.disabled = false;
                btnYesterday.classList.remove('is-disabled');
            }
        }
    };

    // Resample data into fixed time buckets
    const resampleData = (data, startTime, endTime, intervalMs) => {
        const start = startTime.getTime();
        const end = endTime.getTime();
        const bucketCount = Math.ceil((end - start) / intervalMs);
        const buckets = new Array(bucketCount).fill(null).map(() => ({
            sum: 0,
            count: 0,
            min: Infinity,
            max: -Infinity,
            maxLog: null // Store the log with max density
        }));

        data.forEach(point => {
            const time = new Date(point.timestamp).getTime();
            if (time >= start && time < end) {
                const bucketIndex = Math.floor((time - start) / intervalMs);
                if (bucketIndex >= 0 && bucketIndex < bucketCount) {
                    buckets[bucketIndex].sum += point.density;
                    buckets[bucketIndex].count++;
                    buckets[bucketIndex].min = Math.min(buckets[bucketIndex].min, point.density);

                    if (point.density > buckets[bucketIndex].max) {
                        buckets[bucketIndex].max = point.density;
                        buckets[bucketIndex].maxLog = point;
                    }
                }
            }
        });

        return buckets.map(b => {
            if (b.count > 0) {
                return {
                    avg: b.sum / b.count,
                    min: b.min,
                    max: b.max,
                    maxLog: b.maxLog
                };
            }
            return null;
        });
    };

    const generateTimeLabels = (startTime, endTime, intervalMs) => {
        const labels = [];
        const start = startTime.getTime();
        const end = endTime.getTime();
        for (let time = start; time < end; time += intervalMs) {
            const date = new Date(time);
            const day = date.getDate();
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            labels.push(`${day}일 ${hour}:${minute}`);
        }
        return labels;
    };

    const getOrCreateTooltip = (chart) => {
        let tooltipEl = chart.canvas.parentNode.querySelector('div.chart-tooltip');

        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.classList.add('chart-tooltip');
            tooltipEl.style.opacity = 1;
            tooltipEl.style.pointerEvents = 'none';  // 기본적으로 비활성화
            tooltipEl.style.position = 'absolute';
            tooltipEl.style.transform = 'translate(-50%, 0)';
            tooltipEl.style.transition = 'all .1s ease';

            chart.canvas.parentNode.appendChild(tooltipEl);
        }

        return tooltipEl;
    };

    const externalTooltipHandler = (context) => {
        // Tooltip Element
        const { chart, tooltip } = context;
        const tooltipEl = getOrCreateTooltip(chart);

        // Hide if no tooltip
        if (tooltip.opacity === 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        // Set Text
        if (tooltip.body) {
            const dataIndex = tooltip.dataPoints[0].dataIndex;
            const datasetIndex = tooltip.dataPoints[0].datasetIndex;

            // We only care about the main dataset (index 2) for detailed info
            // But we might be hovering over other datasets.
            // Let's try to find the primary data point for this index.

            // Access the raw data object attached to the chart instance or passed in closure
            // Since we can't easily access 'primaryDataObj' from here without closure, 
            // we rely on the fact that renderChart creates this handler.
            // Wait, renderChart defines this handler? No, we need to define it inside renderChart 
            // or pass data to it.
            // Let's define the handler logic *inside* the config to access 'primaryDataObj'.
        }
    };

    const renderChart = (labels, datasets, primaryDataObj, compareData) => {
        if (trendChart) trendChart.destroy();

        // Calculate max value for scaling, considering the max range
        const primaryMaxValues = primaryDataObj.map(d => d ? d.max : -Infinity);
        const allValues = [...primaryMaxValues, ...(compareData || [])].filter(v => v !== null && v !== -Infinity);
        const dataMax = allValues.length > 0 ? Math.max(...allValues) : 0;
        const suggestedCeiling = Math.max(dataMax * 1.2, 0.5);

        trendChart = new Chart(chartCanvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            filter: function (item, chart) {
                                return item.text !== 'Range Min';
                            }
                        }
                    },
                    tooltip: {
                        enabled: false, // Disable native tooltip
                        external: function (context) {
                            // Tooltip Element
                            const { chart, tooltip } = context;
                            const tooltipEl = getOrCreateTooltip(chart);

                            // 고정 모드일 때는 마우스 아웃 시에도 툴팁 유지
                            if (tooltipPinned) {
                                tooltipEl.style.pointerEvents = 'auto';  // 마우스 인터랙션 허용
                                tooltipEl.style.border = '2px solid #3b82f6';  // 파란색 테두리로 고정 상태 표시
                                tooltipEl.style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.3)';
                                return;  // 툴팁 위치 업데이트 안 함
                            }

                            // 일반 모드: 마우스 아웃 시 숨김
                            if (tooltip.opacity === 0) {
                                tooltipEl.style.opacity = 0;
                                tooltipEl.style.pointerEvents = 'none';
                                tooltipEl.style.border = '';
                                tooltipEl.style.boxShadow = '';
                                return;
                            }

                            // Set Text
                            if (tooltip.body) {
                                const dataIndex = tooltip.dataPoints[0].dataIndex;
                                const rawPoint = primaryDataObj[dataIndex];

                                if (!rawPoint) return;

                                const dateStr = labels[dataIndex];
                                const avg = rawPoint.avg.toFixed(3);
                                const max = rawPoint.max.toFixed(3);
                                const min = rawPoint.min.toFixed(3);

                                let content = `
                                    <div class="chart-tooltip__header">${dateStr}</div>
                                `;

                                // Add Snapshot Image if available
                                if (rawPoint.maxLog && rawPoint.maxLog.annotatedImagePath) {
                                    const imagePath = `/media/${rawPoint.maxLog.annotatedImagePath.replace(/\\/g, '/')}`;
                                    content += `<img src="${imagePath}" class="chart-tooltip__image" alt="Snapshot">`;
                                }

                                // Metrics
                                content += `
                                    <div class="chart-tooltip__row">
                                        <span class="chart-tooltip__label">최대 밀집도</span>
                                        <span class="chart-tooltip__value chart-tooltip__value--highlight">${max}</span>
                                    </div>
                                    <div class="chart-tooltip__row">
                                        <span class="chart-tooltip__label">평균 밀집도</span>
                                        <span class="chart-tooltip__value">${avg}</span>
                                    </div>
                                    <div class="chart-tooltip__row">
                                        <span class="chart-tooltip__label">최소 밀집도</span>
                                        <span class="chart-tooltip__value">${min}</span>
                                    </div>
                                `;

                                // Person Count & ROI Capacity
                                if (rawPoint.maxLog && rawPoint.maxLog.personCount !== undefined) {
                                    const personCount = rawPoint.maxLog.personCount;

                                    content += `
                                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                                            <div class="chart-tooltip__row">
                                                <span class="chart-tooltip__label">최대 인원</span>
                                                <span class="chart-tooltip__value">${personCount}명</span>
                                            </div>
                                        </div>
                                    `;
                                }

                                tooltipEl.innerHTML = content;
                            }

                            const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;

                            // Display, position, and set styles for font
                            tooltipEl.style.opacity = 1;
                            tooltipEl.style.left = positionX + tooltip.caretX + 'px';
                            tooltipEl.style.top = positionY + tooltip.caretY + 'px';
                            tooltipEl.style.font = tooltip.options.bodyFont.string;
                            tooltipEl.style.padding = tooltip.options.padding + 'px ' + tooltip.options.padding + 'px';
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, suggestedMax: suggestedCeiling },
                    x: { ticks: { autoSkip: true, maxTicksLimit: 10 } }
                }
            }
        });
    };

    // --- Heatmap Functions ---
    const createTooltip = () => {
        const tooltip = document.createElement('div');
        tooltip.className = 'heatmap-tooltip';
        const analysisPage = document.querySelector('.analysis-page');
        if (analysisPage) {
            analysisPage.appendChild(tooltip);
        } else {
            document.body.appendChild(tooltip);  // Fallback
        }
        return tooltip;
    };

    const tooltip = createTooltip();

    const getColorForDensity = (density) => {
        if (density <= 0) return '#ebedf0';
        const maxDensity = 1.2;  // 0~1 범위를 충분히 커버
        const normalized = Math.min(density, maxDensity) / maxDensity;

        // 구간별 색상 매핑: 파랑-청록 구간 확대, 녹색 축소, 노랑-빨강 구간 확대
        let hue;
        if (normalized < 0.4) {
            // 0~0.4: 파랑-청록(210°) -> 초록(110°), 낮은 구간에서 다채로운 변화
            const t = normalized / 0.4;
            const enhanced = t * t * (3 - 2 * t);  // S-커브
            hue = 210 - (enhanced * 100);  // 210° -> 110°
        } else {
            // 0.4~1.0: 초록(110°) -> 빨강(0°), 노랑-주황-빨강 구간을 넓게
            const t = (normalized - 0.4) / 0.6;
            hue = 110 - (t * 110);  // 110° -> 0° (선형)
        }

        let saturation = 60 + (normalized * 35);          // 60% -> 95%
        const lightness = 70 - (normalized * 35);         // 70% -> 35%

        // 녹색 구간 (100°~150°)에서 채도 낮춰서 덜 쨍하게
        if (hue >= 100 && hue <= 150) {
            saturation = saturation * 0.65;  // 채도 35% 감소
        }

        return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${lightness}%)`;
    };

    const fetchAndRenderHeatmap = async () => {
        if (!heatmapContainer) return;
        const url = `/api/v1/cameras/${cameraId}/congestion-heatmap`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const data = await response.json();
            if (data) {
                data.forEach(dayData => {
                    dayData.hourlyMaxDensities.forEach((maxDensity, hour) => {
                        const avgDensity = dayData.hourlyAverageDensities[hour];
                        const cell = heatmapContainer.querySelector(`[data-day="${dayData.dayOfWeekIndex}"][data-hour="${hour}"]`);
                        if (cell) {
                            // Use MAX density for color
                            cell.style.backgroundColor = getColorForDensity(maxDensity);
                            // Show both MAX and AVG in tooltip
                            cell.dataset.tooltipContent = `${dayData.dayOfWeek}요일 ${hour}시\n최대: ${maxDensity.toFixed(3)}\n평균: ${avgDensity.toFixed(3)}`;
                        }
                    });
                });
            }

            // Forcefully remove any lingering title attributes to prevent native tooltips
            heatmapContainer.querySelectorAll('.cal-cell').forEach(cell => {
                cell.removeAttribute('title');
            });

        } catch (error) {
            console.error('Failed to fetch or render heatmap:', error);
        }
    };

    const setupHeatmapEventListeners = () => {
        if (!heatmapContainer) return;

        heatmapContainer.addEventListener('mouseover', (event) => {
            const cell = event.target.closest('[data-tooltip-content]');
            if (cell) {
                tooltip.textContent = cell.dataset.tooltipContent;
                tooltip.style.display = 'block';
            }
        });

        heatmapContainer.addEventListener('mouseout', (event) => {
            const cell = event.target.closest('[data-tooltip-content]');
            if (cell) {
                tooltip.style.display = 'none';
            }
        });

        heatmapContainer.addEventListener('mousemove', (event) => {
            if (tooltip.style.display === 'block') {
                // Position the tooltip near the cursor
                tooltip.style.left = `${event.clientX + 15}px`;
                tooltip.style.top = `${event.clientY}px`;
            }
        });
    };

    // --- Alerts Functions ---
    const fetchAndRenderAlerts = async () => {
        if (!alertTableBody) return;
        const url = `/api/v1/cameras/${cameraId}/alerts?limit=10`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const alerts = await response.json();
            alertTableBody.innerHTML = '';
            if (!alerts || alerts.length === 0) {
                alertTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">표시할 경보가 없습니다.</td></tr>`;
                return;
            }
            alerts.forEach(alert => {
                const row = document.createElement('tr');
                row.classList.add(`alert-row--${alert.severity}`);
                row.innerHTML = `<td>${new Date(alert.timestamp).toLocaleTimeString('ko-KR')}</td><td>${alert.title}</td><td>${alert.message}</td>`;
                alertTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Failed to fetch or render alerts:', error);
            alertTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--risk);">알림을 불러오는 데 실패했습니다.</td></tr>`;
        }
    };

    // --- Statistical Anomaly Functions ---
    const fetchAndRenderStatisticalAnomaly = async () => {
        const elements = [anomalyStatusEl, anomalyGraphEl, anomalyRangeEl, anomalyValueEl, anomalyInfoEl, anomalyDeviationEl];
        if (elements.some(el => !el)) return;

        const url = `/api/v1/cameras/${cameraId}/statistical-anomaly`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const data = await response.json();

            anomalyStatusEl.textContent = data.message;
            if (!data.isAnalyzable) {
                anomalyGraphEl.style.display = 'none';
                anomalyInfoEl.textContent = data.message;
                anomalyDeviationEl.textContent = `현재 밀집도: ${data.currentDensity ? data.currentDensity.toFixed(3) : '--'}`;
                anomalyStatusEl.className = 'chip chip--neutral';
                return;
            }

            anomalyGraphEl.style.display = 'block';
            const { currentDensity, averageDensity, stdDeviation, zScore } = data;

            // Visualization logic
            const graphMin = Math.max(0, averageDensity - 3 * stdDeviation);
            const graphMax = averageDensity + 3 * stdDeviation;
            const graphRange = graphMax - graphMin;

            if (graphRange > 0) {
                const rangeLeft = ((averageDensity - stdDeviation - graphMin) / graphRange) * 100;
                const rangeWidth = ((2 * stdDeviation) / graphRange) * 100;
                const valueLeft = ((currentDensity - graphMin) / graphRange) * 100;

                anomalyRangeEl.style.left = `${Math.max(0, rangeLeft)}%`;
                anomalyRangeEl.style.width = `${Math.min(100, rangeWidth)}%`;
                anomalyValueEl.style.left = `clamp(0%, ${valueLeft}%, 100%)`;
            }

            // Update text
            anomalyInfoEl.innerHTML = `현재 값 <strong>${currentDensity.toFixed(3)}</strong> (정상 범위: ${(averageDensity - stdDeviation).toFixed(2)} ~ ${(averageDensity + stdDeviation).toFixed(2)})`;
            anomalyDeviationEl.textContent = `평균(${averageDensity.toFixed(2)})으로부터 ${zScore.toFixed(1)} 표준편차`;

            // Update status chip color
            if (zScore > 2.5) anomalyStatusEl.className = 'chip chip--danger';
            else if (zScore > 1.5) anomalyStatusEl.className = 'chip chip--warning';
            else anomalyStatusEl.className = 'chip chip--neutral';
            anomalyValueEl.classList.toggle('is-anomaly', zScore > 1.5);

        } catch (error) {
            console.error('Failed to fetch or render statistical anomaly:', error);
            anomalyStatusEl.textContent = '오류';
            anomalyInfoEl.textContent = '데이터를 불러오는 데 실패했습니다.';
            anomalyDeviationEl.textContent = '';
        }

    };

    // --- Comparison Functions ---
    const fetchAndRenderComparison = async () => {
        const container = document.getElementById('comparison-container');
        if (!container) return;

        const formatDelta = (change) => {
            if (change === null || change === undefined) return '<span class="delta-badge flat">-</span>';
            const percent = (change * 100).toFixed(1);
            if (change > 0.001) return `<span class="delta-badge up">▲ ${percent}%</span>`;
            if (change < -0.001) return `<span class="delta-badge down">▼ ${Math.abs(percent)}%</span>`;
            return `<span class="delta-badge flat">- 0%</span>`;
        };

        const url = `/api/v1/cameras/${cameraId}/comparison-summary`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // If API is not implemented or fails, throw to catch block
                throw new Error(`Server responded with status ${response.status}`);
            }
            const data = await response.json();

            // Validate data structure
            if (!data || typeof data.yesterdayDensity === 'undefined') {
                throw new Error('Invalid data format');
            }

            container.innerHTML = `
                <div class="status-compare-item">
                    <span class="status-compare-label">전일 동시간 대비</span>
                    <div class="status-compare-value">
                        ${formatDelta(data.yesterdayChange)}
                    </div>
                    <span class="status-compare-sub">어제: ${typeof data.yesterdayDensity === 'number' ? data.yesterdayDensity.toFixed(3) : '--'}</span>
                </div>
                <div class="status-compare-item">
                    <span class="status-compare-label">지난주 동시간 대비</span>
                    <div class="status-compare-value">
                        ${formatDelta(data.lastWeekChange)}
                    </div>
                    <span class="status-compare-sub">지난주: ${typeof data.lastWeekDensity === 'number' ? data.lastWeekDensity.toFixed(3) : '--'}</span>
                </div>
            `;

        } catch (error) {
            // Graceful fallback for missing API or data
            console.warn('Comparison data not available:', error);
            container.innerHTML = `
                <div class="status-compare-item">
                    <span class="status-compare-label">전일 동시간 대비</span>
                    <span class="status-compare-value" style="color: var(--muted); font-size: 13px;">데이터 없음</span>
                </div>
                <div class="status-compare-item">
                    <span class="status-compare-label">지난주 동시간 대비</span>
                    <span class="status-compare-value" style="color: var(--muted); font-size: 13px;">데이터 없음</span>
                </div>
            `;
        }
    };

    // --- Initial Setup ---
    const init = () => {
        if (!cameraId) return;
        updateControlStates();
        updateChart();
        fetchAndRenderHeatmap();
        fetchAndRenderAlerts();
        fetchAndRenderStatisticalAnomaly();
        fetchAndRenderComparison();
        setupHeatmapEventListeners();
    };

    periodControls.addEventListener('click', (event) => {
        const button = event.target.closest('[data-period]');
        if (!button || button.disabled) return;
        activePeriod = button.dataset.period;
        periodControls.querySelectorAll('[data-period]').forEach(btn => btn.classList.remove('is-active'));
        button.classList.add('is-active');
        updateControlStates();
        updateChart();
    });

    compareControls.addEventListener('click', (event) => {
        const button = event.target.closest('[data-compare]');
        if (!button || button.disabled) return;
        const compareValue = button.dataset.compare;
        if (activeCompare === compareValue) {
            activeCompare = null;
            button.classList.remove('is-active');
        } else {
            activeCompare = compareValue;
            compareControls.querySelectorAll('[data-compare]').forEach(btn => btn.classList.remove('is-active'));
            button.classList.add('is-active');
        }
        updateControlStates();
        updateChart();
    });

    // --- Tooltip Pinning Event Listeners ---
    // 차트 클릭으로 툴팁 고정/해제
    if (chartCanvas) {
        chartCanvas.addEventListener('click', (event) => {
            if (!trendChart) return;

            const points = trendChart.getElementsAtEventForMode(event, 'index', { intersect: false }, false);

            if (points.length > 0) {
                tooltipPinned = !tooltipPinned;

                // 고정 상태 변경 시 차트 강제 업데이트하여 툴팁 스타일 적용
                trendChart.update('none');

                // 고정 해제 시 툴팁 숨김
                if (!tooltipPinned) {
                    const tooltipEl = chartCanvas.parentNode.querySelector('div.chart-tooltip');
                    if (tooltipEl) {
                        tooltipEl.style.opacity = 0;
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.border = '';
                        tooltipEl.style.boxShadow = '';
                    }
                }
            } else {
                // 차트 빈 공간 클릭 시 고정 해제
                if (tooltipPinned) {
                    tooltipPinned = false;
                    const tooltipEl = chartCanvas.parentNode.querySelector('div.chart-tooltip');
                    if (tooltipEl) {
                        tooltipEl.style.opacity = 0;
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.border = '';
                        tooltipEl.style.boxShadow = '';
                    }
                }
            }
        });
    }

    // ESC 키로 툴팁 고정 해제
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && tooltipPinned) {
            tooltipPinned = false;
            const tooltipEl = chartCanvas?.parentNode.querySelector('div.chart-tooltip');
            if (tooltipEl) {
                tooltipEl.style.opacity = 0;
                tooltipEl.style.pointerEvents = 'none';
                tooltipEl.style.border = '';
                tooltipEl.style.boxShadow = '';
            }
        }
    });

    // 차트 외부 클릭 시 툴팁 고정 해제
    document.addEventListener('click', (event) => {
        if (!tooltipPinned || !chartCanvas) return;

        const tooltipEl = chartCanvas.parentNode.querySelector('div.chart-tooltip');
        const clickedInsideChart = chartCanvas.contains(event.target);
        const clickedInsideTooltip = tooltipEl && tooltipEl.contains(event.target);

        if (!clickedInsideChart && !clickedInsideTooltip) {
            tooltipPinned = false;
            if (tooltipEl) {
                tooltipEl.style.opacity = 0;
                tooltipEl.style.pointerEvents = 'none';
                tooltipEl.style.border = '';
                tooltipEl.style.boxShadow = '';
            }
        }
    });

    init();
});
