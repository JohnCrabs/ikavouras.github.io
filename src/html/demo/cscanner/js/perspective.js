(function (global) {
  "use strict";

  // Solve an 8x8 linear system via Gaussian elimination with partial pivoting.
  function gaussianSolve(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      let maxVal = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > maxVal) {
          maxVal = Math.abs(M[r][col]);
          pivot = r;
        }
      }
      if (pivot !== col) {
        const tmp = M[col];
        M[col] = M[pivot];
        M[pivot] = tmp;
      }
      const pivotVal = M[col][col] || 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / pivotVal;
        if (factor === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    const result = new Array(n);
    for (let i = 0; i < n; i++) result[i] = M[i][n] / M[i][i];
    return result;
  }

  // Finds H (8 params, h33=1) such that for each i: to[i] ~ H * from[i] (projective).
  function solveHomography(from, to) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i];
      const { x: X, y: Y } = to[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
      b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
      b.push(Y);
    }
    return gaussianSolve(A, b);
  }

  function applyHomography(h, x, y) {
    const denom = h[6] * x + h[7] * y + 1;
    return {
      x: (h[0] * x + h[1] * y + h[2]) / denom,
      y: (h[3] * x + h[4] * y + h[5]) / denom,
    };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Dewarps the quadrilateral [tl, tr, br, bl] (source pixel coordinates) of srcCanvas
   * into a flat rectangular canvas, as if scanned flat. Returns a new canvas.
   * Corners may lie outside the source image; such areas become `background`.
   *
   * opts.aspect: "a4" forces the output to A4 proportions (1:sqrt2).
   * opts.orientation: "auto" | "portrait" | "landscape" (only with aspect).
   * opts.mask: polygon (source pixel coords). Everything outside it becomes background.
   * opts.background: CSS color for out-of-image / masked areas (default white).
   */
  function warpPerspective(srcCanvas, corners, maxDimension, opts) {
    opts = opts || {};
    const background = opts.background || "#ffffff";
    const [tl, tr, br, bl] = corners;
    const measuredW = Math.max(distance(tl, tr), distance(bl, br));
    const measuredH = Math.max(distance(tl, bl), distance(tr, br));

    let dstW, dstH;
    if (opts.aspect === "a4") {
      let portrait = measuredH >= measuredW;
      if (opts.orientation === "portrait") portrait = true;
      else if (opts.orientation === "landscape") portrait = false;
      const ratio = portrait ? Math.SQRT2 : 1 / Math.SQRT2; // H / W
      dstW = Math.max(measuredW, measuredH / ratio);
      dstH = dstW * ratio;
    } else {
      dstW = measuredW;
      dstH = measuredH;
    }
    dstW = Math.max(1, Math.round(dstW));
    dstH = Math.max(1, Math.round(dstH));

    if (maxDimension) {
      const longest = Math.max(dstW, dstH);
      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        dstW = Math.max(1, Math.round(dstW * scale));
        dstH = Math.max(1, Math.round(dstH * scale));
      }
    }

    const dstRect = [
      { x: 0, y: 0 },
      { x: dstW, y: 0 },
      { x: dstW, y: dstH },
      { x: 0, y: dstH },
    ];
    // Maps destination (u,v) -> source (x,y), so we can sample directly (inverse mapping).
    const h = solveHomography(dstRect, [tl, tr, br, bl]);

    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const srcData = srcCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;

    const out = document.createElement("canvas");
    out.width = dstW;
    out.height = dstH;
    const outCtx = out.getContext("2d");
    const outImg = outCtx.createImageData(dstW, dstH);
    const outData = outImg.data;

    const bg = parseColor(background);

    let p = 0;
    for (let v = 0; v < dstH; v++) {
      for (let u = 0; u < dstW; u++) {
        const denom = h[6] * u + h[7] * v + 1;
        const sx = (h[0] * u + h[1] * v + h[2]) / denom;
        const sy = (h[3] * u + h[4] * v + h[5]) / denom;

        if (sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) {
          outData[p++] = bg[0];
          outData[p++] = bg[1];
          outData[p++] = bg[2];
          outData[p++] = 255;
          continue;
        }

        const cx = Math.min(Math.max(sx, 0), sw - 1);
        const cy = Math.min(Math.max(sy, 0), sh - 1);
        const x0 = Math.floor(cx);
        const y0 = Math.floor(cy);
        const x1 = Math.min(x0 + 1, sw - 1);
        const y1 = Math.min(y0 + 1, sh - 1);
        const fx = cx - x0;
        const fy = cy - y0;

        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;

        for (let c = 0; c < 4; c++) {
          const top = srcData[i00 + c] * (1 - fx) + srcData[i10 + c] * fx;
          const bottom = srcData[i01 + c] * (1 - fx) + srcData[i11 + c] * fx;
          outData[p++] = top * (1 - fy) + bottom * fy;
        }
      }
    }
    outCtx.putImageData(outImg, 0, 0);

    if (!opts.mask || opts.mask.length < 3) return out;

    // Straight lines stay straight under a homography, so the mask polygon maps
    // to a polygon in output space: clip to it and fill the rest with background.
    const fwd = solveHomography([tl, tr, br, bl], dstRect);
    const masked = document.createElement("canvas");
    masked.width = dstW;
    masked.height = dstH;
    const mctx = masked.getContext("2d");
    mctx.fillStyle = background;
    mctx.fillRect(0, 0, dstW, dstH);
    mctx.save();
    mctx.beginPath();
    opts.mask.forEach((pt, i) => {
      const q = applyHomography(fwd, pt.x, pt.y);
      if (i === 0) mctx.moveTo(q.x, q.y);
      else mctx.lineTo(q.x, q.y);
    });
    mctx.closePath();
    mctx.clip();
    mctx.drawImage(out, 0, 0);
    mctx.restore();
    return masked;
  }

  function parseColor(css) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  }

  global.Perspective = { warpPerspective, solveHomography, applyHomography };
})(window);
