/* CPDF — Organize tools: merge, split, organize, extract, delete, rotate, crop. */
(function () {
  'use strict';
  const { load, deg, norm, base, buildFrom } = PDFTools.helpers;

  PDFTools.register(
    {
      id: 'merge', icon: 'merge', color: '#e5484d', category: 'Organize', hot: true,
      name: { en: 'Merge PDF', el: 'Συγχώνευση PDF' },
      desc: { en: 'Combine several PDFs into one document, in the order you choose.', el: 'Ενώστε πολλά PDF σε ένα έγγραφο, με τη σειρά που θέλετε.' },
      action: { en: 'Merge PDF', el: 'Συγχώνευση' },
      note: { en: 'Drag the cards to change the order.', el: 'Σύρετε τις κάρτες για να αλλάξετε τη σειρά.' },
      accept: 'pdf', multiple: true, minFiles: 2, view: 'files',
      async run({ files }) {
        const out = await PDFLib.PDFDocument.create();
        for (const f of files) {
          const src = await load(f.bytes);
          (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
        }
        return [{ name: 'merged.pdf', data: await out.save() }];
      },
    },
    {
      id: 'split', icon: 'split', color: '#f76b15', category: 'Organize', hot: true,
      name: { en: 'Split PDF', el: 'Διαχωρισμός PDF' },
      desc: { en: 'Separate one PDF into several files by page ranges or fixed intervals.', el: 'Χωρίστε ένα PDF σε πολλά αρχεία με εύρη σελίδων ή σταθερά διαστήματα.' },
      action: { en: 'Split PDF', el: 'Διαχωρισμός' },
      accept: 'pdf', view: 'pages', pageMode: 'view',
      options: [
        { id: 'mode', label: { en: 'Split mode', el: 'Τρόπος' }, type: 'radio', default: 'ranges', choices: [
          { value: 'ranges', label: { en: 'Custom ranges', el: 'Προσαρμοσμένα εύρη' }, hint: { en: 'e.g. 1-3, 4-6, 7-', el: 'π.χ. 1-3, 4-6, 7-' } },
          { value: 'every', label: { en: 'Fixed interval', el: 'Σταθερό διάστημα' }, hint: { en: 'A new file every N pages', el: 'Νέο αρχείο κάθε Ν σελίδες' } },
          { value: 'all', label: { en: 'Every page', el: 'Κάθε σελίδα' }, hint: { en: 'One file per page', el: 'Ένα αρχείο ανά σελίδα' } },
        ] },
        { id: 'ranges', label: { en: 'Page ranges', el: 'Εύρη σελίδων' }, type: 'text', default: '1-2', placeholder: '1-3, 5, 8-', showIf: (o) => o.mode === 'ranges' },
        { id: 'merge', label: { en: 'Merge all ranges into one PDF', el: 'Ένωση όλων των ευρών σε ένα PDF' }, type: 'checkbox', default: false, showIf: (o) => o.mode === 'ranges' },
        { id: 'every', label: { en: 'Pages per file', el: 'Σελίδες ανά αρχείο' }, type: 'number', default: 2, min: 1, showIf: (o) => o.mode === 'every' },
      ],
      async run({ files, pageCount, options: o }) {
        const f = files[0];
        let groups;
        if (o.mode === 'all') groups = Array.from({ length: pageCount }, (_, i) => [i]);
        else if (o.mode === 'every') {
          const n = Math.max(1, Math.floor(o.every) || 1);
          groups = [];
          for (let i = 0; i < pageCount; i += n) groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k));
        } else groups = PDFApp.parseRanges(o.ranges, pageCount);

        if (o.mode === 'ranges' && o.merge) {
          return [{ name: `${base(f)}_extracted.pdf`, data: await buildFrom(f.bytes, groups.flat().map((src) => ({ src }))) }];
        }
        const out = [];
        for (const g of groups) {
          const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
          out.push({ name: `${base(f)}_pages_${label}.pdf`, data: await buildFrom(f.bytes, g.map((src) => ({ src }))) });
        }
        return out;
      },
    },
    {
      id: 'organize', icon: 'grid', color: '#8e4ec6', category: 'Organize',
      name: { en: 'Organize PDF', el: 'Οργάνωση PDF' },
      desc: { en: 'Reorder, rotate, duplicate or delete pages with drag and drop.', el: 'Αλλάξτε σειρά, περιστρέψτε, αντιγράψτε ή διαγράψτε σελίδες με σύρσιμο.' },
      action: { en: 'Save changes', el: 'Αποθήκευση' },
      note: { en: 'Drag pages to reorder them. Hover a page to rotate, duplicate or delete it.', el: 'Σύρετε τις σελίδες για να αλλάξετε σειρά. Περάστε το ποντίκι πάνω από μια σελίδα για περιστροφή, αντιγραφή ή διαγραφή.' },
      accept: 'pdf', view: 'pages', pageMode: 'organize',
      async run({ files, pages }) {
        return [{ name: `${base(files[0])}_organized.pdf`, data: await buildFrom(files[0].bytes, pages) }];
      },
    },
    {
      id: 'extract', icon: 'extract', color: '#0091ff', category: 'Organize',
      name: { en: 'Extract pages', el: 'Εξαγωγή σελίδων' },
      desc: { en: 'Pick the pages you need and save them as a new PDF.', el: 'Διαλέξτε τις σελίδες που χρειάζεστε και αποθηκεύστε τις σε νέο PDF.' },
      action: { en: 'Extract pages', el: 'Εξαγωγή' },
      note: { en: 'Click pages to select them, or type a range above the thumbnails.', el: 'Κάντε κλικ στις σελίδες για επιλογή ή γράψτε ένα εύρος πάνω από τις μικρογραφίες.' },
      accept: 'pdf', view: 'pages', pageMode: 'select',
      async run({ files, pages }) {
        const picked = pages.filter((p) => p.selected);
        if (!picked.length) throw new Error(L({ en: 'Select at least one page to extract', el: 'Επιλέξτε τουλάχιστον μία σελίδα' }));
        return [{ name: `${base(files[0])}_extract.pdf`, data: await buildFrom(files[0].bytes, picked) }];
      },
    },
    {
      id: 'delete', icon: 'trash', color: '#e54666', category: 'Organize',
      name: { en: 'Delete pages', el: 'Διαγραφή σελίδων' },
      desc: { en: 'Remove unwanted pages from a PDF.', el: 'Αφαιρέστε σελίδες που δεν χρειάζεστε από ένα PDF.' },
      action: { en: 'Delete pages', el: 'Διαγραφή' },
      note: { en: 'Click the pages you want to remove.', el: 'Κάντε κλικ στις σελίδες που θέλετε να αφαιρέσετε.' },
      accept: 'pdf', view: 'pages', pageMode: 'select', selectStyle: 'danger',
      async run({ files, pages }) {
        const doomed = pages.filter((p) => p.selected).map((p) => p.src).sort((a, b) => b - a);
        if (!doomed.length) throw new Error(L({ en: 'Select the pages you want to delete', el: 'Επιλέξτε τις σελίδες προς διαγραφή' }));
        if (doomed.length === pages.length) throw new Error(L({ en: 'You cannot delete every page', el: 'Δεν μπορείτε να διαγράψετε όλες τις σελίδες' }));
        const doc = await load(files[0].bytes);
        doomed.forEach((i) => doc.removePage(i));
        return [{ name: `${base(files[0])}_trimmed.pdf`, data: await doc.save() }];
      },
    },
    {
      id: 'rotate', icon: 'rotate', color: '#12a594', category: 'Organize',
      name: { en: 'Rotate PDF', el: 'Περιστροφή PDF' },
      desc: { en: 'Rotate individual pages or the whole document.', el: 'Περιστρέψτε μεμονωμένες σελίδες ή όλο το έγγραφο.' },
      action: { en: 'Apply rotation', el: 'Εφαρμογή' },
      note: { en: 'Click a page to rotate it 90° clockwise, or use the buttons above the thumbnails.', el: 'Κάντε κλικ σε μια σελίδα για περιστροφή 90° δεξιά ή χρησιμοποιήστε τα κουμπιά πάνω από τις μικρογραφίες.' },
      accept: 'pdf', view: 'pages', pageMode: 'rotate',
      async run({ files, pages }) {
        if (!pages.some((p) => norm(p.rotation))) throw new Error(L({ en: 'Rotate at least one page first', el: 'Περιστρέψτε πρώτα τουλάχιστον μία σελίδα' }));
        const doc = await load(files[0].bytes);
        const docPages = doc.getPages();
        for (const p of pages) {
          const r = norm(p.rotation);
          if (r) docPages[p.src].setRotation(deg(norm(docPages[p.src].getRotation().angle + r)));
        }
        return [{ name: `${base(files[0])}_rotated.pdf`, data: await doc.save() }];
      },
    },
    {
      id: 'crop', icon: 'crop', color: '#0e7490', category: 'Organize',
      name: { en: 'Crop PDF', el: 'Περικοπή PDF' },
      desc: { en: 'Trim page margins by drawing the area you want to keep.', el: 'Κόψτε τα περιθώρια σχεδιάζοντας την περιοχή που θέλετε να κρατήσετε.' },
      action: { en: 'Crop PDF', el: 'Περικοπή' },
      note: { en: 'Drag on the page to draw the area to keep. Use the arrows to preview other pages.', el: 'Σύρετε πάνω στη σελίδα για να ορίσετε την περιοχή που μένει. Με τα βέλη βλέπετε τις άλλες σελίδες.' },
      accept: 'pdf', view: 'crop',
      options: [
        { id: 'scope', label: { en: 'Apply to', el: 'Εφαρμογή σε' }, type: 'segmented', default: 'all', choices: [
          { value: 'all', label: { en: 'All pages', el: 'Όλες' } }, { value: 'current', label: { en: 'This page', el: 'Αυτή' } }, { value: 'ranges', label: { en: 'Pages…', el: 'Σελίδες…' } },
        ] },
        { id: 'ranges', label: { en: 'Pages', el: 'Σελίδες' }, type: 'text', default: '1', placeholder: '1-3, 5', showIf: (o) => o.scope === 'ranges' },
      ],
      async run({ files, crop, pageCount, options: o }) {
        if (!crop || !crop.rect) throw new Error(L({ en: 'Draw the area to keep on the page first', el: 'Ορίστε πρώτα την περιοχή πάνω στη σελίδα' }));
        const doc = await load(files[0].bytes);
        const pages = doc.getPages();
        const targets = o.scope === 'all' ? pages.map((_, i) => i)
          : o.scope === 'current' ? [crop.page]
            : PDFApp.parseRanges(o.ranges, pageCount).flat();
        // The rectangle is stored as fractions of the visible (rotated) page; map it to each page's own box.
        for (const i of targets) {
          const page = pages[i];
          const b = page.getCropBox();
          const r = norm(page.getRotation().angle);
          let { x, y, w, h } = crop.rect; // fractions, origin top-left of the page as displayed
          if (r === 90) [x, y, w, h] = [y, 1 - x - w, h, w];
          else if (r === 180) [x, y] = [1 - x - w, 1 - y - h];
          else if (r === 270) [x, y, w, h] = [1 - y - h, x, h, w];
          page.setCropBox(b.x + x * b.width, b.y + (1 - y - h) * b.height, w * b.width, h * b.height);
        }
        return [{ name: `${base(files[0])}_cropped.pdf`, data: await doc.save() }];
      },
    },
  );
})();
