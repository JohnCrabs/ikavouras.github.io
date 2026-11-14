/* =========================================================================
   CTopoSim — Φάση 2: Έντυπο πολυγωνομετρίας (μετρήσεις υπαίθρου)
   ========================================================================= */
"use strict";

const Phase2 = (() => {
  const S = () => Store.s;
  const name = id => S().points[id].name;
  const REDUCTION = {
    none: "Χωρίς αναγωγή (απόσταση εδάφους = απόσταση ΕΓΣΑ 87)",
    k: "Αναγωγή με τον συντελεστή κλίμακας k της περιοχής",
    kH: "Αναγωγή με k και με το υψόμετρο: R/(R+Hm)",
  };
  const DISTRIB = { length: "Ανάλογα με τα μήκη των πλευρών", equal: "Ισοκατανομή σε όλες τις πλευρές" };

  function knownPoints() {
    const q = S().seq, L = q.length;
    return [...new Set([q[0], q[1], q[L - 2], q[L - 1]])].map(id => S().points[id]);
  }

  function generate() {
    const st = S();
    if (!st.finished) return toast("Ολοκλήρωσε πρώτα την όδευση (καρτέλα 1).", "warn");
    if (!st.student.name.trim() || !st.student.am.trim())
      return toast("Συμπλήρωσε ονοματεπώνυμο και ΑΜ (πάνω δεξιά): από αυτά παράγονται τα δικά σου τυχαία σφάλματα.", "warn");
    if (st.obs && !confirm("Νέα σειρά μετρήσεων; Οι προηγούμενες μετρήσεις και οι υποβολές θα διαγραφούν.")) return;
    if (st.obs) st.seedSalt = (st.seedSalt || 0) + 1;
    readSettings();
    st.obs = SIM.generate(st);
    st.results = { p3: null, p4: null, p5: null };
    st.attempts = { p3: 0, p4: 0, p5: 0 };
    st.tachy = { setups: [], cur: null, nextP: 1 };
    Store.save();
    App.refresh();
    toast("Οι μετρήσεις υπαίθρου δημιουργήθηκαν. Κατέβασε το έντυπο.", "ok");
  }

  function readSettings() {
    const st = S().settings;
    st.reduction = $("#p2-red").value;
    st.distribution = $("#p2-dist").value;
    const n = (sel, def) => { const v = parseFloat($(sel).value); return isFinite(v) && v > 0 ? v : def; };
    st.sigB = [n("#p2-sb0", 3), n("#p2-sb1", 10)].sort((a, b) => a - b);
    st.sigD = [n("#p2-sd0", 1), n("#p2-sd1", 5)].sort((a, b) => a - b);
    const m = (sel, def, lo, hi) => { const v = parseFloat(String($(sel).value).replace(",", ".")); return isFinite(v) && v >= lo && v <= hi ? v : def; };
    st.iRange = [m("#p2-i0", 1.45, 0.5, 2.5), m("#p2-i1", 1.75, 0.5, 2.5)].sort((a, b) => a - b);
    st.iTyp = [m("#p2-it0", 1.55, 0.5, 2.5), m("#p2-it1", 1.65, 0.5, 2.5)].sort((a, b) => a - b);
    st.iTyp = [Math.max(st.iTyp[0], st.iRange[0]), Math.min(st.iTyp[1], st.iRange[1])];
    if (st.iTyp[0] > st.iTyp[1]) st.iTyp = [...st.iRange];
    st.tH = m("#p2-t", 1.5, 0, 5);
  }

  /* ---------------- Σειρές εντύπου ---------------- */
  function obsRows() {
    const rows = [];
    for (const u of S().obs.setups) u.sights.forEach((s, k) => rows.push({
      station: k === 0 ? name(u.station) : "", i: k === 0 ? u.i : null,
      target: name(s.target), role: s.role, orient: s.orient, s,
    }));
    return rows;
  }

  function formCSV() {
    const st = S(), N = CSV.num, R = [];
    R.push(["ΕΝΤΥΠΟ ΠΟΛΥΓΩΝΟΜΕΤΡΙΑΣ — CTopoSim"]);
    R.push(["Φοιτητής", st.student.name, "ΑΜ", st.student.am]);
    R.push(["Ημερομηνία μετρήσεων", new Date(st.obs.created).toLocaleString("el-GR")]);
    R.push(["Αναγωγή αποστάσεων", REDUCTION[st.settings.reduction]]);
    R.push(["Κατανομή σφαλμάτων", DISTRIB[st.settings.distribution]]);
    R.push(["Ύψος στόχου Υ.Σ. (σταθερό)", N(st.settings.tH, 3) + " m"]);
    R.push(["Γωνίες σε grad, αποστάσεις και ύψη σε m. Hz: οριζόντια ανάγνωση, V: ζενίθια ανάγνωση, S: κεκλιμένη απόσταση"]);
    R.push([]);
    R.push(["ΓΝΩΣΤΑ ΣΗΜΕΙΑ (ΕΓΣΑ 87)"]);
    R.push(["Σημείο", "E (m)", "N (m)", "H (m)"]);
    for (const p of knownPoints()) R.push([p.name, N(p.E, 3), N(p.N, 3), N(p.H, 3)]);
    R.push([]);
    R.push(["ΜΕΤΡΗΣΕΙΣ ΥΠΑΙΘΡΟΥ (με τη σειρά της όδευσης)"]);
    R.push(["Στάση", "i (m)", "Σκόπευση", "t (m)", "Hz I (grad)", "Hz II (grad)", "V I (grad)", "V II (grad)",
            "S I (m)", "S II (m)", "r μέση (grad)", "β (grad)", "z (grad)", "D (m)", "Δh (m)"]);
    for (const r of obsRows()) {
      const s = r.s;
      R.push([r.station, r.i != null ? N(r.i, 3) : "", r.target + (r.orient ? " (προσαν.)" : ""),
        N(s.t, 3), N(s.HzI, 4), N(s.HzII, 4), N(s.VI, 4), N(s.VII, 4), N(s.SI, 3), N(s.SII, 3), "", "", "", "", ""]);
    }
    return CSV.build(R);
  }

  function filename(base, ext) {
    const am = (S().student.am || "student").replace(/[^\w\-]/g, "");
    return `${base}_${am}.${ext}`;
  }

  /* ---------------- Εκτυπώσιμο έντυπο ---------------- */
  function printForm() {
    const st = S(), F = GEO.fmt;
    const rows = obsRows().map(r => `<tr${r.station ? ' class="first"' : ""}>
      <td><b>${r.station}</b></td><td>${r.i != null ? F(r.i, 3) : ""}</td><td>${r.target}${r.orient ? " <small>(προσαν.)</small>" : ""}</td>
      <td>${r.s.t != null ? F(r.s.t, 3) : "—"}</td><td>${F(r.s.HzI, 4)}</td><td>${F(r.s.HzII, 4)}</td>
      <td>${F(r.s.VI, 4)}</td><td>${F(r.s.VII, 4)}</td><td>${F(r.s.SI, 3)}</td><td>${F(r.s.SII, 3)}</td>
      <td></td><td></td><td></td><td></td><td></td></tr>`).join("");
    const known = knownPoints().map(p => `<tr><td><b>${p.name}</b></td><td>${F(p.E, 3)}</td><td>${F(p.N, 3)}</td><td>${F(p.H, 3)}</td></tr>`).join("");
    const q = st.seq, sol = q.slice(1, q.length - 1).map(id => `<tr><td><b>${name(id)}</b></td>${"<td></td>".repeat(11)}</tr>`).join("");
    const html = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Έντυπο πολυγωνομετρίας — ${st.student.am}</title>
<style>body{font:12px system-ui,Segoe UI,Arial;margin:18px;color:#111}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:3px 5px;text-align:center}th{background:#e8eef6}
tr.first td{border-top:2px solid #333}.meta td{border:none;text-align:left;padding:1px 8px 1px 0}.calc{background:#fffbe6}
@media print{button{display:none}@page{size:A4 landscape;margin:10mm}}</style></head><body>
<button onclick="print()">Εκτύπωση / PDF</button>
<h1>ΕΝΤΥΠΟ ΠΟΛΥΓΩΝΟΜΕΤΡΙΑΣ</h1>
<table class="meta"><tr><td>Φοιτητής: <b>${st.student.name}</b></td><td>ΑΜ: <b>${st.student.am}</b></td>
<td>Μετρήσεις: ${new Date(st.obs.created).toLocaleString("el-GR")}</td></tr>
<tr><td colspan="3">Αναγωγή αποστάσεων: <b>${REDUCTION[st.settings.reduction]}</b> · Κατανομή σφαλμάτων: <b>${DISTRIB[st.settings.distribution]}</b> · Υ.Σ. (σταθερό): <b>${F(st.settings.tH, 3)} m</b></td></tr></table>
<h2>Γνωστά σημεία (ΕΓΣΑ 87)</h2>
<table style="width:50%"><tr><th>Σημείο</th><th>E (m)</th><th>N (m)</th><th>H (m)</th></tr>${known}</table>
<h2>Μετρήσεις υπαίθρου</h2>
<table><tr><th>Στάση</th><th>i (m)</th><th>Σκόπευση</th><th>t (m)</th><th>Hz I</th><th>Hz II</th><th>V I</th><th>V II</th>
<th>S I (m)</th><th>S II (m)</th><th class="calc">r μέση</th><th class="calc">β</th><th class="calc">z</th><th class="calc">D (m)</th><th class="calc">Δh (m)</th></tr>${rows}</table>
<h2>Επίλυση όδευσης</h2>
<table><tr><th>Σημείο</th><th>β διορθ.</th><th>α</th><th>D (m)</th><th>D' ΕΓΣΑ (m)</th><th>Δx</th><th>Δy</th><th>vx</th><th>vy</th><th>E (m)</th><th>N (m)</th><th>H (m)</th></tr>${sol}</table>
<p>w<sub>β</sub> = ……… cc &nbsp; w<sub>x</sub> = ……… m &nbsp; w<sub>y</sub> = ……… m &nbsp; w<sub>s</sub> = ……… m &nbsp; 1 : ……… &nbsp; w<sub>h</sub> = ……… m</p>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Ο browser μπλόκαρε το νέο παράθυρο.", "warn");
    w.document.write(html); w.document.close();
  }

  /* ---------------- Απόδοση ---------------- */
  function render() {
    const st = S(), has = !!st.obs;
    $("#p2-red").value = st.settings.reduction;
    $("#p2-dist").value = st.settings.distribution;
    $("#p2-sb0").value = st.settings.sigB[0]; $("#p2-sb1").value = st.settings.sigB[1];
    $("#p2-sd0").value = st.settings.sigD[0]; $("#p2-sd1").value = st.settings.sigD[1];
    $("#p2-dec").value = st.settings.decimal;
    $("#p2-i0").value = st.settings.iRange[0]; $("#p2-i1").value = st.settings.iRange[1];
    $("#p2-it0").value = st.settings.iTyp[0]; $("#p2-it1").value = st.settings.iTyp[1];
    $("#p2-t").value = st.settings.tH;
    $$("#p2-settings select, #p2-settings input").forEach(e => e.disabled = has);
    $("#p2-gen").textContent = has ? "Νέα σειρά μετρήσεων" : "Δημιουργία μετρήσεων υπαίθρου";
    $("#p2-gen").disabled = !st.finished;
    $("#p2-out").hidden = !has;
    if (!has) return;
    const F = GEO.fmt, tb = $("#p2-table tbody");
    tb.innerHTML = "";
    for (const r of obsRows()) tb.append(h("tr", { class: r.station ? "first" : "" },
      h("td", {}, h("b", {}, r.station)), h("td", { class: "num" }, r.i != null ? F(r.i, 3) : ""),
      h("td", {}, r.target + (r.orient ? " (προσαν.)" : "")), h("td", { class: "num" }, r.s.t != null ? F(r.s.t, 3) : "—"),
      h("td", { class: "num" }, F(r.s.HzI, 4)), h("td", { class: "num" }, F(r.s.HzII, 4)),
      h("td", { class: "num" }, F(r.s.VI, 4)), h("td", { class: "num" }, F(r.s.VII, 4)),
      h("td", { class: "num" }, F(r.s.SI, 3)), h("td", { class: "num" }, F(r.s.SII, 3))));
    const kb = $("#p2-known tbody");
    kb.innerHTML = "";
    for (const p of knownPoints()) kb.append(h("tr", {}, h("td", {}, h("b", {}, p.name)),
      h("td", { class: "num" }, F(p.E, 3)), h("td", { class: "num" }, F(p.N, 3)), h("td", { class: "num" }, F(p.H, 3))));
  }

  function init() {
    $("#p2-gen").onclick = generate;
    $("#p2-csv").onclick = () => download(filename("entypo_polygonometrias", "csv"), formCSV(), "text/csv;charset=utf-8");
    $("#p2-print").onclick = printForm;
    $("#p2-dec").onchange = e => { S().settings.decimal = e.target.value; Store.save(); };
    // οι αλλαγές στα ύψη ισχύουν αμέσως (και για τον έλεγχο ορατότητας της Φάσης 1)
    for (const id of ["#p2-i0", "#p2-i1", "#p2-it0", "#p2-it1", "#p2-t"])
      $(id).addEventListener("change", () => { if (S().obs) return; readSettings(); Store.save(); Phase1.recompute(); App.refresh(); });
  }

  return { init, render, knownPoints, filename, formCSV, REDUCTION, DISTRIB };
})();
