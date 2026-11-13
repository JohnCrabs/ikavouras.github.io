/* =========================================================================
   CTopoSim — Χάρτης (Leaflet) με υπόβαθρα, DEM, κτίρια OSM
   Ένας χάρτης που μετακινείται ανάμεσα στις καρτέλες 1 και 5.
   ========================================================================= */
"use strict";

const MapView = (() => {
  let map, layers = {}, clickHandler = null, overlays = {};
  const GREECE = L.latLngBounds([33.5, 18.5], [42.5, 30.5]);

  function init() {
    map = L.map("map", { zoomControl: true, maxBounds: GREECE.pad(0.2), minZoom: 6, maxZoom: 21,
                         preferCanvas: false, doubleClickZoom: false })
      .setView([38.0410, 23.8165], 17);

    const base = {
      "Εθνικό Κτηματολόγιο 2015-2016": L.tileLayer(
        "https://tiles-eu1.arcgis.com/40tFGWzosjaLJpmn/arcgis/rest/services/Greece_Basemap_v2/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "© Ελληνικό Κτηματολόγιο" }),
      "Κτηματολόγιο (WMS, παλαιό)": L.tileLayer.wms("https://gis.ktimanet.gr/wms/wmsopen/wmsserver.aspx",
        { layers: "BASEMAP", format: "image/png", crs: L.CRS.EPSG4326, maxZoom: 21, attribution: "© Κτηματολόγιο" }),
      "Δορυφορική (Esri)": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "© Esri" }),
      "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap contributors" }),
    };
    base["Εθνικό Κτηματολόγιο 2015-2016"].addTo(map);

    layers.dem = new DEM.HillshadeLayer({ maxNativeZoom: DEM.Z, maxZoom: 21, opacity: 0.55,
      attribution: "DEM: Mapzen/AWS Terrain Tiles" });
    layers.buildings = L.layerGroup().addTo(map);
    layers.area = L.layerGroup().addTo(map);
    layers.traverse = L.layerGroup().addTo(map);
    layers.tachy = L.layerGroup().addTo(map);
    overlays = {
      "DEM (σκίαση αναγλύφου)": layers.dem,
      "Κτίρια OSM (ύψος)": layers.buildings,
      "Όδευση": layers.traverse,
      "Ταχυμετρία": layers.tachy,
    };
    L.control.layers(base, overlays, { collapsed: true }).addTo(map);
    L.control.scale({ imperial: false, maxWidth: 160 }).addTo(map);

    const info = L.control({ position: "bottomleft" });
    info.onAdd = () => { const d = L.DomUtil.create("div", "map-readout"); d.id = "readout"; d.textContent = "ΕΓΣΑ 87"; return d; };
    info.addTo(map);
    map.on("mousemove", e => {
      const { E, N } = GEO.toEGSA(e.latlng.lat, e.latlng.lng);
      let txt = `E ${E.toFixed(2)}  N ${N.toFixed(2)}`;
      if (DEM.hasDEM()) {
        const s = DEM.surfaceAt(e.latlng.lat, e.latlng.lng);
        if (isFinite(s.terrain)) txt += `  |  H εδάφους ${s.terrain.toFixed(1)} m`;
        if (s.building) txt += `  |  κτίριο ${s.building.h.toFixed(1)} m${s.building.src === "default" ? " (εκτίμηση)" : ""}`;
      }
      $("#readout").textContent = txt;
    });
    map.on("click", e => clickHandler && clickHandler(e));
  }

  function attach(hostId) {
    const host = document.getElementById(hostId);
    const el = document.getElementById("map");
    if (el.parentElement !== host) host.append(el);
    setTimeout(() => map.invalidateSize(), 30);
  }

  function heightColor(hh) {
    const f = Math.max(0, Math.min(1, hh / 30));
    const c = [[255, 237, 160], [254, 178, 76], [240, 59, 32], [128, 0, 38]];
    const x = f * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)), t = x - i;
    const rgb = c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * t));
    return `rgb(${rgb.join(",")})`;
  }

  function drawBuildings() {
    layers.buildings.clearLayers();
    const r = L.canvas({ padding: 0.3 });
    for (const b of DEM.getBuildings()) {
      L.polygon(b.ring, { renderer: r, color: "#5a3d2b", weight: 0.6, fillColor: heightColor(b.h), fillOpacity: 0.55,
                          interactive: false }).addTo(layers.buildings);
    }
  }

  function drawArea(area) {
    layers.area.clearLayers();
    if (!area) return;
    L.rectangle([[area.south, area.west], [area.north, area.east]],
      { color: "#1b6ec2", weight: 2, dashArray: "6 4", fill: false, interactive: false }).addTo(layers.area);
  }

  return {
    init, attach, drawBuildings, drawArea, heightColor,
    get map() { return map; }, get layers() { return layers; },
    onClick(fn) { clickHandler = fn; },
  };
})();
