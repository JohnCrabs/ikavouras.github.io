let layerIdCounter = 0;

function setupLayerSystem(appState) {
  const addLayerButton = document.getElementById("addLayerBtn");
  const groupLayerButton = document.getElementById("groupLayerBtn");
  const layerTree = document.getElementById("layerTree");

  buildAddLayerMenu(addLayerButton, appState);

  groupLayerButton.addEventListener("click", () => {
    const parentId = getActiveHyperLayerId(appState);

    createLayer(appState, {
      name: getNextLayerName(appState, "Group"),
      layerKind: "HyperLayer",
      hyperLayerType: "Group",
      parentId
    });

    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  layerTree.addEventListener("dragover", (event) => {
    event.preventDefault();

    if (!event.target.closest(".layer-card")) {
      layerTree.classList.add("drop-root");
    }
  });

  layerTree.addEventListener("dragleave", (event) => {
    if (!layerTree.contains(event.relatedTarget)) {
      layerTree.classList.remove("drop-root");
    }
  });

  layerTree.addEventListener("drop", (event) => {
    event.preventDefault();
    layerTree.classList.remove("drop-root");

    if (event.target.closest(".layer-card")) {
      return;
    }

    const draggedLayerId = event.dataTransfer.getData("text/plain");

    if (draggedLayerId) {
      moveLayerToParentAtIndex(appState, draggedLayerId, null, getRootLayers(appState).length);
      renderLayerTree(appState);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".panel-bottom-actions")) {
      closeAddLayerMenu();
    }
  });

  renderLayerTree(appState);
}

function buildAddLayerMenu(addLayerButton, appState) {
  const actions = addLayerButton.parentElement;
  const menu = document.createElement("div");

  menu.id = "addLayerMenu";
  menu.className = "add-layer-menu";
  menu.innerHTML = `
    <button class="add-layer-option" type="button" data-layer-type="Vector">
      <i class="fa-solid fa-draw-polygon"></i>
      <span>Vector Layer</span>
    </button>

    <button class="add-layer-option" type="button" data-layer-type="Raster">
      <i class="fa-solid fa-border-all"></i>
      <span>Raster Layer</span>
    </button>

    <button class="add-layer-option" type="button" data-layer-type="GeoMedia">
      <i class="fa-solid fa-camera"></i>
      <span>GeoMedia Layer</span>
    </button>
  `;

  actions.appendChild(menu);

  addLayerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.classList.toggle("open");
  });

  menu.querySelectorAll(".add-layer-option").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const dataType = button.dataset.layerType;
      const parentId = getActiveHyperLayerId(appState);

      createLayer(appState, {
        name: getNextLayerName(appState, `${dataType} Layer`),
        layerKind: "AtomicLayer",
        dataType,
        sensorType: getDefaultSensorType(dataType),
        parentId
      });

      closeAddLayerMenu();
      renderLayerTree(appState);
      updateToolbarForActiveLayer(appState);
    });
  });
}

function closeAddLayerMenu() {
  const menu = document.getElementById("addLayerMenu");

  if (menu) {
    menu.classList.remove("open");
  }
}

function createLayer(appState, options) {
  const layer = {
    internalId: createInternalLayerId(),
    name: options.name,
    layerKind: options.layerKind,
    hyperLayerType: options.hyperLayerType || "None",
    dataType: options.dataType || "None",
    sensorType: options.sensorType || "None",
    parentId: options.parentId || null,
    children: [],
    data: createInitialLayerData(options.dataType || "None"),
    style: createInitialLayerStyle(options.dataType || "None"),
    runtime: { leafletLayer: null },
    state: {
      visible: true,
      collapsed: false,
      selected: false,
      active: false,
      locked: false
    },
    metadata: {
      productId: null,
      createdAt: createGeoWorksTimestamp(),
      updatedAt: createGeoWorksTimestamp()
    }
  };

  appState.layers.push(layer);

  if (layer.parentId) {
    const parent = findLayer(appState, layer.parentId);

    if (parent) {
      parent.children.push(layer.internalId);
      parent.state.collapsed = false;
      parent.metadata.updatedAt = createGeoWorksTimestamp();
    }
  }

  if (typeof initializeLayerRuntime === "function") {
    initializeLayerRuntime(appState, layer);
  }

  setSelectedLayer(appState, layer.internalId);

  if (canLayerBecomeActive(layer)) {
    setActiveLayer(appState, layer.internalId);
  }

  return layer;
}

function renderLayerTree(appState) {
  const container = document.getElementById("layerTree");
  const rootLayers = getRootLayers(appState);

  if (rootLayers.length === 0) {
    container.innerHTML = `
      <div class="empty-panel-state">
        <i class="fa-solid fa-layer-group"></i>
        <h2>No layers yet</h2>
        <p>
          Add layers or groups to start building a parent-child hierarchy.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = "";

  rootLayers.forEach((layer) => {
    container.appendChild(renderLayerNode(appState, layer));
  });

  const help = document.createElement("div");
  help.className = "layer-tree-help";
  help.textContent = "Drag a layer above/below another layer to reorder it. Drag into the center of a group to make it a child.";
  container.appendChild(help);

  const orderNote = document.createElement("div");
  orderNote.className = "layer-order-note";
  orderNote.textContent = "Rendering rule: bottom layers are drawn first; top layers are drawn last and appear in front.";
  container.appendChild(orderNote);
}

function renderLayerNode(appState, layer) {
  const node = document.createElement("div");
  node.className = "layer-node";

  if (layer.state.collapsed) {
    node.classList.add("collapsed");
  }

  node.dataset.layerId = layer.internalId;

  const card = document.createElement("div");
  card.className = "layer-card";
  card.draggable = true;

  if (appState.selectedLayerId === layer.internalId) {
    card.classList.add("selected");
  }

  if (appState.activeLayerId === layer.internalId) {
    card.classList.add("active-edit-layer");
  }

  if (layer.state.locked) {
    card.classList.add("locked-layer");
  }

  if (!layer.state.visible) {
    card.classList.add("hidden-layer");
  }

  card.appendChild(createDragHandle());
  card.appendChild(createCaretButton(appState, layer));
  card.appendChild(createLayerIcon(layer));
  card.appendChild(createLayerMain(appState, layer));
  card.appendChild(createLayerActions(appState, layer));

  card.addEventListener("click", () => {
    setSelectedLayer(appState, layer.internalId);

    if (canLayerBecomeActive(layer)) {
      setActiveLayer(appState, layer.internalId);
    }

    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  setupDragAndDropForCard(appState, card, layer);

  node.appendChild(card);

  if (isHyperLayer(layer)) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "layer-children";

    layer.children
      .map((childId) => findLayer(appState, childId))
      .filter(Boolean)
      .forEach((childLayer) => {
        childrenContainer.appendChild(renderLayerNode(appState, childLayer));
      });

    node.appendChild(childrenContainer);
  }

  return node;
}

function setupDragAndDropForCard(appState, card, targetLayer) {
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", targetLayer.internalId);
    event.dataTransfer.effectAllowed = "move";

    card.classList.add("dragging");
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    clearDropTargets();
  });

  card.addEventListener("dragover", (event) => {
    const draggedLayerId = event.dataTransfer.getData("text/plain");

    if (!draggedLayerId || draggedLayerId === targetLayer.internalId) {
      return;
    }

    const dropMode = getDropMode(event, targetLayer);

    if (!canDropWithMode(appState, draggedLayerId, targetLayer.internalId, dropMode)) {
      return;
    }

    event.preventDefault();
    clearDropTargets();

    if (dropMode === "before") {
      card.classList.add("drop-before");
    } else if (dropMode === "after") {
      card.classList.add("drop-after");
    } else {
      card.classList.add("drop-inside");
    }
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-before", "drop-after", "drop-inside");
  });

  card.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const draggedLayerId = event.dataTransfer.getData("text/plain");
    const dropMode = getDropMode(event, targetLayer);

    if (!canDropWithMode(appState, draggedLayerId, targetLayer.internalId, dropMode)) {
      clearDropTargets();
      return;
    }

    if (dropMode === "inside") {
      moveLayerToParentAtIndex(
        appState,
        draggedLayerId,
        targetLayer.internalId,
        targetLayer.children.length
      );
    } else {
      moveLayerRelativeToTarget(appState, draggedLayerId, targetLayer.internalId, dropMode);
    }

    clearDropTargets();
    renderLayerTree(appState);
  });
}

function getDropMode(event, targetLayer) {
  const rect = event.currentTarget.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const ratio = y / rect.height;

  if (ratio < 0.28) {
    return "before";
  }

  if (ratio > 0.72) {
    return "after";
  }

  if (isHyperLayer(targetLayer)) {
    return "inside";
  }

  return ratio < 0.5 ? "before" : "after";
}

function canDropWithMode(appState, draggedLayerId, targetLayerId, dropMode) {
  if (!draggedLayerId || !targetLayerId || draggedLayerId === targetLayerId) {
    return false;
  }

  if (dropMode === "inside") {
    return canDropOnLayer(appState, draggedLayerId, targetLayerId);
  }

  const targetLayer = findLayer(appState, targetLayerId);

  if (!targetLayer) {
    return false;
  }

  if (isDescendantOf(appState, targetLayerId, draggedLayerId)) {
    return false;
  }

  return true;
}

function clearDropTargets() {
  document
    .querySelectorAll(".drop-target, .drop-before, .drop-after, .drop-inside")
    .forEach((element) => {
      element.classList.remove("drop-target", "drop-before", "drop-after", "drop-inside");
    });

  document.getElementById("layerTree")?.classList.remove("drop-root");
}

function createDragHandle() {
  const handle = document.createElement("div");
  handle.className = "layer-drag-handle";
  handle.title = "Drag layer";
  handle.innerHTML = `<i class="fa-solid fa-grip-vertical"></i>`;

  return handle;
}

function createCaretButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-caret";
  button.type = "button";

  if (!isHyperLayer(layer)) {
    button.classList.add("empty");
    button.innerHTML = `<i class="fa-solid fa-minus"></i>`;
    return button;
  }

  button.innerHTML = layer.state.collapsed
    ? `<i class="fa-solid fa-chevron-right"></i>`
    : `<i class="fa-solid fa-chevron-down"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    layer.state.collapsed = !layer.state.collapsed;
    renderLayerTree(appState);
  });

  return button;
}

function createLayerIcon(layer) {
  const icon = document.createElement("div");
  icon.className = "layer-type-icon";

  if (isHyperLayer(layer)) {
    icon.classList.add("hyper");
    icon.innerHTML = `<i class="fa-solid fa-folder-tree"></i>`;
    return icon;
  }

  if (layer.dataType === "Raster") {
    icon.innerHTML = `<i class="fa-solid fa-border-all"></i>`;
    return icon;
  }

  if (layer.dataType === "GeoMedia") {
    icon.innerHTML = `<i class="fa-solid fa-camera"></i>`;
    return icon;
  }

  icon.innerHTML = `<i class="fa-solid fa-draw-polygon"></i>`;
  return icon;
}

function createLayerMain(appState, layer) {
  const main = document.createElement("div");
  main.className = "layer-main";

  const name = document.createElement("div");
  name.className = "layer-name";
  name.textContent = layer.name;
  name.title = "Click to rename";

  name.addEventListener("click", (event) => {
    event.stopPropagation();
    beginInlineRename(appState, layer, name);
  });

  const meta = document.createElement("div");
  meta.className = "layer-meta";

  if (isHyperLayer(layer)) {
    meta.innerHTML = `
      <span class="layer-badge hyper">${layer.hyperLayerType}</span>
      ${layer.children.length} child item(s)
    `;
  } else {
    meta.appendChild(createLayerTypeSelect(appState, layer));
    meta.appendChild(document.createTextNode(` ${layer.sensorType}`));

    if (layer.dataType === "Vector") {
      meta.appendChild(createLayerStyleButton(appState, layer));
      meta.appendChild(createVectorCountsElement(layer));
    }

    if (layer.state.active) {
      meta.appendChild(document.createTextNode(" "));
      meta.appendChild(createSmallBadge("ACTIVE", "active-badge"));
    }

    if (layer.state.locked) {
      meta.appendChild(document.createTextNode(" "));
      meta.appendChild(createSmallBadge("LOCKED", "locked-badge"));
    }
  }

  main.appendChild(name);
  main.appendChild(meta);

  return main;
}


function createSmallBadge(label, className) {
  const badge = document.createElement("span");
  badge.className = `layer-badge ${className}`;
  badge.textContent = label;

  return badge;
}

function beginInlineRename(appState, layer, nameElement) {
  const input = document.createElement("input");
  input.className = "layer-name-input";
  input.type = "text";
  input.value = layer.name;
  input.setAttribute("aria-label", "Layer name");

  nameElement.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextName = input.value.trim();

    if (nextName) {
      layer.name = nextName;
      layer.metadata.updatedAt = createGeoWorksTimestamp();
    }

    renderLayerTree(appState);
  };

  const cancel = () => {
    renderLayerTree(appState);
  };

  input.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commit();
    }

    if (event.key === "Escape") {
      cancel();
    }
  });

  input.addEventListener("blur", commit);
}

function createLayerTypeSelect(appState, layer) {
  const select = document.createElement("select");
  select.className = "layer-type-select";
  select.title = "Change layer type";
  select.innerHTML = `
    <option value="Vector">Vector</option>
    <option value="Raster">Raster</option>
    <option value="GeoMedia">GeoMedia</option>
  `;

  select.value = layer.dataType;

  select.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  select.addEventListener("change", (event) => {
    event.stopPropagation();

    if (!canChangeLayerType(layer)) {
      select.value = layer.dataType;
      return;
    }

    removeLayerRuntime(appState, layer);
    layer.dataType = select.value;
    layer.sensorType = getDefaultSensorType(layer.dataType);
    layer.data = createInitialLayerData(layer.dataType);
    layer.style = createInitialLayerStyle(layer.dataType);
    layer.runtime = { leafletLayer: null };
    layer.metadata.updatedAt = createGeoWorksTimestamp();

    if (typeof initializeLayerRuntime === "function") {
      initializeLayerRuntime(appState, layer);
    }

    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  return select;
}

function createLayerStyleButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-style-gear";
  button.type = "button";
  button.title = "Edit vector drawing rules";
  button.innerHTML = `<i class="fa-solid fa-gear"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openLayerStyleEditor(appState, layer);
  });

  return button;
}

function createVectorCountsElement(layer) {
  const counts = getVectorEntityCounts(layer);
  const container = document.createElement("span");
  container.className = "layer-counts";
  container.innerHTML = `
    <span title="Points">P: ${counts.points}</span>
    <span title="Lines">L: ${counts.lines}</span>
    <span title="Polygons">PG: ${counts.polygons}</span>
  `;

  return container;
}

function getVectorEntityCounts(layer) {
  const counts = {
    points: 0,
    lines: 0,
    polygons: 0
  };

  if (!layer || !layer.data || !layer.data.entities) {
    return counts;
  }

  layer.data.entities.forEach((entity) => {
    const category = getVectorEntityCategory(entity);

    if (category === "Point") {
      counts.points += 1;
    } else if (category === "Line") {
      counts.lines += 1;
    } else if (category === "Polygon") {
      counts.polygons += 1;
    }
  });

  return counts;
}

function getVectorEntityCategory(entity) {
  if (!entity) {
    return "Line";
  }

  if (entity.entityType === "Point" || entity.geometry?.type === "Point") {
    return "Point";
  }

  if (
    entity.entityType === "Polygon" ||
    entity.entityType === "ClosedPolyline" ||
    entity.entityType === "JoinedPolygon" ||
    entity.entityType === "Rectangle" ||
    entity.entityType === "Square" ||
    entity.entityType === "Circle" ||
    entity.entityType === "Ellipse" ||
    entity.entityType === "Triangle" ||
    entity.entityType === "Rhombus" ||
    entity.entityType === "RegularPolygon" ||
    entity.geometry?.type === "Polygon" ||
    isClosedLineLikeEntity(entity)
  ) {
    return "Polygon";
  }

  return "Line";
}

function isClosedLineLikeEntity(entity) {
  if (!entity || !entity.geometry || !Array.isArray(entity.geometry.coordinates)) {
    return false;
  }

  const coordinates = entity.geometry.coordinates;

  if (coordinates.length < 3) {
    return false;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  return Array.isArray(first) &&
    Array.isArray(last) &&
    Math.abs(first[0] - last[0]) < 1e-12 &&
    Math.abs(first[1] - last[1]) < 1e-12;
}



function openLayerStyleEditor(appState, layer) {
  closeLayerStyleEditor();

  if (!layer.style) {
    layer.style = createInitialLayerStyle(layer.dataType);
  }

  appState.activeStyleLayerId = layer.internalId;

  const selectedContext = getSingleSelectedEntityContext(appState, layer);
  const selectedEntity = selectedContext ? selectedContext.entity : null;

  const panel = document.createElement("div");
  panel.id = "layerStyleEditor";
  panel.className = "layer-style-editor";
  panel.innerHTML = `
    <div class="style-editor-header">
      <div>
        <strong>Drawing Rules</strong>
        <div class="style-editor-layer-name">${layer.name}</div>
      </div>

      <button id="closeStyleEditorBtn" type="button">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <div class="style-editor-section">
      <div class="style-editor-title">By Layer Default</div>

      <div class="style-form-grid">
        <label>
          <span>Stroke</span>
          <div class="color-alpha-control">
            <input id="layerDefaultColor" type="color" value="${getColorHexPart(layer.style.default.color)}" />
            <input id="layerDefaultColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.default.color, layer.style.default.opacity ?? 1)}" />
          </div>
        </label>

        <label>
          <span>Fill</span>
          <div class="color-alpha-control">
            <input id="layerDefaultFill" type="color" value="${getColorHexPart(layer.style.default.fillColor)}" />
            <input id="layerDefaultFillAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.default.fillColor, 0)}" />
          </div>
        </label>

        <label>
          <span>Weight</span>
          <input id="layerDefaultWeight" type="number" min="1" max="12" value="${layer.style.default.weight}" />
        </label>
      </div>
    </div>

    <div class="style-editor-section">
      <div class="style-editor-title">By Type Overrides</div>

      <div class="style-type-card">
        <div class="style-type-card-title">Point</div>
        <div class="style-form-grid">
          <label>
            <span>Symbol</span>
            <select id="pointSymbol">
              <option value="circle">Circle</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
              <option value="diamond">Diamond</option>
              <option value="cross">Cross</option>
              <option value="star">Star</option>
              <option value="pin">Pin</option>
              <option value="custom-icon">Custom Icon</option>
            </select>
          </label>

          <label>
            <span>Color</span>
            <div class="color-alpha-control">
            <input id="pointColor" type="color" value="${getColorHexPart(layer.style.byType.Point.color)}" />
            <input id="pointColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.byType.Point.color, layer.style.byType.Point.opacity ?? 1)}" />
          </div>
          </label>

          <label class="custom-icon-row">
            <span>Custom Icon</span>
            <div class="combined-file-control">
              <input id="pointIconUrl" type="text" value="${layer.style.byType.Point.customIconUrl || ""}" placeholder="URL or upload file" />
              <input id="pointIconUpload" type="file" accept=".png,.jpg,.jpeg,.svg,.webp" />
            </div>
          </label>
        </div>
      </div>

      <div class="style-type-card">
        <div class="style-type-card-title">Line / Boundary</div>
        <div class="style-form-grid">
          <label>
            <span>Line Type</span>
            <select id="lineType">
              <option value="solid">Solid</option>
              <option value="dash">Dash</option>
              <option value="dot">Dot</option>
              <option value="dash-dot">Dash Dot</option>
              <option value="center">Center</option>
              <option value="hidden">Hidden</option>
              <option value="phantom">Phantom</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label>
            <span>Color</span>
            <div class="color-alpha-control">
            <input id="lineColor" type="color" value="${getColorHexPart(layer.style.byType.Line.color)}" />
            <input id="lineColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.byType.Line.color, layer.style.byType.Line.opacity ?? 1)}" />
          </div>
          </label>

          <label>
            <span>Weight</span>
            <input id="lineWeight" type="number" min="1" max="12" value="${layer.style.byType.Line.weight}" />
          </label>

          <label>
            <span>Upload LineType</span>
            <input id="lineTypeUpload" type="file" accept=".json,.txt,.lin" />
          </label>
        </div>
      </div>

      <div class="style-type-card">
        <div class="style-type-card-title">Polygon Fill</div>
        <div class="style-form-grid">
          <label>
            <span>Boundary Color</span>
            <div class="color-alpha-control">
            <input id="polygonColor" type="color" value="${getColorHexPart(layer.style.byType.Polygon.color)}" />
            <input id="polygonColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.byType.Polygon.color, layer.style.byType.Polygon.opacity ?? 1)}" />
          </div>
          </label>

          <label>
            <span>Fill Color</span>
            <div class="color-alpha-control">
            <input id="polygonFill" type="color" value="${getColorHexPart(layer.style.byType.Polygon.fillColor)}" />
            <input id="polygonFillAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(layer.style.byType.Polygon.fillColor, 0)}" />
          </div>
          </label>

          <label>
            <span>Boundary Type</span>
            <select id="polygonLineType">
              <option value="solid">Solid</option>
              <option value="dash">Dash</option>
              <option value="dot">Dot</option>
              <option value="dash-dot">Dash Dot</option>
              <option value="center">Center</option>
              <option value="hidden">Hidden</option>
              <option value="phantom">Phantom</option>
              <option value="custom">Custom</option>
            </select>
          </label>

          <label>
            <span>Hatch</span>
            <select id="polygonHatch">
              <option value="solid-fill">Solid Fill</option>
              <option value="none">No Fill</option>
              <option value="ansi31">ANSI31 Diagonal</option>
              <option value="cross">Cross Hatch</option>
              <option value="grid">Grid</option>
              <option value="dots">Dots</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="diagonal-back">Diagonal Back</option>
              <option value="double-diagonal">Double Diagonal</option>
              <option value="brick">Brick</option>
              <option value="zigzag">Zigzag</option>
              <option value="triangles">Triangles</option>
              <option value="custom">Custom Hatch</option>
            </select>
          </label>

          <label>
            <span>Hatch Spacing</span>
            <input id="polygonHatchScale" type="number" min="4" max="64" value="${layer.style.byType.Polygon.hatchScale || 12}" />
          </label>

          <label>
            <span>Hatch Line Scale</span>
            <input id="polygonHatchLineScale" type="number" min="0.5" max="6" step="0.25" value="${layer.style.byType.Polygon.hatchLineScale || 1}" />
          </label>

          <label>
            <span>Hatch Rotate</span>
            <input id="polygonHatchRotation" type="number" min="0" max="180" step="5" value="${layer.style.byType.Polygon.hatchRotation || 0}" />
          </label>

          <label>
            <span>Boundary Weight</span>
            <input id="polygonWeight" type="number" min="1" max="12" value="${layer.style.byType.Polygon.weight}" />
          </label>

          <label>
            <span>Upload Hatch</span>
            <input id="polygonHatchUpload" type="file" accept=".json,.txt,.pat,.svg,.png" />
          </label>
        </div>
      </div>
    </div>

    <div class="style-editor-section object-rule-section">
      <div class="style-editor-title">Selected Object Rule</div>
      <div id="objectRuleContent"></div>
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById("closeStyleEditorBtn").addEventListener("click", () => {
    closeLayerStyleEditor();
  });

  setSelectValue("pointSymbol", layer.style.byType.Point.symbol || "circle");
  setSelectValue("lineType", layer.style.byType.Line.lineType || "solid");
  setSelectValue("polygonLineType", layer.style.byType.Polygon.lineType || "solid");
  setSelectValue("polygonHatch", layer.style.byType.Polygon.hatch || "solid-fill");

  bindColorAlphaPair(appState, layer, "layerDefaultColor", "layerDefaultColorAlpha", (value) => {
    layer.style.default.color = normalizeAlphaColor(value, layer.style.default.color);
  });

  bindColorAlphaPair(appState, layer, "layerDefaultFill", "layerDefaultFillAlpha", (value) => {
    layer.style.default.fillColor = normalizeAlphaColor(value, layer.style.default.fillColor);
  });

  bindLayerStyleInput(appState, layer, "layerDefaultWeight", (value) => {
    layer.style.default.weight = Number(value);
  });

  bindLayerStyleInput(appState, layer, "pointSymbol", (value) => {
    layer.style.byType.Point.symbol = value;
  });

  bindColorAlphaPair(appState, layer, "pointColor", "pointColorAlpha", (value) => {
    const color = normalizeAlphaColor(value, layer.style.byType.Point.color);
    layer.style.byType.Point.color = color;
    layer.style.byType.Point.fillColor = color;
  });

  bindLayerStyleInput(appState, layer, "pointIconUrl", (value) => {
    layer.style.byType.Point.customIconUrl = value.trim();
    layer.style.byType.Point.symbol = value.trim() ? "custom-icon" : layer.style.byType.Point.symbol;
    setSelectValue("pointSymbol", layer.style.byType.Point.symbol);
  });

  bindFileUploadToStyle(appState, layer, "pointIconUpload", (objectUrl, file) => {
    layer.style.byType.Point.customIconUrl = objectUrl;
    layer.style.byType.Point.customIconName = file.name;
    layer.style.byType.Point.symbol = "custom-icon";
    setSelectValue("pointSymbol", "custom-icon");

    const urlInput = document.getElementById("pointIconUrl");
    if (urlInput) {
      urlInput.value = file.name;
    }
  });

  bindLayerStyleInput(appState, layer, "lineType", (value) => {
    layer.style.byType.Line.lineType = value;
    layer.style.byType.Line.dashArray = getDashArrayForLineType(value);
  });

  bindColorAlphaPair(appState, layer, "lineColor", "lineColorAlpha", (value) => {
    layer.style.byType.Line.color = normalizeAlphaColor(value, layer.style.byType.Line.color);
  });

  bindLayerStyleInput(appState, layer, "lineWeight", (value) => {
    layer.style.byType.Line.weight = Number(value);
  });

  bindFileUploadToStyle(appState, layer, "lineTypeUpload", (objectUrl, file) => {
    layer.style.byType.Line.customLineTypeUrl = objectUrl;
    layer.style.byType.Line.customLineTypeName = file.name;
    layer.style.byType.Line.lineType = "custom";
    layer.style.byType.Line.dashArray = "10 4 2 4";
    setSelectValue("lineType", "custom");
  });

  bindColorAlphaPair(appState, layer, "polygonColor", "polygonColorAlpha", (value) => {
    layer.style.byType.Polygon.color = normalizeAlphaColor(value, layer.style.byType.Polygon.color);
  });

  bindColorAlphaPair(appState, layer, "polygonFill", "polygonFillAlpha", (value) => {
    layer.style.byType.Polygon.fillColor = normalizeAlphaColor(value, layer.style.byType.Polygon.fillColor);
  });

  bindLayerStyleInput(appState, layer, "polygonLineType", (value) => {
    layer.style.byType.Polygon.lineType = value;
    layer.style.byType.Polygon.dashArray = getDashArrayForLineType(value);
  });

  bindLayerStyleInput(appState, layer, "polygonHatch", (value) => {
    layer.style.byType.Polygon.hatch = value;
    layer.style.byType.Polygon.fillOpacity = getFillOpacityForHatch(value);
  });

  bindLayerStyleInput(appState, layer, "polygonHatchScale", (value) => {
    layer.style.byType.Polygon.hatchScale = Number(value);
  });

  bindLayerStyleInput(appState, layer, "polygonHatchLineScale", (value) => {
    layer.style.byType.Polygon.hatchLineScale = Number(value);
  });

  bindLayerStyleInput(appState, layer, "polygonHatchRotation", (value) => {
    layer.style.byType.Polygon.hatchRotation = Number(value);
  });

  bindLayerStyleInput(appState, layer, "polygonWeight", (value) => {
    layer.style.byType.Polygon.weight = Number(value);
  });

  bindFileUploadToStyle(appState, layer, "polygonHatchUpload", (objectUrl, file) => {
    layer.style.byType.Polygon.customHatchUrl = objectUrl;
    layer.style.byType.Polygon.customHatchName = file.name;
    layer.style.byType.Polygon.hatch = "custom";
    setSelectValue("polygonHatch", "custom");
  });

  renderObjectRuleSection(appState, layer, selectedEntity);
}



function renderObjectRuleSection(appState, layer, selectedEntity = null) {
  const container = document.getElementById("objectRuleContent");

  if (!container) {
    return;
  }

  const selectedContexts = getSelectedEntityContextsForLayer(appState, layer);

  if (selectedContexts.length === 0) {
    container.innerHTML = `
      <div class="style-empty-object">
        Select one or more objects from this layer to edit object-level drawing rules.
      </div>
    `;
    return;
  }

  if (selectedContexts.length === 1) {
    renderSingleObjectRuleSection(appState, layer, selectedContexts[0].entity);
    return;
  }

  renderMultiObjectRuleSection(appState, layer, selectedContexts);
}

function renderSingleObjectRuleSection(appState, layer, selectedEntity) {
  const container = document.getElementById("objectRuleContent");

  if (!container) {
    return;
  }

  if (!selectedEntity.style) {
    selectedEntity.style = createDefaultObjectStyle();
  }

  const category = getVectorEntityCategory(selectedEntity);

  container.innerHTML = `
    <div class="selected-object-title">
      ${selectedEntity.entityType} · ${selectedEntity.id}
    </div>

    <label class="style-rule-row draw-rule-row">
      <span>Draw Rule</span>
      <select id="selectedEntityStyleMode">
        <option value="ByLayer">By Layer</option>
        <option value="ByType">By Type</option>
        <option value="ByObject">By Object</option>
      </select>
    </label>

    <div id="selectedObjectControls" class="style-form-grid object-controls">
      ${category === "Point" ? `
        <label>
          <span>Symbol</span>
          <select id="selectedEntitySymbol">
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="diamond">Diamond</option>
            <option value="cross">Cross</option>
            <option value="star">Star</option>
            <option value="pin">Pin</option>
            <option value="custom-icon">Custom Icon</option>
          </select>
        </label>

        <label class="custom-icon-row">
          <span>Custom Icon</span>
          <div class="combined-file-control">
            <input id="selectedEntityIconUrl" type="text" value="${selectedEntity.style.customIconUrl || ""}" placeholder="URL or upload file" />
            <input id="selectedEntityIconUpload" type="file" accept=".png,.jpg,.jpeg,.svg,.webp" />
          </div>
        </label>
      ` : ""}

      ${(category === "Line" || category === "Polygon") ? `
        <label>
          <span>Line Type</span>
          <select id="selectedEntityLineType">
            <option value="solid">Solid</option>
            <option value="dash">Dash</option>
            <option value="dot">Dot</option>
            <option value="dash-dot">Dash Dot</option>
            <option value="center">Center</option>
            <option value="hidden">Hidden</option>
            <option value="phantom">Phantom</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label>
          <span>Custom LineType</span>
          <input id="selectedEntityLineTypeUpload" type="file" accept=".json,.txt,.lin" />
        </label>
      ` : ""}

      ${category === "Polygon" ? `
        <label>
          <span>Hatch</span>
          <select id="selectedEntityHatch">
            <option value="solid-fill">Solid Fill</option>
            <option value="none">No Fill</option>
            <option value="ansi31">ANSI31 Diagonal</option>
            <option value="cross">Cross Hatch</option>
            <option value="grid">Grid</option>
            <option value="dots">Dots</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="diagonal-back">Diagonal Back</option>
            <option value="double-diagonal">Double Diagonal</option>
            <option value="brick">Brick</option>
            <option value="zigzag">Zigzag</option>
            <option value="triangles">Triangles</option>
            <option value="custom">Custom Hatch</option>
          </select>
        </label>

        <label>
          <span>Hatch Spacing</span>
          <input id="selectedEntityHatchScale" type="number" min="4" max="64" value="${selectedEntity.style.hatchScale || 12}" />
        </label>

        <label>
          <span>Hatch Line Scale</span>
          <input id="selectedEntityHatchLineScale" type="number" min="0.5" max="6" step="0.25" value="${selectedEntity.style.hatchLineScale || 1}" />
        </label>

        <label>
          <span>Hatch Rotate</span>
          <input id="selectedEntityHatchRotation" type="number" min="0" max="180" step="5" value="${selectedEntity.style.hatchRotation || 0}" />
        </label>

        <label>
          <span>Custom Hatch</span>
          <input id="selectedEntityHatchUpload" type="file" accept=".json,.txt,.pat,.svg,.png" />
        </label>
      ` : ""}

      <label>
        <span>Stroke</span>
        <div class="color-alpha-control">
          <input id="selectedEntityColor" type="color" value="${getColorHexPart(selectedEntity.style.color)}" />
          <input id="selectedEntityColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(selectedEntity.style.color, selectedEntity.style.opacity ?? 1)}" />
        </div>
      </label>

      ${category !== "Line" ? `
        <label>
          <span>Fill</span>
          <div class="color-alpha-control">
          <input id="selectedEntityFill" type="color" value="${getColorHexPart(selectedEntity.style.fillColor)}" />
          <input id="selectedEntityFillAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(selectedEntity.style.fillColor, 0)}" />
        </div>
        </label>
      ` : ""}

      <label>
        <span>Weight</span>
        <input id="selectedEntityWeight" type="number" min="1" max="12" value="${selectedEntity.style.weight}" />
      </label>
    </div>
  `;

  bindSingleObjectRuleControls(appState, layer, selectedEntity, category);
}

function renderMultiObjectRuleSection(appState, layer, selectedContexts) {
  const container = document.getElementById("objectRuleContent");
  const categories = new Set(selectedContexts.map((context) => getVectorEntityCategory(context.entity)));
  const commonMode = getCommonValue(selectedContexts, (context) => context.entity.styleMode || "ByLayer");
  const commonStroke = getCommonValue(selectedContexts, (context) => context.entity.style?.color || "#1f66d1");
  const commonFill = getCommonValue(selectedContexts, (context) => context.entity.style?.fillColor || "#1f66d1");
  const commonWeight = getCommonValue(selectedContexts, (context) => context.entity.style?.weight || 3);
  const commonSymbol = getCommonValue(selectedContexts, (context) => context.entity.style?.symbol || "circle");
  const commonLineType = getCommonValue(selectedContexts, (context) => context.entity.style?.lineType || "solid");
  const commonHatch = getCommonValue(selectedContexts, (context) => context.entity.style?.hatch || "solid-fill");

  container.innerHTML = `
    <div class="selected-object-title">
      ${selectedContexts.length} selected objects
    </div>

    <label class="style-rule-row draw-rule-row">
      <span>Draw Rule</span>
      <select id="multiEntityStyleMode">
        <option value="">Keep mixed</option>
        <option value="ByLayer">By Layer</option>
        <option value="ByType">By Type</option>
        <option value="ByObject">By Object</option>
      </select>
    </label>

    <div id="multiObjectControls" class="style-form-grid object-controls">
      ${categories.has("Point") ? `
        <label>
          <span>Point Symbol</span>
          <select id="multiEntitySymbol">
            <option value="">Keep mixed</option>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="diamond">Diamond</option>
            <option value="cross">Cross</option>
            <option value="star">Star</option>
            <option value="pin">Pin</option>
            <option value="custom-icon">Custom Icon</option>
          </select>
        </label>

        <label class="custom-icon-row">
          <span>Custom Icon</span>
          <div class="combined-file-control">
            <input id="multiEntityIconUrl" type="text" placeholder="URL or upload file" />
            <input id="multiEntityIconUpload" type="file" accept=".png,.jpg,.jpeg,.svg,.webp" />
          </div>
        </label>
      ` : ""}

      ${(categories.has("Line") || categories.has("Polygon")) ? `
        <label>
          <span>Line Type</span>
          <select id="multiEntityLineType">
            <option value="">Keep mixed</option>
            <option value="solid">Solid</option>
            <option value="dash">Dash</option>
            <option value="dot">Dot</option>
            <option value="dash-dot">Dash Dot</option>
            <option value="center">Center</option>
            <option value="hidden">Hidden</option>
            <option value="phantom">Phantom</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      ` : ""}

      ${categories.has("Polygon") ? `
        <label>
          <span>Hatch</span>
          <select id="multiEntityHatch">
            <option value="">Keep mixed</option>
            <option value="solid-fill">Solid Fill</option>
            <option value="none">No Fill</option>
            <option value="ansi31">ANSI31 Diagonal</option>
            <option value="cross">Cross Hatch</option>
            <option value="grid">Grid</option>
            <option value="dots">Dots</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
            <option value="diagonal-back">Diagonal Back</option>
            <option value="double-diagonal">Double Diagonal</option>
            <option value="brick">Brick</option>
            <option value="zigzag">Zigzag</option>
            <option value="triangles">Triangles</option>
            <option value="custom">Custom Hatch</option>
          </select>
        </label>

        <label>
          <span>Hatch Spacing</span>
          <input id="multiEntityHatchScale" type="number" min="4" max="64" value="12" />
        </label>

        <label>
          <span>Hatch Line Scale</span>
          <input id="multiEntityHatchLineScale" type="number" min="0.5" max="6" step="0.25" value="1" />
        </label>

        <label>
          <span>Hatch Rotate</span>
          <input id="multiEntityHatchRotation" type="number" min="0" max="180" step="5" value="0" />
        </label>
      ` : ""}

      <label>
        <span>Stroke</span>
        <div class="color-alpha-control">
          <input id="multiEntityColor" type="color" value="${getColorHexPart(commonStroke || "#1f66d1")}" />
          <input id="multiEntityColorAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(commonStroke || "#1f66d1", 1)}" />
        </div>
      </label>

      ${categories.has("Point") || categories.has("Polygon") ? `
        <label>
          <span>Fill</span>
          <div class="color-alpha-control">
          <input id="multiEntityFill" type="color" value="${getColorHexPart(commonFill || "#1f66d1")}" />
          <input id="multiEntityFillAlpha" type="number" min="0" max="1" step="0.05" value="${getColorAlphaPart(commonFill || "#1f66d1", 0)}" />
        </div>
        </label>
      ` : ""}

      <label>
        <span>Weight</span>
        <input id="multiEntityWeight" type="number" min="1" max="12" value="${commonWeight || 3}" />
      </label>
    </div>

    <div class="multi-style-hint">
      Changes apply only to selected objects where the parameter is valid.
    </div>
  `;

  setSelectValue("multiEntityStyleMode", commonMode || "");
  setSelectValue("multiEntitySymbol", commonSymbol || "");
  setSelectValue("multiEntityLineType", commonLineType || "");
  setSelectValue("multiEntityHatch", commonHatch || "");

  bindMultiObjectRuleControls(appState, layer, selectedContexts);
}

function bindSingleObjectRuleControls(appState, layer, selectedEntity, category) {
  const modeSelect = document.getElementById("selectedEntityStyleMode");
  const controls = document.getElementById("selectedObjectControls");

  modeSelect.value = selectedEntity.styleMode || "ByLayer";
  controls.classList.toggle("disabled-controls", modeSelect.value !== "ByObject");

  setSelectValue("selectedEntitySymbol", selectedEntity.style.symbol || "circle");
  setSelectValue("selectedEntityLineType", selectedEntity.style.lineType || "solid");
  setSelectValue("selectedEntityHatch", selectedEntity.style.hatch || "solid-fill");

  modeSelect.addEventListener("change", () => {
    selectedEntity.styleMode = modeSelect.value;
    selectedEntity.properties.updatedAt = createGeoWorksTimestamp();
    controls.classList.toggle("disabled-controls", selectedEntity.styleMode !== "ByObject");
    redrawVectorLayer(appState, layer);
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntitySymbol", (value) => {
    selectedEntity.style.symbol = value;
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityIconUrl", (value) => {
    selectedEntity.style.customIconUrl = value.trim();
    if (value.trim()) {
      selectedEntity.style.symbol = "custom-icon";
      setSelectValue("selectedEntitySymbol", "custom-icon");
    }
  });

  bindObjectFileUpload(appState, layer, selectedEntity, "selectedEntityIconUpload", (objectUrl, file) => {
    selectedEntity.style.customIconUrl = objectUrl;
    selectedEntity.style.customIconName = file.name;
    selectedEntity.style.symbol = "custom-icon";
    setSelectValue("selectedEntitySymbol", "custom-icon");

    const urlInput = document.getElementById("selectedEntityIconUrl");
    if (urlInput) {
      urlInput.value = file.name;
    }
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityLineType", (value) => {
    selectedEntity.style.lineType = value;
    selectedEntity.style.dashArray = getDashArrayForLineType(value);
  });

  bindObjectFileUpload(appState, layer, selectedEntity, "selectedEntityLineTypeUpload", (objectUrl, file) => {
    selectedEntity.style.customLineTypeUrl = objectUrl;
    selectedEntity.style.customLineTypeName = file.name;
    selectedEntity.style.lineType = "custom";
    selectedEntity.style.dashArray = "10 4 2 4";
    setSelectValue("selectedEntityLineType", "custom");
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityHatch", (value) => {
    selectedEntity.style.hatch = value;
    selectedEntity.style.fillOpacity = getFillOpacityForHatch(value);
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityHatchScale", (value) => {
    selectedEntity.style.hatchScale = Number(value);
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityHatchLineScale", (value) => {
    selectedEntity.style.hatchLineScale = Number(value);
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityHatchRotation", (value) => {
    selectedEntity.style.hatchRotation = Number(value);
  });

  bindObjectFileUpload(appState, layer, selectedEntity, "selectedEntityHatchUpload", (objectUrl, file) => {
    selectedEntity.style.customHatchUrl = objectUrl;
    selectedEntity.style.customHatchName = file.name;
    selectedEntity.style.hatch = "custom";
    setSelectValue("selectedEntityHatch", "custom");
  });

  bindObjectColorAlphaPair(appState, layer, selectedEntity, "selectedEntityColor", "selectedEntityColorAlpha", (value) => {
    selectedEntity.style.color = normalizeAlphaColor(value, selectedEntity.style.color);
  });

  bindObjectColorAlphaPair(appState, layer, selectedEntity, "selectedEntityFill", "selectedEntityFillAlpha", (value) => {
    selectedEntity.style.fillColor = normalizeAlphaColor(value, selectedEntity.style.fillColor);
  });

  bindObjectRuleInput(appState, layer, selectedEntity, "selectedEntityWeight", (value) => {
    selectedEntity.style.weight = Number(value);
  });
}

function bindMultiObjectRuleControls(appState, layer, selectedContexts) {
  bindMultiSelectControl("multiEntityStyleMode", (entity, value) => {
    if (value) {
      entity.styleMode = value;
    }
  }, appState, layer, selectedContexts, false);

  bindMultiSelectControl("multiEntitySymbol", (entity, value) => {
    if (value && getVectorEntityCategory(entity) === "Point") {
      entity.styleMode = "ByObject";
      entity.style.symbol = value;
    }
  }, appState, layer, selectedContexts);

  bindMultiTextControl("multiEntityIconUrl", (entity, value) => {
    if (value && getVectorEntityCategory(entity) === "Point") {
      entity.styleMode = "ByObject";
      entity.style.customIconUrl = value.trim();
      entity.style.symbol = "custom-icon";
    }
  }, appState, layer, selectedContexts);

  bindMultiFileUpload("multiEntityIconUpload", (entity, objectUrl, file) => {
    if (getVectorEntityCategory(entity) === "Point") {
      entity.styleMode = "ByObject";
      entity.style.customIconUrl = objectUrl;
      entity.style.customIconName = file.name;
      entity.style.symbol = "custom-icon";
    }
  }, appState, layer, selectedContexts);

  bindMultiSelectControl("multiEntityLineType", (entity, value) => {
    const category = getVectorEntityCategory(entity);
    if (value && (category === "Line" || category === "Polygon")) {
      entity.styleMode = "ByObject";
      entity.style.lineType = value;
      entity.style.dashArray = getDashArrayForLineType(value);
    }
  }, appState, layer, selectedContexts);

  bindMultiSelectControl("multiEntityHatch", (entity, value) => {
    if (value && getVectorEntityCategory(entity) === "Polygon") {
      entity.styleMode = "ByObject";
      entity.style.hatch = value;
      entity.style.fillOpacity = getFillOpacityForHatch(value);
    }
  }, appState, layer, selectedContexts);

  bindMultiInputControl("multiEntityHatchScale", (entity, value) => {
    if (getVectorEntityCategory(entity) === "Polygon") {
      entity.styleMode = "ByObject";
      entity.style.hatchScale = Number(value);
    }
  }, appState, layer, selectedContexts);

  bindMultiInputControl("multiEntityHatchLineScale", (entity, value) => {
    if (getVectorEntityCategory(entity) === "Polygon") {
      entity.styleMode = "ByObject";
      entity.style.hatchLineScale = Number(value);
    }
  }, appState, layer, selectedContexts);

  bindMultiInputControl("multiEntityHatchRotation", (entity, value) => {
    if (getVectorEntityCategory(entity) === "Polygon") {
      entity.styleMode = "ByObject";
      entity.style.hatchRotation = Number(value);
    }
  }, appState, layer, selectedContexts);

  bindMultiColorAlphaPair(appState, layer, selectedContexts, "multiEntityColor", "multiEntityColorAlpha", (entity, value) => {
    entity.style.color = normalizeAlphaColor(value, entity.style.color);
  });

  bindMultiColorAlphaPair(appState, layer, selectedContexts, "multiEntityFill", "multiEntityFillAlpha", (entity, value) => {
    const category = getVectorEntityCategory(entity);
    if (category === "Point" || category === "Polygon") {
      entity.style.fillColor = normalizeAlphaColor(value, entity.style.fillColor);
    }
  });

  bindMultiInputControl("multiEntityWeight", (entity, value) => {
    entity.styleMode = "ByObject";
    entity.style.weight = Number(value);
  }, appState, layer, selectedContexts);
}

function getSelectedEntityContextsForLayer(appState, layer) {
  if (!appState.selectedEntities || appState.selectedEntities.length === 0) {
    return [];
  }

  return appState.selectedEntities
    .filter((selected) => selected.layerId === layer.internalId)
    .map((selected) => {
      return {
        layer,
        entity: typeof findVectorEntity === "function"
          ? findVectorEntity(layer, selected.entityId)
          : null
      };
    })
    .filter((context) => Boolean(context.entity));
}

function getCommonValue(contexts, getter) {
  if (!contexts.length) {
    return "";
  }

  const firstValue = getter(contexts[0]);

  const allSame = contexts.every((context) => {
    return getter(context) === firstValue;
  });

  return allSame ? firstValue : "";
}

function bindMultiInputControl(inputId, updateFunction, appState, layer, selectedContexts) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    selectedContexts.forEach((context) => {
      updateFunction(context.entity, input.value);
      context.entity.properties.updatedAt = createGeoWorksTimestamp();
    });

    redrawVectorLayer(appState, layer);
  });
}

function bindMultiTextControl(inputId, updateFunction, appState, layer, selectedContexts) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  input.addEventListener("change", () => {
    selectedContexts.forEach((context) => {
      updateFunction(context.entity, input.value);
      context.entity.properties.updatedAt = createGeoWorksTimestamp();
    });

    redrawVectorLayer(appState, layer);
  });
}

function bindMultiSelectControl(inputId, updateFunction, appState, layer, selectedContexts, forceObjectMode = true) {
  const select = document.getElementById(inputId);
  if (!select) {
    return;
  }

  select.addEventListener("change", () => {
    selectedContexts.forEach((context) => {
      if (forceObjectMode && select.value) {
        context.entity.styleMode = "ByObject";
      }

      updateFunction(context.entity, select.value);
      context.entity.properties.updatedAt = createGeoWorksTimestamp();
    });

    redrawVectorLayer(appState, layer);
    refreshOpenStyleEditorForSelection(appState);
  });
}

function bindMultiFileUpload(inputId, updateFunction, appState, layer, selectedContexts) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    selectedContexts.forEach((context) => {
      updateFunction(context.entity, objectUrl, file);
      context.entity.properties.updatedAt = createGeoWorksTimestamp();
    });

    redrawVectorLayer(appState, layer);
    refreshOpenStyleEditorForSelection(appState);
  });
}




function bindObjectRuleInput(appState, layer, entity, inputId, updateFunction) {
  const input = document.getElementById(inputId);

  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    entity.styleMode = "ByObject";

    const modeSelect = document.getElementById("selectedEntityStyleMode");
    const controls = document.getElementById("selectedObjectControls");

    if (modeSelect) {
      modeSelect.value = "ByObject";
    }

    if (controls) {
      controls.classList.remove("disabled-controls");
    }

    updateFunction(input.value);
    entity.properties.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  });
}

function refreshOpenStyleEditorForSelection(appState) {
  const panel = document.getElementById("layerStyleEditor");

  if (!panel || !appState.activeStyleLayerId) {
    return;
  }

  const layer = findLayer(appState, appState.activeStyleLayerId);

  if (!layer) {
    closeLayerStyleEditor();
    return;
  }

  const selectedContext = getSingleSelectedEntityContext(appState, layer);
  renderObjectRuleSection(
    appState,
    layer,
    selectedContext ? selectedContext.entity : null
  );
}

function getSingleSelectedEntityContext(appState, preferredLayer = null) {
  if (!appState.selectedEntities || appState.selectedEntities.length !== 1) {
    return null;
  }

  const selected = appState.selectedEntities[0];

  if (preferredLayer && selected.layerId !== preferredLayer.internalId) {
    return null;
  }

  const layer = findLayer(appState, selected.layerId);
  const entity = typeof findVectorEntity === "function"
    ? findVectorEntity(layer, selected.entityId)
    : null;

  if (!layer || !entity) {
    return null;
  }

  return {
    layer,
    entity
  };
}

function createDefaultObjectStyle() {
  return {
    color: "#1f66d1",
    fillColor: "#1f66d1",
    weight: 3,
    radius: 6,
    opacity: 1,
    fillOpacity: 0,
    symbol: "circle",
    lineType: "solid",
    dashArray: null,
    hatch: "none",
    hatchScale: 12,
    hatchLineScale: 1,
    hatchRotation: 0,
    customIconUrl: ""
  };
}



function setAlphaColorInput(colorInputId, alphaInputId, colorValue, defaultAlpha = 1) {
  const colorInput = document.getElementById(colorInputId);
  const alphaInput = document.getElementById(alphaInputId);

  if (!colorInput || !alphaInput) {
    return;
  }

  colorInput.value = getColorHexPart(colorValue);
  alphaInput.value = String(defaultAlpha);
}

function getColorHexPart(value) {
  const clean = String(value || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return clean;
  }

  if (/^#[0-9a-fA-F]{8}$/.test(clean)) {
    return clean.slice(0, 7);
  }

  return "#1f66d1";
}

function getColorAlphaPart(value, fallback = 1) {
  const clean = String(value || "").trim();

  if (/^#[0-9a-fA-F]{8}$/.test(clean)) {
    return Math.round((parseInt(clean.slice(7, 9), 16) / 255) * 100) / 100;
  }

  return fallback;
}

function alphaToHex(alphaValue) {
  const alpha = Math.max(0, Math.min(Number(alphaValue), 1));
  const value = Math.round(alpha * 255);
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function composeAlphaColor(colorValue, alphaValue) {
  const color = getColorHexPart(colorValue);
  const alpha = Number(alphaValue);

  if (alpha >= 0.995) {
    return color;
  }

  return `${color}${alphaToHex(alpha)}`;
}

function bindColorAlphaPair(appState, layer, colorInputId, alphaInputId, updateFunction) {
  const colorInput = document.getElementById(colorInputId);
  const alphaInput = document.getElementById(alphaInputId);

  if (!colorInput || !alphaInput) {
    return;
  }

  const update = () => {
    updateFunction(composeAlphaColor(colorInput.value, alphaInput.value));
    layer.metadata.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  };

  colorInput.addEventListener("input", update);
  alphaInput.addEventListener("input", update);
}

function bindObjectColorAlphaPair(appState, layer, entity, colorInputId, alphaInputId, updateFunction) {
  const colorInput = document.getElementById(colorInputId);
  const alphaInput = document.getElementById(alphaInputId);

  if (!colorInput || !alphaInput) {
    return;
  }

  const update = () => {
    entity.styleMode = "ByObject";

    const modeSelect = document.getElementById("selectedEntityStyleMode");
    const controls = document.getElementById("selectedObjectControls");

    if (modeSelect) {
      modeSelect.value = "ByObject";
    }

    if (controls) {
      controls.classList.remove("disabled-controls");
    }

    updateFunction(composeAlphaColor(colorInput.value, alphaInput.value));
    entity.properties.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  };

  colorInput.addEventListener("input", update);
  alphaInput.addEventListener("input", update);
}

function bindMultiColorAlphaPair(appState, layer, selectedContexts, colorInputId, alphaInputId, updateFunction) {
  const colorInput = document.getElementById(colorInputId);
  const alphaInput = document.getElementById(alphaInputId);

  if (!colorInput || !alphaInput) {
    return;
  }

  const update = () => {
    selectedContexts.forEach((context) => {
      context.entity.styleMode = "ByObject";
      updateFunction(context.entity, composeAlphaColor(colorInput.value, alphaInput.value));
      context.entity.properties.updatedAt = createGeoWorksTimestamp();
    });

    redrawVectorLayer(appState, layer);
  };

  colorInput.addEventListener("input", update);
  alphaInput.addEventListener("input", update);
}


function normalizeAlphaColor(value, fallback = "#1f66d1") {
  const clean = String(value || "").trim();

  if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
    return clean;
  }

  if (/^#[0-9a-fA-F]{8}$/.test(clean)) {
    return clean;
  }

  return fallback;
}


function setSelectValue(id, value) {
  const select = document.getElementById(id);
  if (select) {
    select.value = value;
  }
}

function getDashArrayForLineType(lineType) {
  const patterns = {
    "solid": null,
    "dash": "10 6",
    "dot": "2 6",
    "dash-dot": "10 5 2 5",
    "center": "16 5 4 5",
    "hidden": "6 4",
    "phantom": "18 5 4 5 4 5",
    "custom": "10 4 2 4"
  };

  return patterns[lineType] || null;
}

function getFillOpacityForHatch(hatch) {
  if (hatch === "none") {
    return 0;
  }

  return 1;
}



function bindFileUploadToStyle(appState, layer, inputId, updateFunction) {
  const input = document.getElementById(inputId);

  if (!input) {
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];

    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    updateFunction(objectUrl, file);
    layer.metadata.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  });
}

function bindObjectFileUpload(appState, layer, entity, inputId, updateFunction) {
  const input = document.getElementById(inputId);

  if (!input) {
    return;
  }

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];

    if (!file) {
      return;
    }

    entity.styleMode = "ByObject";
    const modeSelect = document.getElementById("selectedEntityStyleMode");
    const controls = document.getElementById("selectedObjectControls");

    if (modeSelect) {
      modeSelect.value = "ByObject";
    }

    if (controls) {
      controls.classList.remove("disabled-controls");
    }

    const objectUrl = URL.createObjectURL(file);
    updateFunction(objectUrl, file);
    entity.properties.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  });
}


function bindLayerStyleInput(appState, layer, inputId, updateFunction) {
  const input = document.getElementById(inputId);

  input.addEventListener("input", () => {
    updateFunction(input.value);
    layer.metadata.updatedAt = createGeoWorksTimestamp();

    if (typeof redrawVectorLayer === "function") {
      redrawVectorLayer(appState, layer);
    }
  });
}

function closeLayerStyleEditor() {
  const existing = document.getElementById("layerStyleEditor");

  if (existing) {
    existing.remove();
  }
}


function createLayerActions(appState, layer) {
  const actions = document.createElement("div");
  actions.className = "layer-actions";

  actions.appendChild(createVisibilityButton(appState, layer));

  if (!isHyperLayer(layer)) {
    actions.appendChild(createSetActiveButton(appState, layer));
    actions.appendChild(createLockButton(appState, layer));
  }

  if (isHyperLayer(layer)) {
    actions.appendChild(createAddChildLayerMenuButton(appState, layer));
    actions.appendChild(createAddChildGroupButton(appState, layer));
  }

  actions.appendChild(createDeleteButton(appState, layer));

  return actions;
}

function createSetActiveButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button active-layer-button";
  button.type = "button";
  button.title = layer.state.locked ? "Locked layer cannot be active" : "Set active edit layer";
  button.innerHTML = layer.state.active
    ? `<i class="fa-solid fa-bullseye"></i>`
    : `<i class="fa-regular fa-circle-dot"></i>`;

  button.disabled = layer.state.locked;

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!canLayerBecomeActive(layer)) {
      return;
    }

    setSelectedLayer(appState, layer.internalId);
    setActiveLayer(appState, layer.internalId);
    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  return button;
}

function createLockButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button";
  button.type = "button";
  button.title = layer.state.locked ? "Unlock layer" : "Lock layer";
  button.innerHTML = layer.state.locked
    ? `<i class="fa-solid fa-lock"></i>`
    : `<i class="fa-solid fa-lock-open"></i>`;

  if (layer.state.locked) {
    button.classList.add("locked-button");
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    layer.state.locked = !layer.state.locked;
    layer.metadata.updatedAt = createGeoWorksTimestamp();

    if (layer.state.locked && appState.activeLayerId === layer.internalId) {
      clearActiveLayer(appState);
    }

    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  return button;
}

function createVisibilityButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button";
  button.type = "button";
  button.title = layer.state.visible ? "Hide layer" : "Show layer";
  button.innerHTML = layer.state.visible
    ? `<i class="fa-regular fa-eye"></i>`
    : `<i class="fa-regular fa-eye-slash"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setLayerVisibilityRecursive(appState, layer.internalId, !layer.state.visible);
    renderLayerTree(appState);
  });

  return button;
}

function createAddChildLayerMenuButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button";
  button.type = "button";
  button.title = "Add child layer";
  button.innerHTML = `<i class="fa-solid fa-plus"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    const dataType = window.prompt(
      "Child layer type: Vector, Raster, or GeoMedia",
      "Vector"
    );

    const normalizedType = normalizeDataType(dataType);

    if (!normalizedType) {
      return;
    }

    createLayer(appState, {
      name: getNextLayerName(appState, `Child ${normalizedType} Layer`),
      layerKind: "AtomicLayer",
      dataType: normalizedType,
      sensorType: getDefaultSensorType(normalizedType),
      parentId: layer.internalId
    });

    renderLayerTree(appState);
  });

  return button;
}

function createAddChildGroupButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button";
  button.type = "button";
  button.title = "Add child group";
  button.innerHTML = `<i class="fa-solid fa-folder-plus"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    createLayer(appState, {
      name: getNextLayerName(appState, "Nested Group"),
      layerKind: "HyperLayer",
      hyperLayerType: "Group",
      parentId: layer.internalId
    });

    renderLayerTree(appState);
  });

  return button;
}

function createDeleteButton(appState, layer) {
  const button = document.createElement("button");
  button.className = "layer-icon-button layer-action-danger";
  button.type = "button";
  button.title = "Delete layer";
  button.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteLayerRecursive(appState, layer.internalId);
    renderLayerTree(appState);
    updateToolbarForActiveLayer(appState);
  });

  return button;
}

function moveLayerRelativeToTarget(appState, draggedLayerId, targetLayerId, position) {
  const targetLayer = findLayer(appState, targetLayerId);

  if (!targetLayer) {
    return;
  }

  const siblings = getSiblingLayerIds(appState, targetLayer.parentId);
  const targetIndex = siblings.indexOf(targetLayerId);
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;

  moveLayerToParentAtIndex(appState, draggedLayerId, targetLayer.parentId, insertIndex);
}

function moveLayerToParentAtIndex(appState, layerId, newParentId, requestedIndex) {
  const layer = findLayer(appState, layerId);

  if (!layer) {
    return;
  }

  if (newParentId && !canDropOnLayer(appState, layerId, newParentId)) {
    return;
  }

  removeLayerFromCurrentParent(appState, layer);

  layer.parentId = newParentId || null;
  layer.metadata.updatedAt = createGeoWorksTimestamp();

  if (newParentId) {
    const parent = findLayer(appState, newParentId);

    if (!parent) {
      return;
    }

    const safeIndex = clampIndex(requestedIndex, parent.children.length);
    parent.children.splice(safeIndex, 0, layerId);
    parent.state.collapsed = false;
    parent.metadata.updatedAt = createGeoWorksTimestamp();

    return;
  }

  moveRootLayerToIndex(appState, layerId, requestedIndex);
}

function removeLayerFromCurrentParent(appState, layer) {
  if (layer.parentId) {
    const oldParent = findLayer(appState, layer.parentId);

    if (oldParent) {
      oldParent.children = oldParent.children.filter((childId) => childId !== layer.internalId);
      oldParent.metadata.updatedAt = createGeoWorksTimestamp();
    }
  }
}

function moveRootLayerToIndex(appState, layerId, requestedIndex) {
  const layer = findLayer(appState, layerId);

  if (!layer) {
    return;
  }

  removeLayerRuntime(appState, layer);
  appState.layers = appState.layers.filter((item) => item.internalId !== layerId);

  const rootLayers = getRootLayers(appState);
  const rootIds = rootLayers.map((item) => item.internalId);
  const safeIndex = clampIndex(requestedIndex, rootIds.length);
  const beforeId = rootIds[safeIndex] || null;

  if (!beforeId) {
    appState.layers.push(layer);
    return;
  }

  const absoluteIndex = appState.layers.findIndex((item) => item.internalId === beforeId);
  appState.layers.splice(absoluteIndex, 0, layer);
}

function getSiblingLayerIds(appState, parentId) {
  if (!parentId) {
    return getRootLayers(appState).map((layer) => layer.internalId);
  }

  const parent = findLayer(appState, parentId);
  return parent ? parent.children : [];
}

function getRootLayers(appState) {
  return appState.layers.filter((layer) => layer.parentId === null);
}

function clampIndex(index, length) {
  return Math.max(0, Math.min(index, length));
}

function getRenderableLayerOrder(appState) {
  const orderedLayers = [];

  getRootLayers(appState).forEach((layer) => {
    collectRenderableLayers(appState, layer, orderedLayers);
  });

  return orderedLayers;
}

function collectRenderableLayers(appState, layer, orderedLayers) {
  if (!layer.state.visible) {
    return;
  }

  if (!isHyperLayer(layer)) {
    orderedLayers.push(layer);
    return;
  }

  layer.children
    .map((childId) => findLayer(appState, childId))
    .filter(Boolean)
    .forEach((childLayer) => {
      collectRenderableLayers(appState, childLayer, orderedLayers);
    });
}

function canDropOnLayer(appState, draggedLayerId, targetLayerId) {
  if (!draggedLayerId || !targetLayerId) {
    return false;
  }

  if (draggedLayerId === targetLayerId) {
    return false;
  }

  const targetLayer = findLayer(appState, targetLayerId);

  if (!targetLayer || !isHyperLayer(targetLayer)) {
    return false;
  }

  if (isDescendantOf(appState, targetLayerId, draggedLayerId)) {
    return false;
  }

  return true;
}

function isDescendantOf(appState, possibleDescendantId, ancestorId) {
  const possibleDescendant = findLayer(appState, possibleDescendantId);

  if (!possibleDescendant || !possibleDescendant.parentId) {
    return false;
  }

  if (possibleDescendant.parentId === ancestorId) {
    return true;
  }

  return isDescendantOf(appState, possibleDescendant.parentId, ancestorId);
}

function deleteLayerRecursive(appState, layerId) {
  const layer = findLayer(appState, layerId);

  if (!layer) {
    return;
  }

  [...layer.children].forEach((childId) => {
    deleteLayerRecursive(appState, childId);
  });

  if (layer.parentId) {
    const parent = findLayer(appState, layer.parentId);

    if (parent) {
      parent.children = parent.children.filter((childId) => childId !== layerId);
      parent.metadata.updatedAt = createGeoWorksTimestamp();
    }
  }

  removeLayerRuntime(appState, layer);
  appState.layers = appState.layers.filter((item) => item.internalId !== layerId);

  if (appState.activeLayerId === layerId) {
    clearActiveLayer(appState);
  }

  if (appState.selectedLayerId === layerId) {
    appState.selectedLayerId = null;
  }
}

function setLayerVisibilityRecursive(appState, layerId, visible) {
  const layer = findLayer(appState, layerId);

  if (!layer) {
    return;
  }

  layer.state.visible = visible;
  layer.metadata.updatedAt = createGeoWorksTimestamp();

  if (typeof updateLayerRuntimeVisibility === "function") {
    updateLayerRuntimeVisibility(appState, layer);
  }

  layer.children.forEach((childId) => {
    setLayerVisibilityRecursive(appState, childId, visible);
  });
}

function setSelectedLayer(appState, layerId) {
  appState.selectedLayerId = layerId;

  appState.layers.forEach((layer) => {
    layer.state.selected = layer.internalId === layerId;
  });
}

function setActiveLayer(appState, layerId) {
  const layer = findLayer(appState, layerId);

  if (!layer || !canLayerBecomeActive(layer)) {
    return;
  }

  appState.activeLayerId = layerId;

  appState.layers.forEach((item) => {
    item.state.active = item.internalId === layerId;
  });
}

function clearActiveLayer(appState) {
  appState.activeLayerId = null;

  appState.layers.forEach((layer) => {
    layer.state.active = false;
  });
}

function canLayerBecomeActive(layer) {
  return layer && layer.layerKind === "AtomicLayer" && !layer.state.locked;
}

function getActiveHyperLayerId(appState) {
  const selectedLayer = findLayer(appState, appState.selectedLayerId);

  if (selectedLayer && isHyperLayer(selectedLayer)) {
    return selectedLayer.internalId;
  }

  return null;
}

function isHyperLayer(layer) {
  return layer.layerKind === "HyperLayer";
}

function findLayer(appState, layerId) {
  return appState.layers.find((layer) => layer.internalId === layerId);
}

function getNextLayerName(appState, prefix) {
  const samePrefixCount = appState.layers.filter((layer) => {
    return layer.name.startsWith(prefix);
  }).length;

  return `${prefix} ${samePrefixCount + 1}`;
}

function getDefaultSensorType(dataType) {
  if (dataType === "Raster") {
    return "Optical";
  }

  if (dataType === "GeoMedia") {
    return "Image";
  }

  return "MixedVector";
}

function normalizeDataType(value) {
  const text = String(value || "").trim().toLowerCase();

  if (text === "vector") {
    return "Vector";
  }

  if (text === "raster") {
    return "Raster";
  }

  if (text === "geomedia" || text === "geolocatedmedia" || text === "geo media") {
    return "GeoMedia";
  }

  return null;
}

function canChangeLayerType(layer) {
  if (layer.layerKind !== "AtomicLayer") return false;
  if (layer.dataType === "Vector") return !layer.data || !layer.data.entities || layer.data.entities.length === 0;
  return true;
}

function removeLayerRuntime(appState, layer) {
  if (layer && layer.runtime && layer.runtime.leafletLayer && appState.map && appState.map.hasLayer(layer.runtime.leafletLayer)) {
    appState.map.removeLayer(layer.runtime.leafletLayer);
  }
}

function createInitialLayerStyle(dataType) {
  if (dataType !== "Vector") {
    return {};
  }

  return {
    default: {
      color: "#1f66d1",
      fillColor: "#1f66d1",
      weight: 3,
      radius: 6,
      opacity: 1,
      fillOpacity: 0,
      lineType: "solid",
      dashArray: null,
      hatch: "none",
      hatchScale: 12,
      hatchLineScale: 1,
      hatchRotation: 0,
      symbol: "circle"
    },
    byType: {
      Point: {
        color: "#1f66d1",
        fillColor: "#1f66d1",
        radius: 6,
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
        symbol: "circle",
        customIconUrl: ""
      },
      Line: {
        color: "#1f66d1",
        weight: 3,
        opacity: 1,
        fillOpacity: 0,
        lineType: "solid",
        dashArray: null,
        customLineTypeUrl: ""
      },
      Polygon: {
        color: "#1f66d1",
        fillColor: "#1f66d1",
        weight: 3,
        opacity: 1,
        fillOpacity: 0,
        lineType: "solid",
        dashArray: null,
        hatch: "none",
        hatchScale: 12,
        hatchLineScale: 1,
        hatchRotation: 0,
        customHatchUrl: ""
      }
    }
  };
}




function createInitialLayerData(dataType) {
  if (dataType === "Vector") return { entities: [] };
  if (dataType === "Raster") return { rasterSource: null };
  if (dataType === "GeoMedia") return { mediaItems: [] };
  return {};
}

function createInternalLayerId() {
  layerIdCounter += 1;
  return `layer_${String(layerIdCounter).padStart(4, "0")}`;
}

function createGeoWorksTimestamp() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${day}${month}${year}T${hours}:${minutes}:${seconds}`;
}
