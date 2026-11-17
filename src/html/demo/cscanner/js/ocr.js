(function (global) {
  "use strict";

  /*
   * OCR → invisible, searchable/selectable text layer in the PDF.
   * Libraries are NOT vendored: they are loaded from jsDelivr only when OCR is used (needs internet;
   * the browser caches them, Tesseract caches language data in IndexedDB). Recognition runs locally
   * in the browser — page images are never uploaded.
   */

  const CDN = {
    tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    fontkit: "https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js",
    // Any font with Greek + Latin glyphs works: the text is invisible, it only has to encode.
    font: "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf",
  };

  const scriptPromises = {};
  function loadScript(url) {
    if (!scriptPromises[url]) {
      scriptPromises[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          delete scriptPromises[url];
          reject(new Error("Αποτυχία φόρτωσης " + url));
        };
        document.head.appendChild(s);
      });
    }
    return scriptPromises[url];
  }

  let fontBytesPromise = null;
  function loadFontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = fetch(CDN.font).then((r) => {
        if (!r.ok) throw new Error("Αποτυχία λήψης γραμματοσειράς (" + r.status + ")");
        return r.arrayBuffer();
      }).catch((err) => {
        fontBytesPromise = null;
        throw err;
      });
    }
    return fontBytesPromise;
  }

  let worker = null;
  let workerLangs = null;
  let progressHandler = null;

  /** Loads libraries + language data. langs: e.g. "ell+eng". */
  async function prepare(langs, onProgress) {
    progressHandler = onProgress || null;
    await Promise.all([loadScript(CDN.tesseract), loadScript(CDN.fontkit), loadFontBytes()]);
    if (worker && workerLangs === langs) return;
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    worker = await global.Tesseract.createWorker(langs.split("+"), 1, {
      logger: (m) => {
        if (progressHandler) progressHandler(m);
      },
    });
    workerLangs = langs;
  }

  /** Returns [{text, x0, y0, x1, y1}] in canvas pixels. */
  async function recognize(canvas, onProgress) {
    progressHandler = onProgress || null;
    const { data } = await worker.recognize(canvas);
    return (data.words || [])
      .filter((w) => w.text && w.text.trim() && w.confidence > 20)
      .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
  }

  /** Embeds the text font in pdfDoc (call once per document, after prepare). */
  async function embedFont(pdfDoc) {
    pdfDoc.registerFontkit(global.fontkit);
    return pdfDoc.embedFont(await loadFontBytes(), { subset: true });
  }

  /**
   * Draws invisible words over the page image.
   * place: where the image was drawn on the PDF page {x, y, width, height} (PDF points);
   * imgW/imgH: size of the canvas the words were recognized on.
   */
  function addTextLayer(pdfPage, font, words, imgW, imgH, place) {
    const sx = place.width / imgW;
    const sy = place.height / imgH;
    for (const w of words) {
      const boxW = (w.x1 - w.x0) * sx;
      const boxH = (w.y1 - w.y0) * sy;
      if (boxW <= 0 || boxH <= 0) continue;
      let widthAt1;
      try {
        widthAt1 = font.widthOfTextAtSize(w.text, 1);
      } catch (err) {
        continue;
      }
      if (!(widthAt1 > 0)) continue;
      // Size the text so its width matches the word box (good selection/search highlighting).
      const size = Math.min(boxW / widthAt1, boxH * 1.6);
      try {
        pdfPage.drawText(w.text, {
          x: place.x + w.x0 * sx,
          y: place.y + (imgH - w.y1) * sy + boxH * 0.18,
          size,
          font,
          opacity: 0,
        });
      } catch (err) {
        // Unencodable characters: skip the word rather than failing the whole PDF.
      }
    }
  }

  global.Ocr = { prepare, recognize, embedFont, addTextLayer };
})(window);
