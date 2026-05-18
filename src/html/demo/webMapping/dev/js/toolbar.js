const TOOLBAR_FALLBACK_HTML = `<div class="toolbar-header">
  <div class="toolbar-title">Tools</div>
  <div id="toolbarLayerLabel" class="toolbar-layer-label">No active layer</div>
</div>

<div id="toolbarTools" class="toolbar-tools"></div>

<div id="toolbarHint" class="toolbar-hint">
  Select an unlocked atomic layer to activate editing tools.
</div>
`;

const TOOL_SETS = {
  none: [
    { id: "select", label: "Select", icon: "fa-solid fa-arrow-pointer", enabled: false },
    { id: "measure-distance", label: "Distance", icon: "fa-solid fa-ruler-horizontal", enabled: true },
    { id: "measure-area", label: "Area", icon: "fa-regular fa-square", enabled: true }
  ],
  Vector: [
    {
      id: "pan",
      label: "Pan",
      icon: "fa-solid fa-hand",
      enabled: true
    },
    {
      id: "select",
      label: "Select",
      icon: "fa-solid fa-arrow-pointer",
      enabled: true
    },
    {
      id: "shapes-menu",
      label: "Shapes",
      icon: "fa-solid fa-shapes",
      enabled: true,
      menu: [
        {
          id: "draw-point",
          label: "Point",
          icon: "fa-solid fa-location-dot"
        },
        {
          id: "draw-line",
          label: "Line",
          icon: "fa-solid fa-slash"
        },
        {
          id: "draw-polyline",
          label: "Polyline",
          icon: "fa-solid fa-route"
        },
        {
          id: "draw-arc",
          label: "Arc",
          icon: "fa-solid fa-archway"
        },
        {
          id: "draw-polygon",
          label: "Polygon",
          icon: "fa-solid fa-draw-polygon"
        },
        {
          id: "draw-rectangle",
          label: "Rectangle",
          icon: "fa-regular fa-square"
        },
        {
          id: "draw-square",
          label: "Square",
          icon: "fa-solid fa-vector-square"
        },
        {
          id: "draw-circle",
          label: "Circle",
          icon: "fa-regular fa-circle"
        },
        {
          id: "draw-ellipse",
          label: "Ellipse",
          icon: "fa-regular fa-circle"
        },
        {
          id: "draw-triangle",
          label: "Triangle",
          icon: "fa-solid fa-play"
        },
        {
          id: "draw-rhombus",
          label: "Rhombus",
          icon: "fa-regular fa-gem"
        },
        {
          id: "draw-regular-polygon",
          label: "Regular Polygon",
          icon: "fa-solid fa-dice-d6"
        }
      ]
    },
    {
      separator: true
    },
    {
      id: "measure-distance",
      label: "Distance",
      icon: "fa-solid fa-ruler-horizontal",
      enabled: true
    },
    {
      id: "measure-area",
      label: "Area",
      icon: "fa-regular fa-square",
      enabled: true
    }
  ],
  Raster: [
    { id: "select", label: "Select", icon: "fa-solid fa-arrow-pointer", enabled: true },
    { id: "identify-raster", label: "Identify", icon: "fa-solid fa-crosshairs", enabled: true },
    { id: "raster-opacity", label: "Opacity", icon: "fa-solid fa-circle-half-stroke", enabled: true },
    { separator: true },
    { id: "measure-distance", label: "Distance", icon: "fa-solid fa-ruler-horizontal", enabled: true },
    { id: "measure-area", label: "Area", icon: "fa-regular fa-square", enabled: true }
  ],
  GeoMedia: [
    { id: "select-media", label: "Select", icon: "fa-solid fa-arrow-pointer", enabled: true },
    { id: "add-photo", label: "Photo", icon: "fa-solid fa-image", enabled: true },
    { id: "add-video", label: "Video", icon: "fa-solid fa-video", enabled: true },
    { id: "delete-media", label: "Delete", icon: "fa-solid fa-trash-can", enabled: true, danger: true },
    { separator: true },
    { id: "measure-distance", label: "Distance", icon: "fa-solid fa-ruler-horizontal", enabled: true }
  ]
};

async function loadToolbar() {
  const container = document.getElementById("toolbarContainer");

  try {
    const response = await fetch("html/toolbar.html");

    if (!response.ok) {
      throw new Error("Toolbar fragment could not be loaded.");
    }

    container.outerHTML = await response.text();
  } catch (error) {
    console.warn("Using embedded toolbar fallback because toolbar.html could not be fetched.", error);
    container.innerHTML = TOOLBAR_FALLBACK_HTML;
  }
}

function setupToolbar(appState) {
  appState.activeTool = "pan";
  updateToolbarForActiveLayer(appState);
}

function updateToolbarForActiveLayer(appState) {
  const activeLayer = getActiveLayer(appState);
  const toolsContainer = document.getElementById("toolbarTools");
  const layerLabel = document.getElementById("toolbarLayerLabel");
  const hint = document.getElementById("toolbarHint");

  if (!toolsContainer || !layerLabel || !hint) {
    return;
  }

  const toolSetKey = activeLayer ? activeLayer.dataType : "none";
  const tools = TOOL_SETS[toolSetKey] || TOOL_SETS.none;

  layerLabel.textContent = activeLayer
    ? `${activeLayer.name} · ${activeLayer.dataType}`
    : "No active layer";

  hint.textContent = getToolbarHint(activeLayer);
  toolsContainer.innerHTML = "";

  tools.forEach((tool) => {
    if (tool.separator) {
      const separator = document.createElement("div");
      separator.className = "tool-separator";
      toolsContainer.appendChild(separator);
      return;
    }

    toolsContainer.appendChild(createToolbarButton(appState, tool, activeLayer));
  });
}

function createToolbarButton(appState, tool, activeLayer) {
  if (tool.menu) {
    return createToolbarMenuButton(appState, tool, activeLayer);
  }

  const button = document.createElement("button");
  button.className = "tool-btn";
  button.type = "button";
  button.dataset.tool = tool.id;
  button.disabled = !tool.enabled;

  if (tool.danger) {
    button.classList.add("danger-tool");
  }

  if (!tool.enabled) {
    button.classList.add("disabled");
  }

  if (appState.activeTool === tool.id) {
    button.classList.add("active");
  }

  button.innerHTML = `
    <i class="${tool.icon}"></i>
    <span>${tool.label}</span>
  `;

  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }

    setToolbarTool(appState, tool.id, button, activeLayer);
  });

  return button;
}









document.addEventListener("click", (event) => {
  if (!event.target.closest(".tool-menu-wrapper")) {
    closeToolbarMenus();
  }
});

function createToolbarMenuButton(appState, tool, activeLayer) {
  const wrapper = document.createElement("div");
  wrapper.className = "tool-menu-wrapper";

  const button = document.createElement("button");
  button.className = "tool-btn tool-menu-main";
  button.type = "button";
  button.dataset.tool = tool.id;
  button.disabled = !tool.enabled;

  button.innerHTML = `
    <i class="${tool.icon}"></i>
    <span>${tool.label}</span>
    <small class="tool-menu-caret">
      <i class="fa-solid fa-chevron-right"></i>
    </small>
  `;

  const menu = document.createElement("div");
  menu.className = "tool-submenu";

  tool.menu.forEach((item) => {
    const itemButton = document.createElement("button");
    itemButton.className = "tool-submenu-item";
    itemButton.type = "button";
    itemButton.dataset.tool = item.id;
    itemButton.innerHTML = `
      <i class="${item.icon}"></i>
      <span>${item.label}</span>
    `;

    if (appState.activeTool === item.id) {
      itemButton.classList.add("active");
      button.classList.add("active");
    }

    itemButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setToolbarTool(appState, item.id, itemButton, activeLayer);
      closeToolbarMenus();
    });

    menu.appendChild(itemButton);
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (button.disabled) {
      return;
    }

    const wasOpen = wrapper.classList.contains("open");
    closeToolbarMenus();

    if (!wasOpen) {
      const rect = button.getBoundingClientRect();
      menu.style.setProperty("--tool-menu-top", `${rect.top}px`);
      wrapper.classList.add("open");
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  return wrapper;
}

function setToolbarTool(appState, toolId, sourceButton, activeLayer) {
  appState.activeTool = toolId;

  document.querySelectorAll(".tool-btn, .tool-submenu-item").forEach((item) => {
    item.classList.remove("active");
  });

  sourceButton.classList.add("active");

  const wrapper = sourceButton.closest(".tool-menu-wrapper");

  if (wrapper) {
    const mainButton = wrapper.querySelector(".tool-menu-main");
    mainButton.classList.add("active");
  }

  console.log(
    `Tool selected: ${toolId}`,
    activeLayer ? `Active layer: ${activeLayer.name}` : "No active layer"
  );

  if (toolId === "pan" && appState.map && !appState.map.dragging.enabled()) {
    appState.map.dragging.enable();
  }

  if (typeof onVectorToolChanged === "function") {
    onVectorToolChanged(appState, toolId);
  }
}

function closeToolbarMenus() {
  document.querySelectorAll(".tool-menu-wrapper.open").forEach((wrapper) => {
    wrapper.classList.remove("open");
  });
}

function getToolbarHint(activeLayer) {
  if (!activeLayer) {
    return "No editable active layer. Select an unlocked Vector, Raster, or GeoMedia layer.";
  }

  if (activeLayer.dataType === "Vector") {
    return "Vector layer active: points, lines, and polygons can be added here. Export can later split geometries by type.";
  }

  if (activeLayer.dataType === "Raster") {
    return "Raster layer active: vector drawing tools are hidden.";
  }

  if (activeLayer.dataType === "GeoMedia") {
    return "GeoMedia layer active: use media tools to place geolocated images or videos.";
  }

  return "Active layer selected.";
}

function getActiveLayer(appState) {
  if (!appState.activeLayerId) {
    return null;
  }

  const layer = findLayer(appState, appState.activeLayerId);

  if (!layer || layer.layerKind !== "AtomicLayer" || layer.state.locked) {
    return null;
  }

  return layer;
}
