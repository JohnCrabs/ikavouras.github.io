/* ------------------------------------------------------------
   Version 055 — Complete AutoCAD-like Snap System
   Scope: snap options/settings only.
------------------------------------------------------------ */

function setupSnapSystem(appState) {
  appState.snap = {
    enabled: true,
    tolerancePixels: 14,
    priorityBufferPixels: 8,
    activeResult: null,
    activeParallelAngle: null,
    extensionMemory: [],
    modes: {
      endpoint: true,
      midpoint: true,
      center: true,
      geometricCenter: true,
      node: true,
      quadrant: true,
      intersection: true,
      extension: false,
      insertion: false,
      perpendicular: true,
      tangent: false,
      nearest: true,
      apparentIntersection: false,
      parallel: false
    },
    markerLayer: L.layerGroup().addTo(appState.map)
  };

  wireExistingSnapControl(appState);
}

function wireExistingSnapControl(appState) {
  const control = document.getElementById("existingSnapControl") ||
    document.getElementById("snappingControl") ||
    findExistingSnapControl();

  if (!control) {
    return;
  }

  control.id = control.id || "existingSnapControl";
  control.classList.add("snap-control-ready");

  const toggleButton = document.getElementById("snapToggleBtn") ||
    control.querySelector(".snap-main-btn") ||
    control.querySelector(".snap-chip-toggle") ||
    control.querySelector("button");

  const settingsButton = document.getElementById("snapSettingsBtn") ||
    control.querySelector(".snap-settings-btn") ||
    control.querySelector(".snap-chip-settings") ||
    ensureSnapSettingsButton(control);

  if (toggleButton) {
    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      appState.snap.enabled = !appState.snap.enabled;
      updateSnapToggleVisual(appState, toggleButton);
      clearSnapMarker(appState);
    });

    updateSnapToggleVisual(appState, toggleButton);
  }

  if (settingsButton) {
    settingsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSnapSettingsPanel(appState);
    });
  }

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest("#snapSettingsPanel") &&
      !event.target.closest("#existingSnapControl") &&
      !event.target.closest("#snappingControl")
    ) {
      closeSnapSettingsPanel();
    }
  });
}

function findExistingSnapControl() {
  const candidates = Array.from(document.querySelectorAll("div, label, button"));

  return candidates.find((element) => {
    const text = (element.textContent || "").trim().toLowerCase();
    return text.includes("snap") || text.includes("snapping");
  });
}

function ensureSnapSettingsButton(control) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "snapSettingsBtn";
  button.className = "snap-settings-btn snap-chip-settings";
  button.title = "Snap settings";
  button.innerHTML = `<i class="fa-solid fa-gear"></i>`;
  control.appendChild(button);
  return button;
}

function updateSnapToggleVisual(appState, toggleButton) {
  if (!toggleButton) {
    return;
  }

  toggleButton.classList.toggle("active", appState.snap.enabled);
  toggleButton.classList.toggle("inactive", !appState.snap.enabled);
  toggleButton.title = appState.snap.enabled ? "Snap is ON" : "Snap is OFF";
}

function toggleSnapSettingsPanel(appState) {
  const existing = document.getElementById("snapSettingsPanel");

  if (existing) {
    existing.remove();
    return;
  }

  openSnapSettingsPanel(appState);
}

function openSnapSettingsPanel(appState) {
  closeSnapSettingsPanel();

  const anchor = document.getElementById("existingSnapControl") ||
    document.getElementById("snappingControl") ||
    document.getElementById("snapSettingsBtn");

  const rect = anchor
    ? anchor.getBoundingClientRect()
    : { left: 980, bottom: 90 };

  const panel = document.createElement("div");
  panel.id = "snapSettingsPanel";
  panel.className = "snap-settings-panel";
  panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 410))}px`;
  panel.style.top = `${Math.max(80, rect.bottom + 8)}px`;

  panel.innerHTML = `
    <div class="snap-settings-header">
      <div>
        <strong>Snap Settings</strong>
        <small>${appState.snap.enabled ? "Enabled" : "Disabled"}</small>
      </div>
      <button id="closeSnapSettingsBtn" type="button" title="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <div class="snap-mode-grid">
      ${createSnapModeRow("endpoint", "Endpoint", "snap-icon-endpoint", "Snaps to the closest end of a line, polyline segment, arc, or open curve.")}
      ${createSnapModeRow("midpoint", "Midpoint", "snap-icon-midpoint", "Snaps to the midpoint of a line, polyline segment, arc segment, or edge.")}
      ${createSnapModeRow("center", "Center", "snap-icon-center", "Snaps to the center of a circle, arc, ellipse, or ellipse-like curve.")}
      ${createSnapModeRow("geometricCenter", "Geometric Center", "snap-icon-geometric-center", "Snaps to the centroid/geometric center of a closed polygon or closed polyline.")}
      ${createSnapModeRow("node", "Node / Vertex", "snap-icon-node", "Snaps to point entities and vertices of lines, polylines, and polygons.")}
      ${createSnapModeRow("quadrant", "Quadrant", "snap-icon-quadrant", "Snaps to the 0°, 90°, 180°, and 270° points of circles, arcs, ellipses, and ellipse-like curves.")}
      ${createSnapModeRow("intersection", "Intersection", "snap-icon-intersection", "Snaps to the real 2D intersection of two visible objects.")}
      ${createSnapModeRow("extension", "Extension", "snap-icon-extension", "Snaps to an extension of a line segment beyond its endpoints.")}
      ${createSnapModeRow("insertion", "Insertion", "snap-icon-insertion disabled", "Reserved for future block/text/media insertion points. Current vector entities do not have insertion points.", true)}
      ${createSnapModeRow("perpendicular", "Perpendicular", "snap-icon-perpendicular", "Creates a point that forms a 90° relation from the current drawing point to a target line/segment.")}
      ${createSnapModeRow("tangent", "Tangent", "snap-icon-tangent", "Snaps to a true tangent point from the current drawing point to a circle; arcs/ellipses use sampled tangency approximation.")}
      ${createSnapModeRow("nearest", "Nearest", "snap-icon-nearest", "Snaps to the closest point on an object. Lowest priority unless no exact snap is nearby.")}
      ${createSnapModeRow("parallel", "Parallel", "snap-icon-parallel", "Locks the next drawing point onto a line through the current drawing point parallel to the referenced line segment.")}
    </div>

    <div class="snap-panel-note">
      Apparent Intersection is intentionally hidden for now: this is a 2D map workspace, so it is equivalent to Intersection until true 3D/view-projection entities are introduced.
    </div>

    <div class="snap-panel-actions">
      <button id="snapSelectAllBtn" type="button">Select All</button>
      <button id="snapClearAllBtn" type="button">Clear All</button>
    </div>

    <label class="snap-number-row">
      <span>Tolerance</span>
      <input id="snapTolerance" type="number" min="3" max="60" value="${appState.snap.tolerancePixels}" />
      <span>px</span>
    </label>

    <label class="snap-number-row">
      <span>Priority Buffer</span>
      <input id="snapPriorityBuffer" type="number" min="1" max="40" value="${appState.snap.priorityBufferPixels}" />
      <span>px</span>
    </label>

    <div class="snap-help-text">
      Hover over each snap mode for a short explanation. Tangent, perpendicular and parallel require a current drawing point.
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById("closeSnapSettingsBtn").addEventListener("click", closeSnapSettingsPanel);

  Object.keys(appState.snap.modes).forEach((mode) => {
    bindSnapModeCheckbox(appState, mode);
  });

  const insertionInput = document.getElementById("snapMode_insertion");
  if (insertionInput) {
    insertionInput.checked = false;
    insertionInput.disabled = true;
    appState.snap.modes.insertion = false;
  }

  document.getElementById("snapSelectAllBtn").addEventListener("click", () => {
    Object.keys(appState.snap.modes).forEach((mode) => {
      appState.snap.modes[mode] = mode !== "insertion" && mode !== "apparentIntersection";
    });

    openSnapSettingsPanel(appState);
  });

  document.getElementById("snapClearAllBtn").addEventListener("click", () => {
    Object.keys(appState.snap.modes).forEach((mode) => {
      appState.snap.modes[mode] = false;
    });

    clearSnapMarker(appState);
    openSnapSettingsPanel(appState);
  });

  document.getElementById("snapTolerance").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    appState.snap.tolerancePixels = Math.max(3, Math.min(value || 14, 60));
  });

  document.getElementById("snapPriorityBuffer").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    appState.snap.priorityBufferPixels = Math.max(1, Math.min(value || 8, 40));
  });
}


function closeSnapSettingsPanel() {
  const panel = document.getElementById("snapSettingsPanel");

  if (panel) {
    panel.remove();
  }
}

function createSnapModeRow(mode, label, iconClass, description = "", disabled = false) {
  const disabledText = disabled ? "disabled" : "";
  const safeDescription = description.replace(/"/g, "&quot;");

  return `
    <label class="snap-mode-row ${disabled ? "disabled" : ""}" title="${safeDescription}">
      <input id="snapMode_${mode}" type="checkbox" ${disabledText} />
      <span class="snap-symbol ${iconClass}"></span>
      <span>${label}</span>
      <small class="snap-mode-hint">${description}</small>
    </label>
  `;
}


function bindSnapModeCheckbox(appState, mode) {
  const input = document.getElementById(`snapMode_${mode}`);

  if (!input) {
    return;
  }

  if (mode === "insertion" || mode === "apparentIntersection") {
    input.checked = false;
    input.disabled = true;
    appState.snap.modes[mode] = false;
    return;
  }

  input.checked = Boolean(appState.snap.modes[mode]);

  input.addEventListener("change", () => {
    appState.snap.modes[mode] = input.checked;
    clearSnapMarker(appState);
  });
}


/* Public snap API used by drawing tools. */
function getSnappedLatLng(appState, rawLatLng) {
  const result = getSnapResult(appState, rawLatLng);

  if (!result) {
    clearSnapMarker(appState);
    return rawLatLng;
  }

  appState.snap.activeResult = result;

  if (result.mode === "parallel") {
    appState.snap.activeParallelAngle = result.angle;
  }

  showSnapMarker(appState, result);

  return result.latlng;
}

function getSnapResult(appState, rawLatLng) {
  if (!appState.snap || !appState.snap.enabled) {
    return null;
  }

  const rawPoint = appState.map.latLngToContainerPoint(rawLatLng);
  const candidates = collectSnapCandidates(appState, rawLatLng)
    .map((candidate) => {
      const point = appState.map.latLngToContainerPoint(candidate.latlng);
      return {
        ...candidate,
        distance: candidate.cursorDistance !== undefined
          ? candidate.cursorDistance
          : rawPoint.distanceTo(point)
      };
    })
    .filter((candidate) => {
      const tolerance = candidate.mode === "parallel" || candidate.mode === "perpendicular"
        ? Math.max(appState.snap.tolerancePixels, 24)
        : appState.snap.tolerancePixels;

      return candidate.distance <= tolerance;
    });

  if (candidates.length === 0) {
    return null;
  }

  return chooseBestSnapCandidate(appState, candidates);
}




function chooseBestSnapCandidate(appState, candidates) {
  const priority = {
    endpoint: 1,
    midpoint: 2,
    center: 3,
    geometricCenter: 4,
    node: 5,
    quadrant: 6,
    intersection: 7,
    perpendicular: 8,
    tangent: 9,
    insertion: 10,
    extension: 11,
    parallel: 12,
    nearest: 99
  };

  const midpoint = candidates
    .filter((candidate) => candidate.mode === "midpoint")
    .sort((a, b) => a.distance - b.distance)[0];

  if (midpoint && midpoint.distance <= appState.snap.priorityBufferPixels) {
    return midpoint;
  }

  const specific = candidates
    .filter((candidate) => candidate.mode !== "nearest")
    .sort((a, b) => {
      const priorityDiff = (priority[a.mode] || 50) - (priority[b.mode] || 50);
      return priorityDiff || a.distance - b.distance;
    });

  const nearest = candidates
    .filter((candidate) => candidate.mode === "nearest")
    .sort((a, b) => a.distance - b.distance);

  if (specific.length === 0) {
    return nearest[0];
  }

  if (nearest.length === 0) {
    return specific[0];
  }

  if (specific[0].distance <= appState.snap.priorityBufferPixels) {
    return specific[0];
  }

  if (nearest[0].distance + appState.snap.priorityBufferPixels < specific[0].distance) {
    return nearest[0];
  }

  return specific[0];
}




function collectSnapCandidates(appState, rawLatLng) {
  const candidates = [];
  const geometries = collectSnapGeometries(appState);

  geometries.forEach((geometry) => {
    collectGeometrySnapCandidates(appState, rawLatLng, geometry, candidates);
  });

  collectIntersectionCandidates(appState, geometries, candidates);

  return candidates;
}

function collectSnapGeometries(appState) {
  const geometries = [];

  appState.layers
    .filter((layer) => {
      return layer.layerKind === "AtomicLayer" &&
        layer.dataType === "Vector" &&
        layer.state.visible &&
        !layer.state.locked &&
        layer.data &&
        Array.isArray(layer.data.entities);
    })
    .forEach((layer) => {
      layer.data.entities.forEach((entity) => {
        const coordinates = getEntityCoordinatesForSnap(entity);

        if (coordinates.length === 0) {
          return;
        }

        const category = typeof getVectorEntityCategory === "function"
          ? getVectorEntityCategory(entity)
          : getFallbackEntityCategoryForSnap(entity);

        geometries.push({
          layer,
          entity,
          category,
          coordinates,
          latlngs: coordinates.map(coordinateToLatLng)
        });
      });
    });

  return geometries;
}

function getEntityCoordinatesForSnap(entity) {
  if (!entity || !entity.geometry) {
    return [];
  }

  if (entity.geometry.type === "Point") {
    return [entity.geometry.coordinates];
  }

  if (!Array.isArray(entity.geometry.coordinates)) {
    return [];
  }

  return entity.geometry.coordinates;
}

function getFallbackEntityCategoryForSnap(entity) {
  if (entity.geometry?.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (entity.geometry?.type === "Polygon") {
    return "Polygon";
  }

  return "Line";
}

function collectGeometrySnapCandidates(appState, rawLatLng, geometry, candidates) {
  const latlngs = geometry.latlngs;

  if (latlngs.length === 0) {
    return;
  }

  if (geometry.category === "Point") {
    const point = latlngs[0];

    addSnapCandidate(appState, candidates, "node", "Node", point);
    addSnapCandidate(appState, candidates, "center", "Center", point);
    return;
  }

  const isClosed = geometry.category === "Polygon" || isClosedLatLngPath(latlngs);
  const segmentLatLngs = normalizeSnapLatLngs(latlngs, isClosed);

  if (appState.snap.modes.endpoint && geometry.category === "Line") {
    addSnapCandidate(appState, candidates, "endpoint", "Endpoint", latlngs[0]);
    addSnapCandidate(appState, candidates, "endpoint", "Endpoint", latlngs[latlngs.length - 1]);
  }

  if (appState.snap.modes.node) {
    latlngs.forEach((latlng) => {
      addSnapCandidate(appState, candidates, "node", "Node", latlng);
    });
  }

  if (appState.snap.modes.midpoint) {
    addMidpointCandidates(appState, candidates, segmentLatLngs, isClosed);
  }

  if (appState.snap.modes.center && (isClosed || isCurvedEntityForSnap(geometry.entity))) {
    addSnapCandidate(appState, candidates, "center", "Center", getCurveCenterLatLng(appState, geometry));
  }

  if (appState.snap.modes.geometricCenter && isClosed) {
    addSnapCandidate(appState, candidates, "geometricCenter", "Geometric Center", getPolygonCentroidForSnap(latlngs));
  }

  if (appState.snap.modes.quadrant && isCurvedEntityForSnap(geometry.entity)) {
    addQuadrantCandidates(appState, candidates, geometry);
  }

  if (appState.snap.modes.nearest) {
    const nearest = getNearestPointOnLatLngPath(appState, rawLatLng, segmentLatLngs, isClosed);

    if (nearest) {
      addSnapCandidate(appState, candidates, "nearest", "Nearest", nearest);
    }
  }

  if (appState.snap.modes.perpendicular) {
    const perpendicularCandidates = getPerpendicularSnapCandidates(appState, rawLatLng, segmentLatLngs, isClosed);

    perpendicularCandidates.forEach((candidate) => {
      candidates.push(candidate);
    });
  }

  if (appState.snap.modes.extension && geometry.category === "Line") {
    addExtensionCandidates(appState, candidates, rawLatLng, segmentLatLngs);
  }

  if (appState.snap.modes.tangent && isCurvedEntityForSnap(geometry.entity)) {
    const tangentCandidates = getTangentSnapCandidates(appState, rawLatLng, geometry);

    tangentCandidates.forEach((candidate) => {
      candidates.push(candidate);
    });
  }

  if (appState.snap.modes.parallel && geometry.category === "Line") {
    const parallelCandidates = getParallelSnapCandidates(appState, rawLatLng, segmentLatLngs);

    parallelCandidates.forEach((candidate) => {
      candidates.push(candidate);
    });
  }
}




function normalizeSnapLatLngs(latlngs, isClosed) {
  if (!isClosed || latlngs.length < 2) {
    return latlngs;
  }

  const first = latlngs[0];
  const last = latlngs[latlngs.length - 1];

  if (Math.abs(first.lat - last.lat) < 1e-12 && Math.abs(first.lng - last.lng) < 1e-12) {
    return latlngs.slice(0, -1);
  }

  return latlngs;
}

function isClosedLatLngPath(latlngs) {
  if (latlngs.length < 3) {
    return false;
  }

  const first = latlngs[0];
  const last = latlngs[latlngs.length - 1];

  return Math.abs(first.lat - last.lat) < 1e-12 &&
    Math.abs(first.lng - last.lng) < 1e-12;
}

function addMidpointCandidates(appState, candidates, latlngs, isClosed) {
  if (!appState.snap.modes.midpoint || latlngs.length < 2) {
    return;
  }

  const segmentCount = isClosed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const aLatLng = latlngs[index];
    const bLatLng = latlngs[(index + 1) % latlngs.length];

    const aPoint = appState.map.latLngToLayerPoint(aLatLng);
    const bPoint = appState.map.latLngToLayerPoint(bLatLng);

    const midpoint = L.point(
      (aPoint.x + bPoint.x) / 2,
      (aPoint.y + bPoint.y) / 2
    );

    addSnapCandidate(
      appState,
      candidates,
      "midpoint",
      "Midpoint",
      appState.map.layerPointToLatLng(midpoint)
    );
  }
}


function getPolygonCentroidForSnap(latlngs) {
  const points = normalizeSnapLatLngs(latlngs, true);
  let area = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const factor = current.lng * next.lat - next.lng * current.lat;

    area += factor;
    x += (current.lng + next.lng) * factor;
    y += (current.lat + next.lat) * factor;
  }

  area *= 0.5;

  if (Math.abs(area) < 1e-12) {
    return L.latLngBounds(latlngs).getCenter();
  }

  return L.latLng(y / (6 * area), x / (6 * area));
}

function isCurvedEntityForSnap(entity) {
  return [
    "Circle",
    "Ellipse",
    "Arc"
  ].includes(entity.entityType);
}

function addQuadrantCandidates(appState, candidates, geometry) {
  const curve = getCurveMetrics(appState, geometry);

  if (!curve) {
    return;
  }

  const points = [
    L.point(curve.center.x, curve.center.y - curve.radiusY),
    L.point(curve.center.x + curve.radiusX, curve.center.y),
    L.point(curve.center.x, curve.center.y + curve.radiusY),
    L.point(curve.center.x - curve.radiusX, curve.center.y)
  ];

  points.forEach((point) => {
    addSnapCandidate(
      appState,
      candidates,
      "quadrant",
      "Quadrant",
      appState.map.layerPointToLatLng(point)
    );
  });
}


function addExtensionCandidates(appState, candidates, rawLatLng, latlngs) {
  if (latlngs.length < 2) {
    return;
  }

  const rawPoint = appState.map.latLngToLayerPoint(rawLatLng);

  for (let index = 0; index < latlngs.length - 1; index += 1) {
    const start = appState.map.latLngToLayerPoint(latlngs[index]);
    const end = appState.map.latLngToLayerPoint(latlngs[index + 1]);
    const projected = projectPointToInfiniteLine(rawPoint, start, end);

    candidates.push({
      mode: "extension",
      label: "Extension",
      latlng: appState.map.layerPointToLatLng(projected)
    });
  }
}

function getParallelCandidate(appState, rawLatLng, latlngs) {
  const candidates = getParallelSnapCandidates(appState, rawLatLng, latlngs);
  return candidates.length ? candidates[0] : null;
}


function collectIntersectionCandidates(appState, geometries, candidates) {
  if (!appState.snap.modes.intersection) {
    return;
  }

  const segmentGroups = geometries
    .map((geometry) => {
      return {
        geometry,
        segments: getSegmentsForSnap(appState, geometry)
      };
    })
    .filter((group) => group.segments.length > 0);

  for (let firstIndex = 0; firstIndex < segmentGroups.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segmentGroups.length; secondIndex += 1) {
      segmentGroups[firstIndex].segments.forEach((firstSegment) => {
        segmentGroups[secondIndex].segments.forEach((secondSegment) => {
          const point = getSegmentIntersectionPoint(
            firstSegment.start,
            firstSegment.end,
            secondSegment.start,
            secondSegment.end
          );

          if (!point) {
            return;
          }

          addSnapCandidate(
            appState,
            candidates,
            "intersection",
            "Intersection",
            appState.map.layerPointToLatLng(point)
          );
        });
      });
    }
  }
}



function getGeometryIntersections(appState, first, second) {
  const intersections = [];
  const firstSegments = getSegmentsForSnap(appState, first);
  const secondSegments = getSegmentsForSnap(appState, second);

  firstSegments.forEach((a) => {
    secondSegments.forEach((b) => {
      const point = getSegmentIntersectionPoint(a.start, a.end, b.start, b.end);

      if (point) {
        intersections.push(appState.map.layerPointToLatLng(point));
      }
    });
  });

  return intersections;
}

function getSegmentsForSnap(appState, geometry) {
  const segments = [];
  const isClosed = geometry.category === "Polygon" || isClosedLatLngPath(geometry.latlngs);
  const latlngs = normalizeSnapLatLngs(geometry.latlngs, isClosed);

  if (latlngs.length < 2) {
    return segments;
  }

  const segmentCount = isClosed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const startLatLng = latlngs[index];
    const endLatLng = latlngs[(index + 1) % latlngs.length];

    segments.push({
      start: appState.map.latLngToLayerPoint(startLatLng),
      end: appState.map.latLngToLayerPoint(endLatLng),
      startLatLng,
      endLatLng
    });
  }

  return segments;
}


function getSegmentIntersectionPoint(a, b, c, d) {
  const denominator = ((a.x - b.x) * (c.y - d.y)) - ((a.y - b.y) * (c.x - d.x));

  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const t = (((a.x - c.x) * (c.y - d.y)) - ((a.y - c.y) * (c.x - d.x))) / denominator;
  const u = (((a.x - c.x) * (a.y - b.y)) - ((a.y - c.y) * (a.x - b.x))) / denominator;

  const epsilon = 1e-9;

  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return L.point(
    a.x + t * (b.x - a.x),
    a.y + t * (b.y - a.y)
  );
}


function getNearestPointOnLatLngPath(appState, rawLatLng, latlngs, isClosed) {
  if (latlngs.length < 2) {
    return null;
  }

  const rawPoint = appState.map.latLngToLayerPoint(rawLatLng);
  let best = null;
  const segmentCount = isClosed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const a = appState.map.latLngToLayerPoint(latlngs[index]);
    const b = appState.map.latLngToLayerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegment(rawPoint, a, b);
    const distance = rawPoint.distanceTo(projected);

    if (!best || distance < best.distance) {
      best = {
        point: projected,
        distance
      };
    }
  }

  return best ? appState.map.layerPointToLatLng(best.point) : null;
}

function projectPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const t = Math.max(0, Math.min(1, (
    ((point.x - start.x) * dx) +
    ((point.y - start.y) * dy)
  ) / lengthSquared));

  return L.point(
    start.x + t * dx,
    start.y + t * dy
  );
}


function projectPointToInfiniteLine(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return start;
  }

  const t = (
    ((point.x - start.x) * dx) +
    ((point.y - start.y) * dy)
  ) / lengthSquared;

  return L.point(start.x + t * dx, start.y + t * dy);
}

function addSnapCandidate(appState, candidates, mode, label, latlng) {
  if (!appState.snap.modes[mode]) {
    return;
  }

  candidates.push({
    mode,
    label,
    latlng
  });
}

function showSnapMarker(appState, snapResult) {
  if (!appState.snap || !appState.snap.markerLayer) {
    return;
  }

  appState.snap.markerLayer.clearLayers();

  L.marker(snapResult.latlng, {
    interactive: false,
    icon: L.divIcon({
      className: "snap-marker-icon",
      html: `
        <div class="snap-marker-magnet snap-marker-${snapResult.mode}">
          <i class="fa-solid fa-magnet"></i>
        </div>
        <div class="snap-marker-label">${snapResult.label}</div>
      `,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    })
  }).addTo(appState.snap.markerLayer);
}

function clearSnapMarker(appState) {
  if (appState.snap && appState.snap.markerLayer) {
    appState.snap.markerLayer.clearLayers();
  }

  if (appState.snap) {
    appState.snap.activeResult = null;
  }
}



function getPerpendicularSnapCandidate(appState, rawLatLng, latlngs, isClosed) {
  const candidates = getPerpendicularSnapCandidates(appState, rawLatLng, latlngs, isClosed);
  return candidates.length ? candidates[0] : null;
}



function getCurrentSnapSourceLatLng(appState) {
  if (
    appState.vectorDraft &&
    Array.isArray(appState.vectorDraft.points) &&
    appState.vectorDraft.points.length > 0
  ) {
    return appState.vectorDraft.points[appState.vectorDraft.points.length - 1];
  }

  return null;
}




function getTangentSnapCandidates(appState, rawLatLng, geometry) {
  const sourceLatLng = getCurrentSnapSourceLatLng(appState);

  if (!sourceLatLng) {
    return [];
  }

  if (geometry.entity.entityType === "Circle") {
    return getCircleTangentCandidates(appState, rawLatLng, sourceLatLng, geometry);
  }

  return getSampledCurveTangentCandidates(appState, rawLatLng, sourceLatLng, geometry);
}

function getCircleTangentCandidates(appState, rawLatLng, sourceLatLng, geometry) {
  const curve = getCurveMetrics(appState, geometry);

  if (!curve) {
    return [];
  }

  const sourcePoint = appState.map.latLngToLayerPoint(sourceLatLng);
  const cursorPoint = appState.map.latLngToLayerPoint(rawLatLng);
  const center = curve.center;
  const radius = (curve.radiusX + curve.radiusY) / 2;
  const vx = sourcePoint.x - center.x;
  const vy = sourcePoint.y - center.y;
  const distanceSquared = vx * vx + vy * vy;
  const radiusSquared = radius * radius;

  if (distanceSquared <= radiusSquared + 1e-9) {
    return [];
  }

  const distance = Math.sqrt(distanceSquared);
  const baseScale = radiusSquared / distanceSquared;
  const offsetScale = radius * Math.sqrt(distanceSquared - radiusSquared) / distanceSquared;

  const base = L.point(
    center.x + vx * baseScale,
    center.y + vy * baseScale
  );

  const perpendicular = L.point(-vy, vx);

  const tangentPoints = [
    L.point(
      base.x + perpendicular.x * offsetScale,
      base.y + perpendicular.y * offsetScale
    ),
    L.point(
      base.x - perpendicular.x * offsetScale,
      base.y - perpendicular.y * offsetScale
    )
  ];

  return tangentPoints.map((point) => {
    return {
      mode: "tangent",
      label: "Tangent",
      latlng: appState.map.layerPointToLatLng(point),
      cursorDistance: cursorPoint.distanceTo(point)
    };
  });
}

function getSampledCurveTangentCandidates(appState, rawLatLng, sourceLatLng, geometry) {
  const sourcePoint = appState.map.latLngToLayerPoint(sourceLatLng);
  const cursorPoint = appState.map.latLngToLayerPoint(rawLatLng);
  const latlngs = normalizeSnapLatLngs(
    geometry.latlngs,
    geometry.category === "Polygon" || isClosedLatLngPath(geometry.latlngs)
  );

  if (latlngs.length < 3) {
    return [];
  }

  let best = null;

  for (let index = 1; index < latlngs.length - 1; index += 1) {
    const previous = appState.map.latLngToLayerPoint(latlngs[index - 1]);
    const point = appState.map.latLngToLayerPoint(latlngs[index]);
    const next = appState.map.latLngToLayerPoint(latlngs[index + 1]);

    const tangentVector = {
      x: next.x - previous.x,
      y: next.y - previous.y
    };

    const sourceVector = {
      x: point.x - sourcePoint.x,
      y: point.y - sourcePoint.y
    };

    const tangentLength = Math.hypot(tangentVector.x, tangentVector.y);
    const sourceLength = Math.hypot(sourceVector.x, sourceVector.y);

    if (tangentLength < 1e-9 || sourceLength < 1e-9) {
      continue;
    }

    const cross = Math.abs(
      tangentVector.x * sourceVector.y -
      tangentVector.y * sourceVector.x
    ) / (tangentLength * sourceLength);

    const cursorDistance = cursorPoint.distanceTo(point);
    const score = cursorDistance + cross * 80;

    if (!best || score < best.score) {
      best = {
        mode: "tangent",
        label: "Tangent",
        latlng: latlngs[index],
        cursorDistance,
        score
      };
    }
  }

  return best ? [best] : [];
}

function getCurveMetrics(appState, geometry) {
  if (!geometry || !Array.isArray(geometry.latlngs) || geometry.latlngs.length < 3) {
    return null;
  }

  const points = normalizeSnapLatLngs(
    geometry.latlngs,
    geometry.category === "Polygon" || isClosedLatLngPath(geometry.latlngs)
  ).map((latlng) => appState.map.latLngToLayerPoint(latlng));

  if (points.length < 3) {
    return null;
  }

  if (geometry.entity.entityType === "Arc") {
    const first = points[0];
    const middle = points[Math.floor(points.length / 2)];
    const last = points[points.length - 1];
    const circle = getCircleFromThreeLayerPointsForSnap(first, middle, last);

    if (circle) {
      return {
        center: L.point(circle.cx, circle.cy),
        radiusX: circle.radius,
        radiusY: circle.radius
      };
    }
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    center: L.point((minX + maxX) / 2, (minY + maxY) / 2),
    radiusX: Math.max((maxX - minX) / 2, 1e-9),
    radiusY: Math.max((maxY - minY) / 2, 1e-9)
  };
}

function getCurveCenterLatLng(appState, geometry) {
  const curve = getCurveMetrics(appState, geometry);

  if (!curve) {
    return L.latLngBounds(geometry.latlngs).getCenter();
  }

  return appState.map.layerPointToLatLng(curve.center);
}

function getCircleFromThreeLayerPointsForSnap(a, b, c) {
  const denominator = 2 * (
    a.x * (b.y - c.y) +
    b.x * (c.y - a.y) +
    c.x * (a.y - b.y)
  );

  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const aSq = a.x * a.x + a.y * a.y;
  const bSq = b.x * b.x + b.y * b.y;
  const cSq = c.x * c.x + c.y * c.y;

  const cx = (
    aSq * (b.y - c.y) +
    bSq * (c.y - a.y) +
    cSq * (a.y - b.y)
  ) / denominator;

  const cy = (
    aSq * (c.x - b.x) +
    bSq * (a.x - c.x) +
    cSq * (b.x - a.x)
  ) / denominator;

  return {
    cx,
    cy,
    radius: Math.hypot(a.x - cx, a.y - cy)
  };
}



function getPerpendicularSnapCandidates(appState, rawLatLng, latlngs, isClosed) {
  const sourceLatLng = getCurrentSnapSourceLatLng(appState);

  if (!sourceLatLng || latlngs.length < 2) {
    return [];
  }

  const sourcePoint = appState.map.latLngToLayerPoint(sourceLatLng);
  const cursorPoint = appState.map.latLngToLayerPoint(rawLatLng);
  const candidates = [];
  const segmentCount = isClosed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = appState.map.latLngToLayerPoint(latlngs[index]);
    const end = appState.map.latLngToLayerPoint(latlngs[(index + 1) % latlngs.length]);

    const footOnSegment = projectPointToSegment(sourcePoint, start, end);
    const sourceIsOnSegment = sourcePoint.distanceTo(footOnSegment) <= 4;

    if (sourceIsOnSegment) {
      /*
        If the current drawing point is on the target line, the CAD-useful
        perpendicular point is not the same source point. We create a tracking
        point on the normal line through the source, closest to the cursor.
      */
      const trackedPoint = projectPointToNormalThroughSource(cursorPoint, sourcePoint, start, end);

      candidates.push({
        mode: "perpendicular",
        label: "Perpendicular",
        latlng: appState.map.layerPointToLatLng(trackedPoint),
        cursorDistance: cursorPoint.distanceTo(trackedPoint)
      });
    } else {
      /*
        Standard AutoCAD-like perpendicular: snap to the point on the target
        object that forms 90° from the current drawing point.
      */
      candidates.push({
        mode: "perpendicular",
        label: "Perpendicular",
        latlng: appState.map.layerPointToLatLng(footOnSegment),
        cursorDistance: cursorPoint.distanceTo(footOnSegment)
      });
    }
  }

  return candidates;
}

function getParallelSnapCandidates(appState, rawLatLng, latlngs) {
  const sourceLatLng = getCurrentSnapSourceLatLng(appState);

  if (!sourceLatLng || latlngs.length < 2) {
    return [];
  }

  const sourcePoint = appState.map.latLngToLayerPoint(sourceLatLng);
  const cursorPoint = appState.map.latLngToLayerPoint(rawLatLng);
  const candidates = [];

  for (let index = 0; index < latlngs.length - 1; index += 1) {
    const start = appState.map.latLngToLayerPoint(latlngs[index]);
    const end = appState.map.latLngToLayerPoint(latlngs[index + 1]);
    const trackedPoint = projectPointToParallelThroughSource(cursorPoint, sourcePoint, start, end);

    candidates.push({
      mode: "parallel",
      label: "Parallel",
      latlng: appState.map.layerPointToLatLng(trackedPoint),
      cursorDistance: cursorPoint.distanceTo(trackedPoint),
      angle: Math.atan2(end.y - start.y, end.x - start.x)
    });
  }

  return candidates;
}

function projectPointToParallelThroughSource(point, source, refStart, refEnd) {
  const dx = refEnd.x - refStart.x;
  const dy = refEnd.y - refStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return source;
  }

  const t = (((point.x - source.x) * dx) + ((point.y - source.y) * dy)) / lengthSquared;

  return L.point(
    source.x + t * dx,
    source.y + t * dy
  );
}

function projectPointToNormalThroughSource(point, source, refStart, refEnd) {
  const dx = refEnd.x - refStart.x;
  const dy = refEnd.y - refStart.y;
  const nx = -dy;
  const ny = dx;
  const lengthSquared = nx * nx + ny * ny;

  if (lengthSquared === 0) {
    return source;
  }

  const t = (((point.x - source.x) * nx) + ((point.y - source.y) * ny)) / lengthSquared;

  return L.point(
    source.x + t * nx,
    source.y + t * ny
  );
}
