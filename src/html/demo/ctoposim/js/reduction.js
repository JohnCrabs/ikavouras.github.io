/* =========================================================================
   CTopoSim — Διαδραστικά σχήματα θεωρίας Φάσης 3 (αναγωγή μετρήσεων)
     A. Δύο θέσεις τηλεσκοπίου (οριζόντιες διευθύνσεις, σφάλμα σκόπευσης)
     B. Μηδενισμός και μέση ανηγμένη τιμή (κινούμενη περιστροφή)
     C. Ζενίθιες γωνίες: Θέση I / II, D, Δh, στόχος πάνω ή κάτω από το όργανο
     D. Ειδική περίπτωση: αλλαγή ύψους στόχου ανάμεσα στις δύο θέσεις (στατικό)
     E. Τι μετράει γεωμετρικά ο τοπογράφος στο πεδίο (αξονομετρικό)
   και της Φάσης 5 (ταχυμετρία): προσανατολισμός, υψόμετρα, καμπυλότητα, σκαρίφημα
   ========================================================================= */
"use strict";

const Reduction = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const GR = Math.PI / 200;
  const CC = 1e-4;                                    // 1 cc σε grad
  const mod400 = a => ((a % 400) + 400) % 400;
  const sgnd = a => mod400(a + 200) - 200;            // σε (−200, 200]
  const G4 = x => x.toFixed(4) + "<sup>g</sup>";
  const SUP = "<tspan baseline-shift='super' font-size='9'>g</tspan>";
  const COL = { red: "#c0392b", blue: "#1f5fbf", green: "#2b8a3e", purple: "#7b3fa0", orange: "#d9822b", grey: "#777", dark: "#12324f", brown: "#8b5a2b" };
  let uid = 0;

  /** δημιουργεί SVG με δικούς του markers (μοναδικά id ανά σχήμα) */
  function makeSvg(parent, W, H, cls = "quad-svg") {
    const p = "rd" + (++uid);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", cls);
    parent.append(svg);
    const el = (tag, attrs = {}, par = svg) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (par) par.append(e);
      return e;
    };
    const txt = (x, y, s, attrs = {}, par = svg) => { const t = el("text", { x, y, ...attrs }, par); t.innerHTML = s; return t; };
    const defs = el("defs");
    const mk = {};
    for (const [name, c] of Object.entries(COL)) {
      const m = el("marker", { id: `${p}-${name}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", fill: c }, m);
      mk[name] = `url(#${p}-${name})`;
    }
    const pt = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) * W / r.width, (ev.clientY - r.top) * H / r.height]; };
    return { svg, el, txt, mk, pt };
  }

  /** σημείο σε πολικές (γωνία από τον άξονα +y δεξιόστροφα, σε grad) */
  const P = (cx, cy, a, r) => [cx + r * Math.sin(a * GR), cy - r * Math.cos(a * GR)];
  /** δεξιόστροφο τόξο από a0 έως a1 */
  function arc(cx, cy, r, a0, a1) {
    const span = mod400(a1 - a0);
    if (span < 0.05) return "";
    const [x0, y0] = P(cx, cy, a0, r), [x1, y1] = P(cx, cy, a0 + span, r);
    return `M${x0},${y0} A${r},${r} 0 ${span > 200 ? 1 : 0} 1 ${x1},${y1}`;
  }
  const line = (e, x1, y1, x2, y2) => { e.setAttribute("x1", x1); e.setAttribute("y1", y1); e.setAttribute("x2", x2); e.setAttribute("y2", y2); };
  const at = (e, x, y) => { e.setAttribute("x", x); e.setAttribute("y", y); };
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  function slider(label, min, max, step, val, unit = "") {
    const out = h("b", { class: "rd-val" });
    const inp = h("input", { type: "range", min, max, step, value: val });
    const lab = h("label", {}, label, " ", out, unit ? " " + unit : "", inp);
    return { lab, inp, out };
  }

  /** κύκλος οριζόντιων αναγνώσεων με υποδιαιρέσεις */
  function dial(S, cx, cy, R) {
    S.el("circle", { cx, cy, r: R, fill: "#fff", stroke: "#333", "stroke-width": 2 });
    for (let a = 0; a < 400; a += 10) {
      const big = a % 50 === 0, [x0, y0] = P(cx, cy, a, R), [x1, y1] = P(cx, cy, a, R - (big ? 12 : 6));
      S.el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: "#333", "stroke-width": big ? 1.6 : 0.8 });
    }
    S.el("line", { x1: cx, y1: cy - R - 26, x2: cx, y2: cy + R + 26, stroke: "#aab", "stroke-width": 1 });
    S.el("line", { x1: cx - R - 26, y1: cy, x2: cx + R + 26, y2: cy, stroke: "#aab", "stroke-width": 1 });
    S.txt(cx, cy - R - 32, "0 / 400" + SUP, { class: "q-deg", "text-anchor": "middle" });
    S.txt(cx + R + 30, cy + 5, "100" + SUP, { class: "q-deg" });
    S.txt(cx, cy + R + 44, "200" + SUP, { class: "q-deg", "text-anchor": "middle" });
    S.txt(cx - R - 30, cy + 5, "300" + SUP, { class: "q-deg", "text-anchor": "end" });
  }

  /* ===================== A. Δύο θέσεις τηλεσκοπίου ===================== */
  function buildFaces(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 560, cx = 280, cy = 285, R = 175, K = 3000;   // K: μεγέθυνση σφαλμάτων στο σχήμα
    const S = makeSvg(root, W, H);
    dial(S, cx, cy, R);
    const e = {};
    e.secI = S.el("path", { fill: COL.red, "fill-opacity": 0.12 });
    e.secII = S.el("path", { fill: COL.blue, "fill-opacity": 0.12 });
    e.rI = [0, 1].map(() => S.el("line", { stroke: COL.red, "stroke-width": 1.4, "stroke-dasharray": "6 5" }));
    e.rII = [0, 1].map(() => S.el("line", { stroke: COL.blue, "stroke-width": 1.4, "stroke-dasharray": "6 5" }));
    e.truth = S.el("line", { stroke: "#222", "stroke-width": 1.2, "stroke-dasharray": "2 4" });
    e.arcI = S.el("path", { fill: "none", stroke: COL.red, "stroke-width": 2.2, "marker-end": S.mk.red });
    e.arcII = S.el("path", { fill: "none", stroke: COL.blue, "stroke-width": 2.2, "marker-end": S.mk.blue });
    e.I = S.el("line", { x1: cx, y1: cy, stroke: COL.red, "stroke-width": 3.5 });
    e.II = S.el("line", { x1: cx, y1: cy, stroke: COL.blue, "stroke-width": 3.5 });
    S.el("circle", { cx, cy, r: 5, fill: "#111" });
    S.txt(cx - 22, cy - 8, "O", { class: "q-pt" });
    e.lI = S.txt(0, 0, "", { class: "rd-lab", fill: COL.red });
    e.lII = S.txt(0, 0, "", { class: "rd-lab", fill: COL.blue });
    e.hd = S.el("circle", { r: 10, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
    S.txt(10, H - 10, `Τα σφάλματα στο σχήμα είναι μεγεθυμένα ×${K} (1 cc → ${(K * CC).toFixed(1)}` + SUP + ")", { class: "rd-small" });

    const st = { a: 42.9587, c: 12, sig: 6, nI: 0, nII: 0 };
    const sa = slider("Διεύθυνση (Θέση I):", 0, 399.99, 0.01, st.a, "grad");
    const sc = slider("Σφάλμα σκόπευσης c:", -30, 30, 1, st.c, "cc");
    const ss = slider("Τυχαίο σφάλμα σκόπευσης σ:", 0, 20, 1, st.sig, "cc");
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sa.lab, sc.lab, ss.lab,
        h("div", { class: "rd-btns" },
          h("button", { onclick: () => { st.nI = gauss() * st.sig; st.nII = gauss() * st.sig; upd(); } }, "🎯 Νέα σκόπευση (τυχαίο σφάλμα)"),
          h("button", { onclick: () => { st.nI = st.nII = 0; upd(); } }, "Χωρίς τυχαίο σφάλμα"))),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε το κίτρινο σημείο. Η κόκκινη ακτίνα είναι η σκόπευση σε Θέση I και η μπλε η αντιδιαμετρική της σε Θέση II, 200",
        h("sup", {}, "g"), " πιο πέρα. Οι διακεκομμένες γραμμές δείχνουν το εύρος ±σ όπου αναμένεται η ανάγνωση.")));

    sa.inp.oninput = () => { st.a = +sa.inp.value; upd(); };
    sc.inp.oninput = () => { st.c = +sc.inp.value; upd(); };
    ss.inp.oninput = () => { st.sig = +ss.inp.value; st.nI = st.nII = 0; upd(); };
    let drag = false;
    const fromPtr = ev => { const [x, y] = S.pt(ev); if (Math.hypot(x - cx, y - cy) < 6) return; st.a = mod400(Math.atan2(x - cx, cy - y) / GR); upd(); };
    S.svg.addEventListener("pointerdown", ev => { drag = true; S.svg.setPointerCapture(ev.pointerId); fromPtr(ev); });
    S.svg.addEventListener("pointermove", ev => drag && fromPtr(ev));
    S.svg.addEventListener("pointerup", () => drag = false);

    function upd() {
      const k = K * CC;
      // αναγνώσεις: Θέση I = r + c, Θέση II = r ± 200 − c (+ τυχαίο σφάλμα)
      const HzI = mod400(st.a + (st.c + st.nI) * CC), HzII = mod400(st.a + 200 - (st.c - st.nII) * CC);
      const dI = st.a + (st.c + st.nI) * k, dII = st.a + 200 + (-st.c + st.nII) * k;   // γωνίες σχεδίασης
      const eI = st.a + st.c * k, eII = st.a + 200 - st.c * k, w = st.sig * k;
      const L = R + 45;
      let [x, y] = P(cx, cy, dI, L); line(e.I, cx, cy, x, y); e.hd.setAttribute("cx", x); e.hd.setAttribute("cy", y);
      at(e.lI, ...P(cx, cy, dI, L + 26)); e.lI.innerHTML = `Θ<tspan baseline-shift='sub' font-size='10'>I</tspan> ${HzI.toFixed(4)}` + SUP;
      e.lI.setAttribute("text-anchor", mod400(dI) < 200 ? "start" : "end");
      [x, y] = P(cx, cy, dII, L); line(e.II, cx, cy, x, y);
      at(e.lII, ...P(cx, cy, dII, L + 26)); e.lII.innerHTML = `Θ<tspan baseline-shift='sub' font-size='10'>II</tspan> ${HzII.toFixed(4)}` + SUP;
      e.lII.setAttribute("text-anchor", mod400(dII) < 200 ? "start" : "end");
      [eI - w, eI + w].forEach((a, i) => line(e.rI[i], cx, cy, ...P(cx, cy, a, R + 20)));
      [eII - w, eII + w].forEach((a, i) => line(e.rII[i], cx, cy, ...P(cx, cy, a, R + 20)));
      const sec = (a0, a1) => { const [x0, y0] = P(cx, cy, a0, R), [x1, y1] = P(cx, cy, a1, R); return w < 0.05 ? "" : `M${cx},${cy} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`; };
      e.secI.setAttribute("d", sec(eI - w, eI + w)); e.secII.setAttribute("d", sec(eII - w, eII + w));
      line(e.truth, ...P(cx, cy, st.a + 200, R + 10), ...P(cx, cy, st.a, R + 10));
      e.arcI.setAttribute("d", arc(cx, cy, 60, 0, dI));
      e.arcII.setAttribute("d", arc(cx, cy, 85, 0, dII));
      // υπολογισμοί όπως στο έντυπο
      const sh = HzII >= 200 ? -200 : 200, II2 = HzII + sh;
      const diff = sgnd(HzI - II2);                      // = 2c (με προσοχή στο 0/400)
      const r = mod400(II2 + diff / 2);
      sa.out.textContent = st.a.toFixed(4); sc.out.textContent = st.c; ss.out.textContent = st.sig;
      out.innerHTML = `
        <tr><td>Hz<sub>I</sub> (ανάγνωση Θέσης I)</td><td><b style="color:${COL.red}">${G4(HzI)}</b></td></tr>
        <tr><td>Hz<sub>II</sub> (ανάγνωση Θέσης II)</td><td><b style="color:${COL.blue}">${G4(HzII)}</b></td></tr>
        <tr><td>Hz<sub>II</sub> ${sh < 0 ? "−" : "+"} 200<sup>g</sup></td><td>${G4(II2)}</td></tr>
        <tr><td>2c = Hz<sub>I</sub> − (Hz<sub>II</sub> ∓ 200<sup>g</sup>)</td><td>${(diff / CC).toFixed(1)} cc</td></tr>
        <tr class="res"><td>r = [Hz<sub>I</sub> + (Hz<sub>II</sub> ∓ 200<sup>g</sup>)] / 2</td><td><b>${G4(r)}</b></td></tr>
        <tr><td>Σφάλμα του r ως προς την πραγματική διεύθυνση</td><td>${(sgnd(r - st.a) / CC).toFixed(1)} cc</td></tr>`;
    }
    upd();
  }

  /* ===================== B. Μηδενισμός και ανηγμένη τιμή ===================== */
  function buildZero(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 560, cx = 280, cy = 285, R = 175;
    const S = makeSvg(root, W, H);
    dial(S, cx, cy, R);
    const e = {};
    e.arcB = S.el("path", { fill: "none", stroke: COL.red, "stroke-width": 2, "marker-end": S.mk.red, "stroke-dasharray": "5 3" });
    e.arcF = S.el("path", { fill: "none", stroke: COL.blue, "stroke-width": 2, "marker-end": S.mk.blue, "stroke-dasharray": "5 3" });
    e.sec = S.el("path", { fill: COL.green, "fill-opacity": 0.16 });
    e.arcBeta = S.el("path", { fill: "none", stroke: COL.green, "stroke-width": 3.5, "marker-end": S.mk.green });
    e.lBeta = S.txt(0, 0, "β", { class: "q-alpha", fill: COL.green, "text-anchor": "middle" });
    e.B = S.el("line", { x1: cx, y1: cy, stroke: COL.red, "stroke-width": 3.5 });
    e.F = S.el("line", { x1: cx, y1: cy, stroke: COL.blue, "stroke-width": 3.5 });
    S.el("circle", { cx, cy, r: 5, fill: "#111" });
    e.lB = S.txt(0, 0, "", { class: "rd-lab", fill: COL.red });
    e.lF = S.txt(0, 0, "", { class: "rd-lab", fill: COL.blue });
    e.hB = S.el("circle", { r: 10, fill: "#f6b4ad", stroke: COL.red, "stroke-width": 2, class: "q-handle" });
    e.hF = S.el("circle", { r: 10, fill: "#b8cdf2", stroke: COL.blue, "stroke-width": 2, class: "q-handle" });
    e.state = S.txt(10, H - 10, "", { class: "rd-small" });

    const st = { hb: 37.2150, hf: 214.8890, rot: 0, anim: false };
    const out = h("tbody");
    const bRed = h("button", { class: "primary" }, "▶ Υπολόγισε τη Μ.Α.Τ. (μέση ανηγμένη τιμή)");
    const bReset = h("button", {}, "↺ Αναγνώσεις οργάνου");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "rd-btns" }, bRed, bReset),
      h("div", { class: "rd-btns" }, h("span", { class: "muted small" }, "Μηδενισμός πίσω σκόπευσης: "),
        ...[0, 50, 100, 150].map(z => h("button", { class: "small", onclick: () => setZero(z) }, z.toFixed(0)))),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε τα δύο σημεία: κόκκινο η πίσω σκόπευση (διεύθυνση μηδενισμού), μπλε η εμπρός. ",
        "Με τη Μ.Α.Τ. όλο το σχήμα περιστρέφεται κατά −Hz", h("sub", {}, "πίσω"), ", ώστε η πίσω σκόπευση να πέσει στον θετικό ημιάξονα y (0",
        h("sup", {}, "g"), "). Η γωνία β δεν αλλάζει· αλλάζουν μόνο οι αναγνώσεις.")));

    function setZero(z) { if (st.anim) return; const b = mod400(st.hf - st.hb); st.hb = z; st.hf = mod400(z + b); st.rot = 0; upd(); }
    function animate(to) {
      if (st.anim) return; st.anim = true;
      const from = st.rot, t0 = performance.now(), T = 1400;
      const step = now => {
        const u = Math.min(1, (now - t0) / T), ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        st.rot = from + (to - from) * ease; upd();
        if (u < 1) requestAnimationFrame(step); else { st.anim = false; upd(); }
      };
      requestAnimationFrame(step);
    }
    bRed.onclick = () => animate(1);
    bReset.onclick = () => animate(0);
    let drag = null;
    S.svg.addEventListener("pointerdown", ev => {
      if (st.anim || st.rot > 0) return;
      const [x, y] = S.pt(ev), a = mod400(Math.atan2(x - cx, cy - y) / GR);
      drag = Math.abs(sgnd(a - st.hb)) < Math.abs(sgnd(a - st.hf)) ? "hb" : "hf";
      S.svg.setPointerCapture(ev.pointerId); st[drag] = a; upd();
    });
    S.svg.addEventListener("pointermove", ev => {
      if (!drag) return; const [x, y] = S.pt(ev); if (Math.hypot(x - cx, y - cy) < 6) return;
      st[drag] = mod400(Math.atan2(x - cx, cy - y) / GR); upd();
    });
    S.svg.addEventListener("pointerup", () => drag = null);

    function upd() {
      const off = st.rot * st.hb;                        // τρέχουσα περιστροφή
      const db = st.hb - off, df = st.hf - off, beta = mod400(st.hf - st.hb);
      const L = R + 45;
      let [x, y] = P(cx, cy, db, L); line(e.B, cx, cy, x, y); e.hB.setAttribute("cx", x); e.hB.setAttribute("cy", y);
      [x, y] = P(cx, cy, df, L); line(e.F, cx, cy, x, y); e.hF.setAttribute("cx", x); e.hF.setAttribute("cy", y);
      const red = st.rot > 0.999, word = red ? "ανηγμ." : st.rot > 0 ? "…" : "Hz";
      at(e.lB, ...P(cx, cy, db, L + 24)); e.lB.setAttribute("text-anchor", mod400(db) < 200 ? "start" : "end");
      e.lB.innerHTML = `Πίσω · ${word} ${mod400(db).toFixed(4)}` + SUP;
      at(e.lF, ...P(cx, cy, df, L + 24)); e.lF.setAttribute("text-anchor", mod400(df) < 200 ? "start" : "end");
      e.lF.innerHTML = `Εμπρός · ${word} ${mod400(df).toFixed(4)}` + SUP;
      e.arcB.setAttribute("d", arc(cx, cy, 55, 0, db));
      e.arcF.setAttribute("d", arc(cx, cy, 150, 0, df));
      e.arcBeta.setAttribute("d", arc(cx, cy, 95, db, df));
      const [x0, y0] = P(cx, cy, db, 95), [x1, y1] = P(cx, cy, db + beta, 95);
      e.sec.setAttribute("d", beta < 0.05 ? "" : `M${cx},${cy} L${x0},${y0} A95,95 0 ${beta > 200 ? 1 : 0} 1 ${x1},${y1} Z`);
      at(e.lBeta, ...P(cx, cy, db + beta / 2, 118)); e.lBeta.setAttribute("dy", 6);
      e.state.textContent = red ? "Ανηγμένες τιμές: η πίσω σκόπευση είναι στο 0 (θετικός ημιάξονας y)." :
        st.rot > 0 ? "Περιστροφή κατά −Hz(πίσω)…" : "Αναγνώσεις του οργάνου (όπως γράφονται στο έντυπο).";
      out.innerHTML = `
        <tr><td>Hz<sub>πίσω</sub> (μηδενισμός)</td><td><b style="color:${COL.red}">${G4(st.hb)}</b></td></tr>
        <tr><td>Hz<sub>εμπρός</sub></td><td><b style="color:${COL.blue}">${G4(st.hf)}</b></td></tr>
        <tr><td>Ανηγμένη πίσω = Hz<sub>πίσω</sub> − Hz<sub>πίσω</sub></td><td>${G4(0)}</td></tr>
        <tr><td>Ανηγμένη εμπρός = Hz<sub>εμπρός</sub> − Hz<sub>πίσω</sub></td><td>${(st.hf - st.hb).toFixed(4)}${st.hf < st.hb ? " + 400" : ""}</td></tr>
        <tr class="res"><td>β (δεξιόστροφα, πίσω → εμπρός)</td><td><b>${G4(beta)}</b></td></tr>`;
    }
    upd();
  }

  /* ===================== C. Ζενίθιες γωνίες ===================== */
  function buildZenith(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 640, H = 440;
    const S = makeSvg(root, W, H);
    const e = {};
    const g = S.el("g");
    const st = { D: 18, dH: 2.5, i: 1.55, t: 1.80, eps: 0 };
    const sD = slider("Οριζόντια απόσταση D:", 3, 60, 0.5, st.D, "m");
    const sH = slider("Υψομετρική διαφορά εδάφους H<sub>B</sub> − H<sub>A</sub>:", -10, 10, 0.1, st.dH, "m");
    sH.lab.firstChild.replaceWith(h("span", { html: "Υψομετρική διαφορά εδάφους H<sub>B</sub> − H<sub>A</sub>:" }));
    const si = slider("Ύψος οργάνου i (Υ.Ο.):", 1.2, 1.8, 0.01, st.i, "m");
    const stt = slider("Ύψος στόχου t (Υ.Σ.):", 0, 3, 0.01, st.t, "m");
    const se = slider("Σφάλμα δείκτη ε:", -40, 40, 1, st.eps, "cc");
    const out = h("tbody");
    const inset = h("div", { class: "rd-inset" });
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sD.lab, sH.lab, si.lab, stt.lab, se.lab),
      inset,
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Δώσε αρνητική υψομετρική διαφορά για στόχο χαμηλότερα από τον σταθμό: τότε z > 100",
        h("sup", {}, "g"), ", cos z < 0 και το Δh βγαίνει αρνητικό χωρίς καμία ειδική διόρθωση.")));
    const I = makeSvg(inset, 220, 190, "rd-inset-svg");
    I.txt(110, 14, "Θέση I και Θέση II (κάτοπτρο)", { class: "rd-small", "text-anchor": "middle", "font-weight": 700 });
    const icx = 110, icy = 112, ir = 52;
    I.el("line", { x1: icx, y1: icy + 10, x2: icx, y2: icy - ir - 22, stroke: "#333", "stroke-width": 1.5, "marker-end": I.mk.dark });
    I.el("line", { x1: icx - ir - 30, y1: icy, x2: icx + ir + 30, y2: icy, stroke: "#999", "stroke-width": 1 });
    I.txt(icx + 4, icy - ir - 24, "Ζενίθ", { class: "rd-small" });
    I.txt(icx + ir + 18, icy - ir - 8, "Θ<tspan baseline-shift='sub' font-size='8'>I</tspan>", { class: "rd-small", fill: COL.red, "font-weight": 700 });
    I.txt(icx - ir - 30, icy - ir - 8, "Θ<tspan baseline-shift='sub' font-size='8'>II</tspan>", { class: "rd-small", fill: COL.blue, "font-weight": 700 });
    const iI = I.el("line", { x1: icx, y1: icy, stroke: COL.red, "stroke-width": 2.5 });
    const iII = I.el("line", { x1: icx, y1: icy, stroke: COL.blue, "stroke-width": 2.5 });
    const iaI = I.el("path", { fill: "none", stroke: COL.red, "stroke-width": 1.8, "marker-end": I.mk.red });
    const iaII = I.el("path", { fill: "none", stroke: COL.blue, "stroke-width": 1.5, "marker-end": I.mk.blue });
    const itI = I.txt(0, 0, "", { class: "rd-small", fill: COL.red });
    const itII = I.txt(0, 0, "", { class: "rd-small", fill: COL.blue });
    I.txt(110, 185, "V<tspan baseline-shift='sub' font-size='8'>I</tspan> + V<tspan baseline-shift='sub' font-size='8'>II</tspan> = 400" + SUP + " (+2ε)", { class: "rd-small", "text-anchor": "middle" });

    for (const [s, k] of [[sD, "D"], [sH, "dH"], [si, "i"], [stt, "t"], [se, "eps"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };

    function upd() {
      const { D, dH, i, t, eps } = st;
      const v = dH + t - i, S0 = Math.hypot(D, v), z = Math.atan2(D, v) / GR;
      // κλίμακα: ίδια σε x και y ώστε οι γωνίες να είναι πραγματικές
      const yTop = Math.max(i, dH + t, dH, 0), yBot = Math.min(0, dH);
      const left = 130, right = 120, top = 70, bot = 50;
      const k = Math.min((W - left - right) / D, (H - top - bot) / Math.max(yTop - yBot, 0.5), 60);
      const X = x => left + x * k, Y = y => H - bot - (y - yBot) * k - Math.max(0, (H - top - bot - (yTop - yBot) * k) / 2);
      const xa = X(0), ya = Y(0), xi = X(0), yi = Y(i), xb = X(D), yb = Y(dH), yp = Y(dH + t);
      g.innerHTML = "";
      const el = (tag, a) => S.el(tag, a, g), tx = (x, y, s, a = {}) => S.txt(x, y, s, a, g);
      // έδαφος
      const cx1 = xa + (xb - xa) * 0.35, cx2 = xa + (xb - xa) * 0.65;
      el("path", { d: `M10,${ya} L${xa},${ya} C${cx1},${ya - 18} ${cx2},${yb + 22} ${xb},${yb} L${W - 10},${yb}`, fill: "none", stroke: COL.brown, "stroke-width": 2 });
      el("text", { x: 14, y: ya + 18, class: "rd-small", fill: COL.brown }).textContent = "έδαφος";
      // αναφορά H_A και Δh εδάφους
      el("line", { x1: xa, y1: ya, x2: xb + 60, y2: ya, stroke: "#bbb", "stroke-dasharray": "4 4" });
      const xr = xb + 50;
      if (Math.abs(yb - ya) > 2) {
        el("line", { x1: xr, y1: ya, x2: xr, y2: yb, stroke: COL.red, "stroke-width": 2.5, "marker-end": S.mk.red });
        tx(xr + 6, (ya + yb) / 2 + 4, "Δh<tspan baseline-shift='sub' font-size='9'>AB</tspan>", { class: "rd-lab", fill: COL.red });
      }
      // τρίποδας και όργανο
      el("line", { x1: xi, y1: yi, x2: xa - 12, y2: ya, stroke: "#555", "stroke-width": 2 });
      el("line", { x1: xi, y1: yi, x2: xa + 12, y2: ya, stroke: "#555", "stroke-width": 2 });
      el("rect", { x: xi - 7, y: yi - 9, width: 14, height: 12, fill: "#e07b00", stroke: "#333" });
      tx(xa - 6, ya + 18, "A", { class: "q-pt", "text-anchor": "end" });
      // διάσταση Υ.Ο.
      el("line", { x1: xa - 34, y1: ya, x2: xa - 34, y2: yi, stroke: "#333", "stroke-width": 1.2, "marker-end": S.mk.dark, "marker-start": S.mk.dark });
      tx(xa - 40, (ya + yi) / 2 + 4, `Υ.Ο. = ${i.toFixed(2)}`, { class: "rd-small", "text-anchor": "end" });
      // στόχος
      el("line", { x1: xb, y1: yb, x2: xb, y2: yp, stroke: "#555", "stroke-width": 2 });
      el("path", { d: `M${xb},${yp - 7} L${xb + 7},${yp} L${xb},${yp + 7} L${xb - 7},${yp} Z`, fill: "#ffd54f", stroke: "#333" });
      tx(xb - 8, yb + 18, "B", { class: "q-pt", "text-anchor": "end" });
      if (t > 0.05) {
        el("line", { x1: xb + 22, y1: yb, x2: xb + 22, y2: yp, stroke: "#333", "stroke-width": 1.2, "marker-end": S.mk.dark, "marker-start": S.mk.dark });
        tx(xb + 28, (yb + yp) / 2 + 4, `Υ.Σ. = ${t.toFixed(2)}`, { class: "rd-small" });
      }
      // ζενίθ, ορίζοντας οργάνου, κεκλιμένο μήκος
      el("line", { x1: xi, y1: yi, x2: xi, y2: 22, stroke: COL.dark, "stroke-width": 1.5, "marker-end": S.mk.dark });
      tx(xi + 6, 30, "Ζενίθ", { class: "rd-lab", fill: COL.dark });
      el("line", { x1: xi, y1: yi, x2: xb, y2: yi, stroke: COL.green, "stroke-width": 2, "stroke-dasharray": "7 4" });
      tx((xi + xb) / 2, yi + (v >= 0 ? 18 : -8), `D = S·sin z = ${D.toFixed(3)} m`, { class: "rd-lab", fill: COL.green, "text-anchor": "middle" });
      el("line", { x1: xb, y1: yi, x2: xb, y2: yp, stroke: COL.orange, "stroke-width": 2.5 });
      if (Math.abs(yp - yi) > 14) tx(xb - 8, (yi + yp) / 2 + 4, "S·cos z", { class: "rd-lab", fill: COL.orange, "text-anchor": "end" });
      el("line", { x1: xi, y1: yi, x2: xb, y2: yp, stroke: COL.blue, "stroke-width": 3 });
      const mx = (xi + xb) / 2, my = (yi + yp) / 2;
      tx(mx, my + (v >= 0 ? -10 : -10), `S = ${S0.toFixed(3)} m`, { class: "rd-lab", fill: COL.blue, "text-anchor": "middle" });
      // τόξο z από το ζενίθ δεξιόστροφα
      const rz = 48;
      el("path", { d: arc(xi, yi, rz, 0, z), fill: "none", stroke: COL.purple, "stroke-width": 2.5, "marker-end": S.mk.purple });
      const [lx, ly] = P(xi, yi, z / 2, rz + 14);
      tx(lx, ly + 5, "z", { class: "q-alpha", fill: COL.purple, "text-anchor": "middle" });
      // εικόνα κατόπτρου
      const VI = z + eps * CC, VII = 400 - z + eps * CC;
      line(iI, icx, icy, ...P(icx, icy, z, ir + 18));
      line(iII, icx, icy, ...P(icx, icy, 400 - z, ir + 18));
      iaI.setAttribute("d", arc(icx, icy, 26, 0, z));
      iaII.setAttribute("d", arc(icx, icy, 40, 0, 400 - z));
      at(itI, ...P(icx, icy, z / 2, 30)); itI.innerHTML = "z<tspan baseline-shift='sub' font-size='8'>I</tspan>";
      at(itII, icx - 8, icy + 50); itII.innerHTML = "z<tspan baseline-shift='sub' font-size='8'>II</tspan> = 400 − z<tspan baseline-shift='sub' font-size='8'>I</tspan>";
      itII.setAttribute("text-anchor", "middle");
      sD.out.textContent = D.toFixed(1); sH.out.textContent = dH.toFixed(1); si.out.textContent = i.toFixed(2); stt.out.textContent = t.toFixed(2); se.out.textContent = eps;
      const dh = S0 * Math.cos(z * GR) + i - t;
      out.innerHTML = `
        <tr><td>V<sub>I</sub> (ανάγνωση Θέσης I)</td><td><b style="color:${COL.red}">${G4(VI)}</b></td></tr>
        <tr><td>V<sub>II</sub> (ανάγνωση Θέσης II)</td><td><b style="color:${COL.blue}">${G4(VII)}</b></td></tr>
        <tr><td>ε = (V<sub>I</sub> + V<sub>II</sub> − 400<sup>g</sup>) / 2</td><td>${eps.toFixed(0)} cc</td></tr>
        <tr class="res"><td>z = (V<sub>I</sub> − V<sub>II</sub> + 400<sup>g</sup>) / 2</td><td><b>${G4(z)}</b> ${z > 100 ? "(στόχος κάτω από τον ορίζοντα)" : "(στόχος πάνω από τον ορίζοντα)"}</td></tr>
        <tr><td>S (κεκλιμένο μήκος)</td><td>${S0.toFixed(3)} m</td></tr>
        <tr><td>D = S·sin z</td><td><b>${D.toFixed(3)}</b> m</td></tr>
        <tr><td>S·cos z</td><td>${(S0 * Math.cos(z * GR)).toFixed(3)} m</td></tr>
        <tr class="res"><td>Δh = S·cos z + i − t</td><td><b>${dh >= 0 ? "+" : "−"}${Math.abs(dh).toFixed(3)}</b> m</td></tr>`;
    }
    upd();
  }

  /* ===================== D. Ειδική περίπτωση: αλλάζει το ύψος στόχου ===================== */
  function buildObstacle(root) {
    root.innerHTML = ""; root.classList.add("rd-static");
    const W = 600, H = 300;
    const S = makeSvg(root, W, H, "quad-svg rd-static-svg");
    const x0 = 70, y0 = 250, xb = 520, y1 = 185, y2 = 95;
    S.el("line", { x1: x0, y1: y0, x2: xb + 10, y2: y0, stroke: "#333", "stroke-width": 2 });
    S.el("line", { x1: x0, y1: y0, x2: x0, y2: 25, stroke: "#333", "stroke-width": 2, "marker-end": S.mk.dark });
    S.txt(x0 + 6, 32, "Ζενίθ", { class: "rd-lab", fill: COL.dark });
    S.el("line", { x1: xb, y1: y0, x2: xb, y2: y2 - 12, stroke: "#333", "stroke-width": 2 });
    S.el("rect", { x: 250, y: 168, width: 70, height: 82, fill: "#ddd", stroke: "#888", "stroke-dasharray": "5 4" });
    S.txt(285, 214, "εμπόδιο", { class: "rd-small", "text-anchor": "middle" });
    S.el("line", { x1: x0, y1: y0, x2: xb, y2: y1, stroke: COL.red, "stroke-width": 2.5 });
    S.el("line", { x1: x0, y1: y0, x2: xb, y2: y2, stroke: COL.blue, "stroke-width": 2.5 });
    for (const [y, c] of [[y1, COL.red], [y2, COL.blue]])
      S.el("path", { d: `M${xb},${y - 7} L${xb + 7},${y} L${xb},${y + 7} L${xb - 7},${y} Z`, fill: "#ffd54f", stroke: c, "stroke-width": 2 });
    const zr = (dx, dy) => Math.atan2(dx, dy) / GR;
    const z1 = zr(xb - x0, y0 - y1), z2 = zr(xb - x0, y0 - y2);
    S.el("path", { d: arc(x0, y0, 120, 0, z1), fill: "none", stroke: COL.red, "stroke-width": 2, "marker-end": S.mk.red });
    S.el("path", { d: arc(x0, y0, 80, 0, z2), fill: "none", stroke: COL.blue, "stroke-width": 2, "marker-end": S.mk.blue });
    S.txt(...P(x0, y0, z1 * 0.8, 136), "z<tspan baseline-shift='sub' font-size='9'>I</tspan>", { class: "rd-lab", fill: COL.red });
    S.txt(...P(x0, y0, z2 * 0.45, 92), "z<tspan baseline-shift='sub' font-size='9'>II</tspan>", { class: "rd-lab", fill: COL.blue });
    S.txt(300, y0 + 22, "D (ίδια και στις δύο θέσεις)", { class: "rd-lab", "text-anchor": "middle" });
    S.txt(400, 226, "S<tspan baseline-shift='sub' font-size='9'>I</tspan>", { class: "rd-lab", fill: COL.red });
    S.txt(205, 182, "S<tspan baseline-shift='sub' font-size='9'>II</tspan>", { class: "rd-lab", fill: COL.blue });
    for (const [y, c, s, dx] of [[y1, COL.red, "t<tspan baseline-shift='sub' font-size='9'>I</tspan>", 30], [y2, COL.blue, "t<tspan baseline-shift='sub' font-size='9'>II</tspan>", 62]]) {
      S.el("line", { x1: xb + dx, y1: y0, x2: xb + dx, y2: y, stroke: c, "stroke-width": 1.5, "marker-end": S.mk[c === COL.red ? "red" : "blue"], "marker-start": S.mk[c === COL.red ? "red" : "blue"] });
      S.txt(xb + dx + 4, (y0 + y) / 2 + 4, s, { class: "rd-lab", fill: c });
    }
    S.txt(10, H - 6, "Σχηματικό: ο στόχος ανεβαίνει ανάμεσα στις δύο θέσεις για να φανεί πάνω από το εμπόδιο.", { class: "rd-small" });
  }

  /* ===================== E. Τι μετράει γεωμετρικά ο τοπογράφος ===================== */
  function buildField(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 640, H = 400;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { hz: 120, z: 94, S: 26, i: 1.55, t: 1.6, yaw: 25 };
    const sHz = slider("Ανηγμένη διεύθυνση προς τον στόχο Hz:", 0, 399, 1, st.hz, "grad");
    const sZ = slider("Ζενίθια γωνία z:", 80, 120, 0.5, st.z, "grad");
    const sS = slider("Κεκλιμένο μήκος S:", 10, 34, 0.5, st.S, "m");
    const sY = slider("Περιστροφή όψης:", -180, 180, 1, st.yaw, "°");
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sHz.lab, sZ.lab, sS.lab, sY.lab),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Το όργανο μετράει μόνο τρία μεγέθη: τη διεύθυνση Hz στο οριζόντιο επίπεδο (κόκκινο), τη ζενίθια γωνία z στο κατακόρυφο επίπεδο της σκόπευσης (μωβ) ",
        "και το κεκλιμένο μήκος S (μπλε). Το D (πράσινο) και το Δh (πορτοκαλί) υπολογίζονται.")));
    for (const [s, k] of [[sHz, "hz"], [sZ, "z"], [sS, "S"], [sY, "yaw"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };

    function upd() {
      const { hz, z, S: Sl, i, t } = st;
      const D = Sl * Math.sin(z * GR), V = Sl * Math.cos(z * GR), dh = V + i - t;
      const a = hz * GR, TE = D * Math.sin(a), TN = D * Math.cos(a);
      // αξονομετρική προβολή· τα ύψη μεγεθύνονται ×VE ώστε να διακρίνονται (σχηματικό)
      const VE = 3, ps = Math.sin(35 * Math.PI / 180), pc = Math.cos(35 * Math.PI / 180);
      const yw = st.yaw * Math.PI / 180, cw = Math.cos(yw), sw = Math.sin(yw);
      const raw = (E, N, U) => { const x = E * cw - N * sw, d = E * sw + N * cw; return [x, -(d * ps + U * VE * pc)]; };
      const Rp0 = Math.max(D, 12) + 2, bb = [];
      for (let q = 0; q < 16; q++) { const u = q / 16 * 2 * Math.PI; bb.push(raw(Rp0 * Math.sin(u), Rp0 * Math.cos(u), i)); }
      bb.push(raw(0, 0, 0), raw(0, 0, i + 9 / VE * 2), raw(TE, TN, i + V + 3), raw(TE, TN, i + V - t - 1));
      const xs = bb.map(p => p[0]), ys = bb.map(p => p[1]);
      const k = Math.min((W - 150) / (Math.max(...xs) - Math.min(...xs)), (H - 60) / (Math.max(...ys) - Math.min(...ys)));
      const ox = W / 2 - k * (Math.max(...xs) + Math.min(...xs)) / 2, oy = (H - 20) / 2 - k * (Math.max(...ys) + Math.min(...ys)) / 2;
      const pr = (E, N, U) => { const [x, y] = raw(E, N, U); return [ox + x * k, oy + y * k]; };
      g.innerHTML = "";
      const el = (tag, at_) => S.el(tag, at_, g), tx = (p, s, a_ = {}) => S.txt(p[0], p[1], s, a_, g);
      const poly = (pts, at_) => el("path", { d: "M" + pts.map(p => p.join(",")).join(" L") + (at_.close ? " Z" : ""), ...at_ });
      // οριζόντιο επίπεδο του οργάνου
      const Rp = Rp0;
      const circ = []; for (let q = 0; q <= 64; q++) { const u = q / 64 * 2 * Math.PI; circ.push(pr(Rp * Math.sin(u), Rp * Math.cos(u), i)); }
      poly(circ, { fill: "#e8f0fb", "fill-opacity": 0.6, stroke: "#9bb3d6", "stroke-width": 1 });
      tx(pr(-Rp * 0.75, -Rp * 0.75, i), "οριζόντιο επίπεδο του οργάνου", { class: "rd-small", fill: "#5a7aa8", "text-anchor": "middle" });
      // κατακόρυφο επίπεδο της σκόπευσης
      const top = Math.max(i + V, i) + 3, bot = Math.min(0, i + V - t) - 1;
      poly([pr(0, 0, bot), pr(TE, TN, bot), pr(TE, TN, top), pr(0, 0, top)], { close: true, fill: "#f3e9f8", "fill-opacity": 0.55, stroke: "#c9a8dc", "stroke-width": 1, "stroke-dasharray": "4 3" });
      tx(pr(TE * 0.5, TN * 0.5, top - 1), "κατακόρυφο επίπεδο σκόπευσης", { class: "rd-small", fill: COL.purple, "text-anchor": "middle" });
      // έδαφος κάτω από το όργανο και τον στόχο
      const O = pr(0, 0, i), A = pr(0, 0, 0), T = pr(TE, TN, i), Pp = pr(TE, TN, i + V), B = pr(TE, TN, i + V - t);
      el("line", { x1: A[0], y1: A[1], x2: O[0], y2: O[1], stroke: "#555", "stroke-width": 2.5 });
      el("line", { x1: B[0], y1: B[1], x2: Pp[0], y2: Pp[1], stroke: "#555", "stroke-width": 2.5 });
      el("circle", { cx: A[0], cy: A[1], r: 3, fill: COL.brown });
      el("circle", { cx: B[0], cy: B[1], r: 3, fill: COL.brown });
      tx([A[0] - 8, A[1] + 14], "A", { class: "q-pt", "text-anchor": "end" });
      tx([B[0] + 8, B[1] + 14], "B", { class: "q-pt" });
      tx([(A[0] + O[0]) / 2 - 6, (A[1] + O[1]) / 2 + 4], "i", { class: "rd-lab", "text-anchor": "end" });
      tx([(B[0] + Pp[0]) / 2 + 6, (B[1] + Pp[1]) / 2 + 4], "t", { class: "rd-lab" });
      // διεύθυνση μηδενισμού (πίσω σκόπευση)
      const Z0 = pr(0, Rp, i);
      el("line", { x1: O[0], y1: O[1], x2: Z0[0], y2: Z0[1], stroke: COL.red, "stroke-width": 2, "stroke-dasharray": "7 4", "marker-end": S.mk.red });
      tx([Z0[0] - 6, Z0[1] - 6], "0 (πίσω σκόπευση)", { class: "rd-lab", fill: COL.red, "text-anchor": "end" });
      // τόξο Hz στο οριζόντιο επίπεδο
      const rh = Math.min(D, 10) * 0.8, hzp = [];
      for (let q = 0; q <= 48; q++) { const u = q / 48 * a; hzp.push(pr(rh * Math.sin(u), rh * Math.cos(u), i)); }
      if (hz > 1) poly(hzp, { fill: "none", stroke: COL.red, "stroke-width": 2.5, "marker-end": S.mk.red });
      const hm = pr(rh * 1.2 * Math.sin(a / 2), rh * 1.2 * Math.cos(a / 2), i);
      tx(hm, "Hz", { class: "rd-lab", fill: COL.red, "text-anchor": "middle" });
      // D, κατακόρυφη συνιστώσα, S
      el("line", { x1: O[0], y1: O[1], x2: T[0], y2: T[1], stroke: COL.green, "stroke-width": 2.5, "stroke-dasharray": "8 4" });
      tx([(O[0] + T[0]) / 2, (O[1] + T[1]) / 2 + 16], "D", { class: "rd-lab", fill: COL.green, "text-anchor": "middle" });
      el("line", { x1: T[0], y1: T[1], x2: Pp[0], y2: Pp[1], stroke: COL.orange, "stroke-width": 2.5 });
      tx([T[0] + 8, (T[1] + Pp[1]) / 2 + 4], "S·cos z", { class: "rd-lab", fill: COL.orange });
      el("line", { x1: O[0], y1: O[1], x2: Pp[0], y2: Pp[1], stroke: COL.blue, "stroke-width": 3 });
      tx([(O[0] + Pp[0]) / 2 - 4, (O[1] + Pp[1]) / 2 - 8], "S", { class: "rd-lab", fill: COL.blue, "text-anchor": "end" });
      el("path", { d: `M${Pp[0]},${Pp[1] - 6} L${Pp[0] + 6},${Pp[1]} L${Pp[0]},${Pp[1] + 6} L${Pp[0] - 6},${Pp[1]} Z`, fill: "#ffd54f", stroke: "#333" });
      // ζενίθ και τόξο z στο κατακόρυφο επίπεδο
      const Zn = pr(0, 0, i + 18 / VE);
      el("line", { x1: O[0], y1: O[1], x2: Zn[0], y2: Zn[1], stroke: COL.dark, "stroke-width": 1.8, "marker-end": S.mk.dark });
      tx([Zn[0] + 5, Zn[1]], "Ζενίθ", { class: "rd-lab", fill: COL.dark });
      const rz = 4, zp = [], ua = Math.sin(a), ub = Math.cos(a);
      for (let q = 0; q <= 40; q++) { const u = q / 40 * z * GR; zp.push(pr(rz * Math.sin(u) * ua, rz * Math.sin(u) * ub, i + rz * Math.cos(u))); }
      poly(zp, { fill: "none", stroke: COL.purple, "stroke-width": 2.5, "marker-end": S.mk.purple });
      const zm = z / 2 * GR;
      tx(pr(rz * 1.35 * Math.sin(zm) * ua, rz * 1.35 * Math.sin(zm) * ub, i + rz * 1.35 * Math.cos(zm)), "z", { class: "q-alpha", fill: COL.purple, "text-anchor": "middle" });
      el("circle", { cx: O[0], cy: O[1], r: 5, fill: "#e07b00", stroke: "#333" });
      S.txt(8, H - 8, `Σχηματικό: τα ύψη είναι μεγεθυμένα ×${VE} για να διακρίνονται.`, { class: "rd-small" }, g);
      sHz.out.textContent = hz.toFixed(0); sZ.out.textContent = z.toFixed(1); sS.out.textContent = Sl.toFixed(1); sY.out.textContent = st.yaw;
      out.innerHTML = `
        <tr><td colspan="2"><b>Μετράει το όργανο</b></td></tr>
        <tr><td>Hz (οριζόντια διεύθυνση)</td><td><b style="color:${COL.red}">${G4(hz)}</b></td></tr>
        <tr><td>z (ζενίθια γωνία)</td><td><b style="color:${COL.purple}">${G4(z)}</b></td></tr>
        <tr><td>S (κεκλιμένο μήκος)</td><td><b style="color:${COL.blue}">${Sl.toFixed(3)} m</b></td></tr>
        <tr><td colspan="2"><b>Υπολογίζουμε</b> (i = ${i.toFixed(2)} m, t = ${t.toFixed(2)} m)</td></tr>
        <tr><td>β = Hz<sub>εμπρός</sub> − Hz<sub>πίσω</sub></td><td>${G4(hz)}</td></tr>
        <tr><td>D = S·sin z</td><td><b style="color:${COL.green}">${D.toFixed(3)} m</b></td></tr>
        <tr class="res"><td>Δh<sub>AB</sub> = S·cos z + i − t</td><td><b>${dh >= 0 ? "+" : "−"}${Math.abs(dh).toFixed(3)} m</b></td></tr>`;
    }
    upd();
  }

  /* =====================================================================
     ΤΑΧΥΜΕΤΡΙΑ (Φάση 5)
     ===================================================================== */
  const azim = (dE, dN) => mod400(Math.atan2(dE, dN) / GR);
  const f3 = x => x.toFixed(3);
  const sg3 = x => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(3);

  /* ---------- T1. Προσανατολισμός και πολικές συντεταγμένες ---------- */
  function buildPolar(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 560, cx = 280, cy = 290, K = 2.4;          // K: px ανά m
    const E0 = 476250.000, N0 = 4204180.000;                       // συντεταγμένες στάσης Σ
    const S = makeSvg(root, W, H);
    // κάνναβος και Βορράς
    for (let x = -100; x <= 100; x += 20) {
      S.el("line", { x1: cx + x * K, y1: 20, x2: cx + x * K, y2: H - 30, stroke: "#eef1f5" });
      S.el("line", { x1: 20, y1: cy - x * K, x2: W - 20, y2: cy - x * K, stroke: "#eef1f5" });
    }
    S.el("line", { x1: cx, y1: H - 30, x2: cx, y2: 18, stroke: COL.dark, "stroke-width": 2, "marker-end": S.mk.dark });
    S.el("line", { x1: 20, y1: cy, x2: W - 14, y2: cy, stroke: COL.dark, "stroke-width": 1.2, "marker-end": S.mk.dark });
    S.txt(cx + 8, 26, "N (Βορράς)", { class: "q-axis" });
    S.txt(W - 18, cy - 8, "E", { class: "q-axis", "text-anchor": "end" });
    const e = {};
    e.dial = S.el("g");
    e.prE = S.el("line", { stroke: "#e74c3c", "stroke-width": 5, opacity: 0.6, "stroke-linecap": "round" });
    e.prN = S.el("line", { stroke: "#2980b9", "stroke-width": 5, opacity: 0.6, "stroke-linecap": "round" });
    e.gE = S.el("line", { stroke: "#aaa", "stroke-dasharray": "4 4" });
    e.gN = S.el("line", { stroke: "#aaa", "stroke-dasharray": "4 4" });
    e.lE = S.txt(0, 0, "ΔE", { class: "q-dE", "text-anchor": "middle" });
    e.lN = S.txt(0, 0, "ΔN", { class: "q-dN" });
    e.aM = S.el("path", { fill: "none", stroke: COL.red, "stroke-width": 2, "stroke-dasharray": "5 3", "marker-end": S.mk.red });
    e.aP = S.el("path", { fill: "none", stroke: COL.blue, "stroke-width": 2, "stroke-dasharray": "5 3", "marker-end": S.mk.blue });
    e.hz = S.el("path", { fill: "none", stroke: COL.green, "stroke-width": 3.5, "marker-end": S.mk.green });
    e.lHz = S.txt(0, 0, "Hz", { class: "rd-lab", fill: COL.green, "text-anchor": "middle" });
    e.laM = S.txt(0, 0, "", { class: "rd-lab", fill: COL.red, "text-anchor": "middle" });
    e.laP = S.txt(0, 0, "", { class: "rd-lab", fill: COL.blue, "text-anchor": "middle" });
    e.M = S.el("line", { x1: cx, y1: cy, stroke: COL.red, "stroke-width": 3 });
    e.P = S.el("line", { x1: cx, y1: cy, stroke: COL.blue, "stroke-width": 3 });
    S.el("circle", { cx, cy, r: 6, fill: "#e07b00", stroke: "#333" });
    S.txt(cx - 10, cy + 20, "Σ", { class: "q-pt", "text-anchor": "end" });
    e.hM = S.el("path", { d: "", fill: "#f6b4ad", stroke: COL.red, "stroke-width": 2, class: "q-handle" });
    e.hP = S.el("circle", { r: 9, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
    e.tM = S.txt(0, 0, "M (μηδενισμός)", { class: "rd-lab", fill: COL.red });
    e.tP = S.txt(0, 0, "P", { class: "q-pt" });
    e.note = S.txt(10, H - 8, "", { class: "rd-small" });

    const st = { M: [-55, 70], P: [72, -38], rot: 0, anim: false };   // m από τη στάση (ΔE, ΔN)
    const out = h("tbody");
    const bOr = h("button", { class: "primary" }, "▶ Προσανατολισμός: Hz → γωνία διεύθυνσης");
    const bBack = h("button", {}, "↺ Αναγνώσεις οργάνου");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "rd-btns" }, bOr, bBack),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε το κόκκινο σημείο M (γνωστή στάση μηδενισμού) και το κίτρινο P (σημείο λεπτομέρειας). ",
        "Ο κύκλος του οργάνου έχει το 0 του στη διεύθυνση ΣM. Ο προσανατολισμός τον περιστρέφει κατά α", h("sub", {}, "ΣM"),
        ", ώστε το 0 να δείχνει τον Βορρά: τότε η ανάγνωση στο P είναι ήδη η γωνία διεύθυνσης α", h("sub", {}, "ΣP"), ".")));

    function animate(to) {
      if (st.anim) return; st.anim = true;
      const from = st.rot, t0 = performance.now(), T = 1400;
      const step = now => {
        const u = Math.min(1, (now - t0) / T), ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        st.rot = from + (to - from) * ease; upd();
        if (u < 1) requestAnimationFrame(step); else { st.anim = false; upd(); }
      };
      requestAnimationFrame(step);
    }
    bOr.onclick = () => animate(1); bBack.onclick = () => animate(0);
    let drag = null;
    const toM = ev => { const [x, y] = S.pt(ev); return [(x - cx) / K, (cy - y) / K]; };
    S.svg.addEventListener("pointerdown", ev => {
      if (st.anim) return;
      const q = toM(ev), dM = Math.hypot(q[0] - st.M[0], q[1] - st.M[1]), dP = Math.hypot(q[0] - st.P[0], q[1] - st.P[1]);
      drag = dM < dP ? "M" : "P"; S.svg.setPointerCapture(ev.pointerId); move(q);
    });
    S.svg.addEventListener("pointermove", ev => drag && move(toM(ev)));
    S.svg.addEventListener("pointerup", () => drag = null);
    function move(q) {
      if (Math.hypot(q[0], q[1]) < 8) return;
      q = q.map(v => Math.max(-105, Math.min(105, v)));
      st[drag] = q; upd();
    }

    function upd() {
      const [mE, mN] = st.M, [pE, pN] = st.P;
      const aM = azim(mE, mN), aP = azim(pE, pN), Hz = mod400(aP - aM), D = Math.hypot(pE, pN);
      const zero = aM * (1 - st.rot);                       // πού δείχνει το 0 του κύκλου
      const xm = cx + mE * K, ym = cy - mN * K, xp = cx + pE * K, yp = cy - pN * K;
      line(e.M, cx, cy, xm, ym); line(e.P, cx, cy, xp, yp);
      e.hM.setAttribute("d", `M${xm},${ym - 10} L${xm + 9},${ym + 7} L${xm - 9},${ym + 7} Z`);
      e.hP.setAttribute("cx", xp); e.hP.setAttribute("cy", yp);
      at(e.tM, xm + 12, ym - 8); at(e.tP, xp + 12, yp - 8);
      // κύκλος οργάνου (περιστρέφεται)
      const rd = 70;
      e.dial.innerHTML = "";
      S.el("circle", { cx, cy, r: rd, fill: "#fff", "fill-opacity": 0.85, stroke: "#555", "stroke-width": 1.5 }, e.dial);
      for (let a = 0; a < 400; a += 10) {
        const big = a % 100 === 0, [x0, y0] = P(cx, cy, zero + a, rd), [x1, y1] = P(cx, cy, zero + a, rd - (big ? 12 : 5));
        S.el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: big ? "#b3261e" : "#555", "stroke-width": big ? 2 : 0.8 }, e.dial);
        if (big) S.txt(...P(cx, cy, zero + a, rd - 22), String(a), { class: "rd-small", "text-anchor": "middle", dy: 4, fill: "#b3261e" }, e.dial);
      }
      const [zx, zy] = P(cx, cy, zero, rd + 2), [zl, zm] = P(cx, cy, zero - 4, rd + 14), [zr, zn] = P(cx, cy, zero + 4, rd + 14);
      S.el("path", { d: `M${zx},${zy} L${zl},${zm} L${zr},${zn} Z`, fill: "#b3261e" }, e.dial);
      // τόξα
      e.aM.setAttribute("d", st.rot < 0.999 ? arc(cx, cy, 105, 0, aM) : arc(cx, cy, 105, 0, aM));
      e.aP.setAttribute("d", arc(cx, cy, 140, 0, aP));
      e.hz.setAttribute("d", arc(cx, cy, 88, aM, aP));
      at(e.lHz, ...P(cx, cy, aM + Hz / 2, 88 + 16)); e.lHz.setAttribute("dy", 5);
      at(e.laM, ...P(cx, cy, aM / 2, 120)); e.laM.innerHTML = "α<tspan baseline-shift='sub' font-size='9'>ΣM</tspan>";
      at(e.laP, ...P(cx, cy, aP / 2, 156)); e.laP.innerHTML = "α<tspan baseline-shift='sub' font-size='9'>ΣP</tspan>";
      // προβολές ΔE, ΔN
      line(e.prE, cx, cy, xp, cy); line(e.prN, cx, cy, cx, yp); line(e.gE, xp, yp, xp, cy); line(e.gN, xp, yp, cx, yp);
      at(e.lE, (cx + xp) / 2, cy + (pN >= 0 ? 20 : -10)); at(e.lN, cx + (pE >= 0 ? -34 : 8), (cy + yp) / 2 + 4);
      const reading = mod400(aP - zero);
      e.note.textContent = st.rot > 0.999 ? `Προσανατολισμένος κύκλος: ανάγνωση στο P = α(ΣP) = ${reading.toFixed(4)} grad` :
        st.rot > 0 ? "Περιστροφή του κύκλου κατά α(ΣM)…" : `Κύκλος μηδενισμένος στο M: ανάγνωση στο P = Hz = ${reading.toFixed(4)} grad`;
      const dE = D * Math.sin(aP * GR), dN = D * Math.cos(aP * GR);
      out.innerHTML = `
        <tr><td>Σ (E, N)</td><td>${f3(E0)}, ${f3(N0)}</td></tr>
        <tr><td>M (E, N)</td><td>${f3(E0 + mE)}, ${f3(N0 + mN)}</td></tr>
        <tr><td>α<sub>ΣM</sub> = tan⁻¹(ΔE/ΔN) + διόρθωση</td><td><b style="color:${COL.red}">${G4(aM)}</b></td></tr>
        <tr><td>Hz<sub>P</sub> (ανάγνωση, μηδενισμός στο M)</td><td><b style="color:${COL.green}">${G4(Hz)}</b></td></tr>
        <tr class="res"><td>α<sub>ΣP</sub> = α<sub>ΣM</sub> + Hz<sub>P</sub> (mod 400)</td><td><b>${G4(aP)}</b></td></tr>
        <tr><td>D (οριζόντια απόσταση)</td><td>${f3(D)} m</td></tr>
        <tr><td>ΔE = D·sin α<sub>ΣP</sub></td><td style="color:#e74c3c"><b>${sg3(dE)}</b> m</td></tr>
        <tr><td>ΔN = D·cos α<sub>ΣP</sub></td><td style="color:#2980b9"><b>${sg3(dN)}</b> m</td></tr>
        <tr class="res"><td>E<sub>P</sub>, N<sub>P</sub></td><td><b>${f3(E0 + dE)}, ${f3(N0 + dN)}</b></td></tr>`;
    }
    upd();
  }

  /* ---------- T2. Υψόμετρο σημείου λεπτομέρειας ---------- */
  function buildTHeight(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 640, H = 430;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { HS: 152.340, i: 1.56, D: 12, dH: 1.2, t: 1.80, mode: "ground", bh: 6.5 };
    const sD = slider("Οριζόντια απόσταση D:", 4, 40, 0.5, st.D, "m");
    const sH = slider("", -8, 8, 0.1, st.dH, "m");
    sH.lab.firstChild.replaceWith(h("span", { html: "Έδαφος στο P: H<sub>P,εδ</sub> − H<sub>Σ</sub> =" }));
    const si = slider("Ύψος οργάνου i:", 1.2, 1.8, 0.01, st.i, "m");
    const stt = slider("Ύψος ράβδου t:", 0.5, 3, 0.01, st.t, "m");
    const sb = slider("Ύψος κτιρίου:", 3, 15, 0.1, st.bh, "m");
    const sel = h("select", {},
      h("option", { value: "ground" }, "Σημείο εδάφους (ράβδος με πρίσμα)"),
      h("option", { value: "roof" }, "Ακμή δώματος (χωρίς πρίσμα, t = 0)"),
      h("option", { value: "base" }, "Βάση τοίχου (ράβδος)"));
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, h("label", {}, "Είδος στόχου ", sel), sD.lab, sH.lab, si.lab, stt.lab, sb.lab),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Το υψόμετρο του σημείου βγαίνει από τη στάση: H", h("sub", {}, "P"), " = H", h("sub", {}, "Σ"),
        " + i + S·cos V − t. Στην ακμή δώματος σκοπεύουμε χωρίς πρίσμα, άρα t = 0 και το H", h("sub", {}, "P"), " είναι το υψόμετρο του δώματος.")));
    sel.onchange = () => { st.mode = sel.value; upd(); };
    for (const [s, k] of [[sD, "D"], [sH, "dH"], [si, "i"], [stt, "t"], [sb, "bh"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };

    function upd() {
      const { HS, i, D, dH, mode, bh } = st;
      const roof = mode === "roof", t = roof ? 0 : st.t;
      const hp = roof ? dH + bh : dH;                         // σημείο στόχου (πάνω στο οποίο μπαίνει η ράβδος ή η ακμή)
      const v = hp + t - i, Sl = Math.hypot(D, v), V = Math.atan2(D, v) / GR, HP = HS + i + Sl * Math.cos(V * GR) - t;
      const yTop = Math.max(i, hp + t, hp) + 1, yBot = Math.min(0, dH) - 2.2;      // κάτω: σπασμένη στάθμη αναφοράς
      const left = 150, right = 130, top = 60, bot = 30;
      const k = Math.min((W - left - right) / D, (H - top - bot) / (yTop - yBot), 40);
      const X = x => left + x * k, Y = y => top + (yTop - y) * k;
      g.innerHTML = "";
      const el = (tag, a) => S.el(tag, a, g), tx = (x, y, s, a = {}) => S.txt(x, y, s, a, g);
      const yd = Y(yBot) + 6;                                 // γραμμή αναφοράς (σχηματική)
      el("line", { x1: 20, y1: yd, x2: W - 20, y2: yd, stroke: "#777", "stroke-width": 1.5, "stroke-dasharray": "10 4" });
      tx(24, yd - 6, "Επιφάνεια αναφοράς H = 0 (Μ.Σ.Θ., σχηματικά πιο κοντά)", { class: "rd-small" });
      const xa = X(0), ya = Y(0), xi = X(0), yi = Y(i), xb = X(D), yb = Y(dH), yt = Y(hp), yp = Y(hp + t);
      // έδαφος
      el("path", { d: `M20,${ya} L${xa},${ya} C${xa + (xb - xa) * 0.4},${ya - 10} ${xa + (xb - xa) * 0.6},${yb + 10} ${xb - (roof || mode === "base" ? 20 : 0)},${yb} L${W - 20},${yb}`,
        fill: "none", stroke: COL.brown, "stroke-width": 2 });
      if (roof || mode === "base") {
        const bH = roof ? bh : 6;
        el("rect", { x: xb, y: Y(dH + bH), width: Math.min(110, W - 20 - xb), height: yb - Y(dH + bH), fill: "#e9e4dc", stroke: "#8a7f70", "stroke-width": 1.5 });
        tx(xb + 8, Y(dH + bH) + 16, "κτίριο", { class: "rd-small" });
      }
      // υψόμετρα από την επιφάνεια αναφοράς
      el("line", { x1: xa - 60, y1: yd, x2: xa - 60, y2: ya, stroke: COL.dark, "stroke-width": 1.3, "marker-end": S.mk.dark });
      tx(xa - 66, (yd + ya) / 2, `H<tspan baseline-shift='sub' font-size='9'>Σ</tspan> = ${HS.toFixed(3)}`, { class: "rd-lab", fill: COL.dark, "text-anchor": "end" });
      // τρίποδας
      el("line", { x1: xi, y1: yi, x2: xa - 10, y2: ya, stroke: "#555", "stroke-width": 2 });
      el("line", { x1: xi, y1: yi, x2: xa + 10, y2: ya, stroke: "#555", "stroke-width": 2 });
      el("rect", { x: xi - 7, y: yi - 9, width: 14, height: 12, fill: "#e07b00", stroke: "#333" });
      tx(xa - 4, ya + 18, "Σ", { class: "q-pt", "text-anchor": "end" });
      el("line", { x1: xa - 26, y1: ya, x2: xa - 26, y2: yi, stroke: "#333", "stroke-width": 1.2, "marker-end": S.mk.dark, "marker-start": S.mk.dark });
      tx(xa - 30, (ya + yi) / 2 + 4, "i", { class: "rd-lab", "text-anchor": "end" });
      // στόχος
      if (t > 0) {
        el("line", { x1: xb, y1: yt, x2: xb, y2: yp, stroke: "#555", "stroke-width": 2 });
        el("line", { x1: xb - 18, y1: yt, x2: xb - 18, y2: yp, stroke: "#333", "stroke-width": 1.2, "marker-end": S.mk.dark, "marker-start": S.mk.dark });
        tx(xb - 22, (yt + yp) / 2 + 4, "t", { class: "rd-lab", "text-anchor": "end" });
      }
      el("path", { d: `M${xb},${yp - 7} L${xb + 7},${yp} L${xb},${yp + 7} L${xb - 7},${yp} Z`, fill: roof ? "#fff" : "#ffd54f", stroke: "#333" });
      el("circle", { cx: xb, cy: yt, r: 4, fill: COL.purple });
      tx(xb + 8, yt + (roof ? -8 : 18), "P", { class: "q-pt" });
      const xr = Math.min(W - 40, xb + (roof ? 125 : 70));
      el("line", { x1: xr, y1: yd, x2: xr, y2: yt, stroke: COL.purple, "stroke-width": 1.5, "marker-end": S.mk.purple });
      el("line", { x1: xb, y1: yt, x2: xr + 6, y2: yt, stroke: COL.purple, "stroke-dasharray": "3 3" });
      tx(xr - 4, (yd + yt) / 2, `H<tspan baseline-shift='sub' font-size='9'>P</tspan> = ${HP.toFixed(3)}`, { class: "rd-lab", fill: COL.purple, "text-anchor": "end" });
      // ζενίθ, S, ορίζοντας
      el("line", { x1: xi, y1: yi, x2: xi, y2: 16, stroke: COL.dark, "stroke-width": 1.5, "marker-end": S.mk.dark });
      tx(xi + 6, 24, "Ζενίθ", { class: "rd-lab", fill: COL.dark });
      el("line", { x1: xi, y1: yi, x2: xb, y2: yi, stroke: COL.green, "stroke-width": 1.8, "stroke-dasharray": "7 4" });
      tx((xi + xb) / 2, yi + (v >= 0 ? 16 : -8), "D = S·sin V", { class: "rd-lab", fill: COL.green, "text-anchor": "middle" });
      el("line", { x1: xb + 3, y1: yi, x2: xb + 3, y2: yp, stroke: COL.orange, "stroke-width": 2.5 });
      if (Math.abs(yp - yi) > 14) tx(xb + 10, (yi + yp) / 2 + 4, "S·cos V", { class: "rd-lab", fill: COL.orange });
      el("line", { x1: xi, y1: yi, x2: xb, y2: yp, stroke: COL.blue, "stroke-width": 3 });
      tx((xi + xb) / 2, (yi + yp) / 2 - 10, "S", { class: "rd-lab", fill: COL.blue, "text-anchor": "middle" });
      el("path", { d: arc(xi, yi, 44, 0, V), fill: "none", stroke: COL.purple, "stroke-width": 2.2, "marker-end": S.mk.purple });
      const [lx, ly] = P(xi, yi, V / 2, 58);
      tx(lx, ly + 5, "V", { class: "q-alpha", fill: COL.purple, "text-anchor": "middle" });
      sD.out.textContent = D.toFixed(1); sH.out.textContent = dH.toFixed(1); si.out.textContent = i.toFixed(2);
      stt.out.textContent = roof ? "0 (χωρίς πρίσμα)" : t.toFixed(2); sb.out.textContent = bh.toFixed(1);
      stt.inp.disabled = roof; sb.lab.style.display = roof ? "" : "none";
      out.innerHTML = `
        <tr><td>V (ζενίθια, 1η θέση)</td><td><b>${G4(V)}</b></td></tr>
        <tr><td>S</td><td>${f3(Sl)} m</td></tr>
        <tr><td>S·cos V</td><td>${sg3(Sl * Math.cos(V * GR))} m</td></tr>
        <tr><td>i, t</td><td>${i.toFixed(2)} m, ${t.toFixed(2)} m</td></tr>
        <tr class="res"><td>H<sub>P</sub> = H<sub>Σ</sub> + i + S·cos V − t</td><td><b>${f3(HP)}</b> m</td></tr>`;
    }
    upd();
  }

  /* ---------- T3. Καμπυλότητα της Γης και διάθλαση ---------- */
  function buildCurv(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 330, R = 6371000;
    const S = makeSvg(root, W, H);
    const st = { D: 300, kap: 0.13 };
    const sD = slider("Απόσταση D:", 0, 1000, 10, st.D, "m");
    const sk = slider("Συντελεστής διάθλασης κ:", 0, 0.3, 0.01, st.kap);
    const out = h("tbody");
    const plotBox = h("div", { class: "rd-inset" });
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sD.lab, sk.lab), plotBox,
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Η καμπυλότητα «κατεβάζει» την επιφάνεια αναφοράς κάτω από τον ορίζοντα του οργάνου κατά D²/2R. ",
        "Η διάθλαση κάμπτει τη σκόπευση προς τη Γη και αναιρεί περίπου το 13% αυτού. Στο σχήμα οι καμπύλες είναι υπερβολικά μεγεθυμένες.")));
    const Pl = makeSvg(plotBox, 260, 170, "rd-inset-svg");
    const g = S.el("g"), gp = Pl.el("g");
    for (const [s, k] of [[sD, "D"], [sk, "kap"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };

    function upd() {
      const { D, kap } = st;
      const c = D * D / (2 * R), r = kap * c, tot = c - r;
      g.innerHTML = "";
      const el = (tag, a) => S.el(tag, a, g), tx = (x, y, s, a = {}) => S.txt(x, y, s, a, g);
      const x0 = 70, y0 = 90, xD = 450, A = 130 / (380 * 380);    // σχηματικό: το D σχεδιάζεται πάντα στην ίδια θέση
      const yLevel = x => y0 + A * (x - x0) ** 2, yRay = x => y0 + kap * A * (x - x0) ** 2;
      const pts = f => { const p = []; for (let x = 20; x <= W - 20; x += 6) p.push(`${x},${f(x)}`); return "M" + p.join(" L"); };
      el("path", { d: pts(yLevel), fill: "none", stroke: COL.brown, "stroke-width": 2.5 });
      tx(W - 24, yLevel(W - 24) - 8, "επιφάνεια αναφοράς (στάθμη)", { class: "rd-small", fill: COL.brown, "text-anchor": "end" });
      el("line", { x1: 20, y1: y0, x2: W - 20, y2: y0, stroke: COL.green, "stroke-width": 1.8, "stroke-dasharray": "7 4" });
      tx(W - 24, y0 - 6, "ορίζοντας του οργάνου", { class: "rd-small", fill: COL.green, "text-anchor": "end" });
      el("path", { d: pts(yRay).replace(/^M[^L]*L/, `M${x0},${y0} L`), fill: "none", stroke: COL.blue, "stroke-width": 2.5 });
      tx(x0 + 40, yRay(x0 + 40) + 20, "σκόπευση (καμπυλώνεται από τη διάθλαση)", { class: "rd-small", fill: COL.blue });
      // όργανο
      el("line", { x1: x0, y1: y0, x2: x0, y2: y0 + 46, stroke: "#555", "stroke-width": 2 });
      el("rect", { x: x0 - 7, y: y0 - 8, width: 14, height: 12, fill: "#e07b00", stroke: "#333" });
      tx(x0 - 10, y0 + 4, "Σ", { class: "q-pt", "text-anchor": "end" });
      // στο D
      const yl = yLevel(xD), yr = yRay(xD);
      el("line", { x1: xD, y1: y0 - 20, x2: xD, y2: yl + 20, stroke: "#999", "stroke-dasharray": "3 3" });
      el("line", { x1: xD + 14, y1: y0, x2: xD + 14, y2: yl, stroke: COL.red, "stroke-width": 2, "marker-end": S.mk.red, "marker-start": S.mk.red });
      tx(xD + 20, (y0 + yl) / 2 + 4, "D²/2R", { class: "rd-lab", fill: COL.red });
      if (yr - y0 > 6) {
        el("line", { x1: xD - 10, y1: y0, x2: xD - 10, y2: yr, stroke: COL.blue, "stroke-width": 2, "marker-end": S.mk.blue, "marker-start": S.mk.blue });
        tx(xD - 16, (y0 + yr) / 2 + 4, "κD²/2R", { class: "rd-lab", fill: COL.blue, "text-anchor": "end" });
      }
      el("line", { x1: x0, y1: H - 40, x2: xD, y2: H - 40, stroke: "#333", "stroke-width": 1.2, "marker-end": S.mk.dark, "marker-start": S.mk.dark });
      tx((x0 + xD) / 2, H - 46, `D = ${D} m`, { class: "rd-lab", "text-anchor": "middle" });
      tx(10, H - 10, "Σχηματικό: οι καμπύλες είναι μεγεθυμένες χιλιάδες φορές.", { class: "rd-small" });
      // διάγραμμα δh(D)
      gp.innerHTML = "";
      const pel = (tag, a) => Pl.el(tag, a, gp), ptx = (x, y, s, a = {}) => Pl.txt(x, y, s, a, gp);
      const px = d => 36 + d / 1000 * 210, maxH = (1 - kap) * 1e6 / (2 * R) * 1000, py = mm => 140 - mm / Math.max(maxH, 1) * 120;
      pel("line", { x1: 36, y1: 140, x2: 250, y2: 140, stroke: "#333" }); pel("line", { x1: 36, y1: 140, x2: 36, y2: 14, stroke: "#333" });
      for (const d of [0, 250, 500, 750, 1000]) { pel("line", { x1: px(d), y1: 140, x2: px(d), y2: 144, stroke: "#333" }); ptx(px(d), 156, String(d), { class: "rd-small", "text-anchor": "middle" }); }
      for (let mm = 0; mm <= maxH; mm += maxH > 40 ? 20 : 10) ptx(32, py(mm) + 4, String(mm), { class: "rd-small", "text-anchor": "end" });
      ptx(140, 168, "D (m)", { class: "rd-small", "text-anchor": "middle" });
      ptx(40, 12, "δh (mm)", { class: "rd-small" });
      const cp = []; for (let d = 0; d <= 1000; d += 20) cp.push(`${px(d)},${py((1 - kap) * d * d / (2 * R) * 1000)}`);
      pel("path", { d: "M" + cp.join(" L"), fill: "none", stroke: COL.purple, "stroke-width": 2 });
      pel("line", { x1: 36, y1: py(1), x2: 250, y2: py(1), stroke: COL.orange, "stroke-dasharray": "4 3" });
      pel("circle", { cx: px(D), cy: py(tot * 1000), r: 4.5, fill: COL.purple });
      sD.out.textContent = D; sk.out.textContent = kap.toFixed(2);
      const D1 = Math.sqrt(2 * R * 0.001 / (1 - kap));
      out.innerHTML = `
        <tr><td>Καμπυλότητα D²/2R</td><td>${(c * 1000).toFixed(1)} mm</td></tr>
        <tr><td>Διάθλαση −κD²/2R</td><td>−${(r * 1000).toFixed(1)} mm</td></tr>
        <tr class="res"><td>δh = (1 − κ)D²/2R</td><td><b>${(tot * 1000).toFixed(1)} mm</b></td></tr>
        <tr><td>Απόσταση όπου δh = 1 mm</td><td>${D1.toFixed(0)} m</td></tr>`;
    }
    upd();
  }

  /* ---------- T4. Ταχυμετρικό σκαρίφημα (ακτινωτή αποτύπωση) ---------- */
  function buildSketch(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 480, K = 3.2;                       // px ανά m
    const S0 = [210, 300], E0 = 476250.000, N0 = 4204180.000;
    const S = makeSvg(root, W, H);
    // φόντο: οικοδομικό τετράγωνο, κτίρια, κράσπεδο, φρεάτιο
    S.el("rect", { x: 0, y: 0, width: W, height: H, fill: "#fbfbf7" });
    S.el("path", { d: "M300,40 L560,40 L560,250 L300,250 Z", fill: "#f1efe8", stroke: "#b8b0a0", "stroke-width": 1 });
    const bld = [[[330, 70], [450, 70], [450, 150], [330, 150]], [[470, 90], [540, 90], [540, 210], [470, 210]], [[330, 175], [420, 175], [420, 230], [330, 230]]];
    for (const b of bld) S.el("path", { d: "M" + b.map(p => p.join(",")).join(" L") + " Z", fill: "#e2ddd3", stroke: "#6d6455", "stroke-width": 2 });
    S.el("path", { d: "M280,20 L280,270 L580,270", fill: "none", stroke: "#999", "stroke-width": 2 });
    S.el("path", { d: "M262,20 L262,288 L580,288", fill: "none", stroke: "#999", "stroke-width": 2, "stroke-dasharray": "2 0" });
    S.txt(150, 250, "οδός", { class: "rd-small" });
    S.el("circle", { cx: 150, cy: 380, r: 6, fill: "none", stroke: "#555", "stroke-width": 2 });
    S.txt(160, 384, "φρεάτιο", { class: "rd-small" });
    S.el("line", { x1: 24, y1: 64, x2: 24, y2: 18, stroke: COL.dark, "stroke-width": 2, "marker-end": S.mk.dark });
    S.txt(32, 30, "N", { class: "q-axis" });
    const M = [90, 120];
    const gR = S.el("g");
    S.el("line", { x1: S0[0], y1: S0[1], x2: M[0], y2: M[1], stroke: COL.red, "stroke-width": 2.5, "stroke-dasharray": "8 4" });
    S.el("path", { d: `M${M[0]},${M[1] - 10} L${M[0] + 9},${M[1] + 7} L${M[0] - 9},${M[1] + 7} Z`, fill: "#f6b4ad", stroke: COL.red, "stroke-width": 2 });
    S.txt(M[0] + 12, M[1] - 6, "M (μηδενισμός, Hz = 0)", { class: "rd-lab", fill: COL.red });
    S.el("circle", { cx: S0[0], cy: S0[1], r: 7, fill: "#e07b00", stroke: "#333", "stroke-width": 1.5 });
    S.txt(S0[0] - 12, S0[1] + 20, "Σ", { class: "q-pt", "text-anchor": "end" });
    const gP = S.el("g");
    S.txt(10, H - 8, "Κλικ σε γωνίες κτιρίων, κράσπεδα ή φρεάτια για να τα «σκοπεύσεις».", { class: "rd-small" });

    const pts = [];
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "rd-btns" },
        h("button", { onclick: () => { pts.length = 0; upd(); } }, "Καθαρισμός"),
        h("button", { onclick: () => { pts.length = 0; for (const b of bld) for (const p of b) pts.push(p.slice()); upd(); } }, "Γωνίες κτιρίων")),
      h("div", { class: "rd-scroll" }, h("table", { class: "tbl quad-tbl" },
        h("thead", {}, h("tr", {}, ...["Σημ.", "Hz (grad)", "D (m)", "E (m)", "N (m)"].map(s => h("th", {}, s)))), out)),
      h("p", { class: "muted small" }, "Από μία στάση μετράμε ακτινωτά όσα σημεία φαίνονται. Στο σκαρίφημα (κροκί) σημειώνουμε τον αριθμό κάθε σημείου, ",
        "ώστε στο γραφείο να ξέρουμε ποια σημεία ενώνονται (π.χ. οι γωνίες του ίδιου κτιρίου).")));
    S.svg.addEventListener("pointerdown", ev => {
      const [x, y] = S.pt(ev);
      if (Math.hypot(x - S0[0], y - S0[1]) < 10 || pts.length >= 14) return;
      pts.push([x, y]); upd();
    });
    const aSM = azim((M[0] - S0[0]) / K, (S0[1] - M[1]) / K);
    function upd() {
      gR.innerHTML = ""; gP.innerHTML = ""; out.innerHTML = "";
      pts.forEach((p, n) => {
        const dE = (p[0] - S0[0]) / K, dN = (S0[1] - p[1]) / K, D = Math.hypot(dE, dN), a = azim(dE, dN), Hz = mod400(a - aSM);
        S.el("line", { x1: S0[0], y1: S0[1], x2: p[0], y2: p[1], stroke: COL.blue, "stroke-width": 1, opacity: 0.6 }, gR);
        S.el("circle", { cx: p[0], cy: p[1], r: 4, fill: COL.blue }, gP);
        S.txt(p[0] + 6, p[1] - 6, String(n + 1), { class: "rd-lab", fill: COL.blue }, gP);
        out.append(h("tr", {}, h("td", {}, String(n + 1)), h("td", {}, Hz.toFixed(4)), h("td", {}, D.toFixed(3)),
          h("td", {}, (E0 + dE).toFixed(3)), h("td", {}, (N0 + dN).toFixed(3))));
      });
      if (!pts.length) out.append(h("tr", {}, h("td", { colspan: 5, class: "muted" }, "Δεν έχεις σκοπεύσει ακόμα σημεία.")));
    }
    upd();
  }

  /* =====================================================================
     ΟΔΕΥΣΗ (Φάση 4): θεμελιώδη προβλήματα και παράδειγμα
     ===================================================================== */
  const QCOL = { 1: "#2b9a5a", 2: "#2c6fbb", 3: "#d9822b", 4: "#8e44ad" };
  const quadOf = (dE, dN) => dN > 0 ? (dE >= 0 ? 1 : 2) : dN < 0 ? (dE >= 0 ? 4 : 3) : (dE >= 0 ? 1 : 3);
  const QADD = { 1: 0, 2: 400, 3: 200, 4: 200 };

  /** κοινό πλέγμα σε κάτοψη: επιστρέφει μετατροπές m ↔ px */
  function planGrid(S, W, H, cx, cy, K) {
    for (let x = -200; x <= 200; x += 20) {
      S.el("line", { x1: cx + x * K, y1: 0, x2: cx + x * K, y2: H, stroke: "#eef1f5" });
      S.el("line", { x1: 0, y1: cy - x * K, x2: W, y2: cy - x * K, stroke: "#eef1f5" });
    }
    return { X: e => cx + e * K, Y: n => cy - n * K, toM: (x, y) => [(x - cx) / K, (cy - y) / K] };
  }
  /** μικρός άξονας Βορρά σε σημείο */
  function northAt(S, par, x, y, len = 70, c = COL.dark) {
    S.el("line", { x1: x, y1: y + 14, x2: x, y2: y - len, stroke: c, "stroke-width": 1.4, "stroke-dasharray": "5 4", "marker-end": S.mk.dark }, par);
    S.txt(x + 4, y - len + 6, "N", { class: "rd-small", "font-weight": 700, fill: c }, par);
  }
  function dragPoints(S, st, keys, toM, upd, lim = 95) {
    let drag = null;
    S.svg.addEventListener("pointerdown", ev => {
      const q = toM(...S.pt(ev));
      drag = keys.reduce((b, k) => Math.hypot(q[0] - st[k][0], q[1] - st[k][1]) < Math.hypot(q[0] - st[b][0], q[1] - st[b][1]) ? k : b, keys[0]);
      S.svg.setPointerCapture(ev.pointerId); move(q);
    });
    S.svg.addEventListener("pointermove", ev => drag && move(toM(...S.pt(ev))));
    S.svg.addEventListener("pointerup", () => drag = null);
    function move(q) {
      q = q.map(v => Math.max(-lim, Math.min(lim, v)));
      if (keys.some(k => k !== drag && Math.hypot(q[0] - st[k][0], q[1] - st[k][1]) < 6)) return;
      st[drag] = q; upd();
    }
  }
  const handle = (S, x, y, fill, lab) => {
    S.el("circle", { cx: x, cy: y, r: 9, fill, stroke: "#111", "stroke-width": 2, class: "q-handle" });
    S.txt(x + 12, y - 10, lab, { class: "q-pt" });
  };

  /* ---------- 1ο Θεμελιώδες Πρόβλημα ---------- */
  function buildFP1(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 520, K = 2.2, cx = 250, cy = 280;
    const S = makeSvg(root, W, H);
    const gr = planGrid(S, W, H, cx, cy, K);
    S.el("line", { x1: 10, y1: cy, x2: W - 10, y2: cy, stroke: "#c9d2dc" });
    S.el("line", { x1: cx, y1: H - 10, x2: cx, y2: 10, stroke: "#c9d2dc" });
    const g = S.el("g");
    const EA = 476650.218, NA = 4205702.447;
    const st = { a: 79.6605, D: 90 };
    const sa = slider("Γωνία διεύθυνσης α<sub>AB</sub>:", 0, 399.99, 0.01, st.a, "grad");
    sa.lab.firstChild.replaceWith(h("span", { html: "Γωνία διεύθυνσης α<sub>AB</sub>:" }));
    const sD = slider("Οριζόντια απόσταση D<sub>AB</sub>:", 10, 100, 0.1, st.D, "m");
    sD.lab.firstChild.replaceWith(h("span", { html: "Απόσταση D<sub>AB</sub> (ΕΓΣΑ 87):" }));
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("p", { class: "small" }, h("b", {}, "Δίνονται: "), "A (E, N), α", h("sub", {}, "AB"), ", D", h("sub", {}, "AB"), ". ", h("b", {}, "Ζητείται: "), "B (E, N)."),
      h("div", { class: "quad-ctrl" }, sa.lab, sD.lab), h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε το σημείο B. Το ορθογώνιο τρίγωνο έχει υποτείνουσα D και κάθετες ΔE (κόκκινο) και ΔN (μπλε)· η γωνία στο A, ανάμεσα στον Βορρά και στην AB, είναι η α.")));
    sa.inp.oninput = () => { st.a = +sa.inp.value; upd(); };
    sD.inp.oninput = () => { st.D = +sD.inp.value; upd(); };
    S.svg.addEventListener("pointerdown", ev => { S.svg.setPointerCapture(ev.pointerId); fromPtr(ev); S.svg.onpointermove = fromPtr; });
    S.svg.addEventListener("pointerup", () => S.svg.onpointermove = null);
    function fromPtr(ev) {
      const [e, n] = gr.toM(...S.pt(ev)); const D = Math.hypot(e, n);
      if (D < 5) return; st.a = azim(e, n); st.D = Math.max(10, Math.min(100, D)); upd();
    }
    function upd() {
      const { a, D } = st, dE = D * Math.sin(a * GR), dN = D * Math.cos(a * GR), q = quadOf(dE, dN);
      const xb = gr.X(dE), yb = gr.Y(dN);
      g.innerHTML = "";
      const el = (t, at_) => S.el(t, at_, g);
      el("path", { d: `M${cx},${cy} L${xb},${cy} L${xb},${yb} Z`, fill: QCOL[q], "fill-opacity": 0.1 });
      el("line", { x1: cx, y1: cy, x2: xb, y2: cy, stroke: "#e74c3c", "stroke-width": 5, opacity: 0.8, "stroke-linecap": "round" });
      el("line", { x1: xb, y1: cy, x2: xb, y2: yb, stroke: "#2980b9", "stroke-width": 5, opacity: 0.8, "stroke-linecap": "round" });
      S.txt((cx + xb) / 2, cy + (dN >= 0 ? 20 : -10), `ΔE = D·sin α`, { class: "q-dE", "text-anchor": "middle" }, g);
      S.txt(xb + (dE >= 0 ? 8 : -8), (cy + yb) / 2 + 5, `ΔN = D·cos α`, { class: "q-dN", "text-anchor": dE >= 0 ? "start" : "end" }, g);
      northAt(S, g, cx, cy, 120);
      el("path", { d: arc(cx, cy, 55, 0, a), fill: "none", stroke: COL.purple, "stroke-width": 2.5, "marker-end": S.mk.purple });
      S.txt(...P(cx, cy, a / 2, 72), "α", { class: "q-alpha", fill: COL.purple, "text-anchor": "middle", dy: 6 }, g);
      el("line", { x1: cx, y1: cy, x2: xb, y2: yb, stroke: "#111", "stroke-width": 3 });
      S.txt((cx + xb) / 2 - 10, (cy + yb) / 2 - 8, "D", { class: "rd-lab", "text-anchor": "end" }, g);
      el("circle", { cx, cy, r: 6, fill: "#e07b00", stroke: "#333" });
      S.txt(cx - 10, cy + 18, "A", { class: "q-pt", "text-anchor": "end" }, g);
      el("circle", { cx: xb, cy: yb, r: 9, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
      S.txt(xb + 12, yb - 10, "B", { class: "q-pt" }, g);
      sa.out.textContent = a.toFixed(4); sD.out.textContent = D.toFixed(3);
      sa.inp.value = a; sD.inp.value = D;
      out.innerHTML = `
        <tr><td>A (E, N)</td><td>${f3(EA)}, ${f3(NA)}</td></tr>
        <tr><td>ΔE = D·sin α</td><td style="color:#e74c3c"><b>${sg3(dE)}</b> m</td></tr>
        <tr><td>ΔN = D·cos α</td><td style="color:#2980b9"><b>${sg3(dN)}</b> m</td></tr>
        <tr><td>Πρόσημα (sin α / cos α)</td><td style="color:${QCOL[q]}"><b>${q}ο τεταρτημόριο</b> (${dE >= 0 ? "+" : "−"} / ${dN >= 0 ? "+" : "−"})</td></tr>
        <tr class="res"><td>E<sub>B</sub> = E<sub>A</sub> + ΔE</td><td><b>${f3(EA + dE)}</b></td></tr>
        <tr class="res"><td>N<sub>B</sub> = N<sub>A</sub> + ΔN</td><td><b>${f3(NA + dN)}</b></td></tr>`;
    }
    upd();
  }

  /* ---------- 2ο Θεμελιώδες Πρόβλημα ---------- */
  function buildFP2(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 520, K = 2.2, cx = 280, cy = 260;
    const S = makeSvg(root, W, H);
    const gr = planGrid(S, W, H, cx, cy, K);
    const g = S.el("g");
    const E0 = 476500, N0 = 4205700;
    const st = { A: [-50, -30], B: [60, 55] };
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("p", { class: "small" }, h("b", {}, "Δίνονται: "), "A (E, N), B (E, N). ", h("b", {}, "Ζητούνται: "), "D", h("sub", {}, "AB"), ", α", h("sub", {}, "AB"), " (και α", h("sub", {}, "BA"), ")."),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε τα A και B. Η αριθμομηχανή δίνει tan⁻¹ πάντα στο [−100, +100]", h("sup", {}, "g"),
        ". Τα πρόσημα των ΔE, ΔN (το τεταρτημόριο γύρω από το A) δείχνουν τι πρέπει να προσθέσουμε.")));
    dragPoints(S, st, ["A", "B"], gr.toM, upd, 110);
    function upd() {
      const [ae, an] = st.A, [be, bn] = st.B, dE = be - ae, dN = bn - an;
      const D = Math.hypot(dE, dN), a = azim(dE, dN), q = quadOf(dE, dN);
      const t = Math.abs(dN) < 1e-9 ? (dE > 0 ? 100 : -100) : Math.atan(dE / dN) / GR;
      const xa = gr.X(ae), ya = gr.Y(an), xb = gr.X(be), yb = gr.Y(bn);
      g.innerHTML = "";
      const el = (t_, at_) => S.el(t_, at_, g);
      // τεταρτημόρια γύρω από το A
      for (const k of [1, 2, 3, 4]) {
        const from = { 1: 0, 4: 100, 3: 200, 2: 300 }[k];
        const [x0, y0] = P(xa, ya, from, 60), [x1, y1] = P(xa, ya, from + 100, 60);
        el("path", { d: `M${xa},${ya} L${x0},${y0} A60,60 0 0 1 ${x1},${y1} Z`, fill: QCOL[k], "fill-opacity": k === q ? 0.3 : 0.07 });
        S.txt(...P(xa, ya, from + 50, 40), `${k}ο`, { class: "rd-small", "text-anchor": "middle", dy: 4, fill: QCOL[k], "font-weight": 700 }, g);
      }
      el("line", { x1: xa - 70, y1: ya, x2: xa + 70, y2: ya, stroke: "#999" });
      northAt(S, g, xa, ya, 95);
      el("line", { x1: xa, y1: ya, x2: xb, y2: ya, stroke: "#e74c3c", "stroke-width": 5, opacity: 0.75, "stroke-linecap": "round" });
      el("line", { x1: xb, y1: ya, x2: xb, y2: yb, stroke: "#2980b9", "stroke-width": 5, opacity: 0.75, "stroke-linecap": "round" });
      S.txt((xa + xb) / 2, ya + (dN >= 0 ? 20 : -10), `ΔE ${dE >= 0 ? "+" : "−"}`, { class: "q-dE", "text-anchor": "middle" }, g);
      S.txt(xb + (dE >= 0 ? 8 : -8), (ya + yb) / 2 + 5, `ΔN ${dN >= 0 ? "+" : "−"}`, { class: "q-dN", "text-anchor": dE >= 0 ? "start" : "end" }, g);
      el("path", { d: arc(xa, ya, 78, 0, a), fill: "none", stroke: COL.purple, "stroke-width": 2.5, "marker-end": S.mk.purple });
      S.txt(...P(xa, ya, a / 2, 94), "α<tspan baseline-shift='sub' font-size='10'>AB</tspan>", { class: "rd-lab", fill: COL.purple, "text-anchor": "middle", dy: 5 }, g);
      // α_BA στο B
      northAt(S, g, xb, yb, 60);
      const aba = mod400(a + 200);
      el("path", { d: arc(xb, yb, 34, 0, aba), fill: "none", stroke: COL.orange, "stroke-width": 2, "marker-end": S.mk.orange });
      S.txt(...P(xb, yb, aba / 2, 50), "α<tspan baseline-shift='sub' font-size='10'>BA</tspan>", { class: "rd-lab", fill: COL.orange, "text-anchor": "middle", dy: 5 }, g);
      el("line", { x1: xa, y1: ya, x2: xb, y2: yb, stroke: "#111", "stroke-width": 3 });
      S.txt((xa + xb) / 2 - 8, (ya + yb) / 2 - 8, "D", { class: "rd-lab", "text-anchor": "end" }, g);
      el("circle", { cx: xa, cy: ya, r: 9, fill: "#f6b4ad", stroke: "#111", "stroke-width": 2, class: "q-handle" });
      S.txt(xa - 12, ya + 22, "A", { class: "q-pt", "text-anchor": "end" }, g);
      el("circle", { cx: xb, cy: yb, r: 9, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
      S.txt(xb + 12, yb - 10, "B", { class: "q-pt" }, g);
      out.innerHTML = `
        <tr><td>A (E, N)</td><td>${f3(E0 + ae)}, ${f3(N0 + an)}</td></tr>
        <tr><td>B (E, N)</td><td>${f3(E0 + be)}, ${f3(N0 + bn)}</td></tr>
        <tr><td>ΔE = E<sub>B</sub> − E<sub>A</sub></td><td style="color:#e74c3c"><b>${sg3(dE)}</b> m</td></tr>
        <tr><td>ΔN = N<sub>B</sub> − N<sub>A</sub></td><td style="color:#2980b9"><b>${sg3(dN)}</b> m</td></tr>
        <tr class="res"><td>D<sub>AB</sub> = √(ΔE² + ΔN²)</td><td><b>${f3(D)}</b> m</td></tr>
        <tr><td>tan⁻¹(ΔE / ΔN)</td><td>${t.toFixed(4)}<sup>g</sup></td></tr>
        <tr><td>Τεταρτημόριο → διόρθωση</td><td style="color:${QCOL[q]}"><b>${q}ο → +${QADD[q]}<sup>g</sup></b></td></tr>
        <tr class="res"><td>α<sub>AB</sub></td><td><b>${G4(a)}</b></td></tr>
        <tr><td>α<sub>BA</sub> = α<sub>AB</sub> ± 200<sup>g</sup></td><td style="color:${COL.orange}"><b>${G4(aba)}</b></td></tr>`;
    }
    upd();
  }

  /* ---------- 3ο Θεμελιώδες Πρόβλημα (μεταφορά γωνίας διεύθυνσης) ---------- */
  function buildFP3(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 520, K = 2.2, cx = 280, cy = 270;
    const S = makeSvg(root, W, H);
    const gr = planGrid(S, W, H, cx, cy, K);
    const g = S.el("g");
    const st = { A: [-85, 40], B: [0, -10], C: [80, 55], step: 4 };
    const out = h("tbody");
    const steps = ["Σημεία", "① α_AB", "② α_BA = α_AB ± 200", "③ + β_B", "④ α_BC"];
    const bStep = h("button", { class: "primary" }, "▶ Επόμενο βήμα");
    const bAll = h("button", {}, "Όλα τα βήματα");
    const info = h("p", { class: "small rd-step" });
    root.append(h("div", { class: "quad-panel" },
      h("p", { class: "small" }, h("b", {}, "Δίνονται: "), "α", h("sub", {}, "AB"), " και η γωνία β", h("sub", {}, "B"),
        " που μετρήθηκε στο B (δεξιόστροφα από το A προς το C). ", h("b", {}, "Ζητείται: "), "α", h("sub", {}, "BC"), "."),
      h("div", { class: "rd-btns" }, bStep, bAll), info,
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε τα A, B, C. Στο B ο Βορράς είναι παράλληλος με τον Βορρά στο A, γι' αυτό η α", h("sub", {}, "BA"),
        " διαφέρει από την α", h("sub", {}, "AB"), " κατά 200", h("sup", {}, "g"), ".")));
    bStep.onclick = () => { st.step = (st.step + 1) % 5; upd(); };
    bAll.onclick = () => { st.step = 4; upd(); };
    dragPoints(S, st, ["A", "B", "C"], gr.toM, upd, 115);
    function upd() {
      const [A, B, C] = [st.A, st.B, st.C].map(p => [gr.X(p[0]), gr.Y(p[1])]);
      const aAB = azim(st.B[0] - st.A[0], st.B[1] - st.A[1]), aBA = mod400(aAB + 200);
      const aBC = azim(st.C[0] - st.B[0], st.C[1] - st.B[1]), beta = mod400(aBC - aBA);
      const s = st.step;
      g.innerHTML = "";
      const el = (t_, at_) => S.el(t_, at_, g), lab = (p, txt_, c, a_ = {}) => S.txt(p[0], p[1], txt_, { class: "rd-lab", fill: c, "text-anchor": "middle", dy: 5, ...a_ }, g);
      el("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#111", "stroke-width": 3, "marker-end": S.mk.dark });
      el("line", { x1: B[0], y1: B[1], x2: C[0], y2: C[1], stroke: "#111", "stroke-width": 3, "marker-end": S.mk.dark });
      if (s >= 1) {
        northAt(S, g, A[0], A[1], 80);
        el("path", { d: arc(A[0], A[1], 46, 0, aAB), fill: "none", stroke: COL.purple, "stroke-width": 2.5, "marker-end": S.mk.purple });
        lab(P(A[0], A[1], aAB / 2, 62), "α<tspan baseline-shift='sub' font-size='10'>AB</tspan>", COL.purple);
      }
      if (s >= 2) {
        northAt(S, g, B[0], B[1], 90);
        const [ex, ey] = P(B[0], B[1], aBA, 70);
        el("line", { x1: B[0], y1: B[1], x2: ex, y2: ey, stroke: COL.orange, "stroke-width": 1.5, "stroke-dasharray": "5 3" });
        el("path", { d: arc(B[0], B[1], 30, 0, aBA), fill: "none", stroke: COL.orange, "stroke-width": 2.2, "marker-end": S.mk.orange });
        lab(P(B[0], B[1], aBA / 2, 18), "α<tspan baseline-shift='sub' font-size='9'>BA</tspan>", COL.orange, { "font-size": 11 });
      }
      if (s >= 3) {
        el("path", { d: arc(B[0], B[1], 56, aBA, aBA + beta), fill: "none", stroke: COL.green, "stroke-width": 3, "marker-end": S.mk.green });
        lab(P(B[0], B[1], aBA + beta / 2, 72), "β<tspan baseline-shift='sub' font-size='10'>B</tspan>", COL.green);
      }
      if (s >= 4) {
        el("path", { d: arc(B[0], B[1], 104, 0, aBC), fill: "none", stroke: COL.blue, "stroke-width": 2.5, "marker-end": S.mk.blue });
        lab(P(B[0], B[1], aBC / 2, 120), "α<tspan baseline-shift='sub' font-size='10'>BC</tspan>", COL.blue);
      }
      for (const [p, n, f] of [[A, "A", "#f6b4ad"], [B, "B", "#e07b00"], [C, "C", "#ffd54f"]]) {
        el("circle", { cx: p[0], cy: p[1], r: 9, fill: f, stroke: "#111", "stroke-width": 2, class: "q-handle" });
        S.txt(p[0] + 12, p[1] + 20, n, { class: "q-pt" }, g);
      }
      const sum = aBA + beta, raw = aAB + beta;
      info.innerHTML = `<b>Βήμα ${s}/4:</b> ` + ["Τα σημεία της όδευσης· πάτα «Επόμενο βήμα».",
        "Η γωνία διεύθυνσης α<sub>AB</sub> μετριέται στο A από τον Βορρά δεξιόστροφα.",
        "Στο B φέρνουμε παράλληλο Βορρά. Η αντίστροφη διεύθυνση BA απέχει 200<sup>g</sup>: α<sub>BA</sub> = α<sub>AB</sub> ± 200<sup>g</sup>.",
        "Από τη διεύθυνση BA στρέφουμε δεξιόστροφα κατά τη μετρημένη γωνία β<sub>B</sub> και φτάνουμε στη διεύθυνση BC.",
        "Άρα α<sub>BC</sub> = α<sub>BA</sub> + β<sub>B</sub> = α<sub>AB</sub> + β<sub>B</sub> ± 200<sup>g</sup> (mod 400<sup>g</sup>)."][s];
      out.innerHTML = `
        <tr><td>α<sub>AB</sub></td><td style="color:${COL.purple}"><b>${G4(aAB)}</b></td></tr>
        <tr><td>β<sub>B</sub> (μετρημένη)</td><td style="color:${COL.green}"><b>${G4(beta)}</b></td></tr>
        <tr><td>α<sub>AB</sub> + β<sub>B</sub></td><td>${G4(raw)}</td></tr>
        <tr><td>${raw >= 200 ? "− 200<sup>g</sup> (το άθροισμα ≥ 200)" : "+ 200<sup>g</sup> (το άθροισμα &lt; 200)"}</td><td>${G4(raw >= 200 ? raw - 200 : raw + 200)}${(raw >= 200 ? raw - 200 : raw + 200) >= 400 ? " → −400" : ""}</td></tr>
        <tr class="res"><td>α<sub>BC</sub></td><td><b>${G4(aBC)}</b></td></tr>`;
      void sum;
    }
    upd();
  }

  /* ---------- Σχήμα παραδείγματος όδευσης ---------- */
  const TRAV_EX = {"names": ["T1", "T2", "Σ1", "Σ2", "Σ3", "T3", "T4"], "T1": [476512.34, 4205880.125], "T2": [476650.218, 4205702.447], "T3": [477160.905, 4205640.332], "T4": [477230.115, 4205790.66], "coords": {"T2": [476650.218, 4205702.447], "Σ1": [476781.599, 4205745.914], "Σ2": [476905.375, 4205668.207], "Σ3": [477034.851, 4205711.59], "T3": [477160.905, 4205640.332]}, "betas": [121.6729, 256.0298, 143.7277, 253.3368, 94.7118], "D": [138.386, 146.15, 136.552, 144.804], "a0": 157.9873, "aE": 27.4678, "wb": 0.0015};
  function buildTravEx(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 400, d = TRAV_EX;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { mode: "corr", X: 2000 };
    const sel = h("select", {},
      h("option", { value: "corr" }, "Επίλυση (διορθωμένη όδευση)"),
      h("option", { value: "raw" }, "Χωρίς διορθώσεις: σφάλμα κλεισίματος"));
    const out = h("div", { class: "small" });
    root.append(h("div", { class: "quad-panel" }, h("label", {}, "Εμφάνιση ", sel), out,
      h("p", { class: "muted small" }, "Με τις μετρημένες γωνίες και αποστάσεις, χωρίς διορθώσεις, η όδευση δεν καταλήγει ακριβώς στο T3 ούτε στη σωστή διεύθυνση προς το T4. ",
        "Στο σχήμα οι αποκλίσεις είναι μεγεθυμένες ×2000.")));
    sel.onchange = () => { st.mode = sel.value; upd(); };
    // όδευση χωρίς διορθώσεις (με k)
    const raw = [d.T2]; let a = d.a0;
    d.betas.forEach((b, i) => { a = mod400(a + b + 200); if (i < d.D.length) { const p = raw[raw.length - 1]; raw.push([p[0] + d.D[i] * Math.sin(a * GR), p[1] + d.D[i] * Math.cos(a * GR)]); } });
    const aRaw = a;
    const corr = ["T2", "Σ1", "Σ2", "Σ3", "T3"].map(n => d.coords[n]);
    const all = [d.T1, d.T4, ...corr];
    const minE = Math.min(...all.map(p => p[0])), maxE = Math.max(...all.map(p => p[0]));
    const minN = Math.min(...all.map(p => p[1])), maxN = Math.max(...all.map(p => p[1]));
    const K = Math.min((W - 80) / (maxE - minE), (H - 80) / (maxN - minN));
    const ox = (W - K * (maxE - minE)) / 2, oy = (H - K * (maxN - minN)) / 2;
    const X = p => [ox + (p[0] - minE) * K, H - oy - (p[1] - minN) * K];
    function upd() {
      g.innerHTML = "";
      const el = (t_, at_) => S.el(t_, at_, g);
      const pts = st.mode === "raw" ? raw.map((p, i) => [corr[i][0] + (p[0] - corr[i][0]) * st.X, corr[i][1] + (p[1] - corr[i][1]) * st.X]) : corr;
      const P2 = pts.map(X), T1 = X(d.T1), T4 = X(d.T4), T2 = X(d.T2), T3 = X(d.T3);
      for (const [p, q] of [[T1, T2], [T3, T4]]) {
        el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: COL.dark, "stroke-width": 5, opacity: 0.25 });
        el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: COL.dark, "stroke-width": 1.5, "marker-end": S.mk.dark });
      }
      el("path", { d: "M" + P2.map(p => p.join(",")).join(" L"), fill: "none", stroke: st.mode === "raw" ? COL.red : COL.blue, "stroke-width": 2.5 });
      if (st.mode === "raw") {
        const end = P2[P2.length - 1], [ex, ey] = P(end[0], end[1], d.aE + sgnd(aRaw - d.aE) * 20000, 80);
        el("line", { x1: end[0], y1: end[1], x2: ex, y2: ey, stroke: COL.red, "stroke-width": 1.5, "stroke-dasharray": "5 3", "marker-end": S.mk.red });
        S.txt(ex + 6, ey, "α'(T3T4), γωνιακό σφάλμα ×20000", { class: "rd-small", fill: COL.red }, g);
        el("line", { x1: end[0], y1: end[1], x2: T3[0], y2: T3[1], stroke: COL.orange, "stroke-width": 2, "marker-end": S.mk.orange });
        S.txt((end[0] + T3[0]) / 2 + 8, (end[1] + T3[1]) / 2, "w", { class: "rd-lab", fill: COL.orange }, g);
      }
      const names = ["T2", "Σ1", "Σ2", "Σ3", st.mode === "raw" ? "T3'" : ""];
      P2.forEach((p, i) => { el("circle", { cx: p[0], cy: p[1], r: 5, fill: i === 0 ? "#12324f" : "#fff", stroke: "#12324f", "stroke-width": 2 });
        if (names[i]) S.txt(p[0] + 8, p[1] - 8, names[i], { class: "rd-lab" }, g); });
      for (const [p, n] of [[T1, "T1"], [T4, "T4"], [T3, "T3"]]) {
        el("path", { d: `M${p[0]},${p[1] - 8} L${p[0] + 7},${p[1] + 5} L${p[0] - 7},${p[1] + 5} Z`, fill: "#12324f" });
        S.txt(p[0] + 9, p[1] + 16, n, { class: "rd-lab" }, g);
      }
      const end = raw[raw.length - 1], wx = d.T3[0] - end[0], wy = d.T3[1] - end[1];
      out.innerHTML = st.mode === "raw"
        ? `Χωρίς διορθώσεις: α'<sub>T3T4</sub> = ${G4(aRaw)} αντί ${G4(d.aE)} (w<sub>β</sub> = ${(d.wb * 1e4).toFixed(0)} cc). Το τελικό σημείο T3' απέχει ${(Math.hypot(wx, wy) * 1000).toFixed(0)} mm από το T3 (από τα γωνιακά και τα γραμμικά σφάλματα μαζί).`
        : "Η διορθωμένη όδευση ξεκινά από το T2 και καταλήγει ακριβώς στο T3, με τελική γωνία διεύθυνσης ίση με τη γνωστή α<sub>T3T4</sub>.";
    }
    upd();
  }

  /* =====================================================================
     ΦΑΣΗ 1: τύποι οδεύσεων, συντελεστής κλίμακας, σφάλμα κέντρωσης, ορατότητα
     ===================================================================== */

  /* ---------- Τύποι οδεύσεων ---------- */
  function buildTypes(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 340;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const sel = h("select", {},
      h("option", { value: "dep" }, "Εξαρτημένη όδευση"),
      h("option", { value: "closed" }, "Κλειστή όδευση"),
      h("option", { value: "open" }, "Ανοιχτή (ελεύθερη) όδευση"));
    const out = h("tbody"), desc = h("p", { class: "small" });
    root.append(h("div", { class: "quad-panel" }, h("label", {}, "Τύπος ", sel), desc,
      h("table", { class: "tbl quad-tbl" }, h("thead", {}, h("tr", {}, h("th", {}, "Έλεγχος"), h("th", {}, "Δυνατός;"))), out)));
    sel.onchange = upd;
    const T = { dep: {
        pts: [[60, 70, "T1", 1], [110, 210, "T2", 1], [210, 150, "Σ1", 0], [310, 240, "Σ2", 0], [410, 170, "Σ3", 0], [500, 230, "T3", 1], [560, 90, "T4", 1]],
        ori: [[0, 1], [5, 6]], legs: [1, 2, 3, 4, 5],
        desc: "Ξεκινά από γνωστό σημείο (T2) με γνωστή διεύθυνση (T1→T2) και καταλήγει σε άλλο γνωστό σημείο (T3) με γνωστή διεύθυνση (T3→T4). Είναι η όδευση της άσκησης.",
        chk: [["Γωνιακό σφάλμα κλεισίματος w<sub>β</sub>", 1], ["Γραμμικό σφάλμα w<sub>x</sub>, w<sub>y</sub>", 1], ["Υψομετρικό σφάλμα w<sub>h</sub>", 1], ["Σφάλμα κλίμακας ή προσανατολισμού του δικτύου", 1]] },
      closed: {
        pts: [[300, 40, "T1", 1], [300, 130, "T2", 1], [450, 170, "Σ1", 0], [420, 290, "Σ2", 0], [230, 300, "Σ3", 0], [170, 190, "Σ4", 0]],
        ori: [[0, 1]], legs: [1, 2, 3, 4, 5], close: true,
        desc: "Ξεκινά και καταλήγει στο ίδιο γνωστό σημείο (T2). Ελέγχει τις μετρήσεις, αλλά όχι ένα σφάλμα στις συντεταγμένες ή στον προσανατολισμό του T1, T2: όλη η όδευση θα μετατοπιστεί ή θα στραφεί μαζί του.",
        chk: [["Γωνιακό σφάλμα κλεισίματος (Σβ = (n ± 2)·200<sup>g</sup>)", 1], ["Γραμμικό σφάλμα (ΣΔx = ΣΔy = 0)", 1], ["Υψομετρικό σφάλμα (ΣΔh = 0)", 1], ["Σφάλμα κλίμακας ή προσανατολισμού του δικτύου", 0]] },
      open: {
        pts: [[60, 70, "T1", 1], [110, 210, "T2", 1], [210, 150, "Σ1", 0], [310, 240, "Σ2", 0], [410, 170, "Σ3", 0], [500, 230, "Σ4", 0]],
        ori: [[0, 1]], legs: [1, 2, 3, 4],
        desc: "Ξεκινά από γνωστό σημείο και καταλήγει σε άγνωστο. Δεν υπάρχει κανένας έλεγχος: ένα λάθος σε μία γωνία ή απόσταση περνά απαρατήρητο. Αποφεύγεται, ή μετριέται δύο φορές.",
        chk: [["Γωνιακό σφάλμα κλεισίματος", 0], ["Γραμμικό σφάλμα", 0], ["Υψομετρικό σφάλμα", 0], ["Σφάλμα κλίμακας ή προσανατολισμού του δικτύου", 0]] } };
    function upd() {
      const t = T[sel.value];
      g.innerHTML = "";
      const el = (n, a) => S.el(n, a, g);
      for (const [a, b] of t.ori) { const p = t.pts[a], q = t.pts[b];
        el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: COL.dark, "stroke-width": 6, opacity: 0.2 });
        el("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: COL.dark, "stroke-width": 1.5, "stroke-dasharray": "6 4", "marker-end": S.mk.dark }); }
      const L = t.legs.map(i => t.pts[i]); if (t.close) L.push(t.pts[1]);
      el("path", { d: "M" + L.map(p => p[0] + "," + p[1]).join(" L"), fill: "none", stroke: COL.blue, "stroke-width": 3 });
      for (const p of t.pts) {
        if (p[3]) el("path", { d: `M${p[0]},${p[1] - 9} L${p[0] + 8},${p[1] + 6} L${p[0] - 8},${p[1] + 6} Z`, fill: "#12324f" });
        else el("circle", { cx: p[0], cy: p[1], r: 6, fill: "#fff", stroke: COL.blue, "stroke-width": 2.5 });
        S.txt(p[0] + 10, p[1] - 8, p[2], { class: "rd-lab" }, g);
      }
      S.txt(10, H - 26, "▲ γνωστό σημείο   ○ νέα στάση   ┅ γνωστή διεύθυνση (προσανατολισμός)", { class: "rd-small" }, g);
      desc.innerHTML = t.desc;
      out.innerHTML = t.chk.map(([s, ok]) => `<tr><td>${s}</td><td class="${ok ? "ok" : "bad"}"><b>${ok ? "✓ ναι" : "✗ όχι"}</b></td></tr>`).join("");
    }
    upd();
  }

  /* ---------- Συντελεστής κλίμακας ΕΓΣΑ 87 ---------- */
  function buildScale(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 360, R = 6371000, K0 = 0.9996;
    const kOf = E => { const x = (E - 500000) / K0, q = x * x / (R * R); return K0 * (1 + q / 2 + q * q / 24); };
    const x1 = R * Math.sqrt(2 * (1 / K0 - 1));                       // k = 1
    const S = makeSvg(root, W, H);
    const E0 = 150000, E1 = 850000, kmin = 0.9995, kmax = 1.0012;
    const L = 60, Rr = 20, T = 20, B = 50;
    const X = E => L + (E - E0) / (E1 - E0) * (W - L - Rr), Y = k => T + (kmax - k) / (kmax - kmin) * (H - T - B);
    for (let k = 0.9996; k <= kmax + 1e-9; k += 0.0002) {
      S.el("line", { x1: L, y1: Y(k), x2: W - Rr, y2: Y(k), stroke: "#eef1f5" });
      S.txt(L - 6, Y(k) + 4, k.toFixed(4), { class: "rd-small", "text-anchor": "end" });
    }
    for (let E = 200000; E <= 800000; E += 100000) {
      S.el("line", { x1: X(E), y1: T, x2: X(E), y2: H - B, stroke: "#eef1f5" });
      S.txt(X(E), H - B + 16, String(E / 1000), { class: "rd-small", "text-anchor": "middle" });
    }
    S.txt((W + L) / 2, H - 12, "E (km) — κεντρικός μεσημβρινός στα 500 km (λ = 24°)", { class: "rd-small", "text-anchor": "middle" });
    S.el("line", { x1: L, y1: Y(1), x2: W - Rr, y2: Y(1), stroke: COL.green, "stroke-width": 1.5, "stroke-dasharray": "6 4" });
    S.txt(W - Rr - 4, Y(1) - 6, "k = 1", { class: "rd-lab", fill: COL.green, "text-anchor": "end" });
    S.el("rect", { x: X(500000 - x1), y: T, width: X(500000 + x1) - X(500000 - x1), height: H - T - B, fill: COL.blue, "fill-opacity": 0.06 });
    S.txt(X(500000), T + 16, "k < 1: οι αποστάσεις στον χάρτη μικραίνουν", { class: "rd-small", "text-anchor": "middle", fill: COL.blue });
    S.el("line", { x1: X(500000), y1: T, x2: X(500000), y2: H - B, stroke: COL.dark, "stroke-width": 1.2 });
    const pts = []; for (let E = E0; E <= E1; E += 5000) pts.push(`${X(E)},${Y(kOf(E))}`);
    S.el("path", { d: "M" + pts.join(" L"), fill: "none", stroke: COL.purple, "stroke-width": 2.5 });
    const vl = S.el("line", { stroke: COL.red, "stroke-dasharray": "4 3" });
    const dot = S.el("circle", { r: 7, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
    const lab = S.txt(0, 0, "", { class: "rd-lab", fill: COL.red });
    const st = { E: 483500 };
    const out = h("tbody");
    const btn = h("button", {}, "📍 Η περιοχή μελέτης μου");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "rd-btns" }, btn),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε το σημείο στην καμπύλη. Στον κεντρικό μεσημβρινό k = 0.9996· σε απόσταση ±", (x1 / 1000).toFixed(0),
        " km γίνεται 1, και πιο έξω μεγαλύτερος από 1.")));
    btn.onclick = () => {
      const a = window.Store && Store.s && Store.s.area;
      if (!a) return toast("Δεν έχεις ορίσει ακόμα περιοχή μελέτης.", "warn");
      st.E = GEO.toEGSA((a.south + a.north) / 2, (a.west + a.east) / 2).E; upd();
    };
    let drag = false;
    const fromPtr = ev => { const [x] = S.pt(ev); st.E = Math.max(E0, Math.min(E1, E0 + (x - L) / (W - L - Rr) * (E1 - E0))); upd(); };
    S.svg.addEventListener("pointerdown", ev => { drag = true; S.svg.setPointerCapture(ev.pointerId); fromPtr(ev); });
    S.svg.addEventListener("pointermove", ev => drag && fromPtr(ev));
    S.svg.addEventListener("pointerup", () => drag = false);
    function upd() {
      const k = kOf(st.E), x = (st.E - 500000) / K0;
      vl.setAttribute("x1", X(st.E)); vl.setAttribute("x2", X(st.E)); vl.setAttribute("y1", Y(k)); vl.setAttribute("y2", H - B);
      dot.setAttribute("cx", X(st.E)); dot.setAttribute("cy", Y(k));
      at(lab, X(st.E) + (st.E > 700000 ? -10 : 10), Y(k) - 12); lab.setAttribute("text-anchor", st.E > 700000 ? "end" : "start");
      lab.textContent = `k = ${k.toFixed(6)}`;
      out.innerHTML = `
        <tr><td>E</td><td>${st.E.toFixed(0)} m</td></tr>
        <tr><td>x = (E − 500 000) / k<sub>0</sub></td><td>${(x / 1000).toFixed(1)} km</td></tr>
        <tr class="res"><td>k = k<sub>0</sub>(1 + x²/2R²)</td><td><b>${k.toFixed(6)}</b></td></tr>
        <tr><td>Πλευρά 100.000 m στο έδαφος → στο ΕΓΣΑ 87</td><td>${(100 * k).toFixed(3)} m</td></tr>
        <tr><td>Διαφορά ανά 100 m</td><td>${((k - 1) * 1e5).toFixed(1)} mm</td></tr>`;
    }
    upd();
  }

  /* ---------- Σφάλμα κέντρωσης και μήκος πλευρών ---------- */
  function buildCenter(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 380;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { e: 3, D1: 40, D2: 150, b: 200, th: 60 };
    const se = slider("Σφάλμα κέντρωσης e:", 0, 10, 0.5, st.e, "mm");
    const s1 = slider("Πίσω πλευρά D<sub>1</sub>:", 10, 300, 5, st.D1, "m");
    s1.lab.firstChild.replaceWith(h("span", { html: "Πίσω πλευρά D<sub>1</sub>:" }));
    const s2 = slider("", 10, 300, 5, st.D2, "m");
    s2.lab.firstChild.replaceWith(h("span", { html: "Εμπρός πλευρά D<sub>2</sub>:" }));
    const sb = slider("Γωνία β:", 100, 300, 1, st.b, "grad");
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, se.lab, s1.lab, s2.lab, sb.lab), h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Σύρε την κόκκινη κουκκίδα γύρω από τη στάση για να αλλάξεις τη φορά της έκκεντρης θέσης. ",
        "Δοκίμασε μια μικρή πλευρά δίπλα σε μια μεγάλη: το σφάλμα της γωνίας καθορίζεται σχεδόν μόνο από τη μικρή.")));
    for (const [s, k] of [[se, "e"], [s1, "D1"], [s2, "D2"], [sb, "b"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };
    const cx = 300, cy = 190, EX = 9;                    // EX: px ανά mm έκκεντρου
    let drag = false;
    const fromPtr = ev => { const [x, y] = S.pt(ev); if (Math.hypot(x - cx, y - cy) > 4) { st.th = azim(x - cx, cy - y); upd(); } };
    S.svg.addEventListener("pointerdown", ev => { drag = true; S.svg.setPointerCapture(ev.pointerId); fromPtr(ev); });
    S.svg.addEventListener("pointermove", ev => drag && fromPtr(ev));
    S.svg.addEventListener("pointerup", () => drag = false);
    const RHO = 636620;                                  // cc ανά rad
    function upd() {
      const { e, D1, D2, b, th } = st;
      // πραγματικά σημεία (m): στάση στο 0, πίσω προς 300g, εμπρός σε 300 + b
      const aA = 300, aC = mod400(300 + b);
      const A = [D1 * Math.sin(aA * GR), D1 * Math.cos(aA * GR)], C = [D2 * Math.sin(aC * GR), D2 * Math.cos(aC * GR)];
      const O = [e / 1000 * Math.sin(th * GR), e / 1000 * Math.cos(th * GR)];
      const bm = mod400(azim(C[0] - O[0], C[1] - O[1]) - azim(A[0] - O[0], A[1] - O[1]));
      const d = sgnd(bm - b) * 1e4;
      const dmax = e / 1000 * RHO * Math.sqrt(1 / D1 ** 2 + 1 / D2 ** 2 - 2 * Math.cos(b * GR) / (D1 * D2));
      g.innerHTML = "";
      const el = (n, a) => S.el(n, a, g);
      // σχεδίαση: μήκη υπό κλίμακα, έκκεντρο μεγεθυμένο
      // σχηματικά μήκη (η μικρότερη πλευρά δεν σχεδιάζεται κάτω από 110 px)
      const k = 250 / Math.max(D1, D2), r1 = Math.max(110, D1 * k) / D1, r2 = Math.max(110, D2 * k) / D2;
      const pA = [cx + A[0] * r1, cy - A[1] * r1], pC = [cx + C[0] * r2, cy - C[1] * r2], pO = [cx + O[0] * 1000 * EX, cy - O[1] * 1000 * EX];
      el("circle", { cx, cy, r: 10 * EX * 0.5, fill: "none", stroke: "#ddd", "stroke-dasharray": "3 3" });
      el("line", { x1: cx, y1: cy, x2: pA[0], y2: pA[1], stroke: "#bbb", "stroke-width": 2 });
      el("line", { x1: cx, y1: cy, x2: pC[0], y2: pC[1], stroke: "#bbb", "stroke-width": 2 });
      el("line", { x1: pO[0], y1: pO[1], x2: pA[0], y2: pA[1], stroke: COL.red, "stroke-width": 1.8 });
      el("line", { x1: pO[0], y1: pO[1], x2: pC[0], y2: pC[1], stroke: COL.red, "stroke-width": 1.8 });
      el("path", { d: arc(cx, cy, 40, aA, aC), fill: "none", stroke: COL.green, "stroke-width": 2.5, "marker-end": S.mk.green });
      S.txt(...P(cx, cy, aA + b / 2, 56), "β", { class: "q-alpha", fill: COL.green, "text-anchor": "middle", dy: 6 }, g);
      for (const [p, n] of [[pA, "A"], [pC, "C"]]) { el("circle", { cx: p[0], cy: p[1], r: 5, fill: "#12324f" }); S.txt(p[0] + 8, p[1] - 8, n, { class: "q-pt" }, g); }
      el("circle", { cx, cy, r: 5, fill: "#12324f" });
      S.txt(cx - 8, cy + 22, "B (σημάδι)", { class: "rd-lab", "text-anchor": "end" }, g);
      el("line", { x1: cx, y1: cy, x2: pO[0], y2: pO[1], stroke: COL.orange, "stroke-width": 2 });
      el("circle", { cx: pO[0], cy: pO[1], r: 7, fill: "#f6b4ad", stroke: COL.red, "stroke-width": 2, class: "q-handle" });
      S.txt(pO[0] + 10, pO[1] + 4, "όργανο", { class: "rd-small", fill: COL.red }, g);
      S.txt(10, H - 8, `Σχηματικό: το έκκεντρο e είναι μεγεθυμένο (1 mm = ${EX} px)· οι αριθμοί είναι ακριβείς.`, { class: "rd-small" }, g);
      se.out.textContent = e; s1.out.textContent = D1; s2.out.textContent = D2; sb.out.textContent = b;
      out.innerHTML = `
        <tr><td>Σφάλμα γωνίας για αυτή τη θέση</td><td><b>${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} cc</b></td></tr>
        <tr class="res"><td>Μέγιστο σφάλμα (δυσμενέστερη θέση)</td><td><b>${dmax.toFixed(1)} cc</b></td></tr>
        <tr><td>Συμβολή πίσω πλευράς e·ρ/D<sub>1</sub></td><td>${(e / 1000 * RHO / D1).toFixed(1)} cc</td></tr>
        <tr><td>Συμβολή εμπρός πλευράς e·ρ/D<sub>2</sub></td><td>${(e / 1000 * RHO / D2).toFixed(1)} cc</td></tr>`;
    }
    upd();
  }

  /* ---------- Οπτική επαφή ---------- */
  function buildLos(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 620, H = 330, D = 180, VE = 4;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { p: 0.6, hb: 1, i: 1.55, t: 1.8, hill: 0 };
    const sp = slider("Θέση εμποδίου:", 0.15, 0.85, 0.01, st.p);
    const sh = slider("Ύψος κτιρίου:", 0, 15, 0.1, st.hb, "m");
    const sl = slider("Ύψωμα εδάφους στη μέση:", -4, 10, 0.1, st.hill, "m");
    const si = slider("Ύψος οργάνου i:", 1.2, 1.8, 0.01, st.i, "m");
    const stt = slider("Ύψος στόχου t:", 1, 3, 0.01, st.t, "m");
    const out = h("tbody");
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sp.lab, sh.lab, sl.lab, si.lab, stt.lab), h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "muted small" }, "Η σκόπευση είναι ευθεία από τον άξονα του οργάνου στο A ως τον στόχο στο B. Αρκεί ένα σημείο του εδάφους ή ενός κτιρίου να βρίσκεται πάνω από αυτήν για να μην υπάρχει οπτική επαφή. ",
        "Για ασφάλεια, η σκόπευση πρέπει να περνά τουλάχιστον 0.5–1 m πάνω από τα εμπόδια (θερμική αναταραχή, βλάστηση).")));
    for (const [s, k] of [[sp, "p"], [sh, "hb"], [sl, "hill"], [si, "i"], [stt, "t"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };
    const ground = (d, hill) => 0.012 * d + hill * Math.exp(-(((d - D * 0.45) / (D * 0.18)) ** 2)) + 0.6 * Math.sin(d / 9);
    function upd() {
      const { p, hb, i, t, hill } = st;
      const zA = ground(0, hill) + i, zB = ground(D, hill) + t;
      const sight = d => zA + (zB - zA) * d / D;
      const bx0 = p * D - 6, bx1 = p * D + 6;
      let minC = Infinity, at_ = 0, what = "";
      for (let d = 1; d < D - 1; d += 0.5) {
        const top = ground(d, hill) + (d >= bx0 && d <= bx1 ? hb : 0), c = sight(d) - top;
        if (c < minC) { minC = c; at_ = d; what = d >= bx0 && d <= bx1 && hb > 0 ? "κτίριο" : "έδαφος"; }
      }
      const L = 40, X = d => L + d / D * (W - 2 * L), y0 = 250, Y = z => y0 - z * VE * (W - 2 * L) / D / 1;
      g.innerHTML = "";
      const el = (n, a) => S.el(n, a, g);
      const gp = []; for (let d = -10; d <= D + 10; d += 2) gp.push(`${X(d)},${Y(ground(d, hill))}`);
      el("path", { d: "M" + gp.join(" L") + ` L${X(D + 10)},${H - 20} L${X(-10)},${H - 20} Z`, fill: "#efe6d8", stroke: COL.brown, "stroke-width": 2 });
      if (hb > 0) el("rect", { x: X(bx0), y: Y(ground(p * D, hill) + hb), width: X(bx1) - X(bx0), height: Y(ground(p * D, hill)) - Y(ground(p * D, hill) + hb) + 6, fill: "#d9d2c5", stroke: "#6d6455", "stroke-width": 1.5 });
      const vis = minC > 0;
      el("line", { x1: X(0), y1: Y(zA), x2: X(D), y2: Y(zB), stroke: vis ? "#1a9850" : "#d73027", "stroke-width": 2.5 });
      el("line", { x1: X(0), y1: Y(ground(0, hill)), x2: X(0), y2: Y(zA), stroke: "#555", "stroke-width": 3 });
      el("line", { x1: X(D), y1: Y(ground(D, hill)), x2: X(D), y2: Y(zB), stroke: "#555", "stroke-width": 3 });
      el("rect", { x: X(0) - 6, y: Y(zA) - 6, width: 12, height: 10, fill: "#e07b00", stroke: "#333" });
      el("path", { d: `M${X(D)},${Y(zB) - 7} L${X(D) + 7},${Y(zB)} L${X(D)},${Y(zB) + 7} L${X(D) - 7},${Y(zB)} Z`, fill: "#ffd54f", stroke: "#333" });
      S.txt(X(0) - 6, Y(ground(0, hill)) + 18, "A", { class: "q-pt", "text-anchor": "end" }, g);
      S.txt(X(D) + 8, Y(ground(D, hill)) + 18, "B", { class: "q-pt" }, g);
      const cz = sight(at_), tz = cz - minC;
      el("line", { x1: X(at_), y1: Y(cz), x2: X(at_), y2: Y(tz), stroke: vis ? COL.green : COL.red, "stroke-width": 2, "marker-end": vis ? S.mk.green : S.mk.red });
      S.txt(X(at_) + 6, (Y(cz) + Y(tz)) / 2, `${minC >= 0 ? "+" : "−"}${Math.abs(minC).toFixed(2)} m`, { class: "rd-lab", fill: vis ? COL.green : COL.red }, g);
      S.txt(10, 18, `Κατακόρυφη κλίμακα ×${VE}· μήκος AB = ${D} m`, { class: "rd-small" }, g);
      sp.out.textContent = (p * D).toFixed(0) + " m"; sh.out.textContent = hb.toFixed(1); sl.out.textContent = hill.toFixed(1);
      si.out.textContent = i.toFixed(2); stt.out.textContent = t.toFixed(2);
      out.innerHTML = `
        <tr><td>Ελάχιστη απόσταση σκόπευσης – εμποδίου</td><td><b style="color:${vis ? COL.green : COL.red}">${minC >= 0 ? "+" : "−"}${Math.abs(minC).toFixed(2)} m</b> στα ${at_.toFixed(0)} m (${what})</td></tr>
        <tr class="res"><td>Οπτική επαφή</td><td><b>${vis ? (minC >= 0.5 ? "✓ ναι" : "✓ οριακά (< 0.5 m)") : "✗ όχι"}</b></td></tr>`;
    }
    upd();
  }

  /* =====================================================================
     ΦΑΣΗ 6: αφινικός μετασχηματισμός και σημεία ελέγχου
     ===================================================================== */

  /** κοινό: σχέδιο «εικόνας» (πλαίσιο, σταυρονήματα, ένα σπίτι) σε συντεταγμένες εικόνας 0..400 × 0..300 */
  const IMG_W = 400, IMG_H = 300;
  function imageShapes() {
    const sh = [{ t: "rect", p: [[0, 0], [IMG_W, 0], [IMG_W, IMG_H], [0, IMG_H]] }];
    for (let x = 50; x < IMG_W; x += 100) for (let y = 50; y < IMG_H; y += 100) sh.push({ t: "cross", c: [x, y] });
    sh.push({ t: "house", p: [[210, 170], [290, 170], [290, 240], [210, 240]] }, { t: "house", p: [[210, 170], [250, 135], [290, 170]] });
    return sh;
  }

  /* ---------- αφινικός μετασχηματισμός ---------- */
  function buildAffine(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 600, H = 460;
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    const st = { th: 8, sx: 1.0, sy: 0.96, sh: 0.0, tx: 0, ty: 0 };
    const sTh = slider("Στροφή θ:", -30, 30, 0.5, st.th, "°");
    const sSx = slider("Κλίμακα στον x (s<sub>x</sub>):", 0.7, 1.3, 0.01, st.sx);
    sSx.lab.firstChild.replaceWith(h("span", { html: "Κλίμακα κατά x (s<sub>x</sub>):" }));
    const sSy = slider("", 0.7, 1.3, 0.01, st.sy);
    sSy.lab.firstChild.replaceWith(h("span", { html: "Κλίμακα κατά y (s<sub>y</sub>):" }));
    const sSh = slider("Διάτμηση (λοξότητα) k:", -0.3, 0.3, 0.01, st.sh);
    const sTx = slider("Μετατόπιση ΔE:", -60, 60, 1, st.tx, "m");
    const sTy = slider("Μετατόπιση ΔN:", -60, 60, 1, st.ty, "m");
    const out = h("tbody"), wf = h("pre", { class: "rd-pre" });
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" }, sTh.lab, sSx.lab, sSy.lab, sSh.lab, sTx.lab, sTy.lab),
      h("table", { class: "tbl quad-tbl" }, out),
      h("p", { class: "small" }, h("b", {}, "World file (.pgw) αυτού του μετασχηματισμού:")), wf,
      h("p", { class: "muted small" }, "Οι 6 παράμετροι a…f είναι συνδυασμός 2 μετατοπίσεων, 1 στροφής, 2 κλιμάκων και 1 διάτμησης. ",
        "Με s", h("sub", {}, "x"), " = s", h("sub", {}, "y"), " και k = 0 ο μετασχηματισμός γίνεται μετασχηματισμός ομοιότητας (4 παράμετροι).")));
    for (const [s, k] of [[sTh, "th"], [sSx, "sx"], [sSy, "sy"], [sSh, "sh"], [sTx, "tx"], [sTy, "ty"]]) s.inp.oninput = () => { st[k] = +s.inp.value; upd(); };
    const E0 = 480400, N0 = 4203300, PIX = 0.5;              // βασικό μέγεθος pixel
    const cx = 300, cy = 230, K = 1.6;                       // σχεδίαση χάρτη: px ανά m
    function upd() {
      const th = st.th * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
      // εικόνα (x δεξιά, y κάτω) → ΕΓΣΑ: [E;N] = R(θ)·[[sx, k],[0, sy]]·[x·pix; −y·pix] + t
      const M = [c * st.sx, c * st.sh - s * st.sy, s * st.sx, s * st.sh + c * st.sy];
      const a = M[0] * PIX, b = -M[1] * PIX, d = M[2] * PIX, e = -M[3] * PIX;
      const cE = E0 - (a * IMG_W + b * IMG_H) / 2 + st.tx, cN = N0 - (d * IMG_W + e * IMG_H) / 2 + st.ty;
      const T = (x, y) => [a * x + b * y + cE, d * x + e * y + cN];
      const toS = ([E, N]) => [cx + (E - E0) * K, cy - (N - N0) * K];
      g.innerHTML = "";
      const el = (n, at_) => S.el(n, at_, g);
      // άξονες χάρτη
      for (let v = -150; v <= 150; v += 50) {
        el("line", { x1: cx + v * K, y1: 20, x2: cx + v * K, y2: H - 30, stroke: "#eef1f5" });
        el("line", { x1: 20, y1: cy - v * K, x2: W - 20, y2: cy - v * K, stroke: "#eef1f5" });
      }
      el("line", { x1: 30, y1: H - 40, x2: 30, y2: 30, stroke: COL.dark, "stroke-width": 1.5, "marker-end": S.mk.dark });
      el("line", { x1: 30, y1: H - 40, x2: 120, y2: H - 40, stroke: COL.dark, "stroke-width": 1.5, "marker-end": S.mk.dark });
      S.txt(36, 40, "N", { class: "q-axis" }, g); S.txt(118, H - 48, "E", { class: "q-axis", "text-anchor": "end" }, g);
      // αρχική εικόνα (χωρίς παραμόρφωση) με διακεκομμένη
      const T0 = (x, y) => [PIX * x + E0 - PIX * IMG_W / 2, -PIX * y + N0 + PIX * IMG_H / 2];
      const path = (P, f) => "M" + P.map(q => toS(f(...q)).join(",")).join(" L") + " Z";
      const base = imageShapes()[0].p;
      el("path", { d: path(base, T0), fill: "none", stroke: "#aaa", "stroke-width": 1.2, "stroke-dasharray": "5 4" });
      // μετασχηματισμένη εικόνα
      for (const sh of imageShapes()) {
        if (sh.t === "rect") el("path", { d: path(sh.p, T), fill: "#eaf2fb", "fill-opacity": 0.8, stroke: COL.blue, "stroke-width": 2 });
        else if (sh.t === "house") el("path", { d: path(sh.p, T), fill: "#f3d7b6", stroke: COL.brown, "stroke-width": 1.5 });
        else { const [x, y] = sh.c;
          for (const [p, q] of [[[x - 10, y], [x + 10, y]], [[x, y - 10], [x, y + 10]]]) { const A = toS(T(...p)), B = toS(T(...q));
            el("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#111", "stroke-width": 2 }); } }
      }
      // άξονες της εικόνας: x (στήλη) και y (γραμμή, προς τα κάτω)
      const o = toS(T(0, 0)), ax = toS(T(90, 0)), ay = toS(T(0, 90));
      el("line", { x1: o[0], y1: o[1], x2: ax[0], y2: ax[1], stroke: COL.red, "stroke-width": 2.5, "marker-end": S.mk.red });
      el("line", { x1: o[0], y1: o[1], x2: ay[0], y2: ay[1], stroke: COL.green, "stroke-width": 2.5, "marker-end": S.mk.green });
      S.txt(ax[0] + 4, ax[1] - 4, "x (στήλη)", { class: "rd-lab", fill: COL.red }, g);
      S.txt(ay[0] + 4, ay[1] + 12, "y (γραμμή)", { class: "rd-lab", fill: COL.green }, g);
      el("circle", { cx: o[0], cy: o[1], r: 4, fill: "#111" });
      S.txt(o[0] - 6, o[1] - 6, "(0, 0)", { class: "rd-small", "text-anchor": "end" }, g);
      for (const [s, k, d_] of [[sTh, "th", 1], [sSx, "sx", 2], [sSy, "sy", 2], [sSh, "sh", 2], [sTx, "tx", 0], [sTy, "ty", 0]]) s.out.textContent = st[k].toFixed(d_);
      const f4 = x => x.toFixed(4);
      out.innerHTML = `
        <tr><td colspan="2">E = a·x + b·y + c, &nbsp; N = d·x + e·y + f</td></tr>
        <tr><td>a, b</td><td>${f4(a)}, ${f4(b)}</td></tr>
        <tr><td>d, e</td><td>${f4(d)}, ${f4(e)}</td></tr>
        <tr><td>c, f</td><td>${cE.toFixed(3)}, ${cN.toFixed(3)}</td></tr>
        <tr><td>Μέγεθος pixel κατά x, y</td><td>${Math.hypot(a, d).toFixed(3)} m, ${Math.hypot(b, e).toFixed(3)} m</td></tr>`;
      wf.textContent = [a, d, b, e, cE + a / 2 + b / 2, cN + d / 2 + e / 2].map((v, i) => i < 4 ? v.toFixed(10) : v.toFixed(4)).join("\n");
    }
    upd();
  }

  /* ---------- σημεία ελέγχου, ελάχιστα τετράγωνα, υπόλοιπα ---------- */
  function buildGCP(root) {
    root.innerHTML = ""; root.classList.add("quad");
    const W = 560, H = 440, ox = 60, oy = 40, Ks = 1.1;           // εικόνα 400×300 σχεδιάζεται ×1.1
    const S = makeSvg(root, W, H);
    const g = S.el("g");
    // κρυφός «αληθής» μετασχηματισμός εικόνας → ΕΓΣΑ
    const th = 0.12, sc = 0.5;
    const TT = [sc * Math.cos(th), sc * Math.sin(th), 0, sc * Math.sin(th), -sc * Math.cos(th), 0];
    TT[2] = 480500 - (TT[0] * 200 + TT[1] * 150); TT[5] = 4203350 - (TT[3] * 200 + TT[4] * 150);
    // σταυρονήματα σε στρογγυλές συντεταγμένες· η θέση τους στην εικόνα βγαίνει από τον αντίστροφο
    const gcp = [[480430, 4203395], [480570, 4203395], [480570, 4203305], [480430, 4203305], [480500, 4203350]]
      .map(([E, N], i) => ({ id: i + 1, E, N, x: 0, y: 0, mx: 0, my: 0 }));
    const Ti = inv6(TT);
    gcp.forEach(p => { [p.x, p.y] = applyA6(Ti, p.E, p.N); p.mx = p.x; p.my = p.y; });
    gcp[1].mx += 6; gcp[1].my -= 4;                                // ένα «κακό» κλικ
    const st = { use: [true, true, true, true, true], X: 40 };
    const out = h("tbody"), res = h("p", { class: "small rd-step" });
    const chk = gcp.map((p, i) => { const c = h("input", { type: "checkbox", checked: true }); c.onchange = () => { st.use[i] = c.checked; upd(); }; return h("label", { class: "rd-chk" }, c, " Σ" + p.id); });
    root.append(h("div", { class: "quad-panel" },
      h("div", { class: "rd-btns" }, h("span", { class: "small" }, "Σημεία στη λύση: "), ...chk),
      h("div", { class: "rd-btns" },
        h("button", { onclick: () => { gcp.forEach(p => { p.mx = p.x; p.my = p.y; }); upd(); } }, "Ακριβή κλικ"),
        h("button", { onclick: () => { gcp.forEach(p => { p.mx = p.x + gauss() * 1.2; p.my = p.y + gauss() * 1.2; }); upd(); } }, "Τυχαία μικρά σφάλματα")),
      res, h("table", { class: "tbl quad-tbl" },
        h("thead", {}, h("tr", {}, ...["Σημ.", "E", "N", "v_E (m)", "v_N (m)", "|v| (m)"].map(s => h("th", {}, s)))), out),
      h("p", { class: "muted small" }, "Σύρε τις κόκκινες κουκκίδες: είναι το σημείο όπου «έκανες κλικ» για κάθε σταυρόνημα. ",
        "Τα βέλη δείχνουν τα υπόλοιπα (μεγεθυμένα ×", String(st.X), "). Με 3 σημεία τα υπόλοιπα είναι πάντα μηδέν: δεν υπάρχει κανένας έλεγχος.")));
    let drag = null;
    const toImg = (x, y) => [(x - ox) / Ks, (y - oy) / Ks];
    S.svg.addEventListener("pointerdown", ev => {
      const [x, y] = toImg(...S.pt(ev));
      let best = null, bd = 25;
      gcp.forEach(p => { const d = Math.hypot(p.mx - x, p.my - y); if (d < bd) { bd = d; best = p; } });
      if (best) { drag = best; S.svg.setPointerCapture(ev.pointerId); }
    });
    S.svg.addEventListener("pointermove", ev => { if (!drag) return; const [x, y] = toImg(...S.pt(ev)); drag.mx = x; drag.my = y; upd(); });
    S.svg.addEventListener("pointerup", () => drag = null);
    function upd() {
      const used = gcp.filter((_, i) => st.use[i]);
      g.innerHTML = "";
      const el = (n, a_) => S.el(n, a_, g), P = (x, y) => [ox + x * Ks, oy + y * Ks];
      el("rect", { x: ox, y: oy, width: IMG_W * Ks, height: IMG_H * Ks, fill: "#eef3ea", stroke: "#666", "stroke-width": 1.5 });
      S.txt(ox, oy - 10, "Εικόνα (pixel)", { class: "rd-small" }, g);
      for (const p of gcp) {
        const [x, y] = P(p.x, p.y);
        for (const [w, c] of [[3.5, "#000"], [1.3, "#fff"]]) el("path", { d: `M${x - 12},${y} L${x + 12},${y} M${x},${y - 12} L${x},${y + 12}`, stroke: c, "stroke-width": w });
        S.txt(x + 8, y + 22, `Σ${p.id} (${p.E}, ${p.N})`, { class: "rd-small" }, g);
      }
      let A = null;
      const rows = [];
      if (used.length >= 3) {
        // ελάχιστα τετράγωνα: (x_κλικ, y_κλικ) → (E, N)
        A = lsq6(used.map(p => [p.mx, p.my]), used.map(p => [p.E, p.N]));
      }
      let s2 = 0;
      for (const [i, p] of gcp.entries()) {
        const [mx, my] = P(p.mx, p.my);
        if (A) {
          const [Ec, Nc] = applyA6(A, p.mx, p.my), vE = p.E - Ec, vN = p.N - Nc;
          if (st.use[i]) s2 += vE * vE + vN * vN;
          // βέλος υπολοίπου στην εικόνα: κατεύθυνση (vE, vN) → pixel με τον αντίστροφο
          const Ai = inv6(A), [qx, qy] = applyA6(Ai, Ec + vE * st.X, Nc + vN * st.X), [ex, ey] = P(qx, qy);
          if (Math.hypot(vE, vN) > 1e-6) el("line", { x1: mx, y1: my, x2: ex, y2: ey, stroke: st.use[i] ? COL.orange : "#999", "stroke-width": 2, "marker-end": st.use[i] ? S.mk.orange : S.mk.grey });
          rows.push(h("tr", { class: st.use[i] ? "" : "muted" }, h("td", {}, "Σ" + p.id + (st.use[i] ? "" : " (έλεγχος)")), h("td", {}, String(p.E)), h("td", {}, String(p.N)),
            h("td", {}, vE.toFixed(3)), h("td", {}, vN.toFixed(3)), h("td", {}, Math.hypot(vE, vN).toFixed(3))));
        }
        el("circle", { cx: mx, cy: my, r: 6, fill: st.use[i] ? COL.red : "#bbb", stroke: "#111", "stroke-width": 1.2, class: "q-handle" });
      }
      out.innerHTML = ""; rows.forEach(r => out.append(r));
      const n = used.length, rmse = n ? Math.sqrt(s2 / n) : 0, sigma0 = n > 3 ? Math.sqrt(s2 / (2 * n - 6)) : null;
      res.innerHTML = n < 3 ? "Χρειάζονται τουλάχιστον 3 σημεία (6 εξισώσεις για 6 αγνώστους)." :
        `Σημεία: <b>${n}</b> · εξισώσεις ${2 * n}, άγνωστοι 6, πλεονάζουσες <b>${2 * n - 6}</b> · RMSE = <b>${rmse.toFixed(3)} m</b>` +
        (sigma0 != null ? ` · σ<sub>0</sub> = ${sigma0.toFixed(3)} m` : " (χωρίς πλεονάζουσες: κανένας έλεγχος)");
    }
    upd();
  }
  function applyA6(A, x, y) { return [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]]; }
  function inv6(A) { const [a, b, c, d, e, f] = A, D = a * e - b * d; return [e / D, -b / D, (b * f - c * e) / D, -d / D, a / D, (c * d - a * f) / D]; }
  function lsq6(src, dst) {
    const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    src.forEach(([x, y], i) => { const r = [x, y, 1];
      for (let p = 0; p < 3; p++) { for (let q = 0; q < 3; q++) N[p][q] += r[p] * r[q]; bx[p] += r[p] * dst[i][0]; by[p] += r[p] * dst[i][1]; } });
    const sol = b => { const M = N.map((r, i) => [...r, b[i]]);
      for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; } }
      return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]; };
    return [...sol(bx), ...sol(by)];
  }

  function build() {
    const map = { "red-field": buildField, "red-faces": buildFaces, "red-zero": buildZero, "red-zenith": buildZenith, "red-obstacle": buildObstacle,
                  "ty-polar": buildPolar, "ty-height": buildTHeight, "ty-curv": buildCurv, "ty-sketch": buildSketch,
                  "fp-1": buildFP1, "fp-2": buildFP2, "fp-3": buildFP3, "ex-trav": buildTravEx,
                  "ph1-types": buildTypes, "ph1-scale": buildScale, "ph1-center": buildCenter, "ph1-los": buildLos,
                  "ph6-affine": buildAffine, "ph6-gcp": buildGCP };
    for (const [id, fn] of Object.entries(map)) { const c = document.getElementById(id); if (c) fn(c); }
  }

  return { build };
})();
