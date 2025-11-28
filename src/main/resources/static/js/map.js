(() => {
    "use strict";

    const LEVEL_META = {
        DANGER: { className: "danger", label: "위험" },
        CAUTION: { className: "caution", label: "주의" },
        FREE: { className: "free", label: "여유" },
        NO_DATA: { className: "no-data", label: "데이터 없음" }
    };
    const FALLBACK_LEVEL = LEVEL_META.NO_DATA;
    const MAP_INIT_MAX_ATTEMPTS = 20;
    const MAP_INIT_RETRY_DELAY = 150;
    const LOCATE_TARGET_ZOOM = 16;

    const rawCameras = Array.isArray(window.safetyCameras) ? window.safetyCameras : [];
    const cameras = rawCameras
        .map(normalizeCamera)
        .filter(camera => Boolean(camera.id));
    const cameraById = new Map(cameras.map(camera => [camera.id, camera]));

    const state = {
        filter: "ALL",
        activeId: null,
        map: null,
        markers: new Map(),
        userMarker: null,
        mapInitAttempts: 0,
        isLocating: false
    };

    const elements = {
        canvas: null,
        hint: null,
        list: null,
        listSummary: null,
        infoPanel: null,
        infoPanelClose: null,
        infoName: null,
        infoLocation: null,
        infoAddress: null,
        infoChip: null,
        infoDensity: null,
        infoUpdated: null,
        infoLatitude: null,
        infoLongitude: null,
        infoLink: null,
        filterButtons: null,
        filterContainer: null,
        locateMeButton: null
    };

    function normalizeCamera(raw) {
        if (!raw) {
            return { id: "" };
        }
        const levelKey = typeof raw.level === "string" && LEVEL_META[raw.level]
            ? raw.level
            : "NO_DATA";
        const meta = LEVEL_META[levelKey] ?? FALLBACK_LEVEL;
        const latitude = toNumber(raw.latitude);
        const longitude = toNumber(raw.longitude);
        const latestDensity = toNumber(raw.latestDensity);
        return {
            id: raw.id != null ? String(raw.id) : "",
            name: (raw.name ?? "").trim() || "이름 미상",
            level: levelKey,
            levelDisplay: (raw.levelLabel ?? "").trim() || meta.label,
            className: meta.className,
            location: (raw.locationZone ?? "").trim(),
            address: (raw.address ?? "").trim(),
            latitude,
            longitude,
            hasCoordinates: Number.isFinite(latitude) && Number.isFinite(longitude),
            latestDensity: Number.isFinite(latestDensity) ? latestDensity : null,
            densityFormatted: (raw.densityFormatted ?? "").trim()
                || (Number.isFinite(latestDensity) ? latestDensity.toFixed(2) : "--"),
            updatedAt: raw.updatedAt || null
        };
    }

    function captureElements() {
        elements.canvas ??= document.getElementById("mapCanvas");
        elements.hint ??= document.querySelector("[data-role=\"map-hint\"]");
        elements.list ??= document.getElementById("cameraList");
        elements.listSummary ??= document.getElementById("listSummary");
        elements.infoPanel ??= document.getElementById("infoPanel");
        elements.infoPanelClose ??= document.getElementById("infoPanelClose");
        elements.infoName ??= document.getElementById("infoPanelName");
        elements.infoLocation ??= document.getElementById("infoPanelLocation");
        elements.infoAddress ??= document.getElementById("infoPanelAddress");
        elements.infoChip ??= document.getElementById("infoPanelChip");
        elements.infoDensity ??= document.getElementById("infoPanelDensity");
        elements.infoUpdated ??= document.getElementById("infoPanelUpdated");
        elements.infoLatitude ??= document.getElementById("infoPanelLatitude");
        elements.infoLongitude ??= document.getElementById("infoPanelLongitude");
        elements.infoLink ??= document.getElementById("infoPanelLink");
        elements.filterButtons ??= document.querySelectorAll(".filter-buttons .filter-btn");
        elements.filterContainer ??= document.querySelector(".filter-buttons");
        elements.locateMeButton ??= document.querySelector("[data-role=\"locate-me\"]");
    }

    function hasMapContext() {
        captureElements();
        return Boolean(elements.canvas);
    }

    function toNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function levelMeta(level) {
        return LEVEL_META[level] ?? FALLBACK_LEVEL;
    }

    function getFilteredCameras(filter = state.filter) {
        return filter === "ALL" ? cameras : cameras.filter(camera => camera.level === filter);
    }

    function formatCoordinate(value, axis) {
        if (!Number.isFinite(value)) {
            return axis === "lat" ? "위도 정보 없음" : "경도 정보 없음";
        }
        return `${axis === "lat" ? "위도" : "경도"} ${value.toFixed(6)}`;
    }

    function formatUpdated(value) {
        if (!value) {
            return "업데이트 정보 없음";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString("ko-KR", { hour12: false });
    }

    function showHint(message, isError = false) {
        captureElements();
        if (!elements.hint) {
            return;
        }
        elements.hint.textContent = message;
        elements.hint.classList.toggle("map-hint--error", isError);
        elements.hint.hidden = false;
    }

    function hideHint() {
        captureElements();
        if (!elements.hint) {
            return;
        }
        elements.hint.hidden = true;
        elements.hint.classList.remove("map-hint--error");
    }

    function getDefaultHintMessage(filteredList = getFilteredCameras()) {
        if (!cameras.length) {
            return "등록된 카메라가 없습니다. 카메라 관리에서 추가해 주세요.";
        }
        if (!filteredList.length) {
            return "선택한 조건에 해당하는 카메라가 없습니다. 다른 필터를 시도해 보세요.";
        }
        return "마커를 클릭하거나 목록에서 카메라를 선택해 주세요.";
    }

    function showDefaultHint(filtered) {
        showHint(getDefaultHintMessage(filtered), false);
    }

    function renderList(filtered) {
        captureElements();
        if (!elements.list) {
            return;
        }
        elements.list.innerHTML = "";
        if (!filtered.length) {
            const empty = document.createElement("li");
            empty.className = "camera-list-empty";
            empty.textContent = state.filter === "ALL"
                ? "등록된 카메라가 없습니다."
                : "선택한 조건에 해당하는 카메라가 없습니다.";
            elements.list.appendChild(empty);
            return;
        }
        filtered.forEach(camera => {
            const meta = levelMeta(camera.level);
            const item = document.createElement("li");
            item.className = "camera-list-item";
            item.dataset.cameraId = camera.id;
            if (camera.id === state.activeId) {
                item.classList.add("is-active");
            }
            if (!camera.hasCoordinates) {
                item.classList.add("camera-list-item--no-coords");
            }

            const statusDot = document.createElement("span");
            statusDot.className = `camera-list-item__status-dot camera-list-item__status-dot--${meta.className}`;

            const info = document.createElement("div");
            info.className = "camera-list-item__info";

            const name = document.createElement("span");
            name.className = "camera-list-item__name";
            name.textContent = camera.name;

            const location = document.createElement("span");
            location.className = "camera-list-item__location";
            if (camera.location) {
                location.textContent = camera.location;
            } else if (camera.address) {
                location.textContent = camera.address;
            } else if (camera.hasCoordinates) {
                location.textContent = "자세한 위치 정보 없음";
                location.classList.add("camera-list-item__location--muted");
            } else {
                location.textContent = "지도에 표시할 수 없습니다 (좌표 미등록)";
                location.classList.add("camera-list-item__location--warning");
            }

            const chip = document.createElement("span");
            chip.className = `chip chip--${meta.className}`;
            chip.textContent = camera.levelDisplay || meta.label;

            info.appendChild(name);
            info.appendChild(location);
            item.appendChild(statusDot);
            item.appendChild(info);
            item.appendChild(chip);
            elements.list.appendChild(item);
        });
    }

    function updateSummary(count) {
        captureElements();
        if (!elements.listSummary) {
            return;
        }
        elements.listSummary.textContent = `총 ${count}대`;
    }

    function updateFilterButtons() {
        captureElements();
        const buttons = Array.from(elements.filterButtons ?? []);
        buttons.forEach(button => {
            button.classList.toggle("is-active", button.dataset.filter === state.filter);
        });
    }

    function highlightActiveListItem(cameraId) {
        captureElements();
        if (!elements.list) {
            return;
        }
        elements.list
            .querySelectorAll(".camera-list-item")
            .forEach(item => {
                item.classList.toggle("is-active", cameraId && item.dataset.cameraId === cameraId);
            });
    }

    function showInfoPanel(camera) {
        captureElements();
        if (!elements.infoPanel) {
            return;
        }
        const meta = levelMeta(camera.level);
        elements.infoName.textContent = camera.name;
        elements.infoLocation.textContent = camera.location || "위치 정보 없음";
        elements.infoAddress.textContent = camera.address || "등록된 주소가 없습니다.";
        elements.infoChip.textContent = camera.levelDisplay || meta.label;
        elements.infoChip.className = `chip chip--${meta.className}`;
        elements.infoDensity.textContent = camera.densityFormatted || "--";
        elements.infoUpdated.textContent = formatUpdated(camera.updatedAt);
        elements.infoLatitude.textContent = formatCoordinate(camera.latitude, "lat");
        elements.infoLongitude.textContent = formatCoordinate(camera.longitude, "lng");
        if (elements.infoLink) {
            elements.infoLink.href = `/analysis?cameraId=${camera.id}`;
        }
        elements.infoPanel.hidden = false;
    }

    function hideInfoPanel() {
        captureElements();
        if (elements.infoPanel) {
            elements.infoPanel.hidden = true;
        }
    }

    function getMarkerIcon(camera, isActive) {
        const meta = levelMeta(camera.level);
        const classes = ["map-marker", `map-marker--${meta.className}`];
        if (isActive) {
            classes.push("is-active");
        }
        return {
            content: `<div class="${classes.join(" ")}"><span class="map-marker__pulse"></span><span class="map-marker__dot"></span></div>`,
            anchor: new naver.maps.Point(18, 36)
        };
    }

    function refreshMarkerIcons() {
        if (!state.map) {
            return;
        }
        state.markers.forEach((marker, cameraId) => {
            const camera = cameraById.get(cameraId);
            if (!camera) {
                return;
            }
            const isActive = state.activeId === cameraId;
            marker.setIcon(getMarkerIcon(camera, isActive));
            marker.setZIndex(isActive ? 1000 : 1);
        });
    }

    function updateMarkersVisibility(filtered) {
        if (!state.map) {
            return;
        }
        const filteredSet = new Set(filtered.map(camera => camera.id));
        state.markers.forEach((marker, cameraId) => {
            marker.setMap(filteredSet.has(cameraId) ? state.map : null);
        });
    }

    function createMarkers(mapInstance, camerasWithCoords) {
        camerasWithCoords.forEach(camera => {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(camera.latitude, camera.longitude),
                map: mapInstance,
                icon: getMarkerIcon(camera, false)
            });
            state.markers.set(camera.id, marker);
            naver.maps.Event.addListener(marker, "click", () => {
                selectCamera(camera.id, { pan: false });
            });
        });
    }

    function fitMapToMarkers(mapInstance, camerasWithCoords) {
        if (!camerasWithCoords.length) {
            return;
        }
        if (camerasWithCoords.length === 1) {
            const camera = camerasWithCoords[0];
            mapInstance.setCenter(new naver.maps.LatLng(camera.latitude, camera.longitude));
            mapInstance.setZoom(16);
            return;
        }
        const bounds = camerasWithCoords.reduce((acc, camera) => {
            const position = new naver.maps.LatLng(camera.latitude, camera.longitude);
            if (!acc) {
                return new naver.maps.LatLngBounds(position, position);
            }
            acc.extend(position);
            return acc;
        }, null);
        if (bounds) {
            mapInstance.fitBounds(bounds);
        }
    }

    function selectCamera(cameraId, { pan = false } = {}) {
        const camera = cameraById.get(cameraId);
        if (!camera) {
            return;
        }
        state.activeId = cameraId;
        highlightActiveListItem(cameraId);
        showInfoPanel(camera);
        refreshMarkerIcons();
        if (pan && camera.hasCoordinates) {
            panToCamera(cameraId);
        }
        hideHint();
    }

    function clearActiveCamera() {
        state.activeId = null;
        hideInfoPanel();
        highlightActiveListItem(null);
        refreshMarkerIcons();
        showDefaultHint();
    }

    function panToCamera(cameraId) {
        const camera = cameraById.get(cameraId);
        if (!camera || !state.map || !camera.hasCoordinates) {
            return;
        }
        state.map.panTo(new naver.maps.LatLng(camera.latitude, camera.longitude));
        state.map.setZoom(LOCATE_TARGET_ZOOM);
    }

    function applyFilter(filter) {
        state.filter = filter;
        updateFilterButtons();
        const filtered = getFilteredCameras(filter);
        renderList(filtered);
        updateSummary(filtered.length);
        updateMarkersVisibility(filtered);
        if (state.activeId && !filtered.some(camera => camera.id === state.activeId)) {
            clearActiveCamera();
        } else if (!state.activeId) {
            showDefaultHint(filtered);
        }
    }

    function bindFilterEvents() {
        captureElements();
        const container = elements.filterContainer;
        if (!container) {
            return;
        }
        container.addEventListener("click", event => {
            const button = event.target.closest(".filter-btn");
            if (!button) {
                return;
            }
            const { filter } = button.dataset;
            if (filter && filter !== state.filter) {
                applyFilter(filter);
            }
        });
    }

    function bindListEvents() {
        captureElements();
        if (!elements.list) {
            return;
        }
        elements.list.addEventListener("click", event => {
            const item = event.target.closest(".camera-list-item");
            if (!item) {
                return;
            }
            const { cameraId } = item.dataset;
            if (cameraId) {
                selectCamera(cameraId, { pan: true });
            }
        });
    }

    function bindInfoPanelEvents() {
        captureElements();
        if (!elements.infoPanelClose) {
            return;
        }
        elements.infoPanelClose.addEventListener("click", () => {
            clearActiveCamera();
        });
    }

    function bindLocateMe() {
        captureElements();
        const button = elements.locateMeButton;
        if (!button || button.dataset.bound === "true") {
            return;
        }
        if (!navigator.geolocation) {
            button.disabled = true;
            return;
        }
        button.addEventListener("click", () => {
            if (state.isLocating) {
                return;
            }
            state.isLocating = true;
            button.classList.add("is-busy");
            button.setAttribute("aria-busy", "true");
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    state.isLocating = false;
                    button.classList.remove("is-busy");
                    button.removeAttribute("aria-busy");
                    placeUserMarker(position.coords.latitude, position.coords.longitude);
                },
                () => {
                    state.isLocating = false;
                    button.classList.remove("is-busy");
                    button.removeAttribute("aria-busy");
                    showHint("현재 위치를 확인할 수 없습니다.", true);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 10000,
                    timeout: 10000
                }
            );
        });
        button.dataset.bound = "true";
    }

    function placeUserMarker(lat, lng) {
        if (!state.map || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return;
        }
        if (state.userMarker) {
            state.userMarker.setMap(null);
        }
        state.userMarker = new naver.maps.Marker({
            position: new naver.maps.LatLng(lat, lng),
            map: state.map,
            icon: {
                content: "<div class=\"map-user-marker\"><span class=\"map-user-marker__pulse\"></span><span class=\"map-user-marker__dot\"></span></div>",
                anchor: new naver.maps.Point(12, 12)
            }
        });
        state.map.panTo(new naver.maps.LatLng(lat, lng));
        state.map.setZoom(LOCATE_TARGET_ZOOM);
        showHint("현재 위치를 지도에 표시했습니다.", false);
    }

    function scheduleMapRetry() {
        if (state.mapInitAttempts >= MAP_INIT_MAX_ATTEMPTS) {
            showHint("지도를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.", true);
            return;
        }
        state.mapInitAttempts += 1;
        setTimeout(() => window.initCampusMap(), MAP_INIT_RETRY_DELAY);
    }

    window.initCampusMap = function initCampusMap() {
        if (!hasMapContext()) {
            scheduleMapRetry();
            return;
        }
        if (!window.naver || !window.naver.maps) {
            scheduleMapRetry();
            return;
        }

        captureElements();
        const defaultLat = toNumber(elements.canvas.dataset.defaultLat) ?? 37.5665;
        const defaultLng = toNumber(elements.canvas.dataset.defaultLng) ?? 126.9780;

        state.map = new naver.maps.Map(elements.canvas, {
            center: new naver.maps.LatLng(defaultLat, defaultLng),
            zoom: 15,
            minZoom: 6,
            maxZoom: 19,
            draggable: true,
            pinchZoom: true,
            scrollWheel: true,
            keyboardShortcuts: true
        });

        state.mapInitAttempts = 0;
        state.markers.clear();
        if (state.userMarker) {
            state.userMarker.setMap(null);
            state.userMarker = null;
        }
        state.isLocating = false;
        if (elements.locateMeButton) {
            elements.locateMeButton.classList.remove("is-busy");
            elements.locateMeButton.removeAttribute("aria-busy");
            elements.locateMeButton.disabled = false;
        }

        const camerasWithCoords = cameras.filter(camera => camera.hasCoordinates);
        if (!camerasWithCoords.length) {
            showHint("좌표가 등록된 카메라가 없습니다. 카메라 정보에서 위치를 입력해 주세요.", true);
        } else {
            createMarkers(state.map, camerasWithCoords);
            fitMapToMarkers(state.map, camerasWithCoords);
            if (!state.activeId) {
                showDefaultHint();
            }
        }
        updateMarkersVisibility(getFilteredCameras());
        bindLocateMe();
    };

    function initUI() {
        captureElements();
        if (elements.filterButtons) {
            bindFilterEvents();
        }
        bindListEvents();
        bindInfoPanelEvents();
        applyFilter(state.filter);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initUI);
    } else {
        initUI();
    }
})();
