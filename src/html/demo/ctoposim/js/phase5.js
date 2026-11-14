/* =========================================================================
   CTopoSim — Φάση 5: Ταχυμετρία (1η θέση τηλεσκοπίου)
   ========================================================================= */
"use strict";

const Phase5 = (() => {
  const S = () => Store.s;
  const MAX_RANGE = 600;
  let shooting = false;
  const nm = id => S().points[id].name;
  const cur = () => S().tachy.setups.find(u => u.id === S().tachy.cur);

  function stationIds() { return [...new Set(S().seq)]; }

  function newSetup() {
    const st = S(), a = $("#p5-st").value, b = $("#p5-bs").value;
    if (!st.obs) return toast("Δημιούργησε πρώτα τις μετρήσεις της όδευσης (καρτέλα 2).", "warn");
    if (!a || !b || a === b) return toast("Διάλεξε διαφορετική στάση οργάνου και στάση μηδενισμού.", "warn");
    const A = st.points[a], B = st.points[b];
    const los = DEM.hasDEM() ? DEM.lineOfSight({ lat: A.lat, lon: A.lon, z: A.H + 1.6 }, { lat: B.lat, lon: B.lon, z: B.H + st.settings.tH + 0.05 }) : { visible: true };
    if (!los.visible && !confirm(`Δεν υπάρχει οπτική επαφή ${A.name} → ${B.name} (${los.obstacle.type}). Συνέχεια;`)) return;
    const u = SIM.newTachySetup(st, a, b);
    st.tachy.setups.push(u); st.tachy.cur = u.id;
    shooting = true;
    Store.save(); App.refresh();
    toast(`Στάση ${A.name}, μηδενισμός στο ${B.name}. Κάνε κλικ στα σημεία λεπτομερειών.`, "ok");
  }

  function onMapClick(e) {
    const st = S(), u = cur();
    if (!shooting || !u) return;
    const a = st.area;
    if (a && (e.latlng.lat < a.south || e.latlng.lat > a.north || e.latlng.lng < a.west || e.latlng.lng > a.east))
      return toast("Το σημείο είναι εκτός της περιοχής μελέτης.", "warn");
    const A = st.points[u.station];
    const tgt = makeTarget(e.latlng.lat, e.latlng.lng, $("#p5-mode").value, A);
    if (!tgt) return;
    const d = GEO.dist(A, tgt);
    if (d > MAX_RANGE) return toast(`Απόσταση ${d.toFixed(0)} m: εκτός εμβέλειας (${MAX_RANGE} m).`, "warn");
    if (d < 2) return toast("Το σημείο είναι πάνω στη στάση.", "warn");
    const t = tgt.onRoof ? 0 : st.settings.tH;
    if (DEM.hasDEM()) {
      const los = DEM.lineOfSight({ lat: A.lat, lon: A.lon, z: A.H + u.i }, { lat: tgt.lat, lon: tgt.lon, z: tgt.H + t + 0.05 });
      if (!los.visible) return toast(`Δεν υπάρχει οπτική επαφή: ${los.obstacle.type} στα ${los.obstacle.d.toFixed(0)} m.` +
        (tgt.kind === "roof" ? " Σκόπευσε ακμή ή γωνία του δώματος που βλέπει προς το όργανο." : ""), "warn");
    }
    const obs = SIM.shoot(st, u, tgt);
    u.shots.push({ name: "P" + st.tachy.nextP++, ...tgt, ...obs });
    Store.save(); App.refresh();
  }

  const KIND = { ground: "έδαφος", roof: "δώμα", base: "βάση τοίχου" };

  /**
   * Δημιουργεί τον στόχο ανάλογα με το είδος σκόπευσης:
   *  ground: σημείο εδάφους με ράβδο (Υ.Σ. από τις ρυθμίσεις)
   *  roof:   ακμή/γωνία δώματος κτιρίου, χωρίς πρίσμα (t = 0)
   *  base:   ακμή/γωνία κτιρίου στη βάση του τοίχου, με ράβδο (Υ.Σ. από τις ρυθμίσεις)
   *  auto:   κοντά (≤ 3 m) ή μέσα σε κτίριο → roof, αλλιώς ground
   */
  function makeTarget(lat, lon, mode, A) {
    const near = DEM.nearestEdge(lat, lon, mode === "auto" ? 3 : 8);
    const inside = DEM.buildingAt(lat, lon);
    if (mode === "auto") mode = (near || inside) ? "roof" : "ground";
    let kind = mode, p = { lat, lon }, bh = 0;
    if (mode === "roof" || mode === "base") {
      // κλικ στο εσωτερικό κτιρίου: στόχος η γωνία/ακμή του κτιρίου που είναι πλησιέστερα στο όργανο
      const n = inside ? DEM.nearestEdge(A.lat, A.lon, 1e6, inside) : near;
      if (!n) { toast("Δεν υπάρχει κτίριο κοντά στο σημείο (8 m). Κάνε κλικ πάνω ή δίπλα σε ακμή κτιρίου.", "warn"); return null; }
      p = { lat: n.lat, lon: n.lon }; bh = mode === "roof" ? n.b.h : 0;
      kind = mode;
      p.corner = n.corner;
    } else if (inside) {
      toast("Το σημείο είναι μέσα σε κτίριο. Διάλεξε «Δώμα» ή «Βάση τοίχου».", "warn"); return null;
    }
    const terr = DEM.terrainAt(p.lat, p.lon);
    const { E, N } = GEO.toEGSA(p.lat, p.lon);
    return { lat: p.lat, lon: p.lon, E, N, H: (isFinite(terr) ? terr : A.H) + bh,
             onRoof: kind === "roof", kind, corner: !!p.corner };
  }

  function undoShot() {
    const u = cur();
    if (!u || !u.shots.length) return;
    u.shots.pop(); S().tachy.nextP--;
    Store.save(); App.refresh();
  }

  function deleteSetup() {
    const st = S(), u = cur();
    if (!u || !confirm(`Διαγραφή της στάσης ${nm(u.station)} με ${u.shots.length} σημεία;`)) return;
    st.tachy.setups = st.tachy.setups.filter(x => x !== u);
    st.tachy.cur = st.tachy.setups.length ? st.tachy.setups[st.tachy.setups.length - 1].id : null;
    let n = 1;
    st.tachy.setups.forEach(x => x.shots.forEach(sh => sh.name = "P" + n++));
    st.tachy.nextP = n;
    Store.save(); App.refresh();
  }

  /* ---------------- Αρχεία ---------------- */
  function fieldBook() {
    const st = S(), N = CSV.num, R = [["ΤΑΧΥΜΕΤΡΙΑ — CTopoSim"], ["Φοιτητής", st.student.name, "ΑΜ", st.student.am],
      ["Μετρήσεις σε 1η θέση τηλεσκοπίου. Hz: οριζόντια ανάγνωση (grad), V: ζενίθια ανάγνωση (grad), S: κεκλιμένη απόσταση (m), t: ύψος στόχου (m)"]];
    for (const u of st.tachy.setups) {
      R.push([]);
      R.push(["Στάση", nm(u.station), "i (m)", N(u.i, 3), "Μηδενισμός προς", nm(u.backsight)]);
      R.push(["Σημείο", "Hz (grad)", "V (grad)", "S (m)", "t (m)"]);
      R.push([nm(u.backsight) + " (μηδενισμός)", N(0, 4), "", "", ""]);
      for (const s of u.shots) R.push([s.name, N(s.Hz, 4), N(s.V, 4), N(s.S, 3), N(s.t, 3)]);
    }
    return CSV.build(R);
  }

  function template() {
    const R = [["Σημείο", "E (m)", "N (m)", "H (m)"]];
    for (const u of S().tachy.setups) for (const s of u.shots) R.push([s.name, "", "", ""]);
    return CSV.build(R);
  }

  function grade(file, text) {
    const st = S(), sol = SIM.solve(st, SIM.expected(st)), vals = new Map(), items = [];
    for (const r of CSV.parse(text)) {
      if (!r[0] || !/^P\d+$/i.test(r[0].trim())) continue;
      vals.set(r[0].trim().toUpperCase(), [CSV.toNum(r[1]), CSV.toNum(r[2]), CSV.toNum(r[3])]);
    }
    for (const u of st.tachy.setups) for (const s of u.shots) {
      const ex = SIM.tachyExpected(st, sol, u, s), v = vals.get(s.name.toUpperCase()) || [];
      [["E", 0, "Συντεταγμένες"], ["N", 1, "Συντεταγμένες"], ["H", 2, "Υψόμετρα"]].forEach(([c, k, g]) => {
        const x = isFinite(v[k]) ? v[k] : null;
        items.push({ group: g, label: `${c} ${s.name} (m)`, value: x == null ? null : x.toFixed(3),
                     status: x == null ? null : SIM.gradeItem(x - ex[c], 0.01, 0.03) });
      });
    }
    const notes = vals.size ? [] : ["Δεν αναγνωρίστηκε κανένα σημείο. Χρησιμοποίησε το πρότυπο CSV."];
    st.attempts.p5++;
    st.results.p5 = { score: Grading.score(items, { "Συντεταγμένες": 70, "Υψόμετρα": 30 }), items, file,
                      when: Date.now(), attempt: st.attempts.p5, notes };
    Store.save();
  }

  /* ---------------- Σχεδίαση/απόδοση ---------------- */
  function draw() {
    const g = MapView.layers.tachy;
    g.clearLayers();
    MapView.redraw3D();
    for (const u of S().tachy.setups) {
      const A = S().points[u.station], on = u.id === S().tachy.cur;
      for (const s of u.shots) {
        L.polyline([[A.lat, A.lon], [s.lat, s.lon]], { color: on ? "#7b3294" : "#999", weight: 1, opacity: 0.7, interactive: false }).addTo(g);
        L.circleMarker([s.lat, s.lon], { radius: 4, color: "#fff", weight: 1, fillColor: s.onRoof ? "#e66101" : "#7b3294", fillOpacity: 1 })
          .bindTooltip(s.name, { permanent: true, direction: "right", className: "shot-lbl" }).addTo(g);
      }
    }
  }

  function render() {
    const st = S(), has = !!st.obs;
    $("#p5-locked").hidden = has; $("#p5-work").hidden = !has;
    if (!has) return;
    const ids = stationIds();
    for (const sel of ["#p5-st", "#p5-bs"]) {
      const old = $(sel).value;
      $(sel).innerHTML = "";
      ids.forEach(id => $(sel).append(h("option", { value: id }, nm(id) + (st.points[id].kind === "known" ? " (γνωστό)" : ""))));
      if (ids.includes(old)) $(sel).value = old;
    }
    if (!$("#p5-bs").dataset.init && ids.length > 1) { $("#p5-bs").value = ids[0]; $("#p5-st").value = ids[1]; $("#p5-bs").dataset.init = 1; }
    const u = cur();
    $("#p5-opt-ground").textContent = `Έδαφος (ράβδος, t = ${st.settings.tH.toFixed(3)} m)`;
    $("#p5-opt-base").textContent = `Βάση τοίχου: ακμή/γωνία (ράβδος, t = ${st.settings.tH.toFixed(3)} m)`;
    $("#p5-cur").innerHTML = u ? `Τρέχουσα στάση: <b>${nm(u.station)}</b> · i = <b>${u.i.toFixed(3)} m</b> · ` +
      `μηδενισμός (Hz = 0.0000<sup>g</sup>) προς <b>${nm(u.backsight)}</b>` : "Δεν έχει οριστεί στάση οργάνου.";
    $("#p5-shoot").textContent = shooting && u ? "Σκόπευση: ON" : "Σκόπευση σημείων";
    $("#p5-shoot").classList.toggle("active", shooting && !!u);
    const sel = $("#p5-setups");
    sel.innerHTML = "";
    st.tachy.setups.forEach(x => sel.append(h("option", { value: x.id }, `#${x.id}: ${nm(x.station)} → ${nm(x.backsight)} (${x.shots.length} σημεία)`)));
    if (u) sel.value = u.id;
    const tb = $("#p5-table tbody"), F = GEO.fmt;
    tb.innerHTML = "";
    for (const x of st.tachy.setups) {
      tb.append(h("tr", { class: "first" }, h("td", {}, h("b", {}, nm(x.station))), h("td", {}, nm(x.backsight) + " (μηδ.)"),
        h("td", { class: "num" }, "0.0000"), h("td", {}, ""), h("td", {}, ""), h("td", { class: "num" }, "i=" + F(x.i, 3))));
      for (const s of x.shots) tb.append(h("tr", {}, h("td", {}, ""),
        h("td", {}, s.name + ` (${KIND[s.kind] || (s.onRoof ? "δώμα" : "έδαφος")}${s.corner ? ", γωνία" : ""})`),
        h("td", { class: "num" }, F(s.Hz, 4)), h("td", { class: "num" }, F(s.V, 4)), h("td", { class: "num" }, F(s.S, 3)),
        h("td", { class: "num" }, F(s.t, 3))));
    }
    Grading.renderResult($("#p5-result"), st.results.p5);
    draw();
  }

  function activate() {
    MapView.attach("p5-maphost");
    MapView.onClick(onMapClick);
    MapView.layers.tachy.addTo(MapView.map);
    draw();
  }

  function init() {
    $("#p5-new").onclick = newSetup;
    $("#p5-shoot").onclick = () => { if (!cur()) return toast("Όρισε πρώτα στάση οργάνου.", "warn"); shooting = !shooting; App.refresh(); };
    $("#p5-undo").onclick = undoShot;
    $("#p5-del").onclick = deleteSetup;
    $("#p5-setups").onchange = e => { S().tachy.cur = +e.target.value; Store.save(); App.refresh(); };
    $("#p5-csv").onclick = () => download(Phase2.filename("taxymetria", "csv"), fieldBook(), "text/csv;charset=utf-8");
    $("#p5-tpl").onclick = () => download(Phase2.filename("taxymetria_apotelesmata", "csv"), template(), "text/csv;charset=utf-8");
    $("#p5-submit").onclick = async () => {
      try { const f = await readFile($("#p5-file")); grade(f.name, f.text); App.refresh();
            toast(`Η υποβολή καταχωρήθηκε: ${S().results.p5.score.toFixed(1)} / 100`, "ok"); }
      catch (e) { toast(e.message, "err"); }
      $("#p5-file").value = "";
    };
  }

  return { init, render, activate };
})();
