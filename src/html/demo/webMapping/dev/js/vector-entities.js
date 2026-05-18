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

  if (!layer.style && typeof createInitialLayerStyle === "function") {
    layer.style = createInitialLayerStyle("Vector");
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
  entity.styleMode = "ByLayer";
  entity.style = {
    color: "#1f66d1",
    fillColor: "#1f66d1",
    weight: 3,
    radius: 6,
    fillOpacity: 0.18,
    opacity: 1,
    symbol: "circle",
    lineType: "solid",
    dashArray: null,
    hatch: "solid-fill",
    hatchScale: 12,
    hatchLineScale: 1,
    hatchRotation: 0,
    customIconUrl: ""
  };
  entity.state = {
    selected: false
  };

  layer.data.entities.push(entity);
  layer.metadata.updatedAt = createGeoWorksTimestamp();

  renderVectorEntity(appState, layer, entity);

  if (typeof renderLayerTree === "function") {
    renderLayerTree(appState);
  }

  return entity;
}


function renderVectorEntity(appState, layer, entity) {
  if (!layer.runtime || !layer.runtime.leafletLayer) {
    return;
  }

  const leafletObject = createLeafletObjectForEntity(layer, entity);

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
  applyHatchToPolygon(appState, layer, entity);
}


function createLeafletObjectForEntity(layer, entity) {
  const style = getVectorEntityStyle(layer, entity);

  if (entity.entityType === "Point") {
    if (style.symbol === "custom-icon" && style.customIconUrl) {
      return L.marker(coordinateToLatLng(entity.geometry.coordinates), {
        icon: L.icon({
          iconUrl: style.customIconUrl,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });
    }

    return L.marker(coordinateToLatLng(entity.geometry.coordinates), {
      icon: createPointSymbolIcon(style)
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


function getVectorEntityStyle(layer, entity) {
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryLocal(entity);

  const base = getStyleRuleForEntity(layer, entity, category);
  const opacity = Number(base.opacity ?? 1);

  const style = {
    color: base.color || "#1f66d1",
    weight: Number(base.weight || 3),
    fillColor: base.fillColor || base.color || "#1f66d1",
    opacity,
    fillOpacity: Number(base.fillOpacity ?? (category === "Point" ? 0.85 : 0.18)) * opacity,
    radius: Number(base.radius || 6),
    symbol: base.symbol || "circle",
    lineType: base.lineType || "solid",
    dashArray: base.dashArray || (typeof getDashArrayForLineType === "function" ? getDashArrayForLineType(base.lineType || "solid") : null),
    hatch: base.hatch || "solid-fill",
    hatchScale: Number(base.hatchScale || 12),
    hatchLineScale: Number(base.hatchLineScale || 1),
    hatchRotation: Number(base.hatchRotation || 0),
    customIconUrl: base.customIconUrl || ""
  };

  if (style.hatch === "none") {
    style.fillOpacity = 0;
  }

  if (
    category === "Polygon" &&
    style.hatch &&
    style.hatch !== "solid-fill" &&
    style.hatch !== "none"
  ) {
    style.fillOpacity = Math.max(style.fillOpacity || 1, 0.1);
  }

  if (entity.state && entity.state.selected) {
    style.color = "#ff9800";
    style.weight = Math.max(style.weight + 1, 4);
    style.fillColor = category === "Line" ? style.fillColor : "#ffcc80";
  }

  return style;
}




function createPointSymbolIcon(style) {
  const color = style.color || "#1f66d1";
  const fill = style.fillColor || color;
  const symbol = style.symbol || "circle";
  const opacity = Number(style.opacity ?? 1);
  const html = `<span class="gw-point-symbol gw-symbol-${symbol}" style="--gw-symbol-color:${color}; --gw-symbol-fill:${fill}; opacity:${opacity};"></span>`;

  return L.divIcon({
    html,
    className: "gw-point-symbol-icon",
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}


function getStyleRuleForEntity(layer, entity, category) {
  if (!layer.style && typeof createInitialLayerStyle === "function") {
    layer.style = createInitialLayerStyle("Vector");
  }

  const layerDefault = layer.style?.default || {
    color: "#1f66d1",
    fillColor: "#1f66d1",
    weight: 3,
    radius: 6,
    opacity: 1,
    fillOpacity: 0.18,
    opacity: 1,
    symbol: "circle",
    lineType: "solid",
    dashArray: null,
    hatch: "solid-fill",
    hatchScale: 12,
    hatchLineScale: 1,
    hatchRotation: 0
  };

  const typeRule = layer.style?.byType?.[category] || {};

  if (entity.styleMode === "ByObject") {
    return {
      ...layerDefault,
      ...typeRule,
      ...(entity.style || {})
    };
  }

  if (entity.styleMode === "ByType") {
    return {
      ...layerDefault,
      ...typeRule
    };
  }

  return {
    ...layerDefault,
    symbol: typeRule.symbol || layerDefault.symbol,
    customIconUrl: typeRule.customIconUrl || layerDefault.customIconUrl || "",
    lineType: typeRule.lineType || layerDefault.lineType,
    dashArray: typeRule.dashArray || layerDefault.dashArray || null,
    hatch: typeRule.hatch || layerDefault.hatch,
    hatchScale: typeRule.hatchScale || layerDefault.hatchScale || 12,
    hatchLineScale: typeRule.hatchLineScale || layerDefault.hatchLineScale || 1,
    hatchRotation: typeRule.hatchRotation || layerDefault.hatchRotation || 0,
    customHatchUrl: typeRule.customHatchUrl || layerDefault.customHatchUrl || ""
  };
}




function getEntityCategoryLocal(entity) {
  if (entity.entityType === "Point" || entity.geometry?.type === "Point") {
    return "Point";
  }

  if (
    entity.entityType === "Polygon" ||
    entity.entityType === "Rectangle" ||
    entity.entityType === "Square" ||
    entity.entityType === "Circle" ||
    entity.entityType === "ClosedPolyline" ||
    entity.geometry?.type === "Polygon"
  ) {
    return "Polygon";
  }

  return "Line";
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

  if (typeof refreshOpenStyleEditorForSelection === "function") {
    refreshOpenStyleEditorForSelection(appState);
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

  if (typeof refreshOpenStyleEditorForSelection === "function") {
    refreshOpenStyleEditorForSelection(appState);
  }
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

  if (typeof refreshOpenStyleEditorForSelection === "function") {
    refreshOpenStyleEditorForSelection(appState);
  }
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

  if (typeof refreshOpenStyleEditorForSelection === "function") {
    refreshOpenStyleEditorForSelection(appState);
  }

  if (typeof renderLayerTree === "function") {
    renderLayerTree(appState);
  }
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
  content.className = "vector-selected-popup compact-popup";

  content.innerHTML = `
    <div class="vector-popup-title">${entity.properties.name}</div>
    <div class="vector-popup-row"><strong>Type:</strong> ${entity.entityType}</div>
    <div class="vector-popup-row"><strong>Layer:</strong> ${layer.name}</div>
    <div class="vector-popup-row"><strong>ID:</strong> ${entity.id}</div>
    <div class="vector-popup-row"><strong>Rule:</strong> ${entity.styleMode || "ByLayer"}</div>
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

function applyHatchToPolygon(appState, layer, entity) {
  const category = typeof getVectorEntityCategory === "function"
    ? getVectorEntityCategory(entity)
    : getEntityCategoryLocal(entity);

  if (category !== "Polygon") {
    return;
  }

  const leafletObject = entity.runtime && entity.runtime.leafletObject;
  const path = leafletObject && leafletObject._path;

  if (!path) {
    return;
  }

  const style = getVectorEntityStyle(layer, entity);
  const hatch = style.hatch || "solid-fill";

  if (hatch === "solid-fill") {
    path.setAttribute("fill", style.fillColor || style.color || "#1f66d1");
    path.setAttribute("fill-opacity", String(style.fillOpacity ?? 0.18));
    return;
  }

  if (hatch === "none") {
    path.setAttribute("fill", style.fillColor || style.color || "#1f66d1");
    path.setAttribute("fill-opacity", "0");
    return;
  }

  try {
    const patternId = ensureHatchPattern(appState, hatch, style);
    path.setAttribute("fill", `url(#${patternId})`);
    path.setAttribute("fill-opacity", "1");
  } catch (error) {
    console.warn("Could not apply hatch pattern.", error);
    path.setAttribute("fill", style.fillColor || style.color || "#1f66d1");
    path.setAttribute("fill-opacity", String(style.fillOpacity ?? 0.18));
  }
}

function ensureHatchPattern(appState, hatch, style) {
  const svg = appState.map.getPanes().overlayPane.querySelector("svg");

  if (!svg) {
    throw new Error("Leaflet SVG overlay is not ready.");
  }

  let defs = svg.querySelector("defs");

  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  const scale = Math.max(4, Math.min(Number(style.hatchScale || 12), 64));
  const lineScale = Math.max(0.5, Math.min(Number(style.hatchLineScale || 1), 6));
  const rotation = Number(style.hatchRotation || 0);
  const stroke = style.fillColor || style.color || "#1f66d1";
  const opacity = Number(style.opacity ?? 1);
  const safeStroke = stroke.replace("#", "");
  const patternId = `gw-hatch-${hatch}-${safeStroke}-${scale}-${lineScale}-${rotation}-${Math.round(opacity * 100)}`;

  let pattern = defs.querySelector(`#${CSS.escape(patternId)}`);

  if (pattern) {
    return patternId;
  }

  pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  pattern.setAttribute("id", patternId);
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(scale));
  pattern.setAttribute("height", String(scale));
  pattern.setAttribute("patternTransform", `rotate(${rotation})`);

  buildHatchPattern(pattern, hatch, scale, stroke, lineScale, opacity);
  defs.appendChild(pattern);

  return patternId;
}


function buildHatchPattern(pattern, hatch, scale, stroke, lineScale = 1, opacity = 1) {
  const background = createSvgNode("rect", {
    x: 0,
    y: 0,
    width: scale,
    height: scale,
    fill: "transparent"
  });
  pattern.appendChild(background);

  const strokeWidth = Math.max(0.6, lineScale);

  if (hatch === "dots") {
    pattern.appendChild(createSvgNode("circle", {
      cx: scale / 2,
      cy: scale / 2,
      r: Math.max(1.2, strokeWidth * 1.5),
      fill: stroke,
      opacity
    }));
    return;
  }

  const addLine = (x1, y1, x2, y2, extra = {}) => {
    pattern.appendChild(createSvgNode("line", {
      x1,
      y1,
      x2,
      y2,
      stroke,
      opacity,
      "stroke-width": strokeWidth,
      "stroke-linecap": "square",
      ...extra
    }));
  };

  const addPolyline = (points) => {
    pattern.appendChild(createSvgNode("polyline", {
      points,
      fill: "none",
      stroke,
      opacity,
      "stroke-width": strokeWidth,
      "stroke-linecap": "square",
      "stroke-linejoin": "miter"
    }));
  };

  if (hatch === "horizontal") {
    addLine(0, scale / 2, scale, scale / 2);
    return;
  }

  if (hatch === "vertical") {
    addLine(scale / 2, 0, scale / 2, scale);
    return;
  }

  if (hatch === "cross") {
    addLine(0, scale / 2, scale, scale / 2);
    addLine(scale / 2, 0, scale / 2, scale);
    return;
  }

  if (hatch === "grid") {
    addLine(0, 0, scale, 0);
    addLine(0, 0, 0, scale);
    addLine(0, scale / 2, scale, scale / 2);
    addLine(scale / 2, 0, scale / 2, scale);
    return;
  }

  if (hatch === "diagonal-back") {
    addLine(0, 0, scale, scale);
    return;
  }

  if (hatch === "double-diagonal") {
    addLine(0, scale, scale, 0);
    addLine(0, 0, scale, scale);
    return;
  }

  if (hatch === "brick") {
    addLine(0, 0, scale, 0);
    addLine(0, scale / 2, scale, scale / 2);
    addLine(0, 0, 0, scale / 2);
    addLine(scale / 2, scale / 2, scale / 2, scale);
    return;
  }

  if (hatch === "zigzag") {
    addPolyline(`0,${scale} ${scale / 2},0 ${scale},${scale}`);
    return;
  }

  if (hatch === "triangles") {
    addPolyline(`0,${scale} ${scale / 2},0 ${scale},${scale} 0,${scale}`);
    return;
  }

  if (hatch === "custom") {
    addLine(0, scale, scale, 0);
    addLine(0, 0, scale, scale);
    addLine(0, scale / 2, scale, scale / 2);
    return;
  }

  // ANSI31 diagonal fallback.
  addLine(0, scale, scale, 0);
}


function createSvgNode(tagName, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  return node;
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
