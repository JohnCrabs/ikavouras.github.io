/* CPDF — Convert tools: images ↔ PDF, PDF → Word, Office → PDF. */
(function () {
  'use strict';
  const { base, A4, LETTER } = PDFTools.helpers;

  PDFTools.register(
    {
      id: 'jpg-to-pdf', icon: 'image', color: '#f5a524', category: 'Convert',
      name: { en: 'Images to PDF', el: 'Εικόνες σε PDF' },
      desc: { en: 'Turn JPG, PNG, WebP or GIF images into a PDF document.', el: 'Μετατρέψτε εικόνες JPG, PNG, WebP ή GIF σε έγγραφο PDF.' },
      action: { en: 'Convert to PDF', el: 'Μετατροπή σε PDF' },
      note: { en: 'Each image becomes one page. Drag to reorder.', el: 'Κάθε εικόνα γίνεται μία σελίδα. Σύρετε για αλλαγή σειράς.' },
      accept: 'image', multiple: true, view: 'files',
      options: [
        { id: 'pageSize', label: { en: 'Page size', el: 'Μέγεθος σελίδας' }, type: 'select', default: 'a4', choices: [
          { value: 'a4', label: 'A4 (210 × 297 mm)' }, { value: 'letter', label: 'US Letter' }, { value: 'fit', label: { en: 'Same as image', el: 'Όσο η εικόνα' } },
        ] },
        { id: 'orientation', label: { en: 'Orientation', el: 'Προσανατολισμός' }, type: 'segmented', default: 'auto', showIf: (o) => o.pageSize !== 'fit', choices: [
          { value: 'auto', label: { en: 'Auto', el: 'Αυτόματα' } }, { value: 'portrait', label: { en: 'Portrait', el: 'Κάθετα' } }, { value: 'landscape', label: { en: 'Landscape', el: 'Οριζόντια' } },
        ] },
        { id: 'margin', label: { en: 'Margin', el: 'Περιθώριο' }, type: 'segmented', default: '20', choices: [
          { value: '0', label: { en: 'None', el: 'Κανένα' } }, { value: '20', label: { en: 'Small', el: 'Μικρό' } }, { value: '48', label: { en: 'Large', el: 'Μεγάλο' } },
        ] },
      ],
      async run({ files, options: o, progress }) {
        const out = await PDFLib.PDFDocument.create();
        const m = +o.margin;
        for (const [i, f] of files.entries()) {
          progress(L({ en: `Adding image ${i + 1}/${files.length}…`, el: `Προσθήκη εικόνας ${i + 1}/${files.length}…` }));
          const img = await PDFApp.embedImage(out, await PDFApp.normalizeImage(f.file));
          const iw = img.width * 0.75, ih = img.height * 0.75; // 96 dpi px → pt
          let pw, ph;
          if (o.pageSize === 'fit') { pw = iw + 2 * m; ph = ih + 2 * m; }
          else {
            [pw, ph] = o.pageSize === 'letter' ? LETTER : A4;
            const landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && iw > ih);
            if (landscape) [pw, ph] = [ph, pw];
          }
          const s = Math.min((pw - 2 * m) / iw, (ph - 2 * m) / ih);
          out.addPage([pw, ph]).drawImage(img, { x: (pw - iw * s) / 2, y: (ph - ih * s) / 2, width: iw * s, height: ih * s });
        }
        return [{ name: files.length === 1 ? `${base(files[0])}.pdf` : 'images.pdf', data: await out.save() }];
      },
    },
    {
      id: 'pdf-to-jpg', icon: 'image', color: '#d6409f', category: 'Convert',
      name: { en: 'PDF to images', el: 'PDF σε εικόνες' },
      desc: { en: 'Export every page of a PDF as a high-quality JPG or PNG image.', el: 'Εξάγετε κάθε σελίδα ενός PDF ως εικόνα JPG ή PNG υψηλής ποιότητας.' },
      action: { en: 'Convert to images', el: 'Μετατροπή σε εικόνες' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'format', label: { en: 'Format', el: 'Μορφή' }, type: 'segmented', default: 'jpg', choices: [{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }] },
        { id: 'dpi', label: { en: 'Resolution', el: 'Ανάλυση' }, type: 'select', default: '150', choices: [
          { value: '72', label: { en: 'Screen — 72 DPI', el: 'Οθόνη — 72 DPI' } }, { value: '150', label: { en: 'Standard — 150 DPI', el: 'Κανονική — 150 DPI' } }, { value: '300', label: { en: 'Print — 300 DPI', el: 'Εκτύπωση — 300 DPI' } },
        ] },
      ],
      async run({ files, options: o, progress }) {
        const type = o.format === 'png' ? 'image/png' : 'image/jpeg';
        const out = [];
        for (const f of files) {
          const digits = String(f.pdf.numPages).length;
          for (let n = 1; n <= f.pdf.numPages; n++) {
            progress(L({ en: `Rendering ${f.name} — page ${n}/${f.pdf.numPages}…`, el: `Απόδοση ${f.name} — σελίδα ${n}/${f.pdf.numPages}…` }));
            const canvas = await PDFApp.renderPage(f.pdf, n, { scale: +o.dpi / 72, intent: 'print' });
            const blob = await PDFApp.canvasToBlob(canvas, type, 0.92);
            canvas.width = canvas.height = 0;
            out.push({ name: `${base(f)}_page-${String(n).padStart(digits, '0')}.${o.format}`, data: blob, type });
          }
        }
        return out;
      },
    },
    {
      id: 'pdf-to-word', icon: 'word', color: '#2563eb', category: 'Convert',
      name: { en: 'PDF to Word', el: 'PDF σε Word' },
      desc: { en: 'Convert PDFs into editable DOCX documents.', el: 'Μετατρέψτε PDF σε επεξεργάσιμα έγγραφα DOCX.' },
      action: { en: 'Convert to Word', el: 'Μετατροπή σε Word' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'mode', label: { en: 'Conversion', el: 'Τρόπος μετατροπής' }, type: 'radio',
          default: (caps) => (caps.libreoffice ? 'libreoffice' : 'text'), choices: [
            { value: 'libreoffice', requires: 'libreoffice', label: { en: 'Keep layout (LibreOffice)', el: 'Διατήρηση διάταξης (LibreOffice)' }, hint: { en: 'Closest to the original: text boxes, images and positions.', el: 'Πιο κοντά στο αρχικό: πλαίσια κειμένου, εικόνες και θέσεις.' } },
            { value: 'text', label: { en: 'Editable text', el: 'Επεξεργάσιμο κείμενο' }, hint: { en: 'Paragraphs, headings, bold and italics that flow like a normal document.', el: 'Παράγραφοι, επικεφαλίδες, έντονα και πλάγια που ρέουν σαν κανονικό έγγραφο.' } },
            { value: 'image', label: { en: 'Exact look (pages as pictures)', el: 'Ίδια εμφάνιση (σελίδες ως εικόνες)' }, hint: { en: 'Looks identical but the text can’t be edited.', el: 'Ίδια εμφάνιση, αλλά το κείμενο δεν αλλάζει.' } },
          ] },
        { id: 'scanNote', type: 'note', showIf: (o) => o.mode === 'text',
          html: { en: 'Scanned PDFs have no text layer — run OCR first.', el: 'Τα σαρωμένα PDF δεν έχουν κείμενο — τρέξτε πρώτα OCR.' } },
      ],
      async run({ files, options: o, progress }) {
        if (o.mode !== 'libreoffice') await PDFApp.loadScript(PDFApp.asset('js/vendor/docx.umd.js'));
        const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return PDFTools.helpers.eachFile(files, progress, async (f) => {
          let data;
          if (o.mode === 'libreoffice') data = await PDFApp.api.post('convert', f.bytes, { to: 'docx', name: 'input.pdf' });
          else if (o.mode === 'image') data = await pagesAsPictures(f, progress);
          else data = await reflowText(f, progress);
          return { name: `${base(f)}.docx`, data: data instanceof Blob ? data : new Blob([data], { type: DOCX }), type: DOCX };
        });
      },
    },
  );

  /* ---------- PDF → DOCX in the browser ---------- */

  /** Reads text runs with position, size and style. Font names need the operator list to be loaded. */
  async function pageRuns(page) {
    await page.getOperatorList();
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    const runs = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      let fontName = '';
      try { fontName = page.commonObjs.get(it.fontName).name || ''; } catch (_) { /* font not loaded */ }
      const [x, y] = vp.convertToViewportPoint(e, f);
      runs.push({
        text: it.str, x, y, w: it.width, size,
        bold: /bold|black|heavy|semibold|demi/i.test(fontName),
        italic: /italic|oblique/i.test(fontName),
        serif: /times|serif|georgia|garamond|cambria|book/i.test(fontName) && !/sans/i.test(fontName),
        mono: /courier|mono|consolas/i.test(fontName),
      });
    }
    return { runs, width: vp.width };
  }

  /** Groups runs into lines (same baseline) and lines into paragraphs. */
  function paragraphs(runs, pageWidth) {
    runs.sort((p, q) => (Math.abs(p.y - q.y) < Math.max(p.size, q.size) * 0.4 ? p.x - q.x : p.y - q.y));
    const lines = [];
    for (const r of runs) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - r.y) < Math.max(line.size, r.size) * 0.4) {
        const last = line.runs[line.runs.length - 1];
        if (r.x - (last.x + last.w) > r.size * 0.2 && !/\s$/.test(last.text) && !/^\s/.test(r.text)) r.text = ` ${r.text}`;
        line.runs.push(r);
        line.size = Math.max(line.size, r.size);
        line.right = Math.max(line.right, r.x + r.w);
      } else lines.push({ y: r.y, size: r.size, left: r.x, right: r.x + r.w, runs: [r] });
    }
    const paras = [];
    let prev = null;
    for (const l of lines) {
      const gap = prev ? l.y - prev.y : 0;
      const sameStyle = prev && Math.abs(prev.size - l.size) < 1;
      const centered = Math.abs((l.left + l.right) / 2 - pageWidth / 2) < pageWidth * 0.04 && l.left > pageWidth * 0.18;
      if (prev && sameStyle && gap < l.size * 1.75 && !centered && !prev.centered) {
        const para = paras[paras.length - 1];
        const last = para.runs[para.runs.length - 1];
        if (/-$/.test(last.text)) last.text = last.text.slice(0, -1); // re-join hyphenated words
        else l.runs[0].text = ` ${l.runs[0].text.replace(/^\s+/, '')}`;
        para.runs.push(...l.runs);
      } else paras.push({ size: l.size, centered, runs: [...l.runs], spaceBefore: prev ? Math.max(0, gap - l.size * 1.2) : 0 });
      l.centered = centered;
      prev = l;
    }
    return paras;
  }

  async function reflowText(f, progress) {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
    const pagesParas = [];
    const sizes = [];
    for (let n = 1; n <= f.pdf.numPages; n++) {
      progress(L({ en: `Reading ${f.name} — page ${n}/${f.pdf.numPages}…`, el: `Ανάγνωση ${f.name} — σελίδα ${n}/${f.pdf.numPages}…` }));
      const { runs, width } = await pageRuns(await f.pdf.getPage(n));
      const paras = paragraphs(runs, width);
      paras.forEach((p) => p.runs.forEach((r) => sizes.push(Math.round(r.size))));
      pagesParas.push(paras);
    }
    // Body size = most common size; noticeably larger lines become headings.
    const counts = {};
    sizes.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    const body = +Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 11;
    const children = [];
    pagesParas.forEach((paras, pi) => {
      paras.forEach((p, i) => {
        const heading = p.size >= body * 1.6 ? HeadingLevel.HEADING_1 : p.size >= body * 1.25 ? HeadingLevel.HEADING_2 : undefined;
        children.push(new Paragraph({
          heading,
          pageBreakBefore: pi > 0 && i === 0,
          alignment: p.centered ? AlignmentType.CENTER : undefined,
          spacing: { before: Math.min(480, Math.round(p.spaceBefore * 20)), after: 120 },
          children: p.runs.map((r) => new TextRun({
            text: r.text, bold: r.bold, italics: r.italic, size: Math.round(r.size * 2),
            font: r.mono ? 'Courier New' : r.serif ? 'Times New Roman' : 'Calibri',
          })),
        }));
      });
    });
    if (!children.length) throw new Error(L({ en: `${f.name} has no text to convert. Run OCR first, or choose “Exact look”.`, el: `Το ${f.name} δεν έχει κείμενο. Τρέξτε πρώτα OCR ή διαλέξτε «Ίδια εμφάνιση».` }));
    return Packer.toBlob(new Document({ sections: [{ children }] }));
  }

  async function pagesAsPictures(f, progress) {
    const { Document, Packer, Paragraph, ImageRun } = window.docx;
    const sections = [];
    for (let n = 1; n <= f.pdf.numPages; n++) {
      progress(L({ en: `Rendering ${f.name} — page ${n}/${f.pdf.numPages}…`, el: `Απόδοση ${f.name} — σελίδα ${n}/${f.pdf.numPages}…` }));
      const page = await f.pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await PDFApp.renderPage(f.pdf, n, { scale: 2, intent: 'print' });
      const data = await (await PDFApp.canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer();
      canvas.width = canvas.height = 0;
      const twip = (pt) => Math.round(pt * 20);
      sections.push({
        properties: { page: { size: { width: twip(vp.width), height: twip(vp.height) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } },
        children: [new Paragraph({ children: [new ImageRun({ data, transformation: { width: vp.width * (96 / 72), height: vp.height * (96 / 72) - 2 } })] })],
      });
    }
    return Packer.toBlob(new Document({ sections }));
  }
})();
