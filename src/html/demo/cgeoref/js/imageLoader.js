/* CGeoRef – Φόρτωση εικόνων (PNG/JPG/GIF/WebP/BMP, TIFF/GeoTIFF, PDF) */
(function (GR) {
  'use strict';

  const MAX_PIXELS = 120e6; // όριο ασφαλείας μνήμης

  function canvasFrom(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function loadHTMLImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = canvasFrom(img.naturalWidth, img.naturalHeight);
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Αδύνατη ανάγνωση εικόνας')); };
      img.src = url;
    });
  }

  async function loadTIFF(file) {
    if (!window.GeoTIFF) throw new Error('Η βιβλιοθήκη GeoTIFF δεν φορτώθηκε');
    const tiff = await GeoTIFF.fromArrayBuffer(await file.arrayBuffer());
    const img = await tiff.getImage();
    const w = img.getWidth(), h = img.getHeight();
    if (w * h > MAX_PIXELS) throw new Error(`Πολύ μεγάλη εικόνα (${w}×${h})`);
    const spp = img.getSamplesPerPixel();
    const c = canvasFrom(w, h);
    const ctx = c.getContext('2d');
    const out = ctx.createImageData(w, h);
    const O = out.data;
    const pi = img.fileDirectory.PhotometricInterpretation;
    if (spp >= 3 || pi === 3 || pi === 6) {
      const rgb = await img.readRGB({ interleave: true, enableAlpha: spp >= 4 });
      const step = rgb.length / (w * h);
      for (let i = 0, j = 0; i < w * h; i++, j += step) {
        O[i * 4] = rgb[j]; O[i * 4 + 1] = rgb[j + 1]; O[i * 4 + 2] = rgb[j + 2];
        O[i * 4 + 3] = step === 4 ? rgb[j + 3] : 255;
      }
    } else {
      // μονοκάναλη: γραμμική έκταση τιμών
      const [band] = await img.readRasters({ samples: [0] });
      const nd = img.getGDALNoData();
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < band.length; i++) { const v = band[i]; if (v === nd || !isFinite(v)) continue; if (v < mn) mn = v; if (v > mx) mx = v; }
      const bits = img.getBitsPerSample();
      if (bits === 8 && mn >= 0 && mx <= 255) { mn = 0; mx = 255; }
      const sc = mx > mn ? 255 / (mx - mn) : 1;
      const inv = pi === 0; // WhiteIsZero
      for (let i = 0; i < band.length; i++) {
        let v = (band[i] - mn) * sc;
        if (inv) v = 255 - v;
        O[i * 4] = O[i * 4 + 1] = O[i * 4 + 2] = v;
        O[i * 4 + 3] = band[i] === nd ? 0 : 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  async function loadPDF(file, dpi, pageNo) {
    if (!window.pdfjsLib) throw new Error('Η βιβλιοθήκη PDF.js δεν φορτώθηκε');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(Math.min(Math.max(1, pageNo || 1), pdf.numPages));
    let scale = (dpi || 200) / 72;
    let vp = page.getViewport({ scale });
    if (vp.width * vp.height > 80e6) { scale *= Math.sqrt(80e6 / (vp.width * vp.height)); vp = page.getViewport({ scale }); }
    const c = canvasFrom(Math.round(vp.width), Math.round(vp.height));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    c.pdfPages = pdf.numPages;
    return c;
  }

  /** Επιστρέφει { canvas, width, height, name } */
  async function load(file, opts) {
    const name = file.name;
    const ext = name.split('.').pop().toLowerCase();
    let canvas;
    if (ext === 'tif' || ext === 'tiff') canvas = await loadTIFF(file);
    else if (ext === 'pdf') canvas = await loadPDF(file, opts && opts.dpi, opts && opts.page);
    else canvas = await loadHTMLImage(file);
    if (canvas.width * canvas.height > MAX_PIXELS) throw new Error('Πολύ μεγάλη εικόνα');
    return { canvas, width: canvas.width, height: canvas.height, name, ext };
  }

  /** Δημιουργία δοκιμαστικής εικόνας (πλέγμα) για επίδειξη */
  function demoImage() {
    const w = 1600, h = 1200;
    const c = canvasFrom(w, h), g = c.getContext('2d');
    g.fillStyle = '#f4efe1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6d3b'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#3b2f1a'; g.font = 'bold 40px sans-serif';
    g.fillText('CGeoRef – Δοκιμαστική εικόνα', 60, 80);
    g.font = '16px sans-serif';
    for (let x = 100; x < w; x += 200) for (let y = 200; y < h; y += 200) {
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.fillText(`${x},${y}`, x + 8, y - 8);
    }
    return { canvas: c, width: w, height: h, name: 'demo.png', ext: 'png' };
  }

  GR.imageLoader = { load, demoImage };
})(window.GR = window.GR || {});
