/* CGeoRef – Γραμμική άλγεβρα (Least Squares με Householder QR, επίλυση συστημάτων) */
(function (GR) {
  'use strict';

  /**
   * Επίλυση ελαχίστων τετραγώνων A x = B (πολλαπλά δεξιά μέλη) με Householder QR.
   * A: Array n×u (array of rows), B: Array n×k
   * Επιστρέφει { X: u×k, rank, cond }
   */
  function lstsq(A, B) {
    const n = A.length, u = A[0].length, k = B[0].length;
    if (n < u) throw new Error('Ανεπαρκής αριθμός σημείων για τον μετασχηματισμό');
    // αντίγραφα σε Float64Array (column-major για ευκολία)
    const R = [];
    for (let j = 0; j < u; j++) { const c = new Float64Array(n); for (let i = 0; i < n; i++) c[i] = A[i][j]; R.push(c); }
    const Q = [];
    for (let j = 0; j < k; j++) { const c = new Float64Array(n); for (let i = 0; i < n; i++) c[i] = B[i][j]; Q.push(c); }
    const diag = new Float64Array(u);
    for (let j = 0; j < u; j++) {
      const col = R[j];
      let norm = 0;
      for (let i = j; i < n; i++) norm += col[i] * col[i];
      norm = Math.sqrt(norm);
      if (norm === 0) { diag[j] = 0; continue; }
      const alpha = col[j] > 0 ? -norm : norm;
      // v = x - alpha e1
      const v = new Float64Array(n);
      for (let i = j; i < n; i++) v[i] = col[i];
      v[j] -= alpha;
      let vnorm2 = 0;
      for (let i = j; i < n; i++) vnorm2 += v[i] * v[i];
      if (vnorm2 === 0) { diag[j] = alpha; continue; }
      const apply = (c) => {
        let d = 0;
        for (let i = j; i < n; i++) d += v[i] * c[i];
        const f = 2 * d / vnorm2;
        for (let i = j; i < n; i++) c[i] -= f * v[i];
      };
      for (let jj = j; jj < u; jj++) apply(R[jj]);
      for (let jj = 0; jj < k; jj++) apply(Q[jj]);
      diag[j] = R[j][j];
    }
    let maxD = 0, minD = Infinity;
    for (let j = 0; j < u; j++) { const a = Math.abs(diag[j]); maxD = Math.max(maxD, a); minD = Math.min(minD, a); }
    const tol = maxD * 1e-12;
    let rank = 0;
    for (let j = 0; j < u; j++) if (Math.abs(diag[j]) > tol) rank++;
    if (rank < u) throw new Error('Ιδιόμορφο σύστημα – τα σημεία ελέγχου είναι συνευθειακά ή ταυτίζονται');
    // back substitution
    const X = [];
    for (let j = 0; j < u; j++) X.push(new Array(k).fill(0));
    for (let c = 0; c < k; c++) {
      for (let j = u - 1; j >= 0; j--) {
        let s = Q[c][j];
        for (let jj = j + 1; jj < u; jj++) s -= R[jj][j] * X[jj][c];
        X[j][c] = s / R[j][j];
      }
    }
    return { X, rank, cond: maxD / minD };
  }

  /** Επίλυση τετραγωνικού συστήματος με Gauss + μερική οδήγηση. A: n×n, B: n×k */
  function solve(A, B) {
    const n = A.length, k = B[0].length;
    const M = A.map((r, i) => Float64Array.from(r.concat(B[i])));
    for (let c = 0; c < n; c++) {
      let p = c, mx = Math.abs(M[c][c]);
      for (let r = c + 1; r < n; r++) { const a = Math.abs(M[r][c]); if (a > mx) { mx = a; p = r; } }
      if (mx < 1e-14) throw new Error('Ιδιόμορφο σύστημα');
      if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
      const piv = M[c][c];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / piv;
        if (f === 0) continue;
        const Mr = M[r], Mc = M[c];
        for (let j = c; j < n + k; j++) Mr[j] -= f * Mc[j];
      }
    }
    const X = [];
    for (let i = 0; i < n; i++) X.push(new Array(k).fill(0));
    for (let c = 0; c < k; c++) {
      for (let i = n - 1; i >= 0; i--) {
        let s = M[i][n + c];
        for (let j = i + 1; j < n; j++) s -= M[i][j] * X[j][c];
        X[i][c] = s / M[i][i];
      }
    }
    return X;
  }

  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-300) throw new Error('Μη αντιστρέψιμος πίνακας');
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
            B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
            C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  GR.linalg = { lstsq, solve, inv3 };
})(window.GR = window.GR || {});
