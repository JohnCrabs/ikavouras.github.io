// CDev — application wiring.
import { $, $$, h, store, debounce, toast, modal, askText, askConfirm, contextMenu, copyText, idb, P } from './util.js';
import { Runner } from './runner.js';
import { RunnerFS, BrowserFS, MemoryFS } from './fs.js';
import { Tree } from './tree.js';
import { EditorManager } from './editor.js';
import { ConsoleView } from './console.js';
import { AI, ChatPanel, aiSettingsForm, extractCodeBlocks } from './ai.js';
import { registerLanguageHelpers, registerInlineAI } from './languages.js';
import { Preview, runPythonInBrowser } from './preview.js';
import { openWizard } from './wizard.js';
import { templateFiles } from './templates.js';
import { pickPath } from './picker.js';
import { openRunnerDownload } from './download.js';

const monaco = window.monaco;
const DEFAULT_RUNNER = 'http://127.0.0.1:8787';
const BROWSER_RUNTIME_BY_EXT = { '.html': 'preview', '.htm': 'preview', '.js': 'js', '.mjs': 'js', '.py': 'pyodide' };

class App {
  async init() {
    this.defaults = await fetch('defaults/exec_settings.default.json').then(r => r.json()).catch(() => ({ languages: {}, tools: {} }));
    const schema = await fetch('schema/exec_settings.schema.json').then(r => r.json()).catch(() => null);
    if (schema) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true, allowComments: false, enableSchemaRequest: false,
        schemas: [{ uri: 'https://cdev.local/schema/exec_settings.schema.json', fileMatch: ['**/exec_settings.json', 'exec_settings.json'], schema }],
      });
    }
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ allowNonTsExtensions: true, checkJs: true, allowJs: true, target: monaco.languages.typescript.ScriptTarget.ES2022 });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });

    registerLanguageHelpers();
    this.runner = new Runner();
    this.ai = new AI();
    this.tree = new Tree($('#tree'));
    this.editors = new EditorManager($('#editor'), $('#tabs'));
    this.editors.aiEnabled = () => this.ai.configured();
    registerInlineAI(this.ai, model => this.editors.pathFor(model.uri));
    this.con = new ConsoleView($('#console-out'), $('#console-form'), $('#console-input'), $('#console-prompt'));
    this.preview = new Preview({
      frame: $('#preview-frame'), label: $('#preview-file'),
      readText: p => this.readText(p), readBlob: p => this.fs.readBlob(p),
      onConsole: (level, text) => {
        if (level === 'done') { this.con.line('■ finished (browser sandbox)', 'ok'); return; }
        this.con.write(text + '\n', level === 'error' ? 'err' : level === 'warn' ? 'in' : '');
      },
    });
    this.chat = new ChatPanel(this.ai, {
      messages: $('#ai-messages'), form: $('#ai-form'), input: $('#ai-input'),
      send: $('#btn-ai-send'), stop: $('#btn-ai-stop'), clear: $('#btn-ai-clear'),
    }, () => this.aiContext());

    this.resolveCache = new Map();
    this.checkSeq = {};
    this.proc = null;
    this.scheduleCheck = debounce(p => this.checkFile(p, true), 900);
    this.schedulePreview = debounce(() => this.preview.refresh().catch(() => {}), 500);

    this.bindEvents();
    this.bindUI();
    this.initResizers();
    this.applyLayout();
    this.updateStatus();
    await this.connectInitial();
    $('#boot').remove();
  }

  // ------------------------------------------------------------------ workspace
  async connectInitial() {
    const hash = new URLSearchParams(location.hash.slice(1));
    let target = store.get('runner', null);
    if (hash.get('runner')) {
      target = { url: hash.get('runner'), token: hash.get('token') || '' };
      history.replaceState(null, '', location.pathname + location.search);
    } else if (!target && location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
      target = { url: location.origin, token: '' };
    }
    if (target?.url) {
      const info = await this.runner.connect(target.url, target.token, { silent: true });
      if (info) { await this.setWorkspace(new RunnerFS(this.runner)); return; }
      if (hash.get('runner')) toast('Could not connect to the runner from the link. Is it running?', 'warn');
    }
    this.lastHandle = await idb.get('dirHandle');
    await this.setWorkspace(await this.scratchFS());
  }

  async scratchFS() {
    const fs = new MemoryFS();
    if (!Object.keys(fs.files).length) {
      const web = templateFiles('html', 'web-demo');
      for (const [rel, c] of Object.entries(web.files)) await fs.write(P.join('web-demo', rel), c);
      await fs.write('python-demo/main.py', templateFiles('python').files['main.py']);
      await fs.write('js-demo/index.js', templateFiles('javascript').files['index.js']);
    }
    return fs;
  }

  async setWorkspace(fs) {
    if (this.fs && !(await this.editors.closeAll())) return false;
    this.fs = fs;
    this.resolveCache.clear();
    this.editors.setFS(fs);
    await this.tree.setFS(fs);
    $('#ws-name').textContent = fs.name.toUpperCase();
    $('#ws-name').title = fs.kind === 'runner' ? this.runner.info.root : fs.name;
    await this.editors.restore();
    this.updateWelcome();
    this.updateStatus();
    this.updateButtons();
    return true;
  }

  async readText(path) {
    const t = this.editors.tab(path);
    return t ? t.model.getValue() : this.fs.read(path);
  }

  async afterProjectCreated(dir, mainFile, runSetup) {
    this.resolveCache.clear();
    await this.tree.refresh(P.dirname(dir));
    await this.tree.toggle(dir, true);
    if (mainFile) { await this.tree.reveal(mainFile); await this.editors.open(mainFile); }
    if (runSetup && this.runner.connected && mainFile) {
      this.con.line('Creating Python virtual environment (.venv)…', 'info');
      await this.startProc({ file: mainFile, action: 'setup' });
    }
  }

  // ------------------------------------------------------------------ events
  bindEvents() {
    const ed = this.editors;
    this.tree.on('open', p => ed.open(p));
    this.tree.on('context', e => this.treeMenu(e));
    this.tree.on('newProject', d => this.newProject(d));
    this.tree.on('delete', p => this.deletePath(p));
    this.tree.on('rename', p => this.renamePath(p));

    ed.on('active', path => {
      this.tree.setActive(path);
      this.updateWelcome(); this.updateStatus(); this.updateButtons(); this.renderProblems();
      if (path && P.ext(path).match(/^\.html?$/) && this.activePanel === 'preview') this.preview.show(path).catch(() => {});
      if (path) this.scheduleCheck(path);
    });
    ed.on('change', (path) => {
      this.scheduleCheck(path);
      if (this.activePanel === 'preview' && $('#preview-auto').checked && this.preview.path) {
        const ext = P.ext(path);
        if (path === this.preview.path || ['.css', '.js'].includes(ext)) this.schedulePreview();
      }
    });
    ed.on('saved', path => {
      if (P.basename(path) === 'exec_settings.json') { this.resolveCache.clear(); this.updateButtons(); toast('exec_settings.json reloaded', 'ok', 1500); }
      this.resolveCache.get(path)?.then(i => { if (i?.checkOnSaved) this.checkFile(path, false); });
      this.tree.refresh(P.dirname(path));
    });
    ed.on('dirty', set => this.tree.setDirty(set));
    ed.on('cursor', pos => { $('#sb-pos').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`; });
    ed.on('markers', debounce(() => this.renderProblems(), 120));
    ed.on('binary', p => toast(`${P.basename(p)} is a binary file and cannot be edited.`, 'warn'));
    ed.on('aiFix', (path, markers) => this.aiFix(path, markers));
    ed.on('aiExplain', (path, m) => this.aiExplain(path, m));

    const E = ed.editor;
    E.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => this.save());
    E.addCommand(monaco.KeyCode.F5, () => this.run('run'));
    E.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F5, () => this.stopProc());
    E.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyB, () => this.run('build'));
    E.addAction({ id: 'cdev.ai.explain', label: '✨ AI: Explain selection / file', contextMenuGroupId: '9_cdev', run: () => this.aiAsk('Explain what this code does, step by step.') });
    E.addAction({ id: 'cdev.ai.refactor', label: '✨ AI: Improve / refactor selection', contextMenuGroupId: '9_cdev', run: () => this.aiAsk('Suggest an improved version of the selected code (readability, correctness, performance). Return the complete updated file in one code block.') });
    E.addAction({ id: 'cdev.ai.fixall', label: '✨ AI: Fix all problems in file', contextMenuGroupId: '9_cdev', run: () => this.aiFixAll() });
    E.addAction({ id: 'cdev.ai.tests', label: '✨ AI: Write tests for this code', contextMenuGroupId: '9_cdev', run: () => this.aiAsk('Write unit tests for this code using the most common test framework for the language.') });

    this.con.on('stdin', data => this.proc && this.runner.post('/api/proc/stdin', { id: this.proc.id, data }).catch(e => toast(e.message, 'error')));
    this.con.on('eof', () => this.proc && this.runner.post('/api/proc/stdin', { id: this.proc.id, data: '', eof: true }).catch(() => {}));
    this.con.on('interrupt', () => this.stopProc());
    this.con.on('shell', cmd => this.shell(cmd));
    this.con.on('link', l => this.openLink(l));

    this.chat.on('needsConfig', () => this.openSettings('ai'));
    this.chat.on('insert', code => { if (!this.editors.active) return toast('Open a file first', 'warn'); this.editors.insertAtCursor(code); });
    this.chat.on('apply', code => { if (!this.editors.active) return toast('Open a file first', 'warn'); this.showDiff(this.editors.active, code); });
    this.ai.on('config', () => this.updateStatus());

    this.runner.on('status', on => {
      this.updateStatus(); this.updateButtons();
      if (!on && this.fs?.kind === 'runner') toast('Lost connection to the local runner.', 'warn');
    });

    window.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); this.save(); }
      else if (e.key === 'F5' && !e.shiftKey) { e.preventDefault(); this.run('run'); }
      else if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); this.stopProc(); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'b') { e.preventDefault(); this.run('build'); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'a') { e.preventDefault(); this.toggleAI(); }
      else if ((e.ctrlKey || e.metaKey) && k === '`') { e.preventDefault(); this.togglePanel(); }
    });
    window.addEventListener('beforeunload', e => { if (this.editors.dirtyPaths().size) { e.preventDefault(); e.returnValue = ''; } });
  }

  bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('#btn-open', () => this.openFolder());
    on('#btn-new-project', () => this.newProject(this.tree.targetDir()));
    on('#btn-save', () => this.save());
    on('#btn-run', () => this.run('run'));
    on('#btn-build', () => this.run('build'));
    on('#btn-check', () => this.run('check'));
    on('#btn-setup', () => this.run('setup'));
    on('#btn-stop', () => this.stopProc());
    on('#btn-runner', () => this.openRunnerDialog());
    on('#btn-download-runner', () => openRunnerDownload());
    on('#sb-runner', () => this.openRunnerDialog());
    on('#btn-ai', () => this.toggleAI());
    on('#btn-ai-close', () => this.toggleAI(false));
    on('#btn-settings', () => this.openSettings());
    on('#btn-theme', () => this.toggleTheme());
    on('#btn-help', () => this.openHelp());
    on('#btn-new-file', () => this.newFile(this.tree.targetDir()));
    on('#btn-new-folder', () => this.newFolder(this.tree.targetDir()));
    on('#btn-refresh', () => { this.resolveCache.clear(); this.tree.refresh(); });
    on('#btn-project-settings', () => this.openProjectSettings());
    on('#btn-clear-console', () => this.con.clear());
    on('#btn-toggle-panel', () => this.togglePanel());
    on('#btn-preview-refresh', () => this.preview.refresh());
    on('#btn-preview-pop', () => this.preview.popOut());
    on('#btn-ai-fix-all', () => this.aiFixAll());
    on('#sb-inline', () => { this.ai.save({ inline: !this.ai.cfg.inline }); toast(`AI inline completions ${this.ai.cfg.inline ? 'on' : 'off'}`, 'info', 1500); });
    $('.brand').addEventListener('click', () => document.body.classList.toggle('show-side'));
    for (const b of $$('.ptab')) b.addEventListener('click', () => this.showPanel(b.dataset.ptab));
  }

  // ------------------------------------------------------------------ layout
  initResizers() {
    for (const r of $$('.resizer')) {
      r.addEventListener('pointerdown', e => {
        e.preventDefault();
        r.setPointerCapture(e.pointerId);
        r.classList.add('dragging');
        const kind = r.dataset.resize;
        const move = ev => {
          const L = store.get('layout', {});
          if (kind === 'sidebar') L.sidebar = Math.max(140, Math.min(600, ev.clientX));
          if (kind === 'ai') L.ai = Math.max(260, Math.min(900, innerWidth - ev.clientX));
          if (kind === 'panel') L.panel = Math.max(60, Math.min(innerHeight - 160, innerHeight - 24 - ev.clientY));
          store.set('layout', L); this.applyLayout();
        };
        const up = () => { r.classList.remove('dragging'); r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); };
        r.addEventListener('pointermove', move);
        r.addEventListener('pointerup', up);
      });
    }
  }

  applyLayout() {
    const L = store.get('layout', {});
    const root = document.documentElement.style;
    if (L.sidebar) root.setProperty('--sidebar-w', L.sidebar + 'px');
    if (L.ai) root.setProperty('--ai-w', L.ai + 'px');
    if (L.panel) root.setProperty('--panel-h', L.panel + 'px');
    $('#panel').classList.toggle('collapsed', !!L.panelCollapsed);
    $('#btn-toggle-panel').textContent = L.panelCollapsed ? '▴' : '▾';
    this.toggleAI(!!L.aiOpen, false);
  }

  togglePanel(force) {
    const L = store.get('layout', {});
    L.panelCollapsed = force != null ? !force : !L.panelCollapsed;
    store.set('layout', L); this.applyLayout();
  }

  showPanel(name) {
    this.activePanel = name;
    for (const b of $$('.ptab')) b.classList.toggle('active', b.dataset.ptab === name);
    for (const v of $$('.pview')) v.classList.toggle('active', v.dataset.pview === name);
    if (store.get('layout', {}).panelCollapsed) this.togglePanel(true);
    if (name === 'preview') {
      const a = this.editors.active;
      if (a && /\.html?$/i.test(a)) this.preview.show(a).catch(e => toast(e.message, 'error'));
    }
    if (name === 'console') $('#console-input').focus();
  }

  toggleAI(force, persist = true) {
    const panel = $('#ai-panel');
    const open = force != null ? force : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    document.body.classList.toggle('no-ai', !open);
    $('#btn-ai').classList.toggle('active', open);
    if (persist) { const L = store.get('layout', {}); L.aiOpen = open; store.set('layout', L); }
    if (open && persist) setTimeout(() => $('#ai-input').focus(), 30);
  }

  toggleTheme() {
    const light = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    store.set('theme', light ? 'light' : 'dark');
    this.editors.setTheme(light);
  }

  updateWelcome() {
    const w = $('#welcome');
    const show = !this.editors.active;
    w.classList.toggle('show', show);
    if (!show) return;
    const fsInfo = this.fs?.kind === 'runner' ? `Workspace: ${this.runner.info.root}` : this.fs?.kind === 'browser' ? `Folder: ${this.fs.name} (browser access — editing only)` : 'Scratch workspace stored in this browser';
    const card = (icon, title, text, fn) => h('button', { class: 'card', onclick: fn }, h('b', {}, `${icon} ${title}`), h('small', {}, text));
    w.innerHTML = '';
    w.append(h('div', { class: 'welcome' },
      h('h1', {}, 'CDev'),
      h('p', {}, 'A lightweight editor in your browser that builds and runs code with the compilers on your own machine (or USB drive).'),
      h('p', {}, h('small', {}, fsInfo)),
      h('div', { class: 'cards' },
        card('✨', 'New project', 'C, C++, Python, Java, Rust, Go, JS, HTML… with exec_settings.json', () => this.newProject(this.tree.targetDir())),
        this.runner.connected ? null : card('⬇', 'Download runner', 'Small local helper that runs your compilers (needs Python)', () => openRunnerDownload()),
        card('🔌', this.runner.connected ? 'Runner connected' : 'Connect local runner', this.runner.connected ? this.runner.url : 'Already started the runner? Connect here', () => this.openRunnerDialog()),
        card('📂', 'Open folder', BrowserFS.supported() ? 'Edit a local folder (Chrome / Edge)' : 'Use the runner to open folders', () => this.openFolder()),
        this.lastHandle && this.fs?.kind !== 'browser' ? card('↩', `Reopen “${this.lastHandle.name}”`, 'Last opened browser folder', () => this.reopenHandle()) : null,
        card('🤖', 'AI assistant', this.ai.configured() ? `Using ${this.ai.cfg.model}` : 'Add a Claude API key or a local model', () => this.ai.configured() ? this.toggleAI(true) : this.openSettings('ai'))),
      h('h3', {}, 'How running works'),
      h('ol', {},
        h('li', {}, h('b', {}, '⬇ Download runner'), ' (you will see what it does and give your consent), unzip it.'),
        h('li', {}, 'Double-click ', h('code', {}, 'start_cdev.bat'), ' (Windows) or run ', h('code', {}, './start_cdev.sh'), ' — this page opens already connected.'),
        h('li', {}, 'Each project has an ', h('code', {}, 'exec_settings.json'), ' with the compiler / interpreter paths (relative or absolute) and the build / run / check commands.'),
        h('li', {}, 'Without the runner you can still edit, preview HTML, and run JavaScript & Python in the browser.'))));
  }

  // ------------------------------------------------------------------ status
  async updateStatus() {
    const on = this.runner.connected;
    $('#btn-runner').classList.toggle('on', on);
    $('#runner-label').textContent = on ? 'Runner: on' : 'Runner: off';
    $('#sb-runner').textContent = on ? `● runner ${this.runner.url.replace(/^https?:\/\//, '')}` : '○ local runner: off (click to connect)';
    $('#sb-inline').textContent = this.ai.configured() ? `✨ inline ${this.ai.cfg.inline ? 'on' : 'off'}` : '';
    $('#ai-model-label').textContent = this.ai.configured() ? this.ai.cfg.model : 'not configured';
    this.con.shellEnabled = on;
    this.con.setMode(this.proc ? 'stdin' : 'shell');
    const path = this.editors.active;
    const tab = this.editors.activeTab();
    $('#sb-lang').textContent = tab ? tab.model.getLanguageId() : '';
    $('#sb-project').textContent = '';
    if (path && on) {
      const info = await this.resolve(path);
      if (info && this.editors.active === path) {
        $('#sb-project').textContent = `📁 ${info.projectDir || '/'}${info.settingsFile ? '' : ' (default settings)'}`;
        $('#sb-project').title = info.settingsFile ? `Using ${info.settingsFile}` : 'No exec_settings.json found — using built-in defaults';
        if (info.label) $('#sb-lang').textContent = `${tab.model.getLanguageId()} · ${info.label}`;
      }
    }
  }

  resolve(path) {
    if (!this.runner.connected || this.fs?.kind !== 'runner') return Promise.resolve(null);
    if (!this.resolveCache.has(path)) {
      this.resolveCache.set(path, this.runner.post('/api/resolve', { file: path }).catch(e => { this.resolveCache.delete(path); return { error: e.message, commands: {} }; }));
    }
    return this.resolveCache.get(path);
  }

  async updateButtons() {
    const path = this.editors.active;
    const set = (id, en, title) => { const b = $(id); b.disabled = !en; if (title) b.title = title; };
    $('#btn-stop').disabled = !this.proc;
    if (!path) { ['#btn-run', '#btn-build', '#btn-check', '#btn-setup'].forEach(i => set(i, false)); return; }
    const rt = BROWSER_RUNTIME_BY_EXT[P.ext(path)];
    if (this.runner.connected && this.fs.kind === 'runner') {
      const info = await this.resolve(path);
      if (this.editors.active !== path) return;
      const c = info?.commands || {};
      set('#btn-run', !!(c.run || info?.preview || rt), c.run ? `Run (F5): ${c.run}` : info?.preview ? 'Show preview (F5)' : 'Run (F5)');
      set('#btn-build', !!c.build, c.build ? `Build: ${c.build}` : 'No build command for this file');
      set('#btn-check', !!c.check || ['javascript', 'typescript', 'json', 'css', 'html'].includes(this.editors.activeTab()?.model.getLanguageId()), c.check ? `Check: ${c.check}` : 'Check for errors');
      set('#btn-setup', !!c.setup, c.setup ? `Setup: ${c.setup}` : 'No setup command');
    } else {
      set('#btn-run', !!rt, rt ? 'Run in the browser (F5)' : 'Connect the local runner to run this file');
      set('#btn-build', false, 'Connect the local runner to build');
      set('#btn-check', true, 'Check for errors');
      set('#btn-setup', false, 'Connect the local runner');
    }
  }

  // ------------------------------------------------------------------ running
  async save() {
    if (!this.editors.active) return;
    if (await this.editors.save()) toast(`Saved ${P.basename(this.editors.active)}`, 'ok', 1200);
  }

  async run(action) {
    const path = this.editors.active;
    if (!path) return toast('Open a file first', 'warn');
    await this.editors.saveAll();
    if (action === 'check') return this.checkFile(path, false, true);
    const rt = BROWSER_RUNTIME_BY_EXT[P.ext(path)];
    const runnerMode = this.runner.connected && this.fs.kind === 'runner';
    if (runnerMode) {
      const info = await this.resolve(path);
      if (action === 'run' && info?.preview) return this.showPanel('preview');
      if (info?.commands?.[action]) return this.startProc({ file: path, action });
      if (action === 'run' && rt) return this.runInBrowser(path, rt);
      return toast(info?.error || `No "${action}" command for ${P.basename(path)}. Add it to exec_settings.json (🛠 button).`, 'warn', 6000);
    }
    if (action === 'run' && rt) return this.runInBrowser(path, rt);
    this.runnerNeeded();
  }

  async runInBrowser(path, rt) {
    if (rt === 'preview') return this.showPanel('preview');
    const code = await this.readText(path);
    this.showPanel('console');
    this.con.line(`▶ ${P.basename(path)} (${rt === 'js' ? 'browser JavaScript sandbox' : 'Python in the browser via Pyodide'})`, 'cmd');
    if (rt === 'js') { this.preview.runJs(code, path); return; }
    const t0 = performance.now();
    const code0 = await runPythonInBrowser(code, this.con);
    this.con.line(`■ exited with code ${code0} in ${((performance.now() - t0) / 1000).toFixed(2)}s`, code0 ? 'err' : 'ok');
  }

  runnerNeeded() {
    modal({
      title: '🔌 Local runner needed',
      body: h('div', {}, h('p', {}, 'Compiling and running native code happens on your computer through the small CDev runner (Python, no installation).'),
        h('ol', {},
          h('li', {}, 'Download the runner (⬇ Download runner) and unzip it.'),
          h('li', {}, 'Double-click start_cdev.bat (Windows) or run ./start_cdev.sh.'),
          h('li', {}, 'This page opens connected to it. Already running? Click Connect.'))),
      buttons: [
        { label: 'Close' },
        { label: '⬇ Download runner', onClick: () => setTimeout(() => openRunnerDownload()) },
        { label: 'Connect…', primary: true, onClick: () => setTimeout(() => this.openRunnerDialog()) },
      ],
    });
  }

  async startProc(body) {
    if (this.proc) await this.stopProc(true);
    this.showPanel('console');
    let r;
    try { r = await this.runner.post('/api/run', body); }
    catch (e) { this.con.line('✖ ' + e.message, 'err'); return; }
    this.con.line(`▶ ${r.command}`, 'cmd');
    const proc = { id: r.id, command: r.command };
    this.proc = proc;
    $('#proc-info').textContent = `running: ${r.command}`;
    this.updateStatus(); this.updateButtons();
    $('#console-input').focus();
    await new Promise(resolve => {
      proc.stream = this.runner.stream(r.id, ev => {
        if (ev.type === 'out') this.con.write(ev.data);
        else if (ev.type === 'err') this.con.write(ev.data, 'err');
        else if (ev.type === 'exit') {
          this.con.line(`■ exited with code ${ev.data} in ${ev.elapsed}s`, ev.data === 0 ? 'ok' : 'err');
          if (this.proc === proc) { this.proc = null; $('#proc-info').textContent = ''; this.updateStatus(); this.updateButtons(); }
          resolve(ev.data);
        }
      });
    });
    if (body.action === 'setup') { this.resolveCache.clear(); this.tree.refresh(); }
  }

  async stopProc(silent) {
    const p = this.proc;
    if (!p) return;
    try { await this.runner.post('/api/proc/kill', { id: p.id }); } catch { /* ignore */ }
    if (!silent) this.con.line('■ stopped', 'err');
  }

  async shell(cmd) {
    if (!this.runner.connected || this.fs.kind !== 'runner') { this.con.line('Connect the local runner to run shell commands.', 'err'); return; }
    if (cmd.trim() === 'clear' || cmd.trim() === 'cls') return this.con.clear();
    if (cmd.trim() === 'cd -') { this.shellCwd = null; return this.con.line('(shell commands run in the current file\'s folder)', 'info'); }
    const file = this.editors.active;
    if (this.shellCwd != null) await this.startProc({ action: 'shell', command: cmd, cwd: this.shellCwd });
    else await this.startProc(file ? { action: 'shell', command: cmd, file } : { action: 'shell', command: cmd, cwd: this.tree.targetDir() });
  }

  async openLink({ file, line, col }) {
    let p = file.replace(/\\/g, '/');
    if (this.runner.connected) {
      const root = this.runner.info.root.replace(/\\/g, '/');
      if (p.toLowerCase().startsWith(root.toLowerCase() + '/')) p = p.slice(root.length + 1);
      else if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) {
        const info = this.editors.active ? await this.resolve(this.editors.active) : null;
        const proj = (info?.projectDirAbs || '').replace(/\\/g, '/');
        if (proj && p.toLowerCase().startsWith(proj.toLowerCase() + '/')) p = P.join(info.projectDir, p.slice(proj.length + 1));
        else return toast('File is outside the workspace: ' + file, 'warn');
      } else if (this.editors.active) {
        const info = await this.resolve(this.editors.active);
        if (info && await this.fs.exists(P.join(info.projectDir, p)) === 'file') p = P.join(info.projectDir, p);
      }
    }
    if (await this.fs.exists(p) !== 'file') {
      const active = this.editors.active;
      if (active && P.basename(active) === P.basename(p)) p = active;
      else return toast('Cannot find ' + file, 'warn');
    }
    this.editors.open(P.norm(p), { line, col });
  }

  // ------------------------------------------------------------------ diagnostics
  async checkFile(path, live, explicit = false) {
    const tab = this.editors.tab(path);
    if (!tab) return;
    if (!this.runner.connected || this.fs.kind !== 'runner') {
      if (explicit) { this.showPanel('problems'); toast('Built-in checks only (JS/TS/CSS/HTML/JSON). Connect the runner for compiler checks.', 'info'); }
      return;
    }
    const info = await this.resolve(path);
    if (!info?.commands?.check) {
      if (explicit) { this.showPanel('problems'); toast(`No "check" command for ${P.basename(path)} in exec_settings.json`, 'info'); }
      return;
    }
    if (live && info.checkOnSaved) return;
    const seq = (this.checkSeq[path] = (this.checkSeq[path] || 0) + 1);
    const sb = $('#sb-check');
    sb.textContent = '⟳ checking…';
    try {
      const r = await this.runner.post('/api/check', { file: path, content: info.checkOnSaved ? undefined : tab.model.getValue() });
      if (seq !== this.checkSeq[path] || !this.editors.tab(path)) return;
      if (r.error) { sb.textContent = '⚠ check failed'; sb.title = r.error; if (explicit) toast('Check failed:\n' + r.error, 'error', 8000); }
      else {
        const errs = r.diagnostics.filter(d => d.severity === 'error').length;
        const warns = r.diagnostics.filter(d => d.severity === 'warning').length;
        sb.textContent = errs || warns ? `✖ ${errs}  ⚠ ${warns}` : '✔ no problems';
        sb.title = r.command || '';
      }
      this.editors.setDiagnostics(path, r.diagnostics || []);
      if (explicit) this.showPanel('problems');
    } catch (e) {
      if (seq === this.checkSeq[path]) { sb.textContent = '⚠ check error'; sb.title = e.message; }
    }
  }

  renderProblems() {
    const list = $('#problems-list');
    const markers = this.editors.allMarkers();
    const errs = markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length;
    const badge = $('#problems-count');
    badge.textContent = markers.length;
    badge.classList.toggle('err', errs > 0);
    list.innerHTML = '';
    if (!markers.length) { list.append(h('div', { class: 'prob-empty' }, 'No problems detected in open files.')); return; }
    const byFile = new Map();
    for (const m of markers) { const p = this.editors.pathFor(m.resource); (byFile.get(p) || byFile.set(p, []).get(p)).push(m); }
    const icon = s => (s === monaco.MarkerSeverity.Error ? '⛔' : s === monaco.MarkerSeverity.Warning ? '⚠️' : 'ℹ️');
    for (const [p, ms] of byFile) {
      list.append(h('div', { class: 'prob-file' }, `${p} (${ms.length})`));
      ms.sort((a, b) => b.severity - a.severity || a.startLineNumber - b.startLineNumber);
      for (const m of ms) {
        list.append(h('div', { class: 'prob', onclick: () => this.editors.open(p, { line: m.startLineNumber, col: m.startColumn }) },
          h('span', { class: 'sev' }, icon(m.severity)),
          h('span', {}, m.message.split('\n')[0]),
          h('span', { class: 'loc' }, `[${m.startLineNumber}:${m.startColumn}]`),
          h('span', { class: 'src' }, m.source || m.owner || ''),
          this.ai.configured() ? h('button', { class: 'mini ai', title: 'Fix with AI', onclick: e => { e.stopPropagation(); this.aiFix(p, [m]); } }, '✨') : null));
      }
    }
  }

  // ------------------------------------------------------------------ AI
  aiContext() {
    const parts = [];
    const t = this.editors.activeTab();
    if (t && $('#ai-ctx-file').checked) {
      let content = t.model.getValue();
      if (content.length > 80000) content = content.slice(0, 80000) + '\n/* … truncated … */';
      parts.push(`Current file: ${t.path} (${t.model.getLanguageId()})\n\`\`\`${t.model.getLanguageId()}\n${content}\n\`\`\``);
    }
    const sel = this.editors.editor.getSelection();
    if (t && $('#ai-ctx-sel').checked && sel && !sel.isEmpty()) {
      parts.push(`Selected lines ${sel.startLineNumber}-${sel.endLineNumber}:\n\`\`\`\n${t.model.getValueInRange(sel)}\n\`\`\``);
    }
    if (t && $('#ai-ctx-problems').checked) {
      const ms = monaco.editor.getModelMarkers({ resource: t.model.uri });
      if (ms.length) parts.push('Problems reported by the editor/compiler:\n' + ms.slice(0, 50).map(m => `- line ${m.startLineNumber}:${m.startColumn} ${['', 'hint', 'info', '', 'warning', '', '', '', 'error'][m.severity] || ''}: ${m.message}`).join('\n'));
    }
    if ($('#ai-ctx-console').checked) {
      const txt = $('#console-out').innerText.slice(-4000);
      if (txt.trim()) parts.push('Recent console output:\n```\n' + txt + '\n```');
    }
    return parts.join('\n\n');
  }

  aiReady() {
    if (this.ai.configured()) return true;
    this.openSettings('ai');
    return false;
  }

  aiAsk(text) {
    if (!this.aiReady()) return;
    this.toggleAI(true);
    this.chat.send(text);
  }

  async aiFix(path, markers) {
    if (!this.aiReady()) return;
    const t = this.editors.tab(path) || await this.editors.open(path);
    if (!t) return;
    this.toggleAI(true);
    const lang = t.model.getLanguageId();
    const probs = markers.map(m => `- line ${m.startLineNumber}, col ${m.startColumn}: ${m.message}`).join('\n');
    const prompt = `Fix the following problem(s) in \`${path}\`:\n${probs}\n\nFile content:\n\`\`\`${lang}\n${t.model.getValue()}\n\`\`\`\n\n` +
      'Return the COMPLETE corrected file in a single fenced code block, then one short sentence explaining the fix. Change only what is needed.';
    await this.chat.send(prompt, {
      attachContext: false,
      onDone: out => {
        const blocks = extractCodeBlocks(out);
        if (!blocks.length) return;
        const best = blocks.reduce((a, b) => (b.code.length > a.code.length ? b : a));
        this.showDiff(path, best.code);
      },
    });
  }

  aiFixAll() {
    const t = this.editors.activeTab();
    if (!t) return toast('Open a file first', 'warn');
    const ms = monaco.editor.getModelMarkers({ resource: t.model.uri }).filter(m => m.severity >= monaco.MarkerSeverity.Warning);
    if (!ms.length) return toast('No problems in the current file', 'info');
    this.aiFix(t.path, ms);
  }

  aiExplain(path, m) {
    if (!this.aiReady()) return;
    const t = this.editors.tab(path);
    if (!t) return;
    const from = Math.max(1, m.startLineNumber - 6), to = Math.min(t.model.getLineCount(), m.startLineNumber + 6);
    const snippet = Array.from({ length: to - from + 1 }, (_, i) => `${from + i}: ${t.model.getLineContent(from + i)}`).join('\n');
    this.toggleAI(true);
    this.chat.send(`Explain this ${t.model.getLanguageId()} problem in simple terms and how to fix it.\n\nFile: ${path}\nProblem at line ${m.startLineNumber}: ${m.message}\n\n\`\`\`\n${snippet}\n\`\`\``, { attachContext: false });
  }

  showDiff(path, code) {
    const t = this.editors.tab(path);
    if (!t) return;
    const host = h('div', { class: 'diff-host' });
    const lang = t.model.getLanguageId();
    const original = monaco.editor.createModel(t.model.getValue(), lang);
    const modified = monaco.editor.createModel(code, lang);
    let diff;
    modal({
      title: `Review AI changes — ${path}`, body: host, size: 'xwide',
      buttons: [
        { label: 'Discard' },
        { label: 'Accept changes', primary: true, onClick: () => { this.editors.replaceContent(path, modified.getValue()); toast('Changes applied (Ctrl+Z to undo)', 'ok'); } },
      ],
      onClose: () => { diff?.dispose(); original.dispose(); modified.dispose(); },
    });
    diff = monaco.editor.createDiffEditor(host, {
      automaticLayout: true, renderSideBySide: innerWidth > 900, originalEditable: false, readOnly: false,
      fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false,
    });
    diff.setModel({ original, modified });
  }

  // ------------------------------------------------------------------ files
  async newFile(dir) {
    const name = await askText('New file', `File name (in /${dir})`, 'main.c');
    if (!name) return;
    const p = P.join(dir, name);
    try {
      if (await this.fs.exists(p)) return toast('Already exists', 'error');
      await this.fs.write(p, '');
      await this.tree.refresh(P.dirname(p));
      await this.tree.reveal(p);
      this.editors.open(p);
    } catch (e) { toast(e.message, 'error'); }
  }

  async newFolder(dir) {
    const name = await askText('New folder', `Folder name (in /${dir})`, '');
    if (!name) return;
    try { await this.fs.mkdir(P.join(dir, name)); await this.tree.refresh(dir); } catch (e) { toast(e.message, 'error'); }
  }

  async renamePath(p) {
    const name = await askText('Rename', 'New name', P.basename(p));
    if (!name || name === P.basename(p)) return;
    const to = P.join(P.dirname(p), name);
    try {
      await this.fs.rename(p, to);
      this.editors.renamed(p, to);
      this.resolveCache.clear();
      await this.tree.refresh(P.dirname(p));
    } catch (e) { toast(e.message, 'error'); }
  }

  async deletePath(p) {
    if (!(await askConfirm('Delete', `Delete "${p}"? This cannot be undone.`, 'Delete', true))) return;
    try {
      await this.fs.remove(p);
      this.editors.removed(p);
      this.resolveCache.clear();
      await this.tree.refresh(P.dirname(p));
    } catch (e) { toast(e.message, 'error'); }
  }

  treeMenu({ path, type, x, y }) {
    const dir = type === 'dir' ? path : P.dirname(path);
    contextMenu(x, y, [
      type === 'file' ? { label: '📄 Open', action: () => this.editors.open(path) } : null,
      type === 'file' ? { label: '▶ Run', action: async () => { await this.editors.open(path); this.run('run'); } } : null,
      { label: '＋ New file', action: () => this.newFile(dir) },
      { label: '＋ New folder', action: () => this.newFolder(dir) },
      { label: '✨ New project here', action: () => this.newProject(dir) },
      type === 'dir' && this.runner.connected ? { label: '⌨ Open terminal here', action: () => { this.showPanel('console'); this.shellCwd = path; this.con.line(`(shell commands now run in /${path} — type "cd -" to go back to the file's folder)`, 'info'); } } : null,
      '-',
      path ? { label: '✏️ Rename (F2)', action: () => this.renamePath(path) } : null,
      path ? { label: '🗑 Delete', action: () => this.deletePath(path) } : null,
      { label: '📋 Copy path', action: () => copyText(this.runner.connected ? (this.runner.info.root.replace(/[\\/]$/, '') + this.runner.info.sep + path.replace(/\//g, this.runner.info.sep)) : path) },
      { label: '⟳ Refresh', action: () => this.tree.refresh() },
    ]);
  }

  newProject(dir) { openWizard({ app: this, defaults: this.defaults, parentDir: dir || '' }); }

  async openProjectSettings() {
    const start = this.editors.active ? P.dirname(this.editors.active) : this.tree.targetDir();
    let d = start;
    while (true) {
      const cand = P.join(d, 'exec_settings.json');
      if (await this.fs.exists(cand) === 'file') return this.editors.open(cand);
      if (!d) break;
      d = P.dirname(d);
    }
    const target = start.split('/')[0] ? start : '';
    if (!(await askConfirm('No exec_settings.json', `No exec_settings.json found above /${start}. Create one in /${target || '(root)'}?`, 'Create'))) return;
    const s = { $schema: new URL('schema/exec_settings.schema.json', location.href).href, version: 1, pathMode: 'relative', tools: {}, languages: {} };
    const p = P.join(target, 'exec_settings.json');
    await this.fs.write(p, JSON.stringify(s, null, 2) + '\n');
    this.resolveCache.clear();
    await this.tree.refresh(target);
    this.editors.open(p);
  }

  async openFolder() {
    if (this.runner.connected) {
      const cur = this.runner.info.root;
      const choice = await new Promise(res => {
        const input = h('input', { value: cur, autofocus: true, style: { width: '100%' } });
        let r = null;
        modal({
          title: '📂 Open folder', body: h('div', { class: 'form' },
            h('div', { class: 'f' }, h('label', { class: 'f' }, h('span', {}, 'Folder on this computer (runner workspace)')),
              h('div', { class: 'row' }, input, h('button', {
                class: 'mini', type: 'button',
                onclick: async () => { const p = await pickPath({ app: this, scope: 'abs', select: 'dir', start: input.value.trim(), title: '📂 Choose workspace folder' }); if (p) input.value = p; },
              }, '📂 Browse…')),
              h('span', { class: 'hint' }, 'Full path, e.g. D:\\Projects or E:/USB/code. Everything in it can be edited and run.'))),
          buttons: [
            BrowserFS.supported() ? { label: 'Browser folder (edit only)…', onClick: () => { r = { browser: true }; } } : null,
            { label: 'Cancel' },
            { label: 'Open', primary: true, onClick: () => { r = { path: input.value.trim() }; } },
          ].filter(Boolean),
          onClose: () => res(r),
        });
      });
      if (!choice) return;
      if (choice.path) {
        try {
          if (!(await this.editors.closeAll())) return;
          this.runner.info = await this.runner.post('/api/root/set', { path: choice.path });
          await this.setWorkspace(new RunnerFS(this.runner));
        } catch (e) { toast(e.message, 'error'); }
        return;
      }
    }
    if (!BrowserFS.supported()) return toast('This browser cannot open local folders. Use Chrome/Edge, or connect the runner.', 'warn', 6000);
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idb.set('dirHandle', handle);
      this.lastHandle = handle;
      await this.setWorkspace(new BrowserFS(handle));
      if (this.runner.connected) toast('Browser folders can be edited but not run. Use “Open folder” with a path to run code via the runner.', 'info', 7000);
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
  }

  async reopenHandle() {
    const fs = new BrowserFS(this.lastHandle);
    try { if (!(await fs.verifyPermission())) return toast('Permission denied', 'error'); }
    catch (e) { return toast(e.message, 'error'); }
    await this.setWorkspace(fs);
  }

  // ------------------------------------------------------------------ dialogs
  openRunnerDialog() {
    const saved = store.get('runner', {});
    const url = h('input', { value: this.runner.url || saved.url || DEFAULT_RUNNER });
    const token = h('input', { value: this.runner.token || saved.token || '', placeholder: 'printed by the runner at start', type: 'password' });
    const status = h('div', { class: 'hint' }, this.runner.connected ? `✅ Connected — runner v${this.runner.info.version} on ${this.runner.info.platform}, workspace ${this.runner.info.root}` : '⚪ Not connected');
    const appDir = location.protocol.startsWith('http') && /github\.io$/.test(location.hostname) ? `--ui-url ${location.origin + location.pathname}` : '';
    const cmd = `python runner/cdev_runner.py --root "D:/Projects" ${appDir}`.trim();
    const body = h('div', { class: 'form' },
      status,
      h('label', { class: 'f' }, h('span', {}, 'Runner address'), url),
      h('label', { class: 'f' }, h('span', {}, 'Token'), token),
      h('fieldset', {}, h('legend', {}, 'Start the runner'),
        h('div', { class: 'row' }, h('button', { class: 'mini primary', type: 'button', onclick: () => openRunnerDownload() }, '⬇ Download runner'),
          h('span', { class: 'hint' }, 'Unzip, then double-click start_cdev.bat (Windows) or run ./start_cdev.sh.')),
        h('div', { class: 'hint' }, 'Or from a terminal in the runner folder:'),
        h('div', { class: 'cmdline' }, h('button', { class: 'mini copy-btn', onclick: () => copyText(cmd) }, 'Copy'), cmd),
        h('div', { class: 'hint' }, 'Only Python 3.8+ is needed (it can also live on the drive, e.g. tools/python/python.exe). The runner prints a link with the token — opening it connects automatically.'),
        h('div', { class: 'hint' }, 'Chrome may ask to allow access to “devices on your local network” — allow it for this site.')));
    modal({
      title: '🔌 Local runner', body,
      buttons: [
        this.runner.connected ? { label: 'Disconnect', onClick: async () => { this.runner.disconnect(); store.del('runner'); if (this.fs.kind === 'runner') await this.setWorkspace(await this.scratchFS()); } } : null,
        { label: 'Close' },
        {
          label: this.runner.connected ? 'Reconnect' : 'Connect', primary: true,
          onClick: async () => {
            try {
              await this.runner.connect(url.value, token.value);
              toast(`Connected to runner — ${this.runner.info.root}`, 'ok');
              await this.setWorkspace(new RunnerFS(this.runner));
            } catch (e) { status.textContent = '❌ ' + e.message; return false; }
          },
        },
      ].filter(Boolean),
    });
  }

  openSettings(focus) {
    const o = store.get('editorOpts', {});
    const fontSize = h('input', { type: 'number', min: 9, max: 32, value: o.fontSize || 14 });
    const tabSize = h('input', { type: 'number', min: 1, max: 8, value: o.tabSize || 4 });
    const wrap = h('input', { type: 'checkbox', checked: !!o.wordWrap });
    const minimap = h('input', { type: 'checkbox', checked: o.minimap !== false });
    const aiForm = aiSettingsForm(this.ai);
    const body = h('div', { class: 'form' },
      h('fieldset', {}, h('legend', {}, 'Editor'),
        h('div', { class: 'row' }, h('label', { class: 'f', style: { flex: 1 } }, h('span', {}, 'Font size'), fontSize), h('label', { class: 'f', style: { flex: 1 } }, h('span', {}, 'Tab size'), tabSize)),
        h('label', { class: 'row' }, wrap, h('span', {}, 'Word wrap')),
        h('label', { class: 'row' }, minimap, h('span', {}, 'Minimap'))),
      h('fieldset', { id: 'ai-settings' }, h('legend', {}, '🤖 AI assistant'), aiForm.form));
    modal({
      title: '⚙️ Settings', body, size: 'wide',
      buttons: [{ label: 'Cancel' }, {
        label: 'Save', primary: true, onClick: () => {
          const no = { fontSize: +fontSize.value, tabSize: +tabSize.value, wordWrap: wrap.checked, minimap: minimap.checked };
          store.set('editorOpts', no);
          this.editors.setOptions({ fontSize: no.fontSize, tabSize: no.tabSize, wordWrap: no.wordWrap ? 'on' : 'off', minimap: { enabled: no.minimap } });
          this.ai.save(aiForm.read());
          this.chat.reset();
          this.renderProblems();
          this.updateWelcome();
          toast('Settings saved', 'ok', 1500);
        },
      }],
    });
    if (focus === 'ai') setTimeout(() => $('#ai-settings')?.scrollIntoView(), 50);
  }

  openHelp() {
    const k = (keys, what) => [h('span', {}, ...keys.split('+').map((x, i) => [i ? '+' : '', h('kbd', {}, x)])), h('span', {}, what)];
    modal({
      title: 'CDev — help', size: 'wide',
      body: h('div', {},
        h('h3', {}, 'Keyboard'),
        h('div', { class: 'kbd-list' },
          ...k('Ctrl+S', 'Save'), ...k('F5', 'Run current file'), ...k('Shift+F5', 'Stop'), ...k('Ctrl+Shift+B', 'Build'),
          ...k('Ctrl+Space', 'Autocomplete'), ...k('Ctrl+.', 'Quick fix (compiler fix / ✨ AI fix)'), ...k('F8', 'Next problem'),
          ...k('Tab', 'Accept AI inline suggestion'), ...k('Ctrl+Shift+A', 'AI panel'), ...k('Ctrl+`', 'Toggle bottom panel'), ...k('F1', 'Command palette')),
        h('h3', {}, 'exec_settings.json'),
        h('p', {}, 'Every project folder can contain an exec_settings.json. The runner looks for the nearest one above the file you run and merges it with the built-in defaults. Tool paths can be relative (to the project — ideal for USB drives) or absolute, and any value can be per-OS: {"windows": "...", "linux": "..."}.'),
        h('pre', { class: 'cmdline' }, `{
  "pathMode": "relative",
  "toolsDir": "../tools",
  "tools": {
    "gcc": "../tools/mingw64/bin/gcc.exe",
    "python": { "windows": ".venv/Scripts/python.exe", "default": ".venv/bin/python" }
  },
  "languages": {
    "c": {
      "extensions": [".c"],
      "build": "\${gcc} -g -Wall -o \${outFile} \${file}",
      "run": "\${outFile}",
      "check": "\${gcc} -fsyntax-only -fdiagnostics-parseable-fixits \${file}"
    }
  }
}`),
        h('p', { class: 'hint' }, 'Variables: ${file} ${fileRel} ${fileDir} ${fileName} ${fileBase} ${outDir} ${outFile} ${projectDir} ${toolsDir} ${tmpDir} ${exe} ${env:NAME} and every tool name. Add any language by giving it extensions and commands.'),
        h('h3', {}, 'Live errors'),
        h('p', {}, 'JS/TS/CSS/HTML/JSON are checked in the browser. Other languages are checked by the "check" command through the runner while you type (gcc/g++, javac, rustc, go vet, Python syntax + pyflakes if installed). Ctrl+. on a problem offers the compiler\'s own fix (when available) or an AI fix with a diff to review.')),
      buttons: [{ label: 'Close', primary: true }],
    });
  }
}

const app = new App();
window.cdev = app;
app.init().catch(e => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'Failed to start: ' + e.message;
});
