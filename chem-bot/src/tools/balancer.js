'use strict';

/**
 * @file balancer.js
 * Balance a chemical equation using a bounded trial-coefficient search
 * (with GCD reduction). The balanced equation is presented as a formatted
 * string, suitable for sending to Telegram.
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
// Core balancer
// ---------------------------------------------------------------------------

/**
 * Try every integer coefficient in [1..maxCoeff] until a balanced solution
 * is found. This is much faster than the matrix-nullspace approach for
 * the small systems (typically <= 6 species) we encounter.
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
  const elemSet = new Set();
  for (const p of parsedElements) {
    for (const sym of Object.keys(p)) elemSet.add(sym);
  }
  const elemArr = Array.from(elemSet);
  if (elemArr.length === 0) return null;

  // If the system is "easy" (small number of species) we can be more aggressive
  // with the search bound, but 20 is enough for typical high-school equations.
  function search(idx, coeffs) {
    if (idx === allSpecies.length) {
      // Check element balance
      for (const e of elemArr) {
        let total = 0;
        for (let i = 0; i < allSpecies.length; i++) {
          const sign = i < reactants.length ? -1 : 1;
          total += sign * coeffs[i] * (parsedElements[i][e] || 0);
        }
        if (total !== 0) return null;
      }
      return coeffs.slice();
    }
    for (let c = 1; c <= maxCoeff; c++) {
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
  // Defensive defaults
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

  // Sanity check: every species must parse
  const allParsed = [...reactants, ...products].map((s) => parseCompound(s));
  if (allParsed.some((p) => !p.isValid)) {
    return `Could not parse equation. One or more species failed to parse.`;
  }

  const coeffs = _balanceSearch(reactants, products);
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
};
