function setupVectorTools(appState) {
  appState.vectorDraft = {
    tool: null,
    points: [],
    tempLayer: L.layerGroup().addTo(appState.map),
    suppressNextClick: false,
    regularPolygonSides: 6
  };

  appState.boxSelect = {
    active: false,
    startLatLng: null,
    startContainerPoint: null,
    rectangle: null
  };

  appState.middlePan = {
    active: false,
    lastClientX: null,
    lastClientY: null
  };

  appState.wheelZoomLock = {
    locked: false,
    reason: null
  };

  appState.selectedEntity = null;
  appState.selectedEntities = [];

  appState.map.on("click", (event) => {
    if (appState.vectorDraft.suppressNextClick) {
      appState.vectorDraft.suppressNextClick = false;
      return;
    }

    handleVectorMapClick(appState, event.latlng);
  });

  appState.map.on("dblclick", (event) => {
    L.DomEvent.stop(event);
    appState.vectorDraft.suppressNextClick = true;
  });

  appState.map.on("mousemove", (event) => {
    updateVectorPreview(appState, event.latlng);
  });

  const mapContainer = appState.map.getContainer();

  mapContainer.addEventListener("wheel", (event) => {
    handleRegularPolygonWheel(appState, event);
  }, { passive: false });

  mapContainer.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    if (appState.middlePan.active) {
      return;
    }

    if (
      appState.activeTool === "draw-polyline" ||
      appState.activeTool === "draw-polygon"
    ) {
      finishCurrentVectorDraft(appState);
    }
  });

  mapContainer.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      startMiddleMousePan(appState, event);
      return;
    }

    handleBoxSelectMouseDown(appState, event);
  });

  mapContainer.addEventListener("mousemove", (event) => {
    if (appState.middlePan.active) {
      updateMiddleMousePan(appState, event);
      return;
    }

    handleBoxSelectMouseMove(appState, event);
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 1 && appState.middlePan.active) {
      stopMiddleMousePan(appState, event);
      return;
    }

    handleBoxSelectMouseUp(appState, event);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelVectorDraft(appState);
      cancelBoxSelect(appState);
      setMapDraggingForTool(appState);
      setMapWheelZoomLock(appState, false, "regular-polygon");
    }

    if (event.key === "Enter") {
      finishCurrentVectorDraft(appState);
    }

    if (event.key === "Delete") {
      deleteSelectedVectorEntity(appState);
    }
  });

  appState.map.doubleClickZoom.disable();
  setMapDraggingForTool(appState);
  setMapWheelZoomLock(appState, false, "regular-polygon");
}


function onVectorToolChanged(appState, toolId) {
  cancelVectorDraft(appState);
  cancelBoxSelect(appState);
  clearVectorSelection(appState);
  setMapWheelZoomLock(appState, false, "regular-polygon");

  if (!isVectorDrawingTool(toolId)) {
    appState.vectorDraft.tool = null;
    setMapDraggingForTool(appState);
    return;
  }

  appState.vectorDraft.tool = toolId;
  appState.vectorDraft.points = [];

  if (toolId === "draw-regular-polygon") {
    appState.vectorDraft.regularPolygonSides = appState.vectorDraft.regularPolygonSides || 6;
  }

  setMapDraggingForTool(appState);
}



function handleVectorMapClick(appState, latlng) {
  const activeLayer = getActiveLayer(appState);

  if (appState.activeTool === "select") {
    clearVectorSelection(appState);
    return;
  }

  if (!activeLayer || activeLayer.dataType !== "Vector") {
    return;
  }

  if (!isVectorDrawingTool(appState.activeTool)) {
    return;
  }

  if (appState.activeTool === "draw-point") {
    addVectorEntity(appState, activeLayer, {
      entityType: "Point",
      geometry: {
        type: "Point",
        coordinates: latLngToCoordinate(latlng)
      }
    });

    return;
  }

  appState.vectorDraft.points.push(latlng);
  updateRegularPolygonWheelZoomState(appState);

  if (appState.activeTool === "draw-line" && appState.vectorDraft.points.length === 2) {
    createLineFromDraft(appState, activeLayer);
    return;
  }

  if (appState.activeTool === "draw-arc" && appState.vectorDraft.points.length === 3) {
    createArcFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-rectangle" &&
    appState.vectorDraft.points.length === 2
  ) {
    createRectangleFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-square" &&
    appState.vectorDraft.points.length === 2
  ) {
    createSquareFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-circle" &&
    appState.vectorDraft.points.length === 2
  ) {
    createCircleFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-ellipse" &&
    appState.vectorDraft.points.length === 2
  ) {
    createEllipseFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-triangle" &&
    appState.vectorDraft.points.length === 2
  ) {
    createTriangleFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-rhombus" &&
    appState.vectorDraft.points.length === 2
  ) {
    createRhombusFromDraft(appState, activeLayer);
    return;
  }

  if (
    appState.activeTool === "draw-regular-polygon" &&
    appState.vectorDraft.points.length === 2
  ) {
    createRegularPolygonFromDraft(appState, activeLayer);
    return;
  }

  updateVectorPreview(appState, latlng);
}




function startMiddleMousePan(appState, event) {
  event.preventDefault();
  event.stopPropagation();

  appState.middlePan.active = true;
  appState.middlePan.lastClientX = event.clientX;
  appState.middlePan.lastClientY = event.clientY;

  cancelBoxSelect(appState);
}

function updateMiddleMousePan(appState, event) {
  event.preventDefault();
  event.stopPropagation();

  const dx = event.clientX - appState.middlePan.lastClientX;
  const dy = event.clientY - appState.middlePan.lastClientY;

  appState.map.panBy([-dx, -dy], {
    animate: false
  });

  appState.middlePan.lastClientX = event.clientX;
  appState.middlePan.lastClientY = event.clientY;
}

function stopMiddleMousePan(appState, event) {
  event.preventDefault();
  event.stopPropagation();

  appState.middlePan.active = false;
  appState.middlePan.lastClientX = null;
  appState.middlePan.lastClientY = null;
}

function handleBoxSelectMouseDown(appState, event) {
  if (appState.activeTool !== "select") {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  if (event.target.closest(".leaflet-control") || event.target.closest(".map-control-bar")) {
    return;
  }

  const containerPoint = appState.map.mouseEventToContainerPoint(event);
  const latlng = appState.map.containerPointToLatLng(containerPoint);

  appState.boxSelect.active = true;
  appState.boxSelect.startLatLng = latlng;
  appState.boxSelect.startContainerPoint = containerPoint;

  appState.map.dragging.disable();

  if (appState.boxSelect.rectangle) {
    appState.boxSelect.rectangle.remove();
  }

  appState.boxSelect.rectangle = L.rectangle(
    L.latLngBounds([latlng, latlng]),
    getBoxSelectStyle("inside")
  ).addTo(appState.map);

  L.DomEvent.stopPropagation(event);
}

function handleBoxSelectMouseMove(appState, event) {
  if (!appState.boxSelect || !appState.boxSelect.active) {
    return;
  }

  const currentContainerPoint = appState.map.mouseEventToContainerPoint(event);
  const currentLatLng = appState.map.containerPointToLatLng(currentContainerPoint);
  const bounds = L.latLngBounds([
    appState.boxSelect.startLatLng,
    currentLatLng
  ]);

  const mode = getBoxSelectMode(
    appState.boxSelect.startContainerPoint,
    currentContainerPoint
  );

  appState.boxSelect.rectangle.setBounds(bounds);
  appState.boxSelect.rectangle.setStyle(getBoxSelectStyle(mode));

  L.DomEvent.stopPropagation(event);
}

function handleBoxSelectMouseUp(appState, event) {
  if (!appState.boxSelect || !appState.boxSelect.active) {
    return;
  }

  const endContainerPoint = appState.map.mouseEventToContainerPoint(event);
  const endLatLng = appState.map.containerPointToLatLng(endContainerPoint);

  const pixelDistance = appState.boxSelect.startContainerPoint.distanceTo(endContainerPoint);

  if (appState.boxSelect.rectangle) {
    appState.boxSelect.rectangle.remove();
    appState.boxSelect.rectangle = null;
  }

  appState.boxSelect.active = false;
  setMapDraggingForTool(appState);

  if (pixelDistance < 4) {
    clearVectorSelection(appState);
    return;
  }

  const bounds = L.latLngBounds([
    appState.boxSelect.startLatLng,
    endLatLng
  ]);

  const mode = getBoxSelectMode(
    appState.boxSelect.startContainerPoint,
    endContainerPoint
  );

  selectVectorEntitiesByBox(appState, bounds, mode, event.shiftKey);

  L.DomEvent.stopPropagation(event);
}

function cancelBoxSelect(appState) {
  if (!appState.boxSelect) {
    return;
  }

  appState.boxSelect.active = false;

  if (appState.boxSelect.rectangle) {
    appState.boxSelect.rectangle.remove();
    appState.boxSelect.rectangle = null;
  }

  setMapDraggingForTool(appState);
}

function getBoxSelectMode(startPoint, endPoint) {
  if (endPoint.y < startPoint.y) {
    return "inside";
  }

  return "intersect";
}

function getBoxSelectStyle(mode) {
  if (mode === "inside") {
    return {
      color: "#16a34a",
      weight: 2,
      dashArray: "4 4",
      fillColor: "#16a34a",
      fillOpacity: 0.10
    };
  }

  return {
    color: "#1f66d1",
    weight: 2,
    dashArray: "8 4",
    fillColor: "#1f66d1",
    fillOpacity: 0.10
  };
}

function updateVectorPreview(appState, cursorLatLng) {
  const draft = appState.vectorDraft;

  if (!draft || !draft.tempLayer) {
    return;
  }

  draft.tempLayer.clearLayers();

  if (!draft.points || draft.points.length === 0) {
    return;
  }

  const points = [...draft.points];

  if (cursorLatLng) {
    points.push(cursorLatLng);
  }

  if (appState.activeTool === "draw-line" && points.length >= 2) {
    L.polyline(points, getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-polyline" && points.length >= 2) {
    L.polyline(points, getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-arc" && points.length === 2) {
    L.polyline(points, getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-arc" && points.length >= 3) {
    const coordinates = createArcCoordinates(points[0], points[1], points[2]);
    L.polyline(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-polygon" && points.length >= 2) {
    L.polygon(points, getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-rectangle" && points.length >= 2) {
    const coordinates = createRectangleCoordinates(points[0], points[1]);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-square" && points.length >= 2) {
    const constrainedPoint = getSquareConstrainedPoint(points[0], points[1]);
    const coordinates = createRectangleCoordinates(points[0], constrainedPoint);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-circle" && points.length >= 2) {
    const coordinates = createCirclePolygonCoordinates(points[0], points[1]);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-ellipse" && points.length >= 2) {
    const coordinates = createEllipseCoordinates(points[0], points[1]);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-triangle" && points.length >= 2) {
    const coordinates = createTriangleCoordinates(points[0], points[1]);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-rhombus" && points.length >= 2) {
    const coordinates = createRhombusCoordinates(points[0], points[1]);
    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }

  if (appState.activeTool === "draw-regular-polygon" && points.length >= 2) {
    const coordinates = createRegularPolygonCoordinates(
      points[0],
      points[1],
      appState.vectorDraft.regularPolygonSides || 6
    );

    L.polygon(coordinates.map(coordinateToLatLng), getDraftStyle()).addTo(draft.tempLayer);
  }
}



function finishCurrentVectorDraft(appState) {
  const activeLayer = getActiveLayer(appState);

  if (!activeLayer || activeLayer.dataType !== "Vector") {
    cancelVectorDraft(appState);
    return;
  }

  if (appState.activeTool === "draw-polyline" && appState.vectorDraft.points.length >= 2) {
    createPolylineFromDraft(appState, activeLayer);
    return;
  }

  if (appState.activeTool === "draw-polygon" && appState.vectorDraft.points.length >= 3) {
    createPolygonFromDraft(appState, activeLayer);
  }
}

function createArcFromDraft(appState, layer) {
  const coordinates = createArcCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1],
    appState.vectorDraft.points[2]
  );

  addVectorEntity(appState, layer, {
    entityType: "Arc",
    geometry: {
      type: "LineString",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createLineFromDraft(appState, layer) {
  const coordinates = appState.vectorDraft.points.map(latLngToCoordinate);

  addVectorEntity(appState, layer, {
    entityType: "Line",
    geometry: {
      type: "LineString",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createPolylineFromDraft(appState, layer) {
  const coordinates = appState.vectorDraft.points.map(latLngToCoordinate);

  addVectorEntity(appState, layer, {
    entityType: "Polyline",
    geometry: {
      type: "LineString",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createPolygonFromDraft(appState, layer) {
  const coordinates = appState.vectorDraft.points.map(latLngToCoordinate);
  coordinates.push(coordinates[0]);

  addVectorEntity(appState, layer, {
    entityType: "Polygon",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createRectangleFromDraft(appState, layer) {
  const coordinates = createRectangleCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  addVectorEntity(appState, layer, {
    entityType: "Rectangle",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createSquareFromDraft(appState, layer) {
  const constrainedPoint = getSquareConstrainedPoint(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  const coordinates = createRectangleCoordinates(
    appState.vectorDraft.points[0],
    constrainedPoint
  );

  addVectorEntity(appState, layer, {
    entityType: "Square",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createEllipseFromDraft(appState, layer) {
  const coordinates = createEllipseCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  addVectorEntity(appState, layer, {
    entityType: "Ellipse",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createTriangleFromDraft(appState, layer) {
  const coordinates = createTriangleCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  addVectorEntity(appState, layer, {
    entityType: "Triangle",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createRhombusFromDraft(appState, layer) {
  const coordinates = createRhombusCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  addVectorEntity(appState, layer, {
    entityType: "Rhombus",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createRegularPolygonFromDraft(appState, layer) {
  const sides = appState.vectorDraft.regularPolygonSides || 6;
  const coordinates = createRegularPolygonCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1],
    sides
  );

  addVectorEntity(appState, layer, {
    entityType: "RegularPolygon",
    properties: {
      sides
    },
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function createCircleFromDraft(appState, layer) {
  const coordinates = createCirclePolygonCoordinates(
    appState.vectorDraft.points[0],
    appState.vectorDraft.points[1]
  );

  addVectorEntity(appState, layer, {
    entityType: "Circle",
    geometry: {
      type: "Polygon",
      coordinates
    }
  });

  resetDraftPoints(appState);
}

function cancelVectorDraft(appState) {
  if (!appState.vectorDraft) {
    return;
  }

  appState.vectorDraft.points = [];

  if (appState.vectorDraft.tempLayer) {
    appState.vectorDraft.tempLayer.clearLayers();
  }

  updateRegularPolygonWheelZoomState(appState);
}


function resetDraftPoints(appState) {
  appState.vectorDraft.points = [];
  appState.vectorDraft.tempLayer.clearLayers();
  updateRegularPolygonWheelZoomState(appState);
}


function getDraftStyle() {
  return {
    color: "#ff9800",
    weight: 3,
    dashArray: "6 6",
    fillColor: "#ff9800",
    fillOpacity: 0.16
  };
}

function getSquareConstrainedPoint(firstCorner, cursorPoint) {
  const projectedFirst = L.CRS.EPSG3857.project(firstCorner);
  const projectedCursor = L.CRS.EPSG3857.project(cursorPoint);

  const dx = projectedCursor.x - projectedFirst.x;
  const dy = projectedCursor.y - projectedFirst.y;
  const side = Math.min(Math.abs(dx), Math.abs(dy));

  if (side === 0) {
    return cursorPoint;
  }

  const signedX = dx < 0 ? -side : side;
  const signedY = dy < 0 ? -side : side;

  const projectedSquarePoint = L.point(
    projectedFirst.x + signedX,
    projectedFirst.y + signedY
  );

  return L.CRS.EPSG3857.unproject(projectedSquarePoint);
}

function handleRegularPolygonWheel(appState, event) {
  const isRegularPolygonDraft =
    appState.activeTool === "draw-regular-polygon" &&
    appState.vectorDraft &&
    appState.vectorDraft.points &&
    appState.vectorDraft.points.length === 1;

  if (!isRegularPolygonDraft) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const currentSides = appState.vectorDraft.regularPolygonSides || 6;
  const direction = event.deltaY < 0 ? 1 : -1;
  const nextSides = Math.max(3, Math.min(currentSides + direction, 64));

  appState.vectorDraft.regularPolygonSides = nextSides;

  const mapPoint = appState.map.mouseEventToContainerPoint(event);
  const latlng = appState.map.containerPointToLatLng(mapPoint);
  updateVectorPreview(appState, latlng);
}


function createArcCoordinates(startLatLng, throughLatLng, endLatLng, segments = 48) {
  const start = L.CRS.EPSG3857.project(startLatLng);
  const through = L.CRS.EPSG3857.project(throughLatLng);
  const end = L.CRS.EPSG3857.project(endLatLng);

  const circle = getCircleFromThreePoints(start, through, end);

  if (!circle) {
    return [
      latLngToCoordinate(startLatLng),
      latLngToCoordinate(throughLatLng),
      latLngToCoordinate(endLatLng)
    ];
  }

  const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
  const throughAngle = Math.atan2(through.y - circle.cy, through.x - circle.cx);
  const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);

  const counterClockwise = isAngleBetweenCounterClockwise(
    throughAngle,
    startAngle,
    endAngle
  );

  let sweep = counterClockwise
    ? normalizePositiveAngle(endAngle - startAngle)
    : -normalizePositiveAngle(startAngle - endAngle);

  const coordinates = [];

  for (let index = 0; index <= segments; index += 1) {
    const fraction = index / segments;
    const angle = startAngle + sweep * fraction;

    const point = L.point(
      circle.cx + Math.cos(angle) * circle.radius,
      circle.cy + Math.sin(angle) * circle.radius
    );

    const latlng = L.CRS.EPSG3857.unproject(point);
    coordinates.push([latlng.lat, latlng.lng]);
  }

  return coordinates;
}

function getCircleFromThreePoints(a, b, c) {
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

  const radius = Math.hypot(a.x - cx, a.y - cy);

  return {
    cx,
    cy,
    radius
  };
}

function normalizePositiveAngle(angle) {
  let normalized = angle;

  while (normalized < 0) {
    normalized += Math.PI * 2;
  }

  while (normalized >= Math.PI * 2) {
    normalized -= Math.PI * 2;
  }

  return normalized;
}

function isAngleBetweenCounterClockwise(testAngle, startAngle, endAngle) {
  const test = normalizePositiveAngle(testAngle - startAngle);
  const end = normalizePositiveAngle(endAngle - startAngle);

  return test <= end;
}

function createEllipseCoordinates(center, radiusPoint, segments = 72) {
  const projectedCenter = L.CRS.EPSG3857.project(center);
  const projectedRadius = L.CRS.EPSG3857.project(radiusPoint);

  const radiusX = Math.abs(projectedRadius.x - projectedCenter.x);
  const radiusY = Math.abs(projectedRadius.y - projectedCenter.y);
  const coordinates = [];

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;

    const point = L.point(
      projectedCenter.x + Math.cos(angle) * radiusX,
      projectedCenter.y + Math.sin(angle) * radiusY
    );

    const latlng = L.CRS.EPSG3857.unproject(point);
    coordinates.push([latlng.lat, latlng.lng]);
  }

  return coordinates;
}

function createTriangleCoordinates(firstCorner, secondCorner) {
  const projectedFirst = L.CRS.EPSG3857.project(firstCorner);
  const projectedSecond = L.CRS.EPSG3857.project(secondCorner);

  const left = Math.min(projectedFirst.x, projectedSecond.x);
  const right = Math.max(projectedFirst.x, projectedSecond.x);
  const top = Math.min(projectedFirst.y, projectedSecond.y);
  const bottom = Math.max(projectedFirst.y, projectedSecond.y);
  const middleX = (left + right) / 2;

  const points = [
    L.point(middleX, top),
    L.point(right, bottom),
    L.point(left, bottom),
    L.point(middleX, top)
  ];

  return points.map((point) => {
    const latlng = L.CRS.EPSG3857.unproject(point);
    return [latlng.lat, latlng.lng];
  });
}

function createRhombusCoordinates(center, radiusPoint) {
  const projectedCenter = L.CRS.EPSG3857.project(center);
  const projectedRadius = L.CRS.EPSG3857.project(radiusPoint);

  const radiusX = Math.abs(projectedRadius.x - projectedCenter.x);
  const radiusY = Math.abs(projectedRadius.y - projectedCenter.y);

  const points = [
    L.point(projectedCenter.x, projectedCenter.y - radiusY),
    L.point(projectedCenter.x + radiusX, projectedCenter.y),
    L.point(projectedCenter.x, projectedCenter.y + radiusY),
    L.point(projectedCenter.x - radiusX, projectedCenter.y),
    L.point(projectedCenter.x, projectedCenter.y - radiusY)
  ];

  return points.map((point) => {
    const latlng = L.CRS.EPSG3857.unproject(point);
    return [latlng.lat, latlng.lng];
  });
}

function createRegularPolygonCoordinates(center, radiusPoint, sides = 6) {
  const safeSides = Math.max(3, Math.min(Number(sides) || 6, 64));
  const projectedCenter = L.CRS.EPSG3857.project(center);
  const projectedRadius = L.CRS.EPSG3857.project(radiusPoint);
  const radius = projectedCenter.distanceTo(projectedRadius);
  const coordinates = [];
  const startAngle = -Math.PI / 2;

  for (let index = 0; index <= safeSides; index += 1) {
    const angle = startAngle + (index / safeSides) * Math.PI * 2;

    const point = L.point(
      projectedCenter.x + Math.cos(angle) * radius,
      projectedCenter.y + Math.sin(angle) * radius
    );

    const latlng = L.CRS.EPSG3857.unproject(point);
    coordinates.push([latlng.lat, latlng.lng]);
  }

  return coordinates;
}

function updateRegularPolygonWheelZoomState(appState) {
  const shouldLock =
    appState.activeTool === "draw-regular-polygon" &&
    appState.vectorDraft &&
    appState.vectorDraft.points &&
    appState.vectorDraft.points.length === 1;

  setMapWheelZoomLock(appState, shouldLock, "regular-polygon");
}

function setMapWheelZoomLock(appState, shouldLock, reason) {
  if (!appState.map || !appState.map.scrollWheelZoom) {
    return;
  }

  if (!appState.wheelZoomLock) {
    appState.wheelZoomLock = {
      locked: false,
      reason: null
    };
  }

  if (shouldLock) {
    if (!appState.wheelZoomLock.locked) {
      appState.map.scrollWheelZoom.disable();
    }

    appState.wheelZoomLock.locked = true;
    appState.wheelZoomLock.reason = reason;
    return;
  }

  if (appState.wheelZoomLock.locked && appState.wheelZoomLock.reason === reason) {
    appState.map.scrollWheelZoom.enable();
    appState.wheelZoomLock.locked = false;
    appState.wheelZoomLock.reason = null;
  }
}

function setMapDraggingForTool(appState) {
  if (!appState.map || !appState.map.dragging) {
    return;
  }

  if (isVectorDrawingTool(appState.activeTool) || appState.activeTool === "select") {
    if (appState.map.dragging.enabled()) {
      appState.map.dragging.disable();
    }

    return;
  }

  if (!appState.map.dragging.enabled()) {
    appState.map.dragging.enable();
  }
}

function isVectorDrawingTool(toolId) {
  return [
    "draw-point",
    "draw-line",
    "draw-polyline",
    "draw-arc",
    "draw-polygon",
    "draw-rectangle",
    "draw-square",
    "draw-circle",
    "draw-ellipse",
    "draw-triangle",
    "draw-rhombus",
    "draw-regular-polygon"
  ].includes(toolId);
}


