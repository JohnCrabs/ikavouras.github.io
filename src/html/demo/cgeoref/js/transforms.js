/* CGeoRef – Μετασχηματισμοί γεωαναφοράς
 * Συντεταγμένες εικόνας: pixel, (0,0) η πάνω-αριστερή γωνία, y προς τα κάτω.
 * Εσωτερικά χρησιμοποιείται y προς τα πάνω (x, -y), όπως στο QGIS, ώστε οι μετασχηματισμοί
 * ομοιότητας (Helmert) να μην απαιτούν κατοπτρισμό.
 */
(function (GR) {
  'use strict';
  const { lstsq, solve, inv3 } = GR.linalg;

  // ---------- Κανονικοποίηση (κεντροθέτηση + κλίμακα) για αριθμητική ευστάθεια ----------
  function makeNorm(pts) {
    const n = pts.length;
    let mx = 0, my = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; }
    mx /= n; my /= n;
    let s = 0;
    for (const p of pts) s += (p[0] - mx) ** 2 + (p[1] - my) ** 2;
    s = Math.sqrt(s / n) || 1;
    return {
      mx, my, s,
      f: (p) => [(p[0] - mx) / s, (p[1] - my) / s],
      b: (p) => [p[0] * s + mx, p[1] * s + my]
    };
  }
  const flip = (p) => [p[0], -p[1]];

  // ---------- Βοηθητικά ----------
  function polyTerms(order) {
    const t = [];
    for (let d = 0; d <= order; d++) for (let j = 0; j <= d; j++) t.push([d - j, j]);
    return t; // [i,j] -> x^i y^j
  }
  function evalTerms(terms, x, y) {
    const r = new Array(terms.length);
    for (let k = 0; k < terms.length; k++) r[k] = Math.pow(x, terms[k][0]) * Math.pow(y, terms[k][1]);
    return r;
  }

  // ---------- Μοντέλα πίνακα 3x3 (Linear, Helmert, Affine, Projective) ----------
  function matrixModel(H, nS, nD) {
    const Hi = inv3(H);
    const app = (M, p) => {
      const w = M[6] * p[0] + M[7] * p[1] + M[8];
      return [(M[0] * p[0] + M[1] * p[1] + M[2]) / w, (M[3] * p[0] + M[4] * p[1] + M[5]) / w];
    };
    return {
      forward: (px) => nD.b(app(H, nS.f(flip(px)))),
      inverse: (q) => flip(nS.b(app(Hi, nD.f(q))))
    };
  }

  function fitLinear(src, dst) {
    const nS = makeNorm(src.map(flip)), nD = makeNorm(dst);
    const S = src.map(p => nS.f(flip(p))), D = dst.map(p => nD.f(p));
    // X = a x + c ; Y = b y + d
    const rx = lstsq(S.map(p => [p[0], 1]), D.map(p => [p[0]])).X;
    const ry = lstsq(S.map(p => [p[1], 1]), D.map(p => [p[1]])).X;
    return matrixModel([rx[0][0], 0, rx[1][0], 0, ry[0][0], ry[1][0], 0, 0, 1], nS, nD);
  }

  function fitHelmert(src, dst) {
    const nS = makeNorm(src.map(flip)), nD = makeNorm(dst);
    const S = src.map(p => nS.f(flip(p))), D = dst.map(p => nD.f(p));
    const A = [], B = [];
    S.forEach((p, i) => {
      A.push([p[0], -p[1], 1, 0]); B.push([D[i][0]]);
      A.push([p[1], p[0], 0, 1]); B.push([D[i][1]]);
    });
    const x = lstsq(A, B).X.map(r => r[0]);
    return matrixModel([x[0], -x[1], x[2], x[1], x[0], x[3], 0, 0, 1], nS, nD);
  }

  function fitAffine(src, dst) {
    const nS = makeNorm(src.map(flip)), nD = makeNorm(dst);
    const S = src.map(p => nS.f(flip(p))), D = dst.map(p => nD.f(p));
    const X = lstsq(S.map(p => [p[0], p[1], 1]), D).X;
    return matrixModel([X[0][0], X[1][0], X[2][0], X[0][1], X[1][1], X[2][1], 0, 0, 1], nS, nD);
  }

  function fitProjective(src, dst) {
    const nS = makeNorm(src.map(flip)), nD = makeNorm(dst);
    const S = src.map(p => nS.f(flip(p))), D = dst.map(p => nD.f(p));
    // Αλγεβρική λύση (DLT)
    const A = [], B = [];
    S.forEach((p, i) => {
      const [x, y] = p, [X, Y] = D[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push([X]);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push([Y]);
    });
    let h = lstsq(A, B).X.map(r => r[0]);
    // Βελτίωση Gauss–Newton (γεωμετρικό σφάλμα)
    for (let it = 0; it < 10; it++) {
      const J = [], r = [];
      S.forEach((p, i) => {
        const [x, y] = p;
        const w = h[6] * x + h[7] * y + 1;
        const u = h[0] * x + h[1] * y + h[2], v = h[3] * x + h[4] * y + h[5];
        const X = u / w, Y = v / w;
        J.push([x / w, y / w, 1 / w, 0, 0, 0, -x * X / w, -y * X / w]); r.push([D[i][0] - X]);
        J.push([0, 0, 0, x / w, y / w, 1 / w, -x * Y / w, -y * Y / w]); r.push([D[i][1] - Y]);
      });
      let dh;
      try { dh = lstsq(J, r).X.map(q => q[0]); } catch (e) { break; }
      let m = 0;
      for (let k = 0; k < 8; k++) { h[k] += dh[k]; m = Math.max(m, Math.abs(dh[k])); }
      if (m < 1e-12) break;
    }
    return matrixModel([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1], nS, nD);
  }

  // ---------- Πολυωνυμικοί ----------
  function fitPolyDir(P, Q, order) {
    const nP = makeNorm(P), nQ = makeNorm(Q);
    const terms = polyTerms(order);
    const A = P.map(p => { const q = nP.f(p); return evalTerms(terms, q[0], q[1]); });
    const C = lstsq(A, Q.map(q => nQ.f(q))).X;
    return (p) => {
      const q = nP.f(p), t = evalTerms(terms, q[0], q[1]);
      let X = 0, Y = 0;
      for (let k = 0; k < t.length; k++) { X += C[k][0] * t[k]; Y += C[k][1] * t[k]; }
      return nQ.b([X, Y]);
    };
  }
  function fitPoly(order) {
    return (src, dst) => {
      const S = src.map(flip);
      const fw = fitPolyDir(S, dst, order), iv = fitPolyDir(dst, S, order);
      return { forward: (px) => fw(flip(px)), inverse: (q) => flip(iv(q)) };
    };
  }

  // ---------- Radial Basis Functions (TPS, Multiquadric) ----------
  function fitRBFDir(P, Q, kernel, lambda) {
    const nP = makeNorm(P), nQ = makeNorm(Q);
    const Pn = P.map(nP.f), Qn = Q.map(nQ.f);
    const n = Pn.length;
    let phi;
    if (kernel === 'tps') {
      phi = (r2) => (r2 <= 0 ? 0 : 0.5 * r2 * Math.log(r2));
    } else { // multiquadric, c = μέση απόσταση πλησιέστερου γείτονα
      let c = 0;
      for (let i = 0; i < n; i++) {
        let m = Infinity;
        for (let j = 0; j < n; j++) if (i !== j) m = Math.min(m, (Pn[i][0] - Pn[j][0]) ** 2 + (Pn[i][1] - Pn[j][1]) ** 2);
        c += Math.sqrt(m);
      }
      c = (c / n) || 1;
      const c2 = c * c;
      phi = (r2) => Math.sqrt(r2 + c2);
    }
    const N = n + 3;
    const A = [], B = [];
    for (let i = 0; i < N; i++) { A.push(new Array(N).fill(0)); B.push([0, 0]); }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const r2 = (Pn[i][0] - Pn[j][0]) ** 2 + (Pn[i][1] - Pn[j][1]) ** 2;
        A[i][j] = phi(r2) + (i === j ? lambda : 0);
      }
      A[i][n] = 1; A[i][n + 1] = Pn[i][0]; A[i][n + 2] = Pn[i][1];
      A[n][i] = 1; A[n + 1][i] = Pn[i][0]; A[n + 2][i] = Pn[i][1];
      B[i] = [Qn[i][0], Qn[i][1]];
    }
    const W = solve(A, B);
    return (p) => {
      const q = nP.f(p);
      let X = W[n][0] + W[n + 1][0] * q[0] + W[n + 2][0] * q[1];
      let Y = W[n][1] + W[n + 1][1] * q[0] + W[n + 2][1] * q[1];
      for (let i = 0; i < n; i++) {
        const v = phi((q[0] - Pn[i][0]) ** 2 + (q[1] - Pn[i][1]) ** 2);
        X += W[i][0] * v; Y += W[i][1] * v;
      }
      return nQ.b([X, Y]);
    };
  }
  function fitRBF(kernel) {
    return (src, dst, opts) => {
      const lambda = (opts && opts.lambda) || 0;
      const S = src.map(flip);
      const fw = fitRBFDir(S, dst, kernel, lambda), iv = fitRBFDir(dst, S, kernel, lambda);
      return { forward: (px) => fw(flip(px)), inverse: (q) => flip(iv(q)) };
    };
  }

  // ---------- Delaunay (Bowyer–Watson) ----------
  function delaunay(pts) {
    const n = pts.length;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    const d = Math.max(maxX - minX, maxY - minY) * 20 || 1;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const P = pts.concat([[cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]]);
    const circ = (a, b, c) => {
      const ax = P[a][0], ay = P[a][1], bx = P[b][0], by = P[b][1], qx = P[c][0], qy = P[c][1];
      const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
      if (Math.abs(D) < 1e-300) return { x: 0, y: 0, r2: Infinity };
      const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
      return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [{ v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2) }];
    for (let i = 0; i < n; i++) {
      const [px, py] = P[i];
      const bad = [], keep = [];
      for (const t of tris) ((px - t.c.x) ** 2 + (py - t.c.y) ** 2 < t.c.r2 * (1 + 1e-12) ? bad : keep).push(t);
      const edges = new Map();
      for (const t of bad) for (let k = 0; k < 3; k++) {
        const a = t.v[k], b = t.v[(k + 1) % 3];
        const key = a < b ? a + '_' + b : b + '_' + a;
        edges.set(key, edges.has(key) ? null : [a, b]);
      }
      for (const e of edges.values()) if (e) keep.push({ v: [e[0], e[1], i], c: circ(e[0], e[1], i) });
      tris = keep;
    }
    return tris.filter(t => t.v.every(k => k < n)).map(t => t.v);
  }

  function triAffine(a, b, c, A, B, C) {
    // affine που απεικονίζει τα a,b,c στα A,B,C
    const M = [[a[0], a[1], 1], [b[0], b[1], 1], [c[0], c[1], 1]];
    const X = solve(M, [[A[0], A[1]], [B[0], B[1]], [C[0], C[1]]]);
    return (p) => [X[0][0] * p[0] + X[1][0] * p[1] + X[2][0], X[0][1] * p[0] + X[1][1] * p[1] + X[2][1]];
  }
  function bary(p, a, b, c) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d;
    const l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d;
    return [l1, l2, 1 - l1 - l2];
  }
  function fitPiecewise(src, dst) {
    const S = src.map(flip);
    const nS = makeNorm(S);
    const tris = delaunay(S.map(nS.f));
    if (!tris.length) throw new Error('Αδύνατη τριγωνοποίηση – ελέγξτε τα σημεία');
    const T = tris.map(([i, j, k]) => {
      const cs = [(S[i][0] + S[j][0] + S[k][0]) / 3, (S[i][1] + S[j][1] + S[k][1]) / 3];
      const cd = [(dst[i][0] + dst[j][0] + dst[k][0]) / 3, (dst[i][1] + dst[j][1] + dst[k][1]) / 3];
      return {
        s: [S[i], S[j], S[k]], d: [dst[i], dst[j], dst[k]], cs, cd,
        f: triAffine(S[i], S[j], S[k], dst[i], dst[j], dst[k]),
        b: triAffine(dst[i], dst[j], dst[k], S[i], S[j], S[k])
      };
    });
    let lastF = 0, lastB = 0;
    const locate = (p, key, last) => {
      const t0 = T[last];
      const l0 = bary(p, t0[key][0], t0[key][1], t0[key][2]);
      if (l0[0] >= -1e-9 && l0[1] >= -1e-9 && l0[2] >= -1e-9) return last;
      let best = -1, bestScore = -Infinity;
      for (let i = 0; i < T.length; i++) {
        const l = bary(p, T[i][key][0], T[i][key][1], T[i][key][2]);
        const m = Math.min(l[0], l[1], l[2]);
        if (m >= -1e-9) return i;
        if (m > bestScore) { bestScore = m; best = i; }
      }
      return best; // εκτός κυρτού περιβλήματος: επέκταση του πλησιέστερου τριγώνου
    };
    return {
      forward: (px) => { const p = flip(px); lastF = locate(p, 's', lastF); return T[lastF].f(p); },
      inverse: (q) => { lastB = locate(q, 'd', lastB); return flip(T[lastB].b(q)); },
      triangles: tris
    };
  }

  // ---------- Κατάλογος μετασχηματισμών ----------
  const LIST = [
    { id: 'linear', name: 'Γραμμικός (κλίμακα + μετάθεση)', minPts: 2, params: 4, exact: false, fit: fitLinear,
      desc: '4 παράμετροι: ξεχωριστή κλίμακα σε X/Y και μετάθεση, χωρίς στροφή.' },
    { id: 'helmert', name: 'Helmert (ομοιότητας)', minPts: 2, params: 4, exact: false, fit: fitHelmert,
      desc: '4 παράμετροι: μετάθεση, στροφή, ενιαία κλίμακα. Διατηρεί σχήματα.' },
    { id: 'affine', name: 'Αφινικός (Πολυωνυμικός 1ου βαθμού)', minPts: 3, params: 6, exact: false, fit: fitAffine,
      desc: '6 παράμετροι: μετάθεση, στροφή, κλίμακα X/Y, διάτμηση.' },
    { id: 'projective', name: 'Προβολικός (Ομογραφία)', minPts: 4, params: 8, exact: false, fit: fitProjective,
      desc: '8 παράμετροι: κατάλληλος για πλάγιες λήψεις επίπεδων επιφανειών / σαρωμένους χάρτες με προοπτική.' },
    { id: 'poly2', name: 'Πολυωνυμικός 2ου βαθμού', minPts: 6, params: 12, exact: false, fit: fitPoly(2),
      desc: '12 παράμετροι: διορθώνει καμπυλότητες (π.χ. παραμόρφωση χαρτιού).' },
    { id: 'poly3', name: 'Πολυωνυμικός 3ου βαθμού', minPts: 10, params: 20, exact: false, fit: fitPoly(3),
      desc: '20 παράμετροι: πιο σύνθετες μη γραμμικές παραμορφώσεις.' },
    { id: 'poly4', name: 'Πολυωνυμικός 4ου βαθμού', minPts: 15, params: 30, exact: false, fit: fitPoly(4),
      desc: '30 παράμετροι: πολύ ευέλικτος – προσοχή σε ταλαντώσεις έξω από τα σημεία.' },
    { id: 'tps', name: 'Thin Plate Spline (TPS)', minPts: 3, params: null, exact: true, fit: fitRBF('tps'), smoothing: true,
      desc: 'Ελαστικός μετασχηματισμός (rubber sheeting). Περνά ακριβώς από τα σημεία (λ=0) ή εξομαλύνει (λ>0).' },
    { id: 'mq', name: 'RBF Multiquadric (Hardy)', minPts: 3, params: null, exact: true, fit: fitRBF('mq'), smoothing: true,
      desc: 'Συνάρτηση ακτινικής βάσης Hardy με γραμμικό όρο. Ομαλή τοπική προσαρμογή.' },
    { id: 'piecewise', name: 'Τμηματικά αφινικός (Delaunay)', minPts: 3, params: null, exact: true, fit: fitPiecewise,
      desc: 'Τριγωνοποίηση Delaunay και αφινικός ανά τρίγωνο. Τοπικός, ακριβής στα σημεία.' }
  ];
  const byId = Object.fromEntries(LIST.map(t => [t.id, t]));

  /**
   * Προσαρμογή μετασχηματισμού και υπολογισμός υπολοίπων.
   * gcps: [{src:[x,y], dst:[X,Y], enabled}]
   */
  function fit(typeId, gcps, opts) {
    const T = byId[typeId];
    const act = gcps.filter(g => g.enabled);
    if (act.length < T.minPts) return { ok: false, error: `Απαιτούνται τουλάχιστον ${T.minPts} ενεργά σημεία (υπάρχουν ${act.length})` };
    let model;
    try { model = T.fit(act.map(g => g.src), act.map(g => g.dst), opts); }
    catch (e) { return { ok: false, error: e.message }; }

    const res = gcps.map(g => {
      const f = model.forward(g.src);
      const b = model.inverse(g.dst);
      const dX = f[0] - g.dst[0], dY = f[1] - g.dst[1];
      const dx = b[0] - g.src[0], dy = b[1] - g.src[1];
      return { dX, dY, dMap: Math.hypot(dX, dY), dx, dy, dPx: Math.hypot(dx, dy) };
    });

    const n = act.length;
    let ssMap = 0, ssPx = 0, ssX = 0, ssY = 0, sumMap = 0, maxMap = 0, sumPx = 0;
    gcps.forEach((g, i) => {
      if (!g.enabled) return;
      const r = res[i];
      ssMap += r.dMap ** 2; ssPx += r.dPx ** 2; ssX += r.dX ** 2; ssY += r.dY ** 2;
      sumMap += r.dMap; sumPx += r.dPx; maxMap = Math.max(maxMap, r.dMap);
    });
    const u = T.params;
    const dof = u ? 2 * n - u : null;
    const stats = {
      n,
      rmseMap: Math.sqrt(ssMap / n), rmsePx: Math.sqrt(ssPx / n),
      rmseX: Math.sqrt(ssX / n), rmseY: Math.sqrt(ssY / n),
      meanMap: sumMap / n, meanPx: sumPx / n, maxMap,
      dof, sigma0: dof && dof > 0 ? Math.sqrt(ssMap / dof) : null
    };
    return { ok: true, model, res, stats, type: T };
  }

  /** Leave-one-out cross validation: σφάλμα πρόβλεψης κάθε σημείου όταν εξαιρείται από την επίλυση */
  function crossValidate(typeId, gcps, opts) {
    const T = byId[typeId];
    const idx = gcps.map((g, i) => (g.enabled ? i : -1)).filter(i => i >= 0);
    if (idx.length < T.minPts + 1) return null;
    const out = new Array(gcps.length).fill(null);
    let ss = 0, cnt = 0;
    for (const i of idx) {
      const sub = idx.filter(j => j !== i).map(j => gcps[j]);
      try {
        const m = T.fit(sub.map(g => g.src), sub.map(g => g.dst), opts);
        const f = m.forward(gcps[i].src);
        const e = Math.hypot(f[0] - gcps[i].dst[0], f[1] - gcps[i].dst[1]);
        if (isFinite(e)) { out[i] = e; ss += e * e; cnt++; }
      } catch (e) { /* αγνόησε */ }
    }
    return cnt ? { perPoint: out, rmse: Math.sqrt(ss / cnt) } : null;
  }

  /** Τοπικά γεωμετρικά χαρακτηριστικά (Ιακωβιανή) σε σημείο εικόνας */
  function localGeometry(model, px) {
    const h = 0.5;
    const c = model.forward(px);
    const ex = model.forward([px[0] + h, px[1]]), ey = model.forward([px[0], px[1] + h]);
    const a = (ex[0] - c[0]) / h, d = (ex[1] - c[1]) / h; // ανά pixel στη στήλη
    const b = (ey[0] - c[0]) / h, e = (ey[1] - c[1]) / h; // ανά pixel στη γραμμή
    const sx = Math.hypot(a, d), sy = Math.hypot(b, e);
    const rot = Math.atan2(d, a) * 180 / Math.PI;
    // χωρίς διάτμηση, το διάνυσμα γραμμής (y εικόνας προς τα κάτω) είναι στραμμένο κατά -90° ως προς της στήλης
    let shear = (Math.atan2(e, b) * 180 / Math.PI) - rot + 90;
    shear = ((shear + 180) % 360 + 360) % 360 - 180;
    return { A: a, D: d, B: b, E: e, sx, sy, rot, shear };
  }

  /** Παράμετροι world file (pixel κέντρου πάνω-αριστερά), ακριβείς για αφινικούς */
  function worldFile(model) {
    const o = model.forward([0.5, 0.5]), x1 = model.forward([1.5, 0.5]), y1 = model.forward([0.5, 1.5]);
    return { A: x1[0] - o[0], D: x1[1] - o[1], B: y1[0] - o[0], E: y1[1] - o[1], C: o[0], F: o[1] };
  }

  GR.transforms = { LIST, byId, fit, crossValidate, localGeometry, worldFile, delaunay };
})(window.GR = window.GR || {});
