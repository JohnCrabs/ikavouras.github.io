/* CPDF — Edit tools: editor, sign, watermark, page numbers, fill forms, flatten. */
(function () {
  'use strict';
  const { load, deg, norm, base, boxOf, eachFile } = PDFTools.helpers;

  /**
   * Coordinates "as the page is displayed" (origin top-left, y down, honouring /Rotate)
   * mapped to PDF user space. Returns the displayed size, a point mapper and the text angle.
   */
  function displaySpace(page) {
    const b = boxOf(page);
    const r = norm(page.getRotation().angle);
    const sideways = r === 90 || r === 270;
    const map = {
      0: (X, Y) => ({ x: b.x + X, y: b.y + b.height - Y }),
      90: (X, Y) => ({ x: b.x + Y, y: b.y + X }),
      180: (X, Y) => ({ x: b.x + b.width - X, y: b.y + Y }),
      270: (X, Y) => ({ x: b.x + b.width - Y, y: b.y + b.height - X }),
    }[r];
    return { w: sideways ? b.height : b.width, h: sideways ? b.width : b.height, map, angle: r };
  }

  PDFTools.register(
    {
      id: 'edit', icon: 'edit', color: '#6e56cf', category: 'Edit', href: 'editor.html',
      name: { en: 'Edit PDF', el: 'Επεξεργασία PDF' },
      desc: { en: 'Change existing text, or add text, drawings, highlights, shapes and images.', el: 'Αλλάξτε το υπάρχον κείμενο ή προσθέστε κείμενο, σχέδια, επισημάνσεις, σχήματα και εικόνες.' },
    },
    {
      id: 'sign', icon: 'sign', color: '#2b9a66', category: 'Edit', href: 'editor.html?mode=sign',
      name: { en: 'Sign PDF', el: 'Υπογραφή PDF' },
      desc: { en: 'Draw, type or upload your signature and place it on the document.', el: 'Σχεδιάστε, πληκτρολογήστε ή ανεβάστε την υπογραφή σας και τοποθετήστε την στο έγγραφο.' },
    },
    {
      id: 'watermark', icon: 'droplet', color: '#3e63dd', category: 'Edit',
      name: { en: 'Add watermark', el: 'Υδατογράφημα' },
      desc: { en: 'Stamp text such as “CONFIDENTIAL” across every page.', el: 'Τυπώστε κείμενο όπως «ΕΜΠΙΣΤΕΥΤΙΚΟ» σε κάθε σελίδα.' },
      action: { en: 'Add watermark', el: 'Προσθήκη' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'text', label: { en: 'Watermark text', el: 'Κείμενο' }, type: 'text', default: { en: 'CONFIDENTIAL', el: 'ΕΜΠΙΣΤΕΥΤΙΚΟ' } },
        { id: 'layout', label: { en: 'Layout', el: 'Διάταξη' }, type: 'segmented', default: 'center', choices: [
          { value: 'center', label: { en: 'Centered', el: 'Στο κέντρο' } }, { value: 'tile', label: { en: 'Tiled', el: 'Επανάληψη' } },
        ] },
        { id: 'fontSize', label: { en: 'Font size', el: 'Μέγεθος' }, type: 'range', default: 64, min: 12, max: 160, step: 2, unit: 'pt' },
        { id: 'rotation', label: { en: 'Angle', el: 'Γωνία' }, type: 'range', default: 45, min: -90, max: 90, step: 5, unit: '°' },
        { id: 'opacity', label: { en: 'Opacity', el: 'Αδιαφάνεια' }, type: 'range', default: 0.25, min: 0.05, max: 1, step: 0.05, percent: true },
        { id: 'color', label: { en: 'Color', el: 'Χρώμα' }, type: 'color', default: '#e5484d' },
      ],
      async run({ files, options: o, progress }) {
        const raw = o.text.trim() || 'CONFIDENTIAL';
        return eachFile(files, progress, async (f) => {
          const doc = await load(f.bytes);
          const { font, clean } = await PDFApp.embedTextFont(doc, raw);
          const text = clean(raw);
          const size = o.fontSize;
          const w = font.widthOfTextAtSize(text, size), h = size * 0.7;
          const color = PDFApp.hexToRgb(o.color);
          for (const page of doc.getPages()) {
            // Compensate for /Rotate so the watermark reads at the chosen angle on screen.
            const angle = o.rotation + page.getRotation().angle;
            const rad = (angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
            const draw = (cx, cy) => page.drawText(text, {
              x: cx - (w / 2) * cos + (h / 2) * sin,
              y: cy - (w / 2) * sin - (h / 2) * cos,
              size, font, color, opacity: o.opacity, rotate: deg(angle),
            });
            const b = boxOf(page);
            if (o.layout === 'tile') {
              const stepX = w + size * 2, stepY = size * 3.5;
              for (let row = 0, y = b.y - stepY; y < b.y + b.height + stepY; y += stepY, row++) {
                for (let x = b.x - stepX + (row % 2) * (stepX / 2); x < b.x + b.width + stepX; x += stepX) draw(x, y);
              }
            } else draw(b.x + b.width / 2, b.y + b.height / 2);
          }
          return { name: `${base(f)}_watermarked.pdf`, data: await doc.save() };
        });
      },
    },
    {
      id: 'page-numbers', icon: 'hash', color: '#0d9488', category: 'Edit',
      name: { en: 'Page numbers', el: 'Αρίθμηση σελίδων' },
      desc: { en: 'Number your pages with custom position, format and style.', el: 'Αριθμήστε τις σελίδες με τη θέση, τη μορφή και το στυλ που θέλετε.' },
      action: { en: 'Add page numbers', el: 'Προσθήκη αρίθμησης' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'position', label: { en: 'Position', el: 'Θέση' }, type: 'select', default: 'bottom-center', choices: [
          { value: 'bottom-center', label: { en: 'Bottom center', el: 'Κάτω στο κέντρο' } }, { value: 'bottom-right', label: { en: 'Bottom right', el: 'Κάτω δεξιά' } }, { value: 'bottom-left', label: { en: 'Bottom left', el: 'Κάτω αριστερά' } },
          { value: 'top-center', label: { en: 'Top center', el: 'Πάνω στο κέντρο' } }, { value: 'top-right', label: { en: 'Top right', el: 'Πάνω δεξιά' } }, { value: 'top-left', label: { en: 'Top left', el: 'Πάνω αριστερά' } },
        ] },
        { id: 'format', label: { en: 'Format', el: 'Μορφή' }, type: 'text', default: '{n}',
          hint: { en: 'Use {n} for the page number and {total} for the page count, e.g. “Page {n} of {total}”.', el: 'Το {n} είναι ο αριθμός σελίδας και το {total} το σύνολο, π.χ. «Σελίδα {n} από {total}».' } },
        { id: 'start', label: { en: 'First number', el: 'Πρώτος αριθμός' }, type: 'number', default: 1, min: 0 },
        { id: 'skipFirst', label: { en: 'Don’t number the first page (cover)', el: 'Χωρίς αριθμό στην πρώτη σελίδα (εξώφυλλο)' }, type: 'checkbox', default: false },
        { id: 'fontSize', label: { en: 'Font size', el: 'Μέγεθος' }, type: 'range', default: 11, min: 6, max: 36, step: 1, unit: 'pt' },
        { id: 'margin', label: { en: 'Distance from edge', el: 'Απόσταση από την άκρη' }, type: 'range', default: 28, min: 8, max: 96, step: 2, unit: 'pt' },
        { id: 'color', label: { en: 'Color', el: 'Χρώμα' }, type: 'color', default: '#1b1f2a' },
      ],
      async run({ files, options: o, progress }) {
        return eachFile(files, progress, async (f) => {
          const doc = await load(f.bytes);
          const pages = doc.getPages();
          const { font, clean } = await PDFApp.embedTextFont(doc, o.format.replace(/\{n\}|\{total\}/g, '0123456789'));
          const color = PDFApp.hexToRgb(o.color);
          const first = o.skipFirst ? 1 : 0;
          const start = Number.isFinite(o.start) ? o.start : 1;
          const total = start + pages.length - first - 1;
          const [vert, horiz] = o.position.split('-');
          pages.forEach((page, i) => {
            if (i < first) return;
            const label = clean(o.format.replaceAll('{n}', start + i - first).replaceAll('{total}', total));
            const tw = font.widthOfTextAtSize(label, o.fontSize);
            // Position in displayed orientation, so numbers sit on the visual bottom/top even on rotated pages.
            const d = displaySpace(page);
            const X = horiz === 'left' ? o.margin : horiz === 'right' ? d.w - o.margin - tw : (d.w - tw) / 2;
            const Y = vert === 'bottom' ? d.h - o.margin : o.margin + o.fontSize * 0.7;
            const p = d.map(X, Y);
            page.drawText(label, { x: p.x, y: p.y, size: o.fontSize, font, color, rotate: deg(d.angle) });
          });
          return { name: `${base(f)}_numbered.pdf`, data: await doc.save() };
        });
      },
    },
    {
      id: 'fill-form', icon: 'form', color: '#7c3aed', category: 'Edit',
      name: { en: 'Fill PDF form', el: 'Συμπλήρωση φόρμας' },
      desc: { en: 'Fill in the fields of a PDF form and optionally lock them.', el: 'Συμπληρώστε τα πεδία μιας φόρμας PDF και, αν θέλετε, κλειδώστε τα.' },
      action: { en: 'Save form', el: 'Αποθήκευση φόρμας' },
      accept: 'pdf', view: 'form',
      options: [
        { id: 'flatten', label: { en: 'Flatten after filling (fields can no longer be changed)', el: 'Κλείδωμα μετά τη συμπλήρωση (τα πεδία δεν αλλάζουν πια)' }, type: 'checkbox', default: false },
      ],
      async run({ files, form, options: o }) {
        const doc = await load(files[0].bytes);
        const pdfForm = doc.getForm();
        const values = form ? form.values : {};
        let needsUnicode = false;
        for (const field of pdfForm.getFields()) {
          const name = field.getName();
          if (!(name in values)) continue;
          const v = values[name];
          const { PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = PDFLib;
          if (field instanceof PDFTextField) { field.setText(v || undefined); if (v && !/^[\x20-\x7E\xA0-\xFF\n\r\t]*$/.test(v)) needsUnicode = true; }
          else if (field instanceof PDFCheckBox) (v ? field.check() : field.uncheck());
          else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) { if (v) field.select(v); else field.clear(); }
        }
        // Text outside WinAnsi (e.g. Greek) needs an embedded Unicode font for the field appearances.
        if (needsUnicode) {
          const { font } = await PDFApp.embedTextFont(doc, 'Ω');
          pdfForm.updateFieldAppearances(font);
        }
        if (o.flatten) pdfForm.flatten();
        return [{ name: `${base(files[0])}_filled.pdf`, data: await doc.save() }];
      },
    },
    {
      id: 'flatten', icon: 'layers', color: '#475569', category: 'Edit',
      name: { en: 'Flatten PDF', el: 'Κλείδωμα PDF (flatten)' },
      desc: { en: 'Merge form fields and annotations into the page so they can’t be edited.', el: 'Ενσωματώστε πεδία φορμών και σχόλια στη σελίδα ώστε να μην αλλάζουν.' },
      action: { en: 'Flatten PDF', el: 'Κλείδωμα' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'what', label: { en: 'Flatten', el: 'Τι θα κλειδώσει' }, type: 'radio', default: 'forms', choices: [
          { value: 'forms', label: { en: 'Form fields', el: 'Πεδία φορμών' }, hint: { en: 'Keeps text selectable and the file small.', el: 'Το κείμενο μένει επιλέξιμο και το αρχείο μικρό.' } },
          { value: 'all', label: { en: 'Everything (as image)', el: 'Τα πάντα (ως εικόνα)' }, hint: { en: 'Also comments and stamps. Pages become images.', el: 'Και σχόλια και σφραγίδες. Οι σελίδες γίνονται εικόνες.' } },
        ] },
      ],
      async run({ files, options: o, progress }) {
        return eachFile(files, progress, async (f) => {
          let data;
          if (o.what === 'all') data = await PDFTools.helpers.rasterize(f, { dpi: 200, quality: 0.85, progress });
          else {
            const doc = await load(f.bytes);
            const form = doc.getForm();
            if (form.getFields().length) form.flatten();
            data = await doc.save();
          }
          return { name: `${base(f)}_flattened.pdf`, data };
        });
      },
    },
  );
})();
