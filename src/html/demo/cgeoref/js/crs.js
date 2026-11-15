/* CGeoRef – Συστήματα αναφοράς (proj4js) */
(function (GR) {
  'use strict';

  const BUILTIN = [
    { code: 'EPSG:2100', name: 'ΕΓΣΑ87 / Greek Grid', units: 'm',
      def: '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=-199.87,74.79,246.62,0,0,0,0 +units=m +no_defs' },
    { code: 'EPSG:4326', name: 'WGS 84 (γεωγραφικές)', units: '°', def: '+proj=longlat +datum=WGS84 +no_defs' },
    { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator', units: 'm',
      def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
    { code: 'EPSG:4121', name: 'ΕΓΣΑ87 (γεωγραφικές)', units: '°',
      def: '+proj=longlat +ellps=GRS80 +towgs84=-199.87,74.79,246.62,0,0,0,0 +no_defs' },
    { code: 'EPSG:32634', name: 'WGS 84 / UTM 34N', units: 'm', def: '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs' },
    { code: 'EPSG:32635', name: 'WGS 84 / UTM 35N', units: 'm', def: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs' },
    { code: 'EPSG:25834', name: 'ETRS89 / UTM 34N', units: 'm', def: '+proj=utm +zone=34 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
    { code: 'EPSG:25835', name: 'ETRS89 / UTM 35N', units: 'm', def: '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
    { code: 'EPSG:4258', name: 'ETRS89 (γεωγραφικές)', units: '°', def: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs' },
    { code: 'EPSG:3035', name: 'ETRS89 / LAEA Europe', units: 'm',
      def: '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
    { code: 'EPSG:4815', name: 'Athens (Παλαιό Ελληνικό Datum, γεωγρ.)', units: '°',
      def: '+proj=longlat +ellps=bessel +towgs84=456.387,372.620,496.818,0,0,0,0 +pm=athens +no_defs' }
  ];

  // Esri WKT για .prj (εκτός σύνδεσης) – τα υπόλοιπα ανακτώνται από spatialreference.org
  const WKT = {
    'EPSG:2100': 'PROJCS["GGRS_1987_Greek_Grid",GEOGCS["GCS_GGRS_1987",DATUM["D_GGRS_1987",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",24.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
    'EPSG:4326': 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
    'EPSG:3857': 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]'
  };

  const registry = new Map();
  BUILTIN.forEach(c => { proj4.defs(c.code, c.def); registry.set(c.code, c); });

  function isGeographic(code) {
    const d = proj4.defs(code);
    return d && (d.projName === 'longlat');
  }
  function get(code) { return registry.get(code); }
  function list() { return Array.from(registry.values()); }

  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.text()).trim();
  }

  /** Προσθήκη CRS από κωδικό EPSG (online) ή από proj4 string */
  async function add(codeOrDef, name) {
    let code, def;
    if (/^\s*\+/.test(codeOrDef)) {
      code = 'USER:' + (registry.size + 1);
      def = codeOrDef.trim();
    } else {
      const num = String(codeOrDef).replace(/\D/g, '');
      if (!num) throw new Error('Μη έγκυρος κωδικός EPSG');
      code = 'EPSG:' + num;
      if (registry.has(code)) return registry.get(code);
      try { def = await fetchText(`https://spatialreference.org/ref/epsg/${num}/proj4.txt`); }
      catch (e) { def = await fetchText(`https://epsg.io/${num}.proj4`); }
      if (!name) {
        try {
          const j = JSON.parse(await fetchText(`https://spatialreference.org/ref/epsg/${num}/projjson.json`));
          name = j.name;
        } catch (e) { /* χωρίς όνομα */ }
      }
    }
    proj4.defs(code, def);
    const d = proj4.defs(code);
    if (!d) throw new Error('Αδύνατη ανάλυση ορισμού CRS');
    const entry = { code, name: name || code, def, units: d.projName === 'longlat' ? '°' : (d.units || 'm') };
    registry.set(code, entry);
    return entry;
  }

  async function wkt(code) {
    if (WKT[code]) return WKT[code];
    const num = code.startsWith('EPSG:') ? code.slice(5) : null;
    if (num) {
      try { const t = await fetchText(`https://spatialreference.org/ref/epsg/${num}/esriwkt.txt`); WKT[code] = t; return t; }
      catch (e) { /* συνέχεια */ }
    }
    return null;
  }

  function transform(from, to, p) {
    if (from === to) return p.slice();
    return proj4(from, to, p);
  }
  const toLatLng = (code, p) => { const q = transform(code, 'EPSG:4326', p); return [q[1], q[0]]; };
  const fromLatLng = (code, ll) => transform('EPSG:4326', code, [ll.lng, ll.lat]);

  /** Αριθμητικός κωδικός EPSG (για GeoTIFF GeoKeys) */
  function epsgNumber(code) { return code.startsWith('EPSG:') ? parseInt(code.slice(5), 10) : null; }

  GR.crs = { list, get, add, wkt, transform, toLatLng, fromLatLng, isGeographic, epsgNumber };
})(window.GR = window.GR || {});
