let vectorEntityIdCounter = 0;

function initializeLayerRuntime(appState, layer) {
  if (!appState.map || layer.layerKind !== "AtomicLayer") {
    return;
  }

  if (layer.dataType !== "Vector") {
    return;
  }

  if (!layer.runtime) {
    layer.runtime = {};
  }

  if (!layer.runtime.leafletLayer) {
    layer.runtime.leafletLayer = L.layerGroup();
  }

  if (layer.state.visible && !appState.map.hasLayer(layer.runtime.leafletLayer)) {
    layer.runtime.leafletLayer.addTo(appState.map);
  }
}

function updateLayerRuntimeVisibility(appState, layer) {
  if (!appState.map || !layer.runtime || !layer.runtime.leafletLayer) {
    return;
  }

  if (layer.state.visible) {
    if (!appState.map.hasLayer(layer.runtime.leafletLayer)) {
      layer.runtime.leafletLayer.addTo(appState.map);
    }

    return;
  }

  if (appState.map.hasLayer(layer.runtime.leafletLayer)) {
    appState.map.removeLayer(layer.runtime.leafletLayer);
  }
}

function addVectorEntity(appState, layer, entity) {
  initializeLayerRuntime(appState, layer);

  if (!layer.data) {
    layer.data = { entities: [] };
  }

  if (!layer.data.entities) {
    layer.data.entities = [];
  }

  entity.id = createVectorEntityId();
  entity.layerId = layer.internalId;
  entity.properties = entity.properties || {};
  entity.properties.name = entity.properties.name || entity.entityType;
  entity.properties.createdAt = createGeoWorksTimestamp();
  entity.properties.updatedAt = createGeoWorksTimestamp();
  entity.state = {
    selected: false
  };

  layer.data.entities.push(entity);
  layer.metadata.updatedAt = createGeoWorksTimestamp();

  renderVectorEntity(appState, layer, entity);
  return entity;
}

function renderVectorEntity(appState, layer, entity) {
  if (!layer.runtime || !layer.runtime.leafletLayer) {
    return;
  }

  const leafletObject = createLeafletObjectForEntity(entity);

  if (!leafletObject) {
    return;
  }

  entity.runtime = {
    leafletObject
  };

  leafletObject.on("click", (event) => {
    L.DomEvent.stopPropagation(event);

    if (!canSelectVectorEntity(layer)) {
      return;
    }

    selectVectorEntity(
      appState,
      layer.internalId,
      entity.id,
      event.originalEvent && event.originalEvent.shiftKey
    );
  });

  layer.runtime.leafletLayer.addLayer(leafletObject);
}

function createLeafletObjectForEntity(entity) {
  const style = getDefaultVectorStyle(entity);

  if (entity.entityType === "Point") {
    return L.circleMarker(coordinateToLatLng(entity.geometry.coordinates), {
      radius: 6,
      ...style
    });
  }

  if (entity.entityType === "Line" || entity.entityType === "Polyline") {
    return L.polyline(
      entity.geometry.coordinates.map(coordinateToLatLng),
      style
    );
  }

  if (
    entity.entityType === "Polygon" ||
    entity.entityType === "Rectangle" ||
    entity.entityType === "Square" ||
    entity.entityType === "Circle"
  ) {
    return L.polygon(
      entity.geometry.coordinates.map(coordinateToLatLng),
      style
    );
  }

  return null;
}

function getDefaultVectorStyle(entity) {
  const selected = entity.state && entity.state.selected;

  return {
    color: selected ? "#ff9800" : "#1f66d1",
    weight: selected ? 4 : 3,
    fillColor: selected ? "#ffcc80" : "#1f66d1",
    fillOpacity: entity.entityType === "Point" ? 0.85 : 0.18
  };
}

function selectVectorEntity(appState, layerId, entityId, subtractSelection = false) {
  const layer = findLayer(appState, layerId);
  const entity = findVectorEntity(layer, entityId);

  if (!layer || !entity) {
    return;
  }

  if (subtractSelection) {
    entity.state.selected = false;
  } else {
    entity.state.selected = true;
  }

  rebuildSelectedEntityState(appState);
  redrawVectorLayer(appState, layer);

  if (entity.state.selected && appState.selectedEntities.length === 1) {
    openVectorEntityPopup(appState, layer, entity);
  }
}

function selectVectorEntitiesByBox(appState, selectionBounds, mode, subtractSelection = false) {
  const affectedLayers = new Set();
  let matchedCount = 0;

  getSelectableVectorLayers(appState).forEach((layer) => {
    if (!layer.data || !layer.data.entities) {
      return;
    }

    let layerChanged = false;

    layer.data.entities.forEach((entity) => {
      const matchesBox = isEntitySelectedByBounds(entity, selectionBounds, mode);

      if (!matchesBox) {
        return;
      }

      matchedCount += 1;

      if (subtractSelection) {
        entity.state.selected = false;
      } else {
        entity.state.selected = true;
      }

      layerChanged = true;
    });

    if (layerChanged) {
      affectedLayers.add(layer);
    }
  });

  if (matchedCount === 0 && !subtractSelection) {
    clearVectorSelection(appState);
    return;
  }

  affectedLayers.forEach((layer) => {
    redrawVectorLayer(appState, layer);
  });

  rebuildSelectedEntityState(appState);

  if (appState.selectedEntities.length === 1) {
    const item = appState.selectedEntities[0];
    const layer = findLayer(appState, item.layerId);
    const entity = findVectorEntity(layer, item.entityId);
    openVectorEntityPopup(appState, layer, entity);
  }

  console.log(
    `${subtractSelection ? "Box unselected" : "Box added"} ${matchedCount} object(s). Total selected: ${appState.selectedEntities.length}. Mode: ${mode}`
  );
}

function rebuildSelectedEntityState(appState) {
  const selectedItems = [];

  getSelectableVectorLayers(appState).forEach((layer) => {
    if (!layer.data || !layer.data.entities) {
      return;
    }

    layer.data.entities.forEach((entity) => {
      if (entity.state && entity.state.selected) {
        selectedItems.push({
          layerId: layer.internalId,
          entityId: entity.id
        });
      }
    });
  });

  appState.selectedEntities = selectedItems;
  appState.selectedEntity = selectedItems.length === 1 ? selectedItems[0] : null;
}

function getSelectableVectorLayers(appState) {
  return appState.layers.filter((layer) => {
    return layer.layerKind === "AtomicLayer" &&
      layer.dataType === "Vector" &&
      layer.state.visible &&
      !layer.state.locked;
  });
}

function isEntitySelectedByBounds(entity, selectionBounds, mode) {
  if (entity.entityType === "Point") {
    const point = coordinateToLatLng(entity.geometry.coordinates);
    return selectionBounds.contains(point);
  }

  const entityBounds = getEntityBounds(entity);

  if (!entityBounds) {
    return false;
  }

  if (mode === "inside") {
    return selectionBounds.contains(entityBounds.getSouthWest()) &&
      selectionBounds.contains(entityBounds.getNorthEast());
  }

  return selectionBounds.intersects(entityBounds);
}

function getEntityBounds(entity) {
  if (!entity || !entity.geometry) {
    return null;
  }

  if (entity.geometry.type === "Point") {
    const point = coordinateToLatLng(entity.geometry.coordinates);
    return L.latLngBounds([point, point]);
  }

  const latLngs = entity.geometry.coordinates.map(coordinateToLatLng);

  if (latLngs.length === 0) {
    return null;
  }

  return L.latLngBounds(latLngs);
}

function clearVectorSelection(appState) {
  const affectedLayers = new Set();

  if (appState.selectedEntities && appState.selectedEntities.length > 0) {
    appState.selectedEntities.forEach((item) => {
      const layer = findLayer(appState, item.layerId);
      const entity = findVectorEntity(layer, item.entityId);

      if (entity && entity.state) {
        entity.state.selected = false;
      }

      if (layer) {
        affectedLayers.add(layer);
      }
    });
  } else if (appState.selectedEntity) {
    const layer = findLayer(appState, appState.selectedEntity.layerId);
    const entity = findVectorEntity(layer, appState.selectedEntity.entityId);

    if (entity && entity.state) {
      entity.state.selected = false;
    }

    if (layer) {
      affectedLayers.add(layer);
    }
  }

  affectedLayers.forEach((layer) => {
    redrawVectorLayer(appState, layer);
  });

  appState.selectedEntity = null;
  appState.selectedEntities = [];
}

function deleteSelectedVectorEntity(appState) {
  if (!appState.selectedEntities || appState.selectedEntities.length === 0) {
    return;
  }

  const selectedByLayer = new Map();

  appState.selectedEntities.forEach((item) => {
    if (!selectedByLayer.has(item.layerId)) {
      selectedByLayer.set(item.layerId, new Set());
    }

    selectedByLayer.get(item.layerId).add(item.entityId);
  });

  selectedByLayer.forEach((entityIds, layerId) => {
    const layer = findLayer(appState, layerId);

    if (!layer || layer.state.locked || !layer.data || !layer.data.entities) {
      return;
    }

    layer.data.entities = layer.data.entities.filter((entity) => {
      return !entityIds.has(entity.id);
    });

    layer.metadata.updatedAt = createGeoWorksTimestamp();
    redrawVectorLayer(appState, layer);
  });

  appState.selectedEntity = null;
  appState.selectedEntities = [];
}

function redrawVectorLayer(appState, layer) {
  if (!layer || !layer.runtime || !layer.runtime.leafletLayer) {
    return;
  }

  layer.runtime.leafletLayer.clearLayers();

  if (!layer.data || !layer.data.entities) {
    return;
  }

  layer.data.entities.forEach((entity) => {
    renderVectorEntity(appState, layer, entity);
  });
}

function openVectorEntityPopup(appState, layer, entity) {
  if (!entity.runtime || !entity.runtime.leafletObject) {
    return;
  }

  const content = document.createElement("div");
  content.className = "vector-selected-popup";

  content.innerHTML = `
    <div class="vector-popup-title">${entity.properties.name}</div>
    <div class="vector-popup-row"><strong>Type:</strong> ${entity.entityType}</div>
    <div class="vector-popup-row"><strong>Layer:</strong> ${layer.name}</div>
    <div class="vector-popup-row"><strong>ID:</strong> ${entity.id}</div>
  `;

  const deleteButton = document.createElement("button");
  deleteButton.className = "vector-popup-delete";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";

  deleteButton.addEventListener("click", () => {
    deleteSelectedVectorEntity(appState);
  });

  content.appendChild(deleteButton);

  entity.runtime.leafletObject.bindPopup(content).openPopup();
}

function findVectorEntity(layer, entityId) {
  if (!layer || !layer.data || !layer.data.entities) {
    return null;
  }

  return layer.data.entities.find((entity) => entity.id === entityId);
}

function canSelectVectorEntity(layer) {
  return layer &&
    layer.dataType === "Vector" &&
    layer.state.visible &&
    !layer.state.locked;
}

function createVectorEntityId() {
  vectorEntityIdCounter += 1;
  return `entity_${String(vectorEntityIdCounter).padStart(5, "0")}`;
}

function latLngToCoordinate(latlng) {
  return [latlng.lat, latlng.lng];
}

function coordinateToLatLng(coordinate) {
  return L.latLng(coordinate[0], coordinate[1]);
}

function createRectangleCoordinates(firstCorner, secondCorner) {
  return [
    [firstCorner.lat, firstCorner.lng],
    [firstCorner.lat, secondCorner.lng],
    [secondCorner.lat, secondCorner.lng],
    [secondCorner.lat, firstCorner.lng],
    [firstCorner.lat, firstCorner.lng]
  ];
}

function createCirclePolygonCoordinates(center, radiusPoint, segments = 64) {
  const radius = center.distanceTo(radiusPoint);
  const coordinates = [];
  const projectedCenter = L.CRS.EPSG3857.project(center);

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const projectedPoint = L.point(
      projectedCenter.x + Math.cos(angle) * radius,
      projectedCenter.y + Math.sin(angle) * radius
    );

    const latlng = L.CRS.EPSG3857.unproject(projectedPoint);
    coordinates.push([latlng.lat, latlng.lng]);
  }

  return coordinates;
}
