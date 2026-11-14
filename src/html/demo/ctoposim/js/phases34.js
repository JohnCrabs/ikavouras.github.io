/* =========================================================================
   CTopoSim — Φάση 3 (ανηγμένες μετρήσεις) και Φάση 4 (επίλυση όδευσης)
   Η σύγκριση γίνεται με τις τιμές που ΠΡΕΠΕΙ να προκύψουν από το έντυπο.
   Ο φοιτητής βλέπει μόνο αν κάθε τιμή είναι σωστή, όχι τη σωστή τιμή.
   ========================================================================= */
"use strict";

const Grading = (() => {
  const S = () => Store.s;
  const nm = id => S().points[id].name;
  const STATUS = { 1: ["✓ σωστό", "ok"], 0.5: ["≈ μικρή απόκλιση", "warn"], 0: ["✗ λάθος", "bad"], null: ["— λείπει", "bad"] };

  /** κοινή απόδοση πίνακα αποτελεσμάτων */
  function renderResult(box, res) {
    box.innerHTML = "";
    if (!res) return;
    box.append(h("div", { class: "score" },
      h("span", {}, "Βαθμός: "), h("b", {}, res.score.toFixed(1) + " / 100"),
      h("small", {}, ` · αρχείο «${res.file}» · ${new Date(res.when).toLocaleString("el-GR")} · υποβολή #${res.attempt}`)));
    const tb = h("tbody");
    for (const it of res.items) {
      const [txt, cls] = STATUS[it.status];
      tb.append(h("tr", {}, h("td", {}, it.group), h("td", {}, it.label),
        h("td", { class: "num" }, it.value == null ? "—" : it.value), h("td", { class: cls }, txt)));
    }
    box.append(h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, h("th", {}, "Ομάδα"), h("th", {}, "Μέγεθος"), h("th", {}, "Η τιμή σου"), h("th", {}, "Αποτέλεσμα"))), tb));
    if (res.notes && res.notes.length) box.append(h("ul", { class: "notes" }, res.notes.map(n => h("li", {}, n))));
  }

  /** βαθμός ομάδας × βάρος */
  function score(items, weights) {
    let total = 0;
    for (const [g, w] of Object.entries(weights)) {
      const its = items.filter(i => i.group === g);
      if (its.length) total += w * its.reduce((s, i) => s + (i.status || 0), 0) / its.length;
    }
    return total;
  }

  /* ======================= ΦΑΣΗ 3 ======================= */
  function template3() {
    const ex = SIM.expected(S()), R = [];
    R.push(["Είδος", "Σημείο 1", "Σημείο 2", "Σημείο 3", "Τιμή"]);
    R.push(["# Οριζόντιες γωνίες β σε grad (πίσω σκόπευση, στάση, εμπρός σκόπευση)"]);
    for (const b of ex.betas) R.push(["beta", nm(b.back), nm(b.station), nm(b.fwd), ""]);
    R.push(["# Οριζόντιες αποστάσεις εδάφους D σε m (μέσος όρος μετάβασης-επιστροφής)"]);
    for (const l of ex.legs) R.push(["D", nm(l.from), nm(l.to), "", ""]);
    R.push(["# Υψομετρικές διαφορές Δh σε m, με τη φορά της όδευσης (μέσος όρος μετάβασης-επιστροφής)"]);
    for (const l of ex.legs) R.push(["dH", nm(l.from), nm(l.to), "", ""]);
    return R;
  }

  function parse3(text) {
    const vals = new Map();
    for (const r of CSV.parse(text)) {
      if (!r[0] || r[0].startsWith("#")) continue;
      const k = r[0].toLowerCase().replace("β", "beta").replace("δh", "dh");
      const v = CSV.toNum(r[4] != null && r[4] !== "" ? r[4] : r[r.length - 1]);
      if (k === "beta") vals.set(`beta|${r[1]}|${r[2]}|${r[3]}`.toUpperCase(), v);
      else if (k === "d") vals.set(`D|${r[1]}|${r[2]}`.toUpperCase(), v);
      else if (k === "dh") vals.set(`DH|${r[1]}|${r[2]}`.toUpperCase(), v);
    }
    return vals;
  }

  function grade3(file, text) {
    const st = S(), ex = SIM.expected(st), vals = parse3(text), items = [];
    const add = (group, label, key, exp, full, half, dec) => {
      const v = vals.has(key) ? vals.get(key) : null;
      const ok = v != null && isFinite(v);
      items.push({ group, label, value: ok ? v.toFixed(dec) : null,
                   status: ok ? SIM.gradeItem(v - exp, full, half) : null });
    };
    for (const b of ex.betas)
      add("Γωνίες β", `β ${b.label} (grad)`, `BETA|${nm(b.back)}|${nm(b.station)}|${nm(b.fwd)}`.toUpperCase(),
          b.value, 0.00015, 0.0010, 4);
    for (const l of ex.legs)
      add("Αποστάσεις D", `D ${l.label} (m)`, `D|${nm(l.from)}|${nm(l.to)}`.toUpperCase(), l.D, 0.0015, 0.005, 3);
    for (const l of ex.legs)
      add("Υψομ. διαφορές Δh", `Δh ${l.label} (m)`, `DH|${nm(l.from)}|${nm(l.to)}`.toUpperCase(), l.dH, 0.0015, 0.005, 3);
    const notes = [];
    if (!vals.size) notes.push("Δεν αναγνωρίστηκε καμία γραμμή. Χρησιμοποίησε το πρότυπο CSV.");
    const sc = score(items, { "Γωνίες β": 40, "Αποστάσεις D": 30, "Υψομ. διαφορές Δh": 30 });
    st.attempts.p3++;
    st.results.p3 = { score: sc, items, file, when: Date.now(), attempt: st.attempts.p3, notes };
    Store.save();
  }

  /* ======================= ΦΑΣΗ 4 ======================= */
  const newStations = () => { const q = S().seq; return q.slice(2, q.length - 2); };

  function template4() {
    const R = [["Είδος", "Σημείο", "Τιμή"]];
    R.push(["# Σφάλματα κλεισίματος: w = (τιμή από τα γνωστά σημεία) − (τιμή από τις μετρήσεις)"]);
    R.push(["wb_cc", "", ""]); R.push(["wx_m", "", ""]); R.push(["wy_m", "", ""]); R.push(["wh_m", "", ""]);
    R.push(["# Τελικές (συνορθωμένες) συντεταγμένες των νέων στάσεων σε ΕΓΣΑ 87"]);
    for (const id of newStations()) { R.push(["E", nm(id), ""]); R.push(["N", nm(id), ""]); R.push(["H", nm(id), ""]); }
    return R;
  }

  function grade4(file, text) {
    const st = S(), sol = SIM.solve(st, SIM.expected(st)), vals = new Map(), items = [];
    for (const r of CSV.parse(text)) {
      if (!r[0] || r[0].startsWith("#")) continue;
      vals.set((r[0] + "|" + (r[1] || "")).toUpperCase().replace(/\s/g, ""), CSV.toNum(r[2]));
    }
    const get = k => { const v = vals.get(k.toUpperCase()); return v != null && isFinite(v) ? v : null; };
    const add = (group, label, v, exp, full, half, dec, abs = false) => items.push({
      group, label, value: v == null ? null : v.toFixed(dec),
      status: v == null ? null : SIM.gradeItem(abs ? Math.abs(v) - Math.abs(exp) : v - exp, full, half) });
    add("Σφάλματα κλεισίματος", "w_β (cc)", get("WB_CC|"), sol.wb * 1e4, 2, 10, 1, true);
    add("Σφάλματα κλεισίματος", "w_x (m)", get("WX_M|"), sol.wx, 0.002, 0.010, 3, true);
    add("Σφάλματα κλεισίματος", "w_y (m)", get("WY_M|"), sol.wy, 0.002, 0.010, 3, true);
    add("Σφάλματα κλεισίματος", "w_h (m)", get("WH_M|"), sol.wh, 0.002, 0.010, 3, true);
    for (const id of newStations()) {
      const c = sol.coords[id], n = nm(id);
      add("Συντεταγμένες", `E ${n} (m)`, get(`E|${n}`), c.E, 0.005, 0.020, 3);
      add("Συντεταγμένες", `N ${n} (m)`, get(`N|${n}`), c.N, 0.005, 0.020, 3);
      add("Υψόμετρα", `H ${n} (m)`, get(`H|${n}`), c.H, 0.005, 0.020, 3);
    }
    const notes = [];
    const wbS = get("WB_CC|");
    if (wbS != null && Math.sign(wbS) !== Math.sign(sol.wb) && Math.abs(Math.abs(wbS) - Math.abs(sol.wb * 1e4)) <= 2)
      notes.push("Το μέγεθος του w_β είναι σωστό αλλά με αντίθετο πρόσημο από τη σύμβαση w = σωστή − υπολογισμένη. Έλεγξε τη φορά της διόρθωσης.");
    const sc = score(items, { "Σφάλματα κλεισίματος": 25, "Συντεταγμένες": 55, "Υψόμετρα": 20 });
    st.attempts.p4++;
    st.results.p4 = { score: sc, items, file, when: Date.now(), attempt: st.attempts.p4, notes,
                      ratio: sol.ratio };
    Store.save();
  }

  /* ---------------- UI ---------------- */
  function bindUpload(inputSel, btnSel, fn, phase) {
    $(btnSel).onclick = async () => {
      try {
        const f = await readFile($(inputSel));
        fn(f.name, f.text);
        App.refresh();
        toast(`Η υποβολή καταχωρήθηκε: ${S().results[phase].score.toFixed(1)} / 100`, "ok");
      } catch (e) { toast(e.message, "err"); }
      $(inputSel).value = "";
    };
  }

  function render() {
    const st = S(), has = !!st.obs;
    $("#p3-locked").hidden = has; $("#p3-work").hidden = !has;
    $("#p4-locked").hidden = has; $("#p4-work").hidden = !has;
    renderResult($("#p3-result"), st.results.p3);
    renderResult($("#p4-result"), st.results.p4);
  }

  function init() {
    const tpl = (sel, base, rows, sheet, widths) => {
      $(sel).onclick = () => download(Phase2.filename(base, "csv"), CSV.build(rows()), "text/csv;charset=utf-8");
      $(sel + "x").onclick = () => download(Phase2.filename(base, "xlsx"),
        Sheet.toXLSX([{ name: sheet, grid: Sheet.fromRows(rows(), widths) }]));
    };
    tpl("#p3-tpl", "anigmenes_metriseis", template3, "Ανηγμένες μετρήσεις", [10, 12, 12, 12, 14]);
    tpl("#p4-tpl", "epilysi_odeysis", template4, "Επίλυση όδευσης", [10, 12, 16]);
    bindUpload("#p3-file", "#p3-submit", grade3, "p3");
    bindUpload("#p4-file", "#p4-submit", grade4, "p4");
  }

  return { init, render, renderResult, score };
})();
