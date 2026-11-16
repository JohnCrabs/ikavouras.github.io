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
  const SCALE = GRID * 10;                           // κλίμακα 1 : 1000 — ο κάναβος τυπώνεται ανά 10 cm
  const PAPERS = [["A4", 210, 297], ["A3", 297, 420], ["A2", 420, 594], ["A1", 594, 841], ["A0", 841, 1189]];
  const paperFor = (w, h) => { const [a, b] = [Math.min(w, h), Math.max(w, h)];
    const p = PAPERS.find(([, x, y]) => a <= x && b <= y); return p ? p[0] : "μεγαλύτερο από A0"; };
  const N_DEF = 3, N_MIN = 2, N_MAX = 15;             // σταυρονήματα ανά πλευρά (προεπιλογή 3 × 3)
  const nCross = () => Math.max(N_MIN, Math.min(N_MAX, Math.round(S().geoN || N_DEF)));
  const TOL = [0.125, 0.25];                          // ανοχές θέσης (m): πλήρης / μισός βαθμός

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
    // έκταση: n × n σταυρονήματα ανά GRID m, με κέντρο την περιοχή μελέτης και μισό διάστημα περιθώριο
    const n = nCross();
    const cE = (Math.min(...cs.map(c => c.E)) + Math.max(...cs.map(c => c.E))) / 2;
    const cN = (Math.min(...cs.map(c => c.N)) + Math.max(...cs.map(c => c.N))) / 2;
    const fE = Math.round((cE - (n - 1) * GRID / 2) / GRID) * GRID, fN = Math.round((cN - (n - 1) * GRID / 2) / GRID) * GRID;
    const E0 = fE - GRID / 2, E1 = fE + (n - 1) * GRID + GRID / 2;
    const N0 = fN - GRID / 2, N1 = fN + (n - 1) * GRID + GRID / 2;
    // φύλλο σε κλίμακα 1:SCALE: ο χάρτης είναι n × 10 cm, τα περιθώρια σε mm
    const mapMM = n * GRID / SCALE * 1000;
    // μέγεθος pixel στο χαρτί p (mm): ≥ 0.15 mm (≈ 170 dpi), ώστε η εικόνα να μην ξεπερνά ~6000 pixel
    const p = Math.max(0.15, Math.ceil((mapMM + 100) / 6000 / 0.05) * 0.05);
    const pix = p * SCALE / 1000;                    // m εδάφους ανά pixel
    const mm = v => Math.round(v / p);
    const ML = mm(30), MR = mm(15), MT = mm(30), MB = mm(52);
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
    const pad = mm(10), minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
    L[2] = pad - minX; L[5] = pad - minY;
    const W = Math.ceil(Math.max(...pts.map(p => p[0])) - minX + 2 * pad), H = Math.ceil(Math.max(...pts.map(p => p[1])) - minY + 2 * pad);
    // αληθής μετασχηματισμός: εικόνα (x, y, γωνία pixel) → ΕΓΣΑ 87
    const T = compA(sheetToEN, invA(L));
    return { source, n, p, scale: SCALE, E0, E1, N0, N1, pix, sheet, sheetToEN, L, W, H, T, th, sx, sy, sh };
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
    const u = v => v / G.p;                            // mm χαρτιού → pixel
    const F = (sz, w = "") => `${w} ${u(sz).toFixed(1)}px Arial`;
    ctx.strokeStyle = "#000"; ctx.lineWidth = u(0.5); ctx.strokeRect(ML, MT, mapW, mapH);
    const toUV = (E, N) => [ML + (E - G.E0) / G.pix, MT + (G.N1 - N) / G.pix];
    // σταυρονήματα (ανά 10 cm στο χαρτί) και συντεταγμένες στο περιθώριο
    const arm = u(5);
    ctx.font = F(3.2, "600"); ctx.textBaseline = "middle";
    for (let E = Math.ceil(G.E0 / GRID) * GRID; E <= G.E1; E += GRID) {
      const [x] = toUV(E, G.N1);
      ctx.fillStyle = "#000"; ctx.textAlign = "center";
      ctx.fillText(E.toFixed(0), x, MT - u(5)); ctx.fillText(E.toFixed(0), x, MT + mapH + u(5));
      ctx.strokeStyle = "#000"; ctx.lineWidth = u(0.35);
      ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT - u(2)); ctx.moveTo(x, MT + mapH); ctx.lineTo(x, MT + mapH + u(2)); ctx.stroke();
      for (let N = Math.ceil(G.N0 / GRID) * GRID; N <= G.N1; N += GRID) {
        const [, y] = toUV(E, N);
        if (x < ML + u(1) || x > ML + mapW - u(1) || y < MT + u(1) || y > MT + mapH - u(1)) continue;
        for (const [w, c] of [[u(0.9), "#000"], [u(0.35), "#fff"]]) {
          ctx.strokeStyle = c; ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y); ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm); ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = "#000"; ctx.lineWidth = u(0.35);
    for (let N = Math.ceil(G.N0 / GRID) * GRID; N <= G.N1; N += GRID) {
      const [, y] = toUV(G.E0, N);
      ctx.fillStyle = "#000"; ctx.textAlign = "right"; ctx.fillText(N.toFixed(0), ML - u(3), y);
      ctx.textAlign = "left"; ctx.fillText(N.toFixed(0), ML + mapW + u(1.5), y);
      ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML - u(2), y); ctx.moveTo(ML + mapW, y); ctx.lineTo(ML + mapW + u(1), y); ctx.stroke();
    }
    // τίτλος και υπόμνημα
    ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    // κείμενο που αναδιπλώνεται στο πλάτος του χάρτη
    const wrap = (text, x, y, maxW, lh) => {
      let line = "", yy = y;
      for (const w of text.split(" ")) {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t;
      }
      if (line) ctx.fillText(line, x, yy);
      return yy;
    };
    const tw = mapW;
    ctx.font = F(6, "700");
    wrap(`ΑΠΟΣΠΑΣΜΑ ΟΡΘΟΦΩΤΟΧΑΡΤΗ — ΕΓΣΑ 87 — ΚΛΙΜΑΚΑ 1:${G.scale}`, ML, u(11), tw, u(7));
    ctx.font = F(3.3);
    wrap(`Φοιτητής: ${st.student.name || "—"} (ΑΜ ${st.student.am || "—"}) · CTopoSim · Σταυρονήματα ${G.n} × ${G.n} ανά ${GRID} m (10 cm στο χαρτί)`, ML, u(18), tw, u(4.2));
    // γραφική και αριθμητική κλίμακα
    const yb = MT + mapH + u(12), L100 = 100 / G.pix, seg = L100 / 5;
    ctx.lineWidth = u(0.3);
    for (let k = 0; k < 5; k++) { if (k % 2 === 0) ctx.fillRect(ML + k * seg, yb, seg, u(2)); }
    ctx.strokeRect(ML, yb, L100, u(2));
    ctx.font = F(3); ctx.textAlign = "center";
    for (let k = 0; k <= 5; k += 1) ctx.fillText(k === 5 ? "100 m" : String(k * 20), ML + k * seg, yb + u(6));
    ctx.textAlign = "left"; ctx.font = F(4.5, "700");
    ctx.fillText(`Κλίμακα 1:${G.scale}`, ML + L100 + u(12), yb + u(2.5));
    ctx.font = F(3);
    let y2 = wrap(src.attr, ML, yb + u(13), tw - u(20), u(4));
    y2 = wrap("Τα σταυρονήματα είναι σε συντεταγμένες ΕΓΣΑ 87 (E, N σε m). Η εικόνα δεν περιέχει γεωαναφορά.", ML, y2 + u(4.5), tw - u(20), u(4));
    wrap(`Σε εκτύπωση σε πραγματικό μέγεθος (100%) η κλίμακα είναι 1:${G.scale} και τα σταυρονήματα απέχουν 10 cm.`, ML, y2 + u(4.5), tw - u(20), u(4));
    // βορράς
    const nx = ML + mapW - u(7), ny = yb + u(3);
    ctx.beginPath(); ctx.moveTo(nx, ny - u(7)); ctx.lineTo(nx - u(2.6), ny + u(1)); ctx.lineTo(nx, ny - u(1)); ctx.lineTo(nx + u(2.6), ny + u(1)); ctx.closePath(); ctx.fill();
    ctx.font = F(4, "700"); ctx.textAlign = "center"; ctx.fillText("Β", nx, ny + u(6));
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

  /* ---------------- pixel του GeoTIFF και αντιστοίχιση σταυρονημάτων ---------------- */
  let gtLoading = null;
  function loadGeoTIFFLib() {
    if (window.GeoTIFF) return Promise.resolve(window.GeoTIFF);
    return gtLoading = gtLoading || new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js";
      sc.onload = () => window.GeoTIFF ? res(window.GeoTIFF) : rej(new Error("Δεν φορτώθηκε η βιβλιοθήκη ανάγνωσης GeoTIFF."));
      sc.onerror = () => { gtLoading = null; rej(new Error("Δεν φορτώθηκε η βιβλιοθήκη ανάγνωσης GeoTIFF (χρειάζεται σύνδεση στο διαδίκτυο).")); };
      document.head.append(sc);
    });
  }
  /** εικόνα GeoTIFF → γκρι τόνοι (Float32Array) */
  async function tiffGray(buf) {
    const GT = await loadGeoTIFFLib();
    const img = await (await GT.fromArrayBuffer(buf)).getImage();
    const w = img.getWidth(), h = img.getHeight(), spp = img.getSamplesPerPixel();
    const r = await img.readRasters({ samples: spp >= 3 ? [0, 1, 2] : [0] });
    const g = new Float32Array(w * h);
    if (r.length >= 3) for (let i = 0; i < g.length; i++) g[i] = (r[0][i] + r[1][i] + r[2][i]) / 3;
    else for (let i = 0; i < g.length; i++) g[i] = r[0][i];
    return { w, h, g };
  }
  function canvasGray(cv) {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, g = new Float32Array(cv.width * cv.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] + d[j + 1] + d[j + 2]) / 3;
    return { w: cv.width, h: cv.height, g };
  }
  /** διγραμμική παρεμβολή (x, y σε συντεταγμένες γωνίας pixel) */
  function bil(I, x, y) {
    const u = x - 0.5, v = y - 0.5, i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= I.w - 1 || j >= I.h - 1) return NaN;
    const a = u - i, b = v - j, o = j * I.w + i, g = I.g;
    return (g[o] * (1 - a) + g[o + 1] * a) * (1 - b) + (g[o + I.w] * (1 - a) + g[o + I.w + 1] * a) * b;
  }
  /**
   * Βρίσκει κάθε σταυρόνημα μέσα στην εικόνα του φοιτητή (που έχει ξαναδειγματοληπτηθεί).
   * Για κάθε σταυρόνημα φτιάχνεται από την αρχική εικόνα το «πρότυπο» που θα έπρεπε να υπάρχει εκεί
   * αν η γεωαναφορά ήταν τέλεια, και αναζητείται με κανονικοποιημένη συσχέτιση (NCC) μέσα σε ±8 m.
   * Η μετατόπιση που βρίσκεται είναι το σφάλμα της γεωαναφοράς σε εκείνο το σημείο.
   */
  async function matchCrosses(O, Sg, Mx, g, onProg) {
    const Q = compA(invA(g.T), Mx), Mi = invA(Mx), ps = Math.hypot(Mx[0], Mx[3]);
    const R = Math.max(12, Math.min(60, Math.round(6 / ps))), SR = Math.max(10, Math.min(120, Math.round(8 / ps)));
    const D = 2 * R + 1, [E0, N0, E1, N1] = g.bbox, out = [], list = [];
    for (let E = E0 + GRID / 2; E < E1; E += GRID) for (let N = N0 + GRID / 2; N < N1; N += GRID) list.push([E, N]);
    for (let c = 0; c < list.length; c++) {
      const [E, N] = list[c], [qx, qy] = applyA(Mi, E, N);
      const cx = Math.floor(qx), cy = Math.floor(qy);              // κέντρο στο κοντινότερο pixel της εικόνας του φοιτητή
      const tpl = new Float32Array(D * D); let bad = false;
      for (let j = -R; j <= R && !bad; j++) for (let i = -R; i <= R; i++) {
        const v = bil(O, ...applyA(Q, cx + i + 0.5, cy + j + 0.5));
        if (isNaN(v)) { bad = true; break; } tpl[(j + R) * D + i + R] = v;
      }
      const ncc = (sx, sy, st) => {
        let n = 0, sw = 0, sww = 0, swt = 0, stt = 0, s_t = 0;
        for (let j = -R; j <= R; j += st) {
          const row = cy + j + sy; if (row < 0 || row >= Sg.h) return -2;
          for (let i = -R; i <= R; i += st) {
            const col = cx + i + sx; if (col < 0 || col >= Sg.w) return -2;
            const w = Sg.g[row * Sg.w + col], t = tpl[(j + R) * D + i + R];
            n++; sw += w; sww += w * w; swt += w * t; s_t += t; stt += t * t;
          }
        }
        const cov = swt - sw * s_t / n, vw = sww - sw * sw / n, vt = stt - s_t * s_t / n;
        return vw > 1e-6 && vt > 1e-6 ? cov / Math.sqrt(vw * vt) : -2;
      };
      let best = -2, bx = 0, by = 0;
      if (!bad) {
        for (let sy = -SR; sy <= SR; sy += 2) for (let sx = -SR; sx <= SR; sx += 2) {        // αδρή αναζήτηση
          const v = ncc(sx, sy, 3); if (v > best) { best = v; bx = sx; by = sy; }
        }
        const cx0 = bx, cy0 = by; best = -2;
        for (let sy = cy0 - 3; sy <= cy0 + 3; sy++) for (let sx = cx0 - 3; sx <= cx0 + 3; sx++) {   // λεπτή
          const v = ncc(sx, sy, 1); if (v > best) { best = v; bx = sx; by = sy; }
        }
      }
      let rec = { E, N, ok: false, c: +best.toFixed(3) };
      if (best > 0.75) {
        const par = (a, b, c2) => { const d = a - 2 * b + c2; return d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c2) / d)) : 0; };
        const fx = bx + par(ncc(bx - 1, by, 1), best, ncc(bx + 1, by, 1));
        const fy = by + par(ncc(bx, by - 1, 1), best, ncc(bx, by + 1, 1));
        const [e0, n0] = applyA(Mx, cx + 0.5, cy + 0.5), [e1, n1] = applyA(Mx, cx + 0.5 + fx, cy + 0.5 + fy);
        rec = { E, N, ok: true, c: +best.toFixed(3), dE: +(e1 - e0).toFixed(3), dN: +(n1 - n0).toFixed(3) };
      }
      out.push(rec);
      if (onProg && c % 3 === 2) { onProg(c + 1, list.length); await new Promise(r => setTimeout(r, 0)); }
    }
    return out;
  }

  /* ---------------- βαθμολόγηση ---------------- */
  async function submit() {
    const st = S(), files = [...$("#p6-file").files];
    if (!st.geo) return toast("Δημιούργησε και κατέβασε πρώτα τον ορθοφωτοχάρτη.", "warn");
    if (!files.length) return toast("Επίλεξε αρχείο GeoTIFF ή world file.", "warn");
    if (!Grading.canSubmit("p6")) return;
    const g = st.geo, notes = [];
    let geo = null, name = files.map(f => f.name).join(" + "), tifBuf = null;
    const stat = $("#p6-sub-status");
    try {
      const tif = files.find(f => /\.tiff?$/i.test(f.name)), wf = files.find(f => /\.(pgw|pngw|wld|jgw|tfw|tifw)$/i.test(f.name));
      if (tif && !wf) { tifBuf = await tif.arrayBuffer(); geo = parseGeoTIFF(tifBuf); }
      else if (wf) {
        geo = parseWorld(await wf.text());
        geo.W = g.W; geo.H = g.H;
        if (tif) { const t = parseGeoTIFF(await tif.arrayBuffer(), true); geo.W = t.W; geo.H = t.H; }
      } else throw new Error("Αναγνωρίζονται αρχεία .tif/.tiff (GeoTIFF) ή world file (.pgw, .wld, .jgw, .tfw).");
    } catch (e) { return toast(e.message, "err", 8000); }
    const items = [];
    $("#p6-submit").disabled = true;
    try {
      // μετασχηματισμός pixel του αρχείου → ΕΓΣΑ 87 (σε άλλο σύστημα: τοπική αφινική προσέγγιση)
      let Mx = geo.M;
      if (geo.crs !== 2100) {
        const src = [], dst = [];
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
          const x = geo.W * i / 4, y = geo.H * j / 4; src.push([x, y]); dst.push(toEGSA(...applyA(geo.M, x, y), geo.crs));
        }
        Mx = fitAffine(src, dst);
      }
      const same = Math.abs(geo.W - g.W) <= 1 && Math.abs(geo.H - g.H) <= 1;
      const [E0, N0, E1, N1] = g.bbox;
      let errs;
      if (same) {
        // ίδια pixel με την αρχική εικόνα: το σφάλμα υπολογίζεται απευθείας σε κάθε σταυρόνημα
        const Ti = invA(g.T); errs = [];
        for (let E = E0 + GRID / 2; E < E1; E += GRID) for (let N = N0 + GRID / 2; N < N1; N += GRID) {
          const [sE, sN] = applyA(Mx, ...applyA(Ti, E, N));
          errs.push({ E, N, ok: true, dE: +(sE - E).toFixed(3), dN: +(sN - N).toFixed(3) });
        }
      } else {
        // GeoTIFF του QGIS (Βορράς προς τα πάνω): εντοπισμός κάθε σταυρονήματος μέσα στην εικόνα
        if (!lastCanvas || lastCanvas._key !== g.created) {
          stat.textContent = "Ανακατασκευή της αρχικής εικόνας για τον έλεγχο…";
          st.geoN = g.n || st.geoN;
          const r = await render(g.source, (d, n) => stat.textContent = `Ανακατασκευή της αρχικής εικόνας: πλακίδια ${d}/${n}…`);
          lastCanvas = r.canvas; lastCanvas._key = g.created;
        }
        stat.textContent = "Ανάγνωση του GeoTIFF…";
        const Sg = await tiffGray(tifBuf), O = canvasGray(lastCanvas);
        errs = await matchCrosses(O, Sg, Mx, g, (d, n) => stat.textContent = `Έλεγχος σταυρονημάτων ${d}/${n}…`);
      }
      const okE = errs.filter(e => e.ok), dist = e => e.ok ? Math.hypot(e.dE, e.dN) : Infinity;
      if (!okE.length) throw new Error("Δεν βρέθηκε κανένα σταυρόνημα κοντά στη θέση του (±8 m). Η γεωαναφορά απέχει πολύ από τη σωστή θέση ή το αρχείο δεν είναι η εικόνα σου.");
      const eMin = Math.min(...errs.map(e => e.E)), eMax = Math.max(...errs.map(e => e.E));
      const nMin = Math.min(...errs.map(e => e.N)), nMax = Math.max(...errs.map(e => e.N));
      [[eMin, nMax], [eMax, nMax], [eMax, nMin], [eMin, nMin]].forEach(([E, N]) => {
        const e = errs.find(q => q.E === E && q.N === N), d = dist(e);
        items.push({ group: "Θέση", label: `Σταυρόνημα ${E.toFixed(0)}, ${N.toFixed(0)} (απόκλιση m)`,
                     value: isFinite(d) ? d.toFixed(2) : "δεν βρέθηκε", status: isFinite(d) ? SIM.gradeItem(d, TOL[0], TOL[1]) : 0 });
      });
      const rms = Math.sqrt(okE.reduce((t, e) => t + e.dE * e.dE + e.dN * e.dN, 0) / okE.length);
      const mx = Math.max(...errs.map(dist));
      items.push({ group: "Θέση", label: `Μέση τετραγωνική απόκλιση σε ${okE.length} σταυρονήματα (m)`, value: rms.toFixed(2), status: SIM.gradeItem(rms, TOL[0], TOL[1]) });
      items.push({ group: "Θέση", label: "Μέγιστη απόκλιση σταυρονήματος (m)", value: isFinite(mx) ? mx.toFixed(2) : "> 8", status: isFinite(mx) ? SIM.gradeItem(mx, TOL[0], TOL[1]) : 0 });
      if (okE.length < errs.length) notes.push(`${errs.length - okE.length} από ${errs.length} σταυρονήματα δεν εντοπίστηκαν στην εικόνα σου (απέχουν πάνω από 8 m ή δεν είναι ορατά).`);
      items.push({ group: "Σύστημα αναφοράς", label: `Σύστημα αρχείου: EPSG:${geo.crs}`, value: geo.crs === 2100 ? "ΕΓΣΑ 87" : "άλλο",
                   status: geo.crs === 2100 ? 1 : 0.5 });
      if (geo.crs !== 2100) notes.push("Το αρχείο δεν είναι σε ΕΓΣΑ 87 (EPSG:2100)· μετατράπηκε για τη σύγκριση. Στη γεωαναφορά όρισε ως σύστημα προορισμού το EPSG:2100.");
      st.geo.lastErrs = errs; delete st.geo.lastStudent;
    } catch (e) { return toast(e.message, "err", 8000); }
    finally { stat.textContent = ""; $("#p6-submit").disabled = false; }
    Grading.commit("p6", { score: Grading.score(items, { "Θέση": 85, "Σύστημα αναφοράς": 15 }), items, file: name,
                           when: Date.now(), notes });
    App.refresh();
    toast(`Η υποβολή καταχωρήθηκε: ${st.results.p6.score.toFixed(1)} / 100`, "ok");
  }

  /** σύγκριση πάνω στον χάρτη: σωστά σταυρονήματα (+) και θέση τους στη γεωαναφορά του φοιτητή (●), σφάλματα μεγεθυμένα */
  let thumbImg = null, thumbSrc = null;
  function drawCompare() {
    const cv = $("#p6-cmp"), g = S().geo;
    if (!cv) return;
    const errs = g && g.lastErrs;
    cv.hidden = !errs;
    if (!errs) return;
    if (g.thumb && thumbSrc !== g.thumb) {                   // υπόβαθρο: σμίκρυνση της αρχικής εικόνας
      thumbSrc = g.thumb; thumbImg = new Image(); thumbImg.onload = () => drawCompare(); thumbImg.src = g.thumb;
    }
    const [E0, N0, E1, N1] = g.bbox, side = 12, top = 30, bot = 74;
    const W = cv.width = 560, k = (W - 2 * side) / (E1 - E0), H = cv.height = Math.round(top + (N1 - N0) * k + bot);
    const X = (E, N) => [side + (E - E0) * k, top + (N1 - N) * k];
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(side, top, W - 2 * side, (N1 - N0) * k); ctx.clip();
    ctx.fillStyle = "#d9d9d9"; ctx.fillRect(side, top, W - 2 * side, (N1 - N0) * k);
    if (thumbImg && thumbImg.complete && thumbImg.naturalWidth) {
      const Sx = [k, 0, side - E0 * k, 0, -k, top + N1 * k], ts = thumbImg.naturalWidth / g.W;
      const A = compA(Sx, compA(g.T, [1 / ts, 0, 0, 0, 1 / ts, 0]));
      ctx.setTransform(A[0], A[3], A[1], A[4], A[2], A[5]); ctx.drawImage(thumbImg, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(side, top, W - 2 * side, (N1 - N0) * k);
    }
    ctx.restore();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(side, top, W - 2 * side, (N1 - N0) * k);
    // μεγέθυνση: ο κύκλος της ανοχής μισού βαθμού ≈ 30% του διαστήματος των σταυρονημάτων
    const MAG = Math.max(10, Math.round(0.3 * GRID / TOL[1] / 10) * 10), r1 = TOL[0] * MAG * k, r2 = TOL[1] * MAG * k;
    const lab = errs.length <= 36;
    for (const e of errs) {
      const [x, y] = X(e.E, e.N);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(x, y, r2, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(x, y, r1, 0, 2 * Math.PI); ctx.stroke();
      for (const [w, c] of [[3.2, "#000"], [1.4, "#fff"]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
      }
      ctx.font = "700 12px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      if (!e.ok) { ctx.fillStyle = "#d73027"; ctx.fillText("δεν βρέθηκε", x + 8, y - 10); continue; }
      const d = Math.hypot(e.dE, e.dN), col = d <= TOL[0] ? "#1a9850" : d <= TOL[1] ? "#f39c12" : "#d73027";
      let vx = e.dE * MAG * k, vy = -e.dN * MAG * k; const L = Math.hypot(vx, vy), Lmax = r2 * 1.5;
      if (L > Lmax) { vx *= Lmax / L; vy *= Lmax / L; }
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + vx, y + vy); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + vx, y + vy); ctx.stroke();
      ctx.fillStyle = col; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x + vx, y + vy, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (lab) {
        const t = d.toFixed(2) + " m" + (L > Lmax ? " ›" : ""), tx = x + 9, ty = y + r2 + 9;
        ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.strokeText(t, x, ty);
        ctx.fillStyle = "#fff"; ctx.fillText(t, x, ty);
      }
    }
    // τίτλος και υπόμνημα
    const okE = errs.filter(e => e.ok), rms = okE.length ? Math.sqrt(okE.reduce((t, e) => t + e.dE * e.dE + e.dN * e.dN, 0) / okE.length) : NaN;
    ctx.fillStyle = "#222"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "600 13px system-ui";
    ctx.fillText(`Σωστή θέση σταυρονήματος (+) και θέση στη γεωαναφορά σου (●) · σφάλματα ×${MAG}`, side, 19);
    const yb = top + (N1 - N0) * k;
    ctx.font = "12px system-ui";
    ctx.fillText(`Κύκλοι ανοχής: ${TOL[0]} m συνεχής (πλήρης βαθμός) · ${TOL[1]} m διακεκομμένος (μισός).`, side, yb + 18);
    const leg = [["#1a9850", `≤ ${TOL[0]} m`], ["#f39c12", `≤ ${TOL[1]} m`], ["#d73027", `> ${TOL[1]} m`]];
    let lx = side;
    for (const [c, t] of leg) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 5, yb + 36, 5, 0, 2 * Math.PI); ctx.fill(); ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#222"; ctx.fillText(t, lx + 14, yb + 40); lx += 100;
    }
    ctx.fillText(`Μέση τετραγωνική απόκλιση ${isFinite(rms) ? rms.toFixed(2) : "—"} m σε ${okE.length} σταυρονήματα.`, side, yb + 60);
  }

  /* ---------------- UI ---------------- */
  async function generate() {
    const st = S();
    if (!st.area) return toast("Όρισε πρώτα περιοχή μελέτης στην καρτέλα 1.", "warn");
    if (!st.student.am) return toast("Συμπλήρωσε πρώτα τον ΑΜ σου (πάνω δεξιά): η εικόνα είναι προσωπική.", "warn");
    if (busy) return;
    const source = $("#p6-src").value;
    st.geoN = Math.max(N_MIN, Math.min(N_MAX, parseInt($("#p6-n").value, 10) || N_DEF));
    $("#p6-n").value = st.geoN;
    if (st.geo && (st.geo.source !== source || (st.geo.n || 0) !== st.geoN) && st.results.p6 &&
        !confirm("Η νέα πηγή ή το νέο πλήθος σταυρονημάτων δίνει διαφορετική εικόνα. Η επόμενη υποβολή θα συγκριθεί με τη νέα εικόνα. Συνέχεια;")) return;
    busy = true; $("#p6-gen").disabled = true;
    const stat = $("#p6-status");
    try {
      stat.textContent = "Λήψη πλακιδίων…";
      const r = await render(source, (d, n) => stat.textContent = `Λήψη πλακιδίων ${d}/${n}…`);
      lastCanvas = r.canvas;
      const G = r.G;
      const tc = document.createElement("canvas"), ts = Math.min(1, 900 / G.W);
      tc.width = Math.round(G.W * ts); tc.height = Math.round(G.H * ts);
      tc.getContext("2d").drawImage(r.canvas, 0, 0, tc.width, tc.height);
      st.geo = { source, n: G.n, p: G.p, scale: G.scale, W: G.W, H: G.H, T: G.T, pix: G.pix, z: r.z, created: new Date().toISOString(),
                 bbox: [G.E0, G.N0, G.E1, G.N1], thumb: tc.toDataURL("image/jpeg", 0.72) };
      lastCanvas._key = st.geo.created;
      Store.save();
      const pv = $("#p6-prev"), sc = Math.min(1, 520 / G.W);
      pv.width = Math.round(G.W * sc); pv.height = Math.round(G.H * sc);
      pv.getContext("2d").drawImage(r.canvas, 0, 0, pv.width, pv.height);
      pv.hidden = false; $("#p6-dl").disabled = false;
      const wc = G.W * G.p / 10, hc = G.H * G.p / 10;
      stat.innerHTML = `Έτοιμο: κλίμακα <b>1:${G.scale}</b>, φύλλο ≈ ${wc.toFixed(0)} × ${hc.toFixed(0)} cm (χαρτί ${paperFor(wc * 10, hc * 10)}), ` +
        `${G.W} × ${G.H} pixel, ${Math.round(25.4 / G.p)} dpi, ζουμ πλακιδίων ${r.z}` +
        (r.failed ? `, ${r.failed} πλακίδια δεν φορτώθηκαν` : "") + ". Κατέβασέ το ως PNG· τύπωσέ το σε πραγματικό μέγεθος (100%).";
      App.refresh();
    } catch (e) {
      stat.textContent = "Αποτυχία: " + e.message;
      toast(e.message, "err", 8000);
    } finally { busy = false; $("#p6-gen").disabled = false; }
  }

  /** προσθέτει στο PNG την ανάλυση εκτύπωσης (pHYs, pixel ανά μέτρο χαρτιού) */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function withDPI(buf, ppm) {
    const src = new Uint8Array(buf), ch = new Uint8Array(21), dv = new DataView(ch.buffer);
    dv.setUint32(0, 9); ch.set([0x70, 0x48, 0x59, 0x73], 4);          // "pHYs"
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); ch[16] = 1;           // μονάδα: μέτρο
    let c = 0xFFFFFFFF; for (let i = 4; i < 17; i++) c = CRC[(c ^ ch[i]) & 0xFF] ^ (c >>> 8);
    dv.setUint32(17, (c ^ 0xFFFFFFFF) >>> 0);
    const at = 8 + 25;                                                  // μετά το IHDR
    const out = new Uint8Array(src.length + 21);
    out.set(src.subarray(0, at)); out.set(ch, at); out.set(src.subarray(at), at + 21);
    return out;
  }
  function downloadPNG() {
    if (!lastCanvas) return toast("Δημιούργησε πρώτα την εικόνα.", "warn");
    const p = S().geo && S().geo.p;
    lastCanvas.toBlob(async b => {
      if (p) b = new Blob([withDPI(await b.arrayBuffer(), Math.round(1000 / p))], { type: "image/png" });
      download(Phase2.filename("orthofotoxartis", "png"), b);
    }, "image/png");
  }

  function render6() {
    const st = S(), has = !!st.area;
    $("#p6-locked").hidden = has; $("#p6-work").hidden = !has;
    if (!has) return;
    if (st.geo && !lastCanvas) $("#p6-status").textContent =
      `Έχεις ήδη δημιουργήσει εικόνα (${SOURCES[st.geo.source].label}). Πάτα «Δημιουργία» για να την ξαναφτιάξεις και να την κατεβάσεις· θα είναι ίδια.`;
    if (st.geo && !busy) $("#p6-src").value = st.geo.source;
    if (!busy) $("#p6-n").value = nCross();
    Grading.renderResult($("#p6-result"), st.results.p6, "p6");
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
