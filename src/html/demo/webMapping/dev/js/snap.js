function setupSnapSystem(appState) {
  appState.snap = {
    enabled: true,
    tolerancePixels: 14,
    activeResult: null,
    modes: {
      endpoint: true,
      midpoint: true,
      center: true,
      node: true,
      nearest: true
    },
    markerLayer: L.layerGroup().addTo(appState.map)
  };

  bindExistingSnapControl(appState);
  updateSnapToggleVisual(appState);
}

function bindExistingSnapControl(appState) {
  const toggleButton = document.getElementById("snapToggleBtn");
  const settingsButton = document.getElementById("snapSettingsBtn");

  if (toggleButton) {
    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      appState.snap.enabled = !appState.snap.enabled;
      clearSnapMarker(appState);
      updateSnapToggleVisual(appState);
      refreshSnapPanelStatus(appState);
    });
  }

  if (settingsButton) {
    settingsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSnapSettingsPanel(appState);
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#snapSettingsPanel") && !event.target.closest("#existingSnapControl")) {
      closeSnapSettingsPanel();
    }
  });
}

function updateSnapToggleVisual(appState) {
  const button = document.getElementById("snapToggleBtn");
  if (!button || !appState.snap) return;
  button.classList.toggle("active", appState.snap.enabled);
  button.classList.toggle("inactive", !appState.snap.enabled);
  button.title = appState.snap.enabled ? "Snap is ON" : "Snap is OFF";
}

function refreshSnapPanelStatus(appState) {
  const status = document.getElementById("snapPanelStatus");
  if (status) status.textContent = appState.snap.enabled ? "Enabled" : "Disabled";
}

function toggleSnapSettingsPanel(appState) {
  const existing = document.getElementById("snapSettingsPanel");
  if (existing) { existing.remove(); return; }
  openSnapSettingsPanel(appState);
}

function openSnapSettingsPanel(appState) {
  closeSnapSettingsPanel();
  const panel = document.createElement("div");
  panel.id = "snapSettingsPanel";
  panel.className = "snap-settings-panel";
  panel.innerHTML = `
    <div class="snap-settings-header">
      <div>
        <strong>Snap Settings</strong>
        <small id="snapPanelStatus">${appState.snap.enabled ? "Enabled" : "Disabled"}</small>
      </div>
      <button id="closeSnapSettingsBtn" type="button"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="snap-mode-grid">
      ${createSnapModeRow("endpoint", "Endpoint", "snap-icon-endpoint")}
      ${createSnapModeRow("midpoint", "Midpoint", "snap-icon-midpoint")}
      ${createSnapModeRow("center", "Center", "snap-icon-center")}
      ${createSnapModeRow("node", "Node / Vertex", "snap-icon-node")}
      ${createSnapModeRow("nearest", "Nearest", "snap-icon-nearest")}
    </div>
    <label class="snap-tolerance-row">
      <span>Tolerance</span>
      <input id="snapTolerance" type="number" min="4" max="40" value="${appState.snap.tolerancePixels}" />
      <span>px</span>
    </label>`;
  document.body.appendChild(panel);
  positionSnapSettingsPanel();
  document.getElementById("closeSnapSettingsBtn").addEventListener("click", closeSnapSettingsPanel);
  bindSnapCheckbox(appState, "snapModeEndpoint", "endpoint");
  bindSnapCheckbox(appState, "snapModeMidpoint", "midpoint");
  bindSnapCheckbox(appState, "snapModeCenter", "center");
  bindSnapCheckbox(appState, "snapModeNode", "node");
  bindSnapCheckbox(appState, "snapModeNearest", "nearest");
  const tolerance = document.getElementById("snapTolerance");
  tolerance.addEventListener("input", () => {
    const value = Number(tolerance.value);
    appState.snap.tolerancePixels = Math.max(4, Math.min(value || 14, 40));
  });
}

function positionSnapSettingsPanel() {
  const panel = document.getElementById("snapSettingsPanel");
  const snapControl = document.getElementById("existingSnapControl");
  if (!panel || !snapControl) return;
  const rect = snapControl.getBoundingClientRect();
  panel.style.left = `${Math.max(12, rect.left)}px`;
  panel.style.top = `${rect.bottom + 10}px`;
}

function createSnapModeRow(mode, label, iconClass) {
  const inputId = `snapMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
  return `<label class="snap-mode-row"><input id="${inputId}" type="checkbox" /><span class="snap-symbol ${iconClass}"></span><span>${label}</span></label>`;
}

function closeSnapSettingsPanel() {
  const panel = document.getElementById("snapSettingsPanel");
  if (panel) panel.remove();
}

function bindSnapCheckbox(appState, inputId, modeName) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.checked = Boolean(appState.snap.modes[modeName]);
  input.addEventListener("change", () => { appState.snap.modes[modeName] = input.checked; clearSnapMarker(appState); });
}

function getSnappedLatLng(appState, rawLatLng) {
  const result = getSnapResult(appState, rawLatLng);
  if (!result) { clearSnapMarker(appState); return rawLatLng; }
  appState.snap.activeResult = result;
  showSnapMarker(appState, result);
  return result.latlng;
}

function getSnapResult(appState, rawLatLng) {
  if (!appState.snap || !appState.snap.enabled) return null;
  const candidates = collectSnapCandidates(appState, rawLatLng);
  const rawPoint = appState.map.latLngToContainerPoint(rawLatLng);
  let bestCandidate = null;
  candidates.forEach((candidate) => {
    const candidatePoint = appState.map.latLngToContainerPoint(candidate.latlng);
    const distance = rawPoint.distanceTo(candidatePoint);
    if (distance > appState.snap.tolerancePixels) return;
    if (!bestCandidate || distance < bestCandidate.distance) bestCandidate = { ...candidate, distance };
  });
  return bestCandidate;
}

function collectSnapCandidates(appState, rawLatLng) {
  const candidates = [];
  getSnapVectorLayers(appState).forEach((layer) => {
    if (!layer.data || !layer.data.entities) return;
    layer.data.entities.forEach((entity) => collectEntitySnapCandidates(appState, entity, rawLatLng, candidates));
  });
  return candidates;
}

function getSnapVectorLayers(appState) {
  return appState.layers.filter((layer) => layer.layerKind === "AtomicLayer" && layer.dataType === "Vector" && layer.state.visible && !layer.state.locked);
}

function collectEntitySnapCandidates(appState, entity, rawLatLng, candidates) {
  const category = typeof getVectorEntityCategory === "function" ? getVectorEntityCategory(entity) : getSnapEntityCategory(entity);
  if (category === "Point") { addSnapCandidate(appState, candidates, "node", "Node", coordinateToLatLng(entity.geometry.coordinates)); return; }
  const coordinates = entity.geometry.coordinates || [];
  const latlngs = coordinates.map(coordinateToLatLng);
  if (latlngs.length === 0) return;
  if (category === "Line" && appState.snap.modes.endpoint) {
    addSnapCandidate(appState, candidates, "endpoint", "Endpoint", latlngs[0]);
    addSnapCandidate(appState, candidates, "endpoint", "Endpoint", latlngs[latlngs.length - 1]);
  }
  if (appState.snap.modes.node) latlngs.forEach((latlng) => addSnapCandidate(appState, candidates, "node", "Node", latlng));
  if (appState.snap.modes.midpoint) addMidpointCandidates(appState, candidates, latlngs);
  if (appState.snap.modes.center && category === "Polygon") addSnapCandidate(appState, candidates, "center", "Center", getBoundsCenter(latlngs));
  if (appState.snap.modes.nearest) {
    const nearest = getNearestPointOnLatLngSegments(appState, rawLatLng, latlngs, category === "Polygon");
    if (nearest) addSnapCandidate(appState, candidates, "nearest", "Nearest", nearest);
  }
}

function addMidpointCandidates(appState, candidates, latlngs) {
  for (let index = 0; index < latlngs.length - 1; index += 1) {
    const a = latlngs[index];
    const b = latlngs[index + 1];
    addSnapCandidate(appState, candidates, "midpoint", "Midpoint", L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2));
  }
}

function getBoundsCenter(latlngs) { return L.latLngBounds(latlngs).getCenter(); }

function getNearestPointOnLatLngSegments(appState, rawLatLng, latlngs, isClosed) {
  const rawPoint = appState.map.latLngToLayerPoint(rawLatLng);
  let best = null;
  const segmentCount = isClosed ? latlngs.length : latlngs.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const a = appState.map.latLngToLayerPoint(latlngs[index]);
    const b = appState.map.latLngToLayerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegment(rawPoint, a, b);
    const distance = rawPoint.distanceTo(projected);
    if (!best || distance < best.distance) best = { distance, point: projected };
  }
  if (!best) return null;
  return appState.map.layerPointToLatLng(best.point);
}

function projectPointToSegment(point, segmentStart, segmentEnd) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return segmentStart;
  const t = Math.max(0, Math.min(1, (((point.x - segmentStart.x) * dx) + ((point.y - segmentStart.y) * dy)) / lengthSquared));
  return L.point(segmentStart.x + t * dx, segmentStart.y + t * dy);
}

function addSnapCandidate(appState, candidates, mode, label, latlng) {
  if (!appState.snap.modes[mode]) return;
  candidates.push({ mode, label, latlng });
}

function showSnapMarker(appState, snapResult) {
  if (!appState.snap || !appState.snap.markerLayer) return;
  appState.snap.markerLayer.clearLayers();
  const marker = L.marker(snapResult.latlng, {
    interactive: false,
    icon: L.divIcon({
      className: "snap-marker-icon",
      html: `<div class="snap-marker-cross snap-marker-${snapResult.mode}"></div><div class="snap-marker-label">${snapResult.label}</div>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    })
  });
  marker.addTo(appState.snap.markerLayer);
}

function clearSnapMarker(appState) {
  if (appState.snap && appState.snap.markerLayer) appState.snap.markerLayer.clearLayers();
  if (appState.snap) appState.snap.activeResult = null;
}

function getSnapEntityCategory(entity) {
  if (entity.entityType === "Point" || entity.geometry?.type === "Point") return "Point";
  if (entity.geometry?.type === "Polygon") return "Polygon";
  return "Line";
}
