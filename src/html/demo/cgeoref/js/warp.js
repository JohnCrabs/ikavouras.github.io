/* CGeoRef – Ανασύνθεση εικόνας (warping) με προσεγγιστικό πλέγμα και επαναδειγματοληψία */
(function (GR) {
  'use strict';

  const tick = () => new Promise(r => setTimeout(r, 0));

  function sampler(src, W, H, method) {
    const D = src;
    const px = (x, y, k) => D[(y * W + x) * 4 + k];
    if (method === 'nearest') {
      return (sx, sy, out, o) => {
        const x = Math.floor(sx), y = Math.floor(sy);
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = (y * W + x) * 4;
        out[o] = D[i]; out[o + 1] = D[i + 1]; out[o + 2] = D[i + 2]; out[o + 3] = D[i + 3];
        return true;
      };
    }
    if (method === 'bilinear') {
      return (sx, sy, out, o) => {
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) return false;
        let fx = sx - 0.5, fy = sy - 0.5;
        let x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        let x1 = x0 + 1, y1 = y0 + 1;
        if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= W) x1 = W - 1; if (y1 >= H) y1 = H - 1;
        const i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1) * 4, i01 = (y1 * W + x0) * 4, i11 = (y1 * W + x1) * 4;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        for (let k = 0; k < 4; k++) out[o + k] = D[i00 + k] * w00 + D[i10 + k] * w10 + D[i01 + k] * w01 + D[i11 + k] * w11;
        return true;
      };
    }
    // bicubic (Catmull–Rom)
    const cr = (t) => {
      const t2 = t * t, t3 = t2 * t;
      return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
    };
    return (sx, sy, out, o) => {
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) return false;
      const fx = sx - 0.5, fy = sy - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const wx = cr(fx - x0), wy = cr(fy - y0);
      const acc = [0, 0, 0, 0];
      for (let j = 0; j < 4; j++) {
        let yy = y0 - 1 + j; if (yy < 0) yy = 0; else if (yy >= H) yy = H - 1;
        for (let i = 0; i < 4; i++) {
          let xx = x0 - 1 + i; if (xx < 0) xx = 0; else if (xx >= W) xx = W - 1;
          const w = wx[i] * wy[j], b = (yy * W + xx) * 4;
          acc[0] += D[b] * w; acc[1] += D[b + 1] * w; acc[2] += D[b + 2] * w; acc[3] += D[b + 3] * w;
        }
      }
      for (let k = 0; k < 4; k++) out[o + k] = acc[k];
      return true;
    };
  }

  /**
   * opts: { src: Uint8ClampedArray RGBA, srcW, srcH, outW, outH,
   *         mapFn(ox, oy) -> [sx, sy] (συνεχείς συντεταγμένες κέντρου pixel εξόδου → εικόνας),
   *         method, step, onProgress(f) }
   */
  async function warp(opts) {
    const { src, srcW, srcH, outW, outH, mapFn } = opts;
    const step = opts.step || 8;
    const sample = sampler(src, srcW, srcH, opts.method || 'bilinear');
    const out = new Uint8ClampedArray(outW * outH * 4);
    const gx = Math.ceil(outW / step) + 1;
    const nodeX = (i) => Math.min(i * step, outW - 1);

    const rowNodes = (oy) => {
      const ax = new Float64Array(gx), ay = new Float64Array(gx);
      for (let i = 0; i < gx; i++) {
        let p;
        try { p = mapFn(nodeX(i) + 0.5, oy + 0.5); } catch (e) { p = [NaN, NaN]; }
        ax[i] = p ? p[0] : NaN; ay[i] = p ? p[1] : NaN;
      }
      return [ax, ay];
    };

    const tmp = new Float64Array(4);
    let y0 = 0, r0 = rowNodes(0);
    let lastYield = performance.now();
    while (y0 < outH) {
      const y1 = Math.min(y0 + step, outH - 1);
      const r1 = y1 === y0 ? r0 : rowNodes(y1);
      const yEnd = y1 === outH - 1 ? outH : y1;
      for (let y = y0; y < yEnd; y++) {
        const ty = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        for (let i = 0; i < gx - 1; i++) {
          const xa = nodeX(i), xb = nodeX(i + 1);
          const ax0 = r0[0][i] + (r1[0][i] - r0[0][i]) * ty, ay0 = r0[1][i] + (r1[1][i] - r0[1][i]) * ty;
          const ax1 = r0[0][i + 1] + (r1[0][i + 1] - r0[0][i + 1]) * ty, ay1 = r0[1][i + 1] + (r1[1][i + 1] - r0[1][i + 1]) * ty;
          const xEnd = i === gx - 2 ? outW : xb;
          const span = xb - xa || 1;
          for (let x = xa; x < xEnd; x++) {
            const tx = (x - xa) / span;
            const sx = ax0 + (ax1 - ax0) * tx, sy = ay0 + (ay1 - ay0) * tx;
            if (sx !== sx || sy !== sy) continue;
            const o = (y * outW + x) * 4;
            if (sample(sx, sy, tmp, 0)) { out[o] = tmp[0]; out[o + 1] = tmp[1]; out[o + 2] = tmp[2]; out[o + 3] = tmp[3]; }
          }
        }
      }
      y0 = yEnd; r0 = r1;
      if (performance.now() - lastYield > 40) {
        if (opts.onProgress) opts.onProgress(y0 / outH);
        await tick();
        lastYield = performance.now();
      }
    }
    if (opts.onProgress) opts.onProgress(1);
    return { data: out, width: outW, height: outH };
  }

  /** Σημεία περιγράμματος εικόνας */
  function borderPoints(w, h, n) {
    n = n || 48;
    const p = [];
    for (let i = 0; i <= n; i++) { const t = i / n; p.push([t * w, 0], [t * w, h], [0, t * h], [w, t * h]); }
    return p;
  }
  function bbox(pts) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of pts) { if (!isFinite(p[0]) || !isFinite(p[1])) continue; a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    return { minX: a, minY: b, maxX: c, maxY: d };
  }

  /** Αυτόματος υπολογισμός πλέγματος εξόδου στο CRS-στόχο */
  function autoGrid(model, w, h) {
    const bb = bbox(borderPoints(w, h).map(p => model.forward(p)));
    const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
    const res = Math.hypot(bw, bh) / Math.hypot(w, h);
    return { bbox: bb, res };
  }

  GR.warp = { warp, borderPoints, bbox, autoGrid };
})(window.GR = window.GR || {});
