/* CPDF — tool registry and shared helpers for tool definitions (js/tools/*.js).
 *
 * Each tool describes how the generic workspace (tool.html) should behave:
 *   name, desc, action, note   bilingual text: { en, el } (resolved with L())
 *   accept    'pdf' | 'image' | 'office'
 *   multiple  allow several input files; minFiles / maxFiles
 *   view      'files' | 'pages' (thumbnails of one PDF) | 'crop' | 'form' | 'compare'
 *   pageMode  for view 'pages': 'view' | 'select' | 'rotate' | 'organize'
 *   requires  'libreoffice' | 'ghostscript' — needs that program through the local server
 *   options   sidebar controls: { id, label, type, default, choices?, showIf?(opts, caps) }
 *   onLoad    optional (ctx) => option values to prefill after files load
 *   run       async (ctx) => [{ name, data: Uint8Array|Blob, type?, note? }]
 * Tools with `href` open a dedicated page instead of the workspace.
 */
(function (global) {
  'use strict';

  const list = [];
  const CATEGORIES = ['Organize', 'Convert', 'Edit', 'Optimize', 'Security'];

  const load = (bytes, opts) => global.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, ...opts });
  const deg = (d) => global.PDFLib.degrees(d);
  const norm = (d) => ((d % 360) + 360) % 360;
  const base = (f) => global.PDFApp.baseName(f.name);

  function boxOf(page) {
    if (page.getCropBox) return page.getCropBox();
    const { width, height } = page.getSize();
    return { x: 0, y: 0, width, height };
  }

  /** New PDF containing `specs` ([{ src, rotation }]) copied from the source document, in that order. */
  async function buildFrom(bytes, specs) {
    const src = await load(bytes);
    const out = await global.PDFLib.PDFDocument.create();
    const copied = await out.copyPages(src, specs.map((s) => s.src));
    copied.forEach((page, i) => {
      const r = norm(specs[i].rotation || 0);
      if (r) page.setRotation(deg(norm(page.getRotation().angle + r)));
      out.addPage(page);
    });
    return out.save();
  }

  async function eachFile(files, progress, fn) {
    const out = [];
    for (const [i, f] of files.entries()) {
      if (files.length > 1) progress(L({ en: `Processing ${f.name} (${i + 1}/${files.length})…`, el: `Επεξεργασία ${f.name} (${i + 1}/${files.length})…` }));
      out.push(await fn(f, i));
    }
    return out;
  }

  /** Re-renders every page as a JPEG image (used when no vector method is available). */
  async function rasterize(f, { dpi, quality, gray, progress }) {
    const { renderPage, canvasToBlob } = global.PDFApp;
    const out = await global.PDFLib.PDFDocument.create();
    for (let n = 1; n <= f.pdf.numPages; n++) {
      progress(L({ en: `${f.name} — page ${n}/${f.pdf.numPages}…`, el: `${f.name} — σελίδα ${n}/${f.pdf.numPages}…` }));
      const vp = (await f.pdf.getPage(n)).getViewport({ scale: 1 });
      const canvas = await renderPage(f.pdf, n, { scale: dpi / 72, intent: 'print' });
      if (gray) {
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        ctx.putImageData(img, 0, 0);
      }
      const jpg = await out.embedJpg(await (await canvasToBlob(canvas, 'image/jpeg', quality)).arrayBuffer());
      canvas.width = canvas.height = 0;
      out.addPage([vp.width, vp.height]).drawImage(jpg, { x: 0, y: 0, width: vp.width, height: vp.height });
    }
    return out.save({ useObjectStreams: true });
  }

  /** Size note like "1.2 MB → 640 KB (−47%)". */
  function sizeNote(before, after) {
    const { formatBytes } = global.PDFApp;
    const pct = Math.round((1 - after / before) * 100);
    return `${formatBytes(before)} → ${formatBytes(after)} (${pct >= 0 ? '−' : '+'}${Math.abs(pct)}%)`;
  }

  global.PDFTools = {
    list,
    categories: CATEGORIES,
    register(...tools) { list.push(...tools); },
    get: (id) => list.find((t) => t.id === id),
    helpers: { load, deg, norm, base, boxOf, buildFrom, eachFile, rasterize, sizeNote, A4: [595.28, 841.89], LETTER: [612, 792] },
  };
})(window);
