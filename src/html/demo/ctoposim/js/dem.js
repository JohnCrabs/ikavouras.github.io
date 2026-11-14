/* =========================================================================
   CTopoSim — Πρόχειρο DEM (Terrarium tiles, όλη η Ελλάδα) + κτίρια OSM
   Επιφάνεια = έδαφος (DEM) + ύψος κτιρίου (αν το σημείο είναι μέσα σε κτίριο)
   ========================================================================= */
"use strict";

const DEM = (() => {
  const Z = 15;                            // μέγιστο ζουμ των Terrarium tiles (~4 m/pixel)
  const TILE_URL = (z, x, y) =>
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const OVERPASS = ["https://overpass-api.de/api/interpreter",
                    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
                    "https://overpass.private.coffee/api/interpreter",
                    "https://overpass.kumi.systems/api/interpreter"];
  const LEVEL_H = 3.2;                     // ύψος ορόφου (m)
  const DEFAULT_LEVELS = 3;                // όροφοι όταν το OSM δεν δίνει πληροφορία

  const tiles = new Map();                 // "z/x/y" -> Promise<Float32Array|null>
  const ready = new Map();                 // "z/x/y" -> Float32Array (μόνο τα φορτωμένα)
  let buildings = [];
  let grid = null;                         // χωρικό ευρετήριο κτιρίων

  /* ---------------- DEM ---------------- */
  function loadTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (tiles.has(key)) return tiles.get(key);
    const p = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, 256, 256).data;
        const h = new Float32Array(256 * 256);
        for (let i = 0; i < h.length; i++)
          h[i] = px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768;
        ready.set(key, h);
        resolve(h);
      };
      img.onerror = () => resolve(null);
      img.src = TILE_URL(z, x, y);
    });
    tiles.set(key, p);
    return p;
  }

  /** παγκόσμιες συντεταγμένες pixel (Web Mercator) σε ζουμ z */
  function globalPx(lat, lon, z) {
    const n = 256 * 2 ** z, r = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * n,
             y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n };
  }

  async function preload(bounds) {
    const a = globalPx(bounds.north, bounds.west, Z), b = globalPx(bounds.south, bounds.east, Z);
    const jobs = [];
    for (let x = Math.floor(a.x / 256) - 1; x <= Math.floor(b.x / 256) + 1; x++)
      for (let y = Math.floor(a.y / 256) - 1; y <= Math.floor(b.y / 256) + 1; y++)
        jobs.push(loadTile(Z, x, y));
    const res = await Promise.all(jobs);
    return res.filter(Boolean).length;
  }

  function pix(ix, iy) {
    const t = ready.get(`${Z}/${Math.floor(ix / 256)}/${Math.floor(iy / 256)}`);
    if (!t) return NaN;
    return t[(iy & 255) * 256 + (ix & 255)];
  }

  /** υψόμετρο εδάφους (m) με διγραμμική παρεμβολή */
  function terrainAt(lat, lon) {
    const g = globalPx(lat, lon, Z);
    const x = g.x - 0.5, y = g.y - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const h00 = pix(x0, y0), h10 = pix(x0 + 1, y0), h01 = pix(x0, y0 + 1), h11 = pix(x0 + 1, y0 + 1);
    return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  }

  /* ---------------- Κτίρια OSM ---------------- */
  function buildingHeight(tags) {
    const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : null; };
    if (tags.height && num(tags.height) != null) return { h: num(tags.height), src: "height" };
    if (tags["building:levels"] && num(tags["building:levels"]) != null) {
      const lv = num(tags["building:levels"]) + (num(tags["roof:levels"]) || 0);
      return { h: lv * LEVEL_H, src: "levels" };
    }
    return { h: DEFAULT_LEVELS * LEVEL_H, src: "default" };
  }

  const CACHE_KEY = "ctoposim.buildings";
  const areaKey = b => [b.south, b.west, b.north, b.east].map(v => v.toFixed(5)).join(",");

  /**
   * Φόρτωση κτιρίων: πρώτα από την τοπική αποθήκευση του browser (ίδια περιοχή),
   * αλλιώς από το Overpass API. Έτσι ένα reload δεν ξαναρωτά τον διακομιστή.
   */
  let reqId = 0;   // μόνο η πιο πρόσφατη αίτηση ορίζει τα κτίρια
  function clearBuildings() { reqId++; buildings = []; buildIndex({ south: 0, west: 0, north: 1e-6, east: 1e-6 }); }
  async function loadBuildings(bounds, { force = false, onRetry = null } = {}) {
    const key = areaKey(bounds), my = ++reqId;
    if (!force) {
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c && c.key === key && Array.isArray(c.list)) { setBuildings(c.list, bounds); return { n: buildings.length, cached: true }; }
      } catch (e) { /* αγνόησε */ }
    }
    const bb = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
    const q = `[out:json][timeout:40];(way["building"](${bb});` +
              `relation["building"]["type"="multipolygon"](${bb}););out geom;`;
    // ερώτηση σε όλους τους διακομιστές παράλληλα: κρατάμε την πρώτη επιτυχημένη απάντηση.
    // Οι διακομιστές συχνά είναι προσωρινά υπερφορτωμένοι (429/504): έως 3 γύροι με αναμονή.
    const round = async () => {
      const ctrls = OVERPASS.map(() => new AbortController());
      const timer = setTimeout(() => ctrls.forEach(c => c.abort()), 45000);
      try {
        return await Promise.any(OVERPASS.map(async (url, k) => {
          const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctrls[k].signal });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const j = await r.json();
          if (!j.elements) throw new Error("κενή απάντηση");
          return j;
        }));
      } finally { clearTimeout(timer); ctrls.forEach(c => c.abort()); }
    };
    let data = null;
    for (const wait of [0, 5000, 15000]) {
      if (wait) { onRetry && onRetry(wait / 1000); await new Promise(r => setTimeout(r, wait)); }
      if (my !== reqId) return { n: 0, cached: false, stale: true };
      try { data = await round(); break; } catch (e) { /* επόμενος γύρος */ }
    }
    if (!data) throw new Error("κανένας διακομιστής Overpass δεν απάντησε");
    const list = [];
    const r7 = v => Math.round(v * 1e7) / 1e7;
    for (const el of data.elements) {
      const tags = el.tags || {};
      const rings = [];
      if (el.type === "way" && el.geometry) rings.push(el.geometry.map(g => [r7(g.lat), r7(g.lon)]));
      if (el.type === "relation" && el.members)
        for (const m of el.members)
          if (m.role === "outer" && m.geometry) rings.push(m.geometry.map(g => [r7(g.lat), r7(g.lon)]));
      const { h, src } = buildingHeight(tags);
      for (const ring of rings) if (ring.length >= 4) list.push({ ring, h, src });
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, list })); } catch (e) { /* πολύ μεγάλο: χωρίς cache */ }
    if (my !== reqId) return { n: 0, cached: false, stale: true };
    setBuildings(list, bounds);
    return { n: buildings.length, cached: false };
  }

  function setBuildings(list, bounds) {
    buildings = list.map(({ ring, h, src }) => {
      let s = 90, w = 180, n = -90, e = -180;
      for (const [la, lo] of ring) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); }
      return { ring, bbox: { s, w, n, e }, h, src };
    });
    buildIndex(bounds);
  }

  function buildIndex(bounds) {
    const N = 64;
    const dLat = (bounds.north - bounds.south) / N || 1e-6, dLon = (bounds.east - bounds.west) / N || 1e-6;
    const cells = new Map();
    const ci = (la, lo) => [Math.floor((la - bounds.south) / dLat), Math.floor((lo - bounds.west) / dLon)];
    buildings.forEach((b, idx) => {
      const [r0, c0] = ci(b.bbox.s, b.bbox.w), [r1, c1] = ci(b.bbox.n, b.bbox.e);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const k = r * 100000 + c;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(idx);
      }
    });
    grid = { cells, ci };
  }

  function inRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i], [yj, xj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /** το ψηλότερο κτίριο που περιέχει το σημείο (ή null) */
  function buildingAt(lat, lon) {
    if (!grid) return null;
    const [r, c] = grid.ci(lat, lon);
    const list = grid.cells.get(r * 100000 + c);
    if (!list) return null;
    let best = null;
    for (const idx of list) {
      const b = buildings[idx];
      if (lat < b.bbox.s || lat > b.bbox.n || lon < b.bbox.w || lon > b.bbox.e) continue;
      if (inRing(lat, lon, b.ring) && (!best || b.h > best.h)) best = b;
    }
    return best;
  }

  /**
   * Πλησιέστερο σημείο περιγράμματος κτιρίου (ακμή ή γωνία) σε απόσταση έως maxD m.
   * Αν υπάρχει γωνία κτιρίου σε απόσταση έως 2 m, προτιμάται η γωνία.
   */
  function nearestEdge(lat, lon, maxD, only = null) {
    const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;
    const dLat = maxD / ky, dLon = maxD / kx;
    let best = null, corner = null;
    for (const b of (only ? [only] : buildings)) {
      if (!only && (lat < b.bbox.s - dLat || lat > b.bbox.n + dLat || lon < b.bbox.w - dLon || lon > b.bbox.e + dLon)) continue;
      const r = b.ring;
      for (let i = 0; i < r.length - 1; i++) {
        const ax = (r[i][1] - lon) * kx, ay = (r[i][0] - lat) * ky;
        const bx = (r[i + 1][1] - lon) * kx, by = (r[i + 1][0] - lat) * ky;
        const dv = Math.hypot(ax, ay);
        if (dv <= 2 && (!corner || dv < corner.d)) corner = { b, d: dv, lat: r[i][0], lon: r[i][1], corner: true };
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
        const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
        if (d <= maxD && (!best || d < best.d)) best = { b, d, lat: lat + py / ky, lon: lon + px / kx, corner: false };
      }
    }
    const res = corner || best;
    if (res) res.inside = inRing(lat, lon, res.b.ring);
    return res;
  }

  function surfaceAt(lat, lon) {
    const t = terrainAt(lat, lon), b = buildingAt(lat, lon);
    return { terrain: t, building: b, surface: t + (b ? b.h : 0) };
  }

  /**
   * Έλεγχος οπτικής επαφής από A (z = απόλυτο ύψος οργάνου) προς B (z = ύψος στόχου).
   * Αγνοούνται τα πρώτα/τελευταία `skip` m (το ίδιο το σημείο στάσης/στόχου).
   */
  function lineOfSight(A, B, { step = 1, skip = 2, terrainTol = 0.5 } = {}) {
    const ea = GEO.toEGSA(A.lat, A.lon), eb = GEO.toEGSA(B.lat, B.lon);
    const L = GEO.dist(ea, eb), n = Math.max(2, Math.ceil(L / step));
    const profile = [];
    let worst = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n, d = f * L;
      const lat = A.lat + (B.lat - A.lat) * f, lon = A.lon + (B.lon - A.lon) * f;
      const s = surfaceAt(lat, lon);
      const line = A.z + (B.z - A.z) * f;   // καμπυλότητα αμελητέα σε μικρές αποστάσεις
      profile.push({ d, terrain: s.terrain, surface: s.surface, line, bld: !!s.building });
      if (d < skip || d > L - skip) continue;
      const tol = s.building ? 0 : terrainTol;
      const excess = s.surface - line - tol;
      if (excess > 0 && (!worst || excess > worst.excess))
        worst = { d, excess, type: s.building ? "κτίριο" : "ανάγλυφο" };
    }
    return { visible: !worst, obstacle: worst, profile, L };
  }

  /* ---------------- Σκίαση αναγλύφου (DEM) ως layer ---------------- */
  function hypso(h) {                       // υψομετρική χρωματική κλίμακα
    const stops = [[0, [70, 130, 80]], [200, [150, 180, 100]], [500, [215, 200, 130]],
                   [1000, [190, 150, 100]], [1800, [160, 120, 100]], [2500, [245, 245, 245]]];
    if (h <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++)
      if (h <= stops[i][0]) {
        const [h0, c0] = stops[i - 1], [h1, c1] = stops[i], f = (h - h0) / (h1 - h0);
        return c0.map((v, k) => v + (c1[k] - v) * f);
      }
    return stops[stops.length - 1][1];
  }

  const HillshadeLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      loadTile(coords.z, coords.x, coords.y).then(h => {
        if (!h) return done(null, c);
        const ctx = c.getContext("2d"), img = ctx.createImageData(256, 256);
        const n = 2 ** coords.z;
        const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 0.5) / n))) * 180 / Math.PI;
        const res = 40075016.7 * Math.cos(latC * Math.PI / 180) / (256 * n);
        const at = (x, y) => h[Math.min(255, Math.max(0, y)) * 256 + Math.min(255, Math.max(0, x))];
        const az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, zf = 1.5;
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          const dzdx = ((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
                        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) / (8 * res);
          const dzdy = ((at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
                        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))) / (8 * res);
          const slope = Math.atan(zf * Math.hypot(dzdx, dzdy));
          const aspect = Math.atan2(dzdy, -dzdx);
          const zen = Math.PI / 2 - alt, azm = Math.PI / 2 - az;
          const sh = Math.max(0, Math.cos(zen) * Math.cos(slope) +
                     Math.sin(zen) * Math.sin(slope) * Math.cos(azm - aspect));
          const col = hypso(at(x, y)), i = 4 * (y * 256 + x);
          img.data[i] = col[0] * (0.35 + 0.75 * sh);
          img.data[i + 1] = col[1] * (0.35 + 0.75 * sh);
          img.data[i + 2] = col[2] * (0.35 + 0.75 * sh);
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        done(null, c);
      });
      return c;
    },
  });

  const getBuildings = () => buildings;
  const hasDEM = () => ready.size > 0;
  return { Z, preload, clearBuildings, terrainAt, loadBuildings, buildingAt, nearestEdge, surfaceAt, lineOfSight,
           getBuildings, hasDEM, HillshadeLayer, LEVEL_H, DEFAULT_LEVELS };
})();
