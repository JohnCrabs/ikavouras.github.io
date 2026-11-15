/* =========================================================================
   CTopoSim — Εφαρμογή: καρτέλες, στοιχεία φοιτητή, έργο, βαθμολογία
   ========================================================================= */
"use strict";

const App = (() => {
  let tab = "p1";
  const S = () => Store.s;

  function showTab(t) {
    tab = t;
    $$("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    $$(".tab").forEach(s => s.hidden = s.id !== "tab-" + t);
    if (t === "p1") Phase1.activate();
    if (t === "p5") Phase5.activate();
    location.hash = t;
    refresh();
  }

  function showSub(section, sub) {
    $$(".subtabs button", section).forEach(b => b.classList.toggle("active", b.dataset.sub === sub));
    $$(".sub", section).forEach(d => d.hidden = !d.classList.contains(sub));
    if (sub === "work" && (section.id === "tab-p1" || section.id === "tab-p5"))
      setTimeout(() => MapView.map.invalidateSize(), 30);
  }

  function refresh() {
    const st = S();
    const lock = { p2: !st.finished, p3: !st.obs, p4: !st.obs, p5: !st.obs, p6: !st.area };
    $$("#tabs button").forEach(b => b.classList.toggle("locked", !!lock[b.dataset.tab]));
    Phase1.render(); Phase2.render(); Grading.render(); Phase5.render(); Phase6.render(); renderReport();
  }

  /* ---------------- Βαθμολογία ---------------- */
  const WEIGHTS = { p3: 25, p4: 35, p5: 25, p6: 15 };
  const TITLES = { p3: "Φάση 3 · Ανηγμένες μετρήσεις", p4: "Φάση 4 · Επίλυση όδευσης", p5: "Φάση 5 · Ταχυμετρία",
                   p6: "Φάση 6 · Γεωαναφορά ορθοφωτοχάρτη" };
  const GRADED = Object.keys(WEIGHTS);

  function totals() {
    const st = S();
    let total = 0;
    for (const [k, w] of Object.entries(WEIGHTS)) if (st.results[k]) total += w * st.results[k].score / 100;
    return total;
  }

  function verifyCode() {
    const st = S();
    const core = JSON.stringify([st.student, st.seq.map(id => [st.points[id].E.toFixed(3), st.points[id].N.toFixed(3)]),
      st.obs && st.obs.created, GRADED.map(k => st.results[k] && [st.results[k].score.toFixed(2), st.results[k].attempt])]);
    return RNG.hash(core).toString(16).toUpperCase().padStart(8, "0");
  }

  function renderReport() {
    const st = S(), tb = $("#rep-table tbody");
    tb.innerHTML = "";
    for (const k of GRADED) {
      const r = st.results[k];
      tb.append(h("tr", {}, h("td", {}, TITLES[k]), h("td", { class: "num" }, WEIGHTS[k] + "%"),
        h("td", { class: "num" }, r ? r.score.toFixed(1) : "—"), h("td", { class: "num" }, st.attempts[k] || 0),
        h("td", {}, r ? new Date(r.when).toLocaleString("el-GR") : "")));
    }
    $("#rep-total").textContent = totals().toFixed(1) + " / 100";
    $("#rep-code").textContent = verifyCode();
    $("#rep-student").textContent = `${st.student.name || "—"} (ΑΜ ${st.student.am || "—"})`;
  }

  function reportText() {
    const st = S(), lines = ["CTopoSim — Αναφορά βαθμολογίας", "",
      `Φοιτητής: ${st.student.name}`, `ΑΜ: ${st.student.am}`, `Ημερομηνία: ${new Date().toLocaleString("el-GR")}`,
      `Όδευση: ${[...st.seq].map(id => st.points[id].name).join(" → ")}`,
      `Αναγωγή αποστάσεων: ${Phase2.REDUCTION[st.settings.reduction]}`, ""];
    for (const k of GRADED) {
      const r = st.results[k];
      lines.push(`${TITLES[k]} (βάρος ${WEIGHTS[k]}%): ${r ? r.score.toFixed(1) + " / 100, υποβολές: " + st.attempts[k] : "δεν υποβλήθηκε"}`);
    }
    lines.push("", `ΣΥΝΟΛΟ: ${totals().toFixed(1)} / 100`, `Κωδικός ελέγχου: ${verifyCode()}`);
    return lines.join("\r\n");
  }

  /* ---------------- Έργο ---------------- */
  function exportProject() {
    download(Phase2.filename("ctoposim_ergo", "json"), JSON.stringify(S(), null, 1), "application/json");
  }
  async function importProject() {
    try {
      const f = await readFile($("#prj-file"));
      Store.replace(JSON.parse(f.text));
      afterLoad();
      toast("Το έργο φορτώθηκε.", "ok");
    } catch (e) { toast("Αποτυχία φόρτωσης: " + e.message, "err"); }
    $("#prj-file").value = "";
  }
  function newProject() {
    if (!confirm("Νέο έργο; Η τρέχουσα εργασία θα διαγραφεί (αποθήκευσέ την πρώτα αν τη χρειάζεσαι).")) return;
    const stu = { ...S().student };
    Store.reset(); S().student = stu; Store.save();
    afterLoad();
  }

  function afterLoad() {
    const st = S();
    $("#stu-name").value = st.student.name;
    $("#stu-am").value = st.student.am;
    MapView.drawArea(st.area);
    MapView.layers.buildings.clearLayers();
    if (st.area) {
      MapView.map.fitBounds([[st.area.south, st.area.west], [st.area.north, st.area.east]]);
      Phase1.loadArea();
    } else { Phase1.clearArea(); Phase1.recompute(); }
    refresh();
  }

  function init() {
    Store.load();
    MapView.init();
    Phase1.init(); Phase2.init(); Grading.init(); Phase5.init(); Phase6.init();

    $$("#tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
    $$(".tab").forEach(sec => $$(".subtabs button", sec).forEach(b => b.onclick = () => showSub(sec, b.dataset.sub)));
    const stuChange = () => {
      const st = S();
      if (st.obs && (st.student.name !== $("#stu-name").value || st.student.am !== $("#stu-am").value)) {
        toast("Τα στοιχεία δεν αλλάζουν αφού δημιουργηθούν οι μετρήσεις.", "warn");
        $("#stu-name").value = st.student.name; $("#stu-am").value = st.student.am; return;
      }
      st.student.name = $("#stu-name").value.trim(); st.student.am = $("#stu-am").value.trim();
      Store.save(); renderReport();
    };
    $("#stu-name").onchange = stuChange; $("#stu-am").onchange = stuChange;
    $("#prj-save").onclick = exportProject;
    $("#prj-open").onclick = () => $("#prj-file").click();
    $("#prj-file").onchange = importProject;
    $("#prj-new").onclick = newProject;
    $("#rep-dl").onclick = () => download(Phase2.filename("bathmologia", "txt"), "﻿" + reportText());

    if (window.renderMathInElement)
      renderMathInElement(document.body, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
                                           throwOnError: false });
    Quadrant.build($("#quad-widget"));
    Quadrant.build($("#quad-widget-fp2"));
    Reduction.build();
    afterLoad();
    const t = (location.hash || "#p1").slice(1);
    showTab(["p1", "p2", "p3", "p4", "p5", "p6", "rep"].includes(t) ? t : "p1");
  }

  return { init, refresh, showTab };
})();

window.addEventListener("load", App.init);
