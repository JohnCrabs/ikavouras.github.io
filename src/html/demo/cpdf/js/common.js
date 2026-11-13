/* CPDF — shared helpers: DOM, files, pdf.js / pdf-lib / qpdf glue, local API, UI feedback. */
(function (global) {
  'use strict';

  // All assets ship with the app (no CDN), resolved from this script's location: <root>/js/common.js.
  const ROOT = new URL('../', document.currentScript.src);
  const asset = (p) => new URL(p, ROOT).href;
  const ASSETS = {
    pdfWorker: asset('js/vendor/pdf.worker.min.js'),
    // Embedded when text contains characters the built-in Helvetica cannot encode (Greek, Cyrillic, …).
    unicodeFont: asset('css/fonts/DejaVuSans.ttf'),
    qpdfJs: asset('js/vendor/qpdf/qpdf.js'),
    qpdfWasm: asset('js/vendor/qpdf/qpdf.wasm'),
  };
  if (global.pdfjsLib) global.pdfjsLib.GlobalWorkerOptions.workerSrc = ASSETS.pdfWorker;

  /* ---------- Icons (24×24 stroke paths) ---------- */
  const ICONS = {
    merge: 'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 8v8M8 12h8',
    split: 'M4 4h6v16H4zM14 4h6v16h-6z',
    extract: 'M14 3v5h5M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM12 11v6M9 14l3 3 3-3',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
    rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
    rotateCcw: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    droplet: 'M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z',
    hash: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
    compress: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    sign: 'M3 17c3-3 5-9 7-9s-1 9 1 9 3-4 5-4 1 4 3 4h2M3 21h18',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    plus: 'M12 5v14M5 12h14',
    x: 'M18 6L6 18M6 6l12 12',
    check: 'M20 6L9 17l-5-5',
    arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
    arrowRight: 'M5 12h14M12 5l7 7-7 7',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
    redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    zoomIn: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6',
    zoomOut: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M8 11h6',
    type: 'M4 7V4h16v3M9 20h6M12 4v16',
    textCursor: 'M4 7V4h16v3M9 20h6M12 4v16M17 12h4M19 10v4',
    square: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    circle: 'M12 21a9 7 0 1 0 0-14 9 7 0 0 0 0 14z',
    line: 'M5 19L19 5',
    arrow: 'M5 19L19 5M10 5h9v9',
    highlighter: 'M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
    eraser: 'M20 20H7l-4-4a1 1 0 0 1 0-1.4L13.6 4a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4L11 20M6 11l7 7',
    pointer: 'M4 4l7 17 2.5-7.5L21 11z',
    pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
    swap: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.8-1.2',
    sort: 'M3 6h18M6 12h12M10 18h4',
    word: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8 12l1.5 6 2.5-5 2.5 5 1.5-6',
    scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h10M7 12h10M7 16h6',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    bolt: 'M13 2L3 14h9l-1 8 10-12h-9z',
    gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    contrast: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 2v20',
    globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
    crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
    form: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4',
    layers: 'M12 2l10 6-10 6L2 8zM2 16l10 6 10-6M2 12l10 6 10-6',
    palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 3-4 3h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 22zM7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM16.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    compare: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M12 2v20',
    archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
    wrench: 'M14.7 6.3a4 4 0 0 0 5.4 5.4L22 13.6 13.6 22l-1.9-1.9a4 4 0 0 0-5.4-5.4L2 10.4 10.4 2z',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    sheet: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16',
    slides: 'M3 4h18v12H3zM8 20h8M12 16v4M7 8h6M7 12h10',
    flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  };

  function icon(name, size = 20) {
    const d = ICONS[name] || ICONS.file;
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') { for (const [dk, dv] of Object.entries(v)) if (dv != null) node.dataset[dk] = dv; }
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c != null && c !== false) node.append(c);
    return node;
  }

  // Elements written in HTML as <button data-icon="upload">Open</button> get their icon injected.
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((n) => {
      if (!n.querySelector(':scope > svg.icon')) n.insertAdjacentHTML('afterbegin', icon(n.dataset.icon, +n.dataset.iconSize || 18));
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = el('script', { src });
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(s);
    });
  }

  /* ---------- Top bar: language + theme ---------- */
  const THEME_ICON = { auto: 'contrast', light: 'sun', dark: 'moon' };
  function mountTopbarControls() {
    const bar = $('.topbar');
    if (!bar || $('.topbar-prefs', bar)) return;
    const langSel = el('select', { class: 'lang-select', 'aria-label': t('lang.label'), title: t('lang.label'),
      onchange: (e) => I18N.setLang(e.target.value) },
      Object.entries(I18N.LANGS).map(([code, name]) => el('option', { value: code, text: name, selected: code === I18N.lang })));
    const themeBtn = el('button', { class: 'icon-btn', type: 'button' });
    const paintTheme = () => {
      themeBtn.innerHTML = icon(THEME_ICON[I18N.theme], 18);
      themeBtn.title = t(`theme.${I18N.theme}`);
      themeBtn.setAttribute('aria-label', themeBtn.title);
    };
    themeBtn.addEventListener('click', () => { I18N.cycleTheme(); paintTheme(); });
    paintTheme();
    // On phones the language names become short codes (EN / ΕΛ) so the top bar fits.
    const narrow = window.matchMedia('(max-width: 480px)');
    const SHORT = { en: 'EN', el: 'ΕΛ' };
    const paintLangs = () => Array.from(langSel.options).forEach((o) => { o.textContent = narrow.matches ? SHORT[o.value] || o.value.toUpperCase() : I18N.LANGS[o.value]; });
    narrow.addEventListener('change', paintLangs);
    paintLangs();
    bar.append(el('div', { class: 'topbar-prefs' }, [el('span', { class: 'lang-wrap', html: icon('globe', 16) }, langSel), themeBtn]));
  }

  document.addEventListener('DOMContentLoaded', () => {
    I18N.apply();
    hydrateIcons();
    mountTopbarControls();
  });

  /* ---------- Formatting ---------- */
  function formatBytes(n) {
    if (!Number.isFinite(n)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i && n < 10 ? 1 : 0)} ${units[i]}`;
  }
  const baseName = (name) => name.replace(/\.[^.]+$/, '');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0;
    return global.PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  /** "1-3, 5, 8-" → [[0,1,2],[4],[7..total-1]] (zero-based page indices). */
  function parseRanges(str, total) {
    const groups = [];
    for (const raw of String(str).split(',')) {
      const part = raw.trim();
      if (!part) continue;
      let a, b;
      const m = part.match(/^(\d*)\s*-\s*(\d*)$/);
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : total; }
      else if (/^\d+$/.test(part)) a = b = +part;
      else throw new Error(L({ en: `"${part}" is not a valid page range`, el: `Το «${part}» δεν είναι έγκυρο εύρος σελίδων` }));
      if (a < 1 || b > total || a > b) throw new Error(L({ en: `Range "${part}" is outside pages 1–${total}`, el: `Το εύρος «${part}» είναι εκτός σελίδων 1–${total}` }));
      groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
    }
    if (!groups.length) throw new Error(L({ en: 'Enter at least one page range', el: 'Δώστε τουλάχιστον ένα εύρος σελίδων' }));
    return groups;
  }

  /* ---------- Files ---------- */
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function zip(files) {
    const z = new global.JSZip();
    const used = new Set();
    for (const f of files) {
      let name = f.name, i = 1;
      while (used.has(name)) name = f.name.replace(/(\.[^.]+)?$/, (ext) => ` (${i++})${ext}`);
      used.add(name);
      z.file(name, f.data);
    }
    return z.generateAsync({ type: 'blob' });
  }

  const canvasToBlob = (canvas, type = 'image/png', quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  /** Returns image bytes pdf-lib can embed directly (JPEG/PNG); other formats are re-encoded as PNG. */
  async function normalizeImage(file) {
    const bytes = await file.arrayBuffer();
    if (file.type === 'image/jpeg') return { kind: 'jpg', bytes };
    if (file.type === 'image/png') return { kind: 'png', bytes };
    const bmp = await createImageBitmap(new Blob([bytes], { type: file.type }));
    const c = el('canvas', { width: bmp.width, height: bmp.height });
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { kind: 'png', bytes: await (await canvasToBlob(c, 'image/png')).arrayBuffer() };
  }
  const embedImage = (doc, img) => (img.kind === 'jpg' ? doc.embedJpg(img.bytes) : doc.embedPng(img.bytes));

  /* ---------- pdf.js ---------- */
  // pdf.js takes ownership of (detaches) the buffer it is given, so always hand it a copy.
  const openPdfjs = (bytes, password) =>
    global.pdfjsLib.getDocument({ data: new Uint8Array(bytes).slice(), password }).promise;

  async function renderPage(pdf, pageNum, { scale, width, intent } = {}) {
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: width ? width / base.width : scale || 1 });
    const canvas = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: intent || 'display' }).promise;
    return canvas;
  }

  function friendlyError(err) {
    if (err && err.name === 'PasswordException') return t('err.password');
    if (err && err.name === 'InvalidPDFException') return t('err.invalid');
    return (err && err.message) || t('err.generic');
  }

  /* ---------- pdf-lib fonts ---------- */
  const WIN_ANSI = /^[\t\n\r\x20-\x7E\xA0-\xFF]*$/;
  let unicodeFontBytes = null;

  /** Picks a standard font when possible, otherwise embeds the bundled Unicode TTF. `clean` makes text safe for the chosen font. */
  async function embedTextFont(doc, sample, standard) {
    const { StandardFonts } = global.PDFLib;
    const std = standard || StandardFonts.Helvetica;
    if (WIN_ANSI.test(sample)) return { font: await doc.embedFont(std), clean: (s) => s, unicode: false };
    if (!unicodeFontBytes) {
      try {
        const res = await fetch(ASSETS.unicodeFont);
        if (res.ok) unicodeFontBytes = await res.arrayBuffer();
      } catch (_) { /* falls back to Helvetica below */ }
    }
    if (unicodeFontBytes && global.fontkit) {
      doc.registerFontkit(global.fontkit);
      return { font: await doc.embedFont(unicodeFontBytes, { subset: true }), clean: (s) => s, unicode: true };
    }
    toast(t('err.unicodeFont'), 'warn', 5000);
    return {
      font: await doc.embedFont(std),
      clean: (s) => s.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?'),
      unicode: false,
    };
  }

  /* ---------- qpdf (WebAssembly) ---------- */
  let qpdfWasmBytes = null;

  /**
   * Runs the qpdf command line on `input` (written to /in.pdf). Use '/in.pdf' and '/out.pdf' in args.
   * Resolves to { code, out, log }: exit code 0 = ok, 3 = ok with warnings, 2 = error.
   */
  async function qpdf(args, input) {
    if (!global.CPDFQpdfFactory) {
      await loadScript(ASSETS.qpdfJs);
      global.CPDFQpdfFactory = global.Module; // the Emscripten build exposes a global factory named "Module"
    }
    if (!qpdfWasmBytes) qpdfWasmBytes = await (await fetch(ASSETS.qpdfWasm)).arrayBuffer();
    const log = [];
    let code = 0;
    // This build binds stdout/stderr to console.log/error when the instance is created,
    // so redirect them before creating it and restore them once the run is over.
    const { log: origLog, error: origError } = console;
    console.log = console.error = (...a) => log.push(a.join(' ').replace(/^this\.program: /, ''));
    try {
      // A fresh instance per run: Emscripten programs are not meant to be called twice.
      const mod = await global.CPDFQpdfFactory({ noInitialRun: true, wasmBinary: qpdfWasmBytes });
      mod.FS.writeFile('/in.pdf', new Uint8Array(input));
      var fs = mod.FS; // eslint-disable-line no-var
      const r = mod.callMain(args);
      if (typeof r === 'number') code = r;
    } catch (e) {
      if (e && typeof e.status === 'number') code = e.status;
      else throw e;
    } finally {
      console.log = origLog;
      console.error = origError;
    }
    let out = null;
    try { out = fs.readFile('/out.pdf'); } catch (_) { /* no output */ }
    return { code, out, log: log.join('\n') };
  }

  /** Decrypts a PDF (owner-password-only files need no password). Throws on a wrong password. */
  async function decryptPdf(bytes, password) {
    const args = ['/in.pdf', '--decrypt', '/out.pdf'];
    if (password) args.unshift(`--password=${password}`);
    const r = await qpdf(args, bytes);
    if (r.code === 2 || !r.out) throw new Error(/password/i.test(r.log) ? t('pw.wrong') : r.log || t('err.generic'));
    return r.out;
  }

  /* ---------- Dialogs ---------- */
  /** Small modal text/password prompt. Resolves to the entered string, or null when cancelled. */
  function prompt({ title, message, type = 'text', placeholder = '', ok = 'OK', cancel, error }) {
    return new Promise((resolve) => {
      const input = el('input', { class: 'input', type, placeholder, autocomplete: type === 'password' ? 'off' : null });
      const dlg = el('dialog', { class: 'modal' }, [
        el('form', { class: 'modal-inner', method: 'dialog' }, [
          el('h2', { text: title }),
          message ? el('p', { class: 'modal-msg', text: message }) : null,
          error ? el('p', { class: 'modal-error', text: error }) : null,
          input,
          el('div', { class: 'modal-actions' }, [
            el('button', { class: 'btn btn-ghost', value: 'cancel', type: 'submit', formnovalidate: true, text: cancel || t('pw.cancel') }),
            el('button', { class: 'btn btn-primary', value: 'ok', type: 'submit', text: ok }),
          ]),
        ]),
      ]);
      dlg.addEventListener('close', () => {
        const value = dlg.returnValue === 'ok' ? input.value : null;
        dlg.remove();
        resolve(value);
      });
      document.body.append(dlg);
      dlg.showModal();
      input.focus();
    });
  }

  /** Small modal with a list of choices. Resolves to the picked value or null. */
  function choose({ title, items, empty }) {
    return new Promise((resolve) => {
      let picked = null;
      const dlg = el('dialog', { class: 'modal' }, [
        el('div', { class: 'modal-inner' }, [
          el('h2', { text: title }),
          items.length
            ? el('div', { class: 'choice-list' }, items.map((it) => el('button', {
              class: 'choice', type: 'button', style: it.color ? `--c:${it.color}` : null,
              html: `<span class="choice-icon">${icon(it.icon || 'file', 20)}</span><span>${it.label}</span>`,
              onclick: () => { picked = it.value; dlg.close(); },
            })))
            : el('p', { class: 'modal-msg', text: empty }),
          el('div', { class: 'modal-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', text: t('pw.cancel'), onclick: () => dlg.close() })),
        ]),
      ]);
      dlg.addEventListener('close', () => { dlg.remove(); resolve(picked); });
      document.body.append(dlg);
      dlg.showModal();
    });
  }

  /**
   * Opens a PDF for processing. Asks for the password when needed and returns decrypted bytes,
   * so pdf-lib (which cannot read encrypted files) can work on them. Returns null if the user cancels.
   */
  async function preparePdf(bytes, name) {
    let password = null, error = null, pdf;
    for (;;) {
      try {
        pdf = await openPdfjs(bytes, password || undefined);
        break;
      } catch (err) {
        if (err.name !== 'PasswordException') throw err;
        password = await prompt({ title: t('pw.title'), message: t('pw.message', { name }), type: 'password',
          placeholder: t('pw.placeholder'), ok: t('pw.ok'), error });
        if (password == null) return null;
        error = t('pw.wrong');
      }
    }
    const info = (await pdf.getMetadata().catch(() => ({ info: {} }))).info || {};
    if (!info.EncryptFilterName && !password) return { bytes, pdf, encrypted: false };
    busy(true, t('pw.decrypting'));
    try {
      const plain = await decryptPdf(bytes, password);
      pdf.destroy();
      return { bytes: plain, pdf: await openPdfjs(plain), encrypted: true, password };
    } finally {
      busy(false);
    }
  }

  /* ---------- Local API (server.js) ---------- */
  let capsPromise = null;
  const api = {
    /** { libreoffice: bool, ghostscript: bool, server: bool } */
    caps() {
      // Web (GitHub Pages) version: no local server, so LibreOffice / Ghostscript are never available.
      capsPromise = capsPromise || Promise.resolve({ libreoffice: false, ghostscript: false, server: false });
      return capsPromise;
    },
    async post(path, bytes, params = {}) {
      let res;
      try {
        res = await fetch(`${asset(`api/${path}`)}?${new URLSearchParams(params)}`, {
          method: 'POST', headers: { 'X-CPDF': '1', 'Content-Type': 'application/octet-stream' }, body: bytes,
        });
      } catch (_) {
        throw new Error(t('err.server'));
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `HTTP ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };

  /* ---------- Hand-off between tools & recent tools ---------- */
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('cpdf', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handoff');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  const handoff = {
    async put(files) {
      const db = await idb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('handoff', 'readwrite');
        tx.objectStore('handoff').put(files.map((f) => ({ name: f.name, type: f.type, blob: f.blob })), 'files');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    },
    /** Returns File objects and clears the store. */
    async take() {
      const db = await idb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('handoff', 'readwrite');
        const store = tx.objectStore('handoff');
        const req = store.get('files');
        req.onsuccess = () => {
          store.delete('files');
          resolve((req.result || []).map((f) => new File([f.blob], f.name, { type: f.type })));
        };
        req.onerror = () => reject(req.error);
      });
    },
  };

  const recent = {
    list() {
      try { return JSON.parse(I18N.store.get('cpdf.recent') || '[]'); } catch (_) { return []; }
    },
    add(id) {
      I18N.store.set('cpdf.recent', JSON.stringify([id, ...recent.list().filter((x) => x !== id)].slice(0, 6)));
    },
  };

  /* ---------- Feedback ---------- */
  function toast(message, kind = 'info', ms = 3500) {
    let host = $('#toasts');
    if (!host) { host = el('div', { id: 'toasts', class: 'toasts' }); document.body.append(host); }
    const tEl = el('div', { class: `toast toast-${kind}`, role: 'status', text: message });
    host.append(tEl);
    requestAnimationFrame(() => tEl.classList.add('show'));
    setTimeout(() => { tEl.classList.remove('show'); setTimeout(() => tEl.remove(), 300); }, ms);
  }

  let busyEl = null;
  function busy(on, label) {
    if (!busyEl) {
      busyEl = el('div', { class: 'busy', hidden: true, role: 'status', 'aria-live': 'polite' }, [
        el('div', { class: 'busy-box' }, [el('span', { class: 'spinner' }), el('span', { class: 'busy-label' })]),
      ]);
      document.body.append(busyEl);
    }
    busyEl.querySelector('.busy-label').textContent = label || t('tool.processing');
    busyEl.hidden = !on;
  }

  global.PDFApp = {
    asset, $, $$, el, icon, hydrateIcons, loadScript,
    formatBytes, baseName, clamp, hexToRgb, parseRanges,
    isPdf, download, zip, canvasToBlob, normalizeImage, embedImage,
    openPdfjs, renderPage, friendlyError, embedTextFont,
    qpdf, decryptPdf, preparePdf, prompt, choose,
    api, handoff, recent, toast, busy,
  };
})(window);
