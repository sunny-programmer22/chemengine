self.addEventListener('message', (e) => {
  const { A, v, id } = e.data;
  try {
    const x = gaussElimination(A, v);
    self.postMessage({ id, x, error: null });
  } catch (err) {
    self.postMessage({ id, x: null, error: err.message });
  }
});

function gaussElimination(A, v) {
  const n = A.length;
  if (n === 0) return [];
  const m = A[0].length;

  const M = A.map(row => [...row]);
  const b = v.map(x => (Array.isArray(x) ? x[0] : x));

  const col = Math.min(n, m);

  for (let k = 0; k < col; k++) {
    let maxRow = k;
    let maxVal = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[i][k]);
      if (val > maxVal) { maxVal = val; maxRow = i; }
    }
    if (maxVal < 1e-15) continue;

    [M[k], M[maxRow]] = [M[k], M[maxRow]];
    [b[k], b[maxRow]] = [b[maxRow], b[k]];

    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / M[k][k];
      for (let j = k; j < m; j++) M[i][j] -= factor * M[k][j];
      b[i] -= factor * b[k];
    }
  }

  const x = new Array(m).fill(0);
  for (let i = col - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-15) continue;
    let sum = b[i];
    for (let j = i + 1; j < m; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }

  return x;
}
