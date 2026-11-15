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

  const MAX_ATTEMPTS = 3;
  /** επιτρέπεται νέα υποβολή; */
  function canSubmit(k) {
    const n = S().attempts[k] || 0;
    if (n >= MAX_ATTEMPTS) { toast(`Έχεις ήδη κάνει ${MAX_ATTEMPTS} υποβολές σε αυτή τη φάση. Ισχύει ο καλύτερος βαθμός σου.`, "warn", 7000); return false; }
    return true;
  }
  /** καταχώριση υποβολής: κρατά την τελευταία και τον καλύτερο βαθμό */
  function commit(k, res) {
    const st = S(), prev = st.results[k];
    st.attempts[k] = (st.attempts[k] || 0) + 1;
    res.attempt = st.attempts[k];
    const pb = prev && (prev.best || { score: prev.score, attempt: prev.attempt });
    res.best = pb && pb.score > res.score ? pb : { score: res.score, attempt: res.attempt };
    st.results[k] = res;
    Store.save();
  }
  /** βαθμός που μετράει (ο καλύτερος) */
  const finalScore = r => r ? (r.best ? r.best.score : r.score) : null;

  /** κοινή απόδοση πίνακα αποτελεσμάτων */
  function renderResult(box, res, k) {
    box.innerHTML = "";
    const n = k ? (S().attempts[k] || 0) : 0;
    if (k) box.append(h("p", { class: "muted small" }, `Υποβολές: ${n} / ${MAX_ATTEMPTS}` +
      (n >= MAX_ATTEMPTS ? " · δεν επιτρέπονται άλλες υποβολές." : ` · απομένουν ${MAX_ATTEMPTS - n}. Μετράει ο καλύτερος βαθμός.`)));
    if (!res) return;
    box.append(h("div", { class: "score" },
      h("span", {}, "Βαθμός υποβολής: "), h("b", {}, res.score.toFixed(1) + " / 100"),
      h("small", {}, ` · αρχείο «${res.file}» · ${new Date(res.when).toLocaleString("el-GR")} · υποβολή #${res.attempt}`)));
    if (res.best && res.best.attempt !== res.attempt)
      box.append(h("p", { class: "small" }, h("b", {}, `Καλύτερος βαθμός: ${res.best.score.toFixed(1)} / 100`), ` (υποβολή #${res.best.attempt}) — αυτός μετράει.`));
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
    const add = (group, label, key, exp, full, half, dec, angle = false) => {
      const v = vals.has(key) ? vals.get(key) : null;
      const ok = v != null && isFinite(v);
      const d = ok ? (angle ? ((v - exp + 600) % 400) - 200 : v - exp) : null;     // γωνίες: διαφορά mod 400
      items.push({ group, label, value: ok ? v.toFixed(dec) : null,
                   status: ok ? SIM.gradeItem(d, full, half) : null });
    };
    // ανοχές (πλήρης / μισός βαθμός): επιτρέπουν μικροσφάλματα στρογγυλοποίησης
    for (const b of ex.betas)
      add("Γωνίες β", `β ${b.label} (grad)`, `BETA|${nm(b.back)}|${nm(b.station)}|${nm(b.fwd)}`.toUpperCase(),
          b.value, 0.0010, 0.0025, 4, true);
    for (const l of ex.legs)
      add("Αποστάσεις D", `D ${l.label} (m)`, `D|${nm(l.from)}|${nm(l.to)}`.toUpperCase(), l.D, 0.010, 0.020, 3);
    for (const l of ex.legs)
      add("Υψομ. διαφορές Δh", `Δh ${l.label} (m)`, `DH|${nm(l.from)}|${nm(l.to)}`.toUpperCase(), l.dH, 0.010, 0.020, 3);
    const notes = [];
    if (!vals.size) notes.push("Δεν αναγνωρίστηκε καμία γραμμή. Χρησιμοποίησε το πρότυπο CSV.");
    const sc = score(items, { "Γωνίες β": 40, "Αποστάσεις D": 30, "Υψομ. διαφορές Δh": 30 });
    commit("p3", { score: sc, items, file, when: Date.now(), notes });
  }

  /* ======================= ΦΑΣΗ 4 ======================= */
  const newStations = () => { const q = S().seq; return q.slice(2, q.length - 2); };

  function template4() {
    const R = [];
    R.push(["# Σφάλματα κλεισίματος: w = (τιμή από τα γνωστά σημεία) − (τιμή από τις μετρήσεις)"]);
    R.push(["Είδος", "Τιμή"]);
    R.push(["wb_cc", ""]); R.push(["wx_m", ""]); R.push(["wy_m", ""]); R.push(["wh_m", ""]);
    R.push(["# Τελικές (συνορθωμένες) συντεταγμένες των νέων στάσεων σε ΕΓΣΑ 87"]);
    R.push(["Σημείο", "E (m)", "N (m)", "H (m)"]);
    for (const id of newStations()) R.push([nm(id), "", "", ""]);
    return R;
  }

  function grade4(file, text) {
    const st = S(), sol = SIM.solve(st, SIM.expected(st)), vals = new Map(), items = [];
    const names = new Set(newStations().map(id => nm(id).toUpperCase().replace(/\s/g, "")));
    const num = x => { const v = CSV.toNum(x); return v != null && isFinite(v) ? v : null; };
    for (const r of CSV.parse(text)) {
      if (!r[0] || r[0].startsWith("#")) continue;
      const k0 = r[0].toUpperCase().replace(/\s/g, "");
      if (names.has(k0)) {                                   // νέα μορφή: Σημείο; E; N; H
        ["E", "N", "H"].forEach((c, i) => { const v = num(r[i + 1]); if (v != null) vals.set(`${c}|${k0}`, v); });
      } else if (/^W[BXYH]_/.test(k0)) {                     // σφάλματα: τιμή στη 2η ή (παλιά μορφή) στην 3η στήλη
        const v = num(r[1]) != null ? num(r[1]) : num(r[2]);
        if (v != null) vals.set(k0 + "|", v);
      } else {                                               // παλιά μορφή: Είδος; Σημείο; Τιμή
        const v = num(r[2]);
        if (v != null) vals.set((k0 + "|" + (r[1] || "")).toUpperCase().replace(/\s/g, ""), v);
      }
    }
    const get = k => { const v = vals.get(k.toUpperCase()); return v != null && isFinite(v) ? v : null; };
    const add = (group, label, v, exp, full, half, dec, abs = false) => items.push({
      group, label, value: v == null ? null : v.toFixed(dec),
      status: v == null ? null : SIM.gradeItem(abs ? Math.abs(v) - Math.abs(exp) : v - exp, full, half) });
    // ανοχές: επιτρέπουν μικροσφάλματα στρογγυλοποίησης (υπολογισμός με αριθμομηχανή χειρός)
    add("Σφάλματα κλεισίματος", "w_β (cc)", get("WB_CC|"), sol.wb * 1e4, 10, 25, 1, true);
    add("Σφάλματα κλεισίματος", "w_x (m)", get("WX_M|"), sol.wx, 0.010, 0.020, 3, true);
    add("Σφάλματα κλεισίματος", "w_y (m)", get("WY_M|"), sol.wy, 0.010, 0.020, 3, true);
    add("Σφάλματα κλεισίματος", "w_h (m)", get("WH_M|"), sol.wh, 0.010, 0.020, 3, true);
    for (const id of newStations()) {
      const c = sol.coords[id], n = nm(id);
      add("Συντεταγμένες", `E ${n} (m)`, get(`E|${n}`), c.E, 0.020, 0.050, 3);
      add("Συντεταγμένες", `N ${n} (m)`, get(`N|${n}`), c.N, 0.020, 0.050, 3);
      add("Υψόμετρα", `H ${n} (m)`, get(`H|${n}`), c.H, 0.020, 0.050, 3);
    }
    const notes = [];
    const wbS = get("WB_CC|");
    if (wbS != null && Math.sign(wbS) !== Math.sign(sol.wb) && Math.abs(Math.abs(wbS) - Math.abs(sol.wb * 1e4)) <= 10)
      notes.push("Το μέγεθος του w_β είναι σωστό αλλά με αντίθετο πρόσημο από τη σύμβαση w = σωστή − υπολογισμένη. Έλεγξε τη φορά της διόρθωσης.");
    const sc = score(items, { "Σφάλματα κλεισίματος": 25, "Συντεταγμένες": 55, "Υψόμετρα": 20 });
    commit("p4", { score: sc, items, file, when: Date.now(), notes, ratio: sol.ratio });
  }

  /* ---------------- UI ---------------- */
  function bindUpload(inputSel, btnSel, fn, phase) {
    $(btnSel).onclick = async () => {
      if (!canSubmit(phase)) return;
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
    renderResult($("#p3-result"), st.results.p3, "p3");
    renderResult($("#p4-result"), st.results.p4, "p4");
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

  return { init, render, renderResult, score, canSubmit, commit, finalScore, MAX_ATTEMPTS };
})();
