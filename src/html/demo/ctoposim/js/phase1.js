/* =========================================================================
   CTopoSim — Φάση 1: Περιοχή μελέτης, αναγνώριση, στάσεις όδευσης
   ========================================================================= */
"use strict";

const Phase1 = (() => {
  // ύψος οργάνου (μέσο των συνήθων τιμών) και στόχου για τον έλεγχο ορατότητας
  const instrH = () => (Store.s.settings.iTyp[0] + Store.s.settings.iTyp[1]) / 2;
  const targetH = () => Store.s.settings.tH;
  const MAX_AREA_KM2 = 4;
  let placing = false, legInfo = [], selectedLeg = null, loadGen = 0;
  const S = () => Store.s;

  /* ---------------- Περιοχή μελέτης ---------------- */
  /* Σχεδίαση ορθογωνίου: ο φοιτητής σέρνει ένα ορθογώνιο στον χάρτη (ποντίκι ή αφή). */
  let drawing = false, drawStart = null, drawRect = null;
  const MIN_SIDE = 50;                                  // ελάχιστη πλευρά (m)

  /** διαστάσεις ορθογωνίου σε ΕΓΣΑ 87 */
  function rectSize(a, b) {
    const p = GEO.toEGSA(Math.min(a.lat, b.lat), Math.min(a.lng, b.lng)), q = GEO.toEGSA(Math.max(a.lat, b.lat), Math.max(a.lng, b.lng));
    const w = Math.abs(q.E - p.E), hgt = Math.abs(q.N - p.N);
    return { w, h: hgt, km2: w * hgt / 1e6 };
  }

  function startDrawing() {
    if (S().finished) return toast("Η όδευση είναι κλειδωμένη. Ξεκλείδωσέ την πρώτα.", "warn");
    if (drawing) return stopDrawing();
    drawing = true; placing = false;
    MapView.map.dragging.disable();
    MapView.map.getContainer().classList.add("drawing");
    toast("Σύρε ένα ορθογώνιο στον χάρτη (έως 4 km²). Esc για ακύρωση.", "info");
    App.refresh();
  }

  function stopDrawing() {
    drawing = false; drawStart = null;
    if (drawRect) { drawRect.remove(); drawRect = null; }
    MapView.map.dragging.enable();
    MapView.map.getContainer().classList.remove("drawing");
    App.refresh();
  }

  function bindDrawing() {
    const map = MapView.map, el = map.getContainer();
    const ll = e => map.mouseEventToLatLng(e);
    el.addEventListener("pointerdown", e => {
      if (!drawing || e.button > 0 || e.target.closest(".leaflet-control")) return;
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      drawStart = ll(e);
      drawRect = L.rectangle([drawStart, drawStart], { color: "#1b6ec2", weight: 2, fillOpacity: 0.08, interactive: false }).addTo(map);
      drawRect.bindTooltip("", { permanent: true, direction: "center", className: "rect-lbl" });
    });
    el.addEventListener("pointermove", e => {
      if (!drawing || !drawStart || !drawRect) return;
      const cur = ll(e), z = rectSize(drawStart, cur), bad = z.km2 > MAX_AREA_KM2;
      drawRect.setBounds([drawStart, cur]);
      drawRect.setStyle({ color: bad ? "#d73027" : "#1b6ec2" });
      drawRect.setTooltipContent(`${z.w.toFixed(0)} × ${z.h.toFixed(0)} m · ${z.km2.toFixed(2)} km²${bad ? " (> 4 km²)" : ""}`);
    });
    el.addEventListener("pointerup", async e => {
      if (!drawing || !drawStart) return;
      const a = drawStart, b = ll(e), z = rectSize(a, b);
      drawStart = null;
      if (drawRect) { drawRect.remove(); drawRect = null; }
      if (z.w < MIN_SIDE || z.h < MIN_SIDE)
        return toast(`Το ορθογώνιο είναι πολύ μικρό (${z.w.toFixed(0)} × ${z.h.toFixed(0)} m). Ελάχιστη πλευρά ${MIN_SIDE} m· σύρε ξανά.`, "warn");
      if (z.km2 > MAX_AREA_KM2)
        return toast(`Το ορθογώνιο είναι ${z.km2.toFixed(2)} km². Μέγιστο ${MAX_AREA_KM2} km²· σύρε μικρότερο.`, "warn");
      if (S().seq.length && !confirm("Ο ορισμός νέας περιοχής διαγράφει τις στάσεις που έχεις βάλει. Συνέχεια;")) return stopDrawing();
      stopDrawing();
      S().area = { south: Math.min(a.lat, b.lat), west: Math.min(a.lng, b.lng), north: Math.max(a.lat, b.lat), east: Math.max(a.lng, b.lng) };
      S().points = {}; S().seq = []; S().finished = false;
      Store.save();
      map.fitBounds([[S().area.south, S().area.west], [S().area.north, S().area.east]], { padding: [20, 20] });
      await loadArea();
      App.refresh();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && drawing) stopDrawing(); });
  }

  async function loadArea() {
    const a = S().area;
    if (!a) return;
    const gen = ++loadGen;               // νεότερη φόρτωση ακυρώνει την προηγούμενη
    const stale = () => gen !== loadGen;
    DEM.clearBuildings(); MapView.drawBuildings();
    MapView.drawArea(a);
    const st = $("#p1-area-status");
    st.textContent = "Φόρτωση DEM και κτιρίων…";
    try {
      const n = await DEM.preload(a);
      if (stale()) return;
      st.textContent = `DEM: ${n} πλακίδια. Φόρτωση κτιρίων OSM…`;
      if (!n) toast("Δεν φορτώθηκε το DEM (σύνδεση;). Τα υψόμετρα δεν θα είναι διαθέσιμα.", "err");
    } catch (e) { toast("Σφάλμα DEM: " + e.message, "err"); }
    if (stale()) return;
    await loadBuildingsUI(false);
    if (stale()) return;
    recompute();
    App.refresh();
  }

  /** καμία περιοχή (π.χ. «Νέο»): ακύρωση φόρτωσης σε εξέλιξη και καθαρισμός */
  function clearArea() {
    loadGen++;
    DEM.clearBuildings(); MapView.drawBuildings();
    $("#p1-area-status").textContent = "Δεν έχει οριστεί περιοχή. Σχεδίασε ένα ορθογώνιο έως 4 km².";
  }

  async function loadBuildingsUI(force) {
    const a = S().area, st = $("#p1-area-status");
    if (force) st.textContent = "Επανάληψη φόρτωσης κτιρίων OSM…";
    try {
      const { n: nb, cached, stale } = await DEM.loadBuildings(a, { force, onRetry: sec => {
        if (a === S().area) st.textContent = `Οι διακομιστές κτιρίων (Overpass) είναι απασχολημένοι· νέα προσπάθεια σε ${sec} s…`; } });
      if (stale || a !== S().area) return;
      MapView.drawBuildings();
      const est = DEM.getBuildings().filter(b => b.src === "default").length;
      st.innerHTML = `Περιοχή έτοιμη: DEM ✓, <b>${nb}</b> κτίρια OSM${cached ? " (από την τοπική αποθήκευση)" : ""} ` +
        `(${nb - est} με ύψος/ορόφους, ${est} με εκτίμηση ${DEM.DEFAULT_LEVELS} ορόφων).`;
    } catch (e) {
      if (a !== S().area) return;
      st.innerHTML = "DEM ✓ — τα κτίρια OSM δεν φορτώθηκαν (" + e.message + "). " +
        "Μπορείς να συνεχίσεις: οι στάσεις μπαίνουν κανονικά, αλλά ο έλεγχος ορατότητας θα λάβει υπόψη μόνο το έδαφος. ";
      st.append(h("button", { onclick: async () => { await loadBuildingsUI(true); recompute(); App.refresh(); } }, "↻ Ξαναδοκίμασε"));
      toast("Οι διακομιστές κτιρίων (Overpass API) είναι προσωρινά υπερφορτωμένοι. Πάτα «Ξαναδοκίμασε» σε 1–2 λεπτά.", "warn", 8000);
    }
  }

  async function search() {
    const q = $("#p1-search").value.trim();
    if (!q) return;
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gr&q=" + encodeURIComponent(q));
      const j = await r.json();
      if (!j.length) return toast("Δεν βρέθηκε η τοποθεσία", "warn");
      MapView.map.setView([+j[0].lat, +j[0].lon], 17);
    } catch (e) { toast("Αποτυχία αναζήτησης", "err"); }
  }

  /* ---------------- Στάσεις ---------------- */
  const P = id => S().points[id];
  const isClosed = () => {
    const q = S().seq, L = q.length;
    return L >= 5 && q[L - 2] === q[1] && q[L - 1] === q[0];
  };

  function rename() {
    const q = S().seq, L = q.length, fin = S().finished, closed = isClosed();
    let n = 1;
    q.forEach((id, k) => {
      const p = P(id);
      if (k === 0) { p.name = "T1"; p.kind = "known"; }
      else if (k === 1) { p.name = "T2"; p.kind = "known"; }
      else if (closed && k >= L - 2) { /* T2, T1 ξανά */ }
      else if (fin && k === L - 2) { p.name = "T3"; p.kind = "known"; }
      else if (fin && k === L - 1) { p.name = "T4"; p.kind = "known"; }
      else { p.name = "S" + n++; p.kind = "new"; }
    });
  }

  function makePoint(lat, lon) {
    const { E, N } = GEO.toEGSA(lat, lon);
    const s = DEM.surfaceAt(lat, lon);
    const H = isFinite(s.surface) ? s.surface : 0;
    return { id: "p" + S().nextId++, lat, lon, E, N, H, terrain: s.terrain,
             onRoof: !!s.building, bh: s.building ? s.building.h : 0, name: "", kind: "new" };
  }

  function updatePoint(p, lat, lon) {
    Object.assign(p, makePoint(lat, lon), { id: p.id, name: p.name, kind: p.kind });
    S().nextId--;                 // makePoint αύξησε το μετρητή χωρίς λόγο
  }

  function inArea(lat, lon) {
    const a = S().area;
    return a && lat >= a.south && lat <= a.north && lon >= a.west && lon <= a.east;
  }

  function snapTarget(latlng) {
    const q = S().seq;
    if (q.length < 3) return null;
    const pt = MapView.map.latLngToContainerPoint(latlng);
    for (const id of [q[1], q[0]]) {
      const p = P(id), c = MapView.map.latLngToContainerPoint([p.lat, p.lon]);
      if (pt.distanceTo(c) < 16) return id;
    }
    return null;
  }

  function onMapClick(e) {
    if (!placing) return;
    const st = S(), q = st.seq;
    if (st.finished) return;
    if (!st.area) return toast("Όρισε πρώτα την περιοχή μελέτης.", "warn");
    const snap = snapTarget(e.latlng);
    const last = q[q.length - 1];
    if (last === q[1] && q.length > 2) {          // έγινε snap στο T2: επιτρέπεται μόνο το T1
      if (snap !== q[0]) return toast("Για κλειστή όδευση, μετά το T2 κάνε snap στο T1.", "warn");
      q.push(q[0]);
      st.finished = true;
      placing = false;
      toast("Κλειστή όδευση: επιστροφή στο T2 με προσανατολισμό στο T1.", "ok");
    } else if (snap) {
      if (snap !== q[1]) return toast("Για κλειστή όδευση κάνε πρώτα snap στο T2 και μετά στο T1.", "warn");
      if (q.length < 3) return;
      q.push(q[1]);
      toast("Snap στο T2. Κάνε τώρα snap στο T1 για να κλείσει η όδευση.", "info");
    } else {
      if (!inArea(e.latlng.lat, e.latlng.lng)) return toast("Το σημείο είναι εκτός της περιοχής μελέτης.", "warn");
      const p = makePoint(e.latlng.lat, e.latlng.lng);
      st.points[p.id] = p;
      q.push(p.id);
      if (p.onRoof) toast(`Το σημείο είναι σε δώμα κτιρίου (+${p.bh.toFixed(1)} m).`, "info");
    }
    rename();
    if (st.finished) finalizeKnown();
    Store.save();
    recompute();
    App.refresh();
  }

  function undo() {
    const st = S();
    if (st.finished) return toast("Η όδευση είναι κλειδωμένη.", "warn");
    const id = st.seq.pop();
    if (id && !st.seq.includes(id)) delete st.points[id];
    rename(); Store.save(); recompute(); App.refresh();
  }

  function clearAll() {
    const st = S();
    if (st.finished) return toast("Η όδευση είναι κλειδωμένη.", "warn");
    if (!confirm("Διαγραφή όλων των στάσεων;")) return;
    st.points = {}; st.seq = [];
    Store.save(); recompute(); App.refresh();
  }

  function finalizeKnown() {
    // Οι γνωστές συντεταγμένες δημοσιεύονται στρογγυλεμένες στο mm και θεωρούνται «αληθείς»
    for (const id of new Set(S().seq)) {
      const p = P(id);
      if (p.kind === "known") { p.E = SIM.r3(p.E); p.N = SIM.r3(p.N); p.H = SIM.r3(p.H); }
    }
  }

  function finish() {
    const st = S(), q = st.seq;
    if (st.finished) return;
    if (q.length < 5) return toast("Χρειάζονται τουλάχιστον 5 σημεία: T1, T2, μία νέα στάση, T3, T4.", "warn");
    if (q[q.length - 1] === q[1]) return toast("Ολοκλήρωσε την κλειστή όδευση με snap στο T1.", "warn");
    const blocked = legInfo.filter(l => !l.los.visible);
    if (blocked.length && !confirm(`${blocked.length} σκοπεύσεις δεν έχουν οπτική επαφή (${blocked.map(l => l.label).join(", ")}).\n` +
        "Στο ύπαιθρο αυτό δεν θα μπορούσε να μετρηθεί. Θέλεις να συνεχίσεις παρ' όλα αυτά;")) return;
    st.finished = true; placing = false;
    rename(); finalizeKnown(); Store.save(); recompute(); App.refresh();
    toast("Η όδευση ολοκληρώθηκε. Συνέχισε στην καρτέλα 2 (Έντυπο).", "ok");
  }

  function unlock() {
    const st = S();
    if (st.obs && !confirm("Το ξεκλείδωμα διαγράφει τις μετρήσεις, τις υποβολές και την ταχυμετρία. Συνέχεια;")) return;
    if (isClosed()) { st.seq.splice(-2, 2); }
    st.finished = false; st.obs = null;
    st.results = { p3: null, p4: null, p5: null };
    st.attempts = { p3: 0, p4: 0, p5: 0 };
    st.tachy = { setups: [], cur: null, nextP: 1 };
    rename(); Store.save(); recompute(); App.refresh();
  }

  /* ---------------- Ορατότητα και σχεδίαση ---------------- */
  function recompute() {
    const q = S().seq;
    legInfo = [];
    if (DEM.hasDEM()) for (let k = 0; k < q.length - 1; k++) {
      const a = P(q[k]), b = P(q[k + 1]);
      const los = DEM.lineOfSight({ lat: a.lat, lon: a.lon, z: a.H + instrH() }, { lat: b.lat, lon: b.lon, z: b.H + targetH() + 0.05 });
      const orient = (k === 0) || (S().finished && k === q.length - 2);
      legInfo.push({ k, a, b, los, orient, label: a.name + "–" + b.name, len: GEO.dist(a, b) });
    }
    draw();
  }

  function icon(p) {
    const cls = p.kind === "known" ? "mk-known" : "mk-new";
    return L.divIcon({ className: "mk " + cls, html: `<span>${p.name}</span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  function draw() {
    const g = MapView.layers.traverse;
    g.clearLayers();
    MapView.redraw3D();
    const q = S().seq;
    if (!q.length) return;
    legInfo.forEach(l => {
      L.polyline([[l.a.lat, l.a.lon], [l.b.lat, l.b.lon]], {
        color: l.los.visible ? "#1a9850" : "#d73027", weight: l.orient ? 2.5 : 4,
        dashArray: l.orient ? "8 6" : null, opacity: 0.9,
      }).on("click", () => showProfile(l.k)).addTo(g);
    });
    if (!legInfo.length && q.length > 1)
      L.polyline(q.map(id => [P(id).lat, P(id).lon]), { color: "#555", weight: 3 }).addTo(g);
    for (const id of new Set(q)) {
      const p = P(id);
      const m = L.marker([p.lat, p.lon], { icon: icon(p), draggable: !S().finished, autoPan: true }).addTo(g);
      m.on("dragend", ev => {
        const ll = ev.target.getLatLng();
        if (!inArea(ll.lat, ll.lng)) { toast("Εκτός περιοχής μελέτης.", "warn"); return draw(); }
        updatePoint(p, ll.lat, ll.lng);
        Store.save(); recompute(); App.refresh();
      });
    }
  }

  function showProfile(k) {
    selectedLeg = k;
    renderProfile();
    $$("#p1-legs tr").forEach(tr => tr.classList.toggle("sel", +tr.dataset.k === k));
  }

  function renderProfile() {
    const cv = $("#p1-profile"), l = legInfo.find(x => x.k === selectedLeg);
    const ctx = cv.getContext("2d");
    const W = cv.width = cv.clientWidth * devicePixelRatio, Hh = cv.height = cv.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, W, Hh);
    if (!l) { $("#p1-profile-title").textContent = "Κάνε κλικ σε μια πλευρά για να δεις την τομή εδάφους."; return; }
    const pr = l.los.profile;
    let lo = Infinity, hi = -Infinity;
    for (const p of pr) { lo = Math.min(lo, p.terrain, p.line); hi = Math.max(hi, p.surface, p.line); }
    lo -= 2; hi += 3;
    const pad = 30 * devicePixelRatio;
    const X = d => pad + (W - 2 * pad) * d / l.los.L, Y = z => Hh - pad - (Hh - 2 * pad) * (z - lo) / (hi - lo);
    ctx.fillStyle = "#c9a86b";                                  // κτίρια
    ctx.beginPath(); ctx.moveTo(X(0), Y(lo));
    pr.forEach(p => ctx.lineTo(X(p.d), Y(p.surface))); ctx.lineTo(X(l.los.L), Y(lo)); ctx.fill();
    ctx.fillStyle = "#7fae6b";                                  // έδαφος
    ctx.beginPath(); ctx.moveTo(X(0), Y(lo));
    pr.forEach(p => ctx.lineTo(X(p.d), Y(p.terrain))); ctx.lineTo(X(l.los.L), Y(lo)); ctx.fill();
    ctx.strokeStyle = l.los.visible ? "#1a9850" : "#d73027"; ctx.lineWidth = 2 * devicePixelRatio;
    ctx.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(pr[0].line)); ctx.lineTo(X(l.los.L), Y(pr[pr.length - 1].line)); ctx.stroke();
    ctx.setLineDash([]);
    if (l.los.obstacle) {
      ctx.fillStyle = "#d73027";
      ctx.beginPath(); ctx.arc(X(l.los.obstacle.d), Y(pr.find(p => p.d >= l.los.obstacle.d).surface), 5 * devicePixelRatio, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#333"; ctx.font = `${11 * devicePixelRatio}px system-ui`;
    ctx.fillText(`${hi.toFixed(0)} m`, 2, Y(hi) + 10); ctx.fillText(`${lo.toFixed(0)} m`, 2, Y(lo));
    ctx.fillText(l.a.name, X(0), Hh - 8); ctx.textAlign = "right"; ctx.fillText(l.b.name, X(l.los.L), Hh - 8);
    ctx.textAlign = "left";
    $("#p1-profile-title").textContent = `Τομή ${l.label}: μήκος ≈ ${l.len.toFixed(0)} m — ` +
      (l.los.visible ? "υπάρχει οπτική επαφή" : `εμπόδιο (${l.los.obstacle.type}) στα ${l.los.obstacle.d.toFixed(0)} m, ` +
      `${l.los.obstacle.excess.toFixed(1)} m πάνω από τη σκόπευση`);
  }

  /* ---------------- Πίνακες ---------------- */
  function render() {
    const st = S(), q = st.seq;
    $("#p1-setarea").classList.toggle("active", drawing);
    $("#p1-setarea").textContent = drawing ? "Σύρε ορθογώνιο στον χάρτη… (Esc: ακύρωση)" :
      st.area ? "▭ Νέα σχεδίαση περιοχής (ορθογώνιο)" : "▭ Σχεδίαση περιοχής (ορθογώνιο)";
    $("#p1-place").classList.toggle("active", placing);
    $("#p1-place").textContent = placing ? "Τοποθέτηση: ON" : "Τοποθέτηση στάσεων";
    $("#p1-lockbox").hidden = !st.finished;
    $$("#p1-edit button").forEach(b => b.disabled = st.finished);
    $("#p1-hint").innerHTML = hint();

    const tb = $("#p1-points tbody");
    tb.innerHTML = "";
    for (const id of new Set(q)) {
      const p = P(id), known = p.kind === "known";
      tb.append(h("tr", {},
        h("td", {}, h("b", {}, p.name)),
        h("td", {}, p.kind === "known" ? "Τριγωνομετρικό" : "Νέα στάση"),
        h("td", { class: "num" }, known ? GEO.fmt(p.E, 3) : "—"),
        h("td", { class: "num" }, known ? GEO.fmt(p.N, 3) : "—"),
        h("td", { class: "num" }, known ? GEO.fmt(p.H, 3) : "—"),
        h("td", {}, p.onRoof ? `δώμα +${p.bh.toFixed(1)}` : "έδαφος")));
    }
    $("#p1-closed").textContent = isClosed() ? "Κλειστή όδευση (T2 → … → T2)" :
      st.finished ? "Εξαρτημένη όδευση (T2 → … → T3)" : "";

    const lb = $("#p1-legs tbody");
    lb.innerHTML = "";
    legInfo.forEach(l => lb.append(h("tr", { "data-k": l.k, onclick: () => showProfile(l.k), class: selectedLeg === l.k ? "sel" : "" },
      h("td", {}, l.label + (l.orient ? " (προσαν.)" : "")),
      h("td", { class: "num" }, "≈ " + l.len.toFixed(0) + " m"),
      h("td", { class: l.los.visible ? "ok" : "bad" }, l.los.visible ? "✓ ορατή" : `✗ ${l.los.obstacle.type}`))));
    renderProfile();
  }

  function hint() {
    const st = S(), q = st.seq;
    if (drawing) return "Πάτα και σύρε στον χάρτη για να σχεδιάσεις το ορθογώνιο της περιοχής (έως 4 km²).";
    if (!st.area) return "① Βρες την περιοχή στον χάρτη, πάτα <b>«Σχεδίαση περιοχής»</b> και σύρε ένα ορθογώνιο (έως 4 km²).";
    if (st.finished) return "✔ Η όδευση είναι έτοιμη. Πήγαινε στην καρτέλα <b>2 · Έντυπο</b>.";
    if (!placing) return "② Πάτα <b>«Τοποθέτηση στάσεων»</b> και κάνε κλικ στον χάρτη με τη σειρά της όδευσης.";
    if (q.length === 0) return "Κλικ για το <b>T1</b> (γνωστό σημείο προσανατολισμού).";
    if (q.length === 1) return "Κλικ για το <b>T2</b> (γνωστό σημείο εκκίνησης — πρώτη στάση).";
    if (q[q.length - 1] === q[1] && q.length > 2) return "Κάνε <b>snap στο T1</b> για να κλείσει η όδευση.";
    return "Κλικ για τις νέες στάσεις <b>S1, S2, …</b>. Τα <b>δύο τελευταία</b> κλικ γίνονται τα γνωστά T3, T4. " +
           "Για <b>κλειστή</b> όδευση κάνε snap στο T2 και μετά στο T1. Στο τέλος πάτα <b>«Ολοκλήρωση»</b>.";
  }

  function activate() {
    MapView.attach("p1-maphost");
    MapView.onClick(onMapClick);
    MapView.layers.tachy.remove();
  }

  function init() {
    $("#p1-setarea").onclick = startDrawing;
    bindDrawing();
    $("#p1-search-btn").onclick = search;
    $("#p1-search").addEventListener("keydown", e => { if (e.key === "Enter") search(); });
    $("#p1-place").onclick = () => {
      if (!S().area) return toast("Όρισε πρώτα την περιοχή μελέτης.", "warn");
      if (drawing) stopDrawing();
      placing = !placing; App.refresh();
    };
    $("#p1-undo").onclick = undo;
    $("#p1-clear").onclick = clearAll;
    $("#p1-finish").onclick = finish;
    $("#p1-unlock").onclick = unlock;
    window.addEventListener("resize", () => renderProfile());
  }

  return { init, render, activate, loadArea, clearArea, recompute, isClosed };
})();
