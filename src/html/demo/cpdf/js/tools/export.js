/* CPDF — PDF → Excel and PDF → PowerPoint, written directly as Office Open XML (zipped with JSZip,
 * no extra library). Both run fully in the browser.
 *  • Excel: tables are rebuilt from text positions — rows from shared baselines, columns from the
 *    vertical gaps ("gutters") that no cell crosses, so left-, right- and centre-aligned columns all work.
 *  • PowerPoint: one slide per page. "Editable" removes the page's text from the background image
 *    (with js/pdf-text.js) and puts it back as text boxes in the same place.
 */
(function () {
  'use strict';
  const { base } = PDFTools.helpers;
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const NS = {
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
    sml: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  };
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // Escape for XML text, dropping control characters XML 1.0 does not allow.
  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Office files have no folder entries in the zip; JSZip adds them unless told not to.
  const put = (z, name, data) => z.file(name, data, { createFolders: false });
  const rels = (list) => `${XML}<Relationships xmlns="${NS.rel}">${list.map(([id, type, target]) =>
    `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

  /* ---------- Reading text with positions ---------- */

  /** Text items of a page in screen coordinates (y down), with size and bold flag. */
  async function pageItems(page) {
    await page.getOperatorList(); // loads fonts so their real names (bold…) are known
    const vp = page.getViewport({ scale: 1 });
    const items = [];
    for (const it of (await page.getTextContent()).items) {
      if (!it.str || !it.str.trim()) continue;
      const [a, b, c, d, e, f] = it.transform;
      const [x, y] = vp.convertToViewportPoint(e, f);
      const [x2] = vp.convertToViewportPoint(e + it.width * (a / (Math.hypot(a, b) || 1)), f + it.width * (b / (Math.hypot(a, b) || 1)));
      let fontName = '';
      try { fontName = page.commonObjs.get(it.fontName).name || ''; } catch (_) { /* not loaded */ }
      items.push({ str: it.str, x: Math.min(x, x2), x2: Math.max(x, x2), y, size: Math.hypot(c, d) || 10, bold: /bold|black|heavy|semibold/i.test(fontName) });
    }
    return { items, width: vp.width };
  }

  /** Rows of cells: items on one baseline, split into cells where the gap is wide. */
  function rowsOf(items) {
    items.sort((p, q) => (Math.abs(p.y - q.y) < Math.max(p.size, q.size) * 0.5 ? p.x - q.x : p.y - q.y));
    const rows = [];
    for (const it of items) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.y - it.y) < Math.max(row.size, it.size) * 0.5) { row.items.push(it); row.size = Math.max(row.size, it.size); }
      else rows.push({ y: it.y, size: it.size, items: [it] });
    }
    for (const row of rows) {
      row.items.sort((p, q) => p.x - q.x);
      row.cells = [];
      for (const it of row.items) {
        const cell = row.cells[row.cells.length - 1];
        const gap = cell ? it.x - cell.x2 : Infinity;
        if (cell && gap < Math.max(it.size * 0.9, 4)) {
          cell.text += (gap > it.size * 0.15 && !/\s$/.test(cell.text) ? ' ' : '') + it.str;
          cell.x2 = Math.max(cell.x2, it.x2);
          cell.bold = cell.bold && it.bold;
        } else row.cells.push({ text: it.str, x: it.x, x2: it.x2, bold: it.bold });
      }
      row.cells.forEach((c) => { c.text = c.text.replace(/\s+/g, ' ').trim(); });
    }
    return rows;
  }

  /** Column ranges from the gaps that no cell of a multi-cell row crosses. */
  function columnsOf(rows, width) {
    const tableRows = rows.filter((r) => r.cells.length > 1);
    if (!tableRows.length) return [{ x: 0, x2: width }];
    const cover = new Uint16Array(Math.ceil(width) + 2);
    for (const r of tableRows) for (const c of r.cells) for (let x = Math.max(0, Math.floor(c.x)); x <= Math.min(width, Math.ceil(c.x2)); x++) cover[x]++;
    const cols = [];
    let start = -1;
    for (let x = 0; x < cover.length; x++) {
      if (cover[x] && start < 0) start = x;
      if (!cover[x] && start >= 0) { cols.push({ x: start, x2: x }); start = -1; }
    }
    if (start >= 0) cols.push({ x: start, x2: cover.length });
    return cols;
  }

  /** Grid of { text, bold } per row and column. */
  function grid(rows, cols) {
    return rows.map((r) => {
      const out = [];
      for (const c of r.cells) {
        const mid = (c.x + c.x2) / 2;
        let k = cols.findIndex((col) => mid >= col.x - 1 && mid <= col.x2 + 1);
        if (k < 0) { // e.g. a title over a gutter: nearest column by left edge
          k = cols.reduce((best, col, i) => (Math.abs(col.x - c.x) < Math.abs(cols[best].x - c.x) ? i : best), 0);
        }
        if (out[k]) out[k].text += ` ${c.text}`;
        else out[k] = { text: c.text, bold: c.bold };
      }
      return out;
    });
  }

  /** "1.250,00" / "1,250.00" / "42" → number; anything else → null. */
  function toNumber(s) {
    const t = s.replace(/\s/g, '');
    if (!/^[-+]?(\d[\d.,]*\d|\d)$/.test(t)) return null;
    const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
    let norm;
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? '.' : ',';
      norm = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? '.' : ',';
      const parts = t.split(sep);
      // One separator followed by exactly three digits is a thousands separator (e.g. 1.250); otherwise decimal.
      norm = parts.length === 2 && parts[1].length !== 3 ? parts.join('.') : parts.join('');
    } else norm = t;
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }

  /* ---------- XLSX ---------- */
  const colName = (i) => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

  function sheetXml(table, numbers) {
    const widths = [];
    const rowsXml = table.map((row, ri) => {
      const cells = [];
      for (let ci = 0; ci < row.length; ci++) {
        const c = row[ci];
        if (!c || !c.text) continue;
        widths[ci] = Math.max(widths[ci] || 8, Math.min(60, c.text.length + 2));
        const ref = `${colName(ci)}${ri + 1}`, style = c.bold ? ' s="1"' : '';
        const n = numbers ? toNumber(c.text) : null;
        cells.push(n != null ? `<c r="${ref}"${style}><v>${n}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(c.text)}</t></is></c>`);
      }
      return `<row r="${ri + 1}">${cells.join('')}</row>`;
    });
    const cols = widths.map((w, i) => (w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '')).join('');
    return `${XML}<worksheet xmlns="${NS.sml}" xmlns:r="${NS.r}">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml.join('')}</sheetData></worksheet>`;
  }

  async function buildXlsx(sheets, numbers) {
    const z = new JSZip();
    const used = new Set();
    const names = sheets.map((s) => {
      let n = s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet', k = 2;
      while (used.has(n.toLowerCase())) n = `${s.name.slice(0, 27)} (${k++})`;
      used.add(n.toLowerCase());
      return n;
    });
    put(z, '[Content_Types].xml', `${XML}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    put(z, '_rels/.rels', rels([['rId1', 'officeDocument', 'xl/workbook.xml']]));
    put(z, 'xl/workbook.xml', `${XML}<workbook xmlns="${NS.sml}" xmlns:r="${NS.r}"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    put(z, 'xl/_rels/workbook.xml.rels', rels([...sheets.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]), [`rId${sheets.length + 1}`, 'styles', 'styles.xml']]));
    put(z, 'xl/styles.xml', `${XML}<styleSheet xmlns="${NS.sml}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    sheets.forEach((s, i) => put(z, `xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.table, numbers)));
    return z.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
  }

  /* ---------- PPTX ---------- */
  const EMU = 12700; // per PDF point
  const SP_TREE_HEAD = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  const PNS = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
  const THEME = `${XML}<a:theme xmlns:a="${NS.a}" name="CPDF"><a:themeElements><a:clrScheme name="CPDF"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="4F46E5"/></a:accent1><a:accent2><a:srgbClr val="E5484D"/></a:accent2><a:accent3><a:srgbClr val="30A46C"/></a:accent3><a:accent4><a:srgbClr val="F5A524"/></a:accent4><a:accent5><a:srgbClr val="0091FF"/></a:accent5><a:accent6><a:srgbClr val="8E4EC6"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="CPDF"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="CPDF"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const FACE = { sans: 'Arial', serif: 'Times New Roman', mono: 'Courier New' };
  const hex = (rgb) => (rgb || [0, 0, 0]).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

  function slideXml(slide) {
    let id = 2;
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="Page"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${slide.ox}" y="${slide.oy}"/><a:ext cx="${slide.cx}" cy="${slide.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const boxes = slide.texts.map((tb) => {
      const n = id++;
      return `<p:sp><p:nvSpPr><p:cNvPr id="${n}" name="Text ${n}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${tb.x}" y="${tb.y}"/><a:ext cx="${tb.cx}" cy="${tb.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="${I18N.lang === 'el' ? 'el-GR' : 'en-US'}" sz="${tb.sz}" b="${tb.bold ? 1 : 0}" i="${tb.italic ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${tb.color}"/></a:solidFill><a:latin typeface="${tb.face}"/><a:cs typeface="${tb.face}"/></a:rPr><a:t>${esc(tb.text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
    }).join('');
    return `${XML}<p:sld ${PNS}><p:cSld><p:spTree>${SP_TREE_HEAD}${pic}${boxes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }

  async function buildPptx(slides, size) {
    const z = new JSZip();
    put(z, '[Content_Types].xml', `${XML}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
    put(z, '_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
    put(z, 'ppt/presentation.xml', `${XML}<p:presentation ${PNS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${size.cx}" cy="${size.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
    put(z, 'ppt/_rels/presentation.xml.rels', rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...slides.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`])]));
    put(z, 'ppt/slideMasters/slideMaster1.xml', `${XML}<p:sldMaster ${PNS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${SP_TREE_HEAD}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
    put(z, 'ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
    put(z, 'ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${PNS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${SP_TREE_HEAD}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    put(z, 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
    put(z, 'ppt/theme/theme1.xml', THEME);
    slides.forEach((s, i) => {
      put(z, `ppt/slides/slide${i + 1}.xml`, slideXml(s));
      put(z, `ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/page${i + 1}.jpeg`]]));
      put(z, `ppt/media/page${i + 1}.jpeg`, s.image);
    });
    return z.generateAsync({ type: 'blob', mimeType: PPTX_MIME, compression: 'DEFLATE' });
  }

  PDFTools.register(
    {
      id: 'pdf-to-excel', icon: 'sheet', color: '#16a34a', category: 'Convert', hot: true,
      name: { en: 'PDF to Excel', el: 'PDF σε Excel' },
      desc: { en: 'Pull tables out of PDFs into editable Excel spreadsheets.', el: 'Μεταφέρετε τους πίνακες ενός PDF σε επεξεργάσιμο υπολογιστικό φύλλο Excel.' },
      action: { en: 'Convert to Excel', el: 'Μετατροπή σε Excel' },
      note: { en: 'Works best with PDFs created digitally. Scanned PDFs need OCR first.', el: 'Δουλεύει καλύτερα με PDF που δημιουργήθηκαν ψηφιακά. Τα σαρωμένα χρειάζονται πρώτα OCR.' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'sheets', label: { en: 'Worksheets', el: 'Φύλλα εργασίας' }, type: 'segmented', default: 'page', choices: [
          { value: 'page', label: { en: 'One per page', el: 'Ένα ανά σελίδα' } }, { value: 'single', label: { en: 'All in one', el: 'Όλα σε ένα' } },
        ] },
        { id: 'numbers', label: { en: 'Store numbers as numbers (so Excel can calculate)', el: 'Οι αριθμοί ως αριθμοί (για να γίνονται υπολογισμοί στο Excel)' }, type: 'checkbox', default: true },
      ],
      async run({ files, options: o, progress }) {
        return PDFTools.helpers.eachFile(files, progress, async (f) => {
          const sheets = [];
          let any = false;
          for (let n = 1; n <= f.pdf.numPages; n++) {
            progress(L({ en: `Reading tables — ${f.name}, page ${n}/${f.pdf.numPages}…`, el: `Ανάγνωση πινάκων — ${f.name}, σελίδα ${n}/${f.pdf.numPages}…` }));
            const { items, width } = await pageItems(await f.pdf.getPage(n));
            const rows = rowsOf(items);
            const table = grid(rows, columnsOf(rows, width));
            if (table.length) any = true;
            if (o.sheets === 'single' && sheets.length) sheets[0].table.push([], ...table);
            else sheets.push({ name: o.sheets === 'single' ? base(f) : `${L({ en: 'Page', el: 'Σελίδα' })} ${n}`, table });
          }
          if (!any) throw new Error(L({ en: `${f.name} has no text to put in a table. Run OCR first.`, el: `Το ${f.name} δεν έχει κείμενο για πίνακα. Τρέξτε πρώτα OCR.` }));
          return { name: `${base(f)}.xlsx`, data: await buildXlsx(sheets, o.numbers), type: XLSX_MIME };
        });
      },
    },
    {
      id: 'pdf-to-ppt', icon: 'slides', color: '#ea580c', category: 'Convert', hot: true,
      name: { en: 'PDF to PowerPoint', el: 'PDF σε PowerPoint' },
      desc: { en: 'Turn every page into a slide, with the text kept editable.', el: 'Κάθε σελίδα γίνεται διαφάνεια, με το κείμενο επεξεργάσιμο.' },
      action: { en: 'Convert to PowerPoint', el: 'Μετατροπή σε PowerPoint' },
      accept: 'pdf', multiple: true, view: 'files',
      options: [
        { id: 'mode', label: { en: 'Slides', el: 'Διαφάνειες' }, type: 'radio', default: 'editable', choices: [
          { value: 'editable', label: { en: 'Editable text', el: 'Επεξεργάσιμο κείμενο' }, hint: { en: 'Text becomes text boxes; graphics and images stay as the background.', el: 'Το κείμενο γίνεται πλαίσια κειμένου· γραφικά και εικόνες μένουν στο φόντο.' } },
          { value: 'image', label: { en: 'Exact look (pages as pictures)', el: 'Ίδια εμφάνιση (σελίδες ως εικόνες)' }, hint: { en: 'Looks identical but the text can’t be edited.', el: 'Ίδια εμφάνιση, αλλά το κείμενο δεν αλλάζει.' } },
        ] },
      ],
      async run({ files, options: o, progress }) {
        if (o.mode === 'editable' && !window.PDFText) await PDFApp.loadScript(PDFApp.asset('js/pdf-text.js'));
        return PDFTools.helpers.eachFile(files, progress, async (f) => {
          const first = (await f.pdf.getPage(1)).getViewport({ scale: 1 });
          const size = { cx: Math.round(first.width * EMU), cy: Math.round(first.height * EMU) };
          // Editable: work out the text lines, then render backgrounds from a copy with that text removed.
          let bgPdf = f.pdf;
          const linesPerPage = [];
          if (o.mode === 'editable') {
            const lib = await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true });
            const clean = await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true });
            for (let i = 0; i < f.pdf.numPages; i++) {
              progress(L({ en: `Reading text — ${f.name}, page ${i + 1}/${f.pdf.numPages}…`, el: `Ανάγνωση κειμένου — ${f.name}, σελίδα ${i + 1}/${f.pdf.numPages}…` }));
              const jsPage = await f.pdf.getPage(i + 1);
              const vp = jsPage.getViewport({ scale: 1 });
              const lines = (await PDFText.pageLines(lib.getPage(i), jsPage, i))
                .filter((l) => l.removable && vp.rotation % 360 === 0 && Math.abs(l.angle) < 0.01);
              linesPerPage.push(lines);
              if (lines.length) await PDFText.removeLines(clean, clean.getPage(i), i, new Set(lines.map((l) => l.id)));
            }
            bgPdf = await PDFApp.openPdfjs(await clean.save());
          }
          const slides = [];
          for (let n = 1; n <= f.pdf.numPages; n++) {
            progress(L({ en: `Creating slide ${n}/${f.pdf.numPages}…`, el: `Δημιουργία διαφάνειας ${n}/${f.pdf.numPages}…` }));
            const vp = (await f.pdf.getPage(n)).getViewport({ scale: 1 });
            // Pages of another size are scaled to fit the slide and centred.
            const k = Math.min(size.cx / (vp.width * EMU), size.cy / (vp.height * EMU));
            const ox = Math.round((size.cx - vp.width * EMU * k) / 2), oy = Math.round((size.cy - vp.height * EMU * k) / 2);
            const canvas = await PDFApp.renderPage(bgPdf, n, { scale: 2, intent: 'print' });
            const image = await (await PDFApp.canvasToBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer();
            canvas.width = canvas.height = 0;
            const texts = (linesPerPage[n - 1] || []).map((l) => {
              const [x, base] = vp.convertToViewportPoint(l.origin.x, l.origin.y);
              const top = base - l.size * 0.93;
              return {
                text: l.text, x: Math.round(ox + x * EMU * k), y: Math.round(oy + top * EMU * k),
                cx: Math.round((l.width * 1.04 + l.size * 0.5) * EMU * k), cy: Math.round(l.size * 1.25 * EMU * k),
                sz: Math.max(100, Math.round(l.size * k * 100)), bold: l.bold, italic: l.italic, face: FACE[l.font] || 'Arial', color: hex(l.fill),
              };
            });
            slides.push({ image, texts, ox, oy, cx: Math.round(vp.width * EMU * k), cy: Math.round(vp.height * EMU * k) });
          }
          if (bgPdf !== f.pdf) bgPdf.destroy();
          return { name: `${base(f)}.pptx`, data: await buildPptx(slides, size), type: PPTX_MIME };
        });
      },
    },
  );
})();
