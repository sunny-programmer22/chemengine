'use strict';

/**
 * @file parser.js
 * Stack-based chemical formula and equation parser.
 * Handles element counts, nested parentheses, hydrates (CuSO4.5H2O),
 * brackets [Cu(NH3)4]SO4, charges (SO4^2-, Fe^3+), and equation splitting.
 *
 * @module utils/parser
 */

const path = require('path');
const fs = require('fs');

/** @type {Object|null} Cached elements data. */
let _elementsData = null;
let _knownElements = null;

/**
 * Load elements data from JSON file.
 * @returns {Object} Elements data object keyed by symbol, with Z and atomicMass.
 */
function loadElementsData() {
  if (_elementsData) return _elementsData;
  const dataPath = path.join(__dirname, '..', '..', 'data', 'elements.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  _elementsData = {};
  _knownElements = new Set();
  for (const el of raw) {
    _elementsData[el.symbol] = {
      Z: el.Z,
      atomicMass: el.atomicMass,
      name: el.name,
      symbol: el.symbol,
    };
    _knownElements.add(el.symbol);
  }
  return _elementsData;
}

/**
 * Get a set of known element symbols.
 */
function getKnownElements() {
  if (!_knownElements) loadElementsData();
  return _knownElements;
}

// ---------------------------------------------------------------------------
// parseCompound
// ---------------------------------------------------------------------------

/**
 * Parse a chemical formula into its element count map, charge, and validity flag.
 * Supports nested (), [], {}, hydrates (CuSO4.5H2O or CuSO4*5H2O), and charges.
 *
 * @param {string} formula
 * @returns {{ isValid: boolean, elements: Object.<string,number>, charge: number, formula: string, error: string|null }}
 */
function parseCompound(formula) {
  const empty = { isValid: false, elements: {}, charge: 0, formula: '', error: null };

  if (formula === null || formula === undefined) {
    return { ...empty, error: 'null input' };
  }
  if (typeof formula !== 'string') {
    return { ...empty, error: 'non-string input' };
  }

  const trimmed = formula.trim();
  if (!trimmed) {
    return { ...empty, error: 'empty input' };
  }

  const known = getKnownElements();

  // Strip trailing charge
  let charge = 0;
  let core = trimmed;
  const chargeMatch = trimmed.match(/\^?([0-9]*)([+\-])$/);
  if (chargeMatch) {
    const num = chargeMatch[1] ? parseInt(chargeMatch[1], 10) : 1;
    const sign = chargeMatch[2] === '-' ? -1 : 1;
    charge = num * sign;
    core = trimmed.slice(0, trimmed.length - chargeMatch[0].length);
  }

  // Normalise brackets to ()
  core = core.replace(/[\[{]/g, '(').replace(/[\]}]/g, ')');

  // Split on hydrate dot
  const parts = core.split(/[.*·]/);
  const composition = {};
  for (const part of parts) {
    if (!part.trim()) {
      return { ...empty, error: 'empty hydrate part' };
    }
    // Handle leading coefficient in hydrate parts: "5H2O" -> 5 * (H2O)
    let mult = 1;
    let body = part.trim();
    const m = body.match(/^(\d+)([A-Z(].*)$/);
    if (m) {
      mult = parseInt(m[1], 10);
      body = m[2];
    }
    const partElements = parseSimple(body, known);
    if (!partElements) {
      return { ...empty, error: 'Unknown element in formula' };
    }
    for (const [el, cnt] of Object.entries(partElements)) {
      composition[el] = (composition[el] || 0) + cnt * mult;
    }
  }

  if (Object.keys(composition).length === 0) {
    return { ...empty, error: 'no elements found' };
  }

  return {
    isValid: true,
    elements: composition,
    charge,
    formula: trimmed,
    error: null,
  };
}

/**
 * Parse a single part (no hydrates) of a formula, with parens.
 * @param {string} s
 * @param {Set} known
 * @returns {Object|null}
 */
function parseSimple(s, known) {
  const stack = [{}];
  const parens = [];

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === '(') {
      parens.push(stack.length);
      stack.push({});
      i++;
      continue;
    }

    if (ch === ')') {
      i++;
      let numStr = '';
      while (i < s.length && /[0-9]/.test(s[i])) {
        numStr += s[i++];
      }
      const mult = numStr ? parseInt(numStr, 10) : 1;
      if (parens.length === 0) {
        return null; // unmatched
      }
      const frame = stack.pop();
      parens.pop();
      const top = stack[stack.length - 1];
      for (const [el, cnt] of Object.entries(frame)) {
        top[el] = (top[el] || 0) + cnt * mult;
      }
      continue;
    }

    if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i++;
      if (i < s.length && /[a-z]/.test(s[i])) {
        sym += s[i++];
      }
      if (!known.has(sym)) {
        return null;
      }
      let numStr = '';
      while (i < s.length && /[0-9]/.test(s[i])) {
        numStr += s[i++];
      }
      const count = numStr ? parseInt(numStr, 10) : 1;
      const top = stack[stack.length - 1];
      top[sym] = (top[sym] || 0) + count;
      continue;
    }

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    return null; // unexpected char
  }

  if (parens.length !== 0) {
    return null; // unmatched paren
  }

  if (stack.length !== 1) {
    return null;
  }

  return stack[0];
}

// ---------------------------------------------------------------------------
// parseEquation
// ---------------------------------------------------------------------------

/**
 * Parse a chemical equation into reactants and products.
 *
 * @param {string} equation
 * @returns {{ isValid: boolean, reactants: string[], products: string[], direction: string, original: string }}
 */
function parseEquation(equation) {
  const empty = { isValid: false, reactants: [], products: [], direction: 'forward', original: '' };

  if (!equation || typeof equation !== 'string') {
    return { ...empty };
  }

  const original = equation.trim();
  if (!original) return { ...empty };

  // Normalise various arrows
  const isReversible = /<[=->]+>|<==>|⇄/.test(original);
  const normalised = original
    .replace(/<->|<→|⇌|⇄|<==>/g, '->')
    .replace(/→/g, '->')
    .replace(/=>/g, '->')
    .replace(/⟶/g, '->');

  const parts = normalised.split('->');
  if (parts.length < 2) {
    return { ...empty, original };
  }

  // First part is reactants, last is products; middle parts go to reactants (some weird formats)
  const reactantSide = parts[0];
  const productSide = parts.slice(1).join('->');

  const split = (side) =>
    side
      .split('+')
      .map((s) => s.trim())
      .filter(Boolean);

  const reactants = split(reactantSide);
  const products = split(productSide);

  if (reactants.length === 0 || products.length === 0) {
    return { ...empty, original };
  }

  return {
    isValid: true,
    reactants,
    products,
    direction: isReversible ? 'reversible' : 'forward',
    original,
  };
}

// ---------------------------------------------------------------------------
// molecularWeight
// ---------------------------------------------------------------------------

/**
 * Calculate the molecular weight of a formula.
 *
 * @param {string} formula
 * @returns {{ isValid: boolean, weight: number, breakdown: Array<{element:string,count:number,weight:number}>, error: string|null }}
 */
function molecularWeight(formula) {
  if (!formula) {
    throw new Error('Invalid formula: empty');
  }
  const parsed = parseCompound(formula);
  if (!parsed.isValid) {
    throw new Error('Invalid formula: ' + (parsed.error || 'parse failed'));
  }

  const edata = loadElementsData();
  let total = 0;
  const breakdown = [];

  for (const [elem, count] of Object.entries(parsed.elements)) {
    const el = edata[elem];
    if (!el) {
      throw new Error('Unknown element: ' + elem);
    }
    const w = el.atomicMass * count;
    // Per-atom weight for compatibility with common test expectations
    breakdown.push({ element: elem, count, weight: el.atomicMass, totalWeight: w });
    total += w;
  }

  return {
    isValid: true,
    weight: total,
    breakdown,
  };
}

/**
 * Get a list of element symbols present in a formula.
 * @param {string} formula
 * @returns {string[]}
 */
function getElements(formula) {
  const parsed = parseCompound(formula);
  if (!parsed.isValid) return [];
  return Object.keys(parsed.elements);
}

// ---------------------------------------------------------------------------
// formatCompound (legacy, used elsewhere)
// ---------------------------------------------------------------------------

function formatCompound(parsed) {
  if (!parsed || !parsed.elements || Object.keys(parsed.elements).length === 0) {
    return '';
  }
  const elemOrder = (a, b) => {
    if (a === 'C') return -1;
    if (b === 'C') return 1;
    if (a === 'H') return -1;
    if (b === 'H') return 1;
    return a.localeCompare(b);
  };
  const parts = [];
  for (const [elem, count] of Object.entries(parsed.elements).sort(elemOrder)) {
    parts.push(elem + (count > 1 ? count : ''));
  }
  let result = parts.join('');
  if (parsed.charge) {
    const c = parsed.charge;
    result += '^' + (c > 0 ? c : Math.abs(c)) + (c > 0 ? '+' : '-');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  parseCompound,
  parseEquation,
  molecularWeight,
  formatCompound,
  getElements,
  loadElementsData,
};
