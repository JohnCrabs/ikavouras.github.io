/* CGeoRef – Αναφορά γεωαναφοράς PDF μίας σελίδας (jsPDF + γραμματοσειρά DejaVu για ελληνικά) */
(function (GR) {
  'use strict';

  const FONT_URLS = {
    normal: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf',
    bold: 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf'
  };
  const fontCache = {};

  function b64(buf) {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function loadFonts(doc) {
    for (const style of ['normal', 'bold']) {
      if (!fontCache[style]) {
        const r = await fetch(FONT_URLS[style]);
        if (!r.ok) throw new Error('font');
        fontCache[style] = b64(await r.arrayBuffer());
      }
      const fn = `DejaVu-${style}.ttf`;
      doc.addFileToVFS(fn, fontCache[style]);
      doc.addFont(fn, 'DejaVu', style);
    }
    return 'DejaVu';
  }

  /** Μικρογραφία εικόνας με GCP και διανύσματα υπολοίπων */
  function thumbnail(ctx, boxW, boxH) {
    const { img, gcps, fit } = ctx;
    const ppm = 10; // pixel ανά mm
    const W = Math.round(boxW * ppm), H = Math.round(boxH * ppm);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const sc = Math.min(W / img.width, H / img.height);
    const dw = img.width * sc, dh = img.height * sc;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img.canvas, ox, oy, dw, dh);
    g.strokeStyle = '#555'; g.lineWidth = 2; g.strokeRect(ox, oy, dw, dh);
    // κλίμακα διανυσμάτων: το μέγιστο υπόλοιπο ≈ 12% της διαγωνίου
    let maxR = 0;
    gcps.forEach((p, i) => { if (p.enabled) maxR = Math.max(maxR, fit.res[i].dPx); });
    const diag = Math.hypot(dw, dh);
    let k = maxR > 0 ? (0.12 * diag) / (maxR * sc) : 1;
    const nice = [1, 2, 5];
    const mag = Math.pow(10, Math.floor(Math.log10(k)));
    k = nice.map(n => n * mag).concat([10 * mag]).filter(v => v <= k).pop() || mag;
    gcps.forEach((p, i) => {
      const x = ox + p.src[0] * sc, y = oy + p.src[1] * sc;
      const r = fit.res[i];
      if (isFinite(r.dx)) {
        const ex = x + r.dx * k * sc, ey = y + r.dy * k * sc;
        g.strokeStyle = p.enabled ? '#e03131' : '#999'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        const a = Math.atan2(ey - y, ex - x), L = 14;
        if (Math.hypot(ex - x, ey - y) > L) {
          g.beginPath(); g.moveTo(ex, ey);
          g.lineTo(ex - L * Math.cos(a - 0.4), ey - L * Math.sin(a - 0.4));
          g.lineTo(ex - L * Math.cos(a + 0.4), ey - L * Math.sin(a + 0.4));
          g.closePath(); g.fillStyle = g.strokeStyle; g.fill();
        }
      }
      g.strokeStyle = '#fff'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke();
      g.strokeStyle = p.enabled ? '#1c7ed6' : '#888'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke();
      g.font = 'bold 22px sans-serif';
      g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(String(p.id), x + 9, y - 9);
      g.fillStyle = p.enabled ? '#1c7ed6' : '#888'; g.fillText(String(p.id), x + 9, y - 9);
    });
    return { url: cv.toDataURL('image/jpeg', 0.88), k };
  }

  async function generate(ctx) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let font = 'helvetica';
    try { font = await loadFonts(doc); }
    catch (e) { console.warn('Αποτυχία φόρτωσης γραμματοσειράς – τα ελληνικά ίσως δεν εμφανιστούν', e); }
    const setF = (style, size) => { doc.setFont(font, style); doc.setFontSize(size); };
    const PW = 210, M = 12;
    const { fit, loo, gcps, img, transform } = ctx;
    const st = fit.stats, u = ctx.unit;

    // ---- Κεφαλίδα ----
    doc.setFillColor(36, 41, 47); doc.rect(0, 0, PW, 22, 'F');
    doc.setFillColor(255, 140, 66); doc.rect(0, 22, PW, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    setF('bold', 16); doc.text('Αναφορά Γεωαναφοράς', M, 11);
    setF('normal', 9); doc.text(img.name, M, 17.5);
    const now = new Date();
    doc.text(now.toLocaleDateString('el-GR') + ' ' + now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }), PW - M, 11, { align: 'right' });
    doc.text('CGeoRef', PW - M, 17.5, { align: 'right' });
    doc.setTextColor(31, 35, 40);

    // ---- Μικρογραφία ----
    const tx = M, ty = 28, tw = 92, th = 82;
    const thumb = thumbnail(ctx, tw, th);
    doc.addImage(thumb.url, 'JPEG', tx, ty, tw, th);
    doc.setDrawColor(200); doc.rect(tx, ty, tw, th);
    setF('normal', 7); doc.setTextColor(101, 109, 118);
    doc.text(`Διανύσματα υπολοίπων (κόκκινο) σε κλίμακα ×${thumb.k}`, tx, ty + th + 3.5);
    doc.setTextColor(31, 35, 40);

    // ---- Πίνακας στοιχείων ----
    const geo = GR.transforms.localGeometry(fit.model, [img.width / 2, img.height / 2]);
    const nAct = gcps.filter(g => g.enabled).length;
    const rows = [
      ['Διαστάσεις εικόνας', `${img.width} × ${img.height} px`],
      ['Μετασχηματισμός', transform.name + (transform.smoothing && ctx.lambda ? ` (λ = ${ctx.lambda})` : '')],
      ['Σύστημα αναφοράς', `${ctx.crs} – ${ctx.crsName}`],
      ['Σημεία ελέγχου', `${nAct} ενεργά / ${gcps.length} συνολικά (ελάχ. ${transform.minPts})`],
      ['RMSE (pixel)', ctx.fmtPx(st.rmsePx) + ' px'],
      ['RMSE (χάρτη)', `${ctx.fmtRes(st.rmseMap)} ${u}`],
      ['RMSE X / Y', `${ctx.fmtRes(st.rmseX)} / ${ctx.fmtRes(st.rmseY)} ${u}`],
      ['Μέσο / Μέγιστο υπόλοιπο', `${ctx.fmtRes(st.meanMap)} / ${ctx.fmtRes(st.maxMap)} ${u}`],
      ['σ₀ (βαθμοί ελευθερίας)', st.sigma0 != null ? `${ctx.fmtRes(st.sigma0)} ${u} (${st.dof})` : (transform.exact ? 'ακριβής παρεμβολή' : '–')],
      ['LOO RMSE (επικύρωση)', loo ? `${ctx.fmtRes(loo.rmse)} ${u}` : '–'],
      ['Μέγεθος pixel (κέντρο)', `${ctx.fmtRes(geo.sx)} × ${ctx.fmtRes(geo.sy)} ${u}`],
      ['Στροφή / Διάτμηση', `${geo.rot.toFixed(4)}° / ${geo.shear.toFixed(4)}°`]
    ];
    if (['linear', 'helmert', 'affine'].includes(transform.id)) {
      const w = GR.transforms.worldFile(fit.model);
      const f = (v) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(5) : v.toFixed(6));
      rows.push(['World file A, D, B, E', `${f(w.A)}, ${f(w.D)}, ${f(w.B)}, ${f(w.E)}`]);
      rows.push(['World file C, F', `${w.C.toFixed(4)}, ${w.F.toFixed(4)}`]);
    }
    const ex = ctx.extra || {};
    if (ex.resample) rows.push(['Επαναδειγματοληψία', ex.resample]);
    if (ex.outSize) rows.push(['Έξοδος', `${ex.outSize} · pixel ${ex.outRes}`]);

    const ix = tx + tw + 6, iw = PW - M - ix;
    const rh = Math.min(5.4, (th + 4) / rows.length);
    setF('bold', 10); doc.text('Στοιχεία επίλυσης', ix, ty - 1.5);
    rows.forEach((r, i) => {
      const y = ty + 1 + i * rh;
      if (i % 2 === 0) { doc.setFillColor(246, 248, 250); doc.rect(ix, y, iw, rh, 'F'); }
      setF('normal', 7); doc.setTextColor(101, 109, 118);
      doc.text(r[0], ix + 1.2, y + rh * 0.68);
      const room = iw - doc.getTextWidth(r[0]) - 4;
      let fsz = 7.4;
      setF('bold', fsz);
      while (fsz > 5 && doc.getTextWidth(String(r[1])) > room) { fsz -= 0.2; setF('bold', fsz); }
      doc.setTextColor(31, 35, 40);
      const val = doc.splitTextToSize(String(r[1]), room)[0];
      doc.text(val, ix + iw - 1.2, y + rh * 0.68, { align: 'right' });
    });

    // ---- Πίνακας GCP ----
    let y0 = ty + th + 10;
    setF('bold', 10); doc.text('Σημεία ελέγχου και υπόλοιπα', M, y0);
    y0 += 2;
    const cols = [
      ['ID', 9], ['Πηγή X', 18], ['Πηγή Y', 18], [`Χάρτης X`, 28], [`Χάρτης Y`, 28],
      ['dX px', 15], ['dY px', 15], ['Υπόλ. px', 16], [`Υπόλ. ${u}`, 19], [`LOO ${u}`, 20]
    ];
    const totalW = cols.reduce((s, c) => s + c[1], 0);
    const scaleW = (PW - 2 * M) / totalW;
    cols.forEach(c => (c[1] *= scaleW));
    const footerY = 284;
    const avail = footerY - 6 - (y0 + 6);
    let rowH = Math.max(2.9, Math.min(5, avail / Math.max(1, gcps.length)));
    const maxRows = Math.floor(avail / rowH);
    const shown = gcps.slice(0, maxRows);
    const fs = Math.max(5.5, Math.min(8, rowH * 1.75));
    // επικεφαλίδα
    doc.setFillColor(36, 41, 47); doc.rect(M, y0, PW - 2 * M, 6, 'F');
    setF('bold', 7); doc.setTextColor(255, 255, 255);
    let x = M;
    cols.forEach((c, i) => { doc.text(c[0], i === 0 ? x + c[1] / 2 : x + c[1] - 1, y0 + 4, { align: i === 0 ? 'center' : 'right' }); x += c[1]; });
    doc.setTextColor(31, 35, 40);
    let y = y0 + 6;
    const rmse = st.rmseMap;
    shown.forEach((g) => {
      const i = gcps.indexOf(g);
      const r = fit.res[i];
      const l = loo ? loo.perPoint[i] : null;
      const outlier = g.enabled && st.n >= transform.minPts + 2 && rmse > 0 && r.dMap > 2.5 * rmse;
      if (i % 2 === 1) { doc.setFillColor(246, 248, 250); doc.rect(M, y, PW - 2 * M, rowH, 'F'); }
      const vals = [String(g.id), g.src[0].toFixed(2), g.src[1].toFixed(2), ctx.fmtMap(g.dst[0]), ctx.fmtMap(g.dst[1]),
        ctx.fmtPx(r.dx), ctx.fmtPx(r.dy), ctx.fmtPx(r.dPx), ctx.fmtRes(r.dMap), l != null ? ctx.fmtRes(l) : '–'];
      x = M;
      vals.forEach((v, k) => {
        const bold = outlier && (k === 7 || k === 8);
        setF(bold ? 'bold' : 'normal', fs);
        if (!g.enabled) doc.setTextColor(160, 167, 175);
        else if (bold) doc.setTextColor(207, 34, 46);
        else doc.setTextColor(31, 35, 40);
        doc.text(v, k === 0 ? x + cols[k][1] / 2 : x + cols[k][1] - 1, y + rowH * 0.72, { align: k === 0 ? 'center' : 'right' });
        x += cols[k][1];
      });
      y += rowH;
    });
    doc.setTextColor(31, 35, 40);
    doc.setDrawColor(208, 215, 222); doc.line(M, y, PW - M, y);
    if (gcps.length > shown.length) {
      setF('normal', 7); doc.setTextColor(207, 34, 46);
      doc.text(`… και ${gcps.length - shown.length} ακόμη σημεία (βλ. αρχείο .points / CSV)`, M, y + 3.5);
      doc.setTextColor(31, 35, 40);
    }

    // ---- Διάγραμμα υπολοίπων (όταν υπάρχει χώρος) ----
    const chartTop = y + 9, chartBot = footerY - 8;
    if (chartBot - chartTop > 38 && gcps.length) {
      setF('bold', 10); doc.text(`Υπόλοιπα ανά σημείο (${u})`, M, chartTop);
      const cx0 = M + 14, cx1 = PW - M, cy0 = chartTop + 5, cy1 = Math.min(chartBot, chartTop + 70);
      const vals = gcps.map((g, i) => ({ id: g.id, on: g.enabled, r: fit.res[i].dMap, l: loo ? loo.perPoint[i] : null }));
      let vmax = Math.max(...vals.map(v => Math.max(v.r || 0, v.l || 0)), rmse * 1.1, 1e-12);
      const pow = Math.pow(10, Math.floor(Math.log10(vmax)));
      vmax = Math.ceil(vmax / pow) * pow;
      const yOf = (v) => cy1 - (v / vmax) * (cy1 - cy0);
      setF('normal', 6); doc.setTextColor(101, 109, 118); doc.setDrawColor(225, 228, 232);
      for (let k = 0; k <= 4; k++) {
        const v = vmax * k / 4, yy = yOf(v);
        doc.line(cx0, yy, cx1, yy);
        doc.text(ctx.fmtRes(v), cx0 - 1.5, yy + 1, { align: 'right' });
      }
      const slot = (cx1 - cx0) / vals.length, bw = Math.min(8, slot * 0.38);
      vals.forEach((v, k) => {
        const xc = cx0 + slot * (k + 0.5);
        doc.setFillColor(...(v.on ? [28, 126, 214] : [180, 186, 192]));
        if (v.r > 0) doc.rect(xc - bw, yOf(v.r), bw, cy1 - yOf(v.r), 'F');
        if (v.l != null) { doc.setFillColor(255, 168, 112); doc.rect(xc, yOf(v.l), bw, cy1 - yOf(v.l), 'F'); }
        if (vals.length <= 60) { doc.setTextColor(101, 109, 118); doc.text(String(v.id), xc, cy1 + 3, { align: 'center' }); }
      });
      doc.setDrawColor(207, 34, 46); doc.setLineWidth(0.3); doc.setLineDashPattern([1, 1], 0);
      doc.line(cx0, yOf(rmse), cx1, yOf(rmse));
      doc.setLineDashPattern([], 0); doc.setLineWidth(0.2);
      doc.setTextColor(207, 34, 46); doc.text('RMSE', cx1, yOf(rmse) - 1, { align: 'right' });
      // υπόμνημα
      const ly = cy1 + 7;
      doc.setFillColor(28, 126, 214); doc.rect(cx0, ly - 2, 3, 2, 'F');
      doc.setTextColor(101, 109, 118); doc.text('Υπόλοιπο', cx0 + 4, ly);
      if (loo) { doc.setFillColor(255, 168, 112); doc.rect(cx0 + 22, ly - 2, 3, 2, 'F'); doc.text('LOO (επικύρωση)', cx0 + 26, ly); }
      doc.setTextColor(31, 35, 40);
    }

    // ---- Υποσέλιδο ----
    doc.setDrawColor(208, 215, 222); doc.line(M, footerY, PW - M, footerY);
    setF('normal', 6.5); doc.setTextColor(101, 109, 118);
    const notes = `dX, dY, Υπόλ. px: υπόλοιπα σε pixel εικόνας (αντίστροφος μετασχηματισμός). Υπόλ. ${u}: υπόλοιπο σε μονάδες χάρτη (ευθύς μετασχηματισμός). ` +
      `LOO: σφάλμα πρόβλεψης κάθε σημείου όταν εξαιρείται από την επίλυση (Leave-One-Out). Με κόκκινο: υπόλοιπο > 2.5 × RMSE. Γκρι: ανενεργά σημεία.`;
    doc.text(doc.splitTextToSize(notes, PW - 2 * M), M, footerY + 3.5);
    doc.text('Δημιουργήθηκε με CGeoRef', PW - M, 293, { align: 'right' });

    GR.gcpio.download(doc.output('blob'), ctx.filename || 'georef_report.pdf', 'application/pdf');
  }

  GR.report = { generate };
})(window.GR = window.GR || {});
