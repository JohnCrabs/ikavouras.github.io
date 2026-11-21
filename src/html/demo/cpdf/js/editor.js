/* CPDF — visual editor (editor.html).
 *
 * Pages are rendered with pdf.js; annotations live as DOM elements in a layer above each page.
 * Annotation geometry is stored in unscaled viewport units (1 unit = 1 PDF point at zoom 100%),
 * so zooming only re-renders. On download, pdf-lib draws each annotation into the original PDF,
 * converting coordinates with viewport.convertToPdfPoint (handles page rotation and crop offsets).
 *
 * Annotation types: text, textEdit (replaces an existing line of text), ink, line (arrow flag),
 * highlight, rect, ellipse, whiteout, image, stamp (exact-size box that a signature is fitted into).
 */
(function () {
  'use strict';
  const { $, $$, el, icon, toast, clamp } = PDFApp;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TOOLS = [
    { id: 'select', icon: 'pointer', key: 'v' },
    { id: 'editText', icon: 'textCursor', key: 'e' },
    { id: 'text', icon: 'type', key: 't' },
    { id: 'ink', icon: 'pen', key: 'd' },
    { id: 'highlight', icon: 'highlighter', key: 'h' },
    { id: 'rect', icon: 'square', key: 'r' },
    { id: 'ellipse', icon: 'circle', key: 'o' },
    { id: 'line', icon: 'line', key: 'l' },
    { id: 'arrow', icon: 'arrow', key: 'a' },
    { id: 'whiteout', icon: 'eraser', key: 'w' },
    { id: 'image', icon: 'image', key: 'i' },
    { id: 'stamp', icon: 'stamp', key: 'b' },
    { id: 'sign', icon: 'sign', key: 's' },
  ];

  // Style defaults for new items; editing a control with no selection updates the active tool's defaults.
  const DEFAULTS = {
    text: { color: '#111827', fontSize: 16, opacity: 1, font: 'sans', bold: false, italic: false },
    ink: { color: '#1d4ed8', stroke: 3, opacity: 1 },
    highlight: { color: '#facc15', opacity: 0.4 },
    rect: { color: '#dc2626', stroke: 2, opacity: 1 },
    ellipse: { color: '#dc2626', stroke: 2, opacity: 1 },
    line: { color: '#111827', stroke: 2, opacity: 1 },
    arrow: { color: '#dc2626', stroke: 3, opacity: 1 },
    stamp: { color: '#2563eb', printBorder: false },
  };
  const PROPS_FOR = {
    text: ['color', 'font', 'fontSize', 'style', 'opacity'],
    textEdit: ['color', 'font', 'fontSize', 'style'],
    ink: ['color', 'stroke', 'opacity'],
    line: ['color', 'stroke', 'opacity'],
    arrow: ['color', 'stroke', 'opacity'],
    highlight: ['color', 'opacity'],
    rect: ['color', 'stroke', 'opacity'],
    ellipse: ['color', 'stroke', 'opacity'],
    image: ['opacity'],
    whiteout: [],
    stamp: ['color', 'printBorder'],
  };
  const CSS_FONT = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
  const LINE_HEIGHT = 1.2;
  const BASELINE = 0.94; // baseline offset within a line box, in em (matches Helvetica/Arial at line-height 1.2)

  const state = {
    bytes: null, name: '', pdf: null, pages: [], scale: 1,
    tool: 'select', annots: [], selectedId: null, editingId: null,
    history: [], future: [], clipboard: null, current: 0, renderGen: 0,
  };
  let nextId = 1;
  let propBatch = false;

  const ui = {
    stage: $('#stage'), pages: $('#pages'), empty: $('#empty'), thumbs: $('#thumbs'),
    fileInput: $('#file-input'), dropInput: $('#drop-input'), imageInput: $('#image-input'),
    toolGroup: $('#tool-group'), fileName: $('#file-name'),
    color: $('#prop-color'), stroke: $('#prop-stroke'), font: $('#prop-font'), fontSize: $('#prop-font-size'),
    bold: $('#prop-bold'), italic: $('#prop-italic'), opacity: $('#prop-opacity'), printBorder: $('#prop-print-border'),
    propHint: $('#prop-hint'), zoomLabel: $('#zoom-label'), pageIndicator: $('#page-indicator'),
    undo: $('#undo-btn'), redo: $('#redo-btn'), del: $('#delete-btn'), download: $('#download-btn'),
  };

  const params = new URLSearchParams(location.search);
  const signMode = params.get('mode') === 'sign';
  PDFApp.recent.add(signMode ? 'sign' : 'edit');
  document.title = `${t(signMode ? 'ed.signTitle' : 'ed.title')} — CPDF`;
  $('#empty-title').textContent = t(signMode ? 'ed.signTitle' : 'ed.title');
  $('#empty-desc').textContent = t(signMode ? 'ed.signDesc' : 'ed.desc');
  $('#empty-icon').innerHTML = icon(signMode ? 'sign' : 'edit', 34);

  /* ================= Toolbar ================= */
  ui.toolGroup.append(...TOOLS.map((tl) => el('button', {
    class: `icon-btn tool-btn${tl.id === 'select' ? ' active' : ''}`, type: 'button', dataset: { tool: tl.id },
    title: `${t(`ed.tool.${tl.id}`)} (${tl.key.toUpperCase()})`, 'aria-label': t(`ed.tool.${tl.id}`), html: icon(tl.icon, 19),
    onclick: () => setTool(tl.id),
  })));

  function requireDoc() {
    if (state.pdf) return true;
    toast(t('ed.openFirst'), 'warn');
    return false;
  }

  function setTool(id, force) {
    if (id === 'image') { if (requireDoc()) ui.imageInput.click(); return; }
    if (id === 'sign') { if (requireDoc()) openSignature(); return; }
    if (id === 'stamp' && !force) { if (requireDoc()) openStampDialog(); return; }
    commitEditing();
    stampGhost.remove();
    state.tool = id;
    $$('.tool-btn').forEach((b) => b.classList.toggle('active', b.dataset.tool === id));
    ui.pages.dataset.tool = id;
    if (id !== 'select') select(null);
    if (id === 'editText') showTextLines();
    syncProps();
  }

  function syncProps() {
    const a = selected();
    const type = a ? (a.type === 'line' && a.arrow ? 'arrow' : a.type) : state.tool;
    const src = a || DEFAULTS[type] || {};
    const used = PROPS_FOR[type] || [];
    $$('[data-prop]').forEach((n) => { n.hidden = !used.includes(n.dataset.prop); });
    ui.propHint.hidden = used.length > 0;
    ui.propHint.textContent = state.tool === 'editText' && !a ? t('ed.editTextHint') : a && a.type === 'whiteout' ? t('ed.whiteoutHint') : t('ed.pickHint');
    if (state.tool === 'editText' && !a) ui.propHint.hidden = false;
    if (src.color) ui.color.value = src.color;
    if (src.stroke) ui.stroke.value = src.stroke;
    if (src.fontSize) ui.fontSize.value = Math.round(src.fontSize * 10) / 10;
    if (src.font) ui.font.value = src.font;
    ui.bold.classList.toggle('active', !!src.bold);
    ui.italic.classList.toggle('active', !!src.italic);
    if (src.opacity != null) ui.opacity.value = src.opacity;
    if (src.printBorder != null) ui.printBorder.checked = !!src.printBorder;
    ui.del.disabled = !a;
  }

  function onProp(name, value) {
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    const a = selected();
    if (a) {
      if (!propBatch) { pushHistory(); propBatch = true; }
      a[name] = value;
      if (a.type === 'textEdit') {
        a.styleChanged = true;
        // A different typeface means the page's own font can no longer be reused for this line.
        if (['font', 'bold', 'italic'].includes(name)) a.keepFont = false;
      }
      const node = annotEl(a);
      styleAnnot(node, a);
      if (a.type === 'text' || a.type === 'textEdit') measure(a, node);
    } else {
      const key = state.tool === 'editText' ? null : state.tool;
      if (DEFAULTS[key]) DEFAULTS[key][name] = value;
    }
  }
  const bindProp = (input, name, parse) => {
    input.addEventListener('input', () => onProp(name, parse(input.value)));
    input.addEventListener('change', () => { if (input.type !== 'select-one') propBatch = false; else { onProp(name, parse(input.value)); propBatch = false; } });
  };
  bindProp(ui.color, 'color', (v) => v);
  bindProp(ui.stroke, 'stroke', Number);
  bindProp(ui.fontSize, 'fontSize', (v) => clamp(Number(v) || 12, 4, 144));
  bindProp(ui.opacity, 'opacity', Number);
  ui.font.addEventListener('change', () => { onProp('font', ui.font.value); propBatch = false; });
  ui.printBorder.addEventListener('change', () => { onProp('printBorder', ui.printBorder.checked); propBatch = false; });
  for (const [btn, name] of [[ui.bold, 'bold'], [ui.italic, 'italic']]) {
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep text editing focus
    btn.addEventListener('click', () => {
      const a = selected();
      const next = !(a ? a[name] : (DEFAULTS.text || {})[name]);
      onProp(name, next);
      propBatch = false;
      btn.classList.toggle('active', next);
    });
  }

  /* ================= Loading ================= */
  ui.fileInput.addEventListener('change', () => { if (ui.fileInput.files[0]) openFile(ui.fileInput.files[0]); ui.fileInput.value = ''; });
  ui.dropInput.addEventListener('change', () => { if (ui.dropInput.files[0]) openFile(ui.dropInput.files[0]); ui.dropInput.value = ''; });
  $('#open-btn').addEventListener('click', () => ui.fileInput.click());

  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (PDFApp.isPdf(f)) openFile(f);
    else if (f.type.startsWith('image/') && state.pdf) imageFileToData(f).then((img) => placeImage(img, false));
    else toast(t('ed.dropPdf'), 'warn');
  });

  async function openFile(file) {
    if (!PDFApp.isPdf(file)) return toast(t('ed.choosePdf'), 'error');
    if (state.annots.length && !confirm(t('ed.discard'))) return;
    try {
      const ready = await PDFApp.preparePdf(new Uint8Array(await file.arrayBuffer()), file.name);
      if (!ready) return;
      PDFApp.busy(true, t('ed.opening'));
      if (state.pdf) state.pdf.destroy();
      // pdf-lib copy of the document, used to read the content streams for text editing.
      const libDoc = await PDFLib.PDFDocument.load(ready.bytes, { ignoreEncryption: true });
      Object.assign(state, { bytes: ready.bytes, name: file.name, pdf: ready.pdf, libDoc, pages: [], annots: [], history: [], future: [], selectedId: null, editingId: null, current: 0, calib: null });
      for (let i = 1; i <= ready.pdf.numPages; i++) {
        const page = await ready.pdf.getPage(i);
        state.pages.push({ page, vp: page.getViewport({ scale: 1 }) });
      }
      ui.empty.hidden = true;
      ui.fileName.textContent = file.name;
      ui.fileName.title = file.name;
      ui.download.disabled = false;
      buildThumbs(); // populate the sidebar first so the fit-to-width measurement accounts for it
      state.scale = fitScale();
      buildPages();
      updateUndo();
      setTool('select');
      ui.stage.scrollTop = 0;
      if (signMode) setTimeout(openSignature, 300);
    } catch (err) {
      console.error(err);
      toast(PDFApp.friendlyError(err), 'error');
    } finally {
      PDFApp.busy(false);
    }
  }

  /* ================= Page rendering ================= */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) renderCanvas(+en.target.dataset.index); });
  }, { root: ui.stage, rootMargin: '800px 0px' });

  function fitScale() {
    const widest = Math.max(...state.pages.map((p) => p.vp.width));
    // Leave room for the page padding and a vertical scrollbar that may appear once pages are added.
    return clamp((ui.stage.clientWidth - 80) / widest, 0.25, 1.5);
  }

  function buildPages() {
    commitEditing();
    state.renderGen++;
    io.disconnect();
    const s = state.scale;
    ui.pages.replaceChildren();
    state.pages.forEach((p, i) => {
      const w = Math.floor(p.vp.width * s), h = Math.floor(p.vp.height * s);
      p.canvas = el('canvas', { class: 'page-canvas', style: `width:${w}px;height:${h}px` });
      p.layer = el('div', { class: 'layer' });
      p.layer.addEventListener('pointerdown', (e) => onLayerDown(e, i));
      p.layer.addEventListener('dblclick', onLayerDblClick);
      p.wrap = el('div', { class: 'page', style: `width:${w}px;height:${h}px`, dataset: { index: i } }, [p.canvas, p.layer]);
      p.renderedGen = 0;
      ui.pages.append(p.wrap);
      io.observe(p.wrap);
    });
    renderAnnots();
    if (state.tool === 'editText') showTextLines();
    ui.zoomLabel.textContent = `${Math.round(s * 100)}%`;
    updatePageIndicator();
  }

  async function renderCanvas(i) {
    const p = state.pages[i];
    const gen = state.renderGen;
    if (!p || p.renderedGen === gen) return;
    p.renderedGen = gen;
    const dpr = window.devicePixelRatio || 1;
    // Cap the backing store so very high zoom levels don't exhaust memory.
    const rs = Math.min(state.scale * dpr, 6000 / Math.max(p.vp.width, p.vp.height));
    const vp = p.page.getViewport({ scale: rs });
    const off = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
    try {
      await p.page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;
      if (gen !== state.renderGen) return;
      p.canvas.width = off.width;
      p.canvas.height = off.height;
      p.canvas.getContext('2d').drawImage(off, 0, 0);
    } catch (err) {
      console.error(err);
    }
  }

  function setZoom(scale) {
    scale = clamp(scale, 0.25, 4);
    if (!state.pdf || Math.abs(scale - state.scale) < 0.001) return;
    const ratio = ui.stage.scrollTop / Math.max(1, ui.stage.scrollHeight);
    state.scale = scale;
    buildPages();
    ui.stage.scrollTop = ratio * ui.stage.scrollHeight;
  }
  $('#zoom-in').addEventListener('click', () => setZoom(state.scale * 1.2));
  $('#zoom-out').addEventListener('click', () => setZoom(state.scale / 1.2));
  ui.zoomLabel.addEventListener('click', () => state.pdf && setZoom(fitScale()));
  ui.stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !state.pdf) return;
    e.preventDefault();
    setZoom(state.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  ui.stage.addEventListener('scroll', () => {
    const mid = ui.stage.getBoundingClientRect().top + ui.stage.clientHeight / 2;
    let cur = 0;
    state.pages.forEach((p, i) => { if (p.wrap.getBoundingClientRect().top <= mid) cur = i; });
    if (cur !== state.current) { state.current = cur; updatePageIndicator(); }
  }, { passive: true });

  function updatePageIndicator() {
    ui.pageIndicator.textContent = state.pdf ? `${state.current + 1} / ${state.pages.length}` : '';
    $$('.thumb-item', ui.thumbs).forEach((tEl, i) => tEl.classList.toggle('active', i === state.current));
  }

  async function buildThumbs() {
    const doc = state.pdf;
    ui.thumbs.replaceChildren(...state.pages.map((p, i) => el('button', {
      class: 'thumb-item', type: 'button', 'aria-label': t('ed.goPage', { n: i + 1 }),
      onclick: () => p.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }, [el('div', { class: 'thumb-frame' }), el('span', { text: i + 1 })])));
    updatePageIndicator();
    const frames = $$('.thumb-frame', ui.thumbs);
    for (let i = 0; i < frames.length; i++) {
      if (state.pdf !== doc) return;
      const c = await PDFApp.renderPage(doc, i + 1, { width: 110 * Math.min(2, window.devicePixelRatio || 1) }).catch(() => null);
      if (!c || !frames[i].isConnected) return;
      frames[i].append(c);
    }
  }

  /* ================= Existing text (Edit text tool) ================= */
  // Lines come from js/pdf-text.js, which interprets the page's content stream: every line knows exactly
  // which operators draw it, so saving removes the old text from the file instead of covering it.
  // Line geometry is in PDF user space (works on rotated pages); it is mapped to the screen here.

  /** Screen geometry of a line: top-left corner, angle on screen and the four corners of its box. */
  function lineBox(p, l) {
    const [dx, dy] = l.dir;
    const at = (t, u) => p.vp.convertToViewportPoint(l.origin.x + dx * t - dy * u, l.origin.y + dy * t + dx * u);
    const asc = l.size * 0.92, desc = l.size * 0.26;
    const o = at(0, 0), e = at(1, 0);
    return { tl: at(0, asc), corners: [at(0, asc), at(l.width, asc), at(0, -desc), at(l.width, -desc)], angle: Math.atan2(e[1] - o[1], e[0] - o[0]) };
  }

  function loadLines(pi) {
    const p = state.pages[pi];
    if (!p.linesPromise) {
      p.linesPromise = PDFText.pageLines(state.libDoc.getPage(pi), p.page, pi)
        .catch((err) => { console.error(err); return []; })
        .then((lines) => (p.lineList = lines));
    }
    return p.linesPromise;
  }

  async function showTextLines() {
    for (const [pi, p] of state.pages.entries()) {
      if (!p.layer) continue;
      const lines = await loadLines(pi);
      if (state.tool !== 'editText') return;
      $$('.text-line', p.layer).forEach((n) => n.remove());
      const edited = new Set(state.annots.filter((a) => a.type === 'textEdit' && a.page === pi).map((a) => a.lineId));
      const s = state.scale;
      for (const l of lines) {
        if (edited.has(l.id)) continue;
        const b = lineBox(p, l);
        p.layer.append(el('div', {
          class: 'text-line', dataset: { line: l.id }, title: l.text,
          style: `left:${b.tl[0] * s}px;top:${b.tl[1] * s}px;width:${l.width * s + 3}px;height:${l.size * 1.18 * s}px;transform:rotate(${b.angle}rad)`,
        }));
      }
    }
  }

  /** Samples the background (and a fallback text colour) of a line from an off-screen render of the page. */
  async function sampleColors(pi, l) {
    const p = state.pages[pi];
    p.sample = p.sample || PDFApp.renderPage(state.pdf, pi + 1, { scale: 2, intent: 'print' });
    const canvas = await p.sample;
    const k = canvas.width / p.vp.width;
    const xs = lineBox(p, l).corners.map((c) => c[0]), ys = lineBox(p, l).corners.map((c) => c[1]);
    const x = Math.max(0, Math.floor((Math.min(...xs) - 2) * k)), y = Math.max(0, Math.floor((Math.min(...ys) - 1) * k));
    const w = Math.max(1, Math.min(canvas.width - x, Math.ceil((Math.max(...xs) - Math.min(...xs) + 4) * k)));
    const h = Math.max(1, Math.min(canvas.height - y, Math.ceil((Math.max(...ys) - Math.min(...ys) + 2) * k)));
    const data = canvas.getContext('2d').getImageData(x, y, w, h).data;
    // Group pixels into coarse colour buckets, but keep each bucket's exact average colour.
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
      buckets.set(key, b);
    }
    const sorted = [...buckets.values()].sort((m, n) => n.n - m.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n].map(Math.round));
    const bg = sorted[0];
    const fg = sorted.find((c) => Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 150) || [17, 17, 17];
    const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    return { bg: hex(bg), fg: hex(fg) };
  }

  async function editExistingLine(pi, lineId) {
    const l = (await loadLines(pi)).find((x) => x.id === lineId);
    if (!l) return;
    const sampled = await sampleColors(pi, l);
    const hex = (c) => `#${c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
    pushHistory();
    const a = add({
      type: 'textEdit', page: pi, lineId, ux: l.origin.x, uy: l.origin.y, angle: l.angle, lineWidth: l.width,
      text: l.text, original: l.text, fontSize: l.size, font: l.font, bold: l.bold, italic: l.italic,
      color: l.fill ? hex(l.fill) : sampled.fg, bg: sampled.bg, opacity: 1,
      removable: l.removable, reusable: l.reusable, fontKey: l.fontKey, encoding: l.encoding, keepFont: true, styleChanged: false,
    });
    const hit = ui.pages.querySelector(`.text-line[data-line="${lineId}"]`);
    if (hit) hit.remove();
    startEditing(a.id, true);
  }

  /* ================= Annotations: model ================= */
  const byId = (id) => state.annots.find((a) => a.id === +id);
  const selected = () => (state.selectedId ? byId(state.selectedId) : null);
  const annotEl = (a) => a && ui.pages.querySelector(`.annot[data-id="${a.id}"]`);

  function add(a) {
    a.id = nextId++;
    state.annots.push(a);
    state.pages[a.page].layer.append(buildAnnot(a));
    return a;
  }

  function removeAnnot(id) {
    const a = byId(id);
    state.annots = state.annots.filter((x) => x.id !== +id);
    const node = ui.pages.querySelector(`.annot[data-id="${id}"]`);
    if (node) node.remove();
    if (state.selectedId === +id) select(null);
    if (a && a.type === 'textEdit' && state.tool === 'editText') showTextLines();
  }

  function select(id) {
    state.selectedId = id ? +id : null;
    $$('.annot', ui.pages).forEach((n) => n.classList.toggle('selected', +n.dataset.id === state.selectedId));
    state.annots.forEach((a) => { if (cropBoxOf(a)) applyCrop(annotEl(a), a); });
    propBatch = false;
    syncProps();
  }

  /** The stamp box an image is cropped by (fit "crop"), if any. */
  function cropBoxOf(a) {
    if (!a || a.type !== 'image' || !a.boxId) return null;
    const b = byId(a.boxId);
    return b && b.type === 'stamp' && b.fit === 'crop' && b.page === a.page ? b : null;
  }

  /** On screen, a cropped image shows only the part inside its box. While it is selected the whole image is
   *  shown, faded outside the box, so the visible part can be chosen by dragging and zooming it. */
  function applyCrop(node, a) {
    if (!node) return;
    const st = node.style, b = cropBoxOf(a), s = state.scale;
    const setMask = (v, size = '', pos = '') => {
      for (const k of ['mask', 'webkitMask']) {
        st[`${k}Image`] = v; st[`${k}Size`] = size; st[`${k}Position`] = pos; st[`${k}Repeat`] = v ? 'no-repeat' : '';
      }
    };
    if (!b) { st.clipPath = ''; setMask(''); return; }
    const l = (b.x - a.x) * s, tp = (b.y - a.y) * s, r = (a.x + a.w - b.x - b.w) * s, bt = (a.y + a.h - b.y - b.h) * s;
    if (a.id === state.selectedId) {
      st.clipPath = '';
      setMask('linear-gradient(#000, #000), linear-gradient(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.3))',
        `${b.w * s}px ${b.h * s}px, 100% 100%`, `${l}px ${tp}px, 0 0`);
    } else {
      setMask('');
      st.clipPath = `inset(${Math.max(0, tp)}px ${Math.max(0, r)}px ${Math.max(0, bt)}px ${Math.max(0, l)}px)`;
    }
  }

  function pushHistory() {
    state.history.push(JSON.stringify(state.annots));
    if (state.history.length > 100) state.history.shift();
    state.future = [];
    updateUndo();
  }

  function restore(from, to) {
    commitEditing();
    const snap = from.pop();
    if (snap == null) return;
    to.push(JSON.stringify(state.annots));
    state.annots = JSON.parse(snap);
    nextId = Math.max(nextId, ...state.annots.map((a) => a.id + 1));
    state.selectedId = null;
    renderAnnots();
    if (state.tool === 'editText') showTextLines();
    syncProps();
    updateUndo();
  }
  const undo = () => restore(state.history, state.future);
  const redo = () => restore(state.future, state.history);

  function updateUndo() {
    ui.undo.disabled = !state.history.length;
    ui.redo.disabled = !state.future.length;
  }

  function copySelected() {
    const a = selected();
    if (a && a.type !== 'textEdit') state.clipboard = JSON.stringify(a);
  }

  function paste() {
    if (!state.clipboard || !state.pdf) return;
    const a = JSON.parse(state.clipboard);
    const pi = a.page === state.current ? a.page : state.current;
    const vp = state.pages[pi].vp;
    pushHistory();
    a.page = pi;
    a.x = clamp(a.x + 14, 0, vp.width - 10);
    a.y = clamp(a.y + 14, 0, vp.height - 10);
    if (a.type === 'line') { /* relative points move with x/y */ }
    const copy = add(a);
    state.clipboard = JSON.stringify(copy);
    setTool('select');
    select(copy.id);
  }

  /* ================= Annotations: view ================= */
  function renderAnnots() {
    $$('.annot', ui.pages).forEach((n) => n.remove());
    state.annots.forEach((a) => state.pages[a.page].layer.append(buildAnnot(a)));
  }

  function svgLine(a) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${a.vw} ${a.vh}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', a.points.map((p) => p.join(',')).join(' '));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
    if (a.arrow) {
      const head = document.createElementNS(SVG_NS, 'polyline');
      head.classList.add('arrow-head');
      head.setAttribute('fill', 'none');
      head.setAttribute('stroke-linecap', 'round');
      head.setAttribute('stroke-linejoin', 'round');
      head.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(head);
    }
    return svg;
  }

  /** Arrow head points (in the annotation's own coordinates) for a line from p0 to p1. */
  function arrowHead(a, sx = 1, sy = 1) {
    const [x0, y0] = [a.points[0][0] * sx, a.points[0][1] * sy];
    const [x1, y1] = [a.points[1][0] * sx, a.points[1][1] * sy];
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.max(8, a.stroke * 4);
    const wing = (d) => [x1 - len * Math.cos(ang + d), y1 - len * Math.sin(ang + d)];
    return [wing(0.45), [x1, y1], wing(-0.45)];
  }

  function buildAnnot(a) {
    const node = el('div', { class: `annot annot-${a.type}`, dataset: { id: a.id } });
    if (a.type === 'text' || a.type === 'textEdit') node.textContent = a.text;
    if (a.type === 'image') node.append(el('img', { src: a.src, alt: '', draggable: 'false' }));
    if (a.type === 'ink' || a.type === 'line') node.append(svgLine(a));
    if (a.type === 'textEdit') node.dataset.placeholder = t('ed.typeHere');
    if (a.type === 'text') node.dataset.placeholder = t('ed.typeHere');
    if (!['text', 'textEdit', 'stamp'].includes(a.type)) node.append(el('span', { class: 'handle', dataset: { handle: 'se' } }));
    styleAnnot(node, a);
    return node;
  }

  function styleAnnot(node, a) {
    if (!node) return;
    const s = state.scale, st = node.style;
    st.left = `${a.x * s}px`;
    st.top = `${a.y * s}px`;
    st.opacity = a.type === 'whiteout' || a.type === 'textEdit' ? 1 : a.opacity;
    if (a.type === 'text' || a.type === 'textEdit') {
      st.fontSize = `${a.fontSize * s}px`;
      st.color = a.color;
      st.fontFamily = CSS_FONT[a.font || 'sans'];
      st.fontWeight = a.bold ? '700' : '400';
      st.fontStyle = a.italic ? 'italic' : 'normal';
      if (a.type === 'textEdit') {
        // Placed on the original baseline (user space → screen), rotated like the original line.
        // On screen it hides the old glyphs of the page image; in the saved file they are removed.
        const vp = state.pages[a.page].vp;
        const o = vp.convertToViewportPoint(a.ux, a.uy);
        const e = vp.convertToViewportPoint(a.ux + Math.cos(a.angle), a.uy + Math.sin(a.angle));
        const fs = a.fontSize * s;
        st.left = `${o[0] * s}px`;
        st.top = `${o[1] * s - BASELINE * fs}px`;
        st.transformOrigin = `0 ${BASELINE * fs}px`;
        st.transform = `rotate(${Math.atan2(e[1] - o[1], e[0] - o[0])}rad)`;
        st.background = a.bg;
        st.minWidth = `${a.lineWidth * s}px`;
        st.boxShadow = `0 0 0 ${2 * s}px ${a.bg}`;
      }
    } else {
      st.width = `${a.w * s}px`;
      st.height = `${a.h * s}px`;
    }
    if (a.type === 'rect' || a.type === 'ellipse') st.border = `${Math.max(1, a.stroke * s)}px solid ${a.color}`;
    if (a.type === 'highlight') st.background = a.color;
    if (a.type === 'stamp') {
      st.setProperty('--stamp', a.color);
      st.borderWidth = `${Math.max(1, a.stroke * s)}px`;
      node.classList.toggle('printed', !!a.printBorder);
      node.dataset.label = a.label || '';
    }
    if (a.type === 'ink' || a.type === 'line') {
      node.querySelectorAll('polyline').forEach((pl) => {
        pl.setAttribute('stroke', a.color);
        pl.setAttribute('stroke-width', a.stroke * s);
      });
      const head = node.querySelector('.arrow-head');
      if (head) head.setAttribute('points', arrowHead(a).map((p) => p.join(',')).join(' '));
    }
    if (a.type === 'image') applyCrop(node, a);
    node.classList.toggle('selected', a.id === state.selectedId);
  }

  function measure(a, node) {
    a.w = node.offsetWidth / state.scale;
    a.h = node.offsetHeight / state.scale;
  }

  /* ================= Pointer interaction ================= */
  function pagePoint(e, pi) {
    const r = state.pages[pi].layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / state.scale, y: (e.clientY - r.top) / state.scale };
  }

  function drag(onMove, onUp) {
    const move = (ev) => onMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (onUp) onUp(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Bounding box + relative points for a polyline in page units. */
  function polyFrom(pts, stroke) {
    const pad = stroke / 2 + 1;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    return { x, y, w, h, vw: w, vh: h, points: pts.map(([px, py]) => [+(px - x).toFixed(2), +(py - y).toFixed(2)]) };
  }

  function onLayerDown(e, pi) {
    if (e.button !== 0) return;
    const node = e.target.closest('.annot');
    if (state.editingId && node && +node.dataset.id === state.editingId) return; // caret placement inside the text box
    commitEditing();
    const pt = pagePoint(e, pi);
    const vp = state.pages[pi].vp;
    const tool = state.tool;

    if (tool === 'editText') {
      e.preventDefault();
      const hit = e.target.closest('.text-line');
      if (hit) { editExistingLine(pi, hit.dataset.line); return; }
      if (node && node.classList.contains('annot-textEdit')) { startEditing(+node.dataset.id); return; }
      if (state.pages[pi].lineList && !state.pages[pi].lineList.length) toast(t('ed.noText'), 'info', 4500);
      return;
    }

    if (tool === 'select') {
      if (!node) { select(null); return; }
      e.preventDefault();
      const a = byId(node.dataset.id);
      select(a.id);
      if (a.type === 'textEdit') return; // stays where the original text was
      const resizing = e.target.dataset.handle === 'se';
      const start = { x: a.x, y: a.y, w: a.w, h: a.h };
      const linked = linkedTo(a).map((l) => ({ l, x: l.x, y: l.y }));
      let moved = false;
      drag((ev) => {
        const p = pagePoint(ev, pi);
        const dx = p.x - pt.x, dy = p.y - pt.y;
        if (!moved && Math.hypot(dx, dy) * state.scale < 3) return;
        if (!moved) { pushHistory(); moved = true; }
        if (resizing) {
          a.w = Math.max(6, start.w + dx);
          a.h = a.type === 'image' && !ev.shiftKey ? a.w * (start.h / start.w) : Math.max(6, start.h + dy);
        } else {
          a.x = clamp(start.x + dx, -a.w / 2, vp.width - a.w / 2);
          a.y = clamp(start.y + dy, -a.h / 2, vp.height - a.h / 2);
          linked.forEach((k) => { k.l.x = k.x + a.x - start.x; k.l.y = k.y + a.y - start.y; styleAnnot(annotEl(k.l), k.l); });
        }
        styleAnnot(node, a);
      });
      return;
    }

    if (tool === 'stamp') {
      e.preventDefault();
      const sz = state.stampSize;
      if (!sz) return;
      const d = DEFAULTS.stamp;
      pushHistory();
      const a = add({
        type: 'stamp', page: pi, w: sz.w, h: sz.h, label: sz.label, fit: sz.fit, color: d.color, printBorder: d.printBorder, stroke: 0.5, opacity: 1,
        x: clamp(pt.x - sz.w / 2, 0, Math.max(0, vp.width - sz.w)), y: clamp(pt.y - sz.h / 2, 0, Math.max(0, vp.height - sz.h)),
      });
      setTool('select');
      select(a.id);
      // Straight on to the box's content: an image file (e.g. a scanned stamp) or a signature.
      if (sz.content === 'image') ui.imageInput.click();
      else openSignature();
      return;
    }

    if (tool === 'text') {
      e.preventDefault();
      if (node && node.classList.contains('annot-text')) { startEditing(+node.dataset.id); return; }
      const d = DEFAULTS.text;
      pushHistory();
      const a = add({ type: 'text', page: pi, x: pt.x, y: pt.y - d.fontSize * 0.6, w: 0, h: 0, text: '', color: d.color, fontSize: d.fontSize, opacity: d.opacity, font: d.font, bold: d.bold, italic: d.italic });
      startEditing(a.id, true);
      return;
    }

    if (['rect', 'ellipse', 'highlight', 'whiteout'].includes(tool)) {
      e.preventDefault();
      const d = DEFAULTS[tool] || {};
      pushHistory();
      const a = add({ type: tool, page: pi, x: pt.x, y: pt.y, w: 0, h: 0, color: d.color || '#ffffff', stroke: d.stroke || 0, opacity: d.opacity == null ? 1 : d.opacity });
      const aNode = annotEl(a);
      drag((ev) => {
        const p = pagePoint(ev, pi);
        a.x = Math.min(p.x, pt.x);
        a.y = Math.min(p.y, pt.y);
        a.w = Math.abs(p.x - pt.x);
        a.h = Math.abs(p.y - pt.y);
        if (ev.shiftKey && tool === 'ellipse') a.w = a.h = Math.max(a.w, a.h);
        styleAnnot(aNode, a);
      }, () => {
        if (a.w < 3 || a.h < 3) { removeAnnot(a.id); state.history.pop(); updateUndo(); }
      });
      return;
    }

    if (tool === 'ink' || tool === 'line' || tool === 'arrow' || tool === 'calibrate') {
      e.preventDefault();
      const d = tool === 'calibrate' ? { color: '#e11d48', stroke: 1.5, opacity: 1 } : DEFAULTS[tool], s = state.scale;
      let pts = [[pt.x, pt.y]];
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.classList.add('ink-live');
      svg.style.opacity = d.opacity;
      const line = document.createElementNS(SVG_NS, 'polyline');
      Object.entries({ fill: 'none', stroke: d.color, 'stroke-width': d.stroke * s, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
        .forEach(([k, v]) => line.setAttribute(k, v));
      svg.append(line);
      state.pages[pi].layer.append(svg);
      const redraw = () => line.setAttribute('points', pts.map((p) => `${p[0] * s},${p[1] * s}`).join(' '));
      redraw();
      drag((ev) => {
        let p = pagePoint(ev, pi);
        if (tool === 'ink') {
          const last = pts[pts.length - 1];
          if (Math.hypot(p.x - last[0], p.y - last[1]) * s < 1.5) return;
          pts.push([p.x, p.y]);
        } else {
          if (ev.shiftKey) { // snap to 45°
            const ang = Math.round(Math.atan2(p.y - pt.y, p.x - pt.x) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(p.x - pt.x, p.y - pt.y);
            p = { x: pt.x + len * Math.cos(ang), y: pt.y + len * Math.sin(ang) };
          }
          pts = [[pt.x, pt.y], [p.x, p.y]];
        }
        redraw();
      }, () => {
        svg.remove();
        if (tool === 'calibrate') { finishCalibration(pts); return; }
        if (tool !== 'ink' && (pts.length < 2 || Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 3)) return;
        pushHistory();
        add({ type: tool === 'ink' ? 'ink' : 'line', arrow: tool === 'arrow', page: pi, ...polyFrom(pts, d.stroke + (tool === 'arrow' ? d.stroke * 8 : 0)), color: d.color, stroke: d.stroke, opacity: d.opacity });
      });
    }
  }

  function onLayerDblClick(e) {
    const node = e.target.closest('.annot-text, .annot-textEdit');
    if (node && state.tool === 'select') startEditing(+node.dataset.id);
  }

  /* ================= Text editing ================= */
  function startEditing(id, isNew = false) {
    const a = byId(id), node = annotEl(a);
    if (!node) return;
    if (!isNew) pushHistory();
    select(id);
    state.editingId = a.id;
    node.classList.add('editing');
    try { node.contentEditable = 'plaintext-only'; } catch (_) { /* unsupported */ }
    if (node.contentEditable !== 'plaintext-only') node.contentEditable = 'true';
    node.addEventListener('blur', () => { if (state.editingId === a.id) commitEditing(); }, { once: true });
    setTimeout(() => {
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      if (a.type !== 'textEdit') range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  function commitEditing() {
    const id = state.editingId;
    if (!id) return;
    state.editingId = null;
    const a = byId(id), node = annotEl(a);
    if (!a || !node) return;
    node.removeAttribute('contenteditable');
    node.classList.remove('editing');
    const text = node.innerText.replace(/ /g, ' ').replace(/\n+$/, '');
    if (a.type === 'text' && !text.trim()) { removeAnnot(id); return; }
    a.text = text;
    node.textContent = text;
    measure(a, node);
  }

  ui.pages.addEventListener('paste', (e) => {
    if (!state.editingId) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  /* ================= Images & signatures ================= */
  ui.imageInput.addEventListener('change', async () => {
    const f = ui.imageInput.files[0];
    ui.imageInput.value = '';
    if (f) placeImage(await imageFileToData(f), false);
  });

  async function imageFileToData(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return { src: c.toDataURL(type, 0.92), w: c.width, h: c.height };
  }

  function placeImage({ src, w, h }, isSignature) {
    const box = selected();
    if (box && box.type === 'stamp') { fitIntoBox({ src, w, h }, box, isSignature); return; }
    const pi = state.current, p = state.pages[pi], vp = p.vp, s = state.scale;
    let width = Math.min(w * 0.75, vp.width * (isSignature ? 0.3 : 0.5));
    let height = (width * h) / w;
    if (height > vp.height * 0.5) { height = vp.height * 0.5; width = (height * w) / h; }
    // Centre on the part of the page that is currently visible.
    const stageRect = ui.stage.getBoundingClientRect(), r = p.layer.getBoundingClientRect();
    const cy = clamp((stageRect.top + stageRect.height / 2 - r.top) / s, height / 2, vp.height - height / 2);
    pushHistory();
    const a = add({ type: 'image', page: pi, x: (vp.width - width) / 2, y: cy - height / 2, w: width, h: height, src, opacity: 1 });
    setTool('select');
    select(a.id);
  }

  /** Signature images linked to a stamp box (they move with it). */
  const linkedTo = (box) => (box.type === 'stamp' ? state.annots.filter((x) => x.type === 'image' && x.boxId === box.id) : []);

  /** Puts an image into the box, replacing what was there. "contain": keeps its proportions, as large as fits,
   *  centred (signatures get a small margin); "fill": stretched to exactly the box size. */
  function fitIntoBox({ src, w, h }, box, isSignature) {
    let r;
    if (box.fit === 'fill') r = { x: box.x, y: box.y, w: box.w, h: box.h };
    else if (box.fit === 'crop') {
      const k = Math.max(box.w / w, box.h / h);
      r = { w: w * k, h: h * k };
      r.x = box.x + (box.w - r.w) / 2;
      r.y = box.y + (box.h - r.h) / 2;
    } else {
      const pad = isSignature ? Math.min(box.w, box.h) * 0.04 : 0;
      const k = Math.min((box.w - pad * 2) / w, (box.h - pad * 2) / h);
      r = { w: w * k, h: h * k };
      r.x = box.x + (box.w - r.w) / 2;
      r.y = box.y + (box.h - r.h) / 2;
    }
    pushHistory();
    linkedTo(box).forEach((x) => removeAnnot(x.id));
    const img = add({ type: 'image', page: box.page, ...r, src, opacity: 1, boxId: box.id });
    setTool('select');
    if (box.fit === 'crop') { select(img.id); toast(t('stamp.cropHint'), 'info', 7000); } else select(box.id);
  }

  /* ================= Stamp box (exact size, drawing scale) ================= */
  // Sizes are converted to PDF points (1 pt = 1/72 in). "paper": size on the printed sheet;
  // "scale": drawing units at 1:N (paper = real / N); "calib": drawing units, with points-per-mm measured
  // on this document (works even when the PDF is not at true paper size, e.g. plotted with "fit to paper").
  const PT_PER_MM = 72 / 25.4;
  const UNIT_MM = { mm: 1, cm: 10, m: 1000 };
  const STAMP_KEY = 'cpdf.stampBox';
  // Common stamp sizes on the printed sheet (one click fills in the form).
  const STAMP_PRESETS = [
    { w: 8, h: 3, unit: 'cm', content: 'image', fit: 'crop' },
  ];
  const stampCfg = Object.assign({ w: 40, h: 30, unit: 'mm', ref: 'paper', scale: 50, content: 'signature', fit: 'contain' }, (() => {
    try { return JSON.parse(localStorage.getItem(STAMP_KEY)) || {}; } catch (_) { return {}; }
  })());
  const stampUi = {
    dialog: $('#stamp-dialog'), w: $('#stamp-w'), h: $('#stamp-h'), unit: $('#stamp-unit'), scale: $('#stamp-scale'),
    info: $('#stamp-calib-info'), result: $('#stamp-result'), place: $('#stamp-place'),
    content: $('#stamp-content'), fit: $('#stamp-fit'), presets: $('#stamp-presets'),
  };
  const stampGhost = el('div', { class: 'stamp-ghost' });
  const fmt = (n, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d);
  const num = (v) => parseFloat(String(v).replace(',', '.'));

  function readStampForm() {
    stampCfg.w = num(stampUi.w.value);
    stampCfg.h = num(stampUi.h.value);
    stampCfg.unit = stampUi.unit.value;
    stampCfg.scale = num(stampUi.scale.value);
    stampCfg.ref = ($('input[name="stamp-ref"]:checked', stampUi.dialog) || {}).value || 'paper';
    stampCfg.content = stampUi.content.value;
    stampCfg.fit = stampUi.fit.value;
    try { localStorage.setItem(STAMP_KEY, JSON.stringify(stampCfg)); } catch (_) { /* storage unavailable */ }
  }

  /** PDF points per entered unit for the current settings, or an error key. */
  function stampPtsPerUnit() {
    const mm = UNIT_MM[stampCfg.unit] || 1;
    if (stampCfg.ref === 'calib') return state.calib ? { k: mm * state.calib } : { err: 'stamp.needCalib' };
    if (stampCfg.ref === 'scale') return stampCfg.scale > 0 ? { k: (mm / stampCfg.scale) * PT_PER_MM } : { err: 'stamp.invalid' };
    return { k: mm * PT_PER_MM };
  }

  /** Reads the form, refreshes the summary and returns the box size in points (null when invalid). */
  function updateStampForm() {
    readStampForm();
    stampUi.scale.classList.toggle('muted', stampCfg.ref !== 'scale');
    stampUi.info.textContent = state.calib
      ? t('stamp.calibInfo', { unit: stampCfg.unit, mm: fmt((UNIT_MM[stampCfg.unit] * state.calib) / PT_PER_MM, 3), n: fmt(PT_PER_MM / state.calib, 1) })
      : t('stamp.calibNone');
    const { k, err } = stampPtsPerUnit();
    const bad = err || (stampCfg.w > 0 && stampCfg.h > 0 ? null : 'stamp.invalid');
    stampUi.place.disabled = !!bad;
    stampUi.result.classList.toggle('warn', !!bad);
    if (bad) { stampUi.result.textContent = t(bad); return null; }
    const size = { w: stampCfg.w * k, h: stampCfg.h * k };
    const cur = state.pages[state.current];
    const tooBig = cur && (size.w > cur.vp.width || size.h > cur.vp.height);
    stampUi.result.textContent = t('stamp.result', { w: fmt(size.w / PT_PER_MM, 1), h: fmt(size.h / PT_PER_MM, 1) }) + (tooBig ? ` — ${t('stamp.tooBig')}` : '');
    stampUi.result.classList.toggle('warn', !!tooBig);
    return size;
  }

  function openStampDialog() {
    fillStampForm();
    stampUi.dialog.showModal();
  }

  stampUi.presets.append(...STAMP_PRESETS.map((ps) => el('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', text: `${ps.w} × ${ps.h} ${ps.unit}`,
    onclick: () => {
      // Preset sizes are the physical stamp, i.e. measured on the printed sheet.
      Object.assign(stampCfg, { w: ps.w, h: ps.h, unit: ps.unit, ref: 'paper' }, ps.content ? { content: ps.content } : {}, ps.fit ? { fit: ps.fit } : {});
      fillStampForm();
    },
  })));

  function fillStampForm() {
    stampUi.w.value = stampCfg.w;
    stampUi.h.value = stampCfg.h;
    stampUi.unit.value = stampCfg.unit;
    stampUi.scale.value = stampCfg.scale;
    stampUi.content.value = stampCfg.content;
    stampUi.fit.value = stampCfg.fit;
    const radio = $(`input[name="stamp-ref"][value="${stampCfg.ref}"]`, stampUi.dialog) || $('input[name="stamp-ref"]', stampUi.dialog);
    radio.checked = true;
    updateStampForm();
  }

  stampUi.dialog.addEventListener('input', updateStampForm);
  stampUi.dialog.addEventListener('change', updateStampForm);
  // Typing a scale selects the "drawing scale" option.
  stampUi.scale.addEventListener('focus', () => { $('input[name="stamp-ref"][value="scale"]', stampUi.dialog).checked = true; updateStampForm(); });
  stampUi.place.addEventListener('click', () => {
    const size = updateStampForm();
    if (!size) return;
    const extra = stampCfg.ref === 'scale' ? ` · 1:${fmt(stampCfg.scale)}` : stampCfg.ref === 'calib' ? ` · ≈1:${fmt(PT_PER_MM / state.calib, 0)}` : '';
    state.stampSize = { ...size, fit: stampCfg.fit, content: stampCfg.content, label: `${fmt(stampCfg.w)} × ${fmt(stampCfg.h)} ${stampCfg.unit}${extra}` };
    stampUi.dialog.close();
    setTool('stamp', true);
    toast(t('stamp.placeHint'), 'info', 4000);
  });
  $('#stamp-calib').addEventListener('click', () => {
    readStampForm();
    stampUi.dialog.close();
    setTool('calibrate');
    toast(t('stamp.calibHint'), 'info', 5000);
  });

  function finishCalibration(pts) {
    setTool('select');
    const len = pts.length > 1 ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0;
    if (len * state.scale < 5) { toast(t('stamp.calibShort'), 'warn'); openStampDialog(); return; }
    const real = num(prompt(t('stamp.calibAsk', { unit: stampCfg.unit })) || '');
    if (real > 0) {
      state.calib = len / (real * UNIT_MM[stampCfg.unit]); // PDF points per real-world mm
      stampCfg.ref = 'calib';
      toast(t('stamp.calibDone', { n: fmt(PT_PER_MM / state.calib, 1) }), 'success');
    }
    openStampDialog();
  }

  // Preview of the box under the pointer while placing it.
  ui.pages.addEventListener('pointermove', (e) => {
    const page = e.target.closest('.page');
    if (state.tool !== 'stamp' || !state.stampSize || !page) { stampGhost.remove(); return; }
    const pi = +page.dataset.index, p = state.pages[pi], s = state.scale, { w, h } = state.stampSize;
    const pt = pagePoint(e, pi);
    const x = clamp(pt.x - w / 2, 0, Math.max(0, p.vp.width - w)), y = clamp(pt.y - h / 2, 0, Math.max(0, p.vp.height - h));
    Object.assign(stampGhost.style, { left: `${x * s}px`, top: `${y * s}px`, width: `${w * s}px`, height: `${h * s}px` });
    if (stampGhost.parentNode !== p.layer) p.layer.append(stampGhost);
  });
  ui.pages.addEventListener('pointerleave', () => stampGhost.remove());

  let wheelAt = 0;
  ui.pages.addEventListener('wheel', (e) => {
    const a = selected();
    if (e.ctrlKey || !cropBoxOf(a) || !e.target.closest(`.annot[data-id="${a.id}"]`)) return;
    e.preventDefault();
    if (Date.now() - wheelAt > 600) pushHistory(); // one undo step per wheel gesture
    wheelAt = Date.now();
    const pt = pagePoint(e, a.page), k = e.deltaY < 0 ? 1.06 : 1 / 1.06;
    if (a.w * k < 4 || a.h * k < 4) return;
    a.x = pt.x - (pt.x - a.x) * k;
    a.y = pt.y - (pt.y - a.y) * k;
    a.w *= k;
    a.h *= k;
    styleAnnot(annotEl(a), a);
  }, { passive: false });

  const sig = {
    dialog: $('#sig-dialog'), canvas: $('#sig-canvas'), text: $('#sig-text'), preview: $('#sig-preview'),
    color: '#111827', tab: 'draw', drawn: false,
  };
  const SIG_COLORS = ['#111827', '#1d4ed8', '#b91c1c'];
  const SIG_FONT = '"Dancing Script", cursive';

  $('#sig-colors').append(...SIG_COLORS.map((c, i) => el('button', {
    type: 'button', class: `swatch${i === 0 ? ' active' : ''}`, style: `--sw:${c}`, 'aria-label': t('sig.color', { n: i + 1 }),
    onclick: (e) => {
      sig.color = c;
      $$('.swatch').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
      sig.preview.style.color = c;
    },
  })));

  $$('.tab', sig.dialog).forEach((tab) => tab.addEventListener('click', () => {
    sig.tab = tab.dataset.tab;
    $$('.tab', sig.dialog).forEach((b) => b.classList.toggle('active', b === tab));
    $$('.tab-panel', sig.dialog).forEach((p) => { p.hidden = p.dataset.panel !== sig.tab; });
    $('#sig-insert').hidden = sig.tab === 'upload';
    if (sig.tab === 'type') sig.text.focus();
  }));

  function openSignature() {
    sig.dialog.showModal();
    const dpr = window.devicePixelRatio || 1, r = sig.canvas.getBoundingClientRect();
    sig.canvas.width = Math.round(r.width * dpr);
    sig.canvas.height = Math.round(r.height * dpr);
    sig.canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    sig.drawn = false;
    $('#sig-last').hidden = !sig.last;
  }

  sig.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const ctx = sig.canvas.getContext('2d');
    const r = sig.canvas.getBoundingClientRect();
    const at = (ev) => ({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    let last = at(e), mid = last;
    Object.assign(ctx, { lineWidth: 2.6, lineCap: 'round', lineJoin: 'round', strokeStyle: sig.color });
    ctx.beginPath();
    ctx.arc(last.x, last.y, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = sig.color;
    ctx.fill();
    sig.drawn = true;
    drag((ev) => {
      const p = at(ev);
      const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.quadraticCurveTo(last.x, last.y, m.x, m.y);
      ctx.stroke();
      last = p;
      mid = m;
    });
  });
  $('#sig-clear').addEventListener('click', () => {
    const c = sig.canvas;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    sig.drawn = false;
  });
  sig.text.addEventListener('input', () => { sig.preview.textContent = sig.text.value || t('sig.preview'); });

  // Crops a canvas to its non-transparent pixels.
  function trimCanvas(c, ratio) {
    const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad = 4, w = maxX - minX + 1, h = maxY - minY + 1;
    const out = el('canvas', { width: w + pad * 2, height: h + pad * 2 });
    out.getContext('2d').drawImage(c, minX, minY, w, h, pad, pad, w, h);
    return { src: out.toDataURL('image/png'), w: out.width / ratio, h: out.height / ratio };
  }

  async function typedSignature() {
    const name = sig.text.value.trim();
    if (!name) return null;
    await document.fonts.load(`96px ${SIG_FONT}`).catch(() => {});
    const c = el('canvas', { width: 1400, height: 260 });
    const ctx = c.getContext('2d');
    ctx.font = `120px ${SIG_FONT}`;
    ctx.fillStyle = sig.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 20, 130, 1360);
    return trimCanvas(c, 2);
  }

  $('#sig-insert').addEventListener('click', async () => {
    const img = sig.tab === 'type' ? await typedSignature() : sig.drawn ? trimCanvas(sig.canvas, window.devicePixelRatio || 1) : null;
    if (!img) return toast(sig.tab === 'type' ? t('sig.typeFirst') : t('sig.drawFirst'), 'warn');
    sig.dialog.close();
    sig.last = img;
    placeImage(img, true);
  });
  $('#sig-last').addEventListener('click', () => {
    sig.dialog.close();
    if (sig.last) placeImage(sig.last, true);
  });
  $('#sig-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    sig.dialog.close();
    sig.last = await imageFileToData(f);
    placeImage(sig.last, true);
  });

  /* ================= Keyboard ================= */
  document.addEventListener('keydown', (e) => {
    if (sig.dialog.open || stampUi.dialog.open || document.querySelector('dialog.modal[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (state.editingId) {
      if (e.key === 'Escape') annotEl(byId(state.editingId)).blur();
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (mod && key === 's') { e.preventDefault(); save(); return; }
    if (mod && key === 'c') { copySelected(); return; }
    if (mod && key === 'v') { e.preventDefault(); paste(); return; }
    if (mod && key === 'd') { e.preventDefault(); copySelected(); paste(); return; }
    if (mod || e.altKey) return;

    const a = selected();
    if (a && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); pushHistory(); removeAnnot(a.id); return; }
    if (a && e.key.startsWith('Arrow') && a.type !== 'textEdit') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      pushHistory();
      if (e.key === 'ArrowLeft') a.x -= step;
      if (e.key === 'ArrowRight') a.x += step;
      if (e.key === 'ArrowUp') a.y -= step;
      if (e.key === 'ArrowDown') a.y += step;
      linkedTo(a).forEach((l) => {
        l.x += e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        l.y += e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        styleAnnot(annotEl(l), l);
      });
      styleAnnot(annotEl(a), a);
      return;
    }
    if (a && (a.type === 'text' || a.type === 'textEdit') && e.key === 'Enter') { e.preventDefault(); startEditing(a.id); return; }
    if (e.key === 'Escape') { select(null); setTool('select'); return; }
    const tl = TOOLS.find((x) => x.key === key);
    if (tl && state.pdf) setTool(tl.id);
  });

  ui.undo.addEventListener('click', undo);
  ui.redo.addEventListener('click', redo);
  ui.del.addEventListener('click', () => {
    const a = selected();
    if (a) { pushHistory(); removeAnnot(a.id); }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.annots.length) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= Export ================= */
  async function exportPdf() {
    const { PDFDocument, degrees, rgb, BlendMode, LineCapStyle, StandardFonts } = PDFLib;
    const doc = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
    const pdfPages = doc.getPages();
    const images = new Map();
    const fonts = new Map();
    const STD = {
      sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
      serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
      mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
    };
    // Standard fonts when the text is WinAnsi, otherwise the bundled Unicode font (one embedding shared by all).
    async function fontFor(a) {
      const unicode = !/^[\t\n\r\x20-\x7E\xA0-\xFF]*$/.test(a.text);
      const key = unicode ? 'unicode' : `${a.font || 'sans'}-${a.bold ? 1 : 0}-${a.italic ? 1 : 0}`;
      if (!fonts.has(key)) {
        fonts.set(key, unicode
          ? await PDFApp.embedTextFont(doc, 'Ω')
          : { font: await doc.embedFont(STD[a.font || 'sans'][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)]), clean: (s) => s });
      }
      return fonts.get(key);
    }

    // The bundled Unicode font has no bold/italic faces: fake them with an outline and a slant.
    const { pushGraphicsState, popGraphicsState, setTextRenderingMode, TextRenderingMode, setLineWidth, setStrokingColor, rectangle, clip, endPath } = PDFLib;
    function drawStyledText(page, a, line, opts, info) {
      const fake = info.unicode && (a.bold || a.italic);
      if (fake && a.bold) {
        page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline),
          setLineWidth(a.fontSize * 0.035), setStrokingColor(opts.color));
      }
      page.drawText(line, fake && a.italic ? { ...opts, xSkew: degrees(12) } : opts);
      if (fake && a.bold) page.pushOperators(popGraphicsState());
    }

    // 1) Edited lines: delete their text operators from the page content streams (before anything
    //    else is drawn on those pages). Lines that can't be removed — e.g. text inside an embedded
    //    graphic (form XObject) — fall back to being covered.
    const changedEdits = state.annots.filter((a) => a.type === 'textEdit' && (a.text !== a.original || a.styleChanged));
    const coverOnly = new Set();
    for (const pi of new Set(changedEdits.map((a) => a.page))) {
      const list = changedEdits.filter((a) => a.page === pi);
      const ids = new Set(list.filter((a) => a.removable).map((a) => a.lineId));
      let removed = new Set();
      try {
        if (ids.size) removed = await PDFText.removeLines(doc, pdfPages[pi], pi, ids);
      } catch (err) {
        console.error(err);
      }
      list.forEach((a) => { if (!removed.has(a.lineId)) coverOnly.add(a.id); });
    }
    exportPdf.covered = coverOnly.size;

    const { beginText, endText, setFontAndSize, setTextMatrix, showText, setFillingRgbColor } = PDFLib;

    for (const a of state.annots) {
      const page = pdfPages[a.page];
      const vp = state.pages[a.page].vp;
      const P = (x, y) => { const [px, py] = vp.convertToPdfPoint(x, y); return { x: px, y: py }; };
      // Direction of the viewport's x-axis in PDF space: 0° unless the page has /Rotate.
      const o = P(0, 0), ex = P(1, 0);
      const rotate = degrees((Math.atan2(ex.y - o.y, ex.x - o.x) * 180) / Math.PI);
      const color = PDFApp.hexToRgb(a.color || '#000000');
      const svgPath = (pts) => pts.map(([x, y], i) => { const q = P(x, y); return `${i ? 'L' : 'M'}${q.x.toFixed(2)} ${(-q.y).toFixed(2)}`; }).join(' ');
      const stroke = (d) => page.drawSvgPath(d, { x: 0, y: 0, borderColor: color, borderWidth: a.stroke, borderOpacity: a.opacity, borderLineCap: LineCapStyle.Round });

      switch (a.type) {
        case 'rect': {
          // CSS borders sit inside the box; PDF strokes are centred on the path.
          const sw = a.stroke, b = P(a.x + sw / 2, a.y + a.h - sw / 2);
          page.drawRectangle({ x: b.x, y: b.y, width: Math.max(0, a.w - sw), height: Math.max(0, a.h - sw), rotate, borderColor: color, borderWidth: sw, borderOpacity: a.opacity });
          break;
        }
        case 'stamp': {
          if (!a.printBorder) break; // a placement guide only, unless its outline should be printed
          const sw = a.stroke, b = P(a.x + sw / 2, a.y + a.h - sw / 2);
          page.drawRectangle({ x: b.x, y: b.y, width: Math.max(0, a.w - sw), height: Math.max(0, a.h - sw), rotate, borderColor: color, borderWidth: sw });
          break;
        }
        case 'ellipse': {
          const c = P(a.x + a.w / 2, a.y + a.h / 2);
          page.drawEllipse({ x: c.x, y: c.y, xScale: Math.max(0, a.w / 2 - a.stroke / 2), yScale: Math.max(0, a.h / 2 - a.stroke / 2), rotate, borderColor: color, borderWidth: a.stroke, borderOpacity: a.opacity });
          break;
        }
        case 'highlight': {
          const b = P(a.x, a.y + a.h);
          page.drawRectangle({ x: b.x, y: b.y, width: a.w, height: a.h, rotate, color, opacity: a.opacity, blendMode: BlendMode.Multiply });
          break;
        }
        case 'whiteout': {
          const b = P(a.x, a.y + a.h);
          page.drawRectangle({ x: b.x, y: b.y, width: a.w, height: a.h, rotate, color: rgb(1, 1, 1) });
          break;
        }
        case 'ink':
        case 'line': {
          const sx = a.w / a.vw, sy = a.h / a.vh;
          const abs = (pts) => pts.map(([px, py]) => [a.x + px * sx, a.y + py * sy]);
          const d = svgPath(abs(a.points));
          // drawSvgPath flips y around its anchor, so it gets PDF coordinates with y negated and the anchor at the origin.
          stroke(a.points.length === 1 ? `${d} l0.01 0` : d);
          if (a.arrow) stroke(svgPath(abs(arrowHead(a, 1, 1).map(([x, y]) => [x, y]))));
          break;
        }
        case 'textEdit': {
          if (a.text === a.original && !a.styleChanged) break; // untouched: the original stays as it is
          // Geometry is in user space: baseline origin (ux, uy) and direction `angle`.
          const dx = Math.cos(a.angle), dy = Math.sin(a.angle), fs = a.fontSize;
          const lines = a.text.split('\n');
          const at = (i) => ({ x: a.ux + dy * i * LINE_HEIGHT * fs, y: a.uy - dx * i * LINE_HEIGHT * fs }); // line i, going down
          // Same font as the original when the page's font can encode the new text — identical look.
          const encoded = a.keepFont && a.reusable && a.fontKey ? lines.map((l) => PDFText.encodeForFont(l, a.encoding)) : null;
          const reuse = encoded && encoded.every(Boolean);
          const info = reuse ? null : await fontFor(a);
          if (coverOnly.has(a.id)) {
            // Fallback only: the original glyphs could not be removed from the content stream.
            const widest = Math.max(a.lineWidth, ...lines.map((l) => (info ? info.font.widthOfTextAtSize(info.clean(l), fs) : l.length * fs * 0.55)));
            const desc = 0.3 * fs, h = (0.95 + 0.3) * fs + (lines.length - 1) * LINE_HEIGHT * fs + 2;
            const bx = a.ux + dy * (desc + (lines.length - 1) * LINE_HEIGHT * fs) - dx, by = a.uy - dx * (desc + (lines.length - 1) * LINE_HEIGHT * fs) - dy;
            page.drawRectangle({ x: bx, y: by, width: widest + 2, height: h, rotate: degrees((a.angle * 180) / Math.PI), color: PDFApp.hexToRgb(a.bg) });
          }
          lines.forEach((line, i) => {
            if (!line) return;
            const p0 = at(i);
            if (reuse) {
              page.pushOperators(pushGraphicsState(), beginText(), setFillingRgbColor(color.red, color.green, color.blue),
                setFontAndSize(a.fontKey, fs), setTextMatrix(dx, dy, -dy, dx, p0.x, p0.y), showText(encoded[i]), endText(), popGraphicsState());
            } else {
              drawStyledText(page, a, info.clean(line), { x: p0.x, y: p0.y, size: fs, font: info.font, color, rotate: degrees((a.angle * 180) / Math.PI) }, info);
            }
          });
          break;
        }
        case 'text': {
          const info = await fontFor(a);
          info.clean(a.text).split('\n').forEach((line, i) => {
            if (!line) return;
            const b = P(a.x, a.y + (i * LINE_HEIGHT + BASELINE) * a.fontSize);
            drawStyledText(page, a, line, { x: b.x, y: b.y, size: a.fontSize, font: info.font, color, opacity: a.opacity, rotate }, info);
          });
          break;
        }
        case 'image': {
          if (!images.has(a.src)) images.set(a.src, a.src.startsWith('data:image/jpeg') ? await doc.embedJpg(a.src) : await doc.embedPng(a.src));
          const b = P(a.x, a.y + a.h);
          const crop = cropBoxOf(a);
          if (crop) {
            // Only the part inside the stamp box is kept: clip to the box's rectangle in PDF space.
            const c0 = P(crop.x, crop.y), c1 = P(crop.x + crop.w, crop.y + crop.h);
            page.pushOperators(pushGraphicsState(), rectangle(Math.min(c0.x, c1.x), Math.min(c0.y, c1.y), Math.abs(c1.x - c0.x), Math.abs(c1.y - c0.y)), clip(), endPath());
          }
          page.drawImage(images.get(a.src), { x: b.x, y: b.y, width: a.w, height: a.h, rotate, opacity: a.opacity });
          if (crop) page.pushOperators(popGraphicsState());
          break;
        }
        default:
      }
    }
    return doc.save();
  }

  async function save() {
    if (!requireDoc()) return;
    commitEditing();
    if (!state.annots.length) toast(t('ed.noEdits'), 'info');
    PDFApp.busy(true, t('ed.saving'));
    try {
      const bytes = await exportPdf();
      PDFApp.download(bytes, `${PDFApp.baseName(state.name)}_${signMode ? 'signed' : 'edited'}.pdf`, 'application/pdf');
      toast(t('ed.saved'), 'success');
      if (exportPdf.covered) toast(t('ed.coveredLines', { n: exportPdf.covered }), 'warn', 7000);
    } catch (err) {
      console.error(err);
      toast(t('ed.saveFailed', { msg: PDFApp.friendlyError(err) }), 'error', 6000);
    } finally {
      PDFApp.busy(false);
    }
  }
  ui.download.addEventListener('click', save);

  syncProps();

  // Opened from another tool's "Continue with…" button.
  if (params.get('from') === 'handoff') {
    PDFApp.handoff.take().then((files) => {
      history.replaceState(null, '', signMode ? '?mode=sign' : location.pathname);
      const pdf = files.find(PDFApp.isPdf);
      if (pdf) openFile(pdf);
    }).catch(() => {});
  }
})();
