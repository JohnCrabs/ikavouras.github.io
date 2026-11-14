/* =========================================================================
   CTopoSim — Προσομοίωση μετρήσεων, αναγωγές, επίλυση όδευσης, ταχυμετρία
   Οι «αναμενόμενες» τιμές υπολογίζονται από τις ΣΤΡΟΓΓΥΛΕΜΕΝΕΣ μετρήσεις του
   εντύπου (όχι από τις πραγματικές), ακριβώς όπως θα τις υπολογίσει ο φοιτητής.
   ========================================================================= */
"use strict";

const SIM = (() => {
  const { mod, wrap, azimuth, dist, GR } = GEO;
  const r3 = x => Math.round(x * 1000) / 1000;
  const r4 = x => Math.round(x * 10000) / 10000;
  const r2 = x => Math.round(x * 100) / 100;

  /** πραγματικός συντελεστής αναγωγής μιας πλευράς (απόσταση ΕΓΣΑ = f · απόσταση εδάφους) */
  function scaleTrue(a, b, mode) {
    let f = 1;
    if (mode !== "none") f *= GEO.kLine(a, b);
    if (mode === "kH") f *= GEO.hFactor((a.H + b.H) / 2);
    return f;
  }
  /** ενιαίος συντελεστής που χρησιμοποιεί η επίλυση (Em, Hm από τα σημεία εκκίνησης/τερματισμού) */
  function scaleSolve(T2, T3, mode) {
    const Em = (T2.E + T3.E) / 2, Hm = (T2.H + T3.H) / 2;
    let f = 1;
    if (mode !== "none") f *= GEO.kPoint(Em);
    if (mode === "kH") f *= GEO.hFactor(Hm);
    return { f, Em, Hm, k: GEO.kPoint(Em), hf: GEO.hFactor(Hm) };
  }

  /**
   * Ύψος οργάνου (Υ.Ο.): συνήθως μέσα στο «σύνηθες» διάστημα (80%),
   * περιστασιακά οπουδήποτε μέσα στα όρια (20%). Στρογγύλευση στο mm.
   */
  function instrumentHeight(rng, S) {
    const [lo, hi] = S.iRange, [tl, th] = S.iTyp;
    const a = Math.max(lo, Math.min(tl, th)), b = Math.min(hi, Math.max(tl, th));
    const v = rng.next() < 0.8 && b > a ? rng.uniform(a, b) : rng.uniform(lo, hi);
    return r3(Math.max(lo, Math.min(hi, v)));
  }

  /* ---------------- Φάση 2: παραγωγή μετρήσεων υπαίθρου ---------------- */
  function generate(st) {
    const P = id => st.points[id], seq = st.seq, L = seq.length, S = st.settings;
    const rng = RNG.make(`${st.student.am}|${st.student.name}|${seq.map(id => {
      const p = P(id); return p.E.toFixed(2) + "," + p.N.toFixed(2); }).join(";")}|${st.seedSalt || 0}`);
    const inst = {
      c: rng.sign() * rng.uniform(5, 15) / 1e4,      // σφάλμα σκόπευσης (grad)
      eps: rng.sign() * rng.uniform(5, 20) / 1e4,    // σφάλμα δείκτη κατακόρυφου κύκλου (grad)
    };
    const setups = [];
    for (let j = 1; j <= L - 2; j++) {
      const A = P(seq[j]);
      const i = instrumentHeight(rng, S);
      const omega = rng.uniform(0, 400);               // τυχαίος προσανατολισμός οριζόντιου κύκλου
      const sights = [];
      for (const [role, k] of [["back", j - 1], ["fwd", j + 1]]) {
        const Q = P(seq[k]);
        const orient = (role === "back" && j === 1) || (role === "fwd" && j === L - 2);
        const sB = rng.uniform(S.sigB[0], S.sigB[1]) / 1e4;
        const sD = rng.uniform(S.sigD[0], S.sigD[1]) / 1000;
        const hz = mod(azimuth(A, Q) - omega, 400);
        const s = { role, target: seq[k], orient,
          HzI: r4(mod(hz + inst.c + rng.gauss(0, sB), 400)),
          HzII: r4(mod(hz + 200 - inst.c + rng.gauss(0, sB), 400)),
          t: null, VI: null, VII: null, SI: null, SII: null };
        if (!orient) {
          s.t = r3(S.tH);                                // σταθερό ύψος στόχου (Υ.Σ.)
          const Dh = dist(A, Q) / scaleTrue(A, Q, S.reduction);
          const dz = (Q.H + s.t) - (A.H + i) - GEO.curvRefr(Dh);
          const z = Math.atan2(Dh, dz) / GR, Sl = Math.hypot(Dh, dz);
          s.VI = r4(mod(z + inst.eps + rng.gauss(0, sB), 400));
          s.VII = r4(mod(400 - z + inst.eps + rng.gauss(0, sB), 400));
          s.SI = r3(Sl + rng.gauss(0, sD));
          s.SII = r3(Sl + rng.gauss(0, sD));
        }
        sights.push(s);
      }
      setups.push({ j, station: seq[j], i, sights });
    }
    return { created: new Date().toISOString(), inst, setups };
  }

  /* ---------------- Φάση 3: αναγωγή μετρήσεων ---------------- */
  function reduceSight(s, i) {
    const hII = mod(s.HzII - 200, 400);
    const r = mod(s.HzI + wrap(hII - s.HzI) / 2, 400);
    const out = { r, c2: wrap(s.HzI - hII) };
    if (s.VI != null) {
      out.z = (s.VI - s.VII + 400) / 2;
      out.eps = (s.VI + s.VII - 400) / 2;
      out.S = (s.SI + s.SII) / 2;
      out.D = out.S * Math.sin(out.z * GR);
      out.dh = out.S * Math.cos(out.z * GR) + i - s.t;
    }
    return out;
  }

  function expected(st) {
    const name = id => st.points[id].name;
    const ups = st.obs.setups;
    const red = ups.map(u => ({ back: reduceSight(u.sights[0], u.i), fwd: reduceSight(u.sights[1], u.i) }));
    const betas = ups.map((u, n) => ({
      back: u.sights[0].target, station: u.station, fwd: u.sights[1].target,
      label: name(u.sights[0].target) + name(u.station) + name(u.sights[1].target),
      value: r4(mod(red[n].fwd.r - red[n].back.r, 400)),
    }));
    const legs = [];
    for (let n = 0; n < ups.length - 1; n++) {
      const Df = red[n].fwd.D, Db = red[n + 1].back.D;
      legs.push({ from: ups[n].station, to: ups[n + 1].station,
        label: name(ups[n].station) + name(ups[n + 1].station),
        Dfwd: Df, Dback: Db, D: r3((Df + Db) / 2),
        dhFwd: red[n].fwd.dh, dhBack: red[n + 1].back.dh,
        dH: r3((red[n].fwd.dh - red[n + 1].back.dh) / 2) });
    }
    return { betas, legs, red };
  }

  /* ---------------- Φάση 4: επίλυση εξαρτημένης όδευσης ---------------- */
  function solve(st, data) {
    const seq = st.seq, L = seq.length, P = id => st.points[id];
    const T1 = P(seq[0]), T2 = P(seq[1]), T3 = P(seq[L - 2]), T4 = P(seq[L - 1]);
    const S = st.settings;
    const betas = data.betas.map(b => b.value), n = betas.length;
    const a0 = azimuth(T1, T2), aEnd = azimuth(T3, T4);
    const aEndCalc = mod(a0 + betas.reduce((s, b) => s + b, 0) + n * 200, 400);
    const wb = wrap(aEnd - aEndCalc), db = wb / n;
    const azs = []; let a = a0;
    for (const b of betas) { a = mod(a + b + db + 200, 400); azs.push(a); }
    const sc = scaleSolve(T2, T3, S.reduction);
    const legs = data.legs.map((lg, k) => {
      const Dg = sc.f * lg.D;
      return { ...lg, az: azs[k], Dg, dx: Dg * Math.sin(azs[k] * GR), dy: Dg * Math.cos(azs[k] * GR) };
    });
    const sumD = legs.reduce((s, l) => s + l.Dg, 0);
    const wx = (T3.E - T2.E) - legs.reduce((s, l) => s + l.dx, 0);
    const wy = (T3.N - T2.N) - legs.reduce((s, l) => s + l.dy, 0);
    const wh = (T3.H - T2.H) - legs.reduce((s, l) => s + l.dH, 0);
    const share = l => S.distribution === "equal" ? 1 / legs.length : l.Dg / sumD;
    const coords = {};
    for (const id of [seq[0], seq[1], seq[L - 2], seq[L - 1]]) coords[id] = { E: P(id).E, N: P(id).N, H: P(id).H };
    let E = T2.E, N = T2.N, H = T2.H;
    legs.forEach((l, k) => {
      l.vx = wx * share(l); l.vy = wy * share(l); l.vh = wh * share(l);
      E += l.dx + l.vx; N += l.dy + l.vy; H += l.dH + l.vh;
      if (k < legs.length - 1) coords[l.to] = { E, N, H };
    });
    const ws = Math.hypot(wx, wy);
    return { a0, aEnd, aEndCalc, wb, db, azs, scale: sc, legs, sumD, wx, wy, ws,
             ratio: ws > 0 ? sumD / ws : Infinity, wh, coords };
  }

  /* ---------------- Φάση 5: ταχυμετρία ---------------- */
  function newTachySetup(st, stationId, bsId) {
    const id = st.tachy.setups.length + 1;
    const rng = RNG.make(`tachy|${st.student.am}|${stationId}|${bsId}|${id}|${st.seedSalt || 0}`);
    return { id, station: stationId, backsight: bsId, i: instrumentHeight(rng, st.settings), shots: [] };
  }

  function shoot(st, setup, tgt) {
    const A = st.points[setup.station], B = st.points[setup.backsight];
    const rng = RNG.make(`shot|${st.student.am}|${setup.id}|${setup.shots.length}|${tgt.E.toFixed(3)}`);
    const sB = rng.uniform(st.settings.sigB[0], st.settings.sigB[1]) / 1e4;
    const t = tgt.onRoof ? 0 : r3(st.settings.tH);
    const Dh = dist(A, tgt) / scaleTrue(A, tgt, st.settings.reduction);
    const dz = (tgt.H + t) - (A.H + setup.i) - GEO.curvRefr(Dh);
    const z = Math.atan2(Dh, dz) / GR, Sl = Math.hypot(Dh, dz);
    return {
      Hz: r4(mod(azimuth(A, tgt) - azimuth(A, B) + rng.gauss(0, sB), 400)),
      V: r4(z + rng.gauss(0, sB)),
      S: r3(Sl + rng.gauss(0, 0.002 + 2e-6 * Sl)),
      t,
    };
  }

  function tachyExpected(st, sol, setup, shot) {
    const c = id => sol.coords[id] || st.points[id];
    const A = c(setup.station), B = c(setup.backsight);
    const a = mod(azimuth(A, B) + shot.Hz, 400);
    const D = shot.S * Math.sin(shot.V * GR), Dg = sol.scale.f * D;
    return { E: A.E + Dg * Math.sin(a * GR), N: A.N + Dg * Math.cos(a * GR),
             H: A.H + setup.i + shot.S * Math.cos(shot.V * GR) - shot.t + GEO.curvRefr(D) };
  }

  /* ---------------- Βαθμολόγηση ---------------- */
  function gradeItem(diff, full, half) {
    if (diff == null || !isFinite(diff)) return 0;
    const a = Math.abs(diff);
    return a <= full ? 1 : a <= half ? 0.5 : 0;
  }

  return { generate, expected, solve, reduceSight, scaleTrue, scaleSolve,
           newTachySetup, shoot, tachyExpected, gradeItem, instrumentHeight, r3, r4 };
})();
