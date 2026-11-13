/* CPDF — generic tool workspace (tool.html?tool=<id>).
 * Flow: upload → work (file cards, page thumbnails, crop or form view + options sidebar) → results.
 */
(function () {
  'use strict';
  const { $, el, icon, toast, formatBytes, baseName, busy, clamp } = PDFApp;

  const params = new URLSearchParams(location.search);
  const tool = PDFTools.get(params.get('tool'));
  if (!tool || tool.soon || tool.href) {
    location.replace(tool && tool.href ? tool.href : 'index.html');
    return;
  }
  PDFApp.recent.add(tool.id);

  const OFFICE_EXT = /\.(docx?|odt|rtf|txt|xlsx?|ods|csv|pptx?|odp)$/i;
  const INSTALL = {
    libreoffice: { name: 'LibreOffice', url: 'https://www.libreoffice.org/download/download/' },
    ghostscript: { name: 'Ghostscript', url: 'https://ghostscript.com/releases/gsdnld.html' },
  };
  const THUMB_W = 160 * Math.min(2, window.devicePixelRatio || 1);
  const state = {
    files: [], pdf: null, pages: [], thumbs: new Map(), options: {}, outputs: [],
    caps: { libreoffice: false, ghostscript: false, server: false },
    crop: { page: 0, rect: null }, form: { fields: [], values: {} },
  };
  let uid = 0;

  // Thumbnails render one at a time so large documents don't freeze the page.
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn, fn));

  const ui = {
    stages: { upload: $('#stage-upload'), work: $('#stage-work'), done: $('#stage-done') },
    input: $('#file-input'),
    dropzone: $('#dropzone'),
    grid: $('#work-grid'),
    toolbar: $('#work-toolbar'),
    options: $('#options'),
    run: $('#run-btn'),
    results: $('#results'),
  };

  /* ---------- Page chrome ---------- */
  const toolName = L(tool.name);
  document.title = `${toolName} — CPDF`;
  document.body.style.setProperty('--c', tool.color);
  $('#tool-icon').innerHTML = icon(tool.icon, 34);
  $('#tool-title').textContent = toolName;
  $('#tool-desc').textContent = L(tool.desc);
  $('#side-title').textContent = toolName;
  ui.run.innerHTML = `${L(tool.action) || toolName} ${icon('arrowRight', 18)}`;
  ui.input.accept = { image: 'image/*', office: '.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp', pdf: 'application/pdf,.pdf' }[tool.accept];
  ui.input.multiple = !!tool.multiple;
  $('#select-label').textContent = t({
    image: tool.multiple ? 'tool.selectImages' : 'tool.selectImage',
    office: 'tool.selectOffice',
    pdf: tool.multiple ? 'tool.selectPdfs' : 'tool.selectPdf',
  }[tool.accept]);

  function resetOptions() {
    for (const o of tool.options || []) {
      if (!('default' in o)) continue;
      state.options[o.id] = typeof o.default === 'function' ? o.default(state.caps) : L(o.default);
    }
  }

  function showStage(name) {
    for (const [key, node] of Object.entries(ui.stages)) node.hidden = key !== name;
    window.scrollTo({ top: 0 });
  }

  /* ---------- Capabilities (LibreOffice / Ghostscript through server.js) ---------- */
  async function init() {
    state.caps = await PDFApp.api.caps();
    resetOptions();
    if (tool.requires && !state.caps[tool.requires]) {
      const need = INSTALL[tool.requires];
      ui.dropzone.replaceWith(el('div', { class: 'needs-card' }, [
        el('h2', { text: t(`tool.needs.${tool.requires}`) }),
        el('p', { text: state.caps.server ? t('tool.needs.desc') : t('tool.needs.server') }),
        state.caps.server ? el('a', { class: 'btn btn-primary', href: need.url, target: '_blank', rel: 'noopener', html: `${icon('download', 18)}<span>${t('tool.needs.install', { name: need.name })}</span>` }) : null,
      ]));
      return;
    }
    if (params.get('from') === 'handoff') {
      const files = await PDFApp.handoff.take().catch(() => []);
      history.replaceState(null, '', `?tool=${tool.id}`);
      if (files.length) addFiles(files);
    }
  }

  /* ---------- File intake ---------- */
  ui.input.addEventListener('change', () => { addFiles(ui.input.files); ui.input.value = ''; });

  let dragDepth = 0;
  const hasFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e) && ui.stages.done.hidden) { dragDepth++; document.body.classList.add('drop-active'); } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop-active'); } });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('drop-active');
    if (ui.stages.done.hidden && $('#dropzone')) addFiles(e.dataTransfer.files);
  });

  const accepts = (f) => ({
    image: () => f.type.startsWith('image/'),
    office: () => OFFICE_EXT.test(f.name),
    pdf: () => PDFApp.isPdf(f),
  }[tool.accept]());

  async function addFiles(fileList) {
    const all = Array.from(fileList);
    const accepted = all.filter(accepts);
    if (!accepted.length) return toast(t(`tool.wrongType.${tool.accept}`), 'error');
    if (accepted.length < all.length) toast(t('tool.skipped'), 'warn');
    let picked = tool.multiple ? accepted : accepted.slice(0, 1);
    if (tool.maxFiles) picked = picked.slice(0, Math.max(0, tool.maxFiles - (tool.view === 'files' ? state.files.length : 0)));
    if (!picked.length) return;

    busy(true, t('tool.reading'));
    try {
      const entries = [];
      for (const file of picked) {
        const entry = { id: ++uid, name: file.name, size: file.size, type: file.type, file, bytes: new Uint8Array(await file.arrayBuffer()) };
        try {
          if (tool.accept === 'image') entry.url = URL.createObjectURL(file);
          else if (tool.accept === 'pdf') {
            busy(false);
            const ready = await PDFApp.preparePdf(entry.bytes, file.name);
            busy(true, t('tool.reading'));
            if (!ready) { toast(t('pw.skipped', { name: file.name }), 'warn'); continue; }
            Object.assign(entry, { bytes: ready.bytes, pdf: ready.pdf, pageCount: ready.pdf.numPages, encrypted: ready.encrypted });
          }
          entries.push(entry);
        } catch (err) {
          if (tool.lenient) entries.push(entry); // e.g. Repair: broken files are the point
          else toast(`${file.name}: ${PDFApp.friendlyError(err)}`, 'error', 5000);
        }
      }
      if (!entries.length) return;

      if (tool.multiple && tool.view === 'files') state.files.push(...entries);
      else { state.files.forEach(disposeFile); state.files = entries; }

      if (tool.view === 'pages' || tool.view === 'crop') {
        state.pdf = entries[0].pdf;
        state.thumbs = new Map();
        state.pages = Array.from({ length: state.pdf.numPages }, (_, i) => ({ key: ++uid, src: i, rotation: 0, selected: false }));
        state.crop = { page: 0, rect: null };
      }
      if (tool.view === 'form') await loadForm(entries[0]);
      if (tool.onLoad) Object.assign(state.options, await tool.onLoad(ctx()));
      renderOptions();
      renderWork();
      showStage('work');
    } catch (err) {
      console.error(err);
      toast(PDFApp.friendlyError(err), 'error');
    } finally {
      busy(false);
    }
  }

  function disposeFile(f) {
    if (f.url) URL.revokeObjectURL(f.url);
    if (f.pdf) f.pdf.destroy();
  }

  function reset() {
    state.files.forEach(disposeFile);
    Object.assign(state, { files: [], pdf: null, pages: [], thumbs: new Map(), outputs: [], crop: { page: 0, rect: null }, form: { fields: [], values: {} } });
    resetOptions();
    showStage('upload');
  }

  /* ---------- Thumbnails ---------- */
  function copyCanvas(src) {
    const c = el('canvas', { width: src.width, height: src.height });
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  function fileThumb(f) {
    f.thumb = f.thumb || queue(() => PDFApp.renderPage(f.pdf, 1, { width: THUMB_W }));
    return f.thumb.then(copyCanvas);
  }

  function pageThumb(src) {
    if (!state.thumbs.has(src)) state.thumbs.set(src, queue(() => PDFApp.renderPage(state.pdf, src + 1, { width: THUMB_W })));
    return state.thumbs.get(src).then(copyCanvas);
  }

  // Rotated landscape/portrait pages must shrink to stay inside the thumbnail box.
  function applyRotation(inner, rotation) {
    const c = inner.firstElementChild;
    let s = 1;
    if (c && Math.abs(rotation / 90) % 2 === 1) {
      s = Math.min(1, inner.clientWidth / c.clientHeight, inner.clientHeight / c.clientWidth);
    }
    inner.style.transform = `rotate(${rotation}deg) scale(${s})`;
  }

  /* ---------- Work area ---------- */
  const btn = (iconName, label, onclick, extra = '') =>
    el('button', { class: `btn btn-ghost btn-sm ${extra}`, type: 'button', html: `${icon(iconName, 16)}<span>${label}</span>`, onclick });

  function renderWork() {
    ({ pages: renderPages, crop: renderCrop, form: renderForm }[tool.view] || renderFiles)();
  }

  function renderFiles() {
    const multi = !!tool.multiple;
    const canAdd = multi && (!tool.maxFiles || state.files.length < tool.maxFiles);
    ui.toolbar.replaceChildren(...[
      el('span', { class: 'toolbar-info', text: tn('n.files', state.files.length) }),
      el('span', { class: 'toolbar-spacer' }),
      multi && state.files.length > 1 ? btn('sort', t('tool.sortAZ'), () => {
        state.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        renderWork();
      }) : null,
      canAdd || !multi ? btn(multi ? 'plus' : 'upload', multi ? t('tool.addFiles') : t('tool.replaceFile'), () => ui.input.click()) : null,
    ].filter(Boolean));

    const cards = state.files.map((f, i) => {
      const thumb = el('div', { class: 'thumb' });
      if (f.url) thumb.append(el('img', { src: f.url, alt: '' }));
      else if (f.pdf) fileThumb(f).then((c) => thumb.append(c)).catch(() => {});
      else thumb.append(el('span', { class: 'thumb-ext', html: `${icon(tool.accept === 'office' ? 'word' : 'file', 40)}<b>${(f.name.split('.').pop() || '').toUpperCase()}</b>` }));
      const sub = [f.pageCount ? tn('n.pages', f.pageCount) : null, formatBytes(f.size), f.encrypted ? '🔓' : null].filter(Boolean).join(' · ');
      return el('div', { class: 'card', dataset: { index: i, sortable: multi ? '1' : null } }, [
        el('button', { class: 'card-remove', type: 'button', title: t('tool.remove', { name: f.name }), 'aria-label': t('tool.remove', { name: f.name }), html: icon('x', 14), onclick: () => removeFile(i) }),
        multi ? el('span', { class: 'card-order', text: i + 1 }) : null,
        thumb,
        el('div', { class: 'card-meta' }, [
          el('div', { class: 'card-name', text: f.name, title: f.name }),
          el('div', { class: 'card-sub', text: sub }),
        ]),
      ]);
    });
    if (canAdd) {
      cards.push(el('button', { class: 'card card-add', type: 'button', onclick: () => ui.input.click(), html: `${icon('plus', 30)}<span>${t('tool.addMore')}</span>` }));
    }
    ui.grid.className = 'grid';
    ui.grid.replaceChildren(...cards);
    if (multi) enableReorder(state.files);
  }

  function removeFile(i) {
    const [f] = state.files.splice(i, 1);
    disposeFile(f);
    if (!state.files.length) reset();
    else renderWork();
  }

  function renderPages() {
    const mode = tool.pageMode;
    ui.toolbar.replaceChildren(...pageToolbar(mode));
    ui.grid.className = `grid grid-pages mode-${mode}${tool.selectStyle === 'danger' ? ' select-danger' : ''}`;
    ui.grid.replaceChildren(...state.pages.map((p, i) => pageCard(p, i, mode)));
    if (mode === 'organize') enableReorder(state.pages);
    updateSelectionInfo();
  }

  function pageCard(p, i, mode) {
    const inner = el('div', { class: 'thumb-inner' });
    const thumb = el('div', { class: 'thumb' }, inner);
    pageThumb(p.src).then((c) => { inner.append(c); applyRotation(inner, p.rotation); }).catch(() => {});

    const card = el('div', {
      class: `card page-card${p.selected ? ' selected' : ''}`,
      dataset: { index: i, sortable: mode === 'organize' ? '1' : null },
    }, [thumb, el('div', { class: 'page-label', text: p.src + 1 })]);

    const rotate = (d) => { p.rotation += d; applyRotation(inner, p.rotation); };
    const actions = (items) => el('div', { class: 'card-actions' }, items.map(([ic, title, fn]) =>
      el('button', { type: 'button', title, 'aria-label': title, html: icon(ic, 16), onclick: (e) => { e.stopPropagation(); fn(); } })));

    if (mode === 'select') {
      card.append(el('span', { class: 'check', html: icon(tool.selectStyle === 'danger' ? 'x' : 'check', 14) }));
      card.addEventListener('click', () => {
        p.selected = !p.selected;
        card.classList.toggle('selected', p.selected);
        updateSelectionInfo();
      });
    } else if (mode === 'rotate') {
      card.append(actions([['rotateCcw', t('tool.rotateLeft'), () => rotate(-90)], ['rotate', t('tool.rotateRight'), () => rotate(90)]]));
      card.addEventListener('click', () => rotate(90));
    } else if (mode === 'organize') {
      card.append(actions([
        ['rotate', t('tool.rotate'), () => rotate(90)],
        ['copy', t('tool.duplicate'), () => { state.pages.splice(i + 1, 0, { ...p, key: ++uid }); renderPages(); }],
        ['trash', t('tool.delete'), () => {
          if (state.pages.length === 1) return toast(t('tool.minPage'), 'warn');
          state.pages.splice(i, 1);
          renderPages();
        }],
      ]));
    }
    return card;
  }

  function pageToolbar(mode) {
    const total = state.pdf.numPages;
    const spacer = el('span', { class: 'toolbar-spacer' });
    if (mode === 'select') {
      const range = el('input', { class: 'input input-sm', type: 'text', placeholder: t('tool.rangePlaceholder'), 'aria-label': t('tool.rangeLabel') });
      const applyRange = () => {
        try {
          const wanted = new Set(PDFApp.parseRanges(range.value, total).flat());
          state.pages.forEach((p) => { p.selected = wanted.has(p.src); });
          renderPages();
        } catch (err) { toast(err.message, 'error'); }
      };
      range.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyRange(); });
      const setAll = (fn) => () => { state.pages.forEach((p) => { p.selected = fn(p); }); renderPages(); };
      return [
        el('span', { class: 'toolbar-info', id: 'sel-info' }),
        spacer,
        el('div', { class: 'range-box' }, [range, btn('check', t('tool.apply'), applyRange)]),
        btn('check', t('tool.all'), setAll(() => true)),
        btn('x', t('tool.none'), setAll(() => false)),
        btn('swap', t('tool.invert'), setAll((p) => !p.selected)),
      ];
    }
    if (mode === 'rotate') {
      const all = (d) => () => { state.pages.forEach((p) => { p.rotation += d; }); renderPages(); };
      return [
        el('span', { class: 'toolbar-info', text: tn('n.pages', total) }),
        spacer,
        btn('rotateCcw', t('tool.rotateAllLeft'), all(-90)),
        btn('rotate', t('tool.rotateAllRight'), all(90)),
        btn('undo', t('tool.reset'), () => { state.pages.forEach((p) => { p.rotation = 0; }); renderPages(); }),
      ];
    }
    if (mode === 'organize') {
      return [
        el('span', { class: 'toolbar-info', id: 'sel-info' }),
        spacer,
        btn('swap', t('tool.reverse'), () => { state.pages.reverse(); renderPages(); }),
        btn('undo', t('tool.reset'), () => {
          state.pages = Array.from({ length: total }, (_, i) => ({ key: ++uid, src: i, rotation: 0, selected: false }));
          renderPages();
        }),
      ];
    }
    return [el('span', { class: 'toolbar-info', text: `${state.files[0].name} · ${tn('n.pages', total)}` })];
  }

  function updateSelectionInfo() {
    const info = $('#sel-info');
    if (!info) return;
    if (tool.pageMode === 'select') {
      info.textContent = t('tool.selectedOf', { n: state.pages.filter((p) => p.selected).length, total: state.pages.length });
    } else info.textContent = tn('n.pages', state.pages.length);
  }

  /* ---------- Crop view ---------- */
  function renderCrop() {
    const total = state.pdf.numPages;
    const c = state.crop;
    const label = el('span', { class: 'toolbar-info', text: `${c.page + 1} / ${total}` });
    const go = (d) => { c.page = clamp(c.page + d, 0, total - 1); renderCrop(); };
    ui.toolbar.replaceChildren(
      btn('arrowLeft', '', () => go(-1), 'btn-icon'), label, btn('arrowRight', '', () => go(1), 'btn-icon'),
      el('span', { class: 'toolbar-spacer' }),
      btn('undo', t('tool.reset'), () => { c.rect = null; renderCrop(); }),
    );
    const stage = el('div', { class: 'crop-stage' });
    const box = el('div', { class: 'crop-rect', hidden: !c.rect });
    const frame = el('div', { class: 'crop-frame' }, [box]);
    stage.append(frame);
    ui.grid.className = 'crop-view';
    ui.grid.replaceChildren(stage);

    const paint = () => {
      box.hidden = !c.rect;
      if (!c.rect) return;
      Object.assign(box.style, { left: `${c.rect.x * 100}%`, top: `${c.rect.y * 100}%`, width: `${c.rect.w * 100}%`, height: `${c.rect.h * 100}%` });
    };
    queue(() => PDFApp.renderPage(state.pdf, c.page + 1, { width: Math.min(900, ui.grid.clientWidth || 700) * Math.min(2, devicePixelRatio || 1) }))
      .then((canvas) => { frame.prepend(canvas); paint(); });

    frame.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return; // page image not rendered yet
      const at = (ev) => ({ x: clamp((ev.clientX - r.left) / r.width, 0, 1), y: clamp((ev.clientY - r.top) / r.height, 0, 1) });
      const p0 = at(e);
      const inside = c.rect && p0.x > c.rect.x && p0.x < c.rect.x + c.rect.w && p0.y > c.rect.y && p0.y < c.rect.y + c.rect.h;
      const start = c.rect && { ...c.rect };
      const move = (ev) => {
        const p = at(ev);
        if (inside) {
          c.rect.x = clamp(start.x + p.x - p0.x, 0, 1 - start.w);
          c.rect.y = clamp(start.y + p.y - p0.y, 0, 1 - start.h);
        } else {
          c.rect = { x: Math.min(p.x, p0.x), y: Math.min(p.y, p0.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
        }
        paint();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (c.rect && (c.rect.w < 0.02 || c.rect.h < 0.02)) { c.rect = null; paint(); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /* ---------- Form view ---------- */
  async function loadForm(entry) {
    const { PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = PDFLib;
    const doc = await PDFTools.helpers.load(entry.bytes);
    const fields = [];
    for (const f of doc.getForm().getFields()) {
      const name = f.getName();
      let field = null;
      if (f instanceof PDFTextField) field = { type: 'text', value: f.getText() || '', multiline: f.isMultiline() };
      else if (f instanceof PDFCheckBox) field = { type: 'check', value: f.isChecked() };
      else if (f instanceof PDFDropdown || f instanceof PDFOptionList) field = { type: 'select', value: (f.getSelected() || [])[0] || '', options: f.getOptions() };
      else if (f instanceof PDFRadioGroup) field = { type: 'select', value: f.getSelected() || '', options: f.getOptions() };
      if (field) fields.push({ name, readOnly: f.isReadOnly(), ...field });
    }
    state.form = { fields, values: Object.fromEntries(fields.map((f) => [f.name, f.value])) };
  }

  function renderForm() {
    const { fields, values } = state.form;
    ui.toolbar.replaceChildren(el('span', { class: 'toolbar-info', text: `${state.files[0].name} · ${fields.length} ${L({ en: 'fields', el: 'πεδία' })}` }));
    ui.grid.className = 'form-view';
    if (!fields.length) {
      ui.grid.replaceChildren(el('p', { class: 'empty', text: L({ en: 'This PDF has no fillable form fields.', el: 'Αυτό το PDF δεν έχει πεδία φόρμας για συμπλήρωση.' }) }));
      return;
    }
    ui.grid.replaceChildren(...fields.map((f) => {
      const id = `field-${f.name}`;
      const set = (v) => { values[f.name] = v; };
      let control;
      if (f.type === 'check') {
        return el('label', { class: 'form-row form-check' }, [
          el('input', { type: 'checkbox', checked: !!values[f.name], disabled: f.readOnly, onchange: (e) => set(e.target.checked) }),
          el('span', { text: f.name }),
        ]);
      }
      if (f.type === 'select') {
        control = el('select', { id, class: 'input', disabled: f.readOnly, onchange: (e) => set(e.target.value) },
          [el('option', { value: '', text: '—' }), ...f.options.map((o) => el('option', { value: o, text: o, selected: o === values[f.name] }))]);
      } else if (f.multiline) {
        control = el('textarea', { id, class: 'input textarea', rows: 3, disabled: f.readOnly, oninput: (e) => set(e.target.value) });
        control.value = values[f.name];
      } else {
        control = el('input', { id, class: 'input', type: 'text', value: values[f.name], disabled: f.readOnly, oninput: (e) => set(e.target.value) });
      }
      return el('div', { class: 'form-row' }, [el('label', { class: 'field-label', for: id, text: f.name }), control]);
    }));
  }

  /* ---------- Reordering (pointer events: works with mouse and touch) ---------- */
  function enableReorder(list) {
    ui.grid.querySelectorAll('.card[data-sortable]').forEach((card) => {
      card.addEventListener('pointerdown', (e) => startSort(e, card, list));
    });
  }

  function startSort(e, card, list) {
    if (e.button !== 0 || e.target.closest('button, input, select')) return;
    const from = +card.dataset.index;
    const touch = e.pointerType !== 'mouse';
    const sx = e.clientX, sy = e.clientY;
    let dragging = false, ghost = null, target = null, after = false, timer = null;

    const clearMarks = () => ui.grid.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    const begin = () => {
      dragging = true;
      const r = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      Object.assign(ghost.style, { width: `${r.width}px`, left: `${r.left}px`, top: `${r.top}px` });
      ghost.dataset.dx = sx - r.left;
      ghost.dataset.dy = sy - r.top;
      document.body.append(ghost);
      card.classList.add('dragging');
    };
    const blockScroll = (ev) => { if (dragging) ev.preventDefault(); };
    const move = (ev) => {
      const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
      if (!dragging) {
        if (touch) { if (dist > 8) cleanup(); return; } // moved before the long-press: let the page scroll
        if (dist < 5) return;
        begin();
      }
      ghost.style.left = `${ev.clientX - ghost.dataset.dx}px`;
      ghost.style.top = `${ev.clientY - ghost.dataset.dy}px`;
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const hit = over && over.closest('.card[data-sortable]');
      clearMarks();
      target = hit && hit !== card ? hit : null;
      if (target) {
        const r = target.getBoundingClientRect();
        after = ev.clientX > r.left + r.width / 2;
        target.classList.add(after ? 'drop-after' : 'drop-before');
      }
      if (ev.clientY < 70) window.scrollBy(0, -12);
      else if (ev.clientY > innerHeight - 70) window.scrollBy(0, 12);
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      document.removeEventListener('touchmove', blockScroll);
      if (ghost) ghost.remove();
      card.classList.remove('dragging');
      clearMarks();
    };
    const up = () => {
      const was = dragging, to0 = target && +target.dataset.index, a = after;
      cleanup();
      if (!was || target == null) return;
      let to = to0 + (a ? 1 : 0);
      if (from < to) to--;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      renderWork();
    };
    if (touch) timer = setTimeout(() => { begin(); if (navigator.vibrate) navigator.vibrate(15); }, 350);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
    document.addEventListener('touchmove', blockScroll, { passive: false });
  }

  /* ---------- Options sidebar ---------- */
  function renderOptions() {
    const fields = (tool.options || []).map(optionField);
    if (tool.note) fields.unshift(el('p', { class: 'side-note', text: L(tool.note) }));
    ui.options.replaceChildren(...fields);
    syncVisibility();
  }

  function optionField(o) {
    const id = `opt-${o.id}`;
    const val = state.options[o.id];
    const set = (v) => { state.options[o.id] = v; syncVisibility(); };
    const choices = (o.choices || []).filter((c) => !c.requires || state.caps[c.requires]);
    let control;

    switch (o.type) {
      case 'note':
        return el('div', { class: 'field field-note', dataset: { opt: o.id }, html: L(o.html) });
      case 'checkbox':
        return el('label', { class: 'field field-check', dataset: { opt: o.id } }, [
          el('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(e.target.checked) }),
          el('span', { text: L(o.label) }),
        ]);
      case 'select':
        control = el('select', { id, class: 'input', onchange: (e) => set(e.target.value) },
          choices.map((c) => el('option', { value: c.value, text: L(c.label), selected: c.value === val })));
        break;
      case 'radio':
        control = el('div', { class: 'radio-cards', role: 'radiogroup' }, choices.map((c) =>
          el('label', { class: 'radio-card' }, [
            el('input', { type: 'radio', name: id, value: c.value, checked: c.value === val, onchange: () => set(c.value) }),
            el('span', { class: 'radio-title', text: L(c.label) }),
            c.hint ? el('span', { class: 'radio-hint', text: L(c.hint) }) : null,
          ])));
        break;
      case 'segmented':
        control = el('div', { class: 'segmented', role: 'radiogroup' }, choices.map((c) =>
          el('label', {}, [
            el('input', { type: 'radio', name: id, value: c.value, checked: c.value === val, onchange: () => set(c.value) }),
            el('span', { text: L(c.label) }),
          ])));
        break;
      case 'number':
        control = el('input', { id, class: 'input', type: 'number', min: o.min, max: o.max, step: o.step || 1, value: val,
          oninput: (e) => set(e.target.valueAsNumber) });
        break;
      case 'range': {
        const fmt = (v) => (o.percent ? `${Math.round(v * 100)}%` : `${v}${o.unit || ''}`);
        const out = el('output', { class: 'range-value', text: fmt(val) });
        control = el('div', { class: 'range-row' }, [
          el('input', { id, type: 'range', min: o.min, max: o.max, step: o.step, value: val,
            oninput: (e) => { set(+e.target.value); out.textContent = fmt(+e.target.value); } }),
          out,
        ]);
        break;
      }
      case 'color':
        control = el('input', { id, class: 'input-color', type: 'color', value: val, oninput: (e) => set(e.target.value) });
        break;
      default: // text, password
        control = el('input', { id, class: 'input', type: o.type === 'password' ? 'password' : 'text', value: val == null ? '' : val,
          placeholder: L(o.placeholder), autocomplete: o.type === 'password' ? 'new-password' : null,
          oninput: (e) => set(e.target.value) });
    }
    return el('div', { class: 'field', dataset: { opt: o.id } }, [
      el('label', { class: 'field-label', for: id, text: L(o.label) }),
      control,
      o.hint ? el('p', { class: 'field-hint', text: L(o.hint) }) : null,
    ]);
  }

  function syncVisibility() {
    for (const o of tool.options || []) {
      if (!o.showIf) continue;
      const node = ui.options.querySelector(`[data-opt="${o.id}"]`);
      if (node) node.hidden = !o.showIf(state.options, state.caps);
    }
  }

  /* ---------- Run & results ---------- */
  const ctx = () => ({
    files: state.files,
    pages: state.pages,
    pageCount: state.pdf ? state.pdf.numPages : 0,
    options: { ...state.options },
    caps: state.caps,
    crop: state.crop,
    form: state.form,
    progress: (msg) => busy(true, msg),
  });

  ui.run.addEventListener('click', async () => {
    if (tool.minFiles && state.files.length < tool.minFiles) {
      return toast(t('tool.minFiles', { n: tool.minFiles }), 'warn');
    }
    busy(true, t('tool.processing'));
    // Let the overlay paint before heavy synchronous work starts.
    await new Promise((r) => setTimeout(r, 30));
    try {
      showResults(await tool.run(ctx()));
    } catch (err) {
      console.error(err);
      toast(PDFApp.friendlyError(err), 'error', 6000);
    } finally {
      busy(false);
    }
  });

  function showResults(outputs) {
    state.outputs = outputs.map((o) => ({
      ...o,
      blob: o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.type || 'application/pdf' }),
    }));
    ui.results.replaceChildren(...state.outputs.map((o) => el('div', { class: 'result-row' }, [
      el('span', { class: 'result-icon', html: icon(o.blob.type.startsWith('image/') ? 'image' : /word/.test(o.blob.type) ? 'word' : 'file', 20) }),
      el('div', { class: 'result-meta' }, [
        el('div', { class: 'result-name', text: o.name, title: o.name }),
        el('div', { class: 'result-sub', text: [formatBytes(o.blob.size), o.note].filter(Boolean).join(' · ') }),
      ]),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: `${icon('download', 16)}<span>${t('tool.download')}</span>`,
        onclick: () => PDFApp.download(o.blob, o.name) }),
    ])));
    const many = state.outputs.length > 1;
    $('#done-title').textContent = many ? t('tool.readyMany', { n: state.outputs.length }) : t('tool.readyOne');
    $('#download-main').innerHTML = `${icon('download', 20)}<span>${many ? t('tool.downloadAll') : t('tool.download')}</span>`;
    showStage('done');
  }

  $('#download-main').addEventListener('click', async () => {
    if (state.outputs.length === 1) return PDFApp.download(state.outputs[0].blob, state.outputs[0].name);
    busy(true, t('tool.zipping'));
    try {
      const zipped = await PDFApp.zip(state.outputs.map((o) => ({ name: o.name, data: o.blob })));
      PDFApp.download(zipped, `${baseName(state.files[0].name)}_${tool.id}.zip`);
    } finally {
      busy(false);
    }
  });

  // Pass the results to another tool without downloading and re-uploading them.
  $('#continue-btn').addEventListener('click', async () => {
    const kinds = new Set(state.outputs.map((o) => (o.blob.type === 'application/pdf' ? 'pdf' : o.blob.type.startsWith('image/') ? 'image' : 'other')));
    const kind = kinds.size === 1 ? [...kinds][0] : null;
    const items = PDFTools.list
      .filter((x) => !x.soon && x.id !== tool.id && x.accept !== 'office' && (x.accept === kind || (x.href && kind === 'pdf')))
      .filter((x) => !x.requires || state.caps[x.requires])
      .map((x) => ({ value: x.id, label: L(x.name), icon: x.icon, color: x.color }));
    const next = await PDFApp.choose({ title: t('tool.continueTitle'), items, empty: t('tool.continueNone') });
    if (!next) return;
    await PDFApp.handoff.put(state.outputs);
    const target = PDFTools.get(next);
    location.href = target.href ? `${target.href}${target.href.includes('?') ? '&' : '?'}from=handoff` : `tool.html?tool=${next}&from=handoff`;
  });
  $('#back-btn').addEventListener('click', () => showStage('work'));
  $('#restart-btn').addEventListener('click', reset);

  init();
})();
