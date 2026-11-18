/* CFiles — binary viewer & editor: two synchronised panes (HEX / OCTAL bytes + decoded text) */
(function () {
  'use strict';
  const U = CF.util;
  const RH = 20;               // row height in px (must match .br in CSS)
  const MAX_SCROLL_H = 8e6;    // keep below browser element-height limits

  const ENCODINGS = [
    ['ascii', 'ASCII'],
    ['utf-8', 'UTF-8'],
    ['windows-1252', 'Latin-1 / Windows-1252'],
    ['iso-8859-7', 'Greek ISO-8859-7'],
    ['windows-1253', 'Greek Windows-1253'],
  ];

  function buildTable(enc) {
    const t = new Array(256).fill(null);
    let dec = null;
    if (enc !== 'ascii' && enc !== 'utf-8') { try { dec = new TextDecoder(enc); } catch (e) { dec = null; } }
    for (let b = 32; b < 256; b++) {
      if (b === 127) continue;
      if (b < 128) { t[b] = String.fromCharCode(b); continue; }
      if (!dec) continue;
      const ch = dec.decode(new Uint8Array([b]));
      t[b] = ch === '�' || /[\u0080-\u009f]/.test(ch) ? null : ch;
    }
    const rev = new Map();
    t.forEach((ch, b) => { if (ch !== null && !rev.has(ch)) rev.set(ch, b); });
    return { t, rev };
  }

  class BinaryViewer {
    constructor(host, doc, ctx) {
      this.doc = doc;
      this.ctx = ctx;
      this.bytes = doc.bytes;
      this.radix = U.store.get('cf.radix', '16') === '8' ? 8 : 16;
      this.bpr = Number(U.store.get('cf.bpr', '16')) || 16;
      this.enc = U.store.get('cf.binEnc', 'ascii');
      this.sel = 0;
      this.buf = '';
      this.mod = doc.meta.modified || (doc.meta.modified = new Set());
      this.undo = [];
      this.hover = -1;
      this.focusPane = 'hex';
      this.top = 0;
      this.setEncoding(this.enc);
      this.build(host);
      this.layout();
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(this.scL);
      this.updateInspector();
    }

    setEncoding(enc) {
      this.enc = enc;
      this.table = buildTable(enc);
      this.utf8 = enc === 'utf-8' ? new TextDecoder('utf-8') : null;
    }

    /* ---------- DOM ---------- */
    build(host) {
      this.el = U.el('div', { class: 'viewer bin-viewer' });
      this.radixSeg = U.seg([['16', 'HEX', 'Show bytes in hexadecimal'], ['8', 'OCTAL', 'Show bytes in octal']], String(this.radix), (v) => {
        this.radix = Number(v); this.buf = ''; U.store.set('cf.radix', v); this.layout();
      });
      const bprSel = U.el('select', { title: 'Bytes per row' }, [8, 16, 24, 32].map((n) => U.el('option', { value: n, text: n })));
      bprSel.value = String(this.bpr);
      bprSel.addEventListener('change', () => { this.bpr = Number(bprSel.value); U.store.set('cf.bpr', bprSel.value); this.layout(); this.scrollToIndex(this.sel); });
      const encSel = U.el('select', { title: 'Character encoding for the decoded pane' }, ENCODINGS.map(([v, l]) => U.el('option', { value: v, text: l })));
      encSel.value = this.enc;
      encSel.addEventListener('change', () => { this.setEncoding(encSel.value); U.store.set('cf.binEnc', encSel.value); this.layout(); });

      this.gotoIn = U.el('input', { class: 'search', placeholder: 'Go to offset (e.g. 1024, 0x400, 0o2000)', style: { width: '210px' } });
      this.gotoIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.goto(); });
      this.findIn = U.el('input', { class: 'search', placeholder: 'Find…' });
      this.findMode = U.el('select', { title: 'Search for text or byte values' }, U.el('option', { value: 'text', text: 'Text' }), U.el('option', { value: 'bytes', text: 'Bytes' }));
      this.findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.find(); });
      this.inspCb = U.el('input', { type: 'checkbox', checked: U.store.get('cf.binInsp', '1') === '1' });
      this.inspCb.addEventListener('change', () => { U.store.set('cf.binInsp', this.inspCb.checked ? '1' : '0'); this.insp.classList.toggle('hidden', !this.inspCb.checked); });

      const tb = U.el('div', { class: 'toolbar' },
        U.el('label', { title: 'Number base used to display / edit bytes' }, 'Base', this.radixSeg),
        U.el('label', {}, 'Bytes/row', bprSel),
        U.el('label', {}, 'Encoding', encSel),
        U.el('span', { class: 'tsep' }),
        this.gotoIn,
        U.el('button', { class: 'btn sm', type: 'button', text: 'Go', onclick: () => this.goto() }),
        this.findIn, this.findMode,
        U.el('button', { class: 'btn sm', type: 'button', text: 'Find next', onclick: () => this.find() }),
        U.el('button', { class: 'btn sm', type: 'button', text: '↶ Undo', title: 'Undo last byte edit (Ctrl+Z)', onclick: () => this.undoEdit() }),
        U.el('span', { class: 'spacer' }),
        U.el('label', {}, this.inspCb, 'Inspector'),
      );

      const pane = (cls, title) => {
        const head = U.el('div', { class: 'bin-ph' });
        const rows = U.el('div', { class: 'bin-rows' });
        const spacer = U.el('div', { class: 'bin-spacer' }, rows);
        const sc = U.el('div', { class: 'bin-scroll', tabIndex: 0, 'aria-label': title }, spacer);
        const p = U.el('section', { class: 'bin-pane ' + cls }, head, sc);
        return { p, head, rows, spacer, sc };
      };
      const L = pane('left', 'Byte values');
      const R = pane('right', 'Decoded text');
      Object.assign(this, { paneL: L.p, headL: L.head, rowsL: L.rows, spL: L.spacer, scL: L.sc, paneR: R.p, headR: R.head, rowsR: R.rows, spR: R.spacer, scR: R.sc });

      this.insp = U.el('aside', { class: 'bin-insp' + (this.inspCb.checked ? '' : ' hidden') });
      this.el.append(tb, U.el('div', { class: 'bin-body' }, L.p, R.p, this.insp));
      host.append(this.el);

      // Scroll synchronisation between the two panes.
      let lock = false;
      const onScroll = (src, dst) => () => {
        if (lock) { lock = false; return; }
        if (dst.scrollTop !== src.scrollTop) { lock = true; dst.scrollTop = src.scrollTop; }
        this.top = src.scrollTop;
        if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
      };
      this.scL.addEventListener('scroll', onScroll(this.scL, this.scR));
      this.scR.addEventListener('scroll', onScroll(this.scR, this.scL));

      for (const [sc, kind] of [[this.scL, 'hex'], [this.scR, 'txt']]) {
        sc.addEventListener('mousedown', (e) => {
          const c = e.target.closest('[data-i]');
          if (!c) return;
          this.focusPane = kind;
          this.select(+c.dataset.i);
          setTimeout(() => sc.focus({ preventScroll: true }), 0);
        });
        sc.addEventListener('mouseover', (e) => {
          const c = e.target.closest('[data-i]');
          this.setHover(c ? +c.dataset.i : -1);
        });
        sc.addEventListener('mouseleave', () => this.setHover(-1));
        sc.addEventListener('keydown', (e) => this.onKey(e, kind));
        sc.addEventListener('focus', () => { this.focusPane = kind; });
      }
    }

    /* ---------- geometry ---------- */
    get rowsTotal() { return Math.max(1, Math.ceil(this.bytes.length / this.bpr)); }
    get cellW() { return this.radix === 16 ? 2 : 3; }
    get offDigits() { return Math.max(8, Math.max(0, this.bytes.length - 1).toString(this.radix).length); }

    layout() {
      const total = this.rowsTotal * RH;
      this.scale = total > MAX_SCROLL_H ? total / MAX_SCROLL_H : 1;
      const h = total / this.scale + 4;
      this.spL.style.height = this.spR.style.height = h + 'px';
      // Fixed widths in ch so the header and the rows line up.
      const extraGaps = this.bpr > 8 ? Math.floor((this.bpr - 1) / 8) : 0;
      const hexW = this.offDigits + 2 + this.bpr * (this.cellW + 1) + extraGaps + 2;
      this.paneL.style.width = `calc(${hexW}ch + 26px)`;
      this.paneL.style.fontFamily = 'var(--mono)';
      this.paneR.style.width = `calc(${this.bpr + 2}ch + 46px)`;
      this.paneR.style.fontFamily = 'var(--mono)';
      this.paneL.style.fontSize = this.paneR.style.fontSize = '13px';
      this.spL.style.width = `calc(${hexW}ch + 20px)`;
      this.spR.style.width = `calc(${this.bpr}ch + 20px)`;
      // Headers
      // Header uses the same classes as the rows so the columns line up exactly.
      let cols = '';
      for (let c = 0; c < this.bpr; c++) {
        const gap = this.bpr > 8 && c % 8 === 7 ? ' g8' : '';
        cols += `<span class="bc${gap}">${c.toString(this.radix).toUpperCase().padStart(this.cellW, '0')}</span>`;
      }
      const label = (this.radix === 16 ? 'HEX' : 'OCTAL').padEnd(this.offDigits, ' ');
      this.headL.innerHTML = `<span class="bo ttl" style="display:inline-block;margin-right:14px;width:${this.offDigits}ch">${label}</span>${cols}`;
      const encLabel = (ENCODINGS.find((e) => e[0] === this.enc) || [, this.enc])[1];
      this.headR.innerHTML = `<span class="ttl">Text</span><span>${U.escapeHtml(encLabel)}</span>`;
      this.render();
    }

    firstRow() {
      const vt = this.top * this.scale;
      return { first: Math.floor(vt / RH), offset: this.top - (vt % RH) };
    }

    render() {
      const { first, offset } = this.firstRow();
      const visible = Math.ceil((this.scL.clientHeight || 600) / RH) + 2;
      const last = Math.min(this.rowsTotal, first + visible);
      const b = this.bytes, bpr = this.bpr, cw = this.cellW, rdx = this.radix, od = this.offDigits;
      let hl = '', hr = '';
      for (let r = first; r < last; r++) {
        const start = r * bpr;
        const end = Math.min(b.length, start + bpr);
        hl += `<div class="br"><span class="bo">${start.toString(rdx).toUpperCase().padStart(od, '0')}</span><span class="bh">`;
        for (let i = start; i < start + bpr; i++) {
          const gap = bpr > 8 && (i - start) % 8 === 7 ? ' g8' : '';
          if (i >= end) { hl += `<span class="bc${gap}" style="visibility:hidden">${'0'.repeat(cw)}</span>`; continue; }
          let cls = 'bc' + gap;
          if (b[i] === 0) cls += ' z';
          if (this.mod.has(i)) cls += ' mod';
          if (i === this.hover) cls += ' hv';
          let txt = b[i].toString(rdx).toUpperCase().padStart(cw, '0');
          if (i === this.sel) { cls += ' sel'; if (this.buf) { cls += ' edit'; txt = this.buf.padEnd(cw, '_'); } }
          hl += `<span class="${cls}" data-i="${i}">${txt}</span>`;
        }
        hl += '</span></div>';
        hr += `<div class="br"><span class="bd">${this.decodeRow(start, end)}</span></div>`;
      }
      if (!b.length) hl = '<div class="br muted">(empty file)</div>';
      this.rowsL.innerHTML = hl;
      this.rowsR.innerHTML = hr;
      this.rowsL.style.transform = this.rowsR.style.transform = `translateY(${offset}px)`;
    }

    decodeRow(start, end) {
      const b = this.bytes;
      let out = '';
      const cell = (i, ch, extra) => {
        let cls = 'dc' + (extra || '');
        if (this.mod.has(i)) cls += ' mod';
        if (i === this.hover) cls += ' hv';
        if (i === this.sel) cls += ' sel';
        return `<span class="${cls}" data-i="${i}">${ch}</span>`;
      };
      if (this.utf8) {
        let i = start;
        while (i < end) {
          const c = b[i];
          if (c >= 0x20 && c < 0x7f) { out += cell(i, U.escapeHtml(String.fromCharCode(c))); i++; continue; }
          const len = c >= 0xf0 && c <= 0xf4 ? 4 : c >= 0xe0 ? 3 : c >= 0xc2 && c < 0xe0 ? 2 : 0;
          let ok = len > 0 && i + len <= b.length;
          for (let k = 1; ok && k < len; k++) ok = (b[i + k] & 0xc0) === 0x80;
          if (ok) {
            const ch = this.utf8.decode(b.subarray(i, i + len));
            out += cell(i, U.escapeHtml(ch));
            for (let k = 1; k < len && i + k < end; k++) out += cell(i + k, '·', ' cont');
            i += len;
          } else {
            out += cell(i, '·', (c & 0xc0) === 0x80 ? ' cont' : ' np');
            i++;
          }
        }
        return out;
      }
      const t = this.table.t;
      for (let i = start; i < end; i++) {
        const ch = t[b[i]];
        out += ch === null ? cell(i, '·', ' np') : cell(i, U.escapeHtml(ch));
      }
      return out;
    }

    setHover(i) {
      if (i === this.hover) return;
      for (const n of this.el.querySelectorAll('.hv')) n.classList.remove('hv');
      this.hover = i;
      if (i >= 0) for (const n of this.el.querySelectorAll(`[data-i="${i}"]`)) n.classList.add('hv');
    }

    /* ---------- selection / navigation ---------- */
    select(i) {
      if (!this.bytes.length) return;
      this.sel = Math.max(0, Math.min(this.bytes.length - 1, i));
      this.buf = '';
      this.scrollToIndex(this.sel);
      this.render();
      this.updateInspector();
    }

    scrollToIndex(i) {
      const row = Math.floor(i / this.bpr);
      const viewRows = Math.max(1, Math.floor(this.scL.clientHeight / RH));
      const { first } = this.firstRow();
      let target = null;
      if (row < first) target = row * RH;
      else if (row >= first + viewRows) target = (row - viewRows + 1) * RH;
      if (target !== null) {
        this.top = target / this.scale;
        this.scL.scrollTop = this.scR.scrollTop = this.top;
      }
    }

    parseOffset(s) {
      s = s.trim().toLowerCase().replace(/_/g, '');
      if (!s) return NaN;
      if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s.slice(2), 16);
      if (/^0o[0-7]+$/.test(s)) return parseInt(s.slice(2), 8);
      if (/^[0-9a-f]+h$/.test(s)) return parseInt(s.slice(0, -1), 16);
      if (/^\d+$/.test(s)) return parseInt(s, 10);
      if (/^[0-9a-f]+$/.test(s) && this.radix === 16) return parseInt(s, 16);
      return NaN;
    }

    goto() {
      const n = this.parseOffset(this.gotoIn.value);
      if (!Number.isFinite(n) || n < 0 || n >= this.bytes.length) { U.toast(`Offset out of range (0 – ${Math.max(0, this.bytes.length - 1)}).`, 'warn'); return; }
      this.select(n);
      this.scL.focus({ preventScroll: true });
    }

    patternBytes() {
      const q = this.findIn.value;
      if (!q) return null;
      if (this.findMode.value === 'text') {
        if (this.utf8) return new TextEncoder().encode(q);
        const out = [];
        for (const ch of q) {
          const b = this.table.rev.get(ch);
          if (b === undefined) { U.toast(`"${ch}" cannot be represented in this encoding.`, 'warn'); return null; }
          out.push(b);
        }
        return out;
      }
      let tokens = q.trim().split(/[\s,]+/).filter(Boolean);
      if (tokens.length === 1 && this.radix === 16 && /^[0-9a-f]+$/i.test(tokens[0]) && tokens[0].length > 2 && tokens[0].length % 2 === 0) {
        tokens = tokens[0].match(/../g);
      }
      const out = [];
      for (const t of tokens) {
        let v;
        if (/^0x/i.test(t)) v = parseInt(t.slice(2), 16);
        else if (/^0o/i.test(t)) v = parseInt(t.slice(2), 8);
        else v = parseInt(t, this.radix);
        const valid = this.radix === 16 ? /^(0x)?[0-9a-f]{1,2}$/i.test(t) : /^(0o)?[0-7]{1,3}$/i.test(t);
        if (!valid || !(v >= 0 && v <= 255)) { U.toast(`Invalid byte "${t}" for base ${this.radix}.`, 'warn'); return null; }
        out.push(v);
      }
      return out;
    }

    find() {
      const p = this.patternBytes();
      if (!p || !p.length) return;
      const b = this.bytes, n = b.length, m = p.length;
      for (let k = 1; k <= n; k++) {
        const s = (this.sel + k) % n;
        if (s + m > n) continue;
        let j = 0;
        while (j < m && b[s + j] === p[j]) j++;
        if (j === m) { this.select(s); this.ctx.status(`Found at offset ${s} (0x${s.toString(16).toUpperCase()})`); return; }
      }
      U.toast('Not found.', 'warn', 1800);
    }

    /* ---------- editing ---------- */
    write(i, v) {
      if (this.bytes[i] === v) return;
      this.undo.push({ i, old: this.bytes[i], wasMod: this.mod.has(i) });
      if (this.undo.length > 5000) this.undo.shift();
      this.bytes[i] = v;
      this.mod.add(i);
      this.ctx.onDirty();
    }

    undoEdit() {
      const u = this.undo.pop();
      if (!u) { U.toast('Nothing to undo.', 'info', 1500); return; }
      this.bytes[u.i] = u.old;
      if (!u.wasMod) this.mod.delete(u.i);
      this.ctx.onDirty();
      this.select(u.i);
    }

    onKey(e, kind) {
      const n = this.bytes.length;
      if (!n) return;
      const bpr = this.bpr;
      const page = Math.max(1, Math.floor(this.scL.clientHeight / RH) - 1) * bpr;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); this.undoEdit(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const moves = {
        ArrowLeft: -1, ArrowRight: 1, ArrowUp: -bpr, ArrowDown: bpr, PageUp: -page, PageDown: page,
      };
      if (k in moves) { e.preventDefault(); this.select(this.sel + moves[k]); return; }
      if (k === 'Home') { e.preventDefault(); this.select(this.sel - (this.sel % bpr)); return; }
      if (k === 'End') { e.preventDefault(); this.select(this.sel - (this.sel % bpr) + bpr - 1); return; }
      if (k === 'Escape') { this.buf = ''; this.render(); return; }

      if (kind === 'hex') {
        if (k === 'Backspace') { e.preventDefault(); this.buf = this.buf.slice(0, -1); this.render(); return; }
        const re = this.radix === 16 ? /^[0-9a-f]$/i : /^[0-7]$/;
        if (!re.test(k)) return;
        e.preventDefault();
        this.buf += k.toUpperCase();
        if (this.buf.length >= this.cellW) {
          const v = parseInt(this.buf, this.radix);
          this.buf = '';
          if (v > 255) { U.toast('Octal byte values must be between 000 and 377.', 'warn'); this.render(); return; }
          this.write(this.sel, v);
          if (this.sel < n - 1) this.sel++;
          this.scrollToIndex(this.sel);
          this.updateInspector();
        }
        this.render();
      } else if (k.length === 1) {
        e.preventDefault();
        let v;
        if (this.utf8) v = k.charCodeAt(0) < 128 ? k.charCodeAt(0) : undefined;
        else v = this.table.rev.get(k);
        if (v === undefined) { U.toast(`"${k}" is not a single byte in this encoding.`, 'warn'); return; }
        this.write(this.sel, v);
        this.select(Math.min(n - 1, this.sel + 1));
      }
    }

    /* ---------- inspector ---------- */
    updateInspector() {
      const b = this.bytes, i = this.sel;
      const rows = [];
      const r = (k, v) => rows.push(`<tr><td>${k}</td><td>${U.escapeHtml(String(v))}</td></tr>`);
      if (!b.length) { this.insp.innerHTML = '<h4>Inspector</h4><p class="muted">Empty file.</p>'; return; }
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const left = b.length - i;
      const v = b[i];
      r('Offset (dec)', i);
      r('Offset (hex)', '0x' + i.toString(16).toUpperCase());
      r('Offset (oct)', '0o' + i.toString(8));
      r('Hex', v.toString(16).toUpperCase().padStart(2, '0'));
      r('Octal', v.toString(8).padStart(3, '0'));
      r('Decimal', v);
      r('Binary', v.toString(2).padStart(8, '0'));
      r('Int8', dv.getInt8(i));
      r('Char', this.table.t[v] ?? '·');
      if (left >= 2) { r('UInt16 LE', dv.getUint16(i, true)); r('UInt16 BE', dv.getUint16(i, false)); r('Int16 LE', dv.getInt16(i, true)); }
      if (left >= 4) { r('UInt32 LE', dv.getUint32(i, true)); r('UInt32 BE', dv.getUint32(i, false)); r('Int32 LE', dv.getInt32(i, true)); r('Float32 LE', +dv.getFloat32(i, true).toPrecision(7)); }
      if (left >= 8) { r('Float64 LE', +dv.getFloat64(i, true).toPrecision(15)); r('Int64 LE', dv.getBigInt64(i, true).toString()); }
      this.insp.innerHTML = `<h4>Inspector</h4><table>${rows.join('')}</table>
        <div class="hint">Click a byte, then type ${this.radix === 16 ? '2 hex digits' : '3 octal digits'} in the left pane — or a character in the right pane — to overwrite it.<br>
        Arrows / PgUp / PgDn move · Ctrl+Z undoes.<br>Modified bytes: <b>${this.mod.size}</b></div>`;
      this.ctx.status(`Offset ${i} · 0x${i.toString(16).toUpperCase()} · 0o${i.toString(8)}  |  byte ${v.toString(this.radix).toUpperCase().padStart(this.cellW, '0')}`);
    }

    sync() { /* bytes are edited in place */ }
    getData() { return this.bytes; }
    status() { return `${this.radix === 16 ? 'Hexadecimal' : 'Octal'} view · ${this.mod.size} modified byte${this.mod.size === 1 ? '' : 's'}`; }
    destroy() { if (this.ro) this.ro.disconnect(); cancelAnimationFrame(this.raf); this.el.remove(); }
  }

  CF.viewers.binary = { create: (host, doc, ctx) => new BinaryViewer(host, doc, ctx) };
})();
