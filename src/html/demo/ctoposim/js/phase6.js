/* =========================================================================
   CTopoSim — Φάση 6: Γεωαναφορά ορθοφωτοχάρτη
   Δημιουργεί για την περιοχή μελέτης ένα «απόσπασμα ορθοφωτοχάρτη» (PNG χωρίς
   γεωαναφορά) με σταυρονήματα ΕΓΣΑ 87, από Esri World Imagery ή από το υπόβαθρο
   2015-2016 του Ελληνικού Κτηματολογίου, με παραμόρφωση ανά φοιτητή.
   Ο φοιτητής το γεωαναφέρει (αφινικός μετασχηματισμός) και ανεβάζει GeoTIFF
   ή world file. Βαθμολογείται η θέση του αποτελέσματος.
   ========================================================================= */
"use strict";

const Phase6 = (() => {
  const S = () => Store.s;
  const GRID = 100;                                  // σταυρονήματα ανά 100 m
  const TOL = [1, 5];                                // ανοχές θέσης (m): πλήρης / μισός βαθμός

  const SOURCES = {
    esri: {
      label: "Esri World Imagery (δορυφορική εικόνα)",
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      maxZ: 19,
      attr: "Πηγή εικόνας: Esri, Maxar, Earthstar Geographics και η κοινότητα χρηστών GIS",
    },
    kt: {
      label: "Ελληνικό Κτηματολόγιο — Υπόβαθρο 2015-2016",
      url: (z, x, y) => `https://tiles-eu1.arcgis.com/40tFGWzosjaLJpmn/arcgis/rest/services/Greece_Basemap_v2/MapServer/tile/${z}/${y}/${x}`,
      maxZ: 18,
      attr: "Πηγή δεδομένων: Ν.Π.Δ.Δ. ΕΛΛΗΝΙΚΟ ΚΤΗΜΑΤΟΛΟΓΙΟ (Υπόβαθρο 2015-2016)",
    },
  };

  let lastCanvas = null, busy = false;

  /* ---------------- βοηθητικά γεωμετρίας ---------------- */
  const TS = 256;
  const merc = (lat, lon, z) => {
    const n = TS * 2 ** z, s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  };
  const resAt = (lat, z) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** z;

  /** ελάχιστα τετράγωνα: (x,y) → (X,Y) αφινικός, επιστρέφει [a,b,c,d,e,f] με X = a x + b y + c, Y = d x + e y + f */
  function fitAffine(src, dst) {
    const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    src.forEach(([x, y], i) => {
      const r = [x, y, 1];
      for (let p = 0; p < 3; p++) { for (let q = 0; q < 3; q++) N[p][q] += r[p] * r[q]; bx[p] += r[p] * dst[i][0]; by[p] += r[p] * dst[i][1]; }
    });
    const solve = (A, b) => {                         // Gauss 3×3
      const M = A.map((r, i) => [...r, b[i]]);
      for (let c = 0; c < 3; c++) {
        let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
      }
      return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
    };
    return [...solve(N, bx), ...solve(N, by)];
  }
  const applyA = (A, x, y) => [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
  function invA(A) {
    const [a, b, c, d, e, f] = A, det = a * e - b * d;
    return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det];
  }
  /** σύνθεση: πρώτα B, μετά A */
  const compA = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
                           A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];

  /* ---------------- σχέδιο φύλλου και παραμόρφωση ---------------- */
  function layout(source) {
    const st = S(), a = st.area;
    const cs = [[a.south, a.west], [a.south, a.east], [a.north, a.west], [a.north, a.east]].map(([la, lo]) => GEO.toEGSA(la, lo));
    const E0 = Math.floor(Math.min(...cs.map(c => c.E)) / 10) * 10, E1 = Math.ceil(Math.max(...cs.map(c => c.E)) / 10) * 10;
    const N0 = Math.floor(Math.min(...cs.map(c => c.N)) / 10) * 10, N1 = Math.ceil(Math.max(...cs.map(c => c.N)) / 10) * 10;
    const pix = Math.max(0.5, Math.ceil(Math.max(E1 - E0, N1 - N0) / 3000 / 0.05) * 0.05);
    const ML = 120, MR = 50, MT = 130, MB = 120;
    const mapW = Math.round((E1 - E0) / pix), mapH = Math.round((N1 - N0) / pix);
    const sheet = { ML, MT, mapW, mapH, W: ML + mapW + MR, H: MT + mapH + MB };
    // φύλλο (u, v) → ΕΓΣΑ 87
    const sheetToEN = [pix, 0, E0 - ML * pix, 0, -pix, N1 + MT * pix];
    // παραμόρφωση «σάρωσης» ανά φοιτητή
    const rng = RNG.make(`geo|${st.student.am}|${JSON.stringify(a)}|${source}`);
    let th = 0, sx, sy, sh = 0;
    if (source === "kt") {                            // Κτηματολόγιο: μόνο παραμόρφωση κλίμακας, Βορράς προς τα πάνω
      sx = rng.uniform(0.9, 1.1); sy = sx * rng.uniform(0.97, 1.03);
    } else {
      th = rng.sign() * rng.uniform(3, 12) * Math.PI / 180;
      sx = rng.uniform(0.92, 1.08); sy = sx * rng.uniform(0.985, 1.015); sh = rng.uniform(-0.015, 0.015);
    }
    const c = Math.cos(th), s = Math.sin(th);
    const L = [c * sx, c * sh - s * sy, 0, s * sx, s * sh + c * sy, 0];      // R(θ)·[[sx, sh],[0, sy]]
    const pts = [[0, 0], [sheet.W, 0], [0, sheet.H], [sheet.W, sheet.H]].map(([u, v]) => applyA(L, u, v));
    const pad = 40, minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
    L[2] = pad - minX; L[5] = pad - minY;
    const W = Math.ceil(Math.max(...pts.map(p => p[0])) - minX + 2 * pad), H = Math.ceil(Math.max(...pts.map(p => p[1])) - minY + 2 * pad);
    // αληθής μετασχηματισμός: εικόνα (x, y, γωνία pixel) → ΕΓΣΑ 87
    const T = compA(sheetToEN, invA(L));
    return { source, E0, E1, N0, N1, pix, sheet, sheetToEN, L, W, H, T, th, sx, sy, sh };
  }

  /* ---------------- λήψη πλακιδίων ---------------- */
  function loadTile(url) {
    return new Promise(res => {
      const im = new Image(); im.crossOrigin = "anonymous";
      const to = setTimeout(() => { im.src = ""; res(null); }, 20000);
      im.onload = () => { clearTimeout(to); res(im); };
      im.onerror = () => { clearTimeout(to); res(null); };
      im.src = url;
    });
  }
  async function esriHasZoom(lat, lon, z) {
    try {
      const [x, y] = merc(lat, lon, z).map(v => Math.floor(v / TS));
      const r = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${y}/${x}/1/1`);
      const j = await r.json(); return j.data && j.data[0] === 1;
    } catch (e) { return true; }
  }

  async function render(source, onProgress) {
    const G = layout(source), src = SOURCES[source], a = S().area;
    const latC = (a.south + a.north) / 2, lonC = (a.west + a.east) / 2;
    let z = src.maxZ;
    while (z > 15 && resAt(latC, z - 1) <= G.pix) z--;
    if (source === "esri") while (z > 16 && !(await esriHasZoom(latC, lonC, z))) z--;
    // σημεία του χάρτη (περιοχή φύλλου) → pixel Mercator
    const { ML, MT, mapW, mapH } = G.sheet, grid = [], mp = [];
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
      const u = ML + mapW * i / 6, v = MT + mapH * j / 6, [E, N] = applyA(G.sheetToEN, u, v), w = GEO.toWGS(E, N);
      grid.push([u, v]); mp.push(merc(w.lat, w.lon, z));
    }
    let x0 = Math.min(...mp.map(p => p[0])), x1 = Math.max(...mp.map(p => p[0])), y0 = Math.min(...mp.map(p => p[1])), y1 = Math.max(...mp.map(p => p[1]));
    const tx0 = Math.floor(x0 / TS) - 1, tx1 = Math.floor(x1 / TS) + 1, ty0 = Math.floor(y0 / TS) - 1, ty1 = Math.floor(y1 / TS) + 1;
    const mos = document.createElement("canvas");
    mos.width = (tx1 - tx0 + 1) * TS; mos.height = (ty1 - ty0 + 1) * TS;
    if (mos.width * mos.height > 120e6) throw new Error("Η περιοχή είναι πολύ μεγάλη για την ανάλυση αυτή.");
    const mctx = mos.getContext("2d");
    mctx.fillStyle = "#cfcfcf"; mctx.fillRect(0, 0, mos.width, mos.height);
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
    let done = 0, failed = 0, k = 0;
    const worker = async () => {
      while (k < jobs.length) {
        const [tx, ty] = jobs[k++], im = await loadTile(src.url(z, tx, ty));
        if (im) mctx.drawImage(im, (tx - tx0) * TS, (ty - ty0) * TS); else failed++;
        done++; onProgress && onProgress(done, jobs.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (failed > jobs.length * 0.3) throw new Error(`Απέτυχε η λήψη ${failed} από ${jobs.length} πλακίδια. Δοκίμασε την άλλη πηγή ή ξαναδοκίμασε αργότερα.`);
    // φύλλο → μωσαϊκό (αφινική προσέγγιση, ελέγχεται το υπόλοιπο)
    const A = fitAffine(grid, mp.map(([X, Y]) => [X - tx0 * TS, Y - ty0 * TS]));
    const resid = Math.max(...grid.map(([u, v], i) => { const [X, Y] = applyA(A, u, v); return Math.hypot(X - (mp[i][0] - tx0 * TS), Y - (mp[i][1] - ty0 * TS)); }));
    // τελική εικόνα
    const cv = document.createElement("canvas"); cv.width = G.W; cv.height = G.H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#f4f2ec"; ctx.fillRect(0, 0, G.W, G.H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.setTransform(G.L[0], G.L[3], G.L[1], G.L[4], G.L[2], G.L[5]);       // φύλλο → εικόνα
    drawSheet(ctx, G, mos, invA(A), src);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return { canvas: cv, G, z, resid, failed, tiles: jobs.length };
  }

  /** σχεδίαση του φύλλου σε συντεταγμένες φύλλου */
  function drawSheet(ctx, G, mos, Ainv, src) {
    const { ML, MT, mapW, mapH, W, H } = G.sheet, st = S();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(ML, MT, mapW, mapH); ctx.clip();
    ctx.transform(Ainv[0], Ainv[3], Ainv[1], Ainv[4], Ainv[2], Ainv[5]);
    ctx.drawImage(mos, 0, 0);
    ctx.restore();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.strokeRect(ML, MT, mapW, mapH);
    const toUV = (E, N) => [ML + (E - G.E0) / G.pix, MT + (G.N1 - N) / G.pix];
    // σταυρονήματα
    const arm = 14;
    ctx.font = "600 15px Arial"; ctx.textBaseline = "middle";
    for (let E = Math.ceil(G.E0 / GRID) * GRID; E <= G.E1; E += GRID) {
      const [u] = toUV(E, G.N1);
      ctx.fillStyle = "#000"; ctx.textAlign = "center";
      ctx.fillText(E.toFixed(0), u, MT - 18); ctx.fillText(E.toFixed(0), u, MT + mapH + 20);
      ctx.beginPath(); ctx.moveTo(u, MT); ctx.lineTo(u, MT - 8); ctx.moveTo(u, MT + mapH); ctx.lineTo(u, MT + mapH + 8); ctx.stroke();
      for (let N = Math.ceil(G.N0 / GRID) * GRID; N <= G.N1; N += GRID) {
        const [, v] = toUV(E, N);
        if (u < ML + 4 || u > ML + mapW - 4 || v < MT + 4 || v > MT + mapH - 4) continue;
        for (const [w, c] of [[4, "#000"], [1.6, "#fff"]]) {
          ctx.strokeStyle = c; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(u - arm, v); ctx.lineTo(u + arm, v); ctx.moveTo(u, v - arm); ctx.lineTo(u, v + arm); ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
    for (let N = Math.ceil(G.N0 / GRID) * GRID; N <= G.N1; N += GRID) {
      const [, v] = toUV(G.E0, N);
      ctx.fillStyle = "#000"; ctx.textAlign = "right"; ctx.fillText(N.toFixed(0), ML - 12, v);
      ctx.textAlign = "left"; ctx.fillText(N.toFixed(0), ML + mapW + 6, v);
      ctx.beginPath(); ctx.moveTo(ML, v); ctx.lineTo(ML - 8, v); ctx.moveTo(ML + mapW, v); ctx.lineTo(ML + mapW + 4, v); ctx.stroke();
    }
    // τίτλος και υπόμνημα
    ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = "700 26px Arial"; ctx.fillText("ΑΠΟΣΠΑΣΜΑ ΟΡΘΟΦΩΤΟΧΑΡΤΗ — ΕΓΣΑ 87", ML, 42);
    ctx.font = "15px Arial";
    ctx.fillText(`Φοιτητής: ${st.student.name || "—"} (ΑΜ ${st.student.am || "—"}) · CTopoSim · Σταυρονήματα ανά ${GRID} m`, ML, 66);
    const yb = MT + mapH + 58;
    ctx.fillText(src.attr, ML, yb + 40);
    ctx.fillText("Τα σταυρονήματα είναι σε συντεταγμένες ΕΓΣΑ 87 (E, N σε m). Η εικόνα δεν περιέχει γεωαναφορά.", ML, yb + 62);
    // κλίμακα γραφική
    const L100 = 100 / G.pix;
    ctx.fillRect(ML, yb, L100 / 2, 8); ctx.strokeRect(ML, yb, L100, 8);
    ctx.font = "13px Arial"; ctx.textAlign = "center";
    ctx.fillText("0", ML, yb + 24); ctx.fillText("50", ML + L100 / 2, yb + 24); ctx.fillText("100 m", ML + L100, yb + 24);
    // βορράς
    const nx = ML + mapW - 30, ny = yb - 6;
    ctx.beginPath(); ctx.moveTo(nx, ny - 26); ctx.lineTo(nx - 10, ny + 4); ctx.lineTo(nx, ny - 4); ctx.lineTo(nx + 10, ny + 4); ctx.closePath(); ctx.fill();
    ctx.font = "700 16px Arial"; ctx.fillText("Β", nx, ny + 24);
  }

  /* ---------------- ανάγνωση αρχείων υποβολής ---------------- */
  function parseWorld(text) {
    const v = text.trim().split(/\s+/).map(s => parseFloat(s.replace(",", ".")));
    if (v.length < 6 || v.some(x => !isFinite(x))) throw new Error("Το world file πρέπει να έχει 6 αριθμούς (A, D, B, E, C, F).");
    const [A, D, B, E, C, F] = v;
    // κέντρα pixel → γωνίες pixel (x_γωνίας = στήλη + 0.5)
    return { M: [A, B, C - 0.5 * A - 0.5 * B, D, E, F - 0.5 * D - 0.5 * E], crs: guessCRS(C, F) };
  }
  const guessCRS = (X, Y) => Math.abs(X) <= 180 && Math.abs(Y) <= 90 ? 4326 : X > 1.5e6 ? 3857 : 2100;

  function parseGeoTIFF(buf, sizeOnly = false) {
    const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949;
    const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le), f64 = o => dv.getFloat64(o, le);
    const ver = u16(2);
    if (ver === 43) throw new Error("Το αρχείο είναι BigTIFF· εξήγαγε απλό GeoTIFF (ή ανέβασε world file).");
    if (ver !== 42) throw new Error("Δεν είναι έγκυρο αρχείο TIFF.");
    const ifd = u32(4), n = u16(ifd), tags = {};
    const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (SZ[type] || 1) * cnt;
      const off = sz <= 4 ? e + 8 : u32(e + 8), vals = [];
      for (let k = 0; k < Math.min(cnt, 4096); k++) {
        const o = off + k * (SZ[type] || 1);
        vals.push(type === 3 ? u16(o) : type === 4 ? u32(o) : type === 12 ? f64(o) : type === 11 ? dv.getFloat32(o, le) : dv.getUint8(o));
      }
      tags[tag] = vals;
    }
    const W = tags[256][0], H = tags[257][0];
    if (sizeOnly) return { W, H };
    let M;
    if (tags[34264]) { const m = tags[34264]; M = [m[0], m[1], m[3], m[4], m[5], m[7]]; }
    else if (tags[33550] && tags[33922]) {
      const [sx, sy] = tags[33550], [I, J, , X, Y] = tags[33922];
      M = [sx, 0, X - I * sx, 0, -sy, Y + J * sy];
    } else throw new Error("Το TIFF δεν έχει γεωαναφορά (λείπουν τα tags ModelTiepoint/PixelScale ή ModelTransformation).");
    const keys = {}, gk = tags[34735];
    if (gk) for (let i = 0; i < gk[3]; i++) { const b = 4 + i * 4; if (gk[b + 1] === 0) keys[gk[b]] = gk[b + 3]; }
    if (keys[1025] === 2) M = [M[0], M[1], M[2] - 0.5 * M[0] - 0.5 * M[1], M[3], M[4], M[5] - 0.5 * M[3] - 0.5 * M[4]];
    let crs = keys[3072] || (keys[1024] === 2 ? (keys[2048] || 4326) : null);
    if (crs === 900913 || crs === 3785) crs = 3857;
    if (!crs) crs = guessCRS(M[2], M[5]);
    return { W, H, M, crs };
  }

  /** συντεταγμένες αρχείου → ΕΓΣΑ 87 */
  function toEGSA(X, Y, crs) {
    if (crs === 2100) return [X, Y];
    if (crs === 4326 || crs === 4258 || crs === 4121) { const p = GEO.toEGSA(Y, X); return [p.E, p.N]; }
    if (crs === 3857) {
      const lon = X / 6378137 * 180 / Math.PI, lat = (2 * Math.atan(Math.exp(Y / 6378137)) - Math.PI / 2) * 180 / Math.PI;
      const p = GEO.toEGSA(lat, lon); return [p.E, p.N];
    }
    throw new Error(`Άγνωστο σύστημα αναφοράς (EPSG:${crs}). Χρησιμοποίησε ΕΓΣΑ 87 (EPSG:2100).`);
  }

  /* ---------------- βαθμολόγηση ---------------- */
  async function submit() {
    const st = S(), files = [...$("#p6-file").files];
    if (!st.geo) return toast("Δημιούργησε και κατέβασε πρώτα τον ορθοφωτοχάρτη.", "warn");
    if (!files.length) return toast("Επίλεξε αρχείο GeoTIFF ή world file.", "warn");
    const g = st.geo, notes = [];
    let geo = null, name = files.map(f => f.name).join(" + ");
    try {
      const tif = files.find(f => /\.tiff?$/i.test(f.name)), wf = files.find(f => /\.(pgw|pngw|wld|jgw|tfw|tifw)$/i.test(f.name));
      if (tif && !wf) geo = parseGeoTIFF(await tif.arrayBuffer());
      else if (wf) {
        geo = parseWorld(await wf.text());
        geo.W = g.W; geo.H = g.H;
        if (tif) { const t = parseGeoTIFF(await tif.arrayBuffer(), true); geo.W = t.W; geo.H = t.H; }
      } else throw new Error("Αναγνωρίζονται αρχεία .tif/.tiff (GeoTIFF) ή world file (.pgw, .wld, .jgw, .tfw).");
    } catch (e) { return toast(e.message, "err", 8000); }
    let items = [];
    try {
      const corners = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
      const tr = (M, x, y) => toEGSA(...applyA(M, x, y), geo.crs);
      const truthC = corners(g.W, g.H).map(([x, y]) => applyA(g.T, x, y));
      const same = Math.abs(geo.W - g.W) <= 1 && Math.abs(geo.H - g.H) <= 1;
      const studC = corners(geo.W, geo.H).map(([x, y]) => tr(geo.M, x, y));
      const lbl = ["πάνω αριστερά", "πάνω δεξιά", "κάτω δεξιά", "κάτω αριστερά"];
      if (same) {
        truthC.forEach((t, i) => { const d = Math.hypot(studC[i][0] - t[0], studC[i][1] - t[1]);
          items.push({ group: "Θέση", label: `Γωνία εικόνας ${lbl[i]} (απόκλιση m)`, value: d.toFixed(2), status: SIM.gradeItem(d, TOL[0], TOL[1]) }); });
        const tc = applyA(g.T, g.W / 2, g.H / 2), sc = tr(geo.M, geo.W / 2, geo.H / 2), d = Math.hypot(sc[0] - tc[0], sc[1] - tc[1]);
        items.push({ group: "Θέση", label: "Κέντρο εικόνας (απόκλιση m)", value: d.toFixed(2), status: SIM.gradeItem(d, TOL[0], TOL[1]) });
      } else {
        // GeoTIFF που ξαναδειγματοληπτήθηκε (warp): σύγκριση της έκτασης
        notes.push("Η εικόνα σου έχει ξαναδειγματοληπτηθεί (άλλο μέγεθος από το αρχικό), οπότε συγκρίνεται η έκταση (bounding box) με τη σωστή.");
        const bb = P => [Math.min(...P.map(p => p[0])), Math.max(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[1]))];
        const tb = bb(truthC), sb = bb(studC), nm = ["E ελάχιστο", "E μέγιστο", "N ελάχιστο", "N μέγιστο"];
        tb.forEach((t, i) => { const d = Math.abs(sb[i] - t);
          items.push({ group: "Θέση", label: `Όριο έκτασης ${nm[i]} (απόκλιση m)`, value: d.toFixed(2), status: SIM.gradeItem(d, TOL[0], TOL[1]) }); });
        const d = Math.hypot((sb[0] + sb[1] - tb[0] - tb[1]) / 2, (sb[2] + sb[3] - tb[2] - tb[3]) / 2);
        items.push({ group: "Θέση", label: "Κέντρο έκτασης (απόκλιση m)", value: d.toFixed(2), status: SIM.gradeItem(d, TOL[0], TOL[1]) });
      }
      items.push({ group: "Σύστημα αναφοράς", label: `Σύστημα αρχείου: EPSG:${geo.crs}`, value: geo.crs === 2100 ? "ΕΓΣΑ 87" : "άλλο",
                   status: geo.crs === 2100 ? 1 : 0.5 });
      if (geo.crs !== 2100) notes.push("Το αρχείο δεν είναι σε ΕΓΣΑ 87 (EPSG:2100)· μετατράπηκε για τη σύγκριση. Στη γεωαναφορά όρισε ως σύστημα προορισμού το EPSG:2100.");
      st.geo.lastStudent = studC;
    } catch (e) { return toast(e.message, "err", 8000); }
    st.attempts.p6 = (st.attempts.p6 || 0) + 1;
    st.results.p6 = { score: Grading.score(items, { "Θέση": 85, "Σύστημα αναφοράς": 15 }), items, file: name,
                      when: Date.now(), attempt: st.attempts.p6, notes };
    Store.save(); App.refresh();
    toast(`Η υποβολή καταχωρήθηκε: ${st.results.p6.score.toFixed(1)} / 100`, "ok");
  }

  /** σύγκριση αποτυπώματος: σωστό (πράσινο) και του φοιτητή (κόκκινο) */
  function drawCompare() {
    const cv = $("#p6-cmp"), g = S().geo;
    if (!cv) return;
    cv.hidden = !(g && g.lastStudent);
    if (cv.hidden) return;
    const ctx = cv.getContext("2d"), W = cv.width = 460, H = cv.height = 340;
    const tru = [[0, 0], [g.W, 0], [g.W, g.H], [0, g.H]].map(([x, y]) => applyA(g.T, x, y)), stu = g.lastStudent;
    const all = [...tru, ...stu], mE = Math.min(...all.map(p => p[0])), xE = Math.max(...all.map(p => p[0]));
    const mN = Math.min(...all.map(p => p[1])), xN = Math.max(...all.map(p => p[1]));
    const k = Math.min((W - 40) / (xE - mE), (H - 60) / (xN - mN)), X = p => [20 + (p[0] - mE) * k, H - 40 - (p[1] - mN) * k];
    ctx.clearRect(0, 0, W, H);
    const poly = (P, c, dash) => { ctx.setLineDash(dash); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath(); P.map(X).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.stroke(); };
    poly(tru, "#1a9850", []); poly(stu, "#d73027", [6, 4]); ctx.setLineDash([]);
    const dmax = Math.max(...tru.map((t, i) => stu[i] ? Math.hypot(stu[i][0] - t[0], stu[i][1] - t[1]) : 0));
    ctx.fillStyle = "#333"; ctx.font = "12px system-ui";
    ctx.fillText("— σωστή θέση   - - η γεωαναφορά σου", 20, H - 14);
    ctx.fillText(`Μέγιστη απόκλιση γωνίας ≈ ${dmax.toFixed(2)} m`, 20, 18);
  }

  /* ---------------- UI ---------------- */
  async function generate() {
    const st = S();
    if (!st.area) return toast("Όρισε πρώτα περιοχή μελέτης στην καρτέλα 1.", "warn");
    if (!st.student.am) return toast("Συμπλήρωσε πρώτα τον ΑΜ σου (πάνω δεξιά): η εικόνα είναι προσωπική.", "warn");
    if (busy) return;
    const source = $("#p6-src").value;
    if (st.geo && st.geo.source !== source && st.results.p6 &&
        !confirm("Η νέα πηγή δίνει διαφορετική εικόνα. Η επόμενη υποβολή θα συγκριθεί με τη νέα εικόνα. Συνέχεια;")) return;
    busy = true; $("#p6-gen").disabled = true;
    const stat = $("#p6-status");
    try {
      stat.textContent = "Λήψη πλακιδίων…";
      const r = await render(source, (d, n) => stat.textContent = `Λήψη πλακιδίων ${d}/${n}…`);
      lastCanvas = r.canvas;
      const G = r.G;
      st.geo = { source, W: G.W, H: G.H, T: G.T, pix: G.pix, z: r.z, created: new Date().toISOString(),
                 bbox: [G.E0, G.N0, G.E1, G.N1] };
      Store.save();
      const pv = $("#p6-prev"), sc = Math.min(1, 520 / G.W);
      pv.width = Math.round(G.W * sc); pv.height = Math.round(G.H * sc);
      pv.getContext("2d").drawImage(r.canvas, 0, 0, pv.width, pv.height);
      pv.hidden = false; $("#p6-dl").disabled = false;
      stat.innerHTML = `Έτοιμο: ${G.W} × ${G.H} pixel, ≈ ${(G.pix / ((G.sx + G.sy) / 2)).toFixed(2)} m/pixel, ζουμ πλακιδίων ${r.z}` +
        (r.failed ? `, ${r.failed} πλακίδια δεν φορτώθηκαν` : "") + ". Κατέβασέ το ως PNG.";
      App.refresh();
    } catch (e) {
      stat.textContent = "Αποτυχία: " + e.message;
      toast(e.message, "err", 8000);
    } finally { busy = false; $("#p6-gen").disabled = false; }
  }

  function downloadPNG() {
    if (!lastCanvas) return toast("Δημιούργησε πρώτα την εικόνα.", "warn");
    lastCanvas.toBlob(b => download(Phase2.filename("orthofotoxartis", "png"), b), "image/png");
  }

  function render6() {
    const st = S(), has = !!st.area;
    $("#p6-locked").hidden = has; $("#p6-work").hidden = !has;
    if (!has) return;
    if (st.geo && !lastCanvas) $("#p6-status").textContent =
      `Έχεις ήδη δημιουργήσει εικόνα (${SOURCES[st.geo.source].label}). Πάτα «Δημιουργία» για να την ξαναφτιάξεις και να την κατεβάσεις· θα είναι ίδια.`;
    if (st.geo && !busy) $("#p6-src").value = st.geo.source;
    Grading.renderResult($("#p6-result"), st.results.p6);
    drawCompare();
  }

  function init() {
    const sel = $("#p6-src");
    for (const [k, s] of Object.entries(SOURCES)) sel.append(h("option", { value: k }, s.label));
    $("#p6-gen").onclick = generate;
    $("#p6-dl").onclick = downloadPNG;
    $("#p6-submit").onclick = submit;
  }

  return { init, render: render6, layout, parseGeoTIFF, parseWorld, applyA, get canvas() { return lastCanvas; } };
})();
