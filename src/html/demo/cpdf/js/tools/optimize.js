/* CPDF — Optimize tools: compress, grayscale, PDF/A, repair, metadata. */
(function () {
  'use strict';
  const { load, base, eachFile, rasterize, sizeNote } = PDFTools.helpers;

  /** Ghostscript through the local server. */
  const gs = (bytes, params) => PDFApp.api.post('gs', bytes, params);

  /**
   * Rebuilds a broken cross-reference table by scanning the file for "N G obj" headers
   * (the WebAssembly qpdf build does not run qpdf's own recovery). Files that use an xref
   * stream get a fresh startxref pointing at it; classic files get a new xref table + trailer.
   */
  // Byte-exact string <-> bytes (TextDecoder('latin1') is really windows-1252 and would alter 0x80–0x9F).
  function toBinary(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }

  function rebuildXref(bytes) {
    const s = toBinary(bytes);
    const objRe = /(^|[\r\n\t ])(\d+)[\r\n\t ]+(\d+)[\r\n\t ]+obj\b/g;
    const objects = new Map();
    let xrefStream = -1, root = null, info = null, m;
    while ((m = objRe.exec(s))) {
      const off = m.index + m[1].length;
      const num = +m[2], gen = +m[3];
      objects.set(num, { off, gen });
      const end = s.indexOf('endobj', off);
      const head = s.slice(off, Math.min(end < 0 ? s.length : end, off + 4000));
      if (/\/Type\s*\/XRef\b/.test(head)) xrefStream = off;
      if (/\/Type\s*\/Catalog\b/.test(head)) root = `${num} ${gen} R`;
      if (/\/(Producer|Creator|Title)\s*[(<]/.test(head) && !/\/Type\s*\//.test(head)) info = `${num} ${gen} R`;
    }
    if (xrefStream >= 0) return Uint8Array.from(`${s}\nstartxref\n${xrefStream}\n%%EOF\n`, (c) => c.charCodeAt(0));
    if (!root) return null;
    const size = Math.max(...objects.keys()) + 1;
    const pad = (n, w) => String(n).padStart(w, '0');
    let table = `xref\n0 ${size}\n0000000000 65535 f\r\n`;
    for (let i = 1; i < size; i++) {
      const o = objects.get(i);
      table += o ? `${pad(o.off, 10)} ${pad(o.gen, 5)} n\r\n` : '0000000000 00000 f\r\n';
    }
    const body = `${s}\n`;
    const out = `${body}${table}trailer\n<< /Size ${size} /Root ${root}${info ? ` /Info ${info}` : ''} >>\nstartxref\n${body.length}\n%%EOF\n`;
    return Uint8Array.from(out, (c) => c.charCodeAt(0));
  }

  PDFTools.register(
    {
      id: 'compress', icon: 'compress', color: '#30a46c', category: 'Optimize',
      name: { en: 'Compress PDF', el: 'Συμπίεση PDF' },
      desc: { en: 'Reduce file size while keeping the best quality possible.', el: 'Μειώστε το μέγεθος του αρχείου με την καλύτερη δυνατή ποιότητα.' },
      action: { en: 'Compress PDF', el: 'Συμπίεση' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'level', label: { en: 'Compression level', el: 'Επίπεδο συμπίεσης' }, type: 'radio',
          default: (caps) => (caps.ghostscript ? 'gs-ebook' : 'balanced'), choices: [
            { value: 'lossless', label: { en: 'Basic', el: 'Βασική' }, hint: { en: 'Lossless clean-up. Keeps everything as is.', el: 'Χωρίς απώλειες. Όλα μένουν ως έχουν.' } },
            { value: 'gs-ebook', requires: 'ghostscript', label: { en: 'Recommended', el: 'Προτεινόμενη' }, hint: { en: 'Images at 150 DPI, text stays selectable (Ghostscript).', el: 'Εικόνες στα 150 DPI, το κείμενο μένει επιλέξιμο (Ghostscript).' } },
            { value: 'gs-screen', requires: 'ghostscript', label: { en: 'Strong', el: 'Ισχυρή' }, hint: { en: 'Images at 72 DPI, text stays selectable (Ghostscript).', el: 'Εικόνες στα 72 DPI, το κείμενο μένει επιλέξιμο (Ghostscript).' } },
            { value: 'balanced', label: { en: 'Scan — balanced', el: 'Σάρωση — ισορροπημένη' }, hint: { en: 'Pages become 150 DPI images. Best for scans.', el: 'Οι σελίδες γίνονται εικόνες 150 DPI. Ιδανικό για σαρώσεις.' } },
            { value: 'strong', label: { en: 'Scan — extreme', el: 'Σάρωση — μέγιστη' }, hint: { en: 'Pages become 96 DPI images. Smallest files.', el: 'Οι σελίδες γίνονται εικόνες 96 DPI. Τα μικρότερα αρχεία.' } },
          ] },
        { id: 'warn', type: 'note', showIf: (o) => o.level === 'balanced' || o.level === 'strong',
          html: { en: 'The “Scan” levels turn pages into images, so text is no longer selectable.', el: 'Τα επίπεδα «Σάρωση» μετατρέπουν τις σελίδες σε εικόνες, οπότε το κείμενο δεν είναι πια επιλέξιμο.' } },
      ],
      async run({ files, options: o, progress }) {
        const raster = { balanced: { dpi: 150, quality: 0.7 }, strong: { dpi: 96, quality: 0.5 } }[o.level];
        return eachFile(files, progress, async (f) => {
          let data;
          if (o.level === 'lossless') {
            const r = await PDFApp.qpdf(['/in.pdf', '--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '/out.pdf'], f.bytes);
            data = r.out || (await (await load(f.bytes)).save({ useObjectStreams: true }));
          } else if (o.level.startsWith('gs-')) data = await gs(f.bytes, { op: 'compress', level: o.level.slice(3) });
          else data = await rasterize(f, { ...raster, progress });
          const name = `${base(f)}_compressed.pdf`;
          if (data.byteLength >= f.size) return { name, data: f.bytes, note: L({ en: 'Already optimized — original kept', el: 'Ήδη βελτιστοποιημένο — κρατήθηκε το αρχικό' }) };
          return { name, data, note: sizeNote(f.size, data.byteLength) };
        });
      },
    },
    {
      id: 'grayscale', icon: 'palette', color: '#52525b', category: 'Optimize',
      name: { en: 'Grayscale PDF', el: 'Ασπρόμαυρο PDF' },
      desc: { en: 'Convert all colors to shades of gray, e.g. for cheaper printing.', el: 'Μετατρέψτε όλα τα χρώματα σε αποχρώσεις του γκρι, π.χ. για φθηνότερη εκτύπωση.' },
      action: { en: 'Convert to grayscale', el: 'Μετατροπή' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'warn', type: 'note', showIf: (o, caps) => !caps.ghostscript,
          html: { en: 'Pages are converted to images, so text is no longer selectable.', el: 'Οι σελίδες μετατρέπονται σε εικόνες, οπότε το κείμενο δεν είναι πια επιλέξιμο.' } },
      ],
      async run({ files, caps, progress }) {
        return eachFile(files, progress, async (f) => ({
          name: `${base(f)}_grayscale.pdf`,
          data: caps.ghostscript ? await gs(f.bytes, { op: 'grayscale' }) : await rasterize(f, { dpi: 150, quality: 0.8, gray: true, progress }),
        }));
      },
    },
    {
      id: 'repair', icon: 'wrench', color: '#0f766e', category: 'Optimize',
      name: { en: 'Repair PDF', el: 'Επιδιόρθωση PDF' },
      desc: { en: 'Fix damaged or corrupted PDFs that won’t open properly.', el: 'Διορθώστε κατεστραμμένα PDF που δεν ανοίγουν σωστά.' },
      action: { en: 'Repair PDF', el: 'Επιδιόρθωση' },
      accept: 'pdf', multiple: true, view: 'files', lenient: true,
      async run({ files, progress }) {
        const fixedNote = L({ en: 'Problems found and fixed', el: 'Βρέθηκαν και διορθώθηκαν προβλήματα' });
        return eachFile(files, progress, async (f) => {
          const name = `${base(f)}_repaired.pdf`;
          const direct = await PDFApp.qpdf(['/in.pdf', '--object-streams=preserve', '/out.pdf'], f.bytes);
          if (direct.out && direct.code !== 2) {
            return { name, data: direct.out, note: direct.code === 3 ? fixedNote : L({ en: 'No problems found — file rewritten', el: 'Δεν βρέθηκαν προβλήματα — το αρχείο ξαναγράφτηκε' }) };
          }
          // 1) rebuild the cross-reference table and let qpdf rewrite the file cleanly
          const rebuilt = rebuildXref(f.bytes);
          if (rebuilt) {
            const r = await PDFApp.qpdf(['/in.pdf', '--object-streams=preserve', '/out.pdf'], rebuilt);
            if (r.out && r.code !== 2) return { name, data: r.out, note: fixedNote };
          }
          // 2) last resort: pdf.js tolerates a lot of damage — re-render what it can read
          let pdf = f.pdf;
          if (!pdf) pdf = await PDFApp.openPdfjs(f.bytes).catch(() => null);
          if (pdf) {
            return { name, data: await PDFTools.helpers.rasterize({ ...f, pdf }, { dpi: 200, quality: 0.85, progress }),
              note: L({ en: 'Rebuilt from page images (text is no longer selectable)', el: 'Ανακατασκευάστηκε από εικόνες σελίδων (το κείμενο δεν είναι επιλέξιμο)' }) };
          }
          throw new Error(L({ en: `${f.name} could not be repaired.`, el: `Το ${f.name} δεν μπόρεσε να επιδιορθωθεί.` }));
        });
      },
    },
    {
      id: 'metadata', icon: 'info', color: '#687076', category: 'Optimize',
      name: { en: 'Edit metadata', el: 'Μεταδεδομένα' },
      desc: { en: 'Change the title, author, subject and keywords stored in a PDF.', el: 'Αλλάξτε τον τίτλο, τον συγγραφέα, το θέμα και τις λέξεις-κλειδιά ενός PDF.' },
      action: { en: 'Save metadata', el: 'Αποθήκευση' },
      accept: 'pdf', view: 'files',
      options: [
        { id: 'title', label: { en: 'Title', el: 'Τίτλος' }, type: 'text', default: '' },
        { id: 'author', label: { en: 'Author', el: 'Συγγραφέας' }, type: 'text', default: '' },
        { id: 'subject', label: { en: 'Subject', el: 'Θέμα' }, type: 'text', default: '' },
        { id: 'keywords', label: { en: 'Keywords', el: 'Λέξεις-κλειδιά' }, type: 'text', default: '', hint: { en: 'Separate keywords with commas.', el: 'Χωρίστε τις λέξεις με κόμμα.' } },
        { id: 'creator', label: { en: 'Creator application', el: 'Εφαρμογή δημιουργίας' }, type: 'text', default: '' },
      ],
      async onLoad({ files }) {
        const doc = await load(files[0].bytes, { updateMetadata: false });
        return {
          title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
          keywords: doc.getKeywords() || '', creator: doc.getCreator() || '',
        };
      },
      async run({ files, options: o }) {
        const doc = await load(files[0].bytes, { updateMetadata: false });
        doc.setTitle(o.title.trim());
        doc.setAuthor(o.author.trim());
        doc.setSubject(o.subject.trim());
        doc.setKeywords(o.keywords.split(',').map((k) => k.trim()).filter(Boolean));
        doc.setCreator(o.creator.trim());
        doc.setProducer('CPDF');
        doc.setModificationDate(new Date());
        return [{ name: files[0].name, data: await doc.save() }];
      },
    },
  );
})();
