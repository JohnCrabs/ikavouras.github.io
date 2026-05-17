const EPSG_MENU_FALLBACK_HTML = "<div id=\"epsgMenu\" class=\"epsg-menu\" aria-label=\"Coordinate reference system menu\">\n  <label class=\"epsg-menu-label\" for=\"epsgSelect\">Coordinate System</label>\n\n  <select id=\"epsgSelect\" aria-label=\"Select EPSG code\">\n    <option value=\"EPSG:3857\">EPSG:3857 \u2014 Web Mercator</option>\n    <option value=\"EPSG:4326\">EPSG:4326 \u2014 WGS84 Longitude / Latitude</option>\n    <option value=\"EPSG:2100\">EPSG:2100 \u2014 Greek Grid / GGRS87</option>\n    <option value=\"EPSG:32634\">EPSG:32634 \u2014 WGS84 / UTM Zone 34N</option>\n    <option value=\"EPSG:32635\">EPSG:32635 \u2014 WGS84 / UTM Zone 35N</option>\n    <option value=\"EPSG:3035\">EPSG:3035 \u2014 ETRS89 / LAEA Europe</option>\n    <option value=\"EPSG:4258\">EPSG:4258 \u2014 ETRS89 Longitude / Latitude</option>\n  </select>\n\n  <label class=\"epsg-menu-label custom-epsg-label\" for=\"customEpsgInput\">\n    Add / use custom EPSG\n  </label>\n\n  <input\n    id=\"customEpsgInput\"\n    class=\"custom-epsg-input\"\n    type=\"text\"\n    inputmode=\"numeric\"\n    placeholder=\"Example: 2100 or EPSG:2100\"\n    aria-label=\"Custom EPSG code\"\n  />\n\n  <div class=\"epsg-menu-hint\">\n    Select from the list, or type a code and press Enter.\n  </div>\n</div>\n";

async function loadEpsgMenu() {
  const menu = document.getElementById("epsgMenu");

  try {
    const response = await fetch("html/epsg.html");

    if (!response.ok) {
      throw new Error("EPSG fragment could not be loaded.");
    }

    menu.outerHTML = await response.text();
  } catch (error) {
    console.warn(
      "Using embedded EPSG fallback because epsg.html could not be fetched.",
      error
    );

    menu.outerHTML = EPSG_MENU_FALLBACK_HTML;
  }
}

function setupEpsgDefinitions() {
  if (typeof proj4 === "undefined") {
    console.warn("Proj4 is not available. EPSG transformations will be limited.");
    return;
  }

  proj4.defs(
    "EPSG:2100",
    "+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 " +
    "+x_0=500000 +y_0=0 +ellps=GRS80 " +
    "+towgs84=-199.87,74.79,246.62,0,0,0,0 " +
    "+units=m +no_defs +type=crs"
  );

  proj4.defs(
    "EPSG:32634",
    "+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs +type=crs"
  );

  proj4.defs(
    "EPSG:32635",
    "+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs +type=crs"
  );

  proj4.defs(
    "EPSG:3035",
    "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 " +
    "+ellps=GRS80 +units=m +no_defs +type=crs"
  );

  proj4.defs("EPSG:4258", "+proj=longlat +ellps=GRS80 +no_defs +type=crs");
}

function setupEpsgMenu(appState) {
  setupEpsgDefinitions();

  const toggleButton = document.getElementById("epsgToggleBtn");
  const menu = document.getElementById("epsgMenu");
  const select = document.getElementById("epsgSelect");
  const customInput = document.getElementById("customEpsgInput");

  select.value = appState.activeEpsg;

  toggleButton.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("open");
    toggleButton.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      select.focus();
    }
  });

  select.addEventListener("change", () => {
    applyEpsg(appState, select.value);
    closeEpsgMenu();
  });

  select.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyEpsg(appState, select.value);
      closeEpsgMenu();
    }
  });

  customInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const epsgCode = normalizeEpsgCode(customInput.value);

    if (!epsgCode) {
      return;
    }

    await registerCustomEpsg(epsgCode);
    addEpsgOptionIfMissing(select, epsgCode);
    select.value = epsgCode;

    applyEpsg(appState, epsgCode);
    closeEpsgMenu();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".epsg-control")) {
      closeEpsgMenu();
    }
  });

  updateActiveEpsgUi(appState.activeEpsg);
}

function applyEpsg(appState, epsgCode) {
  appState.activeEpsg = epsgCode;
  updateActiveEpsgUi(epsgCode);

  const center = appState.map.getCenter();
  updateCoordinateReadout(center, epsgCode);
}

function normalizeEpsgCode(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (/^EPSG:\d+$/.test(text)) {
    return text;
  }

  if (/^\d+$/.test(text)) {
    return `EPSG:${text}`;
  }

  return null;
}

function addEpsgOptionIfMissing(select, epsgCode) {
  const existing = Array.from(select.options).some((option) => {
    return option.value === epsgCode;
  });

  if (existing) {
    return;
  }

  const option = document.createElement("option");
  option.value = epsgCode;
  option.textContent = `${epsgCode} — Custom`;
  select.appendChild(option);
}

async function registerCustomEpsg(epsgCode) {
  if (isKnownEpsg(epsgCode)) {
    return;
  }

  if (typeof proj4 === "undefined") {
    return;
  }

  const code = epsgCode.replace("EPSG:", "");

  try {
    const response = await fetch(`https://epsg.io/${code}.proj4`);

    if (!response.ok) {
      throw new Error(`Could not fetch definition for ${epsgCode}.`);
    }

    const definition = await response.text();

    if (definition.trim()) {
      proj4.defs(epsgCode, definition.trim());
    }
  } catch (error) {
    console.warn(
      `${epsgCode} was added to the list, but its transformation definition could not be loaded.`,
      error
    );
  }
}

function isKnownEpsg(epsgCode) {
  if (epsgCode === "EPSG:3857" || epsgCode === "EPSG:4326") {
    return true;
  }

  if (typeof proj4 === "undefined") {
    return false;
  }

  try {
    return Boolean(proj4.defs(epsgCode));
  } catch (error) {
    return false;
  }
}

function updateActiveEpsgUi(epsgCode) {
  document.getElementById("activeEpsgLabel").textContent = epsgCode;

  const select = document.getElementById("epsgSelect");

  if (select) {
    addEpsgOptionIfMissing(select, epsgCode);
    select.value = epsgCode;
  }
}

function closeEpsgMenu() {
  const menu = document.getElementById("epsgMenu");
  const toggleButton = document.getElementById("epsgToggleBtn");

  menu.classList.remove("open");
  toggleButton.setAttribute("aria-expanded", "false");
}

function formatCoordinateReadout(latlng, epsgCode) {
  if (epsgCode === "EPSG:4326" || epsgCode === "EPSG:4258") {
    return [
      `${epsgCode}`,
      `Lat: ${latlng.lat.toFixed(6)}`,
      `Lon: ${latlng.lng.toFixed(6)}`
    ].join("   ");
  }

  if (epsgCode === "EPSG:3857") {
    const projected = projectCoordinate(latlng, "EPSG:3857");

    return [
      "EPSG:3857",
      `X: ${formatProjectedNumber(projected[0])}`,
      `Y: ${formatProjectedNumber(projected[1])}`
    ].join("   ");
  }

  const projected = projectCoordinate(latlng, epsgCode);

  if (!projected) {
    return [
      "EPSG:4326",
      `Lat: ${latlng.lat.toFixed(6)}`,
      `Lon: ${latlng.lng.toFixed(6)}`
    ].join("   ");
  }

  return [
    epsgCode,
    `E: ${formatProjectedNumber(projected[0])}`,
    `N: ${formatProjectedNumber(projected[1])}`
  ].join("   ");
}

function projectCoordinate(latlng, epsgCode) {
  if (epsgCode === "EPSG:3857") {
    const point = L.CRS.EPSG3857.project(latlng);
    return [point.x, point.y];
  }

  if (typeof proj4 === "undefined") {
    return null;
  }

  try {
    return proj4("EPSG:4326", epsgCode, [latlng.lng, latlng.lat]);
  } catch (error) {
    console.warn(`Could not transform coordinate to ${epsgCode}.`, error);
    return null;
  }
}

function formatProjectedNumber(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function updateCoordinateReadout(latlng, epsgCode = "EPSG:3857") {
  const coordinateElement = document.getElementById("coordinateReadout");
  coordinateElement.textContent = formatCoordinateReadout(latlng, epsgCode);
}
