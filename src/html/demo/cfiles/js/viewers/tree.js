/* CFiles — JSON / YAML key-value tree viewer & editor (with raw source mode) */
(function () {
  'use strict';
  const U = CF.util;
  const TYPES = ['string', 'number', 'boolean', 'null', 'object', 'array'];
  const CHILD_LIMIT = 200;

  const typeOf = (v) =>
    v === null || v === undefined ? 'null'
      : Array.isArray(v) ? 'array'
        : typeof v === 'object' ? 'object'
          : typeof v === 'number' ? 'number'
            : typeof v === 'boolean' ? 'boolean'
              : 'string';

  function convert(v, to) {
    const from = typeOf(v);
    if (from === to) return v;
    switch (to) {
      case 'string': return from === 'object' || from === 'array' ? JSON.stringify(v) : from === 'null' ? '' : String(v);
      case 'number': { const n = Number(v); return Number.isFinite(n) ? n : 0; }
      case 'boolean': return from === 'string' ? !/^(false|0|no|off|)$/i.test(v.trim()) : Boolean(v);
      case 'null': return null;
      case 'object':
        if (from === 'array') { const o = {}; v.forEach((x, i) => { o[i] = x; }); return o; }
        if (from === 'string') { try { const p = JSON.parse(v); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch (e) { /* ignore */ } }
        return {};
      case 'array':
        if (from === 'object') return Object.values(v);
        if (from === 'string') { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch (e) { /* ignore */ } }
        return from === 'null' ? [] : [v];
    }
    return v;
  }

  function rebuild(obj, mapFn) {
    const entries = Object.entries(obj);
    for (const k of Object.keys(obj)) delete obj[k];
    for (const [k, v] of mapFn(entries)) obj[k] = v;
  }

  function uniqueKey(obj, base) {
    if (!Object.prototype.hasOwnProperty.call(obj, base)) return base;
    let i = 1;
    while (Object.prototype.hasOwnProperty.call(obj, base + i)) i++;
    return base + i;
  }

  function autosize(input) {
    input.size = Math.max(3, Math.min(40, input.value.length + 1));
  }

  class TreeViewer {
    constructor(host, doc, ctx) {
      this.doc = doc;
      this.ctx = ctx;
      this.fmt = doc.type; // 'json' | 'yaml'
      this.expanded = new WeakMap();
      this.limits = new WeakMap();
      this.defaultDepth = 2;
      this.treeDirty = false;
      this.srcDirty = false;
      this.search = '';
      this.indent = doc.meta.indent || 2;
      this.mode = null;
      this.build(host);

      if (this.fmt === 'yaml' && !U.hasYaml()) {
        this.showError(new Error('The YAML library could not be loaded (offline?). Showing the raw source only.'));
        this.setMode('source', true);
        return;
      }
      if (this.tryParse(doc.text)) this.setMode('tree', true);
      else this.setMode('source', true);
    }

    /* ---------- parse / serialise ---------- */
    parse(text) {
      if (this.fmt === 'json') {
        this.multi = false;
        this.root = { value: text.trim() === '' ? {} : JSON.parse(text) };
      } else {
        const docs = [];
        jsyaml.loadAll(text, (d) => docs.push(d === undefined ? null : d), { schema: jsyaml.CORE_SCHEMA });
        this.multi = docs.length > 1;
        this.root = { value: this.multi ? docs : docs.length ? docs[0] : {} };
      }
    }

    tryParse(text) {
      try { this.parse(text); this.showError(null); return true; } catch (e) { this.showError(e); return false; }
    }

    serialize() {
      const v = this.root.value;
      if (this.fmt === 'json') return JSON.stringify(v, null, this.indent === 'tab' ? '\t' : Number(this.indent)) + '\n';
      const opts = { lineWidth: -1, noRefs: true, schema: jsyaml.CORE_SCHEMA, indent: 2 };
      if (this.multi && Array.isArray(v)) return v.map((d) => jsyaml.dump(d, opts)).join('---\n');
      return jsyaml.dump(v, opts);
    }

    /* ---------- DOM ---------- */
    build(host) {
      this.el = U.el('div', { class: 'viewer tree-viewer' });
      this.modeSeg = U.seg([['tree', 'Tree'], ['source', 'Source']], 'tree', (m) => this.setMode(m));
      const tb = U.el('div', { class: 'toolbar' },
        this.modeSeg,
        U.el('span', { class: 'tsep' }),
        this.btnExpand = U.el('button', { class: 'btn sm', type: 'button', text: 'Expand all', onclick: () => { this.defaultDepth = Infinity; this.expanded = new WeakMap(); this.renderTree(); } }),
        this.btnCollapse = U.el('button', { class: 'btn sm', type: 'button', text: 'Collapse', onclick: () => { this.defaultDepth = 1; this.expanded = new WeakMap(); this.renderTree(); } }),
        this.searchIn = U.el('input', { class: 'search', type: 'search', placeholder: 'Search keys / values…' }),
        U.el('span', { class: 'tsep' }),
      );
      this.searchIn.addEventListener('input', U.debounce(() => {
        this.search = this.searchIn.value.trim().toLowerCase();
        this.matchCache = new WeakMap();
        this.expanded = new WeakMap();
        if (this.mode === 'tree') this.renderTree();
      }, 200));

      if (this.fmt === 'json') {
        const ind = U.el('select', { title: 'Indentation' },
          U.el('option', { value: '2', text: '2 spaces' }), U.el('option', { value: '4', text: '4 spaces' }), U.el('option', { value: 'tab', text: 'Tabs' }));
        ind.value = String(this.indent);
        ind.addEventListener('change', () => { this.indent = ind.value; this.doc.meta.indent = ind.value; });
        tb.append(
          U.el('label', {}, 'Indent', ind),
          U.el('button', { class: 'btn sm', type: 'button', text: 'Format', title: 'Pretty-print into the source', onclick: () => this.reformat(false) }),
          U.el('button', { class: 'btn sm', type: 'button', text: 'Minify', onclick: () => this.reformat(true) }),
        );
      } else {
        tb.append(U.el('button', { class: 'btn sm', type: 'button', text: 'Format', title: 'Re-emit normalised YAML', onclick: () => this.reformat(false) }));
      }
      tb.append(U.el('span', { class: 'spacer' }), this.info = U.el('span', { class: 'muted' }));

      this.errBar = U.el('div', { class: 'errbar hidden' });
      this.treeEl = U.el('div', { class: 'tree', role: 'tree' });
      this.srcEl = U.el('textarea', { class: 'code', spellcheck: 'false', wrap: 'off' });
      this.srcEl.addEventListener('input', () => { this.srcDirty = true; this.ctx.onDirty(); });
      this.srcEl.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); U.insertText(this.srcEl, this.fmt === 'yaml' ? '  ' : '  '); }
      });
      this.el.append(tb, this.errBar, this.treeEl, this.srcEl);
      host.append(this.el);
    }

    showError(e) {
      if (!e) { this.errBar.classList.add('hidden'); return; }
      let msg = e.message || String(e);
      if (e.mark) msg = `${e.reason || 'YAML error'} (line ${e.mark.line + 1}, column ${e.mark.column + 1})`;
      this.errBar.textContent = `⚠ ${this.fmt.toUpperCase()} parse error: ${msg}`;
      this.errBar.classList.remove('hidden');
    }

    setMode(m, initial) {
      if (m === this.mode && !initial) return;
      if (m === 'source') {
        if (!initial) this.sync();
        this.srcEl.value = this.doc.text;
        this.srcDirty = false;
      } else {
        if (!initial && this.srcDirty) {
          if (!this.tryParse(this.srcEl.value)) { this.modeSeg.set('source'); return; }
          this.doc.text = this.srcEl.value;
          this.srcDirty = false;
        } else if (!initial && !this.root) {
          if (!this.tryParse(this.srcEl.value)) { this.modeSeg.set('source'); return; }
        }
        this.renderTree();
      }
      this.mode = m;
      this.modeSeg.set(m);
      const tree = m === 'tree';
      this.treeEl.classList.toggle('hidden', !tree);
      this.srcEl.classList.toggle('hidden', tree);
      for (const b of [this.btnExpand, this.btnCollapse, this.searchIn]) b.disabled = !tree;
      if (!tree) this.info.textContent = '';
    }

    reformat(minify) {
      if (this.mode === 'source' && this.srcDirty) {
        if (!this.tryParse(this.srcEl.value)) return;
        this.srcDirty = false;
      }
      if (!this.root) return;
      let out;
      if (minify) out = JSON.stringify(this.root.value);
      else out = this.serialize();
      this.doc.text = out;
      this.treeDirty = false;
      this.ctx.onDirty();
      this.setMode('source');
      this.srcEl.value = out;
      U.toast(minify ? 'Minified into the source view.' : 'Formatted into the source view.', 'ok', 2000);
    }

    /** Writes the current state back to doc.text */
    sync() {
      if (this.mode === 'tree' && this.treeDirty) { this.doc.text = this.serialize(); this.treeDirty = false; }
      else if (this.mode === 'source' && this.srcDirty) { this.doc.text = this.srcEl.value; }
    }

    getData() {
      this.sync();
      if (this.mode === 'source') this.parse(this.srcEl.value);
      return this.root.value;
    }

    touched() { this.treeDirty = true; this.ctx.onDirty(); }

    /* ---------- tree rendering ---------- */
    isExpanded(v, depth) {
      if (this.expanded.has(v)) return this.expanded.get(v);
      if (this.search) return this.deepMatch(v);
      return depth < this.defaultDepth;
    }

    rowMatches(key, v) {
      if (!this.search) return false;
      if (String(key).toLowerCase().includes(this.search)) return true;
      const t = typeOf(v);
      return t !== 'object' && t !== 'array' && String(v).toLowerCase().includes(this.search);
    }

    deepMatch(v) {
      if (!v || typeof v !== 'object') return false;
      if (this.matchCache.has(v)) return this.matchCache.get(v);
      this.matchCache.set(v, false); // cycle guard
      let found = false;
      for (const [k, c] of Object.entries(v)) {
        if (this.rowMatches(k, c) || this.deepMatch(c)) { found = true; break; }
      }
      this.matchCache.set(v, found);
      return found;
    }

    renderTree() {
      const top = this.treeEl.scrollTop;
      this.treeEl.textContent = '';
      this.matchCount = 0;
      this.renderRow(this.treeEl, this.root, 'value', 0, { isRoot: true, refresh: () => this.renderTree() });
      this.treeEl.scrollTop = top;
      const v = this.root.value;
      const t = typeOf(v);
      let txt = t === 'array' ? `${v.length} items` : t === 'object' ? `${Object.keys(v).length} keys` : t;
      if (this.search) txt = `${this.matchCount} match${this.matchCount === 1 ? '' : 'es'} · ` + txt;
      this.info.textContent = txt;
    }

    renderChildren(block, cont, depth, refresh) {
      block.textContent = '';
      const keys = Array.isArray(cont) ? cont.map((_, i) => String(i)) : Object.keys(cont);
      const limit = this.limits.get(cont) || CHILD_LIMIT;
      const n = Math.min(keys.length, limit);
      for (let i = 0; i < n; i++) this.renderRow(block, cont, keys[i], depth, { refresh });
      if (keys.length > limit) {
        const more = U.el('button', {
          class: 'btn sm more', type: 'button', text: `Show ${Math.min(CHILD_LIMIT, keys.length - limit)} more (${keys.length - limit} hidden)`,
          onclick: () => { this.limits.set(cont, limit + CHILD_LIMIT); refresh(); },
        });
        more.style.setProperty('--d', depth);
        block.append(more);
      }
    }

    renderRow(parentEl, container, key, depth, opts) {
      const v = container[key];
      const t = typeOf(v);
      const isCont = t === 'object' || t === 'array';
      const inArray = Array.isArray(container) && !opts.isRoot;
      const row = U.el('div', { class: 'tr t-' + t, role: 'treeitem' });
      row.style.setProperty('--d', depth);
      if (this.rowMatches(key, v)) { row.classList.add('match'); this.matchCount++; }

      let exp = isCont && this.isExpanded(v, depth);
      const tog = U.el('button', { class: 'tg', type: 'button', text: isCont ? (exp ? '▾' : '▸') : '', disabled: !isCont, tabIndex: -1, 'aria-label': 'Expand / collapse' });
      row.append(tog);

      // Key cell
      if (opts.isRoot) {
        row.append(U.el('span', { class: 'tk root', text: this.multi ? `${v.length} documents` : 'root' }));
      } else if (inArray) {
        // YAML "- " list marker shown as a visual gap/dash, plus the index.
        row.append(U.el('span', { class: 'tk idx', title: `Item #${key}` }, U.el('span', { class: 'dash' }), U.el('span', { class: 'n', text: key })));
      } else {
        const kin = U.el('input', { class: 'tk-in', value: key, spellcheck: 'false', 'aria-label': 'Key' });
        autosize(kin);
        kin.addEventListener('input', () => autosize(kin));
        kin.addEventListener('keydown', (e) => { if (e.key === 'Enter') kin.blur(); if (e.key === 'Escape') { kin.value = key; kin.blur(); } });
        kin.addEventListener('change', () => this.renameKey(container, key, kin.value, kin, opts));
        row.append(kin, U.el('span', { class: 'tsep', text: ':' }));
      }

      // Value cell
      let valEl;
      switch (t) {
        case 'object':
        case 'array': {
          const n = t === 'array' ? v.length : Object.keys(v).length;
          valEl = U.el('span', { class: 'tsum', text: t === 'array' ? `[ ${n} item${n === 1 ? '' : 's'} ]` : `{ ${n} key${n === 1 ? '' : 's'} }` });
          break;
        }
        case 'string': {
          const multi = v.includes('\n');
          valEl = U.el(multi ? 'textarea' : 'input', { class: 'tv-in str', value: v, spellcheck: 'false', 'aria-label': 'Value' });
          if (multi) valEl.rows = Math.min(10, v.split('\n').length);
          valEl.addEventListener('input', () => { container[key] = valEl.value; this.touched(); });
          break;
        }
        case 'number': {
          valEl = U.el('input', { class: 'tv-in num', value: String(v), spellcheck: 'false', inputmode: 'decimal', 'aria-label': 'Value' });
          valEl.addEventListener('input', () => {
            const s = valEl.value.trim();
            const num = Number(s);
            const ok = s !== '' && Number.isFinite(num);
            valEl.classList.toggle('invalid', !ok);
            if (ok) { container[key] = num; this.touched(); }
          });
          break;
        }
        case 'boolean': {
          valEl = U.el('select', { class: 'tv-in', 'aria-label': 'Value' }, U.el('option', { value: 'true', text: 'true' }), U.el('option', { value: 'false', text: 'false' }));
          valEl.value = String(v);
          valEl.addEventListener('change', () => { container[key] = valEl.value === 'true'; this.touched(); });
          break;
        }
        default:
          valEl = U.el('span', { class: 'tnull', text: 'null' });
      }
      row.append(valEl);

      // Type selector
      const tsel = U.el('select', { class: 'tt', title: 'Change type', 'aria-label': 'Type' }, TYPES.map((x) => U.el('option', { value: x, text: x })));
      tsel.value = t;
      tsel.addEventListener('change', () => {
        container[key] = convert(container[key], tsel.value);
        this.touched();
        opts.refresh();
      });
      row.append(tsel);

      // Actions
      const acts = U.el('span', { class: 'ta' });
      let addBtn;
      if (isCont) acts.append(addBtn = U.el('button', { type: 'button', text: '+', title: t === 'array' ? 'Add item' : 'Add key' }));
      if (!opts.isRoot) {
        acts.append(
          U.el('button', { type: 'button', text: '⧉', title: 'Duplicate', onclick: () => this.duplicate(container, key, opts) }),
          U.el('button', { type: 'button', class: 'del', text: '✕', title: 'Delete', onclick: () => this.remove(container, key, opts) }),
        );
      }
      row.append(acts);
      parentEl.append(row);

      if (!isCont) return;
      const block = U.el('div', { class: 'tc', role: 'group' });
      parentEl.append(block);
      const renderKids = () => { this.renderChildren(block, v, depth + 1, renderKids); this.updateSummary(valEl, v); };
      if (exp) renderKids();
      const toggle = () => {
        exp = !exp;
        this.expanded.set(v, exp);
        tog.textContent = exp ? '▾' : '▸';
        if (exp) renderKids(); else block.textContent = '';
      };
      tog.addEventListener('click', toggle);
      valEl.addEventListener('click', toggle);
      addBtn.addEventListener('click', () => {
        let focusKey;
        if (Array.isArray(v)) { v.push(''); focusKey = null; } else { focusKey = uniqueKey(v, 'newKey'); v[focusKey] = ''; }
        this.touched();
        this.expanded.set(v, true); exp = true; tog.textContent = '▾';
        this.limits.set(v, Math.max(this.limits.get(v) || CHILD_LIMIT, (Array.isArray(v) ? v.length : Object.keys(v).length)));
        renderKids();
        const rows = block.querySelectorAll(':scope > .tr');
        const last = rows[rows.length - 1];
        if (last) {
          const f = last.querySelector(focusKey ? '.tk-in' : '.tv-in');
          if (f) { f.focus(); if (f.select) f.select(); }
          last.scrollIntoView({ block: 'nearest' });
        }
        this.updateSummary(valEl, v);
      });
    }

    updateSummary(el, v) {
      const n = Array.isArray(v) ? v.length : Object.keys(v).length;
      el.textContent = Array.isArray(v) ? `[ ${n} item${n === 1 ? '' : 's'} ]` : `{ ${n} key${n === 1 ? '' : 's'} }`;
    }

    renameKey(obj, oldK, newK, input, opts) {
      if (newK === oldK) return;
      if (newK === '' || Object.prototype.hasOwnProperty.call(obj, newK)) {
        input.classList.add('invalid');
        U.toast(newK === '' ? 'Keys cannot be empty.' : `Key "${newK}" already exists.`, 'warn');
        input.value = oldK;
        setTimeout(() => input.classList.remove('invalid'), 1500);
        return;
      }
      rebuild(obj, (entries) => entries.map(([k, v]) => [k === oldK ? newK : k, v]));
      this.touched();
      opts.refresh();
    }

    remove(cont, key, opts) {
      if (Array.isArray(cont)) cont.splice(Number(key), 1);
      else delete cont[key];
      this.touched();
      opts.refresh();
    }

    duplicate(cont, key, opts) {
      const clone = structuredClone(cont[key]);
      if (Array.isArray(cont)) cont.splice(Number(key) + 1, 0, clone);
      else {
        const nk = uniqueKey(cont, key + '_copy');
        rebuild(cont, (entries) => entries.flatMap(([k, v]) => (k === key ? [[k, v], [nk, clone]] : [[k, v]])));
      }
      this.touched();
      opts.refresh();
    }

    status() { return this.mode === 'tree' ? 'Tree editor' : 'Source editor'; }
    destroy() { this.el.remove(); }
  }

  CF.viewers.tree = { create: (host, doc, ctx) => new TreeViewer(host, doc, ctx) };
  CF.treeUtil = { typeOf, convert };
})();
