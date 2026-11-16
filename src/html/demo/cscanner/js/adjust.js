(function (global) {
  "use strict";

  /**
   * Per-page image adjustments.
   * brightness, contrast: -100..100 (0 = unchanged)
   * sharpen: 0..100
   * threshold: 0..255, only for "bw" (luminance >= threshold -> white)
   * autoLevels: stretch the luminance histogram so the darkest/brightest 0.5% become black/white
   */
  const DEFAULTS = Object.freeze({
    autoLevels: false,
    brightness: 0,
    contrast: 0,
    sharpen: 0,
    threshold: 175,
  });

  const PREVIEW_MAX = 1200;

  function clamp255(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  function isNeutral(adj) {
    return !adj.autoLevels && adj.brightness === 0 && adj.contrast === 0 && adj.sharpen === 0;
  }

  function luminanceLevels(d) {
    const hist = new Uint32Array(256);
    const stride = Math.max(1, Math.floor(d.length / 4 / 250000)) * 4; // sample ~250k px
    let count = 0;
    for (let i = 0; i < d.length; i += stride) {
      hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
      count++;
    }
    const cut = count * 0.005;
    let lo = 0;
    let acc = 0;
    while (lo < 255 && acc + hist[lo] <= cut) acc += hist[lo++];
    let hi = 255;
    acc = 0;
    while (hi > 0 && acc + hist[hi] <= cut) acc += hist[hi--];
    if (hi - lo < 10) return null;
    return { lo, hi };
  }

  function buildLut(adj, levels) {
    const lut = new Uint8ClampedArray(256);
    const c = adj.contrast * 2.55;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const b = adj.brightness * 2.55;
    for (let v = 0; v < 256; v++) {
      let x = v;
      if (levels) x = ((x - levels.lo) * 255) / (levels.hi - levels.lo);
      x = (x - 128) * cf + 128 + b;
      lut[v] = clamp255(Math.round(x));
    }
    return lut;
  }

  // Unsharp mask with a 3x3 box blur, on a single channel (in place).
  function sharpenChannel(ch, w, h, amount) {
    const src = ch.slice();
    for (let y = 0; y < h; y++) {
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < h - 1 ? y + 1 : h - 1;
      for (let x = 0; x < w; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x < w - 1 ? x + 1 : w - 1;
        const r0 = y0 * w;
        const r1 = y * w;
        const r2 = y1 * w;
        const blur =
          (src[r0 + x0] + src[r0 + x] + src[r0 + x1] +
            src[r1 + x0] + src[r1 + x] + src[r1 + x1] +
            src[r2 + x0] + src[r2 + x] + src[r2 + x1]) / 9;
        const v = src[r1 + x];
        ch[r1 + x] = v + amount * (v - blur);
      }
    }
  }

  /** Returns a new canvas with colorMode + adjustments applied (or srcCanvas if nothing to do). */
  function process(srcCanvas, colorMode, adj) {
    adj = Object.assign({}, DEFAULTS, adj || {});
    if (colorMode === "color" && isNeutral(adj)) return srcCanvas;

    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.drawImage(srcCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;

    const lut = buildLut(adj, adj.autoLevels ? luminanceLevels(d) : null);
    const amount = (adj.sharpen / 100) * 2;

    if (colorMode === "color") {
      if (amount > 0) {
        for (let c = 0; c < 3; c++) {
          const ch = new Uint8ClampedArray(n);
          for (let i = 0; i < n; i++) ch[i] = lut[d[i * 4 + c]];
          sharpenChannel(ch, w, h, amount);
          for (let i = 0; i < n; i++) d[i * 4 + c] = ch[i];
        }
      } else {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = lut[d[i]];
          d[i + 1] = lut[d[i + 1]];
          d[i + 2] = lut[d[i + 2]];
        }
      }
    } else {
      const g = new Uint8ClampedArray(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        g[i] = lut[Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2])];
      }
      if (amount > 0) sharpenChannel(g, w, h, amount);
      const bw = colorMode === "bw";
      const t = adj.threshold;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = bw ? (g[i] >= t ? 255 : 0) : g[i];
        d[j] = d[j + 1] = d[j + 2] = v;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  function downscale(canvas, maxDim) {
    const longest = Math.max(canvas.width, canvas.height);
    if (longest <= maxDim) return canvas;
    const s = maxDim / longest;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(canvas.width * s));
    out.height = Math.max(1, Math.round(canvas.height * s));
    out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }

  // ---------- Modal ----------

  const modal = document.getElementById("adjustModal");
  const nameEl = document.getElementById("adjustPageName");
  const canvas = document.getElementById("adjustCanvas");
  const modeSelect = document.getElementById("adjustColorMode");
  const autoLevels = document.getElementById("adjustAutoLevels");
  const thresholdRow = document.getElementById("adjustThresholdRow");
  const compareBtn = document.getElementById("adjustCompareBtn");
  const resetBtn = document.getElementById("adjustResetBtn");
  const cancelBtn = document.getElementById("adjustCancelBtn");
  const applyAllBtn = document.getElementById("adjustApplyAllBtn");
  const applyBtn = document.getElementById("adjustApplyBtn");
  const sliders = {};
  ["brightness", "contrast", "sharpen", "threshold"].forEach((key) => {
    sliders[key] = {
      input: document.getElementById("adjust-" + key),
      value: document.getElementById("adjust-" + key + "-value"),
    };
  });

  let resolver = null;
  let previewSrc = null;
  let rafPending = false;
  let showOriginal = false;

  function readState() {
    return {
      colorMode: modeSelect.value,
      adjust: {
        autoLevels: autoLevels.checked,
        brightness: Number(sliders.brightness.input.value),
        contrast: Number(sliders.contrast.input.value),
        sharpen: Number(sliders.sharpen.input.value),
        threshold: Number(sliders.threshold.input.value),
      },
    };
  }

  function writeState(colorMode, adj) {
    adj = Object.assign({}, DEFAULTS, adj || {});
    modeSelect.value = colorMode;
    autoLevels.checked = adj.autoLevels;
    Object.keys(sliders).forEach((k) => {
      sliders[k].input.value = String(adj[k]);
    });
    syncLabels();
  }

  function syncLabels() {
    Object.keys(sliders).forEach((k) => {
      const v = Number(sliders[k].input.value);
      sliders[k].value.textContent = (k === "brightness" || k === "contrast") && v > 0 ? "+" + v : String(v);
    });
    thresholdRow.hidden = modeSelect.value !== "bw";
  }

  function render() {
    rafPending = false;
    if (!previewSrc) return;
    const st = readState();
    const result = showOriginal ? previewSrc : process(previewSrc, st.colorMode, st.adjust);
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext("2d").drawImage(result, 0, 0);
  }

  function scheduleRender() {
    syncLabels();
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(render);
  }

  Object.values(sliders).forEach((s) => s.input.addEventListener("input", scheduleRender));
  modeSelect.addEventListener("change", scheduleRender);
  autoLevels.addEventListener("change", scheduleRender);

  function setCompare(on) {
    if (showOriginal === on) return;
    showOriginal = on;
    scheduleRender();
  }
  compareBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setCompare(true);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    compareBtn.addEventListener(ev, () => setCompare(false))
  );

  resetBtn.addEventListener("click", () => {
    writeState(modeSelect.value, DEFAULTS);
    scheduleRender();
  });

  function finish(type) {
    const st = readState();
    modal.hidden = true;
    previewSrc = null;
    const resolve = resolver;
    resolver = null;
    if (resolve) resolve(Object.assign({ type }, st));
  }
  cancelBtn.addEventListener("click", () => finish("cancel"));
  applyBtn.addEventListener("click", () => finish("apply"));
  applyAllBtn.addEventListener("click", () => finish("applyAll"));

  /**
   * Opens the adjustments modal.
   * sourceCanvas: the page after crop + rotation (before color processing).
   * Resolves to {type: 'apply'|'applyAll'|'cancel', colorMode, adjust}.
   */
  function openAdjuster(sourceCanvas, colorMode, adj, label) {
    return new Promise((resolve) => {
      resolver = resolve;
      previewSrc = downscale(sourceCanvas, PREVIEW_MAX);
      showOriginal = false;
      nameEl.textContent = label || "";
      writeState(colorMode, adj);
      modal.hidden = false;
      render();
    });
  }

  global.ImageAdjust = { DEFAULTS, process, openAdjuster };
})(window);
