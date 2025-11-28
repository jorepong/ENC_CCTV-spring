/**
 * debug-density.js
 * 밀집도 로직 검증 디버그 페이지 스크립트
 */

async function verifyDensity() {
    const cameraSelect = document.getElementById('camera-select');
    const personCountInput = document.getElementById('person-count-input');
    const verifyBtn = document.getElementById('verify-btn');

    const cameraId = cameraSelect.value;
    const targetPersonCount = parseInt(personCountInput.value, 10);

    // 유효성 검증
    if (!cameraId) {
        alert('카메라를 선택해주세요.');
        cameraSelect.focus();
        return;
    }

    if (!targetPersonCount || targetPersonCount < 1 || targetPersonCount > 1000) {
        alert('인원 수는 1~1000 사이의 값이어야 합니다.');
        personCountInput.focus();
        return;
    }

    // UI 상태 변경
    showLoading(true);
    verifyBtn.disabled = true;
    hideResults();

    try {
        // Django API 호출
        const response = await fetch(`/api/v1/density-verification/${cameraId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                target_person_count: targetPersonCount
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '서버 오류가 발생했습니다.');
        }

        // 응답 상태에 따라 결과 표시
        if (data.status === 'SUCCESS') {
            displaySuccessResult(data);
        } else if (data.status === 'ERROR') {
            displayErrorResult(data);
        } else {
            throw new Error('알 수 없는 응답 형식입니다.');
        }

    } catch (error) {
        console.error('밀집도 검증 실패:', error);
        displayErrorResult({
            status: 'ERROR',
            message: error.message || '요청 처리 중 오류가 발생했습니다.',
            invalid_coordinate: null
        });
    } finally {
        showLoading(false);
        verifyBtn.disabled = false;
    }
}

function displaySuccessResult(data) {
    const resultSection = document.getElementById('result-section');
    const successResult = document.getElementById('success-result');
    const errorResult = document.getElementById('error-result');

    // 성공 결과 표시
    successResult.style.display = 'block';
    errorResult.style.display = 'none';
    resultSection.style.display = 'block';

    // 데이터 채우기
    document.getElementById('result-camera-id').textContent = data.camera_id || '-';
    document.getElementById('result-person-count').textContent = data.target_person_count || '-';
    document.getElementById('result-density').textContent =
        data.density !== undefined ? data.density.toFixed(4) : '-';
    document.getElementById('result-capacity').textContent =
        data.roi_capacity !== undefined ? data.roi_capacity.toFixed(2) : '-';
    document.getElementById('result-generated-points').textContent = data.generated_points_count || '-';
    document.getElementById('result-status').textContent = 'SUCCESS';
    document.getElementById('result-message-text').textContent = data.message || '검증이 성공적으로 완료되었습니다.';

    // 밀집도에 따른 색상 변경
    const densityEl = document.getElementById('result-density');
    const density = parseFloat(data.density);
    densityEl.classList.remove('metric-value--danger', 'metric-value--warning', 'metric-value--success');

    if (density >= 1.0) {  // LOS E (log scaled)
        densityEl.classList.add('metric-value--danger');
    } else if (density >= 0.463) {  // LOS C (log scaled)
        densityEl.classList.add('metric-value--warning');
    } else {
        densityEl.classList.add('metric-value--success');
    }

    // 스크롤 이동
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function displayErrorResult(data) {
    const resultSection = document.getElementById('result-section');
    const successResult = document.getElementById('success-result');
    const errorResult = document.getElementById('error-result');
    const errorDetails = document.getElementById('error-details');

    // 에러 결과 표시
    successResult.style.display = 'none';
    errorResult.style.display = 'block';
    resultSection.style.display = 'block';

    // 에러 메시지 설정
    document.getElementById('error-message-text').textContent =
        data.message || '검증 중 오류가 발생했습니다.';

    // 잘못된 좌표 정보가 있는 경우 표시
    if (data.invalid_coordinate) {
        errorDetails.style.display = 'block';
        document.getElementById('error-coord-x').textContent = data.invalid_coordinate.x || '-';
        document.getElementById('error-coord-y').textContent = data.invalid_coordinate.y || '-';
        document.getElementById('error-coord-value').textContent =
            data.invalid_coordinate.value !== undefined ? data.invalid_coordinate.value.toFixed(6) : '-';
    } else {
        errorDetails.style.display = 'none';
    }

    // 스크롤 이동
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResults() {
    const resultSection = document.getElementById('result-section');
    resultSection.style.display = 'none';
}

function showLoading(show) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// 폼 초기화 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('verification-form');
    if (form) {
        form.addEventListener('reset', () => {
            hideResults();
        });
    }

    // 엔터키로 검증 실행
    const personCountInput = document.getElementById('person-count-input');
    if (personCountInput) {
        personCountInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyDensity();
            }
        });
    }
});
