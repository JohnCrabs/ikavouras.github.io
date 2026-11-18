/* CFiles — application shell: open / detect / tabs / save / convert */
(function () {
  'use strict';
  const U = CF.util;

  const TYPES = {
    json: { label: 'JSON', ext: 'json', viewer: 'tree' },
    yaml: { label: 'YAML', ext: 'yaml', viewer: 'tree' },
    csv: { label: 'CSV', ext: 'csv', viewer: 'table' },
    txt: { label: 'TXT', ext: 'txt', viewer: 'text' },
    bin: { label: 'BIN', ext: 'bin', viewer: 'binary' },
  };
  const TEMPLATES = {
    json: '{\n  "name": "example",\n  "items": []\n}\n',
    yaml: 'name: example\nitems: []\n',
    csv: 'column1,column2,column3\n,,\n',
    txt: '',
  };

  const state = { docs: [], active: null, viewer: null, untitled: 0 };
  const el = {};

  /* ---------- documents ---------- */
  function addDoc(d) {
    const doc = Object.assign({ id: U.uid(), text: null, bytes: null, raw: null, encoding: 'UTF-8', reason: '', dirty: false, meta: {} }, d);
    state.docs.push(doc);
    activate(doc.id);
    return doc;
  }

  async function openFiles(list) {
    const files = Array.from(list || []);
    for (const f of files) {
      try {
        if (f.size > 200 * 1024 * 1024) { U.toast(`${f.name} is larger than 200 MB — skipped.`, 'warn'); continue; }
        const buf = new Uint8Array(await f.arrayBuffer());
        const det = CF.detect.detect(f.name, buf);
        addDoc({
          name: f.name, type: det.type, text: det.text ?? null,
          bytes: det.type === 'bin' ? buf : null, raw: buf,
          encoding: det.type === 'bin' ? 'binary' : det.encoding,
          reason: det.reason, meta: { delimiter: det.delimiter },
        });
      } catch (e) {
        U.toast(`Could not open ${f.name}: ${e.message}`, 'error');
      }
    }
  }

  /** Open text that did not come from a file (paste, generator, conversion). */
  function openText(name, text, forcedType, reason) {
    let type = forcedType, delimiter;
    if (!type) {
      const s = CF.detect.sniffText(text, U.extOf(name));
      type = s.type; reason = reason || s.reason; delimiter = s.delimiter;
    } else if (type === 'csv') {
      delimiter = (CF.csv.sniff(text) || {}).delimiter || ',';
    }
    if (!U.extOf(name)) name = name + '.' + TYPES[type].ext;
    return addDoc({ name, type, text, reason: reason || '', meta: { delimiter }, dirty: false });
  }

  function find(id) { return state.docs.find((d) => d.id === id); }
  function active() { return find(state.active); }

  function syncActive() {
    if (state.viewer && state.viewer.sync) {
      try { state.viewer.sync(); } catch (e) { console.error(e); }
    }
  }

  function makeCtx(doc) {
    return {
      onDirty() {
        if (!doc.dirty) { doc.dirty = true; renderFileList(); renderHead(); }
      },
      status(text) { if (state.active === doc.id) el.stRight.textContent = text || ''; },
    };
  }

  function activate(id) {
    if (state.viewer) {
      syncActive();
      state.viewer.destroy();
      state.viewer = null;
    }
    state.active = id;
    const doc = find(id);
    el.empty.classList.toggle('hidden', !!doc);
    el.docView.classList.toggle('hidden', !doc);
    renderFileList();
    if (!doc) { updateButtons(); el.stLeft.textContent = 'Ready'; el.stRight.textContent = ''; document.title = 'CFiles'; return; }
    renderHead();
    el.stRight.textContent = '';
    el.viewerHost.textContent = '';
    const factory = CF.viewers[TYPES[doc.type].viewer];
    try {
      state.viewer = factory.create(el.viewerHost, doc, makeCtx(doc));
    } catch (e) {
      console.error(e);
      U.toast(`Could not display as ${TYPES[doc.type].label}: ${e.message}. Showing as text.`, 'error');
      if (doc.type !== 'txt') { convertDocType(doc, 'txt'); state.viewer = CF.viewers.text.create(el.viewerHost, doc, makeCtx(doc)); renderHead(); }
    }
    updateButtons();
    updateStatusLeft();
  }

  function closeDoc(id) {
    const doc = find(id);
    if (!doc) return;
    if (state.active === id) syncActive();
    if (doc.dirty && !confirm(`"${doc.name}" has unsaved changes. Close anyway?`)) return;
    const i = state.docs.indexOf(doc);
    state.docs.splice(i, 1);
    if (state.active === id) {
      if (state.viewer) { state.viewer.destroy(); state.viewer = null; }
      const next = state.docs[i] || state.docs[i - 1];
      state.active = null;
      activate(next ? next.id : null);
    } else renderFileList();
  }

  /* ---------- type switching ("View as") ---------- */
  function docBytes(doc) {
    if (doc.type === 'bin') return doc.bytes;
    if (!doc.dirty && doc.raw) return doc.raw;
    return new TextEncoder().encode(doc.text || '');
  }

  function convertDocType(doc, type) {
    if (doc.type === type) return;
    if (type === 'bin') {
      doc.bytes = new Uint8Array(docBytes(doc));
      doc.meta = {};
      doc.encoding = 'binary';
    } else if (doc.type === 'bin') {
      const { text, encoding } = CF.detect.decodeText(doc.bytes);
      doc.text = text; doc.encoding = encoding; doc.bytes = null;
      doc.meta = {};
    } else {
      doc.meta = {};
    }
    if (type === 'csv') doc.meta.delimiter = (CF.csv.sniff(doc.text) || {}).delimiter || ',';
    doc.type = type;
    doc.reason = 'chosen manually';
  }

  function changeViewAs(type) {
    const doc = active();
    if (!doc || doc.type === type) return;
    syncActive();
    if (state.viewer) { state.viewer.destroy(); state.viewer = null; }
    convertDocType(doc, type);
    state.active = null;
    activate(doc.id);
  }

  /* ---------- save / convert ---------- */
  async function save() {
    const doc = active();
    if (!doc) return;
    syncActive();
    const data = doc.type === 'bin' ? doc.bytes : doc.text;
    try {
      const savedAs = await U.saveFile(doc.name, data, U.MIME[doc.type]);
      if (savedAs === false) return;
      if (typeof savedAs === 'string' && savedAs !== doc.name) doc.name = savedAs;
      doc.dirty = false;
      doc.raw = null;
      if (doc.meta.modified) doc.meta.modified.clear();
      renderFileList();
      renderHead();
      if (state.viewer && state.viewer.updateInspector) { state.viewer.render(); state.viewer.updateInspector(); }
      U.toast(`Saved ${doc.name}`, 'ok', 2200);
    } catch (e) {
      U.toast('Save failed: ' + e.message, 'error');
    }
  }

  function currentData(doc) {
    syncActive();
    if (state.viewer && state.viewer.getData) return state.viewer.getData();
    return doc.text;
  }

  const CONVERSIONS = {
    json: [['yaml', 'YAML'], ['csv', 'CSV (array of objects)'], ['txt', 'Plain text']],
    yaml: [['json', 'JSON'], ['csv', 'CSV (array of objects)'], ['txt', 'Plain text']],
    csv: [['json', 'JSON (array of objects)'], ['yaml', 'YAML (array of objects)'], ['txt', 'Plain text']],
    txt: [],
    bin: [],
  };

  function convertTo(target) {
    const doc = active();
    if (!doc) return;
    try {
      let out;
      if (target === 'txt') { syncActive(); out = doc.text; }
      else {
        const data = currentData(doc);
        if (target === 'json') out = JSON.stringify(data, null, 2) + '\n';
        else if (target === 'yaml') {
          if (!U.hasYaml()) throw new Error('YAML library not loaded.');
          out = jsyaml.dump(data, { lineWidth: -1, noRefs: true, schema: jsyaml.CORE_SCHEMA });
        } else if (target === 'csv') {
          let arr = data;
          if (!Array.isArray(arr)) {
            const firstArr = arr && typeof arr === 'object' ? Object.values(arr).find(Array.isArray) : null;
            if (!firstArr) throw new Error('CSV conversion needs an array of objects.');
            arr = firstArr;
          }
          out = CF.csv.stringify(CF.csv.fromObjects(arr), ',', '\n', true);
        }
      }
      openText(U.replaceExt(doc.name, TYPES[target].ext), out, target, `converted from ${TYPES[doc.type].label}`);
      U.toast(`Converted to ${TYPES[target].label} (opened as a new file).`, 'ok');
    } catch (e) {
      U.toast('Conversion failed: ' + e.message, 'error', 5000);
    }
  }

  function newDoc(type) {
    state.untitled++;
    openText(`untitled-${state.untitled}.${TYPES[type].ext}`, TEMPLATES[type], type, 'new document');
  }

  /* ---------- rendering ---------- */
  function renderFileList() {
    el.fileList.textContent = '';
    for (const d of state.docs) {
      const li = U.el('li', { class: d.id === state.active ? 'active' : null, title: `${d.name}\n${TYPES[d.type].label} — ${d.reason}`, onclick: () => { if (state.active !== d.id) activate(d.id); } },
        U.el('span', { class: 'badge t-' + d.type, text: TYPES[d.type].label }),
        U.el('span', { class: 'fname', text: d.name }),
        d.dirty ? U.el('span', { class: 'fdirty', text: '●', title: 'Unsaved changes' }) : null,
        U.el('button', { class: 'fclose', type: 'button', text: '✕', title: 'Close', 'aria-label': 'Close ' + d.name, onclick: (e) => { e.stopPropagation(); closeDoc(d.id); } }),
      );
      el.fileList.append(li);
    }
    el.fileCount.textContent = state.docs.length;
  }

  function renderHead() {
    const doc = active();
    if (!doc) return;
    el.docName.textContent = doc.name;
    el.docBadge.className = 'badge t-' + doc.type;
    el.docBadge.textContent = TYPES[doc.type].label;
    el.docDirty.classList.toggle('hidden', !doc.dirty);
    el.viewAs.value = doc.type;
    el.detectReason.textContent = doc.reason ? `Detected: ${doc.reason}` : '';
    document.title = (doc.dirty ? '● ' : '') + doc.name + ' — CFiles';
  }

  function updateStatusLeft() {
    const doc = active();
    if (!doc) return;
    const size = doc.type === 'bin' ? doc.bytes.length : new Blob([doc.text || '']).size;
    const extra = state.viewer && state.viewer.status ? state.viewer.status() : '';
    el.stLeft.textContent = `${TYPES[doc.type].label} · ${U.formatBytes(size)} · ${doc.encoding}${extra ? ' · ' + extra : ''}`;
  }

  function updateButtons() {
    const doc = active();
    el.btnSave.disabled = !doc;
    const conv = doc ? CONVERSIONS[doc.type] : [];
    el.btnConvert.disabled = !doc || !conv.length;
    el.menuConvert.textContent = '';
    for (const [t, label] of conv) el.menuConvert.append(U.el('button', { role: 'menuitem', text: '→ ' + label, onclick: () => { closeMenus(); convertTo(t); } }));
  }

  /* ---------- menus ---------- */
  function closeMenus() { for (const m of U.$$('.menu.open')) m.classList.remove('open'); }
  function setupMenus() {
    for (const m of U.$$('.menu')) {
      const btn = m.querySelector('.btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = m.classList.contains('open');
        closeMenus();
        if (!open && !btn.disabled) m.classList.add('open');
      });
    }
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  }

  /* ---------- drag & drop / paste ---------- */
  function setupDnD() {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.dropOverlay.classList.remove('hidden'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) el.dropOverlay.classList.add('hidden'); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      el.dropOverlay.classList.add('hidden');
      openFiles(e.dataTransfer.files);
    });
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      // Ignore paste while focus is in the binary panes (avoid surprises).
      if (t && t.closest && t.closest('.bin-scroll')) return;
      const cd = e.clipboardData;
      if (!cd) return;
      if (cd.files && cd.files.length) { e.preventDefault(); openFiles(cd.files); return; }
      const text = cd.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      state.untitled++;
      const doc = openText(`pasted-${state.untitled}`, text, null, null);
      U.toast(`Pasted text detected as ${TYPES[doc.type].label}.`, 'ok', 2500);
    });
  }

  /* ---------- theme ---------- */
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    U.store.set('cf.theme', next);
  }

  /* ---------- init ---------- */
  function init() {
    for (const id of ['empty', 'docView', 'docName', 'docBadge', 'docDirty', 'viewAs', 'detectReason', 'viewerHost', 'fileList', 'fileCount',
      'stLeft', 'stRight', 'btnOpen', 'btnSave', 'btnConvert', 'menuConvert', 'btnSynth', 'btnTheme', 'fileInput', 'dropOverlay', 'dropZone']) {
      el[id] = document.getElementById(id);
    }
    el.btnOpen.addEventListener('click', () => el.fileInput.click());
    el.dropZone.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', () => { openFiles(el.fileInput.files); el.fileInput.value = ''; });
    el.btnSave.addEventListener('click', save);
    el.btnSynth.addEventListener('click', () => CF.synthDialog.open());
    el.btnTheme.addEventListener('click', toggleTheme);
    el.viewAs.addEventListener('change', () => changeViewAs(el.viewAs.value));
    for (const b of U.$$('#menuNew [data-new]')) b.addEventListener('click', () => { closeMenus(); newDoc(b.dataset.new); });
    setupMenus();
    setupDnD();

    // Keep the status line fresh after edits.
    setInterval(() => { if (active()) updateStatusLeft(); }, 1500);

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); save(); }
      else if (k === 'o') { e.preventDefault(); el.fileInput.click(); }
    });

    window.addEventListener('beforeunload', (e) => {
      syncActive();
      if (state.docs.some((d) => d.dirty)) { e.preventDefault(); e.returnValue = ''; }
    });

    if (!U.hasYaml()) U.toast('YAML support could not be loaded (offline?). JSON, CSV, TXT and BIN still work.', 'warn', 6000);
  }

  CF.app = { openText, openFiles, state, TYPES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
