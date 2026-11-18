/* CFiles — plain text editor with line numbers and find / replace */
(function () {
  'use strict';
  const U = CF.util;

  class TextViewer {
    constructor(host, doc, ctx) {
      this.doc = doc;
      this.ctx = ctx;
      this.dirty = false;
      this.wrap = U.store.get('cf.txtWrap', '0') === '1';
      this.fontSize = Number(U.store.get('cf.txtFont', '13'));
      this.build(host);
      this.ta.value = doc.text;
      this.applyView();
      this.updateGutter(true);
      this.updateCursor();
    }

    build(host) {
      this.el = U.el('div', { class: 'viewer text-viewer' });
      const wrapCb = U.el('input', { type: 'checkbox', checked: this.wrap });
      wrapCb.addEventListener('change', () => { this.wrap = wrapCb.checked; U.store.set('cf.txtWrap', this.wrap ? '1' : '0'); this.applyView(); });
      this.findIn = U.el('input', { class: 'search', type: 'search', placeholder: 'Find…' });
      this.replIn = U.el('input', { class: 'search', placeholder: 'Replace with…' });
      this.caseCb = U.el('input', { type: 'checkbox' });
      this.reCb = U.el('input', { type: 'checkbox' });
      this.findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.findNext(e.shiftKey); } });
      this.replIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); } });

      const tb = U.el('div', { class: 'toolbar' },
        U.el('label', { title: 'Word wrap' }, wrapCb, 'Wrap'),
        U.el('button', { class: 'btn sm', type: 'button', text: 'A−', title: 'Smaller font', onclick: () => this.zoom(-1) }),
        U.el('button', { class: 'btn sm', type: 'button', text: 'A+', title: 'Larger font', onclick: () => this.zoom(1) }),
        U.el('span', { class: 'tsep' }),
        this.findIn,
        U.el('button', { class: 'btn sm', type: 'button', text: '↓', title: 'Find next (Enter)', onclick: () => this.findNext(false) }),
        U.el('button', { class: 'btn sm', type: 'button', text: '↑', title: 'Find previous (Shift+Enter)', onclick: () => this.findNext(true) }),
        this.replIn,
        U.el('button', { class: 'btn sm', type: 'button', text: 'Replace', onclick: () => this.replaceOne() }),
        U.el('button', { class: 'btn sm', type: 'button', text: 'All', title: 'Replace all', onclick: () => this.replaceAll() }),
        U.el('label', { title: 'Match case' }, this.caseCb, 'Aa'),
        U.el('label', { title: 'Regular expression' }, this.reCb, '.*'),
        U.el('span', { class: 'spacer' }),
        this.info = U.el('span', { class: 'muted' }),
      );
      this.gutter = U.el('div', { class: 'gutter', 'aria-hidden': 'true' });
      this.ta = U.el('textarea', { class: 'code', spellcheck: 'false' });
      this.ta.addEventListener('input', () => { this.dirty = true; this.ctx.onDirty(); this.updateGutter(); this.cursorSoon(); });
      this.ta.addEventListener('scroll', () => { this.gutter.scrollTop = this.ta.scrollTop; });
      for (const ev of ['keyup', 'click', 'select']) this.ta.addEventListener(ev, () => this.cursorSoon());
      this.ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.shiftKey) { e.preventDefault(); U.insertText(this.ta, '\t'); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); this.findIn.focus(); this.findIn.select(); }
      });
      this.cursorSoon = U.debounce(() => this.updateCursor(), 60);
      this.el.append(tb, U.el('div', { class: 'text-wrap' }, this.gutter, this.ta));
      host.append(this.el);
    }

    applyView() {
      this.ta.classList.toggle('wrap', this.wrap);
      this.ta.setAttribute('wrap', this.wrap ? 'soft' : 'off');
      this.gutter.classList.toggle('hidden', this.wrap);
      this.ta.style.fontSize = this.gutter.style.fontSize = this.fontSize + 'px';
      this.gutter.scrollTop = this.ta.scrollTop;
    }

    zoom(d) {
      this.fontSize = Math.max(9, Math.min(28, this.fontSize + d));
      U.store.set('cf.txtFont', String(this.fontSize));
      this.applyView();
    }

    updateGutter(force) {
      let n = 1;
      const v = this.ta.value;
      for (let i = v.indexOf('\n'); i !== -1; i = v.indexOf('\n', i + 1)) n++;
      if (!force && n === this.lines) return;
      this.lines = n;
      let s = '';
      for (let i = 1; i <= n; i++) s += i + '\n';
      this.gutter.textContent = s + '\n';
      this.gutter.scrollTop = this.ta.scrollTop;
    }

    updateCursor() {
      const v = this.ta.value;
      const pos = this.ta.selectionStart;
      const before = v.slice(0, pos);
      const line = (before.match(/\n/g) || []).length + 1;
      const col = pos - before.lastIndexOf('\n');
      const sel = this.ta.selectionEnd - this.ta.selectionStart;
      const words = v.length < 2e6 ? (v.match(/\S+/g) || []).length : '—';
      this.info.textContent = `${this.lines} lines · ${words} words · ${v.length} chars`;
      this.ctx.status(`Ln ${line}, Col ${col}${sel ? ` (${sel} selected)` : ''}`);
    }

    regex() {
      const q = this.findIn.value;
      if (!q) return null;
      try {
        return new RegExp(this.reCb.checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (this.caseCb.checked ? '' : 'i') + 'm');
      } catch (e) {
        U.toast('Invalid regular expression: ' + e.message, 'error');
        return null;
      }
    }

    select(start, end) {
      const ta = this.ta;
      ta.focus();
      ta.setSelectionRange(start, end);
      // Scroll the match into view.
      const line = (ta.value.slice(0, start).match(/\n/g) || []).length;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || this.fontSize * 1.55;
      const y = line * lh;
      if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
      this.updateCursor();
    }

    findNext(backwards) {
      const re = this.regex();
      if (!re) return false;
      const v = this.ta.value;
      const matches = [];
      let m;
      while ((m = re.exec(v)) && matches.length < 100000) {
        matches.push([m.index, m.index + m[0].length]);
        if (m[0] === '') re.lastIndex++;
      }
      if (!matches.length) { U.toast('No matches.', 'warn', 1800); return false; }
      let pick;
      if (backwards) {
        const s = this.ta.selectionStart;
        pick = [...matches].reverse().find(([a]) => a < s) || matches[matches.length - 1];
      } else {
        const e = this.ta.selectionEnd;
        pick = matches.find(([a, b]) => a >= e && b > a) || matches.find(([a]) => a >= e) || matches[0];
      }
      this.select(pick[0], pick[1]);
      this.ctx.status(`Match ${matches.indexOf(pick) + 1} of ${matches.length}`);
      return true;
    }

    replaceOne() {
      const re = this.regex();
      if (!re) return;
      const sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
      const exact = new RegExp('^(?:' + re.source + ')$', re.flags.replace('g', '').replace('m', ''));
      if (sel && exact.test(sel)) {
        U.insertText(this.ta, this.reCb.checked ? sel.replace(exact, this.replIn.value) : this.replIn.value);
      }
      this.findNext(false);
    }

    replaceAll() {
      const re = this.regex();
      if (!re) return;
      const v = this.ta.value;
      const count = (v.match(re) || []).length;
      if (!count) { U.toast('No matches.', 'warn', 1800); return; }
      const repl = this.reCb.checked ? this.replIn.value : this.replIn.value.replace(/\$/g, '$$$$');
      this.ta.focus();
      this.ta.select();
      U.insertText(this.ta, v.replace(re, repl));
      U.toast(`Replaced ${count} occurrence${count === 1 ? '' : 's'}.`, 'ok', 2200);
    }

    sync() { if (this.dirty) { this.doc.text = this.ta.value; this.dirty = false; } }
    getData() { this.sync(); return this.doc.text; }
    status() { const eol = /\r\n/.test(this.doc.text) ? 'CRLF' : 'LF'; return `Plain text · ${eol}`; }
    destroy() { this.el.remove(); }
  }

  CF.viewers.text = { create: (host, doc, ctx) => new TextViewer(host, doc, ctx) };
})();
