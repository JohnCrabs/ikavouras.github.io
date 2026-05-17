document.addEventListener("DOMContentLoaded", async () => {
  const appState = {
    map: null,
    activeTool: "select",
    activeBasemapKey: "osmStandard",
    activeBasemapLayer: null,
    activeEpsg: "EPSG:4326",
    isScaleLocked: false,
    lockedZoom: null,
    requestedScale: null
  };

  await loadBasemapMenu();
  await loadScaleMenu();
  await loadEpsgMenu();

  setupHeaderActions();
  setupToolButtons(appState);
  setupPanelTabs();
  setupBasemapSelector(appState);
  setupScaleMenu(appState);
  setupEpsgMenu(appState);
  initializeMap(appState);
});

function setupHeaderActions() {
  document.querySelectorAll(".header-action").forEach((button) => {
    button.addEventListener("click", () => {
      console.log(`Header action clicked: ${button.dataset.action}`);
    });
  });
}

function setupToolButtons(appState) {
  document.querySelectorAll(".tool-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      appState.activeTool = button.dataset.tool;

      console.log(`Tool selected: ${appState.activeTool}`);
    });
  });
}

function setupPanelTabs() {
  document.querySelectorAll(".panel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".panel-tab").forEach((item) => {
        item.classList.remove("active");
      });

      tab.classList.add("active");

      console.log(`Panel selected: ${tab.dataset.panel}`);
    });
  });
}

function initializeMap(appState) {
  appState.map = L.map("map", {
    zoomControl: true,
    minZoom: 2,
    zoomSnap: 0,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 90,
    worldCopyJump: true
  }).setView([20, 0], 2);

  setBasemap(appState, "osmStandard");

  appState.map.setMinZoom(2);

  appState.map.on("mousemove", (event) => {
    updateCoordinateReadout(event.latlng, appState.activeEpsg);
  });

  appState.map.on("zoomend moveend", () => {
    if (appState.isScaleLocked && appState.requestedScale) {
      updateScaleReadout(appState.map, appState.requestedScale);
      return;
    }

    updateScaleReadout(appState.map);
  });

  updateScaleReadout(appState.map);
}
