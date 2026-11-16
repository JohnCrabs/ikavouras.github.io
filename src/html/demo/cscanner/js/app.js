(() => {
  "use strict";

  /**
   * crop: null (whole image) | {mode:'quad', corners} | {mode:'polygon', polygon, frame, orientation}
   * adjust: see ImageAdjust.DEFAULTS
   * @typedef {{id:number, name:string, rawCanvas:HTMLCanvasElement, crop:(object|null), baseCanvas:HTMLCanvasElement, colorMode:string, adjust:object, rotation:number}} Page
   */

  /** @type {Page[]} */
  let pages = [];
  let nextId = 1;
  let currentBlobUrl = null;
  let defaultAdjust = Object.assign({}, ImageAdjust.DEFAULTS);

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const defaultColorMode = document.getElementById("defaultColorMode");
  const autoCropToggle = document.getElementById("autoCropToggle");
  const pageList = document.getElementById("pageList");
  const pageCount = document.getElementById("pageCount");
  const emptyHint = document.getElementById("emptyHint");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const filenameInput = document.getElementById("filenameInput");
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const generateBtn = document.getElementById("generateBtn");
  const statusMsg = document.getElementById("statusMsg");
  const previewPanel = document.getElementById("preview-panel");
  const pdfPreview = document.getElementById("pdfPreview");
  const downloadLink = document.getElementById("downloadLink");

  const THUMB_MAX = 160;
  const MAX_DIMENSION = 2800; // clamp very large source photos for performance/size

  // ---------- Decoding ----------

  function isTiff(file) {
    const n = file.name.toLowerCase();
    return file.type === "image/tiff" || n.endsWith(".tif") || n.endsWith(".tiff");
  }

  function clampCanvas(srcCanvas) {
    const { width, height } = srcCanvas;
    const longest = Math.max(width, height);
    if (longest <= MAX_DIMENSION) return srcCanvas;
    const scale = MAX_DIMENSION / longest;
    const out = document.createElement("canvas");
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    out.getContext("2d").drawImage(srcCanvas, 0, 0, out.width, out.height);
    return out;
  }

  function rgbaToCanvas(rgba, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(rgba);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  async function decodeTiff(file) {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds || ifds.length === 0) throw new Error("Μη έγκυρο TIFF αρχείο.");
    const canvases = [];
    for (const ifd of ifds) {
      UTIF.decodeImage(buffer, ifd, ifds);
      const rgba = UTIF.toRGBA8(ifd);
      canvases.push(clampCanvas(rgbaToCanvas(rgba, ifd.width, ifd.height)));
    }
    return canvases;
  }

  function decodeViaImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve([clampCanvas(canvas)]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Δεν ήταν δυνατή η ανάγνωση της εικόνας."));
      };
      img.src = url;
    });
  }

  async function decodeFile(file) {
    if (isTiff(file)) return decodeTiff(file);
    return decodeViaImageElement(file);
  }

  // ---------- Image processing ----------

  function rotateCanvas(srcCanvas, rotation) {
    if (rotation === 0) return srcCanvas;
    const { width, height } = srcCanvas;
    const out = document.createElement("canvas");
    const swap = rotation === 90 || rotation === 270;
    out.width = swap ? height : width;
    out.height = swap ? width : height;
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(srcCanvas, -width / 2, -height / 2);
    return out;
  }

  function orientedCanvas(page) {
    return rotateCanvas(page.baseCanvas, page.rotation);
  }

  function processedCanvas(page) {
    return ImageAdjust.process(orientedCanvas(page), page.colorMode, page.adjust);
  }

  function computeBaseCanvas(page) {
    const crop = page.crop;
    if (!crop) {
      page.baseCanvas = page.rawCanvas;
    } else if (crop.mode === "polygon") {
      page.baseCanvas = Perspective.warpPerspective(page.rawCanvas, crop.frame, MAX_DIMENSION, {
        aspect: "a4",
        orientation: crop.orientation,
        mask: crop.polygon,
      });
    } else {
      page.baseCanvas = Perspective.warpPerspective(page.rawCanvas, crop.corners, MAX_DIMENSION);
    }
  }

  function thumbDataUrl(page) {
    const canvas = processedCanvas(page);
    const scale = THUMB_MAX / Math.max(canvas.width, canvas.height);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.8);
  }

  // ---------- File handling ----------

  async function addFiles(fileList) {
    const files = Array.from(fileList);
    const pending = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") && !isTiff(file)) continue;
      try {
        const canvases = await decodeFile(file);
        canvases.forEach((canvas, idx) => {
          pending.push({
            id: nextId++,
            name: canvases.length > 1 ? `${file.name} (${idx + 1}/${canvases.length})` : file.name,
            rawCanvas: canvas,
            crop: null,
            baseCanvas: null,
            colorMode: defaultColorMode.value,
            adjust: Object.assign({}, defaultAdjust),
            rotation: 0,
          });
        });
      } catch (err) {
        console.error(err);
        setStatus(`Σφάλμα στο αρχείο "${file.name}": ${err.message}`, "error");
      }
    }

    if (pending.length === 0) return;

    if (autoCropToggle.checked) {
      for (let i = 0; i < pending.length; i++) {
        const page = pending[i];
        const result = await openCropper(page.rawCanvas, null, {
          allowCancel: false,
          stepLabel: pending.length > 1 ? `(${i + 1} από ${pending.length})` : "",
        });
        if (result.type === "apply") page.crop = result.crop;
        computeBaseCanvas(page);
        pages.push(page);
        renderPageList();
      }
    } else {
      pending.forEach((page) => {
        computeBaseCanvas(page);
        pages.push(page);
      });
      renderPageList();
    }
  }

  // ---------- Rendering ----------

  function renderPageList() {
    pageList.innerHTML = "";
    pages.forEach((page, index) => {
      const li = document.createElement("li");
      li.className = "page-item";
      li.draggable = true;
      li.dataset.id = String(page.id);

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      li.appendChild(handle);

      const badge = document.createElement("span");
      badge.className = "order-badge";
      badge.textContent = String(index + 1);
      li.appendChild(badge);

      const img = document.createElement("img");
      img.className = "thumb";
      img.src = thumbDataUrl(page);
      img.alt = page.name;
      li.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "meta";
      const fn = document.createElement("div");
      fn.className = "filename";
      fn.textContent = page.name;
      fn.title = page.name;
      meta.appendChild(fn);
      li.appendChild(meta);

      const controls = document.createElement("div");
      controls.className = "controls";

      const colorSelect = document.createElement("select");
      [
        ["color", "Έγχρωμο"],
        ["grayscale", "Grayscale"],
        ["bw", "Ασπρόμαυρο"],
      ].forEach(([value, label]) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        if (value === page.colorMode) opt.selected = true;
        colorSelect.appendChild(opt);
      });
      colorSelect.addEventListener("change", () => {
        page.colorMode = colorSelect.value;
        img.src = thumbDataUrl(page);
      });
      controls.appendChild(colorSelect);

      const cropBtn = document.createElement("button");
      cropBtn.className = "icon-btn";
      cropBtn.type = "button";
      cropBtn.title = "Προσαρμογή πλαισίου σελίδας (4 γωνίες ή πολύγωνο → A4)";
      cropBtn.textContent = "⛶";
      cropBtn.addEventListener("click", async () => {
        const result = await openCropper(page.rawCanvas, page.crop, { allowCancel: true });
        if (result.type === "cancel") return;
        page.crop = result.type === "apply" ? result.crop : null;
        computeBaseCanvas(page);
        img.src = thumbDataUrl(page);
      });
      controls.appendChild(cropBtn);

      const adjustBtn = document.createElement("button");
      adjustBtn.className = "icon-btn";
      adjustBtn.type = "button";
      adjustBtn.title = "Ρυθμίσεις εικόνας (κατώφλι, φωτεινότητα, αντίθεση, ευκρίνεια)";
      adjustBtn.textContent = "🎚";
      adjustBtn.addEventListener("click", async () => {
        const result = await ImageAdjust.openAdjuster(
          orientedCanvas(page), page.colorMode, page.adjust, `— σελίδα ${pages.indexOf(page) + 1}`
        );
        if (result.type === "cancel") return;
        if (result.type === "applyAll") {
          pages.forEach((p) => {
            p.colorMode = result.colorMode;
            p.adjust = Object.assign({}, result.adjust);
          });
          defaultAdjust = Object.assign({}, result.adjust);
          defaultColorMode.value = result.colorMode;
          renderPageList();
          return;
        }
        page.colorMode = result.colorMode;
        page.adjust = Object.assign({}, result.adjust);
        colorSelect.value = page.colorMode;
        img.src = thumbDataUrl(page);
      });
      controls.appendChild(adjustBtn);

      const rotateBtn = document.createElement("button");
      rotateBtn.className = "icon-btn";
      rotateBtn.type = "button";
      rotateBtn.title = "Περιστροφή 90°";
      rotateBtn.textContent = "⟳";
      rotateBtn.addEventListener("click", () => {
        page.rotation = (page.rotation + 90) % 360;
        img.src = thumbDataUrl(page);
      });
      controls.appendChild(rotateBtn);

      const removeBtn = document.createElement("button");
      removeBtn.className = "icon-btn remove-btn";
      removeBtn.type = "button";
      removeBtn.title = "Αφαίρεση";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        pages = pages.filter((p) => p.id !== page.id);
        renderPageList();
      });
      controls.appendChild(removeBtn);

      li.appendChild(controls);
      pageList.appendChild(li);
    });

    pageCount.textContent = String(pages.length);
    emptyHint.hidden = pages.length > 0;
    clearAllBtn.hidden = pages.length === 0;
    generateBtn.disabled = pages.length === 0;
  }

  // ---------- Drag & drop reorder ----------

  let dragSourceId = null;

  pageList.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".page-item");
    if (!li) return;
    dragSourceId = Number(li.dataset.id);
    li.classList.add("dragging");
  });

  pageList.addEventListener("dragend", (e) => {
    const li = e.target.closest(".page-item");
    if (li) li.classList.remove("dragging");
    pageList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });

  pageList.addEventListener("dragover", (e) => {
    e.preventDefault();
    const li = e.target.closest(".page-item");
    if (!li) return;
    pageList.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    li.classList.add("drag-over");
  });

  pageList.addEventListener("drop", (e) => {
    e.preventDefault();
    const li = e.target.closest(".page-item");
    if (!li || dragSourceId === null) return;
    const targetId = Number(li.dataset.id);
    if (targetId === dragSourceId) return;
    const fromIndex = pages.findIndex((p) => p.id === dragSourceId);
    const toIndex = pages.findIndex((p) => p.id === targetId);
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);
    dragSourceId = null;
    renderPageList();
  });

  // ---------- Upload UI wiring ----------

  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });

  clearAllBtn.addEventListener("click", () => {
    pages = [];
    renderPageList();
    hidePreview();
  });

  // ---------- Status helper ----------

  function setStatus(msg, kind) {
    statusMsg.textContent = msg;
    statusMsg.className = "status-msg" + (kind ? " " + kind : "");
  }

  function hidePreview() {
    previewPanel.hidden = true;
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    pdfPreview.src = "about:blank";
  }

  // ---------- Filename sanitation ----------

  function sanitizeFilename(name) {
    let cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
    cleaned = cleaned.replace(/\.+$/, "");
    if (!cleaned) cleaned = "scan";
    return cleaned;
  }

  // ---------- PDF generation ----------

  const PAGE_SIZES = {
    a4: [595.28, 841.89],
    letter: [612, 792],
  };

  async function canvasToEmbeddedImage(pdfDoc, canvas, colorMode) {
    const usePng = colorMode === "bw";
    const dataUrl = canvas.toDataURL(usePng ? "image/png" : "image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return usePng ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  }

  async function generatePdf() {
    if (pages.length === 0) return;
    generateBtn.disabled = true;
    setStatus("Δημιουργία PDF...");

    try {
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const sizeMode = pageSizeSelect.value;

      for (const page of pages) {
        const canvas = processedCanvas(page);
        const image = await canvasToEmbeddedImage(pdfDoc, canvas, page.colorMode);

        let pageW, pageH;
        if (sizeMode === "original") {
          const dpi = 150;
          pageW = (canvas.width / dpi) * 72;
          pageH = (canvas.height / dpi) * 72;
        } else {
          [pageW, pageH] = PAGE_SIZES[sizeMode];
        }

        const pdfPage = pdfDoc.addPage([pageW, pageH]);
        const scale = Math.min(pageW / canvas.width, pageH / canvas.height);
        const drawW = canvas.width * scale;
        const drawH = canvas.height * scale;
        pdfPage.drawImage(image, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = URL.createObjectURL(blob);

      const filename = sanitizeFilename(filenameInput.value) + ".pdf";
      pdfPreview.src = currentBlobUrl;
      downloadLink.href = currentBlobUrl;
      downloadLink.download = filename;
      previewPanel.hidden = false;
      previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });

      setStatus(`Το PDF δημιουργήθηκε με επιτυχία (${pages.length} σελίδ${pages.length === 1 ? "α" : "ες"}).`, "success");
    } catch (err) {
      console.error(err);
      setStatus("Σφάλμα κατά τη δημιουργία του PDF: " + err.message, "error");
    } finally {
      generateBtn.disabled = pages.length === 0;
    }
  }

  generateBtn.addEventListener("click", generatePdf);

  renderPageList();
})();
