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
