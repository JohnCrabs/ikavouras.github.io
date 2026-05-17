document.addEventListener("DOMContentLoaded", async () => {
  const appState = {
    map: null,
    activeTool: "select",
    activeBasemapKey: "osmStandard",
    activeBasemapLayer: null
  };

  await loadBasemapMenu();

  setupHeaderActions();
  setupToolButtons(appState);
  setupPanelTabs();
  setupBasemapSelector(appState);
  initializeMap(appState);
});

async function loadBasemapMenu() {
  const menu = document.getElementById("basemapMenu");

  try {
    const response = await fetch("./html/basemap.html");

    if (!response.ok) {
      throw new Error("Basemap fragment could not be loaded.");
    }

    menu.outerHTML = await response.text();
  } catch (error) {
    console.warn(
      "Using embedded basemap fallback because basemap.html could not be fetched.",
      error
    );

    menu.outerHTML = BASEMAP_MENU_FALLBACK_HTML;
  }
}

//const BASEMAP_MENU_FALLBACK_HTML = "            <div id=\"basemapMenu\" class=\"basemap-menu\" aria-label=\"Basemap list\">\n              <div class=\"basemap-provider open\">\n                <button class=\"basemap-provider-toggle\" type=\"button\">\n                  <span>OpenStreetMap</span>\n                  <i class=\"fa-solid fa-chevron-right\"></i>\n                </button>\n\n                <div class=\"basemap-provider-options\">\n                  <button class=\"basemap-option active\" type=\"button\" data-basemap=\"osmStandard\">\n                    <span class=\"basemap-preview preview-osm\"></span>\n                    <span>Standard</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"osmHumanitarian\">\n                    <span class=\"basemap-preview preview-hot\"></span>\n                    <span>Humanitarian</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"osmGermany\">\n                    <span class=\"basemap-preview preview-osm-de\"></span>\n                    <span>Germany Style</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"osmFrance\">\n                    <span class=\"basemap-preview preview-france\"></span>\n                    <span>France Style</span>\n                  </button>\n                </div>\n              </div>\n\n              <div class=\"basemap-provider\">\n                <button class=\"basemap-provider-toggle\" type=\"button\">\n                  <span>Google</span>\n                  <i class=\"fa-solid fa-chevron-right\"></i>\n                </button>\n\n                <div class=\"basemap-provider-options\">\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"googleRoad\">\n                    <span class=\"basemap-preview preview-google-road\"></span>\n                    <span>Road Map</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"googleSatellite\">\n                    <span class=\"basemap-preview preview-google-satellite\"></span>\n                    <span>Satellite</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"googleHybrid\">\n                    <span class=\"basemap-preview preview-google-hybrid\"></span>\n                    <span>Hybrid</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"googleTerrain\">\n                    <span class=\"basemap-preview preview-google-terrain\"></span>\n                    <span>Terrain</span>\n                  </button>\n                </div>\n              </div>\n\n              <div class=\"basemap-provider\">\n                <button class=\"basemap-provider-toggle\" type=\"button\">\n                  <span>ESRI</span>\n                  <i class=\"fa-solid fa-chevron-right\"></i>\n                </button>\n\n                <div class=\"basemap-provider-options\">\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriImagery\">\n                    <span class=\"basemap-preview preview-imagery\"></span>\n                    <span>World Imagery</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriStreet\">\n                    <span class=\"basemap-preview preview-street\"></span>\n                    <span>World Streets</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriTopo\">\n                    <span class=\"basemap-preview preview-topo\"></span>\n                    <span>World Topographic</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriTerrain\">\n                    <span class=\"basemap-preview preview-terrain\"></span>\n                    <span>World Terrain</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriPhysical\">\n                    <span class=\"basemap-preview preview-physical\"></span>\n                    <span>Physical Map</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriShadedRelief\">\n                    <span class=\"basemap-preview preview-relief\"></span>\n                    <span>Shaded Relief</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriLightGray\">\n                    <span class=\"basemap-preview preview-gray\"></span>\n                    <span>Light Gray Canvas</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriDarkGray\">\n                    <span class=\"basemap-preview preview-dark-gray\"></span>\n                    <span>Dark Gray Canvas</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriOceans\">\n                    <span class=\"basemap-preview preview-oceans\"></span>\n                    <span>Oceans</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"esriNatGeo\">\n                    <span class=\"basemap-preview preview-natgeo\"></span>\n                    <span>National Geographic</span>\n                  </button>\n                </div>\n              </div>\n\n              <div class=\"basemap-provider\">\n                <button class=\"basemap-provider-toggle\" type=\"button\">\n                  <span>OpenTopo / Terrain</span>\n                  <i class=\"fa-solid fa-chevron-right\"></i>\n                </button>\n\n                <div class=\"basemap-provider-options\">\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"openTopoMap\">\n                    <span class=\"basemap-preview preview-open-topo\"></span>\n                    <span>OpenTopoMap</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"opnvKarte\">\n                    <span class=\"basemap-preview preview-opnv\"></span>\n                    <span>OPNVKarte</span>\n                  </button>\n                </div>\n              </div>\n<div class=\"basemap-provider\">\n                <button class=\"basemap-provider-toggle\" type=\"button\">\n                  <span>Carto</span>\n                  <i class=\"fa-solid fa-chevron-right\"></i>\n                </button>\n\n                <div class=\"basemap-provider-options\">\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoLight\">\n                    <span class=\"basemap-preview preview-light\"></span>\n                    <span>Positron</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoLightNoLabels\">\n                    <span class=\"basemap-preview preview-light-no-labels\"></span>\n                    <span>Positron No Labels</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoVoyager\">\n                    <span class=\"basemap-preview preview-voyager\"></span>\n                    <span>Voyager</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoVoyagerNoLabels\">\n                    <span class=\"basemap-preview preview-voyager-no-labels\"></span>\n                    <span>Voyager No Labels</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoDark\">\n                    <span class=\"basemap-preview preview-dark\"></span>\n                    <span>Dark Matter</span>\n                  </button>\n\n                  <button class=\"basemap-option\" type=\"button\" data-basemap=\"cartoDarkNoLabels\">\n                    <span class=\"basemap-preview preview-dark-no-labels\"></span>\n                    <span>Dark Matter No Labels</span>\n                  </button>\n                </div>\n              </div>\n            </div>\n";


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

const BASEMAPS = {
  osmStandard: {
    label: "OpenStreetMap Standard",
    provider: "xyz",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  osmHumanitarian: {
    label: "OSM Humanitarian",
    provider: "xyz",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors, Tiles style by HOT",
    maxZoom: 20
  },
  osmGermany: {
    label: "OpenStreetMap DE",
    provider: "xyz",
    url: "https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18
  },
  osmFrance: {
    label: "OpenStreetMap France",
    provider: "xyz",
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap France &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  googleRoad: {
    label: "Google Road Map",
    provider: "xyz",
    url: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google",
    maxZoom: 20
  },
  googleSatellite: {
    label: "Google Satellite",
    provider: "xyz",
    url: "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google",
    maxZoom: 20
  },
  googleHybrid: {
    label: "Google Hybrid",
    provider: "xyz",
    url: "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google",
    maxZoom: 20
  },
  googleTerrain: {
    label: "Google Terrain",
    provider: "xyz",
    url: "https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "&copy; Google",
    maxZoom: 20
  },
  esriImagery: {
    label: "Esri World Imagery",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 20
  },
  esriStreet: {
    label: "Esri World Streets",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 20
  },
  esriTopo: {
    label: "Esri World Topographic",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 20
  },
  esriTerrain: {
    label: "Esri World Terrain",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 13
  },
  esriPhysical: {
    label: "Esri Physical Map",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 8
  },
  esriShadedRelief: {
    label: "Esri Shaded Relief",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 13
  },
  esriLightGray: {
    label: "Esri Light Gray Canvas",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16
  },
  esriDarkGray: {
    label: "Esri Dark Gray Canvas",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16
  },
  esriOceans: {
    label: "Esri Oceans",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 10
  },
  esriNatGeo: {
    label: "Esri National Geographic",
    provider: "xyz",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 16
  },
  openTopoMap: {
    label: "OpenTopoMap",
    provider: "xyz",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap contributors",
    maxZoom: 17
  },
  opnvKarte: {
    label: "OPNVKarte",
    provider: "xyz",
    url: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors, Tiles courtesy of MeMoMaps",
    maxZoom: 18
  },
cartoLight: {
    label: "Carto Positron",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  cartoLightNoLabels: {
    label: "Carto Positron No Labels",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  cartoVoyager: {
    label: "Carto Voyager",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  cartoVoyagerNoLabels: {
    label: "Carto Voyager No Labels",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  cartoDark: {
    label: "Carto Dark Matter",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  },
  cartoDarkNoLabels: {
    label: "Carto Dark Matter No Labels",
    provider: "xyz",
    url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
    attribution: "&copy; CARTO &copy; OpenStreetMap contributors",
    maxZoom: 20
  }
};

function setupBasemapSelector(appState) {
  const toggleButton = document.getElementById("basemapToggleBtn");
  const menu = document.getElementById("basemapMenu");

  toggleButton.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    toggleButton.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll(".basemap-provider-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".basemap-provider").classList.toggle("open");
    });
  });

  document.querySelectorAll(".basemap-option").forEach((button) => {
    button.addEventListener("click", () => {
      setBasemap(appState, button.dataset.basemap);
      menu.classList.remove("open");
      toggleButton.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".basemap-control")) {
      menu.classList.remove("open");
      toggleButton.setAttribute("aria-expanded", "false");
    }
  });
}

function setBasemap(appState, basemapKey) {
  const basemap = BASEMAPS[basemapKey];

  if (!basemap || !appState.map) {
    return;
  }

  if (appState.activeBasemapLayer) {
    appState.map.removeLayer(appState.activeBasemapLayer);
  }

  appState.activeBasemapLayer = createBasemapLayer(basemap).addTo(appState.map);
  appState.activeBasemapKey = basemapKey;

  document.getElementById("activeBasemapLabel").textContent = basemap.label;

  document.querySelectorAll(".basemap-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.basemap === basemapKey);
  });
}

function createBasemapLayer(basemap) {
  if (basemap.provider === "bing") {
    return createBingTileLayer(basemap);
  }

  return L.tileLayer(basemap.url, {
    minZoom: 2,
    maxZoom: basemap.maxZoom,
    subdomains: basemap.subdomains || "abc",
    attribution: basemap.attribution
  });
}

function createBingTileLayer(basemap) {
  return L.tileLayer("", {
    minZoom: 2,
    maxZoom: basemap.maxZoom,
    attribution: basemap.attribution,
    subdomains: basemap.subdomains,

    getTileUrl: function (coords) {
      const quadkey = tileCoordinatesToQuadkey(coords.x, coords.y, coords.z);
      const subdomain = this.options.subdomains[
        Math.abs(coords.x + coords.y) % this.options.subdomains.length
      ];

      return basemap.template
        .replace("{q}", quadkey)
        .replace("{s}", subdomain);
    }
  });
}

function tileCoordinatesToQuadkey(x, y, z) {
  let quadkey = "";

  for (let i = z; i > 0; i -= 1) {
    let digit = 0;
    const mask = 1 << (i - 1);

    if ((x & mask) !== 0) {
      digit += 1;
    }

    if ((y & mask) !== 0) {
      digit += 2;
    }

    quadkey += digit.toString();
  }

  return quadkey;
}


function initializeMap(appState) {
  appState.map = L.map("map", {
    zoomControl: true,
    minZoom: 2,
    worldCopyJump: true
  }).setView([20, 0], 2);

  setBasemap(appState, "osmStandard");

  appState.map.setMinZoom(appState.map.getZoom());

  appState.map.on("mousemove", (event) => {
    updateCoordinateReadout(event.latlng);
  });

  appState.map.on("zoomend moveend", () => {
    updateScaleReadout(appState.map);
  });

  updateScaleReadout(appState.map);
}

function updateCoordinateReadout(latlng) {
  const coordinateElement = document.getElementById("coordinateReadout");

  coordinateElement.textContent = [
    `Lat: ${latlng.lat.toFixed(6)}`,
    `Lon: ${latlng.lng.toFixed(6)}`
  ].join("   ");
}

function updateScaleReadout(map) {
  const approximateScale = getApproximateScale(map);

  document.getElementById("scaleReadout").textContent = `1:${approximateScale}`;
  document.getElementById("statusScale").textContent = `Scale: 1:${approximateScale}`;
}

function getApproximateScale(map) {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const latitudeFactor = Math.cos(center.lat * Math.PI / 180);
  const metersPerPixel = 156543.03392 * latitudeFactor / Math.pow(2, zoom);
  const scale = Math.round(metersPerPixel * 96 / 0.0254);

  return scale.toLocaleString("en-US");
}
