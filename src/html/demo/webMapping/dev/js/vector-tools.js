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

  appState.rightSelection = {
    active: false,
    rectangle: null,
    pointerId: null
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

    if (appState.activeTool === "select") {
      return;
    }

    handleVectorMapClick(appState, event.latlng);
  });

  appState.map.on("dblclick", (event) => {
    L.DomEvent.stop(event);
    appState.vectorDraft.suppressNextClick = true;
  });

  appState.map.on("mousemove", (event) => {
    const previewLatLng = isVectorDrawingTool(appState.activeTool) && typeof getSnappedLatLng === "function"
      ? getSnappedLatLng(appState, event.latlng)
      : event.latlng;

    if (!isVectorDrawingTool(appState.activeTool) && typeof clearSnapMarker === "function") {
      clearSnapMarker(appState);
    }

    updateVectorPreview(appState, previewLatLng);
  });

  const mapContainer = appState.map.getContainer();

  mapContainer.addEventListener("pointerdown", (event) => {
    if (appState.activeTool === "select" && event.button === 2) {
      beginRightPointerSelection(appState, event);
      return;
    }

    if (event.button === 1) {
      startMiddleMousePan(appState, event);
    }
  }, true);

  mapContainer.addEventListener("pointermove", (event) => {
    if (appState.rightSelection && appState.rightSelection.active) {
      updateRightPointerSelection(appState, event);
      return;
    }
  }, true);

  mapContainer.addEventListener("pointerup", (event) => {
    if (appState.rightSelection && appState.rightSelection.active) {
      finishRightPointerSelection(appState, event);
      return;
    }
  }, true);

  mapContainer.addEventListener("pointercancel", () => {
    cancelRightPointerSelection(appState);
  }, true);

  document.addEventListener("mousemove", (event) => {
    if (appState.middlePan.active) {
      updateMiddleMousePan(appState, event);
    }
  }, true);

  document.addEventListener("mouseup", (event) => {
    if (event.button === 1 && appState.middlePan.active) {
      stopMiddleMousePan(appState, event);
    }
  }, true);

  mapContainer.addEventListener("wheel", (event) => {
    handleRegularPolygonWheel(appState, event);
  }, { passive: false });

  mapContainer.addEventListener("contextmenu", (event) => {
    if (appState.activeTool === "select") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cancelVectorDraft(appState);
      cancelBoxSelect(appState);
      cancelRightPointerSelection(appState);
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





function shouldSuppressSelectMapClear(appState, event) {
  if (appState.suppressNextSelectMapClear) {
    return true;
  }

  const target = event && event.originalEvent
    ? event.originalEvent.target
    : null;

  if (!target || !target.closest) {
    return false;
  }

  return Boolean(
    target.closest(".leaflet-interactive") ||
    target.closest(".leaflet-marker-icon") ||
    target.closest(".leaflet-marker-shadow")
  );
}

function onVectorToolChanged(appState, toolId) {
  cancelVectorDraft(appState);
  cancelBoxSelect(appState);

  if (toolId !== "join") {
    clearJoinSelection(appState);
    clearVectorSelection(appState);
  }

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





function handleJoinToolClick(appState, layer, entity, shiftKey = false) {
  if (!appState.joinSelection) {
    appState.joinSelection = [];
  }

  if (!isJoinableEntity(entity)) {
    return;
  }

  const existingIndex = appState.joinSelection.findIndex((item) => {
    return item.layerId === layer.internalId && item.entityId === entity.id;
  });

  if (existingIndex >= 0) {
    appState.joinSelection.splice(existingIndex, 1);
    entity.state.selected = false;
  } else {
    appState.joinSelection.push({
      layerId: layer.internalId,
      entityId: entity.id
    });
    entity.state.selected = true;
  }

  redrawVectorLayer(appState, layer);
  updateSelectedFeaturesCount(appState);

  if (!shiftKey && appState.joinSelection.length >= 2) {
    tryJoinSelectedEntities(appState);
  }
}

function isJoinableEntity(entity) {
  if (!entity || !entity.geometry) {
    return false;
  }

  if (entity.geometry.type === "Point") {
    return false;
  }

  if (entity.geometry.type === "Polygon") {
    return true;
  }

  return [
    "Line",
    "Polyline",
    "Arc"
  ].includes(entity.entityType);
}

function tryJoinSelectedEntities(appState) {
  const activeLayer = getActiveLayer(appState);

  if (!activeLayer || !appState.joinSelection || appState.joinSelection.length < 2) {
    return;
  }

  const selectedEntities = appState.joinSelection
    .map((selection) => {
      return findEntityByLayerAndId(appState, selection.layerId, selection.entityId);
    })
    .filter(Boolean)
    .filter((item) => item.layer.internalId === activeLayer.internalId)
    .map((item) => item.entity);

  if (selectedEntities.length < 2) {
    return;
  }

  const joinedCoordinates = buildJoinedClosedCoordinates(appState, selectedEntities);

  if (!joinedCoordinates) {
    return;
  }

  const joinedEntity = {
    entityType: "JoinedPolygon",
    geometry: {
      type: "Polygon",
      coordinates: joinedCoordinates
    },
    properties: {
      sourceEntityIds: selectedEntities.map((entity) => entity.id),
      joinedAt: createGeoWorksTimestamp()
    }
  };

  selectedEntities.forEach((entity) => {
    removeVectorEntityById(activeLayer, entity.id);
  });

  addVectorEntity(appState, activeLayer, joinedEntity);

  appState.joinSelection = [];
  clearVectorSelection(appState);
  redrawVectorLayer(appState, activeLayer);
  renderLayersPanel(appState);
  updateSelectedFeaturesCount(appState);
}

function findEntityByLayerAndId(appState, layerId, entityId) {
  const layer = appState.layers.find((candidate) => candidate.internalId === layerId);

  if (!layer || !layer.data || !layer.data.entities) {
    return null;
  }

  const entity = layer.data.entities.find((candidate) => candidate.id === entityId);

  if (!entity) {
    return null;
  }

  return {
    layer,
    entity
  };
}

function removeVectorEntityById(layer, entityId) {
  if (!layer || !layer.data || !Array.isArray(layer.data.entities)) {
    return;
  }

  layer.data.entities = layer.data.entities.filter((entity) => entity.id !== entityId);
}

function buildJoinedClosedCoordinates(appState, entities) {
  const parts = entities
    .map((entity) => getJoinableCoordinates(entity))
    .filter((coordinates) => coordinates.length >= 2);

  if (parts.length < 2) {
    return null;
  }

  const tolerance = appState.snap && appState.snap.tolerancePixels
    ? appState.snap.tolerancePixels
    : 12;

  let chain = [...parts[0]];
  const remaining = parts.slice(1);

  while (remaining.length > 0) {
    const match = findNextJoinPart(appState, chain, remaining, tolerance);

    if (!match) {
      return null;
    }

    const nextCoordinates = match.reversed
      ? [...remaining[match.index]].reverse()
      : [...remaining[match.index]];

    chain = mergeCoordinateChains(chain, nextCoordinates);
    remaining.splice(match.index, 1);
  }

  if (!areCoordinatesCloseOnScreen(appState, chain[0], chain[chain.length - 1], tolerance)) {
    return null;
  }

  chain = closeCoordinatesIfNeededForJoin(chain);

  if (chain.length < 4) {
    return null;
  }

  return chain;
}

function getJoinableCoordinates(entity) {
  if (!entity || !entity.geometry || !Array.isArray(entity.geometry.coordinates)) {
    return [];
  }

  if (entity.geometry.type === "Polygon") {
    return entity.geometry.coordinates;
  }

  return entity.geometry.coordinates;
}

function findNextJoinPart(appState, chain, remaining, tolerance) {
  const chainEnd = chain[chain.length - 1];

  for (let index = 0; index < remaining.length; index += 1) {
    const coordinates = remaining[index];
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    if (areCoordinatesCloseOnScreen(appState, chainEnd, first, tolerance)) {
      return {
        index,
        reversed: false
      };
    }

    if (areCoordinatesCloseOnScreen(appState, chainEnd, last, tolerance)) {
      return {
        index,
        reversed: true
      };
    }
  }

  return null;
}

function mergeCoordinateChains(first, second) {
  if (coordinatesEqual(first[first.length - 1], second[0])) {
    return [...first, ...second.slice(1)];
  }

  return [...first, ...second];
}

function coordinatesEqual(first, second) {
  return first &&
    second &&
    Math.abs(first[0] - second[0]) < 1e-12 &&
    Math.abs(first[1] - second[1]) < 1e-12;
}

function areCoordinatesCloseOnScreen(appState, firstCoordinate, secondCoordinate, tolerancePixels) {
  const firstLatLng = coordinateToLatLng(firstCoordinate);
  const secondLatLng = coordinateToLatLng(secondCoordinate);
  const firstPoint = appState.map.latLngToContainerPoint(firstLatLng);
  const secondPoint = appState.map.latLngToContainerPoint(secondLatLng);

  return firstPoint.distanceTo(secondPoint) <= tolerancePixels;
}

function closeCoordinatesIfNeededForJoin(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (coordinatesEqual(first, last)) {
    return coordinates;
  }

  return [...coordinates, first];
}

function clearJoinSelection(appState) {
  if (!appState.joinSelection || appState.joinSelection.length === 0) {
    return;
  }

  appState.joinSelection.forEach((selection) => {
    const result = findEntityByLayerAndId(appState, selection.layerId, selection.entityId);

    if (result && result.entity.state) {
      result.entity.state.selected = false;
      redrawVectorLayer(appState, result.layer);
    }
  });

  appState.joinSelection = [];
  updateSelectedFeaturesCount(appState);
}



function shouldIgnoreSelectMapClick(appState, event) {
  if (event && event.originalEvent && event.originalEvent._gwHandledVectorEntityClick) {
    return true;
  }

  if (appState.lastVectorEntityClickAt && Date.now() - appState.lastVectorEntityClickAt < 250) {
    return true;
  }

  const target = event && event.originalEvent
    ? event.originalEvent.target
    : null;

  if (target && target.closest) {
    if (
      target.closest(".leaflet-interactive") ||
      target.closest(".leaflet-marker-icon") ||
      target.closest(".leaflet-marker-shadow")
    ) {
      return true;
    }
  }

  return false;
}

function handleVectorMapClick(appState, latlng) {
  const activeLayer = getActiveLayer(appState);

  if (appState.activeTool === "select") {
    return;
  }

  if (!activeLayer || activeLayer.dataType !== "Vector") {
    return;
  }

  if (!isVectorDrawingTool(appState.activeTool)) {
    return;
  }

  const drawLatLng = typeof getSnappedLatLng === "function"
    ? getSnappedLatLng(appState, latlng)
    : latlng;

  if (appState.activeTool === "draw-point") {
    addVectorEntity(appState, activeLayer, {
      entityType: "Point",
      geometry: {
        type: "Point",
        coordinates: latLngToCoordinate(drawLatLng)
      }
    });

    return;
  }

  if (typeof shouldClosePolylineDraft === "function" && shouldClosePolylineDraft(appState, drawLatLng)) {
    appState.vectorDraft.points.push(appState.vectorDraft.points[0]);
    finishCurrentVectorDraft(appState);
    return;
  }

  appState.vectorDraft.points.push(drawLatLng);
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

  updateVectorPreview(appState, drawLatLng);
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
  return;
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




function areLatLngsCloseForClosure(appState, firstLatLng, lastLatLng) {
  if (!firstLatLng || !lastLatLng || !appState.map) {
    return false;
  }

  const firstPoint = appState.map.latLngToContainerPoint(firstLatLng);
  const lastPoint = appState.map.latLngToContainerPoint(lastLatLng);
  const tolerance = appState.snap && appState.snap.tolerancePixels
    ? appState.snap.tolerancePixels
    : 10;

  return firstPoint.distanceTo(lastPoint) <= tolerance;
}

function closeCoordinatesIfNeeded(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

function shouldClosePolylineDraft(appState, candidateLatLng) {
  const points = appState.vectorDraft && appState.vectorDraft.points
    ? appState.vectorDraft.points
    : [];

  if (appState.activeTool !== "draw-polyline") {
    return false;
  }

  if (points.length < 2) {
    return false;
  }

  return areLatLngsCloseForClosure(appState, points[0], candidateLatLng);
}


function finishCurrentVectorDraft(appState) {
  const activeLayer = getActiveLayer(appState);

  if (!activeLayer || !appState.vectorDraft || !appState.vectorDraft.points) {
    return;
  }

  if (appState.activeTool === "draw-polyline" && appState.vectorDraft.points.length >= 2) {
    const points = appState.vectorDraft.points;
    const first = points[0];
    const last = points[points.length - 1];
    const isClosed = points.length >= 3 && areLatLngsCloseForClosure(appState, first, last);

    let coordinates = points.map(latLngToCoordinate);

    if (isClosed) {
      coordinates = closeCoordinatesIfNeeded(coordinates);

      addVectorEntity(appState, activeLayer, {
        entityType: "ClosedPolyline",
        geometry: {
          type: "Polygon",
          coordinates
        }
      });
    } else {
      addVectorEntity(appState, activeLayer, {
        entityType: "Polyline",
        geometry: {
          type: "LineString",
          coordinates
        }
      });
    }

    resetDraftPoints(appState);
    return;
  }

  if (appState.activeTool === "draw-polygon" && appState.vectorDraft.points.length >= 3) {
    const coordinates = closeCoordinatesIfNeeded(
      appState.vectorDraft.points.map(latLngToCoordinate)
    );

    addVectorEntity(appState, activeLayer, {
      entityType: "Polygon",
      geometry: {
        type: "Polygon",
        coordinates
      }
    });

    resetDraftPoints(appState);
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




/* ------------------------------------------------------------
   Version 054 fixed — Join selected entities
------------------------------------------------------------ */

function joinCurrentlySelectedEntities(appState) {
  const activeLayer = getActiveLayer(appState);

  if (!activeLayer || !activeLayer.data || !Array.isArray(activeLayer.data.entities)) {
    alert("Join requires an active vector layer.");
    return;
  }

  const selectedEntities = getSelectedJoinableEntitiesFromLayer(appState, activeLayer);

  if (selectedEntities.length < 2) {
    alert("Select at least two joinable entities from the active layer.");
    return;
  }

  const joinedCoordinates = buildJoinedClosedCoordinatesFromEntities(appState, selectedEntities);

  if (!joinedCoordinates) {
    alert("Selected entities do not form a closed loop. Make sure endpoints touch or snap together.");
    return;
  }

  const joinedEntity = {
    entityType: "JoinedPolygon",
    geometry: {
      type: "Polygon",
      coordinates: joinedCoordinates
    },
    properties: {
      sourceEntityIds: selectedEntities.map((entity) => entity.id),
      joinedAt: createGeoWorksTimestamp()
    }
  };

  selectedEntities.forEach((entity) => {
    removeVectorEntityById(activeLayer, entity.id);
  });

  addVectorEntity(appState, activeLayer, joinedEntity);

  clearVectorSelection(appState);
  redrawVectorLayer(appState, activeLayer);

  if (typeof renderLayersPanel === "function") {
    renderLayersPanel(appState);
  }

  if (typeof updateSelectedFeaturesCount === "function") {
    updateSelectedFeaturesCount(appState);
  }
}

function getSelectedJoinableEntitiesFromLayer(appState, activeLayer) {
  if (!Array.isArray(appState.selectedEntities)) {
    appState.selectedEntities = [];
  }

  const selectedIds = appState.selectedEntities
    .filter((selection) => selection.layerId === activeLayer.internalId)
    .map((selection) => selection.entityId);

  return activeLayer.data.entities.filter((entity) => {
    return selectedIds.includes(entity.id) && isJoinableEntityForJoinTool(entity);
  });
}


function isJoinableEntityForJoinTool(entity) {
  if (!entity || !entity.geometry) {
    return false;
  }

  if (entity.geometry.type === "Point") {
    return false;
  }

  return [
    "Line",
    "Polyline",
    "Arc",
    "Polygon",
    "ClosedPolyline",
    "Rectangle",
    "Square",
    "Circle",
    "Ellipse",
    "Triangle",
    "Rhombus",
    "RegularPolygon",
    "JoinedPolygon"
  ].includes(entity.entityType) || entity.geometry.type === "LineString" || entity.geometry.type === "Polygon";
}

function buildJoinedClosedCoordinatesFromEntities(appState, entities) {
  const parts = entities
    .map((entity) => getJoinCoordinates(entity))
    .filter((coordinates) => coordinates.length >= 2);

  if (parts.length < 2) {
    return null;
  }

  const tolerance = appState.snap && appState.snap.tolerancePixels
    ? appState.snap.tolerancePixels
    : 12;

  let chain = [...parts[0]];
  const remaining = parts.slice(1);

  while (remaining.length > 0) {
    const match = findNextJoinPart(appState, chain, remaining, tolerance);

    if (!match) {
      return null;
    }

    const nextCoordinates = match.reversed
      ? [...remaining[match.index]].reverse()
      : [...remaining[match.index]];

    chain = mergeCoordinateChains(chain, nextCoordinates, appState, tolerance);
    remaining.splice(match.index, 1);
  }

  if (!areCoordinatesCloseOnScreen(appState, chain[0], chain[chain.length - 1], tolerance)) {
    return null;
  }

  chain = closeCoordinatesForJoin(chain);

  if (chain.length < 4) {
    return null;
  }

  return chain;
}

function getJoinCoordinates(entity) {
  if (!entity || !entity.geometry || !Array.isArray(entity.geometry.coordinates)) {
    return [];
  }

  if (entity.geometry.type === "Polygon") {
    return stripClosingCoordinate(entity.geometry.coordinates);
  }

  return entity.geometry.coordinates;
}

function stripClosingCoordinate(coordinates) {
  if (coordinates.length < 2) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (coordinatesEqualForJoin(first, last)) {
    return coordinates.slice(0, -1);
  }

  return coordinates;
}

function findNextJoinPart(appState, chain, remaining, tolerance) {
  const chainEnd = chain[chain.length - 1];

  for (let index = 0; index < remaining.length; index += 1) {
    const coordinates = remaining[index];
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];

    if (areCoordinatesCloseOnScreen(appState, chainEnd, first, tolerance)) {
      return {
        index,
        reversed: false
      };
    }

    if (areCoordinatesCloseOnScreen(appState, chainEnd, last, tolerance)) {
      return {
        index,
        reversed: true
      };
    }
  }

  return null;
}

function mergeCoordinateChains(first, second, appState, tolerance) {
  const firstEnd = first[first.length - 1];
  const secondStart = second[0];

  if (
    coordinatesEqualForJoin(firstEnd, secondStart) ||
    areCoordinatesCloseOnScreen(appState, firstEnd, secondStart, tolerance)
  ) {
    return [...first, ...second.slice(1)];
  }

  return [...first, ...second];
}

function closeCoordinatesForJoin(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (coordinatesEqualForJoin(first, last)) {
    return coordinates;
  }

  return [...coordinates, first];
}

function coordinatesEqualForJoin(first, second) {
  return first &&
    second &&
    Math.abs(first[0] - second[0]) < 1e-12 &&
    Math.abs(first[1] - second[1]) < 1e-12;
}

function areCoordinatesCloseOnScreen(appState, firstCoordinate, secondCoordinate, tolerancePixels) {
  const firstLatLng = coordinateToLatLng(firstCoordinate);
  const secondLatLng = coordinateToLatLng(secondCoordinate);
  const firstPoint = appState.map.latLngToContainerPoint(firstLatLng);
  const secondPoint = appState.map.latLngToContainerPoint(secondLatLng);

  return firstPoint.distanceTo(secondPoint) <= tolerancePixels;
}

function removeVectorEntityById(layer, entityId) {
  if (!layer || !layer.data || !Array.isArray(layer.data.entities)) {
    return;
  }

  layer.data.entities = layer.data.entities.filter((entity) => entity.id !== entityId);
}



/* Version 054 — restored empty-map clear helper */
function isMapClickFromVectorEntity(event) {
  if (event && event.originalEvent && event.originalEvent._gwVectorEntityClicked) {
    return true;
  }

  const target = event && event.originalEvent
    ? event.originalEvent.target
    : null;

  if (!target || !target.closest) {
    return false;
  }

  return Boolean(
    target.closest(".leaflet-interactive") ||
    target.closest(".leaflet-marker-icon") ||
    target.closest(".leaflet-marker-shadow")
  );
}



/* ------------------------------------------------------------
   Version 054 — rewritten select click guards
------------------------------------------------------------ */

function isClickOnVectorEntity(event) {
  if (event && event.originalEvent && event.originalEvent._gwEntityClick) {
    return true;
  }

  if (window.event && window.event._gwEntityClick) {
    return true;
  }

  const target = event && event.originalEvent
    ? event.originalEvent.target
    : null;

  if (!target || !target.closest) {
    return false;
  }

  return Boolean(
    target.closest(".leaflet-interactive") ||
    target.closest(".leaflet-marker-icon") ||
    target.closest(".leaflet-marker-shadow")
  );
}

function didEntityClickJustHappen(appState) {
  return Boolean(appState.lastEntityClickTime && Date.now() - appState.lastEntityClickTime < 300);
}



/* ------------------------------------------------------------
   Version 054 — map-hit selection logic
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 10;
  let bestHit = null;

  const visibleVectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  /*
    Iterate from top to bottom so visually upper layers/entities win.
  */
  [...visibleVectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null) {
        return;
      }

      if (distance <= tolerance && (!bestHit || distance < bestHit.distance)) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToPolylineSegments(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToPolylineSegments(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToPolylineSegments(appState, clickPoint, latlngs, closed) {
  if (latlngs.length === 0) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const segmentCount = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectContainerPointToSegment(clickPoint, a, b);
    const distance = clickPoint.distanceTo(projected);

    minDistance = Math.min(minDistance, distance);
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectContainerPointToSegment(point, start, end) {
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

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function handleSelectMapClick(appState, event) {
  const hit = getVectorHitAtLatLng(appState, event.latlng);
  const shiftPressed = Boolean(event.originalEvent && event.originalEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed && isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}

function handleSelectContextMenu(appState, event) {
  L.DomEvent.preventDefault(event);
  L.DomEvent.stopPropagation(event);

  const latlng = appState.map.mouseEventToLatLng(event);
  const hit = getVectorHitAtLatLng(appState, latlng);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    removeEntityFromSelection(appState, hit.layerId, hit.entityId);
  } else {
    addEntityToSelection(appState, hit.layerId, hit.entityId);
  }
}



/* ------------------------------------------------------------
   Version 054 — left-click map hit selection
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 12;
  let bestHit = null;

  const vectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  [...vectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null || distance > tolerance) {
        return;
      }

      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToSegments(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToSegments(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToSegments(appState, clickPoint, latlngs, closed) {
  if (latlngs.length < 1) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const count = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < count; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegmentForHit(clickPoint, a, b);
    minDistance = Math.min(minDistance, clickPoint.distanceTo(projected));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectPointToSegmentForHit(point, start, end) {
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

  return L.point(start.x + t * dx, start.y + t * dy);
}

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function handleSelectLeftClick(appState, event) {
  const hit = getVectorHitAtLatLng(appState, event.latlng);
  const shiftPressed = Boolean(event.originalEvent && event.originalEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed && isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}



/* ------------------------------------------------------------
   Version 054 — right-click hit-testing selection
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 12;
  let bestHit = null;

  const vectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  [...vectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null || distance > tolerance) {
        return;
      }

      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToSegments(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToSegments(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToSegments(appState, clickPoint, latlngs, closed) {
  if (latlngs.length < 1) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const count = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < count; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegmentForHit(clickPoint, a, b);
    minDistance = Math.min(minDistance, clickPoint.distanceTo(projected));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectPointToSegmentForHit(point, start, end) {
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

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function handleSelectRightClick(appState, latlng, originalEvent) {
  const hit = getVectorHitAtLatLng(appState, latlng);
  const shiftPressed = Boolean(originalEvent && originalEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed && isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    return;
  }

  if (isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}



/* ------------------------------------------------------------
   Version 054 — all selection with right mouse button
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 12;
  let bestHit = null;

  const vectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  [...vectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null || distance > tolerance) {
        return;
      }

      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToSegments(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToSegments(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToSegments(appState, clickPoint, latlngs, closed) {
  if (latlngs.length < 1) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const count = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < count; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegmentForHit(clickPoint, a, b);
    minDistance = Math.min(minDistance, clickPoint.distanceTo(projected));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectPointToSegmentForHit(point, start, end) {
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

  return L.point(start.x + t * dx, start.y + t * dy);
}

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function handleSelectRightClick(appState, latlng, originalEvent) {
  const hit = getVectorHitAtLatLng(appState, latlng);
  const shiftPressed = Boolean(originalEvent && originalEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed && isSelectionEntry(appState, hit.layerId, hit.entityId)) {
    removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    return;
  }

  if (!shiftPressed) {
    addEntityToSelection(appState, hit.layerId, hit.entityId);
  }
}

function startRightBoxSelect(appState, mouseEvent) {
  if (appState.activeTool !== "select" || mouseEvent.button !== 2) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const startPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const startLatLng = appState.map.mouseEventToLatLng(mouseEvent);

  appState.rightBoxSelect = {
    active: true,
    startPoint,
    startLatLng,
    lastPoint: startPoint,
    moved: false,
    shiftKey: Boolean(mouseEvent.shiftKey),
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.disable();
  }

  return true;
}

function updateRightBoxSelect(appState, mouseEvent) {
  if (!appState.rightBoxSelect || !appState.rightBoxSelect.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const currentPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const currentLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = currentPoint.distanceTo(appState.rightBoxSelect.startPoint);

  appState.rightBoxSelect.lastPoint = currentPoint;

  if (dragDistance < 4) {
    return true;
  }

  appState.rightBoxSelect.moved = true;

  const bounds = L.latLngBounds(
    appState.rightBoxSelect.startLatLng,
    currentLatLng
  );

  if (!appState.rightBoxSelect.rectangle) {
    appState.rightBoxSelect.rectangle = L.rectangle(bounds, {
      pane: "overlayPane",
      interactive: false,
      color: "#1f66d1",
      weight: 1,
      opacity: 0.9,
      fillColor: "#1f66d1",
      fillOpacity: 0.08,
      dashArray: "4 4"
    }).addTo(appState.map);
  } else {
    appState.rightBoxSelect.rectangle.setBounds(bounds);
  }

  return true;
}

function finishRightBoxSelect(appState, mouseEvent) {
  if (!appState.rightBoxSelect || !appState.rightBoxSelect.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const selection = appState.rightBoxSelect;
  const endPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const endLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = endPoint.distanceTo(selection.startPoint);

  if (selection.rectangle) {
    appState.map.removeLayer(selection.rectangle);
  }

  appState.rightBoxSelect = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }

  if (dragDistance < 4 || !selection.moved) {
    handleSelectRightClick(appState, selection.startLatLng, mouseEvent);
    return true;
  }

  const bounds = L.latLngBounds(selection.startLatLng, endLatLng);
  const upwardSelection = endPoint.y < selection.startPoint.y;
  const hits = findEntitiesInSelectionBox(appState, bounds, upwardSelection);

  if (hits.length === 0) {
    clearVectorSelection(appState);
    return true;
  }

  hits.forEach((hit) => {
    if (selection.shiftKey || mouseEvent.shiftKey) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    } else {
      addEntityToSelection(appState, hit.layerId, hit.entityId);
    }
  });

  return true;
}

function cancelRightBoxSelect(appState) {
  if (!appState.rightBoxSelect || !appState.rightBoxSelect.active) {
    return;
  }

  if (appState.rightBoxSelect.rectangle) {
    appState.map.removeLayer(appState.rightBoxSelect.rectangle);
  }

  appState.rightBoxSelect = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }
}



/* ------------------------------------------------------------
   Version 054 — right mouse only selection engine
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 12;
  let bestHit = null;

  const vectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  [...vectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null || distance > tolerance) {
        return;
      }

      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, closed) {
  if (latlngs.length < 1) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const count = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < count; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegmentForHit(clickPoint, a, b);
    minDistance = Math.min(minDistance, clickPoint.distanceTo(projected));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectPointToSegmentForHit(point, start, end) {
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

  return L.point(start.x + t * dx, start.y + t * dy);
}

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function handleRightSingleSelection(appState, mouseEvent) {
  const latlng = appState.map.mouseEventToLatLng(mouseEvent);
  const hit = getVectorHitAtLatLng(appState, latlng);
  const shiftPressed = Boolean(mouseEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed) {
    if (isSelectionEntry(appState, hit.layerId, hit.entityId)) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    }
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}

function beginRightSelection(appState, mouseEvent) {
  if (appState.activeTool !== "select" || mouseEvent.button !== 2) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const startPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const startLatLng = appState.map.mouseEventToLatLng(mouseEvent);

  appState.rightSelection = {
    active: true,
    startPoint,
    currentPoint: startPoint,
    startLatLng,
    moved: false,
    shiftKey: Boolean(mouseEvent.shiftKey),
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.disable();
  }

  return true;
}

function updateRightSelection(appState, mouseEvent) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const currentPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const currentLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = currentPoint.distanceTo(appState.rightSelection.startPoint);

  appState.rightSelection.currentPoint = currentPoint;

  if (dragDistance < 4) {
    return true;
  }

  appState.rightSelection.moved = true;

  const bounds = L.latLngBounds(appState.rightSelection.startLatLng, currentLatLng);

  if (!appState.rightSelection.rectangle) {
    appState.rightSelection.rectangle = L.rectangle(bounds, {
      interactive: false,
      color: "#1f66d1",
      weight: 1,
      opacity: 0.9,
      fillColor: "#1f66d1",
      fillOpacity: 0.08,
      dashArray: "4 4"
    }).addTo(appState.map);
  } else {
    appState.rightSelection.rectangle.setBounds(bounds);
  }

  return true;
}

function finishRightSelection(appState, mouseEvent) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const selection = appState.rightSelection;
  const endPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const endLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = endPoint.distanceTo(selection.startPoint);

  if (selection.rectangle) {
    appState.map.removeLayer(selection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }

  if (!selection.moved || dragDistance < 4) {
    handleRightSingleSelection(appState, mouseEvent);
    return true;
  }

  const bounds = L.latLngBounds(selection.startLatLng, endLatLng);
  const upwardSelection = endPoint.y < selection.startPoint.y;
  const hits = findEntitiesInSelectionBox(appState, bounds, upwardSelection);
  const shouldRemove = selection.shiftKey || Boolean(mouseEvent.shiftKey);

  if (hits.length === 0) {
    clearVectorSelection(appState);
    return true;
  }

  hits.forEach((hit) => {
    if (shouldRemove) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    } else {
      addEntityToSelection(appState, hit.layerId, hit.entityId);
    }
  });

  return true;
}

function cancelRightSelection(appState) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return;
  }

  if (appState.rightSelection.rectangle) {
    appState.map.removeLayer(appState.rightSelection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }
}



/* ------------------------------------------------------------
   Version 054 — right mouse only selection engine, final wiring
------------------------------------------------------------ */

function handleRightSingleSelection(appState, mouseEvent) {
  const latlng = appState.map.mouseEventToLatLng(mouseEvent);
  const hit = getVectorHitAtLatLng(appState, latlng);
  const shiftPressed = Boolean(mouseEvent.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed) {
    if (isSelectionEntry(appState, hit.layerId, hit.entityId)) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    }
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}

function beginRightSelection(appState, mouseEvent) {
  if (appState.activeTool !== "select" || mouseEvent.button !== 2) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const startPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const startLatLng = appState.map.mouseEventToLatLng(mouseEvent);

  appState.rightSelection = {
    active: true,
    startPoint,
    currentPoint: startPoint,
    startLatLng,
    moved: false,
    shiftKey: Boolean(mouseEvent.shiftKey),
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.disable();
  }

  return true;
}

function updateRightSelection(appState, mouseEvent) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const currentPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const currentLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = currentPoint.distanceTo(appState.rightSelection.startPoint);

  appState.rightSelection.currentPoint = currentPoint;

  if (dragDistance < 4) {
    return true;
  }

  appState.rightSelection.moved = true;

  const bounds = L.latLngBounds(appState.rightSelection.startLatLng, currentLatLng);

  if (!appState.rightSelection.rectangle) {
    appState.rightSelection.rectangle = L.rectangle(bounds, {
      interactive: false,
      color: "#1f66d1",
      weight: 1,
      opacity: 0.9,
      fillColor: "#1f66d1",
      fillOpacity: 0.08,
      dashArray: "4 4"
    }).addTo(appState.map);
  } else {
    appState.rightSelection.rectangle.setBounds(bounds);
  }

  return true;
}

function finishRightSelection(appState, mouseEvent) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const selection = appState.rightSelection;
  const endPoint = appState.map.mouseEventToContainerPoint(mouseEvent);
  const endLatLng = appState.map.mouseEventToLatLng(mouseEvent);
  const dragDistance = endPoint.distanceTo(selection.startPoint);

  if (selection.rectangle) {
    appState.map.removeLayer(selection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }

  if (!selection.moved || dragDistance < 4) {
    handleRightSingleSelection(appState, mouseEvent);
    return true;
  }

  const bounds = L.latLngBounds(selection.startLatLng, endLatLng);
  const upwardSelection = endPoint.y < selection.startPoint.y;
  const hits = findEntitiesInSelectionBox(appState, bounds, upwardSelection);
  const shouldRemove = selection.shiftKey || Boolean(mouseEvent.shiftKey);

  if (hits.length === 0) {
    clearVectorSelection(appState);
    return true;
  }

  hits.forEach((hit) => {
    if (shouldRemove) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    } else {
      addEntityToSelection(appState, hit.layerId, hit.entityId);
    }
  });

  return true;
}

function cancelRightSelection(appState) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return;
  }

  if (appState.rightSelection.rectangle) {
    appState.map.removeLayer(appState.rightSelection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }
}



/* ------------------------------------------------------------
   Version 054 — right-pointer box selection engine
------------------------------------------------------------ */

function getVectorHitAtLatLng(appState, latlng) {
  const clickPoint = appState.map.latLngToContainerPoint(latlng);
  const tolerance = 12;
  let bestHit = null;

  const vectorLayers = appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked &&
      layer.data &&
      Array.isArray(layer.data.entities);
  });

  [...vectorLayers].reverse().forEach((layer) => {
    [...layer.data.entities].reverse().forEach((entity) => {
      const distance = getEntityScreenDistance(appState, entity, clickPoint, latlng);

      if (distance === null || distance > tolerance) {
        return;
      }

      if (!bestHit || distance < bestHit.distance) {
        bestHit = {
          layerId: layer.internalId,
          entityId: entity.id,
          distance
        };
      }
    });
  });

  return bestHit;
}

function getEntityScreenDistance(appState, entity, clickPoint, latlng) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = appState.map.latLngToContainerPoint(
      coordinateToLatLng(entity.geometry.coordinates)
    );

    return clickPoint.distanceTo(point);
  }

  const coordinates = entity.geometry.coordinates || [];

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const latlngs = coordinates.map(coordinateToLatLng);
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    if (isLatLngInsidePolygonForHit(latlng, latlngs)) {
      return 0;
    }

    return getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, true);
  }

  return getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, false);
}

function getEntityCategoryForHit(entity) {
  if (entity.geometry.type === "Point" || entity.entityType === "Point") {
    return "Point";
  }

  if (
    entity.geometry.type === "Polygon" ||
    [
      "Polygon",
      "ClosedPolyline",
      "JoinedPolygon",
      "Rectangle",
      "Square",
      "Circle",
      "Ellipse",
      "Triangle",
      "Rhombus",
      "RegularPolygon"
    ].includes(entity.entityType)
  ) {
    return "Polygon";
  }

  return "Line";
}

function getMinDistanceToSegmentsForHit(appState, clickPoint, latlngs, closed) {
  if (latlngs.length < 1) {
    return null;
  }

  if (latlngs.length === 1) {
    return clickPoint.distanceTo(appState.map.latLngToContainerPoint(latlngs[0]));
  }

  let minDistance = Infinity;
  const count = closed ? latlngs.length : latlngs.length - 1;

  for (let index = 0; index < count; index += 1) {
    const a = appState.map.latLngToContainerPoint(latlngs[index]);
    const b = appState.map.latLngToContainerPoint(latlngs[(index + 1) % latlngs.length]);
    const projected = projectPointToSegmentForHit(clickPoint, a, b);
    minDistance = Math.min(minDistance, clickPoint.distanceTo(projected));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

function projectPointToSegmentForHit(point, start, end) {
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

  return L.point(start.x + t * dx, start.y + t * dy);
}

function isLatLngInsidePolygonForHit(latlng, polygonLatLngs) {
  if (polygonLatLngs.length < 3) {
    return false;
  }

  const x = latlng.lng;
  const y = latlng.lat;
  let inside = false;

  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const xi = polygonLatLngs[i].lng;
    const yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng;
    const yj = polygonLatLngs[j].lat;

    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function beginRightPointerSelection(appState, event) {
  if (appState.activeTool !== "select" || event.button !== 2) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const mapContainer = appState.map.getContainer();

  if (mapContainer.setPointerCapture && event.pointerId !== undefined) {
    try {
      mapContainer.setPointerCapture(event.pointerId);
    } catch (error) {
      /* pointer capture can fail on some browsers; selection still works */
    }
  }

  const startPoint = appState.map.mouseEventToContainerPoint(event);
  const startLatLng = appState.map.mouseEventToLatLng(event);

  appState.rightSelection = {
    active: true,
    pointerId: event.pointerId,
    startPoint,
    currentPoint: startPoint,
    startLatLng,
    moved: false,
    shiftKey: Boolean(event.shiftKey),
    rectangle: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.disable();
  }

  return true;
}

function updateRightPointerSelection(appState, event) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  if (
    appState.rightSelection.pointerId !== null &&
    appState.rightSelection.pointerId !== undefined &&
    event.pointerId !== appState.rightSelection.pointerId
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const currentPoint = appState.map.mouseEventToContainerPoint(event);
  const currentLatLng = appState.map.mouseEventToLatLng(event);
  const dragDistance = currentPoint.distanceTo(appState.rightSelection.startPoint);

  appState.rightSelection.currentPoint = currentPoint;

  if (dragDistance < 4) {
    return true;
  }

  appState.rightSelection.moved = true;

  const bounds = L.latLngBounds(appState.rightSelection.startLatLng, currentLatLng);

  if (!appState.rightSelection.rectangle) {
    appState.rightSelection.rectangle = L.rectangle(bounds, {
      interactive: false,
      color: "#1f66d1",
      weight: 1,
      opacity: 0.9,
      fillColor: "#1f66d1",
      fillOpacity: 0.08,
      dashArray: "4 4"
    }).addTo(appState.map);
  } else {
    appState.rightSelection.rectangle.setBounds(bounds);
  }

  return true;
}

function finishRightPointerSelection(appState, event) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  if (
    appState.rightSelection.pointerId !== null &&
    appState.rightSelection.pointerId !== undefined &&
    event.pointerId !== appState.rightSelection.pointerId
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const selection = appState.rightSelection;
  const endPoint = appState.map.mouseEventToContainerPoint(event);
  const endLatLng = appState.map.mouseEventToLatLng(event);
  const dragDistance = endPoint.distanceTo(selection.startPoint);
  const mapContainer = appState.map.getContainer();

  if (mapContainer.releasePointerCapture && event.pointerId !== undefined) {
    try {
      mapContainer.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* ignore pointer capture release failures */
    }
  }

  if (selection.rectangle) {
    appState.map.removeLayer(selection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null,
    pointerId: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }

  if (!selection.moved || dragDistance < 4) {
    handleRightPointerSingleSelection(appState, event);
    return true;
  }

  const bounds = L.latLngBounds(selection.startLatLng, endLatLng);
  const upwardSelection = endPoint.y < selection.startPoint.y;
  const hits = findEntitiesInSelectionBox(appState, bounds, upwardSelection);
  const shouldRemove = selection.shiftKey || Boolean(event.shiftKey);

  if (hits.length === 0) {
    clearVectorSelection(appState);
    return true;
  }

  hits.forEach((hit) => {
    if (shouldRemove) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    } else {
      addEntityToSelection(appState, hit.layerId, hit.entityId);
    }
  });

  return true;
}

function handleRightPointerSingleSelection(appState, event) {
  const latlng = appState.map.mouseEventToLatLng(event);
  const hit = getVectorHitAtLatLng(appState, latlng);
  const shiftPressed = Boolean(event.shiftKey);

  if (!hit) {
    clearVectorSelection(appState);
    return;
  }

  if (shiftPressed) {
    if (isSelectionEntry(appState, hit.layerId, hit.entityId)) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    }
    return;
  }

  addEntityToSelection(appState, hit.layerId, hit.entityId);
}

function cancelRightPointerSelection(appState) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return;
  }

  if (appState.rightSelection.rectangle) {
    appState.map.removeLayer(appState.rightSelection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null,
    pointerId: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }
}

/* Compatibility wrappers: old names now point to pointer implementation. */
function beginRightSelection(appState, event) {
  return beginRightPointerSelection(appState, event);
}

function updateRightSelection(appState, event) {
  return updateRightPointerSelection(appState, event);
}

function finishRightSelection(appState, event) {
  return finishRightPointerSelection(appState, event);
}

function cancelRightSelection(appState) {
  return cancelRightPointerSelection(appState);
}


function startBoxSelect(appState, event) {
  return;
}



/* ------------------------------------------------------------
   Version 054 — right bbox selection hit collection fix
------------------------------------------------------------ */

function findEntitiesInSelectionBox(appState, selectionBounds, requireFullyInside) {
  const hits = [];

  appState.layers.forEach((layer) => {
    if (
      layer.layerKind !== "AtomicLayer" ||
      layer.dataType !== "Vector" ||
      !layer.state.visible ||
      layer.state.locked ||
      !layer.data ||
      !Array.isArray(layer.data.entities)
    ) {
      return;
    }

    layer.data.entities.forEach((entity) => {
      if (isEntitySelectedByRightBox(entity, selectionBounds, requireFullyInside)) {
        hits.push({
          layerId: layer.internalId,
          entityId: entity.id
        });
      }
    });
  });

  return hits;
}

function isEntitySelectedByRightBox(entity, selectionBounds, requireFullyInside) {
  if (!entity || !entity.geometry) {
    return false;
  }

  if (entity.geometry.type === "Point") {
    return selectionBounds.contains(coordinateToLatLng(entity.geometry.coordinates));
  }

  const coordinates = getBoxSelectionCoordinates(entity);

  if (coordinates.length === 0) {
    return false;
  }

  const latlngs = coordinates.map(coordinateToLatLng);

  if (requireFullyInside) {
    return latlngs.every((latlng) => selectionBounds.contains(latlng));
  }

  if (latlngs.some((latlng) => selectionBounds.contains(latlng))) {
    return true;
  }

  const entityBounds = L.latLngBounds(latlngs);

  if (!selectionBounds.intersects(entityBounds)) {
    return false;
  }

  const selectionCorners = [
    selectionBounds.getSouthWest(),
    selectionBounds.getNorthWest(),
    selectionBounds.getNorthEast(),
    selectionBounds.getSouthEast(),
    selectionBounds.getSouthWest()
  ];

  for (let i = 0; i < latlngs.length - 1; i += 1) {
    for (let j = 0; j < selectionCorners.length - 1; j += 1) {
      if (segmentsIntersectLatLng(latlngs[i], latlngs[i + 1], selectionCorners[j], selectionCorners[j + 1])) {
        return true;
      }
    }
  }

  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryForHit(entity);

  if (category === "Polygon") {
    const center = selectionBounds.getCenter();
    if (isLatLngInsidePolygonForHit(center, latlngs)) {
      return true;
    }
  }

  return selectionBounds.intersects(entityBounds);
}

function getBoxSelectionCoordinates(entity) {
  if (!entity || !entity.geometry || !Array.isArray(entity.geometry.coordinates)) {
    return [];
  }

  return entity.geometry.coordinates;
}

function segmentsIntersectLatLng(a, b, c, d) {
  const ax = a.lng;
  const ay = a.lat;
  const bx = b.lng;
  const by = b.lat;
  const cx = c.lng;
  const cy = c.lat;
  const dx = d.lng;
  const dy = d.lat;

  const denominator = ((ax - bx) * (cy - dy)) - ((ay - by) * (cx - dx));

  if (Math.abs(denominator) < 1e-12) {
    return false;
  }

  const t = (((ax - cx) * (cy - dy)) - ((ay - cy) * (cx - dx))) / denominator;
  const u = (((ax - cx) * (ay - by)) - ((ay - cy) * (ax - bx))) / denominator;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}



/* Final override: right pointer finish uses fixed bbox hit collector. */
function finishRightPointerSelection(appState, event) {
  if (!appState.rightSelection || !appState.rightSelection.active) {
    return false;
  }

  if (
    appState.rightSelection.pointerId !== null &&
    appState.rightSelection.pointerId !== undefined &&
    event.pointerId !== appState.rightSelection.pointerId
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const selection = appState.rightSelection;
  const endPoint = appState.map.mouseEventToContainerPoint(event);
  const endLatLng = appState.map.mouseEventToLatLng(event);
  const dragDistance = endPoint.distanceTo(selection.startPoint);
  const mapContainer = appState.map.getContainer();

  if (mapContainer.releasePointerCapture && event.pointerId !== undefined) {
    try {
      mapContainer.releasePointerCapture(event.pointerId);
    } catch (error) {}
  }

  if (selection.rectangle) {
    appState.map.removeLayer(selection.rectangle);
  }

  appState.rightSelection = {
    active: false,
    rectangle: null,
    pointerId: null
  };

  if (appState.map.dragging) {
    appState.map.dragging.enable();
  }

  if (!selection.moved || dragDistance < 4) {
    handleRightPointerSingleSelection(appState, event);
    return true;
  }

  const bounds = L.latLngBounds(selection.startLatLng, endLatLng);
  const upwardSelection = endPoint.y < selection.startPoint.y;
  const hits = findEntitiesInSelectionBox(appState, bounds, upwardSelection);
  const shouldRemove = selection.shiftKey || Boolean(event.shiftKey);

  if (hits.length === 0) {
    clearVectorSelection(appState);
    return true;
  }

  hits.forEach((hit) => {
    if (shouldRemove) {
      removeEntityFromSelection(appState, hit.layerId, hit.entityId);
    } else {
      addEntityToSelection(appState, hit.layerId, hit.entityId);
    }
  });

  return true;
}

function finishRightSelection(appState, event) {
  return finishRightPointerSelection(appState, event);
}
