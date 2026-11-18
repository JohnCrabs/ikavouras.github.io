// Monaco editor + tabs + markers + quick fixes.
import { Emitter, h, P, store, askConfirm, toast } from './util.js';
import { fileIcon } from './tree.js';

const monaco = window.monaco;

export class EditorManager extends Emitter {
  constructor(host, tabsEl) {
    super();
    this.tabsEl = tabsEl;
    this.tabs = [];            // [{path, model, saved, viewState}]
    this.active = null;
    this.fs = null;
    this.fixes = new Map();    // model uri -> Map(markerKey -> fixes[])
    this.extToLang = new Map();
    this.nameToLang = new Map();
    for (const l of monaco.languages.getLanguages()) {
      (l.extensions || []).forEach(e => { if (!this.extToLang.has(e.toLowerCase())) this.extToLang.set(e.toLowerCase(), l.id); });
      (l.filenames || []).forEach(f => this.nameToLang.set(f.toLowerCase(), l.id));
    }
    const opts = store.get('editorOpts', {});
    this.editor = monaco.editor.create(host, {
      model: null,
      automaticLayout: true,
      theme: document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: opts.fontSize || 14,
      tabSize: opts.tabSize || 4,
      wordWrap: opts.wordWrap ? 'on' : 'off',
      minimap: { enabled: opts.minimap !== false },
      fontLigatures: true,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: 'active', indentation: true },
      wordBasedSuggestions: 'allDocuments',
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      inlineSuggest: { enabled: true, mode: 'subwordSmart' },
      lightbulb: { enabled: 'on' },
      fixedOverflowWidgets: true,
      renderWhitespace: 'selection',
      stickyScroll: { enabled: true },
      formatOnPaste: false,
      scrollBeyondLastLine: false,
      padding: { top: 6 },
    });
    this.editor.onDidChangeCursorPosition(e => this.emit('cursor', e.position));
    this.editor.onDidChangeModelContent(() => {
      const t = this.activeTab();
      if (t) { this._updateDirty(t); this.emit('change', t.path, t.model); }
    });
    monaco.editor.onDidChangeMarkers(() => this.emit('markers'));
    this._registerQuickFixes();
  }

  setFS(fs) { this.fs = fs; }
  langFor(path) {
    const base = P.basename(path).toLowerCase();
    return this.nameToLang.get(base) || this.extToLang.get(P.ext(path)) || 'plaintext';
  }
  uriFor(path) { return monaco.Uri.file('/' + path); }
  pathFor(uri) { return decodeURIComponent(String(uri.path || '').replace(/^\//, '')); }
  activeTab() { return this.tabs.find(t => t.path === this.active) || null; }
  tab(path) { return this.tabs.find(t => t.path === path) || null; }
  isDirty(t) { return t.model.getAlternativeVersionId() !== t.saved; }
  dirtyPaths() { return new Set(this.tabs.filter(t => this.isDirty(t)).map(t => t.path)); }

  async open(path, pos) {
    let t = this.tab(path);
    if (!t) {
      let content;
      try { content = await this.fs.read(path); }
      catch (e) {
        if (e.binary) { this.emit('binary', path); return null; }
        toast(`Cannot open ${path}: ${e.message}`, 'error');
        return null;
      }
      const uri = this.uriFor(path);
      let model = monaco.editor.getModel(uri);
      if (model) model.setValue(content);
      else model = monaco.editor.createModel(content, this.langFor(path), uri);
      t = { path, model, saved: model.getAlternativeVersionId(), viewState: null };
      this.tabs.push(t);
    }
    this.activate(path);
    if (pos?.line) {
      const p = { lineNumber: pos.line, column: pos.col || 1 };
      this.editor.setPosition(p);
      this.editor.revealPositionInCenter(p);
    }
    this.editor.focus();
    this._persist();
    return t;
  }

  activate(path) {
    const cur = this.activeTab();
    if (cur) cur.viewState = this.editor.saveViewState();
    const t = this.tab(path);
    if (!t) return;
    this.active = path;
    this.editor.setModel(t.model);
    if (t.viewState) this.editor.restoreViewState(t.viewState);
    this.renderTabs();
    this.emit('active', path, t.model);
    this._persist();
  }

  async close(path, force = false) {
    const t = this.tab(path);
    if (!t) return true;
    if (!force && this.isDirty(t)) {
      const ok = await askConfirm('Unsaved changes', `${P.basename(path)} has unsaved changes. Close anyway?`, 'Discard', true);
      if (!ok) return false;
    }
    const idx = this.tabs.indexOf(t);
    this.tabs.splice(idx, 1);
    t.model.dispose();
    if (this.active === path) {
      const next = this.tabs[idx] || this.tabs[idx - 1];
      if (next) this.activate(next.path);
      else { this.active = null; this.editor.setModel(null); this.emit('active', null, null); }
    }
    this.renderTabs();
    this._persist();
    this.emit('dirty', this.dirtyPaths());
    return true;
  }

  async closeAll() {
    for (const t of [...this.tabs]) if (!(await this.close(t.path))) return false;
    return true;
  }

  async save(path = this.active) {
    const t = this.tab(path);
    if (!t) return false;
    try {
      await this.fs.write(t.path, t.model.getValue());
      t.saved = t.model.getAlternativeVersionId();
      this._updateDirty(t);
      this.emit('saved', t.path, t.model);
      return true;
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'error');
      return false;
    }
  }

  async saveAll() {
    for (const t of this.tabs) if (this.isDirty(t)) await this.save(t.path);
  }

  // after rename / delete in the explorer
  renamed(from, to) {
    for (const t of [...this.tabs]) {
      if (t.path === from || t.path.startsWith(from + '/')) {
        const np = to + t.path.slice(from.length);
        const value = t.model.getValue();
        const dirty = this.isDirty(t);
        const old = t.model;
        t.model = monaco.editor.createModel(value, this.langFor(np), this.uriFor(np));
        t.saved = dirty ? -1 : t.model.getAlternativeVersionId();
        if (this.active === t.path) { this.active = np; this.editor.setModel(t.model); }
        t.path = np;
        old.dispose();
      }
    }
    this.renderTabs(); this._persist();
  }
  removed(path) {
    for (const t of [...this.tabs]) if (t.path === path || t.path.startsWith(path + '/')) this.close(t.path, true);
  }

  _updateDirty(t) {
    const el = this.tabsEl.querySelector(`[data-path="${CSS.escape(t.path)}"]`);
    if (el) el.classList.toggle('dirty', this.isDirty(t));
    this.emit('dirty', this.dirtyPaths());
  }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    for (const t of this.tabs) {
      const el = h('div', {
        class: `tab ${t.path === this.active ? 'active' : ''} ${this.isDirty(t) ? 'dirty' : ''}`,
        'data-path': t.path, title: t.path,
        onclick: () => this.activate(t.path),
        onauxclick: e => { if (e.button === 1) this.close(t.path); },
      },
      h('span', {}, fileIcon(t.path)),
      h('span', { class: 'tname' }, P.basename(t.path)),
      h('button', { class: 'tclose', title: 'Close', onclick: e => { e.stopPropagation(); this.close(t.path); } }, h('span', {}, '×')));
      this.tabsEl.append(el);
    }
    this.tabsEl.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  _persist() {
    if (!this.fs) return;
    store.set(`tabs.${this.fs.kind}:${this.fs.name}`, { open: this.tabs.map(t => t.path), active: this.active });
  }
  async restore() {
    if (!this.fs) return;
    const s = store.get(`tabs.${this.fs.kind}:${this.fs.name}`, null);
    if (!s) return;
    for (const p of s.open || []) {
      try { if (await this.fs.exists(p) === 'file') await this.open(p); } catch { /* ignore */ }
    }
    if (s.active && this.tab(s.active)) this.activate(s.active);
  }

  setTheme(light) { monaco.editor.setTheme(light ? 'vs' : 'vs-dark'); }
  setOptions(o) { this.editor.updateOptions(o); }

  // ---------- markers ----------
  setDiagnostics(path, diags, owner = 'cdev') {
    const t = this.tab(path);
    if (!t) return;
    const model = t.model;
    const sev = { error: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning, info: monaco.MarkerSeverity.Info, hint: monaco.MarkerSeverity.Hint };
    const fixMap = new Map();
    const markers = diags.map(d => {
      const line = Math.min(Math.max(1, d.line), model.getLineCount());
      const maxCol = model.getLineMaxColumn(line);
      let col = Math.min(Math.max(1, d.col || 1), maxCol);
      // underline the word at the position (or one character)
      const w = model.getWordAtPosition({ lineNumber: line, column: col });
      let endCol = w ? w.endColumn : col + 1;
      if (endCol > maxCol) { endCol = maxCol; if (col >= maxCol) col = Math.max(1, maxCol - 1); }
      const m = {
        severity: sev[d.severity] || monaco.MarkerSeverity.Warning,
        message: d.message + (d.related?.length ? '\n' + d.related.map(r => `  note (${r.line}:${r.col}): ${r.message}`).join('\n') : ''),
        startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: Math.max(endCol, col),
        source: d.source || 'compiler', code: d.code || undefined,
      };
      if (d.fixes?.length) fixMap.set(`${m.startLineNumber}:${m.startColumn}:${m.message}`, d.fixes);
      return m;
    });
    this.fixes.set(model.uri.toString(), fixMap);
    monaco.editor.setModelMarkers(model, owner, markers);
  }

  allMarkers() {
    return monaco.editor.getModelMarkers({}).filter(m => this.tabs.some(t => t.model.uri.toString() === m.resource.toString()));
  }

  _registerQuickFixes() {
    this.aiFixCmd = this.editor.addCommand(0, (_acc, uri, marker) => this.emit('aiFix', this.pathFor(monaco.Uri.parse(uri)), [marker]), '');
    this.aiExplainCmd = this.editor.addCommand(0, (_acc, uri, marker) => this.emit('aiExplain', this.pathFor(monaco.Uri.parse(uri)), marker), '');
    const self = this;
    const langs = monaco.languages.getLanguages().map(l => l.id);
    monaco.languages.registerCodeActionProvider(langs, {
      provideCodeActions(model, range, context) {
        const actions = [];
        const fixMap = self.fixes.get(model.uri.toString()) || new Map();
        for (const m of context.markers) {
          const fixes = fixMap.get(`${m.startLineNumber}:${m.startColumn}:${m.message}`);
          if (fixes) {
            actions.push({
              title: `Apply compiler fix: ${fixes.map(f => JSON.stringify(f.text)).join(', ')}`,
              kind: 'quickfix', diagnostics: [m], isPreferred: true,
              edit: { edits: fixes.map(f => ({ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: new monaco.Range(f.range[0], f.range[1], f.range[2], f.range[3]), text: f.text } })) },
            });
          }
          if (self.aiEnabled?.()) {
            actions.push({ title: `✨ Fix with AI: ${m.message.split('\n')[0].slice(0, 60)}`, kind: 'quickfix', diagnostics: [m], command: { id: self.aiFixCmd, title: 'Fix with AI', arguments: [model.uri.toString(), m] } });
            actions.push({ title: '✨ Explain this problem', kind: 'quickfix', diagnostics: [m], command: { id: self.aiExplainCmd, title: 'Explain', arguments: [model.uri.toString(), m] } });
          }
        }
        return { actions, dispose() {} };
      },
    });
  }

  // replace whole content keeping undo history
  replaceContent(path, text) {
    const t = this.tab(path);
    if (!t) return;
    t.model.pushStackElement();
    t.model.pushEditOperations([], [{ range: t.model.getFullModelRange(), text }], () => null);
    t.model.pushStackElement();
  }

  insertAtCursor(text) {
    const sel = this.editor.getSelection();
    if (!sel) return;
    this.editor.executeEdits('cdev-ai', [{ range: sel, text, forceMoveMarkers: true }]);
    this.editor.focus();
  }

  selectionText() {
    const m = this.editor.getModel(); const s = this.editor.getSelection();
    return m && s && !s.isEmpty() ? m.getValueInRange(s) : '';
  }
}
