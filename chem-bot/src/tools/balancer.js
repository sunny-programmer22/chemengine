'use strict';

/**
 * @file balancer.js
 * Balance a chemical equation using a matrix (linear-algebra) approach with
 * fallback bounded search. Handles up to 5-6 species (3-4 reactants/products)
 * e.g. KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2, Ca(OH)2 + CO2 -> CaCO3 + H2O,
 * CH4 + O2 -> CO2 + H2O, also 4-reactant cases.
 *
 * @module tools/balancer
 */

const { parseCompound, parseEquation: _parserParseEquation } = require('../utils/parser');

// ---------------------------------------------------------------------------
// GCD helpers
// ---------------------------------------------------------------------------

/**
 * Compute greatest common divisor of two integers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function _gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/**
 * Compute GCD of a list of integers.
 * @param {number[]} xs
 * @returns {number}
 */
function _gcdList(xs) {
  let g = 0;
  for (const x of xs) {
    g = _gcd(g, x);
    if (g === 1) return 1;
  }
  return g || 1;
}

// ---------------------------------------------------------------------------
// Equation / formula parsing
// ---------------------------------------------------------------------------

/**
 * Parse a chemical equation into reactants and products.
 * Throws an Error when the input is missing an arrow.
 *
 * @param {string} equation
 * @returns {{ isValid: boolean, reactants: string[], products: string[], direction: string, original: string }}
 */
function parseEquation(equation) {
  if (typeof equation !== 'string' || !equation.trim()) {
    throw new Error('Invalid equation: empty input');
  }
  const parsed = _parserParseEquation(equation);
  if (!parsed || !parsed.isValid || parsed.reactants.length === 0 || parsed.products.length === 0) {
    throw new Error('Invalid equation: missing arrow (-> or =) between reactants and products');
  }
  return parsed;
}

/**
 * Parse a chemical formula into a flat element-count object.
 * Throws an Error when the input is not a valid formula.
 *
 * @param {string} formula
 * @returns {Object<string, number>}
 */
function parseFormula(formula) {
  if (typeof formula !== 'string' || !formula.trim()) {
    throw new Error('Invalid formula: empty input');
  }
  const parsed = parseCompound(formula);
  if (!parsed || !parsed.isValid) {
    throw new Error('Invalid formula: ' + (parsed && parsed.error ? parsed.error : 'parse failed'));
  }
  return parsed.elements;
}

// ---------------------------------------------------------------------------
// Linear algebra helpers (matrix balancing)
// ---------------------------------------------------------------------------

function _gaussianSolve(A, v) {
  const n = A.length;
  if (n === 0) return [];
  const M = A.map((row) => row.slice());
  const b = v.slice();
  for (let i = 0; i < n; i++) {
    // Partial pivot
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let r = i + 1; r < n; r++) {
      const val = Math.abs(M[r][i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }
    if (maxVal < 1e-12) throw new Error('singular matrix');
    if (maxRow !== i) {
      const tmpR = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmpR;
      const tmpB = b[i];
      b[i] = b[maxRow];
      b[maxRow] = tmpB;
    }
    for (let r = i + 1; r < n; r++) {
      const factor = M[r][i] / M[i][i];
      if (factor === 0) continue;
      for (let c = i; c < n; c++) M[r][c] -= factor * M[i][c];
      b[r] -= factor * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let c = i + 1; c < n; c++) sum -= M[i][c] * x[c];
    x[i] = sum / M[i][i];
  }
  return x;
}

function _solveLinear(A, v) {
  // Try mathjs lusolve first (if installed)
  try {
    // eslint-disable-next-line global-require
    const math = require('mathjs');
    if (math && math.lusolve) {
      const matA = math.matrix(A);
      const matV = math.matrix(v.map((x) => [x]));
      const sol = math.lusolve(matA, matV);
      // Convert to plain array
      if (sol && typeof sol.get === 'function') {
        const out = [];
        for (let i = 0; i < A.length; i++) out.push(sol.get([i, 0]));
        return out;
      }
      if (Array.isArray(sol)) return sol.flat();
      // fallback to array
      if (sol && sol._data) {
        return sol._data.map((row) => (Array.isArray(row) ? row[0] : row));
      }
    }
  } catch (_) {
    // fall through to gaussian
  }
  return _gaussianSolve(A, v);
}

function _verifyBalance(coeffs, parsedEls, numReactants, elements) {
  for (const el of elements) {
    let total = 0;
    for (let j = 0; j < parsedEls.length; j++) {
      const cnt = el === '_charge' ? (parsedEls[j]._charge || 0) : (parsedEls[j][el] || 0);
      // parsedEls currently is array of element maps; charge handled separately
      // But we stored charge in parsed objects, not in els map. So we need to handle charge via separate array.
      // This helper is used with parsedEls as element maps; for _charge we need external charge array.
      // We'll instead provide separate charge check.
    }
  }
  return true;
}

// More robust verify that checks element maps + charges
function _verifyBalanceFull(coeffs, parsedObjs, numReactants, elements) {
  for (const el of elements) {
    let total = 0;
    for (let j = 0; j < parsedObjs.length; j++) {
      const p = parsedObjs[j];
      const cnt = el === '_charge' ? (p.charge || 0) : (p.elements[el] || 0);
      const sign = j < numReactants ? 1 : -1;
      total += sign * coeffs[j] * cnt;
    }
    if (Math.abs(total) > 1e-6) return false;
  }
  return true;
}

function _finalizeCoeffsRaw(coeffs) {
  if (!coeffs || coeffs.length === 0) return null;
  // Negate if any negative
  if (coeffs.some((c) => c < -1e-10)) {
    coeffs = coeffs.map((c) => -c);
  }
  // Replace near-zero with small positive?
  if (coeffs.some((c) => Math.abs(c) < 1e-10)) {
    coeffs = coeffs.map((c) => (Math.abs(c) < 1e-10 ? 1 : c));
  }
  if (coeffs.some((c) => !isFinite(c))) return null;

  const scaleToInt = (arr) => {
    for (let denom = 1; denom <= 10000; denom++) {
      const scaled = arr.map((c) => c * denom);
      if (scaled.every((s) => Math.abs(s - Math.round(s)) < 1e-6)) {
        return scaled.map((s) => Math.round(s));
      }
    }
    // fallback: round *1000
    return arr.map((c) => Math.round(c * 1000));
  };

  let intCoeffs = scaleToInt(coeffs);
  // GCD reduce
  let g = intCoeffs.reduce((acc, c) => _gcd(acc, c), 0);
  if (g > 1) intCoeffs = intCoeffs.map((c) => c / g);
  intCoeffs = intCoeffs.map((c) => Math.round(c));
  // Ensure all positive
  if (intCoeffs.some((c) => c <= 0)) {
    // try to make positive by abs
    intCoeffs = intCoeffs.map((c) => Math.abs(c) || 1);
    g = intCoeffs.reduce((acc, c) => _gcd(acc, c), 0);
    if (g > 1) intCoeffs = intCoeffs.map((c) => c / g);
  }
  return intCoeffs;
}

/**
 * Matrix-based balancer — handles up to 5-6 compounds efficiently.
 * @param {string[]} reactants
 * @param {string[]} products
 * @returns {number[]|null}
 */
function _balanceMatrix(reactants, products) {
  const allSpecies = [...reactants, ...products];
  const n = allSpecies.length;
  const parsedObjs = allSpecies.map((s) => parseCompound(s));
  if (parsedObjs.some((p) => !p || !p.isValid)) return null;

  const parsedEls = parsedObjs.map((p) => p.elements);

  const elemSet = new Set();
  for (const elMap of parsedEls) {
    for (const sym of Object.keys(elMap)) elemSet.add(sym);
  }
  // Charge as pseudo-element if present
  const hasCharge = parsedObjs.some((p) => p.charge !== 0);
  if (hasCharge) elemSet.add('_charge');

  const elements = Array.from(elemSet).sort();
  const m = elements.length;
  if (m === 0 || n === 0) return null;

  const M = [];
  for (let i = 0; i < m; i++) {
    const el = elements[i];
    const row = [];
    for (let j = 0; j < n; j++) {
      const cnt = el === '_charge' ? (parsedObjs[j].charge || 0) : (parsedEls[j][el] || 0);
      row.push(j < reactants.length ? cnt : -cnt);
    }
    M.push(row);
  }

  // Determine number of fixed coefficients
  let numFix = 1;
  if (n - numFix > m) numFix = n - m;
  const fixIdx = n - numFix;

  if (fixIdx === 0) {
    const coeffs = new Array(n).fill(1);
    if (_verifyBalanceFull(coeffs, parsedObjs, reactants.length, elements)) return coeffs;
    return null;
  }

  // Helper to try solving with given working rows
  const trySolveWithRows = (rowIndices) => {
    const workingM = rowIndices.map((idx) => M[idx]);
    const A = workingM.map((row) => row.slice(0, fixIdx));
    const v = workingM.map((row) => {
      let sum = 0;
      for (let j = fixIdx; j < n; j++) sum += row[j];
      return -sum;
    });
    let xSub;
    try {
      xSub = _solveLinear(A, v);
    } catch (_) {
      return null;
    }
    let coeffs = [];
    // xSub is plain array
    if (Array.isArray(xSub) && xSub.length === fixIdx) {
      coeffs = xSub.slice();
    } else if (xSub && typeof xSub.get === 'function') {
      coeffs = [];
      for (let i = 0; i < fixIdx; i++) coeffs.push(xSub.get([i, 0]));
    } else {
      return null;
    }
    for (let i = fixIdx; i < n; i++) coeffs.push(1);
    const finalized = _finalizeCoeffsRaw(coeffs);
    if (!finalized) return null;
    if (!_verifyBalanceFull(finalized, parsedObjs, reactants.length, elements)) return null;
    return finalized;
  };

  // If m > fixIdx, we have overdetermined: try first fixIdx rows, then iterate combos if singular
  if (m > fixIdx) {
    // First try the naive first rows
    const firstRows = Array.from({ length: fixIdx }, (_, i) => i);
    const attempt = trySolveWithRows(firstRows);
    if (attempt) return attempt;

    // Try all combinations of choosing fixIdx rows out of m (combinatorial, capped)
    // For performance, we limit to try at most 50 combos via heuristic sampling if too large
    const combos = [];
    // Generate combinations via recursion but cap search
    const maxCombos = 50;
    let found = null;
    function gen(start, chosen) {
      if (found) return true;
      if (chosen.length === fixIdx) {
        const res = trySolveWithRows(chosen);
        if (res) {
          found = res;
          return true;
        }
        combos.push(chosen.slice());
        if (combos.length >= maxCombos) return true;
        return false;
      }
      for (let i = start; i < m; i++) {
        chosen.push(i);
        if (gen(i + 1, chosen)) return true;
        chosen.pop();
        if (combos.length >= maxCombos) return true;
      }
      return false;
    }
    gen(0, []);
    if (found) return found;
    return null;
  }

  // m <= fixIdx case: we have square or tall? But fixIdx = min(n-1,m) so m >= fixIdx? Actually if m <= fixIdx, then m == fixIdx or m < fixIdx?
  // For m <= fixIdx, workingM = M (all rows). A = m x fixIdx maybe rectangular if m < fixIdx.
  // But our earlier logic ensures fixIdx <= m when m <= n-1? Wait fixIdx = min(n-1,m) => so m >= fixIdx, so this branch is m==fixIdx.
  // So A is square.
  const allRows = Array.from({ length: m }, (_, i) => i);
  return trySolveWithRows(allRows);
}

// ---------------------------------------------------------------------------
// Fallback brute-force search (kept for singular / small systems)
// ---------------------------------------------------------------------------

/**
 * Try every integer coefficient in [1..maxCoeff] until a balanced solution
 * is found. Pruned search for small systems.
 *
 * @param {string[]} reactants
 * @param {string[]} products
 * @param {number} [maxCoeff=20]
 * @returns {number[]|null} Coefficients for [reactants..., products...], or null.
 */
function _balanceSearch(reactants, products, maxCoeff = 20) {
  const allSpecies = [...reactants, ...products];
  const parsedSpecies = allSpecies.map((s) => parseCompound(s));
  const allValid = parsedSpecies.every((p) => p && p.isValid);
  if (!allValid) return null;

  const parsedElements = parsedSpecies.map((p) => p.elements);
  const parsedCharges = parsedSpecies.map((p) => p.charge || 0);
  const hasCharge = parsedCharges.some((c) => c !== 0);

  const elemSet = new Set();
  for (const p of parsedElements) {
    for (const sym of Object.keys(p)) elemSet.add(sym);
  }
  if (hasCharge) elemSet.add('_charge');
  const elemArr = Array.from(elemSet);
  if (elemArr.length === 0) return null;

  // For large n, brute force explodes. Bound search adaptively:
  // If n >5, reduce maxCoeff to keep time reasonable, since matrix would have handled typical case.
  let effectiveMax = maxCoeff;
  if (allSpecies.length >= 6) effectiveMax = Math.min(maxCoeff, 16);
  if (allSpecies.length >= 7) effectiveMax = Math.min(maxCoeff, 12);

  // Depth-first search with optional early pruning on element balance intermediate?
  // We keep simple but add quick GCD pruning if possible.
  function search(idx, coeffs) {
    if (idx === allSpecies.length) {
      for (const e of elemArr) {
        let total = 0;
        for (let i = 0; i < allSpecies.length; i++) {
          const sign = i < reactants.length ? -1 : 1;
          let cnt;
          if (e === '_charge') cnt = parsedCharges[i];
          else cnt = parsedElements[i][e] || 0;
          total += sign * coeffs[i] * cnt;
        }
        if (total !== 0) return null;
      }
      return coeffs.slice();
    }
    for (let c = 1; c <= effectiveMax; c++) {
      coeffs[idx] = c;
      const result = search(idx + 1, coeffs);
      if (result) return result;
    }
    return null;
  }

  return search(0, new Array(allSpecies.length).fill(1));
}

// ---------------------------------------------------------------------------
// Public balance() — returns a formatted string for Telegram
// ---------------------------------------------------------------------------

/**
 * Balance a chemical equation and return a Markdown-formatted string.
 *
 * @param {string} equation - e.g. "H2 + O2 -> H2O"
 * @returns {Promise<string>} Formatted result.
 */
async function balance(equation) {
  if (equation === null || equation === undefined) equation = '';
  if (typeof equation !== 'string') equation = String(equation);
  const original = equation.trim();

  if (!original) {
    return 'No equation provided. Use arrows like "->" or "=" and separate species with "+".';
  }

  let parsed;
  try {
    parsed = parseEquation(original);
  } catch (err) {
    return `Could not parse equation: ${err.message || err}. Use arrows like "->" or "=" and separate species with "+".`;
  }

  const { reactants, products } = parsed;

  const allParsed = [...reactants, ...products].map((s) => parseCompound(s));
  if (allParsed.some((p) => !p.isValid)) {
    return `Could not parse equation. One or more species failed to parse.`;
  }

  // Try matrix solver first (fast for 3-4 reactants/products, up to 5-6 compounds)
  let coeffs = _balanceMatrix(reactants, products);
  // Fallback to bounded search if matrix fails or yields unverifiable result
  if (!coeffs) {
    coeffs = _balanceSearch(reactants, products);
  } else {
    // Matrix succeeded but ensure GCD minimal; _finalize already does, but double-check
    const g = _gcdList(coeffs);
    if (g > 1) coeffs = coeffs.map((c) => c / g);
  }

  // If matrix gave a result but search might find smaller alternative, we keep matrix result since it's integer minimal.

  if (!coeffs) {
    return `Could not find integer coefficients (searched up to 20) for: ${original}`;
  }

  // Build the balanced equation string
  const buildSide = (list, startIdx) =>
    list
      .map((sp, i) => {
        const c = coeffs[startIdx + i];
        return (c === 1 ? '' : c + ' ') + sp;
      })
      .join(' + ');

  const reactantStrs = buildSide(reactants, 0);
  const productStrs = buildSide(products, reactants.length);
  const balanced = `${reactantStrs} -> ${productStrs}`;

  return (
    `*Balanced equation:*\n` +
    `  ${balanced}\n\n` +
    `*Coefficients:*\n` +
    `  Reactants: ${reactants.map((r, i) => `${r} (${coeffs[i]})`).join(', ')}\n` +
    `  Products:  ${products.map((p, i) => `${p} (${coeffs[reactants.length + i]})`).join(', ')}`
  );
}

module.exports = {
  balance,
  parseEquation,
  parseFormula,
  _balanceMatrix,
  _balanceSearch,
};

