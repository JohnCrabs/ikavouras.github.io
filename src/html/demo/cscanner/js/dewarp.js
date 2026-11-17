(function (global) {
  "use strict";

  /*
   * Curved-page dewarping (e.g. a book page bending towards the spine).
   *
   * The page is described by a top curve (TL → TR) and a bottom curve (BL → BR), each a list of
   * points in source pixels; the sides are the straight lines joining their ends. Each curve is a
   * Catmull-Rom spline through its points, resampled by arc length. Output pixel (u, v) samples the
   * source at lerp(top(u), bottom(u), v), so text lines bent like the edges come out straight.
   *
   * estimateCurves() finds those curves automatically from the text lines inside a 4-corner quad.
   */

  // ---------- Splines ----------

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }

  /** Dense polyline through pts (Catmull-Rom, ends extrapolated). */
  function densify(pts, perSegment) {
    perSegment = perSegment || 24;
    if (pts.length < 2) return pts.slice();
    const n = pts.length;
    const ext = [
      { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y },
      ...pts,
      { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y },
    ];
    const out = [];
    for (let i = 1; i < ext.length - 2; i++) {
      for (let s = 0; s < perSegment; s++) {
        out.push(catmullRom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], s / perSegment));
      }
    }
    out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
    return out;
  }

  /** Returns {length, at(t)} where t in [0,1] is the arc-length fraction along the spline. */
  function arcLengthCurve(pts) {
    const dense = densify(pts);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
    }
    const length = cum[cum.length - 1];
    let j = 1;
    let lastTarget = -1;
    function at(t) {
      const target = Math.min(Math.max(t, 0), 1) * length;
      if (target < lastTarget) j = 1; // sequential access is the fast path
      lastTarget = target;
      while (j < cum.length - 1 && cum[j] < target) j++;
      const seg = cum[j] - cum[j - 1] || 1;
      const f = (target - cum[j - 1]) / seg;
      const a = dense[j - 1];
      const b = dense[j];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    return { length, at };
  }

  // ---------- Curved warp ----------

  function warpCurved(srcCanvas, top, bottom, maxDimension) {
    const T = arcLengthCurve(top);
    const B = arcLengthCurve(bottom);

    let avgH = 0;
    const probes = 16;
    for (let i = 0; i <= probes; i++) {
      const a = T.at(i / probes);
      const b = B.at(i / probes);
      avgH += Math.hypot(a.x - b.x, a.y - b.y);
    }
    avgH /= probes + 1;

    let dstW = Math.max(1, Math.round(Math.max(T.length, B.length)));
    let dstH = Math.max(1, Math.round(avgH));
    if (maxDimension) {
      const longest = Math.max(dstW, dstH);
      if (longest > maxDimension) {
        const s = maxDimension / longest;
        dstW = Math.max(1, Math.round(dstW * s));
        dstH = Math.max(1, Math.round(dstH * s));
      }
    }

    const tx = new Float64Array(dstW);
    const ty = new Float64Array(dstW);
    const bx = new Float64Array(dstW);
    const by = new Float64Array(dstW);
    for (let u = 0; u < dstW; u++) {
      const t = (u + 0.5) / dstW;
      const a = T.at(t);
      const b = B.at(t);
      tx[u] = a.x; ty[u] = a.y; bx[u] = b.x; by[u] = b.y;
    }

    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const src = srcCanvas.getContext("2d").getImageData(0, 0, sw, sh).data;
    const out = document.createElement("canvas");
    out.width = dstW;
    out.height = dstH;
    const octx = out.getContext("2d");
    const img = octx.createImageData(dstW, dstH);
    const d = img.data;

    let p = 0;
    for (let v = 0; v < dstH; v++) {
      const f = (v + 0.5) / dstH;
      for (let u = 0; u < dstW; u++) {
        const sx = tx[u] + (bx[u] - tx[u]) * f;
        const sy = ty[u] + (by[u] - ty[u]) * f;
        if (sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) {
          d[p++] = 255; d[p++] = 255; d[p++] = 255; d[p++] = 255;
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
          const tp = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
          const bt = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
          d[p++] = tp * (1 - fy) + bt * fy;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // ---------- Automatic curve estimation ----------

  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const pv = M[c][c];
      if (Math.abs(pv) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / pv;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  /** Least-squares polynomial fit y ≈ Σ c_k x^k, k = 0..deg. */
  function polyFit(xs, ys, deg) {
    const n = deg + 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let i = 0; i < xs.length; i++) {
      const pw = [1];
      for (let k = 1; k < 2 * n; k++) pw.push(pw[k - 1] * xs[i]);
      for (let r = 0; r < n; r++) {
        b[r] += pw[r] * ys[i];
        for (let c = 0; c < n; c++) A[r][c] += pw[r + c];
      }
    }
    return solveLinear(A, b);
  }

  function polyEval(c, x) {
    let y = 0;
    for (let k = c.length - 1; k >= 0; k--) y = y * x + c[k];
    return y;
  }

  /**
   * Finds text-line centerlines in a rectified page canvas.
   * Returns [{yn, xs: [xn...], ys: [px...]}] with xn in [0,1].
   */
  function findTextLines(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];

    // Adaptive threshold (local mean via integral image).
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
      }
    }
    const r = Math.max(6, Math.round(Math.min(w, h) / 60));
    const ink = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w, x + r + 1);
        const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        ink[y * w + x] = g[y * w + x] < mean - 12 ? 1 : 0;
      }
    }

    // Horizontal smear: join characters/words of a line into one blob.
    const gap = Math.max(4, Math.round(w * 0.025));
    for (let y = 0; y < h; y++) {
      let last = -1;
      const o = y * w;
      for (let x = 0; x < w; x++) {
        if (!ink[o + x]) continue;
        if (last >= 0 && x - last > 1 && x - last <= gap) for (let k = last + 1; k < x; k++) ink[o + k] = 1;
        last = x;
      }
    }

    // Connected components (4-neighbour, union-find over row runs).
    const labels = new Int32Array(w * h).fill(-1);
    const parent = [];
    const find = (a) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!ink[i]) continue;
        const left = x > 0 ? labels[i - 1] : -1;
        const up = y > 0 ? labels[i - w] : -1;
        if (left < 0 && up < 0) {
          labels[i] = parent.length;
          parent.push(parent.length);
        } else if (left >= 0 && up >= 0) {
          const a = find(left);
          const b = find(up);
          labels[i] = a;
          if (a !== b) parent[b] = a;
        } else {
          labels[i] = left >= 0 ? left : up;
        }
      }
    }

    const bins = 40;
    const comps = new Map();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l0 = labels[y * w + x];
        if (l0 < 0) continue;
        const l = find(l0);
        let c = comps.get(l);
        if (!c) {
          c = { minX: x, maxX: x, minY: y, maxY: y, n: 0, sy: new Float64Array(bins), cnt: new Uint32Array(bins) };
          comps.set(l, c);
        }
        if (x < c.minX) c.minX = x;
        if (x > c.maxX) c.maxX = x;
        if (y < c.minY) c.minY = y;
        if (y > c.maxY) c.maxY = y;
        c.n++;
        const b = Math.min(bins - 1, Math.floor((x / w) * bins));
        c.sy[b] += y;
        c.cnt[b]++;
      }
    }

    const lines = [];
    comps.forEach((c) => {
      const cw = c.maxX - c.minX + 1;
      const ch = c.maxY - c.minY + 1;
      if (cw < w * 0.35) return; // too short to say anything about the curvature
      if (ch > h * 0.12) return; // merged block / picture, not a line
      const xs = [];
      const ys = [];
      for (let b = 0; b < bins; b++) {
        if (c.cnt[b] < 3) continue;
        xs.push((b + 0.5) / bins);
        ys.push(c.sy[b] / c.cnt[b]);
      }
      if (xs.length < 6) return;
      lines.push({ yn: (c.minY + c.maxY) / 2 / h, xs, ys, span: [c.minX / w, c.maxX / w] });
    });
    lines.sort((a, b) => a.yn - b.yn);
    return lines;
  }

  /**
   * Estimates top/bottom curves for warpCurved from the text lines inside `quad` ([tl,tr,br,bl], source px).
   * Returns {top, bottom, lines} (points in source px, `points` per curve) or null if no usable text lines.
   */
  function estimateCurves(srcCanvas, quad, points) {
    points = points || 7;
    const rect = global.Perspective.warpPerspective(srcCanvas, quad, 1100);
    const w = rect.width;
    const h = rect.height;
    const lines = findTextLines(rect);
    if (lines.length === 0) return null;

    // Bend of each line = its cubic fit minus the chord between its fitted ends at x=0 and x=1.
    const samples = 24;
    const bends = [];
    lines.forEach((ln) => {
      const c = polyFit(ln.xs, ln.ys, ln.xs.length >= 10 ? 3 : 2);
      if (!c) return;
      const y0 = polyEval(c, 0);
      const y1 = polyEval(c, 1);
      const b = [];
      for (let i = 0; i <= samples; i++) {
        const x = i / samples;
        // Outside the line's own span the polynomial is an extrapolation: damp it towards the chord.
        let bend = polyEval(c, x) - (y0 + (y1 - y0) * x);
        const out = x < ln.span[0] ? ln.span[0] - x : x > ln.span[1] ? x - ln.span[1] : 0;
        bend *= Math.max(0, 1 - out * 2);
        b.push(bend);
      }
      bends.push({ yn: ln.yn, b });
    });
    if (bends.length === 0) return null;

    // Per x sample, bend varies linearly with the line's height on the page: regress and evaluate at
    // the top (yn=0) and bottom (yn=1) edges.
    const topBend = [];
    const botBend = [];
    for (let i = 0; i <= samples; i++) {
      if (bends.length === 1) {
        topBend.push(bends[0].b[i]);
        botBend.push(bends[0].b[i]);
        continue;
      }
      let sy = 0, sb = 0, syy = 0, syb = 0;
      bends.forEach((bd) => {
        sy += bd.yn; sb += bd.b[i]; syy += bd.yn * bd.yn; syb += bd.yn * bd.b[i];
      });
      const n = bends.length;
      const den = n * syy - sy * sy;
      const slope = Math.abs(den) < 1e-9 ? 0 : (n * syb - sy * sb) / den;
      const icpt = (sb - slope * sy) / n;
      topBend.push(icpt);
      botBend.push(icpt + slope);
    }

    // Rectified-space curves → source space via the inverse of the rectifying homography.
    const H = global.Perspective.solveHomography(
      [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
      quad
    );
    const limit = h * 0.25;
    const pick = (bendArr, y, i) => {
      const t = i / (points - 1);
      const k = t * samples;
      const k0 = Math.floor(k);
      const k1 = Math.min(samples, k0 + 1);
      let bend = bendArr[k0] + (bendArr[k1] - bendArr[k0]) * (k - k0);
      if (i === 0 || i === points - 1) bend = 0; // corners stay where the user put them
      bend = Math.max(-limit, Math.min(limit, bend));
      return global.Perspective.applyHomography(H, t * w, y + bend);
    };
    const top = [];
    const bottom = [];
    for (let i = 0; i < points; i++) {
      top.push(pick(topBend, 0, i));
      bottom.push(pick(botBend, h, i));
    }
    return { top, bottom, lineCount: bends.length };
  }

  global.Dewarp = { warpCurved, estimateCurves, densify, arcLengthCurve };
})(window);
