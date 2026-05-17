const SCALE_MENU_FALLBACK_HTML = "<div id=\"scaleMenu\" class=\"scale-menu\" aria-label=\"Scale menu\">\n  <label class=\"scale-menu-label\" for=\"scaleInput\">Scale</label>\n\n  <div class=\"scale-compact-row\">\n    <span class=\"scale-prefix\">1 :</span>\n\n    <input\n      id=\"scaleInput\"\n      type=\"text\"\n      inputmode=\"numeric\"\n      placeholder=\"10000\"\n      aria-label=\"Scale denominator\"\n    />\n\n    <button\n      id=\"scaleLockBtn\"\n      class=\"scale-icon-button\"\n      type=\"button\"\n      title=\"Lock scale\"\n      aria-label=\"Lock scale\"\n    >\n      <i class=\"fa-solid fa-lock-open\"></i>\n    </button>\n\n    <button\n      id=\"worldScaleBtn\"\n      class=\"scale-icon-button\"\n      type=\"button\"\n      title=\"World scale\"\n      aria-label=\"World scale\"\n    >\n      <i class=\"fa-solid fa-globe\"></i>\n    </button>\n  </div>\n\n  <div class=\"scale-menu-hint\">\n    Press Enter after typing a scale.\n  </div>\n</div>\n";

async function loadScaleMenu() {
  const menu = document.getElementById("scaleMenu");

  try {
    const response = await fetch("html/scale.html");

    if (!response.ok) {
      throw new Error("Scale fragment could not be loaded.");
    }

    menu.outerHTML = await response.text();
  } catch (error) {
    console.warn(
      "Using embedded scale fallback because scale.html could not be fetched.",
      error
    );

    menu.outerHTML = SCALE_MENU_FALLBACK_HTML;
  }
}

function setupScaleMenu(appState) {
  const toggleButton = document.getElementById("scaleToggleBtn");
  const menu = document.getElementById("scaleMenu");
  const scaleInput = document.getElementById("scaleInput");
  const scaleLockButton = document.getElementById("scaleLockBtn");
  const worldScaleButton = document.getElementById("worldScaleBtn");

  toggleButton.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    toggleButton.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      scaleInput.focus();
      scaleInput.select();
    }
  });

  scaleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const scale = parseScaleInput(scaleInput.value);

      if (scale) {
        applyScale(appState, scale);
        menu.classList.remove("open");
        toggleButton.setAttribute("aria-expanded", "false");
      }
    }
  });

  scaleLockButton.addEventListener("click", () => {
    toggleScaleLock(appState);
  });

  worldScaleButton.addEventListener("click", () => {
    goToWorldScale(appState);
    menu.classList.remove("open");
    toggleButton.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".scale-control")) {
      menu.classList.remove("open");
      toggleButton.setAttribute("aria-expanded", "false");
    }
  });
}

function parseScaleInput(value) {
  const cleaned = String(value)
    .replace(/1\s*:/i, "")
    .replaceAll(",", "")
    .replaceAll(" ", "")
    .trim();

  const scale = Number(cleaned);

  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  return scale;
}

function applyScale(appState, targetScale) {
  const targetZoom = scaleToZoom(appState.map, targetScale);
  const wasLocked = appState.isScaleLocked;

  appState.requestedScale = targetScale;

  if (wasLocked) {
    temporarilyUnlockZoom(appState);
  }

  appState.map.setZoom(targetZoom, {
    animate: false
  });

  updateScaleReadout(appState.map, targetScale);

  if (wasLocked) {
    appState.isScaleLocked = true;
    appState.lockedZoom = appState.map.getZoom();
    applyScaleLockState(appState);
  }
}

function toggleScaleLock(appState) {
  appState.isScaleLocked = !appState.isScaleLocked;

  if (appState.isScaleLocked) {
    appState.lockedZoom = appState.map.getZoom();
    appState.requestedScale = getScaleNumber(appState.map);
  } else {
    appState.lockedZoom = null;
    appState.requestedScale = null;
  }

  applyScaleLockState(appState);
  updateScaleReadout(
    appState.map,
    appState.isScaleLocked ? appState.requestedScale : null
  );
}

function applyScaleLockState(appState) {
  const lockButton = document.getElementById("scaleLockBtn");

  if (appState.isScaleLocked) {
    appState.lockedZoom = appState.map.getZoom();

    appState.map.setMinZoom(appState.lockedZoom);
    appState.map.setMaxZoom(appState.lockedZoom);

    appState.map.scrollWheelZoom.disable();
    appState.map.doubleClickZoom.disable();
    appState.map.boxZoom.disable();
    appState.map.keyboard.disable();

    if (appState.map.touchZoom) {
      appState.map.touchZoom.disable();
    }

    lockButton.classList.add("active");
    lockButton.title = "Unlock scale";
    lockButton.setAttribute("aria-label", "Unlock scale");
    lockButton.innerHTML = `<i class="fa-solid fa-lock"></i>`;
  } else {
    temporarilyUnlockZoom(appState);

    lockButton.classList.remove("active");
    lockButton.title = "Lock scale";
    lockButton.setAttribute("aria-label", "Lock scale");
    lockButton.innerHTML = `<i class="fa-solid fa-lock-open"></i>`;
  }
}

function temporarilyUnlockZoom(appState) {
  appState.isScaleLocked = false;
  appState.lockedZoom = null;

  appState.map.setMinZoom(2);
  appState.map.setMaxZoom(20);

  appState.map.scrollWheelZoom.enable();
  appState.map.doubleClickZoom.enable();
  appState.map.boxZoom.enable();
  appState.map.keyboard.enable();

  if (appState.map.touchZoom) {
    appState.map.touchZoom.enable();
  }
}

function goToWorldScale(appState) {
  const wasLocked = appState.isScaleLocked;

  appState.requestedScale = null;

  if (wasLocked) {
    temporarilyUnlockZoom(appState);
  }

  appState.map.setView([20, 0], 2, {
    animate: false
  });

  appState.map.setMinZoom(2);

  if (wasLocked) {
    appState.isScaleLocked = true;
    appState.lockedZoom = appState.map.getZoom();
    appState.requestedScale = getScaleNumber(appState.map);
    applyScaleLockState(appState);
  }

  updateScaleReadout(appState.map, appState.requestedScale);
}

function scaleToZoom(map, targetScale) {
  const center = map.getCenter();
  const latitudeFactor = Math.cos(center.lat * Math.PI / 180);
  const metersPerPixel = targetScale * 0.0254 / 96;
  const zoom = Math.log2(156543.03392 * latitudeFactor / metersPerPixel);

  return clamp(zoom, 2, 20);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateScaleReadout(map, requestedScale = null) {
  const scaleNumber = requestedScale || getScaleNumber(map);
  const formattedScale = formatScale(scaleNumber);

  document.getElementById("scaleReadout").textContent = `1:${formattedScale}`;
  document.getElementById("statusScale").textContent = `Scale: 1:${formattedScale}`;

  const scaleInput = document.getElementById("scaleInput");

  if (scaleInput && document.activeElement !== scaleInput) {
    scaleInput.value = formattedScale;
  }
}

function getScaleNumber(map) {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const latitudeFactor = Math.cos(center.lat * Math.PI / 180);
  const metersPerPixel = 156543.03392 * latitudeFactor / Math.pow(2, zoom);
  const scale = metersPerPixel * 96 / 0.0254;

  return Math.round(scale);
}

function formatScale(scale) {
  return Math.round(scale).toLocaleString("en-US");
}

function getApproximateScale(map) {
  return formatScale(getScaleNumber(map));
}
