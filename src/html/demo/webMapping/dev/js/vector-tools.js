function setupVectorTools(appState) {
  appState.vectorDraft = {
    tool: null,
    points: [],
    tempLayer: L.layerGroup().addTo(appState.map),
    suppressNextClick: false
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
}

function onVectorToolChanged(appState, toolId) {
  cancelVectorDraft(appState);
  cancelBoxSelect(appState);
  clearVectorSelection(appState);

  if (!isVectorDrawingTool(toolId)) {
    appState.vectorDraft.tool = null;
    setMapDraggingForTool(appState);
    return;
  }

  appState.vectorDraft.tool = toolId;
  appState.vectorDraft.points = [];
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

  if (appState.activeTool === "draw-line" && appState.vectorDraft.points.length === 2) {
    createLineFromDraft(appState, activeLayer);
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
}

function resetDraftPoints(appState) {
  appState.vectorDraft.points = [];
  appState.vectorDraft.tempLayer.clearLayers();
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
    "draw-polygon",
    "draw-rectangle",
    "draw-square",
    "draw-circle"
  ].includes(toolId);
}
