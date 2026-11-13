/* CPDF — Compare tool: report of visual and text differences between two PDFs. */
(function () {
  'use strict';

  const RENDER_W = 700; // px width both pages are rendered at for the pixel diff

  async function pageWords(pdf, n) {
    if (n > pdf.numPages) return [];
    const tc = await (await pdf.getPage(n)).getTextContent();
    return tc.items.map((i) => i.str).join(' ').split(/\s+/).filter(Boolean);
  }

  /** Word diff → [{ op: '=', '-', '+', words: [...] }]. LCS table, with a coarse fallback for huge pages. */
  function diffWords(a, b) {
    const n = a.length, m = b.length;
    if ((n + 1) * (m + 1) > 4e6) {
      const same = a.join(' ') === b.join(' ');
      return same ? [{ op: '=', words: a }] : [{ op: '-', words: a }, { op: '+', words: b }];
    }
    const w = m + 1, dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    const ops = [];
    const push = (op, word) => {
      const last = ops[ops.length - 1];
      if (last && last.op === op) last.words.push(word); else ops.push({ op, words: [word] });
    };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { push('=', a[i]); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) push('-', a[i++]);
      else push('+', b[j++]);
    }
    while (i < n) push('-', a[i++]);
    while (j < m) push('+', b[j++]);
    return ops;
  }

  async function renderAt(pdf, n) {
    if (n > pdf.numPages) return null;
    return PDFApp.renderPage(pdf, n, { width: RENDER_W, intent: 'print' });
  }

  /** Returns { canvas: new page with changed pixels tinted red, changed: fraction of differing pixels }. */
  function pixelDiff(ca, cb) {
    const out = PDFApp.el('canvas', { width: cb.width, height: cb.height });
    const ctx = out.getContext('2d');
    ctx.drawImage(cb, 0, 0);
    if (!ca) return { canvas: out, changed: 1 };
    const h = Math.min(ca.height, cb.height);
    const A = ca.getContext('2d').getImageData(0, 0, ca.width, h).data;
    const img = ctx.getImageData(0, 0, cb.width, h);
    const B = img.data;
    let diff = 0;
    for (let p = 0; p < B.length; p += 4) {
      const d = Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      if (d > 60) {
        diff++;
        B[p] = 235; B[p + 1] = Math.round(B[p + 1] * 0.35); B[p + 2] = Math.round(B[p + 2] * 0.35);
      }
    }
    ctx.putImageData(img, 0, 0);
    const changed = diff / (B.length / 4) + (ca.height !== cb.height ? 0.01 : 0);
    return { canvas: out, changed };
  }

  /** Splits text into lines that fit `maxW` at `size`. */
  function wrap(font, text, size, maxW) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxW && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  PDFTools.register({
    id: 'compare', icon: 'compare', color: '#0369a1', category: 'Organize',
    name: { en: 'Compare PDF', el: 'Σύγκριση PDF' },
    desc: { en: 'Spot the differences between two versions of a document, page by page.', el: 'Βρείτε τις διαφορές ανάμεσα σε δύο εκδόσεις ενός εγγράφου, σελίδα προς σελίδα.' },
    action: { en: 'Compare', el: 'Σύγκριση' },
    note: { en: 'Add the original first and the new version second. You get a PDF report with the changes highlighted.', el: 'Προσθέστε πρώτα το αρχικό και μετά τη νέα έκδοση. Θα πάρετε μια αναφορά PDF με τις αλλαγές σημειωμένες.' },
    accept: 'pdf', multiple: true, minFiles: 2, maxFiles: 2, view: 'files',
    async run({ files, progress }) {
      const [fa, fb] = files;
      const { rgb, PDFDocument } = PDFLib;
      const doc = await PDFDocument.create();
      const { font } = await PDFApp.embedTextFont(doc, 'Ω'); // Unicode font: report may quote any script
      const W = 842, H = 595, M = 32;
      const pages = Math.max(fa.pdf.numPages, fb.pdf.numPages);
      const red = rgb(0.85, 0.15, 0.2), green = rgb(0.1, 0.55, 0.3), ink = rgb(0.1, 0.12, 0.16), muted = rgb(0.45, 0.48, 0.55);
      const changedPages = [];
      const summary = doc.addPage([W, H]);

      for (let n = 1; n <= pages; n++) {
        progress(L({ en: `Comparing page ${n}/${pages}…`, el: `Σύγκριση σελίδας ${n}/${pages}…` }));
        const [ca, cb] = [await renderAt(fa.pdf, n), await renderAt(fb.pdf, n)];
        const ops = diffWords(await pageWords(fa.pdf, n), await pageWords(fb.pdf, n));
        const textChanged = ops.some((o) => o.op !== '=');
        const vis = cb ? pixelDiff(ca, cb) : { canvas: null, changed: 1 };
        const changed = textChanged || vis.changed > 0.0005;
        if (changed) changedPages.push(n);

        let page = doc.addPage([W, H]);
        const status = changed ? L({ en: 'changed', el: 'άλλαξε' }) : L({ en: 'identical', el: 'ίδια' });
        page.drawText(`${L({ en: 'Page', el: 'Σελίδα' })} ${n} — ${status}`, { x: M, y: H - M - 4, size: 15, font, color: changed ? red : green });
        page.drawText(fa.name, { x: M, y: H - M - 24, size: 9, font, color: muted });
        page.drawText(fb.name, { x: W / 2 + 8, y: H - M - 24, size: 9, font, color: muted });

        const boxW = W / 2 - M - 8, boxH = 300, top = H - M - 34;
        const place = async (canvas, x) => {
          if (!canvas) { page.drawText(L({ en: '(no page)', el: '(χωρίς σελίδα)' }), { x: x + 8, y: top - 20, size: 10, font, color: muted }); return; }
          const img = await doc.embedJpg(await (await PDFApp.canvasToBlob(canvas, 'image/jpeg', 0.8)).arrayBuffer());
          const s = Math.min(boxW / img.width, boxH / img.height);
          page.drawRectangle({ x, y: top - img.height * s, width: img.width * s, height: img.height * s, borderColor: muted, borderWidth: 0.5 });
          page.drawImage(img, { x, y: top - img.height * s, width: img.width * s, height: img.height * s });
        };
        await place(ca, M);
        await place(vis.canvas, W / 2 + 8);

        // Text changes under the thumbnails, continued on extra pages when long.
        let y = top - boxH - 22;
        const line = (text, color) => {
          for (const l of wrap(font, text, 9, W - 2 * M)) {
            if (y < M) { page = doc.addPage([W, H]); y = H - M; }
            page.drawText(l, { x: M, y, size: 9, font, color });
            y -= 12;
          }
        };
        const edits = ops.filter((o) => o.op !== '=');
        if (!edits.length) line(L({ en: 'No text changes.', el: 'Καμία αλλαγή στο κείμενο.' }), muted);
        for (const o of edits.slice(0, 200)) line(`${o.op === '-' ? '−' : '+'} ${o.words.join(' ')}`, o.op === '-' ? red : green);
        if (edits.length > 200) line(L({ en: `… and ${edits.length - 200} more changes`, el: `… και άλλες ${edits.length - 200} αλλαγές` }), muted);
        [ca, cb, vis.canvas].forEach((c) => { if (c) c.width = c.height = 0; });
      }

      summary.drawText(L({ en: 'Comparison report', el: 'Αναφορά σύγκρισης' }), { x: M, y: H - M - 10, size: 22, font, color: ink });
      const rows = [
        [L({ en: 'Original', el: 'Αρχικό' }), `${fa.name} (${tn('n.pages', fa.pdf.numPages)})`],
        [L({ en: 'New version', el: 'Νέα έκδοση' }), `${fb.name} (${tn('n.pages', fb.pdf.numPages)})`],
        [L({ en: 'Pages with differences', el: 'Σελίδες με διαφορές' }), changedPages.length ? changedPages.join(', ') : L({ en: 'none', el: 'καμία' })],
      ];
      rows.forEach(([k, v], i) => {
        summary.drawText(k, { x: M, y: H - M - 56 - i * 22, size: 11, font, color: muted });
        summary.drawText(v, { x: M + 170, y: H - M - 56 - i * 22, size: 11, font, color: ink });
      });
      summary.drawText(L({ en: 'Red marks on the right-hand pages show areas that look different. Removed words are listed in red (−), added words in green (+).', el: 'Οι κόκκινες περιοχές στις δεξιές σελίδες δείχνουν τι διαφέρει οπτικά. Οι λέξεις που αφαιρέθηκαν είναι με κόκκινο (−) και όσες προστέθηκαν με πράσινο (+).' }),
        { x: M, y: H - M - 140, size: 10, font, color: muted, maxWidth: W - 2 * M, lineHeight: 14 });

      return [{
        name: `compare_${PDFTools.helpers.base(fa)}_vs_${PDFTools.helpers.base(fb)}.pdf`,
        data: await doc.save(),
        note: changedPages.length
          ? L({ en: `${changedPages.length} of ${pages} pages differ`, el: `${changedPages.length} από ${pages} σελίδες διαφέρουν` })
          : L({ en: 'The documents look identical', el: 'Τα έγγραφα φαίνονται ίδια' }),
      }];
    },
  });
})();
