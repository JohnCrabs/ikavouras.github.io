/* CPDF — OCR: makes scanned PDFs searchable with Tesseract (WebAssembly, runs offline).
 * Each page is rendered to an image and recognised; the words are written back onto the
 * original page as invisible text, so the page looks the same but text can be found and copied.
 */
(function () {
  'use strict';
  const { load, base } = PDFTools.helpers;

  let workerPromise = null, workerLangs = null, logHook = () => {};

  async function getWorker(langs) {
    if (workerPromise && workerLangs === langs) return workerPromise;
    if (workerPromise) (await workerPromise).terminate();
    await PDFApp.loadScript(PDFApp.asset('js/vendor/tesseract/tesseract.min.js'));
    workerLangs = langs;
    workerPromise = Tesseract.createWorker(langs.split('+'), 1 /* LSTM only */, {
      workerPath: PDFApp.asset('js/vendor/tesseract/worker.min.js'),
      corePath: PDFApp.asset('js/vendor/tesseract/'),
      langPath: PDFApp.asset('js/vendor/tesseract/lang'),
      gzip: true,
      cacheMethod: 'none',
      logger: (m) => logHook(m),
    });
    return workerPromise;
  }

  /** Words with pixel boxes from Tesseract's block → paragraph → line → word tree. */
  function wordsOf(data) {
    const words = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
      for (const w of l.words) {
        const text = w.text.trim();
        if (text && w.confidence > 20) words.push({ text, box: w.bbox, line: l.bbox });
      }
    }
    return words;
  }

  PDFTools.register({
    id: 'ocr', icon: 'scan', color: '#a16207', category: 'Convert',
    name: { en: 'OCR PDF', el: 'OCR (αναγνώριση κειμένου)' },
    desc: { en: 'Make scanned PDFs searchable and copyable. Works offline for Greek and English.', el: 'Κάντε τα σαρωμένα PDF αναζητήσιμα και αντιγράψιμα. Λειτουργεί offline για Ελληνικά και Αγγλικά.' },
    action: { en: 'Run OCR', el: 'Εκτέλεση OCR' },
    note: { en: 'Pages keep their exact look; an invisible text layer is added on top.', el: 'Οι σελίδες δεν αλλάζουν εμφάνιση· προστίθεται ένα αόρατο στρώμα κειμένου.' },
    accept: 'pdf', multiple: true, view: 'files',
    options: [
      { id: 'langs', label: { en: 'Document language', el: 'Γλώσσα εγγράφου' }, type: 'segmented', default: () => (I18N.lang === 'el' ? 'ell+eng' : 'eng'), choices: [
        { value: 'ell+eng', label: { en: 'Greek + English', el: 'Ελληνικά + Αγγλικά' } }, { value: 'eng', label: { en: 'English', el: 'Αγγλικά' } }, { value: 'ell', label: { en: 'Greek', el: 'Ελληνικά' } },
      ] },
      { id: 'quality', label: { en: 'Accuracy', el: 'Ακρίβεια' }, type: 'segmented', default: '300', choices: [
        { value: '200', label: { en: 'Fast', el: 'Γρήγορη' } }, { value: '300', label: { en: 'Accurate', el: 'Υψηλή' } },
      ] },
      { id: 'skipText', label: { en: 'Skip pages that already contain text', el: 'Παράλειψη σελίδων που έχουν ήδη κείμενο' }, type: 'checkbox', default: true },
      { id: 'txt', label: { en: 'Also save the text as a .txt file', el: 'Αποθήκευση και του κειμένου σε αρχείο .txt' }, type: 'checkbox', default: false },
    ],
    async run({ files, options: o, progress }) {
      const { pushGraphicsState, popGraphicsState, setTextRenderingMode, TextRenderingMode, setCharacterSqueeze, degrees } = PDFLib;
      progress(L({ en: 'Loading the OCR engine…', el: 'Φόρτωση της μηχανής OCR…' }));
      const worker = await getWorker(o.langs);
      const out = [];
      for (const f of files) {
        const doc = await load(f.bytes);
        const pages = doc.getPages();
        const recognised = [];
        let done = 0;
        for (let n = 1; n <= f.pdf.numPages; n++) {
          const page = await f.pdf.getPage(n);
          if (o.skipText && (await page.getTextContent()).items.some((i) => i.str.trim())) { recognised.push(null); continue; }
          const label = L({ en: `${f.name} — page ${n}/${f.pdf.numPages}`, el: `${f.name} — σελίδα ${n}/${f.pdf.numPages}` });
          progress(label);
          logHook = (m) => { if (m.status === 'recognizing text') progress(`${label} (${Math.round(m.progress * 100)}%)`); };
          const scale = +o.quality / 72;
          const canvas = await PDFApp.renderPage(f.pdf, n, { scale, intent: 'print' });
          const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
          canvas.width = canvas.height = 0;
          recognised.push({ vp: page.getViewport({ scale }), words: wordsOf(data), text: data.text });
          done++;
        }
        logHook = () => {};

        const allText = recognised.filter(Boolean).map((r) => r.words.map((w) => w.text).join(' ')).join(' ');
        if (allText) {
          const { font, clean } = await PDFApp.embedTextFont(doc, allText);
          recognised.forEach((r, i) => {
            if (!r) return;
            const page = pages[i];
            const P = (x, y) => { const [px, py] = r.vp.convertToPdfPoint(x, y); return { x: px, y: py }; };
            const o0 = P(0, 0), ex = P(1, 0);
            const angle = (Math.atan2(ex.y - o0.y, ex.x - o0.x) * 180) / Math.PI;
            const k = Math.hypot(ex.x - o0.x, ex.y - o0.y); // PDF units per pixel
            page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
            for (const w of r.words) {
              const text = clean(w.text);
              const hPx = w.line.y1 - w.line.y0, wPx = w.box.x1 - w.box.x0;
              const size = Math.max(1, hPx * k * 0.8);
              const natural = font.widthOfTextAtSize(text, size);
              if (!natural) continue;
              // Squeeze/stretch horizontally so the invisible word covers the visible one exactly.
              page.pushOperators(setCharacterSqueeze(Math.max(10, Math.min(500, (100 * wPx * k) / natural))));
              const b = P(w.box.x0, w.line.y1 - hPx * 0.22);
              page.drawText(text, { x: b.x, y: b.y, size, font, rotate: degrees(angle) });
            }
            page.pushOperators(setCharacterSqueeze(100), popGraphicsState());
          });
        }
        const note = done
          ? L({ en: `Text recognised on ${done} page${done === 1 ? '' : 's'}`, el: `Αναγνωρίστηκε κείμενο σε ${done} σελίδ${done === 1 ? 'α' : 'ες'}` })
          : L({ en: 'All pages already had text — nothing to do', el: 'Όλες οι σελίδες είχαν ήδη κείμενο' });
        out.push({ name: `${base(f)}_ocr.pdf`, data: await doc.save(), note });
        if (o.txt) {
          const text = recognised.map((r, i) => `--- ${i + 1} ---\n${r ? r.text.trim() : ''}`).join('\n\n');
          out.push({ name: `${base(f)}_ocr.txt`, data: new Blob([text], { type: 'text/plain;charset=utf-8' }), type: 'text/plain' });
        }
      }
      return out;
    },
  });
})();
