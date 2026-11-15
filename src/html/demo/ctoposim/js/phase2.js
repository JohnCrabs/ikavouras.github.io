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
    st.results = { ...st.results, p3: null, p4: null, p5: null };
    st.attempts = { ...st.attempts, p3: 0, p4: 0, p5: 0 };
    st.tachy = { setups: [], cur: null, nextP: 1 };
    Store.save();
    App.refresh();
    toast("Οι μετρήσεις υπαίθρου δημιουργήθηκαν. Κατέβασε το έντυπο.", "ok");
  }

  function readSettings() {
    const st = S().settings;
    st.variants = $("#p2-var").checked;
    st.reduction = st.variants ? $("#p2-red").value : "k";
    st.distribution = st.variants ? $("#p2-dist").value : "equal";
    const n = (sel, def) => { const v = parseFloat($(sel).value); return isFinite(v) && v > 0 ? v : def; };
    st.sigB = [n("#p2-sb0", 3), n("#p2-sb1", 10)].sort((a, b) => a - b);
    st.sigD = [n("#p2-sd0", 1), n("#p2-sd1", 5)].sort((a, b) => a - b);
    const m = (sel, def, lo, hi) => { const v = parseFloat(String($(sel).value).replace(",", ".")); return isFinite(v) && v >= lo && v <= hi ? v : def; };
    st.iRange = [m("#p2-i0", 1.45, 0.5, 2.5), m("#p2-i1", 1.75, 0.5, 2.5)].sort((a, b) => a - b);
    st.iTyp = [m("#p2-it0", 1.55, 0.5, 2.5), m("#p2-it1", 1.65, 0.5, 2.5)].sort((a, b) => a - b);
    st.iTyp = [Math.max(st.iTyp[0], st.iRange[0]), Math.min(st.iTyp[1], st.iRange[1])];
    if (st.iTyp[0] > st.iTyp[1]) st.iTyp = [...st.iRange];
    st.tH = m("#p2-t", 1.5, 0, 5);
    st.periods = Math.max(1, Math.min(4, parseInt($("#p2-per").value, 10) || 2));
  }

  /* ---------------- Σειρές εντύπου ---------------- */
  function obsRows() {
    const rows = [];
    // ομαδοποίηση ανά περίοδο, όπως στο έντυπο
    for (const u of S().obs.setups) {
      const R = Math.max(...u.sights.map(s => SIM.periodsOf(s).length));
      for (let q = 0; q < R; q++) u.sights.forEach((s, k) => {
        const p = SIM.periodsOf(s)[q];
        if (p) rows.push({ station: k === 0 ? name(u.station) : "", i: k === 0 ? u.i : null,
          target: name(s.target), per: q + 1, role: s.role, orient: s.orient, t: s.t, s: p });
      });
    }
    return rows;
  }

  /**
   * Έντυπο πολυγωνομετρίας στη διάταξη του εντύπου του εργαστηρίου:
   * ΣΤΑΣΗ | Ύψος Οργ. | Σκόπευση προς | Ύψος Σκόπευσης |
   * ΟΡΙΖΟΝΤΙΕΣ ΓΩΝΙΕΣ (Θέση I, Θέση II, Μέση τιμή, Μέση ανηγ. τιμή, Γενικός Μ.Ο.) |
   * ΚΑΤΑΚΟΡΥΦΕΣ ΓΩΝΙΕΣ (Θέση I, Θέση II, Μέση τιμή, Γενικός Μ.Ο.) |
   * Κεκλιμένο μήκος (Θέση I, Θέση II, Μ.Τ.) | Οριζόντιο μήκος D (D, Γενικός Μ.Ο.) | Υψομετρική διαφορά Δh (Δh, Γενικός Μ.Ο.).
   * Οι στήλες που υπολογίζει ο φοιτητής μένουν κενές. Ο Γενικός Μ.Ο. των D και Δh μιας πλευράς
   * (μετάβαση + επιστροφή) συμπληρώνεται στη γραμμή της εμπρός σκόπευσης· όπου δεν συμπληρώνεται τίποτα, το κελί είναι γκρι.
   */
  function formGrid() {
    const st = S(), { C, Grid } = Sheet, M = fieldMeta(st.obs.created, "poly"), NC = 25;
    const g = new Grid([8, 8, 10, 10, 9, 10, 10, 9, 9, 9, 7, 10, 10, 9, 9, 7, 9, 9, 9, 9, 9, 7, 9, 9, 7]);
    g.row([C("ΕΡΓΑΣΤΗΡΙΟ ΓΕΝΙΚΗΣ ΓΕΩΔΑΙΣΙΑΣ", "sub", NC)], 18);
    g.row([C("ΕΝΤΥΠΟ ΠΟΛΥΓΩΝΟΜΕΤΡΙΑΣ", "title", NC)], 22);
    Sheet.metaRows(g, M, 10);
    g.blank();
    g.row([C("ΣΤΑΣΗ", "hdr", 1, 2), C("Ύψος Οργ. (m)", "hdr", 1, 2), C("Σκόπευση προς", "hdr", 1, 2), C("Ύψος Σκόπευσης (m)", "hdr", 1, 2),
           C("Περίοδος", "hdr", 1, 2),
           C("ΟΡΙΖΟΝΤΙΕΣ ΓΩΝΙΕΣ (grad)", "hdrG", 6), C("ΚΑΤΑΚΟΡΥΦΕΣ ΓΩΝΙΕΣ (grad)", "hdrG", 5),
           C("Κεκλιμένο μήκος S (m)", "hdrG", 3), C("Οριζόντιο μήκος D (m)", "hdrG", 3), C("Υψομ. διαφορά Δh (m)", "hdrG", 3)], 18);
    g.row(["ΘΕΣΗ I", "ΘΕΣΗ II", "Μέση τιμή", "Μέση ανηγ. τιμή", "Γενικός Μ.Ο.", "±σ",
           "ΘΕΣΗ I", "ΘΕΣΗ II", "Μέση τιμή", "Γενικός Μ.Ο.", "±σ",
           "ΘΕΣΗ I", "ΘΕΣΗ II", "Μ.Τ.", "D", "Γενικός Μ.Ο.", "±σ", "Δh", "Γενικός Μ.Ο.", "±σ"].map(x => C(x, "hdr")), 30);
    const E = (rs = 1) => C(null, "e", 1, rs), X = (rs = 1) => C(null, "x", 1, rs);
    const ups = st.obs.setups;
    let nPer = 1;
    // Ομαδοποίηση ανά περίοδο: σε κάθε στάση πρώτα όλες οι σκοπεύσεις της 1ης περιόδου, μετά της 2ης κ.λπ.
    // Τα «γενικά» κελιά (Γενικός Μ.Ο., S Μ.Τ., D, Δh) συμπληρώνονται στην τελευταία περίοδο· στις προηγούμενες είναι γκρι.
    ups.forEach((u, n) => {
      const R = Math.max(...u.sights.map(s => SIM.periodsOf(s).length));
      nPer = Math.max(nPer, R);
      if (n > 0) g.row(Array.from({ length: NC }, () => E()), 8);           // κενή γραμμή ανάμεσα στις στάσεις
      for (let k = 0; k < R; k++) {
        const last = k === R - 1, G = () => last ? E() : X();
        u.sights.forEach((s, si) => {
          const p = SIM.periodsOf(s)[k];
          if (!p) return;
          const full = p.VI != null;                                         // όχι σκόπευση προσανατολισμού
          const legMean = full && s.role === "fwd" && n < ups.length - 1;    // εμπρός σκόπευση πλευράς
          const c = [];
          if (si === 0) c.push(C(name(u.station), "tb", 1, u.sights.length), C(u.i, "n3", 1, u.sights.length));
          c.push(C(name(s.target), "tb"), full ? C(s.t, "n3") : X(),
                 C(String(k + 1), "t"), C(p.HzI, "n4"), C(p.HzII, "n4"), E(), E(), G(), G());
          const L = () => legMean ? G() : X();
          if (full) c.push(C(p.VI, "n4"), C(p.VII, "n4"), E(), G(), G(), C(p.SI, "n3"), C(p.SII, "n3"),
                           G(), G(), L(), L(), G(), L(), L());
          else c.push(...Array.from({ length: 14 }, () => X()));
          g.row(c, 16);
        });
      }
    });
    g.blank();
    // αναγνώσεις μηδενισμού όπως καταγράφηκαν (πίσω σκόπευση, Θέση I, κάθε περιόδου)
    const zeros = SIM.periodsOf(ups[0].sights[0]).map(p => p.HzI.toFixed(4)).join(", ");
    g.row([C(`Μηδενισμός σε κάθε στάση: η ανάγνωση Θέσης I προς την πίσω σκόπευση ορίζεται σε ${zeros} grad (περίοδοι 1${nPer > 1 ? "–" + nPer : ""}). ` +
             "Μέση ανηγ. τιμή = μέση τιμή μείον τη μέση τιμή της πίσω σκόπευσης της ίδιας περιόδου· Γενικός Μ.Ο. = μέσος όρος των περιόδων. " +
             "±σ = τυπική απόκλιση του Γενικού Μ.Ο. Οι γραμμές είναι ομαδοποιημένες ανά περίοδο· ο Γενικός Μ.Ο., το ±σ, το S Μ.Τ., το D και το Δh γράφονται στις γραμμές της τελευταίας περιόδου.", "note", NC)], 26);
    g.row([C("S Μ.Τ. = μέση τιμή όλων των κεκλιμένων μηκών της σκόπευσης· από αυτή και τον Γενικό Μ.Ο. της ζενίθιας: D = S·sin z, Δh = S·cos z + Υ.Ο. − Υ.Σ. " +
             "Γενικός Μ.Ο. D και Δh μιας πλευράς = μέσος όρος μετάβασης (εμπρός σκόπευση) και επιστροφής (πίσω σκόπευση από την επόμενη στάση), " +
             "με το πρόσημο του Δh κατά τη φορά της όδευσης· γράφεται στη γραμμή της εμπρός σκόπευσης.", "note", NC)], 26);
    g.row([C("Σκοπεύσεις προσανατολισμού (προς " + name(st.seq[0]) + " και " + name(st.seq[st.seq.length - 1]) +
             "): μόνο οριζόντια διεύθυνση. Γκρι κελιά: δεν συμπληρώνονται. Γωνίες σε grad, μήκη και ύψη σε m.", "note", NC)]);
    g.row([C(`Αναγωγή αποστάσεων: ${REDUCTION[st.settings.reduction]} · Κατανομή σφαλμάτων: ${DISTRIB[st.settings.distribution]} · ` +
             `Υ.Σ. σταθερό: ${st.settings.tH.toFixed(3)} m`, "note", NC)]);
    g.blank();
    g.row([C("ΓΝΩΣΤΑ ΣΗΜΕΙΑ (ΕΓΣΑ 87)", "sec", 6)]);
    g.row([C("Σημείο", "hdr", 2), C("X = E (m)", "hdr", 2), C("Y = N (m)", "hdr", 2), C("H (m)", "hdr", 2)]);
    for (const p of knownPoints()) g.row([C(p.name, "tb", 2), C(p.E, "n3", 2), C(p.N, "n3", 2), C(p.H, "n3", 2)]);
    return g;
  }

  /** φύλλο επίλυσης όδευσης (κενό, για συμπλήρωση) */
  /** φύλλο επίλυσης όδευσης βήμα-βήμα (χωρίς τύπους: τους γράφει ο φοιτητής) */
  function solveGrid() {
    const st = S(), { C, Grid } = Sheet, q = st.seq, L = q.length, NC = 7;
    const g = new Grid([18, 14, 14, 14, 14, 14, 14], { landscape: false });
    const n = id => name(id), E = () => C(null, "e"), X = () => C(null, "x");
    const T1 = q[0], T2 = q[1], T3 = q[L - 2], T4 = q[L - 1];
    const stations = q.slice(1, L - 1), legs = stations.slice(0, -1).map((id, k) => [id, stations[k + 1]]);
    const hdr = (cols, ht = 30) => g.row(cols.map(x => C(x, "hdr")), ht);
    const sec = t => { g.blank(); g.row([C(t, "sec", NC)], 22); };
    const kv = (label, unit) => g.row([C(label, "tb", 2), E(), C(unit || "", "plain")], 18);
    const sumRow = (k) => g.row([C("Σ", "tb"), ...Array.from({ length: k }, () => E())], 18);

    g.row([C("ΕΠΙΛΥΣΗ ΕΞΑΡΤΗΜΕΝΗΣ ΟΔΕΥΣΗΣ", "title", NC)], 24);
    g.row([C("ΠΑΡΑΤΗΡΗΤΗΣ: " + fieldMeta(st.obs.created, "poly").observer, "meta", NC)], 18);
    g.row([C(`Όδευση: ${q.map(n).join(" → ")} · Αναγωγή αποστάσεων: ${REDUCTION[st.settings.reduction]} · ` +
             `Κατανομή σφαλμάτων: ${DISTRIB[st.settings.distribution]}`, "note", NC)], 28);
    g.row([C("Μετάφερε τα δεδομένα και υπολόγισε με τη σειρά των βημάτων. Τους τύπους τούς γράφεις εσύ (π.χ. στο Excel ή στο χέρι). " +
             "Γωνίες σε grad με 4 δεκαδικά, μήκη σε m με 3 δεκαδικά, γωνιακά σφάλματα σε cc.", "note", NC)], 28);

    sec("ΔΕΔΟΜΕΝΑ");
    g.row([C("Γνωστά σημεία (ΕΓΣΑ 87)", "meta", NC)], 18);
    hdr(["Σημείο", "E (m)", "N (m)", "H (m)"], 20);
    for (const id of [T1, T2, T3, T4]) g.row([C(n(id), "tb"), E(), E(), E()], 18);
    g.row([C("Οριζόντιες γωνίες (Φάση 3)", "meta", NC)], 18);
    hdr(["Στάση", "Πίσω", "Εμπρός", "β (grad)"], 20);
    stations.forEach((id, k) => g.row([C(n(id), "tb"), C(n(q[k]), "t"), C(n(q[k + 2]), "t"), E()], 18));
    g.row([C("Πλευρές (Φάση 3)", "meta", NC)], 18);
    hdr(["Πλευρά", "D (m)", "Δh (m)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E(), E()], 18);
    kv("Συντελεστής κλίμακας k", "(Φάση 1)");

    sec("ΒΗΜΑ 1 · Γωνίες διεύθυνσης αρχής και τέλους (2ο Θεμελιώδες Πρόβλημα)");
    hdr(["Πλευρά", "ΔE (m)", "ΔN (m)", "tan⁻¹(ΔE/ΔN) (grad)", "Τεταρτημόριο", "Διόρθωση (grad)", "α (grad)"]);
    for (const [a, b] of [[T1, T2], [T3, T4]]) g.row([C(n(a) + n(b), "tb"), E(), E(), E(), E(), E(), E()], 18);

    sec("ΒΗΜΑ 2 · Υπολογισμένη γωνία διεύθυνσης τέλους (3ο Θεμελιώδες Πρόβλημα)");
    kv("Άθροισμα γωνιών Σβ", "grad"); kv("Πλήθος γωνιών n"); kv(`Υπολογισμένη α'${n(T3)}${n(T4)}`, "grad");

    sec("ΒΗΜΑ 3 · Γωνιακό σφάλμα κλεισίματος και διόρθωση των γωνιών");
    kv("Γωνιακό σφάλμα wβ", "cc"); kv("Διόρθωση ανά γωνία δβ", "cc");
    hdr(["Στάση", "β μετρημένη (grad)", "δβ (cc)", "β διορθωμένη (grad)"]);
    for (const id of stations) g.row([C(n(id), "tb"), E(), E(), E()], 18);
    sumRow(3);

    sec("ΒΗΜΑ 4 · Ενδιάμεσες γωνίες διεύθυνσης");
    hdr(["Πλευρά", "α (grad)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E()], 18);
    g.row([C(`${n(T3)}${n(T4)} (έλεγχος)`, "tb"), E(), C("= γνωστή α;", "plain", 2)], 18);

    sec("ΒΗΜΑ 5 · Αναγωγή των αποστάσεων στο ΕΓΣΑ 87");
    hdr(["Πλευρά", "D (m)", "D ΕΓΣΑ (m)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E(), E()], 18);
    sumRow(2);

    sec("ΒΗΜΑ 6 · Μερικές συντεταγμένες ΔX, ΔY");
    hdr(["Πλευρά", "α (grad)", "D ΕΓΣΑ (m)", "ΔX (m)", "ΔY (m)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E(), E(), E(), E()], 18);
    g.row([C("Σ", "tb"), X(), E(), E(), E()], 18);

    sec("ΒΗΜΑ 7 · Γραμμικό σφάλμα κλεισίματος και διόρθωση των ΔX, ΔY");
    kv("wx", "m"); kv("wy", "m"); kv("ws", "m"); kv("Σχετικό σφάλμα 1 :", "");
    hdr(["Πλευρά", "vx (m)", "vy (m)", "ΔX διορθ. (m)", "ΔY διορθ. (m)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E(), E(), E(), E()], 18);
    sumRow(4);

    sec("ΒΗΜΑ 8 · Τελικές συντεταγμένες");
    hdr(["Σημείο", "E (m)", "N (m)"], 20);
    stations.forEach((id, k) => g.row([C(n(id) + (k === 0 ? " (αρχή)" : k === stations.length - 1 ? " (έλεγχος)" : ""), "tb"), E(), E()], 18));

    sec("ΒΗΜΑ 9 · Υψομετρικό σφάλμα κλεισίματος και διόρθωση των Δh");
    kv("ΣD", "m"); kv("ΣΔh", "m"); kv("Υψομετρικό σφάλμα wh", "m");
    hdr(["Πλευρά", "D (m)", "Δh (m)", "vh (m)", "Δh διορθ. (m)"], 20);
    for (const [a, b] of legs) g.row([C(n(a) + n(b), "tb"), E(), E(), E(), E()], 18);
    sumRow(4);

    sec("ΒΗΜΑ 10 · Υψόμετρα");
    hdr(["Σημείο", "H (m)"], 20);
    stations.forEach((id, k) => g.row([C(n(id) + (k === 0 ? " (αρχή)" : k === stations.length - 1 ? " (έλεγχος)" : ""), "tb"), E()], 18));
    return g;
  }

  function filename(base, ext) {
    const am = (S().student.am || "student").replace(/[^\w\-]/g, "");
    return `${base}_${am}.${ext}`;
  }

  /* ---------------- Απόδοση ---------------- */
  function render() {
    const st = S(), has = !!st.obs;
    $("#p2-var").checked = !!st.settings.variants;
    $("#p2-red").value = st.settings.reduction;
    $("#p2-dist").value = st.settings.distribution;
    $("#p2-sb0").value = st.settings.sigB[0]; $("#p2-sb1").value = st.settings.sigB[1];
    $("#p2-sd0").value = st.settings.sigD[0]; $("#p2-sd1").value = st.settings.sigD[1];
    $("#p2-dec").value = st.settings.decimal;
    $("#p2-i0").value = st.settings.iRange[0]; $("#p2-i1").value = st.settings.iRange[1];
    $("#p2-it0").value = st.settings.iTyp[0]; $("#p2-it1").value = st.settings.iTyp[1];
    $("#p2-t").value = st.settings.tH;
    $("#p2-per").value = st.settings.periods;
    $$("#p2-settings select, #p2-settings input").forEach(e => e.disabled = has);
    if (!st.settings.variants) { $("#p2-red").disabled = true; $("#p2-dist").disabled = true; }
    $("#p2-gen").textContent = has ? "Νέα σειρά μετρήσεων" : "Δημιουργία μετρήσεων υπαίθρου";
    $("#p2-gen").disabled = !st.finished;
    $("#p2-out").hidden = !has;
    if (!has) return;
    const F = GEO.fmt, tb = $("#p2-table tbody");
    tb.innerHTML = "";
    for (const r of obsRows()) tb.append(h("tr", { class: r.station ? "first" : "" },
      h("td", {}, h("b", {}, r.station)), h("td", { class: "num" }, r.i != null ? F(r.i, 3) : ""),
      h("td", {}, r.target + (r.orient ? " (προσαν.)" : "")),
      h("td", { class: "num" }, r.t != null ? F(r.t, 3) : "—"), h("td", { class: "num" }, r.per),
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
    $("#p2-csv").onclick = () => download(filename("entypo_polygonometrias", "csv"), Sheet.toCSV([formGrid()]), "text/csv;charset=utf-8");
    $("#p2-xlsx").onclick = () => download(filename("entypo_polygonometrias", "xlsx"),
      Sheet.toXLSX([{ name: "Έντυπο πολυγωνομετρίας", grid: formGrid() }, { name: "Επίλυση όδευσης", grid: solveGrid() }]));
    $("#p2-print").onclick = () => printGrids(`Έντυπο πολυγωνομετρίας — ${S().student.am}`, [formGrid(), solveGrid()]);
    $("#p2-dec").onchange = e => { S().settings.decimal = e.target.value; Store.save(); };
    // οι αλλαγές στα ύψη ισχύουν αμέσως (και για τον έλεγχο ορατότητας της Φάσης 1)
    for (const id of ["#p2-var", "#p2-red", "#p2-dist"])
      $(id).addEventListener("change", () => { if (S().obs) return; readSettings(); Store.save(); App.refresh(); });
    for (const id of ["#p2-i0", "#p2-i1", "#p2-it0", "#p2-it1", "#p2-t"])
      $(id).addEventListener("change", () => { if (S().obs) return; readSettings(); Store.save(); Phase1.recompute(); App.refresh(); });
  }

  return { init, render, knownPoints, filename, formGrid, solveGrid, REDUCTION, DISTRIB };
})();
