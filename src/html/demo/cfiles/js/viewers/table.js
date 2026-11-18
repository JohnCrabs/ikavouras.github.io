/* CFiles — CSV table viewer & editor (with raw source mode) */
(function () {
  'use strict';
  const U = CF.util;
  const CSV = CF.csv;
  const PAGE = 200;
  const DELIM_LABEL = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };

  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const isNum = (s) => /^\s*-?\d+([.,]\d+)?\s*$/.test(s);

  class TableViewer {
    constructor(host, doc, ctx) {
      this.doc = doc;
      this.ctx = ctx;
      this.delim = doc.meta.delimiter || (CSV.sniff(doc.text) || {}).delimiter || ',';
      this.page = 0;
      this.filter = '';
      this.selRow = -1;
      this.selCol = -1;
      this.sort = null;
      this.dirty = false;
      this.srcDirty = false;
      this.mode = 'table';
      this.load(doc.text);
      this.hasHeader = doc.meta.hasHeader ?? this.guessHeader();
      this.build(host);
      this.render();
    }

    load(text) {
      this.eol = /\r\n/.test(text) ? '\r\n' : '\n';
      this.trailing = /\r?\n$/.test(text);
      this.rows = CSV.parse(text, this.delim);
      const cols = this.colCount();
      for (const r of this.rows) while (r.length < cols) r.push('');
      if (!this.rows.length) this.rows.push(['']);
    }

    guessHeader() {
      if (this.rows.length < 2) return false;
      const h = this.rows[0];
      return h.every((c) => c.trim() !== '' && !isNum(c)) && new Set(h).size === h.length;
    }

    colCount() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0) || 1; }
    serialize() { return CSV.stringify(this.rows, this.delim, this.eol, this.trailing); }

    sync() {
      if (this.mode === 'table' && this.dirty) { this.doc.text = this.serialize(); this.dirty = false; }
      else if (this.mode === 'source' && this.srcDirty) { this.doc.text = this.srcEl.value; }
      this.doc.meta.delimiter = this.delim;
      this.doc.meta.hasHeader = this.hasHeader;
    }

    touched() { this.dirty = true; this.ctx.onDirty(); }

    getData() {
      this.sync();
      if (this.mode === 'source') this.load(this.srcEl.value);
      return this.hasHeader ? CSV.toObjects(this.rows) : this.rows.map((r) => r.map(CSV.autoType));
    }

    /* ---------- DOM ---------- */
    build(host) {
      this.el = U.el('div', { class: 'viewer table-viewer' });
      this.modeSeg = U.seg([['table', 'Table'], ['source', 'Source']], 'table', (m) => this.setMode(m));
      const dsel = U.el('select', { title: 'Delimiter used to read and write the file' }, Object.entries(DELIM_LABEL).map(([v, l]) => U.el('option', { value: v, text: l })));
      dsel.value = this.delim;
      dsel.addEventListener('change', () => {
        this.sync();
        this.delim = dsel.value;
        this.load(this.doc.text);
        this.page = 0;
        this.render();
      });
      const hdr = U.el('input', { type: 'checkbox', checked: this.hasHeader });
      hdr.addEventListener('change', () => { this.hasHeader = hdr.checked; this.render(); });
      this.filterIn = U.el('input', { class: 'search', type: 'search', placeholder: 'Filter rows…' });
      this.filterIn.addEventListener('input', U.debounce(() => { this.filter = this.filterIn.value.trim().toLowerCase(); this.page = 0; this.render(); }, 200));

      this.tableCtrls = [
        U.el('button', { class: 'btn sm', type: 'button', text: '+ Row', onclick: () => this.addRow() }),
        U.el('button', { class: 'btn sm', type: 'button', text: '+ Column', onclick: () => this.addCol() }),
        U.el('button', { class: 'btn sm danger', type: 'button', text: '− Row', title: 'Delete selected row (click a row number)', onclick: () => this.delRow() }),
        U.el('button', { class: 'btn sm danger', type: 'button', text: '− Column', title: 'Delete selected column (click a column header)', onclick: () => this.delCol() }),
        this.filterIn, hdr, dsel,
      ];
      this.pager = U.el('span', { class: 'pager' });
      const tb = U.el('div', { class: 'toolbar' },
        this.modeSeg, U.el('span', { class: 'tsep' }),
        U.el('label', {}, 'Delimiter', dsel),
        U.el('label', {}, hdr, 'Header row'),
        U.el('span', { class: 'tsep' }),
        ...this.tableCtrls.slice(0, 4),
        this.filterIn,
        U.el('span', { class: 'spacer' }),
        this.pager,
      );
      this.wrap = U.el('div', { class: 'table-wrap' });
      this.srcEl = U.el('textarea', { class: 'code hidden', spellcheck: 'false', wrap: 'off' });
      this.srcEl.addEventListener('input', () => { this.srcDirty = true; this.ctx.onDirty(); });
      this.wrap.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.r === undefined) return;
        this.rows[+t.dataset.r][+t.dataset.c] = t.value;
        this.touched();
      });
      this.wrap.addEventListener('keydown', (e) => this.onKey(e));
      this.wrap.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t.dataset.r !== undefined) this.ctx.status(`Row ${+t.dataset.r + 1}, Column ${colName(+t.dataset.c)}`);
      });
      this.el.append(tb, this.wrap, this.srcEl);
      host.append(this.el);
    }

    setMode(m) {
      if (m === this.mode) return;
      if (m === 'source') {
        this.sync();
        this.srcEl.value = this.doc.text;
        this.srcDirty = false;
      } else {
        if (this.srcDirty) { this.doc.text = this.srcEl.value; this.srcDirty = false; }
        this.load(this.doc.text);
        this.render();
      }
      this.mode = m;
      this.modeSeg.set(m);
      this.wrap.classList.toggle('hidden', m !== 'table');
      this.srcEl.classList.toggle('hidden', m === 'table');
      for (const c of this.tableCtrls) c.disabled = m !== 'table';
    }

    dataIndices() {
      const start = this.hasHeader ? 1 : 0;
      const out = [];
      for (let i = start; i < this.rows.length; i++) {
        if (!this.filter || this.rows[i].some((c) => c.toLowerCase().includes(this.filter))) out.push(i);
      }
      return out;
    }

    render() {
      const cols = this.colCount();
      const idx = this.dataIndices();
      const pages = Math.max(1, Math.ceil(idx.length / PAGE));
      if (this.page >= pages) this.page = pages - 1;
      const slice = idx.slice(this.page * PAGE, (this.page + 1) * PAGE);

      const table = U.el('table', { class: 'grid' });
      const htr = U.el('tr', {}, U.el('th', { class: 'rn', text: '#' }));
      for (let c = 0; c < cols; c++) {
        const th = U.el('th', { class: c === this.selCol ? 'selcol' : null });
        const cell = U.el('div', { class: 'hcell' });
        if (this.hasHeader) {
          const inp = U.el('input', { value: this.rows[0][c] ?? '', spellcheck: 'false', dataset: { r: 0, c }, title: `Column ${colName(c)}` });
          cell.append(U.el('span', { class: 'hlabel', text: colName(c), title: 'Select column', onclick: () => this.selectCol(c) }), inp);
          cell.firstChild.style.flex = '0 0 auto';
        } else {
          cell.append(U.el('span', { class: 'hlabel', text: colName(c), title: 'Select column', onclick: () => this.selectCol(c) }));
        }
        const arrow = this.sort && this.sort.c === c ? (this.sort.dir > 0 ? '▲' : '▼') : '⇅';
        cell.append(U.el('button', { class: 'sortb', type: 'button', text: arrow, title: 'Sort by this column', onclick: () => this.sortBy(c) }));
        th.append(cell);
        htr.append(th);
      }
      table.append(U.el('thead', {}, htr));

      const tbody = U.el('tbody');
      const frag = document.createDocumentFragment();
      for (const r of slice) {
        const tr = U.el('tr', { class: r === this.selRow ? 'selrow' : null });
        tr.append(U.el('td', { class: 'rn', text: this.hasHeader ? r : r + 1, title: 'Select row', onclick: () => this.selectRow(r) }));
        const row = this.rows[r];
        for (let c = 0; c < cols; c++) {
          tr.append(U.el('td', { class: c === this.selCol ? 'selcol' : null }, U.el('input', { value: row[c] ?? '', spellcheck: 'false', dataset: { r, c } })));
        }
        frag.append(tr);
      }
      tbody.append(frag);
      table.append(tbody);
      const top = this.wrap.scrollTop, left = this.wrap.scrollLeft;
      this.wrap.textContent = '';
      this.wrap.append(table);
      this.wrap.scrollTop = top; this.wrap.scrollLeft = left;

      // pager
      this.pager.textContent = '';
      const total = idx.length;
      const info = U.el('span', { class: 'muted', text: `${total} row${total === 1 ? '' : 's'} × ${cols} col${cols === 1 ? '' : 's'}${this.filter ? ' (filtered)' : ''}` });
      this.pager.append(info);
      if (pages > 1) {
        const go = (p) => { this.page = Math.max(0, Math.min(pages - 1, p)); this.render(); this.wrap.scrollTop = 0; };
        this.pager.append(
          U.el('button', { class: 'btn sm', type: 'button', text: '«', onclick: () => go(0) }),
          U.el('button', { class: 'btn sm', type: 'button', text: '‹', onclick: () => go(this.page - 1) }),
          U.el('span', { text: ` ${this.page + 1} / ${pages} ` }),
          U.el('button', { class: 'btn sm', type: 'button', text: '›', onclick: () => go(this.page + 1) }),
          U.el('button', { class: 'btn sm', type: 'button', text: '»', onclick: () => go(pages - 1) }),
        );
      }
    }

    onKey(e) {
      const t = e.target;
      if (t.dataset.r === undefined) return;
      const r = +t.dataset.r, c = +t.dataset.c;
      let target = null;
      const find = (rr, cc) => this.wrap.querySelector(`input[data-r="${rr}"][data-c="${cc}"]`);
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
        const rows = [...this.wrap.querySelectorAll(`input[data-c="${c}"]`)];
        const i = rows.indexOf(t);
        target = rows[i + 1];
      } else if (e.key === 'ArrowUp') {
        const rows = [...this.wrap.querySelectorAll(`input[data-c="${c}"]`)];
        target = rows[rows.indexOf(t) - 1];
      } else if (e.key === 'ArrowLeft' && t.selectionStart === 0 && t.selectionEnd === 0) target = find(r, c - 1);
      else if (e.key === 'ArrowRight' && t.selectionStart === t.value.length) target = find(r, c + 1);
      if (target) { e.preventDefault(); target.focus(); target.select(); }
    }

    selectRow(r) { this.selRow = this.selRow === r ? -1 : r; this.selCol = -1; this.render(); }
    selectCol(c) { this.selCol = this.selCol === c ? -1 : c; this.selRow = -1; this.render(); }

    addRow() {
      const cols = this.colCount();
      const at = this.selRow >= 0 ? this.selRow + 1 : this.rows.length;
      this.rows.splice(at, 0, new Array(cols).fill(''));
      this.touched();
      this.filter = ''; this.filterIn.value = '';
      const idx = this.dataIndices();
      this.page = Math.floor(idx.indexOf(at) / PAGE);
      this.selRow = at;
      this.render();
      const inp = this.wrap.querySelector(`input[data-r="${at}"][data-c="0"]`);
      if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); }
    }

    addCol() {
      const cols = this.colCount();
      const at = this.selCol >= 0 ? this.selCol + 1 : cols;
      this.rows.forEach((r, i) => r.splice(at, 0, i === 0 && this.hasHeader ? 'column' + (cols + 1) : ''));
      this.selCol = at;
      this.touched();
      this.render();
    }

    delRow() {
      if (this.selRow < 0) { U.toast('Click a row number first to select a row.', 'warn'); return; }
      this.rows.splice(this.selRow, 1);
      if (!this.rows.length) this.rows.push(new Array(1).fill(''));
      this.selRow = -1;
      this.touched();
      this.render();
    }

    delCol() {
      if (this.selCol < 0) { U.toast('Click a column letter first to select a column.', 'warn'); return; }
      if (this.colCount() <= 1) { U.toast('A table needs at least one column.', 'warn'); return; }
      const c = this.selCol;
      this.rows.forEach((r) => r.splice(c, 1));
      this.selCol = -1;
      this.touched();
      this.render();
    }

    sortBy(c) {
      const dir = this.sort && this.sort.c === c ? -this.sort.dir : 1;
      this.sort = { c, dir };
      const head = this.hasHeader ? this.rows.slice(0, 1) : [];
      const body = this.rows.slice(head.length);
      const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      body.sort((a, b) => dir * coll.compare(a[c] ?? '', b[c] ?? ''));
      this.rows = head.concat(body);
      this.touched();
      this.render();
    }

    status() { return `${DELIM_LABEL[this.delim]}-separated · ${this.eol === '\r\n' ? 'CRLF' : 'LF'}`; }
    destroy() { this.el.remove(); }
  }

  CF.viewers.table = { create: (host, doc, ctx) => new TableViewer(host, doc, ctx) };
})();
