/* CGeoRef – Υπόβαθρα Leaflet, ομαδοποιημένα ανά πάροχο */
(function (GR) {
  'use strict';
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const ESRI_ATTR = 'Tiles &copy; Esri';
  const EKXA = 'https://tiles-eu1.arcgis.com/40tFGWzosjaLJpmn/arcgis/rest/services/';
  const EKXA_ATTR = '&copy; <a href="https://www.ktimatologio.gr">Ελληνικό Κτηματολόγιο</a>';
  const CARTO_O = { maxZoom: 20, subdomains: 'abcd', attribution: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' };

  /** Ομάδες στη σειρά εμφάνισης */
  const GROUPS = ['ΕΚΧΑ (Κτηματολόγιο)', 'Esri', 'OpenStreetMap', 'CARTO', 'MapTiler 🔑', 'Thunderforest 🔑', 'Stadia Maps 🔑', 'Mapbox 🔑', 'HERE 🔑'];
  const MT = 'https://api.maptiler.com/maps/', MT_ATTR = '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM_ATTR;
  const TF = 'https://tile.thunderforest.com/', TF_ATTR = 'Maps &copy; <a href="https://www.thunderforest.com">Thunderforest</a>, ' + OSM_ATTR;
  const ST = 'https://tiles.stadiamaps.com/tiles/', ST_ATTR = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com/">Stamen Design</a> ' + OSM_ATTR;
  const MB = 'https://api.mapbox.com/styles/v1/mapbox/', MB_ATTR = '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' + OSM_ATTR;
  const HR = 'https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/', HR_ATTR = 'Map Tiles &copy; HERE';

  /**
   * Κάθε υπόβαθρο: { id, name, group, url, o } για XYZ, { ..., wms: true } για WMS,
   * ή { id, name, group, combo: [id, id] } για συνδυασμό υποβάθρου + επικάλυψης.
   * maxNativeZoom = το μεγαλύτερο επίπεδο που διαθέτει πραγματικά η υπηρεσία (πάνω από αυτό μεγεθύνεται).
   */
  const LIST = [
    // ---- ΕΚΧΑ – Ελληνικό Κτηματολόγιο ----
    { id: 'ekxa_2015', group: GROUPS[0], name: 'Ορθοφωτογραφίες 2015-2016 (LSO25, 50 cm)', url: EKXA + 'Greece_Basemap_v2/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 22, maxNativeZoom: 19, attribution: EKXA_ATTR } },
    { id: 'ekxa_2007', group: GROUPS[0], name: 'Ορθοφωτογραφίες 2007-2010 (LSO/VLSO, 50 cm)', url: EKXA + 'LSO_v2/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 22, maxNativeZoom: 18, attribution: EKXA_ATTR } },
    { id: 'ekxa_1945', group: GROUPS[0], name: 'Αεροφωτογραφίες 1945-1960 (OFX, 1 m)', url: EKXA + 'OFX_45_v2/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 22, maxNativeZoom: 17, attribution: EKXA_ATTR } },
    { id: 'ekxa_wms', group: GROUPS[0], name: 'WMS ktimanet (BASEMAP)', wms: true, url: 'https://gis.ktimanet.gr/wms/wmsopen/wmsserver.aspx', o: { layers: 'BASEMAP', format: 'image/png', crs: 'EPSG4326', maxZoom: 22, attribution: EKXA_ATTR } },
    { id: 'ekxa_2015_lbl', group: GROUPS[0], name: 'Ορθοφωτογραφίες 2015-2016 + ετικέτες', combo: ['ekxa_2015', 'esri_labels'] },
    { id: 'ekxa_2015_rd', group: GROUPS[0], name: 'Ορθοφωτογραφίες 2015-2016 + οδικό δίκτυο', combo: ['ekxa_2015', 'esri_roads'] },

    // ---- Esri ----
    { id: 'esri_img', group: GROUPS[1], name: 'World Imagery (δορυφορική)', url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 19, attribution: ESRI_ATTR + ' — Maxar, Earthstar Geographics' } },
    { id: 'esri_img_lbl', group: GROUPS[1], name: 'World Imagery + ετικέτες', combo: ['esri_img', 'esri_labels'] },
    { id: 'esri_img_rd', group: GROUPS[1], name: 'World Imagery + οδικό δίκτυο', combo: ['esri_img', 'esri_roads'] },
    { id: 'esri_topo', group: GROUPS[1], name: 'World Topo', url: ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 19, attribution: ESRI_ATTR } },
    { id: 'esri_street', group: GROUPS[1], name: 'World Street', url: ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 19, attribution: ESRI_ATTR } },
    { id: 'esri_gray', group: GROUPS[1], name: 'Light Gray Canvas', url: ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 16, attribution: ESRI_ATTR } },
    { id: 'esri_hillshade', group: GROUPS[1], name: 'Hillshade (σκίαση ανάγλυφου)', url: ESRI + 'Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 16, attribution: ESRI_ATTR } },

    // ---- OpenStreetMap ----
    { id: 'osm', group: GROUPS[2], name: 'OpenStreetMap (Standard)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', o: { maxZoom: 21, maxNativeZoom: 19, attribution: OSM_ATTR } },
    { id: 'osm_hot', group: GROUPS[2], name: 'Humanitarian (HOT)', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', o: { maxZoom: 21, maxNativeZoom: 19, attribution: OSM_ATTR + ' | HOT' } },
    { id: 'otm', group: GROUPS[2], name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', o: { maxZoom: 21, maxNativeZoom: 17, attribution: OSM_ATTR + ', SRTM | &copy; OpenTopoMap (CC-BY-SA)' } },
    { id: 'cyclosm', group: GROUPS[2], name: 'CyclOSM', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', o: { maxZoom: 21, maxNativeZoom: 20, attribution: OSM_ATTR + ' | CyclOSM' } },

    // ---- CARTO ----
    { id: 'carto_light', group: GROUPS[3], name: 'Positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', o: CARTO_O },
    { id: 'carto_voyager', group: GROUPS[3], name: 'Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', o: CARTO_O },
    { id: 'carto_dark', group: GROUPS[3], name: 'Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', o: CARTO_O },

    // ---- Πάροχοι με κλειδί API ({key} συμπληρώνεται από GR.apikeys) ----
    { id: 'mt_satellite', group: GROUPS[4], key: 'maptiler', name: 'Satellite', url: MT + 'satellite/256/{z}/{x}/{y}.jpg?key={key}', o: { maxZoom: 22, maxNativeZoom: 20, attribution: MT_ATTR } },
    { id: 'mt_hybrid', group: GROUPS[4], key: 'maptiler', name: 'Hybrid (δορυφορική + ετικέτες)', url: MT + 'hybrid/256/{z}/{x}/{y}.jpg?key={key}', o: { maxZoom: 22, maxNativeZoom: 20, attribution: MT_ATTR } },
    { id: 'mt_streets', group: GROUPS[4], key: 'maptiler', name: 'Streets', url: MT + 'streets-v2/256/{z}/{x}/{y}.png?key={key}', o: { maxZoom: 22, attribution: MT_ATTR } },
    { id: 'mt_topo', group: GROUPS[4], key: 'maptiler', name: 'Topo', url: MT + 'topo-v2/256/{z}/{x}/{y}.png?key={key}', o: { maxZoom: 22, attribution: MT_ATTR } },
    { id: 'mt_outdoor', group: GROUPS[4], key: 'maptiler', name: 'Outdoor', url: MT + 'outdoor-v2/256/{z}/{x}/{y}.png?key={key}', o: { maxZoom: 22, attribution: MT_ATTR } },

    { id: 'tf_cycle', group: GROUPS[5], key: 'thunderforest', name: 'OpenCycleMap', url: TF + 'cycle/{z}/{x}/{y}.png?apikey={key}', o: { maxZoom: 22, attribution: TF_ATTR } },
    { id: 'tf_outdoors', group: GROUPS[5], key: 'thunderforest', name: 'Outdoors', url: TF + 'outdoors/{z}/{x}/{y}.png?apikey={key}', o: { maxZoom: 22, attribution: TF_ATTR } },
    { id: 'tf_landscape', group: GROUPS[5], key: 'thunderforest', name: 'Landscape', url: TF + 'landscape/{z}/{x}/{y}.png?apikey={key}', o: { maxZoom: 22, attribution: TF_ATTR } },
    { id: 'tf_transport', group: GROUPS[5], key: 'thunderforest', name: 'Transport', url: TF + 'transport/{z}/{x}/{y}.png?apikey={key}', o: { maxZoom: 22, attribution: TF_ATTR } },

    { id: 'st_smooth', group: GROUPS[6], key: 'stadia', name: 'Alidade Smooth', url: ST + 'alidade_smooth/{z}/{x}/{y}{r}.png?api_key={key}', o: { maxZoom: 20, attribution: ST_ATTR } },
    { id: 'st_outdoors', group: GROUPS[6], key: 'stadia', name: 'Outdoors', url: ST + 'outdoors/{z}/{x}/{y}{r}.png?api_key={key}', o: { maxZoom: 20, attribution: ST_ATTR } },
    { id: 'st_terrain', group: GROUPS[6], key: 'stadia', name: 'Stamen Terrain', url: ST + 'stamen_terrain/{z}/{x}/{y}{r}.png?api_key={key}', o: { maxZoom: 18, attribution: ST_ATTR } },
    { id: 'st_toner', group: GROUPS[6], key: 'stadia', name: 'Stamen Toner', url: ST + 'stamen_toner/{z}/{x}/{y}{r}.png?api_key={key}', o: { maxZoom: 20, attribution: ST_ATTR } },
    { id: 'st_watercolor', group: GROUPS[6], key: 'stadia', name: 'Stamen Watercolor', url: ST + 'stamen_watercolor/{z}/{x}/{y}.jpg?api_key={key}', o: { maxZoom: 16, attribution: ST_ATTR } },

    { id: 'mb_satellite', group: GROUPS[7], key: 'mapbox', name: 'Satellite', url: MB + 'satellite-v9/tiles/256/{z}/{x}/{y}?access_token={key}', o: { maxZoom: 22, attribution: MB_ATTR } },
    { id: 'mb_satstreets', group: GROUPS[7], key: 'mapbox', name: 'Satellite Streets', url: MB + 'satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token={key}', o: { maxZoom: 22, attribution: MB_ATTR } },
    { id: 'mb_streets', group: GROUPS[7], key: 'mapbox', name: 'Streets', url: MB + 'streets-v12/tiles/256/{z}/{x}/{y}?access_token={key}', o: { maxZoom: 22, attribution: MB_ATTR } },
    { id: 'mb_outdoors', group: GROUPS[7], key: 'mapbox', name: 'Outdoors', url: MB + 'outdoors-v12/tiles/256/{z}/{x}/{y}?access_token={key}', o: { maxZoom: 22, attribution: MB_ATTR } },

    { id: 'here_sat', group: GROUPS[8], key: 'here', name: 'Satellite', url: HR + 'jpeg?style=satellite.day&size=256&apiKey={key}', o: { maxZoom: 20, attribution: HR_ATTR } },
    { id: 'here_hybrid', group: GROUPS[8], key: 'here', name: 'Hybrid', url: HR + 'jpeg?style=explore.satellite.day&size=256&apiKey={key}', o: { maxZoom: 20, attribution: HR_ATTR } },
    { id: 'here_explore', group: GROUPS[8], key: 'here', name: 'Explore', url: HR + 'png?style=explore.day&size=256&apiKey={key}', o: { maxZoom: 20, attribution: HR_ATTR } },
    { id: 'here_topo', group: GROUPS[8], key: 'here', name: 'Topo', url: HR + 'png?style=topo.day&size=256&apiKey={key}', o: { maxZoom: 20, attribution: HR_ATTR } }
  ];

  /** Επικαλύψεις που χρησιμοποιούνται μόνο μέσα σε συνδυασμούς */
  const OVERLAYS = [
    { id: 'esri_labels', url: ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 19, attribution: ESRI_ATTR } },
    { id: 'esri_roads', url: ESRI + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', o: { maxZoom: 21, maxNativeZoom: 19, attribution: ESRI_ATTR } }
  ];

  const byId = Object.fromEntries(LIST.concat(OVERLAYS).map(d => [d.id, d]));

  function make(def) {
    const o = Object.assign({}, def.o);
    if (def.key) o.key = encodeURIComponent(GR.apikeys.get(def.key)); // το Leaflet αντικαθιστά το {key} στο URL
    if (def.wms) {
      if (o.crs === 'EPSG4326') o.crs = L.CRS.EPSG4326; // ο server του Κτηματολογίου εξυπηρετεί σε EPSG:4326
      return L.tileLayer.wms(def.url, o);
    }
    return L.tileLayer(def.url, o);
  }

  /** Το κλειδί API που λείπει (id παρόχου) ή null */
  function missingKey(id) {
    const def = byId[id];
    if (!def) return null;
    const ids = def.combo ? def.combo.map(c => byId[c]) : [def];
    const m = ids.find(d => d.key && !GR.apikeys.has(d.key));
    return m ? m.key : null;
  }

  /** Επιστρέφει τα στρώματα Leaflet ενός υποβάθρου (ένα ή περισσότερα για συνδυασμούς) */
  function build(id) {
    const def = byId[id];
    if (!def) return null;
    return def.combo ? def.combo.map(c => make(byId[c])) : [make(def)];
  }

  /** Προσαρμοσμένο υπόβαθρο: XYZ URL ή WMS */
  function custom(type, url, layers, name) {
    if (type === 'wms') return L.tileLayer.wms(url, { layers, format: 'image/png', transparent: true, version: '1.1.1', attribution: name || 'WMS', maxZoom: 22 });
    return L.tileLayer(url, { maxZoom: 22, attribution: name || '' });
  }

  GR.basemaps = { GROUPS, LIST, OVERLAYS, byId, make, build, custom, missingKey };
})(window.GR = window.GR || {});
