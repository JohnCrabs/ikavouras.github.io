(function () {
  "use strict";

  /*
   * Three modes:
   *  - "quad":    4 corners = the page. Dewarped to a rectangle (aspect from the corners).
   *  - "polygon": any number of points outlining the visible page area (e.g. a screenshot
   *               with a cut-off corner), plus a separate 4-corner A4 frame that may extend
   *               outside the image. The frame is dewarped to A4; everything outside the
   *               polygon becomes white background.
   *  - "curve":   curved page (book near the spine): a top curve TL→TR and a bottom curve BL→BR
   *               with any number of points each; dewarped by Dewarp.warpCurved. The curves can be
   *               detected automatically from the text lines (Dewarp.estimateCurves).
   * All state is kept in natural (source pixel) coordinates.
   */

  const FRAME_LABELS = ["↖", "↗", "↘", "↙"];
  const CURVE_POINTS = 5; // initial points per curve (incl. corners)

  const modal = document.getElementById("cropModal");
  const stage = document.getElementById("cropStage");
  const img = document.getElementById("cropImage");
  const svg = document.getElementById("cropOverlaySvg");
  const shade = document.getElementById("cropShade");
  const polygonEl = document.getElementById("cropPolygon");
  const frameEl = document.getElementById("cropFrame");
  const handlesLayer = document.getElementById("cropHandles");
  const modeBtns = {
    quad: document.getElementById("cropModeQuad"),
    polygon: document.getElementById("cropModePoly"),
    curve: document.getElementById("cropModeCurve"),
  };
  const hints = {
    quad: document.getElementById("cropHintQuad"),
    polygon: document.getElementById("cropHintPoly"),
    curve: document.getElementById("cropHintCurve"),
  };
  const orientationRow = document.getElementById("cropOrientationRow");
  const orientationSelect = document.getElementById("cropOrientation");
  const curveRow = document.getElementById("cropCurveRow");
  const autoCurveBtn = document.getElementById("cropAutoCurveBtn");
  const curveStatus = document.getElementById("cropCurveStatus");
  const applyBtn = document.getElementById("cropApplyBtn");
  const skipBtn = document.getElementById("cropSkipBtn");
  const cancelBtn = document.getElementById("cropCancelBtn");
  const resetBtn = document.getElementById("cropResetBtn");
  const stepInfo = document.getElementById("cropStepInfo");
  const viewport = document.getElementById("cropViewport");
  const zoomInBtn = document.getElementById("cropZoomIn");
  const zoomOutBtn = document.getElementById("cropZoomOut");
  const zoomFitBtn = document.getElementById("cropZoomFit");
  const zoomLabel = document.getElementById("cropZoomLabel");

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 10;
  const ZOOM_STEP = 1.25;

  let resolver = null;
  let rawSource = null;
  let srcW = 0;
  let srcH = 0;
  let scale = 1; // natural px per display px
  let pad = 0; // display px of free margin around the image (frame corners may go there)
  let dispW = 0;
  let dispH = 0;

  // Zoom: the viewport keeps the "fit" size; the stage inside it grows by `zoom` and is panned.
  let baseS = 1; // display px per natural px at zoom 1
  let basePad = 0;
  let vpW = 0;
  let vpH = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let panDrag = null; // {x, y, panX, panY}

  let state = null; // {mode, quad[4], polygon[], frame[4], orientation, top[], bottom[]}
  let drag = null; // {kind, index, dx, dy} (dx/dy: grab offset, natural px)

  const copyPts = (pts) => pts.map((p) => ({ x: p.x, y: p.y }));
  const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

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

  function curvesFromQuad(q) {
    const top = [];
    const bottom = [];
    for (let i = 0; i < CURVE_POINTS; i++) {
      const t = i / (CURVE_POINTS - 1);
      top.push(lerpPt(q[0], q[1], t));
      bottom.push(lerpPt(q[3], q[2], t));
    }
    return { top, bottom };
  }

  function curveCorners() {
    return [state.top[0], state.top[state.top.length - 1], state.bottom[state.bottom.length - 1], state.bottom[0]];
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

  /** The outline of the kept area (natural px). */
  function keptOutline() {
    if (state.mode === "quad") return state.quad;
    if (state.mode === "polygon") return state.polygon;
    return Dewarp.densify(state.top, 12).concat(Dewarp.densify(state.bottom, 12).reverse());
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
    } else if (state.mode === "polygon") {
      state.frame.forEach((_, i) => makeHandle("f", i, "handle-frame", FRAME_LABELS[i]));
      state.polygon.forEach((_, i) => makeHandle("m", i, "handle-mid", "+"));
      state.polygon.forEach((_, i) => makeHandle("p", i, "handle-poly"));
    } else {
      ["t", "b"].forEach((k) => {
        const pts = k === "t" ? state.top : state.bottom;
        for (let i = 0; i < pts.length - 1; i++) makeHandle("m" + k, i, "handle-mid handle-mid-curve", "+");
        pts.forEach((_, i) => {
          const corner = i === 0 || i === pts.length - 1;
          makeHandle(k, i, corner ? "handle-quad" : "handle-curve");
        });
      });
    }
    updatePositions();
  }

  function curveMid(pts, i) {
    // Point on the spline halfway between pts[i] and pts[i+1].
    const dense = Dewarp.densify(pts, 24);
    return dense[Math.min(dense.length - 1, i * 24 + 12)];
  }

  function handlePoint(kind, i) {
    switch (kind) {
      case "q": return state.quad[i];
      case "f": return state.frame[i];
      case "p": return state.polygon[i];
      case "t": return state.top[i];
      case "b": return state.bottom[i];
      case "mt": return curveMid(state.top, i);
      case "mb": return curveMid(state.bottom, i);
      default: {
        const a = state.polygon[i];
        const b = state.polygon[(i + 1) % state.polygon.length];
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
  }

  function updatePositions() {
    handlesLayer.querySelectorAll(".crop-handle").forEach((el) => {
      const d = toDisp(handlePoint(el.dataset.kind, Number(el.dataset.index)));
      el.style.left = d.x + "px";
      el.style.top = d.y + "px";
    });

    const keep = keptOutline();
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
    Object.keys(modeBtns).forEach((m) => {
      modeBtns[m].classList.toggle("active", state.mode === m);
      hints[m].hidden = state.mode !== m;
    });
    orientationRow.hidden = state.mode !== "polygon";
    curveRow.hidden = state.mode !== "curve";
    stage.classList.toggle("crop-polygon-mode", state.mode === "polygon");
    stage.classList.toggle("crop-curve-mode", state.mode === "curve");
    orientationSelect.value = state.orientation;
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    if (mode === "polygon" && state.polygon.length === 0) {
      state.polygon = copyPts(state.quad);
      state.frame = copyPts(state.quad);
    }
    if (mode === "curve" && state.top.length === 0) {
      Object.assign(state, curvesFromQuad(state.quad));
    }
    state.mode = mode;
    curveStatus.textContent = "";
    syncModeUi();
    rebuildHandles();
  }

  Object.keys(modeBtns).forEach((m) => modeBtns[m].addEventListener("click", () => setMode(m)));
  orientationSelect.addEventListener("change", () => {
    state.orientation = orientationSelect.value;
  });

  autoCurveBtn.addEventListener("click", () => {
    curveStatus.textContent = "Ανίχνευση…";
    curveStatus.className = "hint";
    // Let the status paint before the (synchronous) analysis.
    setTimeout(() => {
      let result = null;
      try {
        result = Dewarp.estimateCurves(rawSource, curveCorners(), 7);
      } catch (err) {
        console.error(err);
      }
      if (!result) {
        curveStatus.textContent = "Δεν βρέθηκαν γραμμές κειμένου. Βάλτε τις γωνίες στις άκρες της σελίδας ή ορίστε την καμπύλη με το χέρι.";
        curveStatus.className = "hint error";
        return;
      }
      state.top = result.top.map(clampToImage);
      state.bottom = result.bottom.map(clampToImage);
      curveStatus.textContent = `Βρέθηκαν ${result.lineCount} γραμμές κειμένου. Διορθώστε τα σημεία αν χρειάζεται.`;
      curveStatus.className = "hint success";
      rebuildHandles();
    }, 20);
  });

  // ---------- Dragging ----------

  function onPointerMove(e) {
    if (!drag) return;
    const pt = fromClient(e);
    const raw = { x: pt.x - drag.dx, y: pt.y - drag.dy };
    if (drag.kind === "q") state.quad[drag.index] = clampToImage(raw);
    else if (drag.kind === "p") state.polygon[drag.index] = clampToImage(raw);
    else if (drag.kind === "f") state.frame[drag.index] = clampToStage(raw);
    else if (drag.kind === "t") state.top[drag.index] = clampToImage(raw);
    else if (drag.kind === "b") state.bottom[drag.index] = clampToImage(raw);
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
    if (kind === "m" || kind === "mt" || kind === "mb") {
      // Insert a new vertex at the edge midpoint and start dragging it.
      const mid = handlePoint(kind, index);
      const list = kind === "m" ? state.polygon : kind === "mt" ? state.top : state.bottom;
      list.splice(index + 1, 0, { x: mid.x, y: mid.y });
      drag = { kind: kind === "m" ? "p" : kind.slice(1), index: index + 1, dx: pt.x - mid.x, dy: pt.y - mid.y };
      rebuildHandles();
    } else {
      const cur = handlePoint(kind, index);
      drag = { kind, index, dx: pt.x - cur.x, dy: pt.y - cur.y };
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  function removeVertex(e) {
    const el = e.target.closest(".crop-handle");
    if (!el) return;
    const kind = el.dataset.kind;
    const index = Number(el.dataset.index);
    if (kind === "p") {
      e.preventDefault();
      if (state.polygon.length > 3) state.polygon.splice(index, 1);
    } else if (kind === "t" || kind === "b") {
      e.preventDefault();
      const list = kind === "t" ? state.top : state.bottom;
      if (index > 0 && index < list.length - 1) list.splice(index, 1); // corners stay
    } else {
      return;
    }
    rebuildHandles();
  }
  handlesLayer.addEventListener("dblclick", removeVertex);
  handlesLayer.addEventListener("contextmenu", removeVertex);

  // ---------- Buttons ----------

  resetBtn.addEventListener("click", () => {
    if (state.mode === "quad") {
      state.quad = defaultQuad();
    } else if (state.mode === "polygon") {
      state.polygon = defaultQuad();
      state.frame = defaultQuad();
    } else {
      Object.assign(state, curvesFromQuad(defaultQuad()));
      curveStatus.textContent = "";
    }
    rebuildHandles();
  });

  function finish(result) {
    modal.hidden = true;
    img.removeAttribute("src");
    handlesLayer.innerHTML = "";
    rawSource = null;
    const resolve = resolver;
    resolver = null;
    if (resolve) resolve(result);
  }

  applyBtn.addEventListener("click", () => {
    let crop;
    if (state.mode === "quad") {
      crop = { mode: "quad", corners: copyPts(state.quad) };
    } else if (state.mode === "polygon") {
      crop = {
        mode: "polygon",
        polygon: copyPts(state.polygon),
        frame: copyPts(state.frame),
        orientation: state.orientation,
      };
    } else {
      crop = { mode: "curve", top: copyPts(state.top), bottom: copyPts(state.bottom) };
    }
    finish({ type: "apply", crop });
  });

  skipBtn.addEventListener("click", () => finish({ type: "full" }));
  cancelBtn.addEventListener("click", () => finish({ type: "cancel" }));

  // ---------- Layout & zoom ----------

  function layout() {
    const availW = Math.min(window.innerWidth * 0.9, 1400) - 40;
    const availH = Math.max(window.innerHeight - 380, 240);
    basePad = Math.round(Math.min(availW, availH) * 0.1);
    baseS = Math.min((availW - 2 * basePad) / srcW, (availH - 2 * basePad) / srcH, 3);
    vpW = Math.round(srcW * baseS + 2 * basePad);
    vpH = Math.round(srcH * baseS + 2 * basePad);
    viewport.style.width = vpW + "px";
    viewport.style.height = vpH + "px";
    applyZoom();
  }

  function applyZoom() {
    const s = baseS * zoom;
    dispW = srcW * s;
    dispH = srcH * s;
    pad = basePad * zoom;
    scale = 1 / s;
    const stageW = dispW + 2 * pad;
    const stageH = dispH + 2 * pad;
    stage.style.width = stageW + "px";
    stage.style.height = stageH + "px";
    svg.setAttribute("viewBox", `0 0 ${stageW} ${stageH}`);
    img.style.left = pad + "px";
    img.style.top = pad + "px";
    img.style.width = dispW + "px";
    img.style.height = dispH + "px";

    // Keep the stage covering the viewport.
    panX = Math.min(0, Math.max(vpW - stageW, panX));
    panY = Math.min(0, Math.max(vpH - stageH, panY));
    stage.style.left = panX + "px";
    stage.style.top = panY + "px";

    zoomLabel.textContent = Math.round(zoom * 100) + "%";
    zoomOutBtn.disabled = zoom <= ZOOM_MIN;
    zoomInBtn.disabled = zoom >= ZOOM_MAX;
    viewport.classList.toggle("zoomed", zoom > ZOOM_MIN);
    if (state) updatePositions();
  }

  /** Zooms keeping the point at viewport coords (vx, vy) fixed on screen. */
  function zoomAt(newZoom, vx, vy) {
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    if (newZoom === zoom) return;
    const nx = (vx - panX - pad) * scale;
    const ny = (vy - panY - pad) * scale;
    zoom = newZoom;
    const s = baseS * zoom;
    const p = basePad * zoom;
    panX = vx - (nx * s + p);
    panY = vy - (ny * s + p);
    applyZoom();
  }

  function viewportPoint(e) {
    const r = viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  zoomInBtn.addEventListener("click", () => zoomAt(zoom * ZOOM_STEP, vpW / 2, vpH / 2));
  zoomOutBtn.addEventListener("click", () => zoomAt(zoom / ZOOM_STEP, vpW / 2, vpH / 2));
  zoomFitBtn.addEventListener("click", () => zoomAt(ZOOM_MIN, vpW / 2, vpH / 2));

  viewport.addEventListener("wheel", (e) => {
    if (modal.hidden) return;
    e.preventDefault();
    const v = viewportPoint(e);
    zoomAt(zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), v.x, v.y);
  }, { passive: false });

  viewport.addEventListener("dblclick", (e) => {
    if (e.target.closest(".crop-handle")) return;
    const v = viewportPoint(e);
    zoomAt(zoom * 2, v.x, v.y);
  });

  // Pan: drag on an empty area (left button, when zoomed in), or middle button anywhere.
  viewport.addEventListener("pointerdown", (e) => {
    const onHandle = e.target.closest(".crop-handle");
    if ((onHandle && e.button === 0) || e.button === 2) return;
    if (zoom <= ZOOM_MIN && e.button === 0) return;
    e.preventDefault();
    panDrag = { x: e.clientX, y: e.clientY, panX, panY };
    viewport.classList.add("panning");
    window.addEventListener("pointermove", onPanMove);
    window.addEventListener("pointerup", onPanUp);
  });

  function onPanMove(e) {
    if (!panDrag) return;
    panX = panDrag.panX + (e.clientX - panDrag.x);
    panY = panDrag.panY + (e.clientY - panDrag.y);
    applyZoom();
  }

  function onPanUp() {
    panDrag = null;
    viewport.classList.remove("panning");
    window.removeEventListener("pointermove", onPanMove);
    window.removeEventListener("pointerup", onPanUp);
  }

  window.addEventListener("resize", () => {
    if (modal.hidden || !state) return;
    layout();
  });

  /**
   * Opens the page-frame picker over rawCanvas.
   * existingCrop: previous result crop ({mode:'quad',corners} | {mode:'polygon',polygon,frame,orientation}
   *   | {mode:'curve',top,bottom}) or null.
   * options.allowCancel: show the "Άκυρο" button (keep previous state).
   * options.stepLabel: small text shown in the modal title, e.g. "2 από 5".
   * Resolves to {type:'apply', crop} | {type:'full'} | {type:'cancel'}.
   */
  function openCropper(rawCanvas, existingCrop, options) {
    options = options || {};
    return new Promise((resolve) => {
      resolver = resolve;
      rawSource = rawCanvas;
      cancelBtn.hidden = !options.allowCancel;
      stepInfo.textContent = options.stepLabel || "";
      curveStatus.textContent = "";
      srcW = rawCanvas.width;
      srcH = rawCanvas.height;

      state = { mode: "quad", quad: defaultQuad(), polygon: [], frame: [], orientation: "auto", top: [], bottom: [] };
      if (existingCrop && existingCrop.mode === "quad") {
        state.quad = copyPts(existingCrop.corners);
      } else if (existingCrop && existingCrop.mode === "polygon") {
        state.mode = "polygon";
        state.polygon = copyPts(existingCrop.polygon);
        state.frame = copyPts(existingCrop.frame);
        state.orientation = existingCrop.orientation || "auto";
        state.quad = existingCrop.frame.map(clampToImage);
      } else if (existingCrop && existingCrop.mode === "curve") {
        state.mode = "curve";
        state.top = copyPts(existingCrop.top);
        state.bottom = copyPts(existingCrop.bottom);
        state.quad = copyPts(curveCorners());
      }

      modal.hidden = false;
      img.src = rawCanvas.toDataURL("image/jpeg", 0.85);
      zoom = 1;
      panX = 0;
      panY = 0;
      layout();
      syncModeUi();
      rebuildHandles();
    });
  }

  window.openCropper = openCropper;
})();
