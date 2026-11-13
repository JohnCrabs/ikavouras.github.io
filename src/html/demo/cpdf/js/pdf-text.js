/* CPDF — real text editing in PDF content streams.
 *
 * Reads a page's content stream, interprets the text operators (with font metrics, so the exact
 * position and advance of every Tj/TJ/'/" is known) and groups them into lines. When a line is
 * edited, its show-operators are deleted from the content stream — the old text no longer exists
 * in the file — and replaced by a pure positioning TJ, so the rest of the text does not move.
 * The new text is then drawn with the page's own font when it can encode it, otherwise with a
 * matching standard or Unicode font.
 *
 * All geometry is in PDF user space, so rotated pages and rotated text work the same way.
 */
(function (global) {
  'use strict';
  const { PDFName, PDFDict, PDFArray, PDFNumber, PDFRawStream, PDFHexString, StandardFonts, decodePDFRawStream } = global.PDFLib;
  const N = (k) => PDFName.of(k);
  /** Dictionary entry of the expected type, or null (pdf-lib's lookupMaybe throws on a type mismatch). */
  const typed = (d, k, Type) => { if (!d) return null; const v = d.lookup(N(k)); return v instanceof Type ? v : null; };

  /* ---------- Bytes ---------- */
  function toBinary(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }
  const fromBinary = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

  /* ---------- Tokenizer ---------- */
  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

  /** Splits a content stream into operations: { op, args, start, end } (byte offsets cover operands + operator). */
  function parseOperations(s) {
    const ops = [];
    let i = 0, args = [], argStart = -1;
    const stack = []; // open arrays / dicts
    const n = s.length;
    const code = (k) => s.charCodeAt(k);
    const pushVal = (v, start) => {
      if (stack.length) stack[stack.length - 1].push(v);
      else { if (argStart < 0) argStart = start; args.push(v); }
    };
    while (i < n) {
      const c = code(i);
      if (WS.has(c)) { i++; continue; }
      if (c === 37) { while (i < n && code(i) !== 10 && code(i) !== 13) i++; continue; } // % comment
      const start = i;
      if (c === 40) { // ( literal string )
        let depth = 1, out = '';
        i++;
        while (i < n && depth) {
          const ch = s[i];
          if (ch === '\\') {
            const nx = s[i + 1];
            const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
            if (nx in map) { out += map[nx]; i += 2; }
            else if (/[0-7]/.test(nx)) { let oct = ''; i++; while (oct.length < 3 && /[0-7]/.test(s[i])) oct += s[i++]; out += String.fromCharCode(parseInt(oct, 8) & 255); }
            else if (nx === '\r') { i += s[i + 2] === '\n' ? 3 : 2; }
            else if (nx === '\n') { i += 2; }
            else { i++; }
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (!depth) { i++; break; } }
          out += ch;
          i++;
        }
        pushVal({ str: out }, start);
        continue;
      }
      if (c === 60) { // < hex > or <<
        if (code(i + 1) === 60) { stack.push([]); stack[stack.length - 1].dict = true; stack[stack.length - 1].start = start; i += 2; continue; }
        const endHex = s.indexOf('>', i);
        let hex = s.slice(i + 1, endHex < 0 ? n : endHex).replace(/[^0-9a-fA-F]/g, '');
        if (hex.length % 2) hex += '0';
        let out = '';
        for (let k = 0; k < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
        i = endHex < 0 ? n : endHex + 1;
        pushVal({ str: out, hex: true }, start);
        continue;
      }
      if (c === 62 && code(i + 1) === 62) { // >>
        i += 2;
        const d = stack.pop();
        if (d) pushVal({ dict: d }, d.start);
        continue;
      }
      if (c === 91) { const a = []; a.start = start; stack.push(a); i++; continue; } // [
      if (c === 93) { i++; const a = stack.pop(); if (a) pushVal(a, a.start); continue; } // ]
      if (c === 123 || c === 125) { i++; continue; } // { } (PostScript functions — ignore)
      if (c === 47) { // /Name
        i++;
        while (i < n && !WS.has(code(i)) && !DELIM.has(code(i))) i++;
        pushVal({ name: s.slice(start + 1, i) }, start);
        continue;
      }
      // number or operator keyword
      while (i < n && !WS.has(code(i)) && !DELIM.has(code(i))) i++;
      const word = s.slice(start, i);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) { pushVal(parseFloat(word), start); continue; }
      if (word === 'true' || word === 'false' || word === 'null') { pushVal(word === 'true' ? true : word === 'false' ? false : null, start); continue; }
      if (stack.length) continue; // stray keyword inside an array: ignore
      if (word === 'BI') { // inline image: skip to EI, its data is binary
        let k = s.indexOf('ID', i);
        k = k < 0 ? n : k + 3;
        let e = k;
        for (;;) {
          e = s.indexOf('EI', e);
          if (e < 0) { e = n; break; }
          if (WS.has(code(e - 1)) && (e + 2 >= n || WS.has(code(e + 2)) || DELIM.has(code(e + 2)))) break;
          e += 2;
        }
        i = Math.min(n, e + 2);
        ops.push({ op: 'BI', args: [], start, end: i });
        args = []; argStart = -1;
        continue;
      }
      ops.push({ op: word, args, start: argStart >= 0 ? argStart : start, end: i });
      args = []; argStart = -1;
    }
    return ops;
  }

  /* ---------- Fonts ---------- */
  const STD14 = {
    helvetica: StandardFonts.Helvetica, 'helvetica-bold': StandardFonts.HelveticaBold, 'helvetica-oblique': StandardFonts.HelveticaOblique, 'helvetica-boldoblique': StandardFonts.HelveticaBoldOblique,
    'times-roman': StandardFonts.TimesRoman, 'times-bold': StandardFonts.TimesRomanBold, 'times-italic': StandardFonts.TimesRomanItalic, 'times-bolditalic': StandardFonts.TimesRomanBoldItalic,
    courier: StandardFonts.Courier, 'courier-bold': StandardFonts.CourierBold, 'courier-oblique': StandardFonts.CourierOblique, 'courier-boldoblique': StandardFonts.CourierBoldOblique,
    symbol: StandardFonts.Symbol, zapfdingbats: StandardFonts.ZapfDingbats,
  };
  /** Standard-14 font (or a common alias such as Arial / Times New Roman) for metrics. */
  function std14Name(base) {
    const b = base.replace(/^[A-Z]{6}\+/, '').toLowerCase().replace(/[\s_]/g, '');
    if (STD14[b]) return STD14[b];
    const bold = /bold|black|heavy/.test(b), ital = /italic|oblique/.test(b);
    const fam = /courier|mono/.test(b) ? 'courier' : /times|roman|serif|georgia|garamond/.test(b) && !/sans/.test(b) ? 'times' : /arial|helvetica|sans/.test(b) ? 'helvetica' : null;
    if (!fam) return null;
    if (fam === 'times') return STD14[bold && ital ? 'times-bolditalic' : bold ? 'times-bold' : ital ? 'times-italic' : 'times-roman'];
    return STD14[`${fam}${bold && ital ? '-boldoblique' : bold ? '-bold' : ital ? '-oblique' : ''}`];
  }

  let metricsDoc = null;
  const stdFontCache = new Map();
  async function stdFont(name) {
    if (!stdFontCache.has(name)) {
      metricsDoc = metricsDoc || await global.PDFLib.PDFDocument.create();
      stdFontCache.set(name, await metricsDoc.embedFont(name));
    }
    return stdFontCache.get(name);
  }

  const nameOf = (d, k) => { const v = typed(d, k, PDFName); return v ? v.asString().slice(1) : null; };
  const numOf = (d, k, dflt) => { const v = typed(d, k, PDFNumber); return v ? v.asNumber() : dflt; };

  /** Width metrics and re-use eligibility of a font resource. */
  async function fontInfo(fd) {
    const subtype = nameOf(fd, 'Subtype') || '';
    const base = nameOf(fd, 'BaseFont') || '';
    const info = {
      base, subtype, subset: /^[A-Z]{6}\+/.test(base), codeBytes: 1, widths: null, firstChar: 0,
      missing: 0, scale: 1, cidWidths: null, dw: 1000, std: null, supported: true, reusable: false, encoding: null,
      family: /courier|mono|consol/i.test(base) ? 'mono' : /times|serif|georgia|garamond|cambria|minion|book/i.test(base) && !/sans/i.test(base) ? 'serif' : 'sans',
      bold: /bold|black|heavy|semibold|demi/i.test(base), italic: /italic|oblique/i.test(base),
    };
    if (subtype === 'Type0') {
      const enc = nameOf(fd, 'Encoding');
      if (enc === 'Identity-H' || enc === 'Identity-V') info.codeBytes = 2;
      else info.supported = false; // other CMaps would need the CMap to split codes
      const desc = typed(fd, 'DescendantFonts', PDFArray);
      const cid = desc && desc.lookup(0, PDFDict);
      info.dw = numOf(cid, 'DW', 1000);
      const W = cid && typed(cid, 'W', PDFArray);
      if (W) {
        info.cidWidths = new Map();
        for (let k = 0; k < W.size();) {
          const first = W.lookup(k, PDFNumber).asNumber();
          const next = W.lookup(k + 1);
          if (next instanceof PDFArray) {
            for (let j = 0; j < next.size(); j++) info.cidWidths.set(first + j, next.lookup(j, PDFNumber).asNumber());
            k += 2;
          } else {
            const last = next.asNumber(), w = W.lookup(k + 2, PDFNumber).asNumber();
            for (let c = first; c <= last && c - first < 65536; c++) info.cidWidths.set(c, w);
            k += 3;
          }
        }
      }
      return info;
    }
    info.firstChar = numOf(fd, 'FirstChar', 0);
    const W = typed(fd, 'Widths', PDFArray);
    if (W) info.widths = W.asArray().map((_, k) => { const v = W.lookup(k); return v instanceof PDFNumber ? v.asNumber() : 0; });
    const desc = typed(fd, 'FontDescriptor', PDFDict);
    info.missing = numOf(desc, 'MissingWidth', 0);
    const embedded = !!(desc && (desc.get(N('FontFile')) || desc.get(N('FontFile2')) || desc.get(N('FontFile3'))));
    if (subtype === 'Type3') {
      const fm = typed(fd, 'FontMatrix', PDFArray);
      info.scale = fm ? fm.lookup(0, PDFNumber).asNumber() * 1000 : 1;
    }
    const encName = nameOf(fd, 'Encoding');
    const encDict = typed(fd, 'Encoding', PDFDict);
    info.encoding = encName || (encDict ? 'custom' : 'builtin');
    const stdName = std14Name(base);
    if (!info.widths && stdName) info.std = await stdFont(stdName);
    // The original font can show new text if it is a complete (non-subset) Latin font with a known encoding.
    const latin = !/symbol|dingbat/i.test(base);
    info.reusable = ['Type1', 'TrueType', 'MMType1'].includes(subtype) && latin && !info.subset
      && (!embedded || !info.subset) && ['WinAnsiEncoding', 'StandardEncoding', 'MacRomanEncoding', 'builtin'].includes(info.encoding);
    return info;
  }

  /** Glyph advance (text space, ×1000) for one character code. */
  function glyphWidth(f, codeVal) {
    if (f.codeBytes === 2) return f.cidWidths && f.cidWidths.has(codeVal) ? f.cidWidths.get(codeVal) : f.dw;
    if (f.widths) {
      const w = f.widths[codeVal - f.firstChar];
      return (w == null ? f.missing : w) * f.scale;
    }
    if (f.std) return f.std.widthOfTextAtSize(String.fromCharCode(codeVal), 1000);
    return f.missing || 500;
  }

  function pageResources(page) {
    for (let node = page.node; node; node = typed(node, 'Parent', PDFDict)) {
      const r = typed(node, 'Resources', PDFDict);
      if (r) return r;
    }
    return null;
  }

  function pageContent(page) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((_, k) => contents.lookup(k)) : contents ? [contents] : [];
    const parts = streams.map((st) => {
      if (st instanceof PDFRawStream) return decodePDFRawStream(st).decode();
      if (st && st.getUnencodedContents) return st.getUnencodedContents();
      if (st && st.getContents) return st.getContents();
      return new Uint8Array();
    });
    return parts.map(toBinary).join('\n');
  }

  /* ---------- Interpreter ---------- */
  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const ID = [1, 0, 0, 1, 0, 0];

  /**
   * Parses one page. Returns { content, segments, fonts } where each segment is a text-showing
   * operation with its exact start/end point in user space.
   */
  async function analyzePage(page) {
    const content = pageContent(page);
    const ops = parseOperations(content);
    const resources = pageResources(page);
    const fontDicts = resources && typed(resources, 'Font', PDFDict);
    const fonts = new Map();
    for (const o of ops) {
      if (o.op !== 'Tf' || !o.args[0] || !o.args[0].name || fonts.has(o.args[0].name)) continue;
      const key = o.args[0].name;
      const fd = fontDicts && typed(fontDicts, key, PDFDict);
      fonts.set(key, fd ? await fontInfo(fd) : null);
    }

    let gs = { ctm: ID, fill: [0, 0, 0], Tc: 0, Tw: 0, Th: 1, TL: 0, Ts: 0, font: null, size: 0, mode: 0 };
    const stack = [];
    let Tm = ID, Tlm = ID;
    const segments = [];
    const advance = (tx) => { Tm = mul([1, 0, 0, 1, tx, 0], Tm); };
    const nextLine = () => { Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; };

    const show = (o, items) => {
      const f = gs.font ? fonts.get(gs.font) : null;
      const M0 = mul(Tm, gs.ctm);
      let total = 0, ok = !!(f && f.supported && gs.size);
      for (const it of items) {
        if (typeof it === 'number') { const tx = (-it / 1000) * gs.size * gs.Th; total += tx; advance(tx); continue; }
        if (!it || it.str == null) continue;
        const str = it.str;
        const step = f ? f.codeBytes : 1;
        for (let k = 0; k + step - 1 < str.length; k += step) {
          const cv = step === 2 ? (str.charCodeAt(k) << 8) | str.charCodeAt(k + 1) : str.charCodeAt(k);
          const w = f ? glyphWidth(f, cv) / 1000 : 0.5;
          const tx = (w * gs.size + gs.Tc + (step === 1 && cv === 32 ? gs.Tw : 0)) * gs.Th;
          total += tx;
          advance(tx);
        }
      }
      const M1 = mul(Tm, gs.ctm);
      const len = Math.hypot(M0[0], M0[1]) || 1;
      segments.push({
        index: segments.length, start: o.start, end: o.end, kind: o.op, args: o.args,
        x0: M0[4], y0: M0[5], x1: M1[4], y1: M1[5], dir: [M0[0] / len, M0[1] / len],
        size: Math.abs(gs.size) * Math.hypot(M0[2], M0[3]),
        fontKey: gs.font, font: f, fill: gs.fill.slice(), tfs: gs.size, th: gs.Th, advance: total, removable: ok && gs.size * gs.Th !== 0,
      });
    };

    for (const o of ops) {
      const a = o.args;
      switch (o.op) {
        case 'q': stack.push({ ...gs, fill: gs.fill.slice() }); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': if (a.length === 6) gs.ctm = mul(a, gs.ctm); break;
        case 'BT': Tm = Tlm = ID; break;
        case 'Tf': gs.font = a[0] && a[0].name; gs.size = +a[1] || 0; break;
        case 'Tc': gs.Tc = +a[0] || 0; break;
        case 'Tw': gs.Tw = +a[0] || 0; break;
        case 'Tz': gs.Th = (+a[0] || 0) / 100; break;
        case 'TL': gs.TL = +a[0] || 0; break;
        case 'Ts': gs.Ts = +a[0] || 0; break;
        case 'Tr': gs.mode = +a[0] || 0; break;
        case 'Td': Tlm = mul([1, 0, 0, 1, +a[0] || 0, +a[1] || 0], Tlm); Tm = Tlm; break;
        case 'TD': gs.TL = -(+a[1] || 0); Tlm = mul([1, 0, 0, 1, +a[0] || 0, +a[1] || 0], Tlm); Tm = Tlm; break;
        case 'Tm': if (a.length === 6) { Tlm = a.slice(); Tm = Tlm; } break;
        case 'T*': nextLine(); break;
        case 'Tj': show(o, [a[0]]); break;
        case 'TJ': show(o, Array.isArray(a[0]) ? a[0] : []); break;
        case "'": nextLine(); show(o, [a[0]]); break;
        case '"': gs.Tw = +a[0] || 0; gs.Tc = +a[1] || 0; nextLine(); show(o, [a[2]]); break;
        case 'g': gs.fill = [+a[0], +a[0], +a[0]]; break;
        case 'rg': gs.fill = [+a[0], +a[1], +a[2]]; break;
        case 'k': { const [c, m, y, kk] = a.map(Number); gs.fill = [(1 - c) * (1 - kk), (1 - m) * (1 - kk), (1 - y) * (1 - kk)]; break; }
        case 'sc': case 'scn': {
          const nums = a.filter((v) => typeof v === 'number');
          if (nums.length === 1) gs.fill = [nums[0], nums[0], nums[0]];
          else if (nums.length === 3) gs.fill = nums;
          else if (nums.length === 4) gs.fill = [(1 - nums[0]) * (1 - nums[3]), (1 - nums[1]) * (1 - nums[3]), (1 - nums[2]) * (1 - nums[3])];
          break;
        }
        default:
      }
    }
    return { content, segments, fonts };
  }

  /* ---------- Lines ---------- */
  /**
   * Groups segments ({ x0, y0, x1, y1, dir, size }) into lines: same direction, same baseline,
   * horizontally close. Ids are stable for the same page content, so the export can find them again.
   */
  function groupLines(segs, prefix) {
    const prepared = segs.map((s) => {
      const [dx, dy] = s.dir;
      const t0 = s.x0 * dx + s.y0 * dy, t1 = s.x1 * dx + s.y1 * dy;
      return { s, angle: Math.round((Math.atan2(dy, dx) * 180) / Math.PI), v: -s.x0 * dy + s.y0 * dx, t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
    }).filter((p) => p.s.size > 0.5);
    prepared.sort((p, q) => p.angle - q.angle || (Math.abs(p.v - q.v) < Math.max(p.s.size, q.s.size) * 0.35 ? p.t0 - q.t0 : q.v - p.v));
    const lines = [];
    for (const p of prepared) {
      const line = lines[lines.length - 1];
      if (line && line.angle === p.angle && Math.abs(line.v - p.v) < Math.max(line.size, p.s.size) * 0.35
        && p.t0 - line.t1 < Math.max(line.size, p.s.size) * 1.5 && p.t0 > line.t0 - line.size) {
        line.segs.push(p.s);
        line.t1 = Math.max(line.t1, p.t1);
        line.size = Math.max(line.size, p.s.size);
      } else {
        lines.push({ angle: p.angle, v: p.v, t0: p.t0, t1: p.t1, size: p.s.size, dir: p.s.dir, segs: [p.s] });
      }
    }
    return lines.map((l, k) => {
      const first = l.segs.reduce((m, s) => (s.x0 * l.dir[0] + s.y0 * l.dir[1] < m.x0 * l.dir[0] + m.y0 * l.dir[1] ? s : m), l.segs[0]);
      const [dx, dy] = l.dir;
      // Baseline origin at the start of the line (t0) on the line's baseline (v).
      const origin = { x: l.t0 * dx - l.v * dy, y: l.t0 * dy + l.v * dx };
      return { id: `${prefix}${k}`, angle: (l.angle * Math.PI) / 180, dir: l.dir, origin, width: l.t1 - l.t0, size: l.size, t0: l.t0, v: l.v, segs: l.segs, first };
    });
  }

  /** Attaches the readable text (from pdf.js, which knows every encoding) to the lines found in the content stream. */
  function attachText(lines, items, prefix) {
    const orphans = [];
    for (const it of items) {
      if (!it.str) continue;
      const [a, b, c, d, e, f] = it.transform;
      const ang = Math.round((Math.atan2(b, a) * 180) / Math.PI);
      const size = Math.hypot(c, d);
      let best = null;
      for (const l of lines) {
        if (Math.round((l.angle * 180) / Math.PI) !== ang) continue;
        const [dx, dy] = l.dir;
        const v = -e * dy + f * dx, tt = e * dx + f * dy;
        if (Math.abs(v - l.v) < Math.max(l.size, size) * 0.5 && tt >= l.t0 - l.size * 0.6 && tt <= l.t0 + l.width + l.size * 0.3) { best = { l, tt }; break; }
      }
      if (best) (best.l.items = best.l.items || []).push({ str: it.str, t: best.tt, w: it.width, size });
      else orphans.push(it);
    }
    for (const l of lines) {
      const parts = (l.items || []).sort((p, q) => p.t - q.t);
      let text = '', end = null;
      for (const p of parts) {
        if (end != null && p.t - end > p.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += ' ';
        text += p.str;
        end = p.t + p.w;
      }
      l.text = text.replace(/\s+/g, ' ').trim();
      l.removable = l.segs.every((s) => s.removable);
      const f = l.first.font;
      Object.assign(l, {
        font: f ? f.family : 'sans', bold: f ? f.bold : false, italic: f ? f.italic : false,
        fontKey: l.first.fontKey, reusable: !!(f && f.reusable && l.segs.every((s) => s.fontKey === l.first.fontKey)),
        encoding: f ? f.encoding : null, fill: l.first.fill,
      });
    }
    // Text pdf.js found outside the page's own content stream (e.g. inside form XObjects): editable by covering only.
    const extra = groupLines(orphans.map((it) => {
      const [a, b, c, d, e, f] = it.transform;
      const len = Math.hypot(a, b) || 1;
      return { x0: e, y0: f, x1: e + (it.width * a) / len, y1: f + (it.width * b) / len, dir: [a / len, b / len], size: Math.hypot(c, d), item: it };
    }), `${prefix}x`);
    for (const l of extra) {
      l.text = l.segs.map((s) => s.item.str).join(' ').replace(/\s+/g, ' ').trim();
      Object.assign(l, { removable: false, reusable: false, font: 'sans', bold: false, italic: false, fill: null });
    }
    return [...lines.filter((l) => l.text), ...extra.filter((l) => l.text)];
  }

  /** Lines of one page for the editor: content-stream analysis + pdf.js text. */
  async function pageLines(libPage, jsPage, pageIndex) {
    const prefix = `${pageIndex}-`;
    let lines = [];
    try {
      const { segments } = await analyzePage(libPage);
      lines = groupLines(segments, prefix);
    } catch (err) {
      console.warn('Content stream could not be analysed; falling back to cover mode.', err);
    }
    const tc = await jsPage.getTextContent();
    return attachText(lines, tc.items, prefix);
  }

  /* ---------- Rewriting ---------- */
  const fmt = (v) => (Math.abs(v) < 1e-6 ? '0' : (+v.toFixed(4)).toString());

  /**
   * Deletes the show-operators of the given line ids from the page content and writes the result back.
   * Each removed operator is replaced by a TJ that only moves the text position by the same amount,
   * so following text on the same line stays where it was. Returns the set of ids actually removed.
   */
  async function removeLines(doc, page, pageIndex, ids) {
    const { content, segments } = await analyzePage(page);
    const lines = groupLines(segments, `${pageIndex}-`);
    const wanted = lines.filter((l) => ids.has(l.id) && l.segs.every((s) => s.removable));
    if (!wanted.length) return new Set();
    const cuts = wanted.flatMap((l) => l.segs).sort((p, q) => q.start - p.start);
    let s = content;
    for (const seg of cuts) {
      const move = `[${fmt((-seg.advance * 1000) / (seg.tfs * seg.th))}] TJ`;
      const repl = seg.kind === "'" ? `T* ${move}` : seg.kind === '"' ? `${fmt(+seg.args[0] || 0)} Tw ${fmt(+seg.args[1] || 0)} Tc T* ${move}` : move;
      s = `${s.slice(0, seg.start)}${repl}${s.slice(seg.end)}`;
    }
    const stream = doc.context.flateStream(fromBinary(`q\n${s}\nQ\n`));
    page.node.set(N('Contents'), doc.context.obj([doc.context.register(stream)]));
    return new Set(wanted.map((l) => l.id));
  }

  /** Encodes text for a reused simple font, or returns null if the font can't show it. */
  function encodeForFont(text, encoding) {
    const ok = encoding === 'WinAnsiEncoding' ? /^[\x20-\x7E\xA0-\xFF]*$/ : /^[\x20-\x7E]*$/;
    if (!ok.test(text)) return null;
    let hex = '';
    for (const ch of text) hex += ch.charCodeAt(0).toString(16).padStart(2, '0');
    return PDFHexString.of(hex);
  }

  global.PDFText = { parseOperations, analyzePage, groupLines, attachText, pageLines, removeLines, encodeForFont, toBinary };
})(window);
