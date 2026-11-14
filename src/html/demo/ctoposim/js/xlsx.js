/* =========================================================================
   CTopoSim — Φύλλα (Grid) με έξοδο CSV / XLSX / HTML και ανάγνωση XLSX
   Ένα κοινό μοντέλο πίνακα, ώστε το CSV, το Excel και το εκτυπώσιμο έντυπο
   να έχουν ακριβώς την ίδια διάταξη. Χωρίς εξωτερικές βιβλιοθήκες.
   ========================================================================= */
"use strict";

const Sheet = (() => {
  const COV = { cov: true };                       // θέση που καλύπτεται από συγχωνευμένο κελί
  const DEC = { n4: 4, n3: 3 };                    // στυλ αριθμών → δεκαδικά

  /** κελί: v = τιμή (κείμενο/αριθμός/null), s = στυλ, cs/rs = συγχώνευση στηλών/γραμμών */
  const C = (v, s = "t", cs = 1, rs = 1) => ({ v, s, cs, rs });

  class Grid {
    constructor(cols, opts = {}) {
      this.cols = cols;                            // πλάτη στηλών (χαρακτήρες Excel)
      this.rows = []; this.heights = {}; this.merges = []; this.n = 0;   // n: επόμενη γραμμή
      this.landscape = opts.landscape !== false;
    }
    /** προσθήκη γραμμής· τα κελιά μπαίνουν διαδοχικά, παρακάμπτοντας θέσεις συγχωνεύσεων */
    row(cells = [], ht) {
      const r = this.n++;
      const arr = this.rows[r] || (this.rows[r] = []);
      let c = 0;
      for (const cell of cells) {
        while (arr[c] === COV) c++;
        if (cell) {
          arr[c] = cell;
          for (let dr = 0; dr < cell.rs; dr++) for (let dc = 0; dc < cell.cs; dc++) {
            if (!dr && !dc) continue;
            (this.rows[r + dr] || (this.rows[r + dr] = []))[c + dc] = COV;
          }
          if (cell.cs > 1 || cell.rs > 1) this.merges.push([r, c, r + cell.rs - 1, c + cell.cs - 1, cell.s]);
          c += cell.cs;
        } else c++;
      }
      if (ht) this.heights[r] = ht;
      return this;
    }
    blank() { return this.row([]); }
  }

  const isCell = x => x && x !== COV;
  const text = (cell, num) => {
    if (!isCell(cell) || cell.v == null || cell.v === "") return "";
    if (typeof cell.v === "number") return num(cell.v, DEC[cell.s] ?? 3);
    return String(cell.v);
  };

  /* ---------------- CSV ---------------- */
  function toCSV(grids) {
    const out = [];
    grids.forEach((g, k) => {
      if (k) out.push([], []);
      for (const row of g.rows) {
        const r = [];
        for (let c = 0; c < g.cols.length; c++) r.push(text(row && row[c], CSV.num));
        while (r.length && r[r.length - 1] === "") r.pop();
        out.push(r);
      }
    });
    return CSV.build(out);
  }

  /* ---------------- HTML (εκτύπωση) ---------------- */
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function toHTML(g) {
    const tot = g.cols.reduce((a, b) => a + b, 0);
    let h = `<table class="grid"><colgroup>${g.cols.map(w => `<col style="width:${(100 * w / tot).toFixed(2)}%">`).join("")}</colgroup>`;
    g.rows.forEach((row, r) => {
      h += `<tr${g.heights[r] ? ` style="height:${(g.heights[r] * 1.33).toFixed(0)}px"` : ""}>`;
      for (let c = 0; c < g.cols.length; c++) {
        const cell = row && row[c];
        if (cell === COV) continue;
        if (!cell) { h += "<td></td>"; continue; }
        h += `<td class="${cell.s}"${cell.cs > 1 ? ` colspan="${cell.cs}"` : ""}${cell.rs > 1 ? ` rowspan="${cell.rs}"` : ""}>` +
             esc(text(cell, (x, d) => Number(x).toFixed(d))).replace(/\n/g, "<br>") + "</td>";
      }
      h += "</tr>";
    });
    return h + "</table>";
  }
  const PRINT_CSS = `
table.grid{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11px}
table.grid td{padding:2px 4px;text-align:center;vertical-align:middle;overflow:hidden}
.grid .title{font-size:16px;font-weight:700}.grid .sub{font-size:13px;font-weight:700}
.grid .meta{text-align:left;font-weight:700;white-space:normal}.grid .sec{text-align:left;font-weight:700;padding-top:8px}
.grid .note,.grid .plain{text-align:left;font-size:10px;color:#333}
.grid .hdr,.grid .hdrG,.grid .t,.grid .tb,.grid .n4,.grid .n3,.grid .e,.grid .x{border:1px solid #000}
.grid .x{background:#e7e7e7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.grid .hdr,.grid .hdrG,.grid .tb{font-weight:700}.grid .hdrG{background:#d0d0d0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.grid .n4,.grid .n3{font-variant-numeric:tabular-nums}`;

  /* ---------------- XLSX (εγγραφή) ---------------- */
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  /** απλό ZIP χωρίς συμπίεση (αρκεί για xlsx) */
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), d = enc.encode(f.text), crc = crc32(d);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true);
      lh.setUint32(22, d.length, true); lh.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(lh.buffer), nm, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
      ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + d.length;
    }
    const csz = central.reduce((s, a) => s + a.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
    eo.setUint32(12, csz, true); eo.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(eo.buffer)],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // σειρά = δείκτης στο cellXfs του styles.xml
  const XF = ["default", "title", "sub", "meta", "hdr", "hdrG", "t", "tb", "n4", "n3", "e", "note", "plain", "sec", "x"];
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0000"/><numFmt numFmtId="165" formatCode="0.000"/></numFmts>
<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font><font><sz val="9"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD0D0D0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E7E7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const xesc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const colName = c => { let s = ""; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
  const ref = (r, c) => colName(c) + (r + 1);

  function sheetXML(g) {
    const sIdx = s => Math.max(0, XF.indexOf(s));
    // στυλ των καλυμμένων θέσεων (για να φαίνονται τα περιγράμματα των συγχωνεύσεων)
    const covStyle = {};
    for (const [r0, c0, r1, c1, s] of g.merges)
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) covStyle[r + "," + c] = s;
    let rows = "";
    g.rows.forEach((row, r) => {
      let cells = "";
      for (let c = 0; c < g.cols.length; c++) {
        const cell = row && row[c];
        if (cell === COV) { cells += `<c r="${ref(r, c)}" s="${sIdx(covStyle[r + "," + c])}"/>`; continue; }
        if (!cell) continue;
        const s = sIdx(cell.s);
        if (cell.v == null || cell.v === "") cells += `<c r="${ref(r, c)}" s="${s}"/>`;
        else if (typeof cell.v === "number" && isFinite(cell.v)) cells += `<c r="${ref(r, c)}" s="${s}"><v>${cell.v}</v></c>`;
        else cells += `<c r="${ref(r, c)}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xesc(cell.v)}</t></is></c>`;
      }
      const ht = g.heights[r] ? ` ht="${g.heights[r]}" customHeight="1"` : "";
      rows += `<row r="${r + 1}"${ht}>${cells}</row>`;
    });
    const cols = g.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
    const merges = g.merges.length ? `<mergeCells count="${g.merges.length}">${g.merges.map(([r0, c0, r1, c1]) =>
      `<mergeCell ref="${ref(r0, c0)}:${ref(r1, c1)}"/>`).join("")}</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="13.2"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${merges}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${g.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }

  /** sheets: [{ name, grid }] → Blob .xlsx */
  function toXLSX(sheets) {
    const used = new Set();
    const names = sheets.map((s, i) => {
      let n = String(s.name || "Φύλλο" + (i + 1)).replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31);
      while (used.has(n)) n = n.slice(0, 28) + " " + (i + 1);
      used.add(n); return n;
    });
    const files = [
      { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", text: STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXML(s.grid) })),
    ];
    return zip(files);
  }

  /** απλός πίνακας (π.χ. πρότυπα υποβολής) → Grid */
  function fromRows(rows, widths) {
    const n = Math.max(1, ...rows.map(r => r.length));
    const g = new Grid(widths || Array.from({ length: n }, (_, i) => i ? 14 : 18), { landscape: false });
    rows.forEach((r, k) => g.row(r.map(v => C(v === "" ? null : v, k === 0 ? "hdr" : (String(r[0] || "").startsWith("#") ? "note" : "t")))));
    return g;
  }

  /* ---------------- XLSX (ανάγνωση πρώτου φύλλου) ---------------- */
  async function readXLSX(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Το αρχείο δεν είναι έγκυρο .xlsx");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      files[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { method, csize, lo };
      p += 46 + nl + xl + cl;
    }
    const get = async name => {
      const f = files[name]; if (!f) return null;
      const st = f.lo + 30 + dv.getUint16(f.lo + 26, true) + dv.getUint16(f.lo + 28, true);
      const d = u8.subarray(st, st + f.csize);
      if (f.method === 0) return dec.decode(d);
      if (f.method !== 8) throw new Error("Άγνωστη συμπίεση στο .xlsx");
      if (typeof DecompressionStream === "undefined") throw new Error("Ο browser δεν υποστηρίζει ανάγνωση .xlsx· αποθήκευσε ως CSV.");
      return await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    };
    const xml = s => new DOMParser().parseFromString(s, "application/xml");
    const all = (doc, tag) => [...doc.getElementsByTagNameNS("*", tag)];
    // πρώτο φύλλο από το workbook
    let path = "xl/worksheets/sheet1.xml";
    const wb = await get("xl/workbook.xml"), rels = await get("xl/_rels/workbook.xml.rels");
    if (wb && rels) {
      const sh = all(xml(wb), "sheet")[0];
      const rid = sh && (sh.getAttribute("r:id") || [...sh.attributes].find(a => a.localName === "id")?.value);
      const rel = all(xml(rels), "Relationship").find(r => r.getAttribute("Id") === rid);
      if (rel) { const t = rel.getAttribute("Target"); path = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); }
    }
    const ssTxt = await get("xl/sharedStrings.xml");
    const ss = ssTxt ? all(xml(ssTxt), "si").map(si => all(si, "t").map(t => t.textContent).join("")) : [];
    const sheet = await get(path);
    if (!sheet) throw new Error("Δεν βρέθηκε φύλλο στο .xlsx");
    const rows = [];
    for (const row of all(xml(sheet), "row")) {
      const r = (+row.getAttribute("r") || rows.length + 1) - 1, arr = [];
      for (const c of all(row, "c")) {
        const m = /^([A-Z]+)/.exec(c.getAttribute("r") || "");
        const col = m ? [...m[1]].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1 : arr.length;
        const t = c.getAttribute("t"), v = all(c, "v")[0];
        let val = "";
        if (t === "s") val = ss[+(v && v.textContent)] ?? "";
        else if (t === "inlineStr") val = all(c, "t").map(x => x.textContent).join("");
        else if (v) val = v.textContent;
        arr[col] = val;
      }
      rows[r] = Array.from(arr, x => x ?? "");
    }
    return Array.from(rows, x => x || []);
  }

  /** στοιχεία κεφαλίδας εντύπου, το καθένα σε δική του γραμμή */
  function metaRows(g, M, span) {
    for (const [k, v] of [["ΗΜΕΡΟΜΗΝΙΑ", M.date], ["ΩΡΑ", M.time], ["ΟΡΓΑΝΟ", M.instrument],
                          ["ΠΑΡΑΤΗΡΗΤΗΣ", M.observer], ["ΚΑΙΡΙΚΕΣ ΣΥΝΘΗΚΕΣ", M.weather]])
      g.row([C(`${k}: ${v}`, "meta", span)], 15);
  }

  return { C, Grid, metaRows, toCSV, toHTML, toXLSX, fromRows, readXLSX, PRINT_CSS };
})();
