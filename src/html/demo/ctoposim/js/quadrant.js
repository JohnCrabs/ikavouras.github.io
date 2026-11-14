/* =========================================================================
   CTopoSim — Διαδραστικό σχήμα: γωνία διεύθυνσης ανά τεταρτημόριο
   Ο φοιτητής σέρνει το σημείο B και βλέπει live ΔE, ΔN, tan⁻¹(ΔE/ΔN) και α.
   ========================================================================= */
"use strict";

const Quadrant = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const W = 620, Hh = 600, cx = 310, cy = 300, R = 170;
  const GR = Math.PI / 200;
  // Αρίθμηση όπως στο σχήμα του βιβλίου: 1ο ΒΑ, 2ο ΒΔ, 3ο ΝΔ, 4ο ΝΑ
  const Q = {
    1: { name: "1ο Τεταρτημόριο", signs: "+/+", add: 0,   col: "#2b9a5a", from: 0,   lab: [cx + 150, 40],  anchor: "start" },
    2: { name: "2ο Τεταρτημόριο", signs: "−/+", add: 400, col: "#2c6fbb", from: 300, lab: [cx - 150, 40],  anchor: "end" },
    3: { name: "3ο Τεταρτημόριο", signs: "−/−", add: 200, col: "#d9822b", from: 200, lab: [cx - 150, Hh - 58], anchor: "end" },
    4: { name: "4ο Τεταρτημόριο", signs: "+/−", add: 200, col: "#8e44ad", from: 100, lab: [cx + 150, Hh - 58], anchor: "start" },
  };

  let alpha = 65, len = 100, root, svg, els = {};

  const el = (tag, attrs = {}, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  };
  const txt = (x, y, s, attrs = {}, parent = svg) => { const t = el("text", { x, y, ...attrs }, parent); t.innerHTML = s; return t; };
  const P = (a, r = R) => [cx + r * Math.sin(a * GR), cy - r * Math.cos(a * GR)];
  const quadOf = (dE, dN) => dN === 0 ? (dE > 0 ? 1 : 2) : dN > 0 ? (dE >= 0 ? 1 : 2) : (dE >= 0 ? 4 : 3);

  function sector(a0, a1, r) {
    const [x0, y0] = P(a0, r), [x1, y1] = P(a1, r);
    return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${a1 - a0 > 200 ? 1 : 0} 1 ${x1},${y1} Z`;
  }

  function build(container) {
    root = container;
    root.innerHTML = "";
    root.classList.add("quad");
    svg = el("svg", { viewBox: `0 0 ${W} ${Hh}`, class: "quad-svg" }, root);
    const defs = el("defs");
    for (const [id, c] of [["ar-n", "#12324f"], ["ar-v", "#111"]]) {
      const m = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", fill: c }, m);
    }
    // τομείς τεταρτημορίων
    els.sec = {};
    for (const k of [1, 2, 3, 4]) {
      const q = Q[k];
      els.sec[k] = el("path", { d: sector(q.from, q.from + 100, R), fill: q.col, "fill-opacity": 0.12, stroke: "none" });
      const [sx, sy] = P(q.from + 50, R * 0.55);
      txt(sx, sy + 8, q.signs, { "text-anchor": "middle", class: "q-signs", fill: q.col });
      const [lx, ly] = q.lab;
      els["lab" + k] = el("g", { class: "q-lab" });
      txt(lx, ly, q.name, { "text-anchor": q.anchor, "font-weight": 700, fill: q.col }, els["lab" + k]);
      const corr = q.add === 0 ? "+ 0<tspan baseline-shift='super' font-size='10'>g</tspan>"
                               : `+ ${q.add}<tspan baseline-shift='super' font-size='10'>g</tspan>`;
      const rng = { 1: "[0, +100]", 2: "[−100, 0]", 3: "[0, +100]", 4: "[−100, 0]" }[k];
      txt(lx, ly + 20, `tan⁻¹(ΔE/ΔN) ∈ ${rng}`, { "text-anchor": q.anchor, class: "q-f" }, els["lab" + k]);
      txt(lx, ly + 40, `α = tan⁻¹(ΔE/ΔN) ${corr}`, { "text-anchor": q.anchor, class: "q-f" }, els["lab" + k]);
    }
    el("circle", { cx, cy, r: R, fill: "none", stroke: "#333", "stroke-width": 2 });
    // άξονες
    el("line", { x1: cx, y1: cy + R + 40, x2: cx, y2: cy - R - 52, stroke: "#12324f", "stroke-width": 2.5, "marker-end": "url(#ar-n)" });
    el("line", { x1: cx - R - 40, y1: cy, x2: cx + R + 62, y2: cy, stroke: "#12324f", "stroke-width": 2.5, "marker-end": "url(#ar-n)" });
    txt(cx + 10, cy - R - 42, "y (N) · Βορράς", { class: "q-axis" });
    txt(cx + R + 66, cy - 8, "x (E)", { class: "q-axis", "text-anchor": "end" });
    txt(cx + R + 66, cy - 28, "Ανατολή", { class: "q-axis2", "text-anchor": "end" });
    txt(cx - 8, cy - R - 8, "0 / 400<tspan baseline-shift='super' font-size='10'>g</tspan>", { class: "q-deg", "text-anchor": "end" });
    txt(cx + R + 6, cy + 20, "100<tspan baseline-shift='super' font-size='10'>g</tspan>", { class: "q-deg" });
    txt(cx - 8, cy + R + 22, "200<tspan baseline-shift='super' font-size='10'>g</tspan>", { class: "q-deg", "text-anchor": "end" });
    txt(cx - R - 6, cy - 8, "300<tspan baseline-shift='super' font-size='10'>g</tspan>", { class: "q-deg", "text-anchor": "end" });
    txt(cx - 14, cy + 18, "A", { class: "q-pt" });
    // δυναμικά στοιχεία
    els.arc = el("path", { fill: "none", stroke: "#c0392b", "stroke-width": 3, "marker-end": "url(#ar-v)" });
    els.arcLab = txt(0, 0, "α", { class: "q-alpha", "text-anchor": "middle" });
    els.prE = el("line", { stroke: "#999", "stroke-dasharray": "5 4", "stroke-width": 1.5 });
    els.prN = el("line", { stroke: "#999", "stroke-dasharray": "5 4", "stroke-width": 1.5 });
    els.dE = el("line", { stroke: "#e74c3c", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 });
    els.dN = el("line", { stroke: "#2980b9", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 });
    els.dELab = txt(0, 0, "", { class: "q-dE", "text-anchor": "middle" });
    els.dNLab = txt(0, 0, "", { class: "q-dN" });
    els.vec = el("line", { x1: cx, y1: cy, stroke: "#111", "stroke-width": 3, "marker-end": "url(#ar-v)" });
    el("circle", { cx, cy, r: 5, fill: "#111" });
    els.handle = el("circle", { r: 11, fill: "#ffd54f", stroke: "#111", "stroke-width": 2, class: "q-handle" });
    els.hLab = txt(0, 0, "B", { class: "q-pt" });

    // πίνακας τιμών και χειριστήρια
    const panel = h("div", { class: "quad-panel" },
      h("div", { class: "quad-ctrl" },
        h("label", {}, "α (grad) ", h("input", { type: "range", min: 0, max: 399.99, step: 0.01, id: "q-slider" })),
        h("div", { class: "row" },
          h("label", {}, "ΔE (m) ", h("input", { type: "number", step: 0.001, id: "q-de" })),
          h("label", {}, "ΔN (m) ", h("input", { type: "number", step: 0.001, id: "q-dn" })))),
      h("table", { class: "tbl quad-tbl" }, h("tbody", { id: "q-out" })),
      h("p", { class: "muted small" }, "Σύρε το κίτρινο σημείο B ή γράψε ΔE, ΔN. Η τιμή tan⁻¹ που δίνει η αριθμομηχανή είναι πάντα στο [−100, +100]", h("sup", {}, "g"),
        ". Το τεταρτημόριο, δηλαδή τα πρόσημα των ΔE και ΔN, δείχνει τι πρέπει να προσθέσουμε."));
    root.append(panel);

    const setFromPointer = ev => {
      const r = svg.getBoundingClientRect();
      const x = (ev.clientX - r.left) * W / r.width - cx, y = cy - (ev.clientY - r.top) * Hh / r.height;
      if (Math.hypot(x, y) < 4) return;
      alpha = ((Math.atan2(x, y) / GR) % 400 + 400) % 400;
      update();
    };
    let drag = false;
    svg.addEventListener("pointerdown", ev => { drag = true; svg.setPointerCapture(ev.pointerId); setFromPointer(ev); });
    svg.addEventListener("pointermove", ev => drag && setFromPointer(ev));
    svg.addEventListener("pointerup", () => drag = false);
    $("#q-slider", root).addEventListener("input", e => { alpha = +e.target.value; update(); });
    const fromInputs = () => {
      const dE = parseFloat($("#q-de", root).value), dN = parseFloat($("#q-dn", root).value);
      if (!isFinite(dE) || !isFinite(dN) || (dE === 0 && dN === 0)) return;
      len = Math.hypot(dE, dN);
      alpha = ((Math.atan2(dE, dN) / GR) % 400 + 400) % 400;
      update(true);
    };
    $("#q-de", root).addEventListener("change", fromInputs);
    $("#q-dn", root).addEventListener("change", fromInputs);
    update();
  }

  function update(keepInputs = false) {
    const dE = len * Math.sin(alpha * GR), dN = len * Math.cos(alpha * GR);
    const zE = Math.abs(dE) < 1e-9 ? 0 : dE, zN = Math.abs(dN) < 1e-9 ? 0 : dN;
    const q = quadOf(zE, zN), Qq = Q[q];
    const [bx, by] = P(alpha);
    for (const k of [1, 2, 3, 4]) {
      els.sec[k].setAttribute("fill-opacity", k === q ? 0.32 : 0.08);
      els["lab" + k].setAttribute("opacity", k === q ? 1 : 0.4);
    }
    els.vec.setAttribute("x2", bx); els.vec.setAttribute("y2", by);
    els.handle.setAttribute("cx", bx); els.handle.setAttribute("cy", by);
    els.hLab.setAttribute("x", bx + 14); els.hLab.setAttribute("y", by - 12);
    // προβολές
    els.prE.setAttribute("x1", bx); els.prE.setAttribute("y1", by); els.prE.setAttribute("x2", bx); els.prE.setAttribute("y2", cy);
    els.prN.setAttribute("x1", bx); els.prN.setAttribute("y1", by); els.prN.setAttribute("x2", cx); els.prN.setAttribute("y2", by);
    els.dE.setAttribute("x1", cx); els.dE.setAttribute("y1", cy); els.dE.setAttribute("x2", bx); els.dE.setAttribute("y2", cy);
    els.dN.setAttribute("x1", cx); els.dN.setAttribute("y1", cy); els.dN.setAttribute("x2", cx); els.dN.setAttribute("y2", by);
    els.dELab.setAttribute("x", (cx + bx) / 2); els.dELab.setAttribute("y", cy + (zN >= 0 ? 24 : -12));
    els.dELab.textContent = `ΔE ${zE >= 0 ? "+" : "−"}`;
    els.dNLab.setAttribute("x", cx + (zE >= 0 ? -48 : 10)); els.dNLab.setAttribute("y", (cy + by) / 2 + 5);
    els.dNLab.textContent = `ΔN ${zN >= 0 ? "+" : "−"}`;
    // τόξο α από τον Βορρά δεξιόστροφα
    const r = 62, [ax0, ay0] = P(0, r), [ax1, ay1] = P(Math.max(alpha, 0.5), r);
    els.arc.setAttribute("d", `M${ax0},${ay0} A${r},${r} 0 ${alpha > 200 ? 1 : 0} 1 ${ax1},${ay1}`);
    const [lx, ly] = P(alpha / 2, r + 18);
    els.arcLab.setAttribute("x", lx); els.arcLab.setAttribute("y", ly + 6);

    const ratio = zN === 0 ? (zE > 0 ? Infinity : -Infinity) : zE / zN;
    const t = zN === 0 ? (zE > 0 ? 100 : -100) : Math.atan(ratio) / GR;
    const g = x => x.toFixed(4) + "<sup>g</sup>";
    const sgn = (x, c) => `<b style="color:${c}">${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(3)}</b> m`;
    const special = zN === 0 ? " (ΔN = 0: η γωνία είναι 100 ή 300<sup>g</sup>)" : "";
    $("#q-out", root).innerHTML = `
      <tr><td>ΔE = E<sub>B</sub> − E<sub>A</sub></td><td>${sgn(zE, "#e74c3c")}</td></tr>
      <tr><td>ΔN = N<sub>B</sub> − N<sub>A</sub></td><td>${sgn(zN, "#2980b9")}</td></tr>
      <tr><td>ΔE / ΔN</td><td>${isFinite(ratio) ? ratio.toFixed(5) : "∞"}${special}</td></tr>
      <tr><td>tan⁻¹(ΔE / ΔN)</td><td>${g(t)}</td></tr>
      <tr><td>Τεταρτημόριο</td><td><b style="color:${Qq.col}">${Qq.name}</b> (ΔE/ΔN: ${Qq.signs})</td></tr>
      <tr><td>Διόρθωση</td><td><b style="color:${Qq.col}">+ ${Qq.add}<sup>g</sup></b></td></tr>
      <tr class="res"><td>α<sub>AB</sub></td><td><b>${g(alpha)}</b> = ${t.toFixed(4)} + ${Qq.add}</td></tr>`;
    $("#q-slider", root).value = alpha;
    if (!keepInputs) { $("#q-de", root).value = zE.toFixed(3); $("#q-dn", root).value = zN.toFixed(3); }
  }

  return { build };
})();
