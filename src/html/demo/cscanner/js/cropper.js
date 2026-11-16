(function () {
  "use strict";

  /*
   * Two modes:
   *  - "quad":    4 corners = the page. Dewarped to a rectangle (aspect from the corners).
   *  - "polygon": any number of points outlining the visible page area (e.g. a screenshot
   *               with a cut-off corner), plus a separate 4-corner A4 frame that may extend
   *               outside the image. The frame is dewarped to A4; everything outside the
   *               polygon becomes white background.
   * All state is kept in natural (source pixel) coordinates.
   */

  const FRAME_LABELS = ["↖", "↗", "↘", "↙"];

  const modal = document.getElementById("cropModal");
  const stage = document.getElementById("cropStage");
  const img = document.getElementById("cropImage");
  const svg = document.getElementById("cropOverlaySvg");
  const shade = document.getElementById("cropShade");
  const polygonEl = document.getElementById("cropPolygon");
  const frameEl = document.getElementById("cropFrame");
  const handlesLayer = document.getElementById("cropHandles");
  const modeQuadBtn = document.getElementById("cropModeQuad");
  const modePolyBtn = document.getElementById("cropModePoly");
  const hintQuad = document.getElementById("cropHintQuad");
  const hintPoly = document.getElementById("cropHintPoly");
  const orientationRow = document.getElementById("cropOrientationRow");
  const orientationSelect = document.getElementById("cropOrientation");
  const applyBtn = document.getElementById("cropApplyBtn");
  const skipBtn = document.getElementById("cropSkipBtn");
  const cancelBtn = document.getElementById("cropCancelBtn");
  const resetBtn = document.getElementById("cropResetBtn");
  const stepInfo = document.getElementById("cropStepInfo");

  let resolver = null;
  let srcW = 0;
  let srcH = 0;
  let scale = 1; // natural px per display px
  let pad = 0; // display px of free margin around the image (frame corners may go there)
  let dispW = 0;
  let dispH = 0;

  let state = null; // {mode, quad[4], polygon[], frame[4], orientation}
  let drag = null; // {kind: 'q'|'p'|'f', index, dx, dy} (dx/dy: grab offset, natural px)

  const copyPts = (pts) => pts.map((p) => ({ x: p.x, y: p.y }));

  function defaultQuad() {
    const mx = srcW * 0.06;
    const my = srcH * 0.06;
    return [
      { x: mx, y: my },
      { x: srcW - mx, y: my },
      { x: srcW - mx, y: srcH - my },
      { x: mx, y: srcH - my },
    ];
  }

  function toDisp(p) {
    return { x: p.x / scale + pad, y: p.y / scale + pad };
  }

  function fromClient(e) {
    const rect = stage.getBoundingClientRect();
    return { x: (e.clientX - rect.left - pad) * scale, y: (e.clientY - rect.top - pad) * scale };
  }

  function clampToImage(p) {
    return { x: Math.min(Math.max(p.x, 0), srcW), y: Math.min(Math.max(p.y, 0), srcH) };
  }

  function clampToStage(p) {
    const m = pad * scale;
    return { x: Math.min(Math.max(p.x, -m), srcW + m), y: Math.min(Math.max(p.y, -m), srcH + m) };
  }

  function ptsAttr(pts) {
    return pts.map((p) => {
      const d = toDisp(p);
      return `${d.x},${d.y}`;
    }).join(" ");
  }

  // ---------- Rendering ----------

  function makeHandle(kind, index, cls, label) {
    const el = document.createElement("div");
    el.className = "crop-handle " + cls;
    el.dataset.kind = kind;
    el.dataset.index = String(index);
    if (label && kind === "f") {
      const tag = document.createElement("span");
      tag.textContent = label;
      el.appendChild(tag);
    } else if (label) {
      el.textContent = label;
    }
    handlesLayer.appendChild(el);
  }

  function rebuildHandles() {
    handlesLayer.innerHTML = "";
    if (state.mode === "quad") {
      state.quad.forEach((_, i) => makeHandle("q", i, "handle-quad"));
    } else {
      state.frame.forEach((_, i) => makeHandle("f", i, "handle-frame", FRAME_LABELS[i]));
      state.polygon.forEach((_, i) => makeHandle("m", i, "handle-mid", "+"));
      state.polygon.forEach((_, i) => makeHandle("p", i, "handle-poly"));
    }
    updatePositions();
  }

  function handlePoint(kind, i) {
    if (kind === "q") return state.quad[i];
    if (kind === "f") return state.frame[i];
    if (kind === "p") return state.polygon[i];
    const a = state.polygon[i];
    const b = state.polygon[(i + 1) % state.polygon.length];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function updatePositions() {
    handlesLayer.querySelectorAll(".crop-handle").forEach((el) => {
      const d = toDisp(handlePoint(el.dataset.kind, Number(el.dataset.index)));
      el.style.left = d.x + "px";
      el.style.top = d.y + "px";
    });

    const keep = state.mode === "quad" ? state.quad : state.polygon;
    polygonEl.setAttribute("points", ptsAttr(keep));
    frameEl.setAttribute("points", state.mode === "polygon" ? ptsAttr(state.frame) : "");
    frameEl.style.display = state.mode === "polygon" ? "" : "none";

    const outer = `M${pad},${pad} h${dispW} v${dispH} h${-dispW} Z`;
    const inner = "M" + keep.map((p) => {
      const d = toDisp(p);
      return `${d.x},${d.y}`;
    }).join(" L") + " Z";
    shade.setAttribute("d", outer + " " + inner);
  }

  function syncModeUi() {
    const poly = state.mode === "polygon";
    modeQuadBtn.classList.toggle("active", !poly);
    modePolyBtn.classList.toggle("active", poly);
    hintQuad.hidden = poly;
    hintPoly.hidden = !poly;
    orientationRow.hidden = !poly;
    stage.classList.toggle("crop-polygon-mode", poly);
    orientationSelect.value = state.orientation;
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    if (mode === "polygon" && state.polygon.length === 0) {
      state.polygon = copyPts(state.quad);
      state.frame = copyPts(state.quad);
    }
    state.mode = mode;
    syncModeUi();
    rebuildHandles();
  }

  modeQuadBtn.addEventListener("click", () => setMode("quad"));
  modePolyBtn.addEventListener("click", () => setMode("polygon"));
  orientationSelect.addEventListener("change", () => {
    state.orientation = orientationSelect.value;
  });

  // ---------- Dragging ----------

  function onPointerMove(e) {
    if (!drag) return;
    const pt = fromClient(e);
    const raw = { x: pt.x - drag.dx, y: pt.y - drag.dy };
    if (drag.kind === "q") state.quad[drag.index] = clampToImage(raw);
    else if (drag.kind === "p") state.polygon[drag.index] = clampToImage(raw);
    else if (drag.kind === "f") state.frame[drag.index] = clampToStage(raw);
    updatePositions();
  }

  function onPointerUp() {
    drag = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  handlesLayer.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".crop-handle");
    if (!el || e.button > 0) return;
    e.preventDefault();
    const kind = el.dataset.kind;
    const index = Number(el.dataset.index);
    const pt = fromClient(e);
    if (kind === "m") {
      // Insert a new vertex at the edge midpoint and start dragging it.
      const mid = handlePoint("m", index);
      state.polygon.splice(index + 1, 0, mid);
      drag = { kind: "p", index: index + 1, dx: pt.x - mid.x, dy: pt.y - mid.y };
      rebuildHandles();
    } else {
      const cur = handlePoint(kind, index);
      drag = { kind, index, dx: pt.x - cur.x, dy: pt.y - cur.y };
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  function removeVertex(e) {
    const el = e.target.closest(".crop-handle.handle-poly");
    if (!el) return;
    e.preventDefault();
    if (state.polygon.length <= 3) return;
    state.polygon.splice(Number(el.dataset.index), 1);
    rebuildHandles();
  }
  handlesLayer.addEventListener("dblclick", removeVertex);
  handlesLayer.addEventListener("contextmenu", removeVertex);

  // ---------- Buttons ----------

  resetBtn.addEventListener("click", () => {
    if (state.mode === "quad") {
      state.quad = defaultQuad();
    } else {
      state.polygon = defaultQuad();
      state.frame = defaultQuad();
    }
    rebuildHandles();
  });

  function finish(result) {
    modal.hidden = true;
    img.removeAttribute("src");
    handlesLayer.innerHTML = "";
    const resolve = resolver;
    resolver = null;
    if (resolve) resolve(result);
  }

  applyBtn.addEventListener("click", () => {
    const crop = state.mode === "quad"
      ? { mode: "quad", corners: copyPts(state.quad) }
      : {
          mode: "polygon",
          polygon: copyPts(state.polygon),
          frame: copyPts(state.frame),
          orientation: state.orientation,
        };
    finish({ type: "apply", crop });
  });

  skipBtn.addEventListener("click", () => finish({ type: "full" }));
  cancelBtn.addEventListener("click", () => finish({ type: "cancel" }));

  // ---------- Layout ----------

  function layout() {
    const availW = Math.min(window.innerWidth * 0.9, 1400) - 40;
    const availH = Math.max(window.innerHeight - 340, 240);
    pad = Math.round(Math.min(availW, availH) * 0.1);
    const s = Math.min((availW - 2 * pad) / srcW, (availH - 2 * pad) / srcH, 3);
    dispW = Math.max(1, Math.round(srcW * s));
    dispH = Math.max(1, Math.round(srcH * s));
    scale = srcW / dispW;
    const stageW = dispW + 2 * pad;
    const stageH = dispH + 2 * pad;
    stage.style.width = stageW + "px";
    stage.style.height = stageH + "px";
    svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);
    img.style.left = pad + "px";
    img.style.top = pad + "px";
    img.style.width = dispW + "px";
    img.style.height = dispH + "px";
  }

  window.addEventListener("resize", () => {
    if (modal.hidden || !state) return;
    layout();
    updatePositions();
  });

  /**
   * Opens the page-frame picker over rawCanvas.
   * existingCrop: previous result crop ({mode:'quad',corners} | {mode:'polygon',polygon,frame,orientation}) or null.
   * options.allowCancel: show the "Άκυρο" button (keep previous state).
   * options.stepLabel: small text shown in the modal title, e.g. "2 από 5".
   * Resolves to {type:'apply', crop} | {type:'full'} | {type:'cancel'}.
   */
  function openCropper(rawCanvas, existingCrop, options) {
    options = options || {};
    return new Promise((resolve) => {
      resolver = resolve;
      cancelBtn.hidden = !options.allowCancel;
      stepInfo.textContent = options.stepLabel || "";
      srcW = rawCanvas.width;
      srcH = rawCanvas.height;

      state = { mode: "quad", quad: defaultQuad(), polygon: [], frame: [], orientation: "auto" };
      if (existingCrop && existingCrop.mode === "quad") {
        state.quad = copyPts(existingCrop.corners);
      } else if (existingCrop && existingCrop.mode === "polygon") {
        state.mode = "polygon";
        state.polygon = copyPts(existingCrop.polygon);
        state.frame = copyPts(existingCrop.frame);
        state.orientation = existingCrop.orientation || "auto";
        state.quad = existingCrop.frame.map(clampToImage);
      }

      modal.hidden = false;
      img.src = rawCanvas.toDataURL("image/jpeg", 0.85);
      layout();
      syncModeUi();
      rebuildHandles();
    });
  }

  window.openCropper = openCropper;
})();
