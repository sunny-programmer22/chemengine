'use strict';

/**
 * @file molar.js
 * Compute the molar mass of a chemical formula.
 * Provides both a structured result (calculateMolarMass) and a formatted
 * string output (calculate) for the Telegram bot.
 *
 * @module tools/molar
 */

const path = require('path');
const fs = require('fs');
const { parseCompound, molecularWeight, getElements, loadElementsData } = require('../utils/parser');

/**
 * Load and cache full elements data.
 */
function _loadElements() {
  if (_loadElements._cache) return _loadElements._cache;
  const dataPath = path.join(__dirname, '..', '..', 'data', 'elements.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const obj = {};
  for (const el of raw) {
    obj[el.symbol] = el;
  }
  _loadElements._cache = obj;
  return obj;
}

/**
 * Parse a formula into element counts. Wrapper for clarity.
 * @param {string} formula
 * @returns {Object.<string,number>}
 */
function parseFormula(formula) {
  const parsed = parseCompound(formula);
  if (!parsed.isValid) return {};
  return parsed.elements;
}

/**
 * Compute the molar mass of a formula.
 *
 * @param {string} formula
 * @returns {{ total: number, breakdown: Array<{element:string,count:number,weight:number}>, formula: string }}
 */
function calculateMolarMass(formula) {
  const result = molecularWeight(formula);
  return {
    total: result.weight,
    breakdown: result.breakdown,
    formula,
  };
}

/**
 * Formatted string version of the molar mass.
 *
 * @param {string} formula
 * @returns {Promise<string>}
 */
async function calculate(formula) {
  if (!formula || typeof formula !== 'string') {
    return `No formula provided.`;
  }
  const f = formula.trim();
  let parsed;
  try {
    parsed = parseCompound(f);
  } catch (e) {
    parsed = { isValid: false };
  }

  if (!parsed.isValid) {
    return `Could not parse formula "${f}". Please check the formula.`;
  }

  const elements = _loadElements();
  const unknown = [];
  for (const sym of Object.keys(parsed.elements)) {
    if (!elements[sym]) unknown.push(sym);
  }
  if (unknown.length) {
    return `Unknown element(s): ${unknown.join(', ')} in formula "${f}".`;
  }

  const { total, breakdown } = calculateMolarMass(f);

  let out = `Molar Mass: ${f}\n`;
  out += `Total: ${total.toFixed(3)} g/mol\n\n`;
  out += `Composition:\n`;
  for (const b of breakdown) {
    out += `  ${b.element}: ${b.count} × ${elements[b.element].atomicMass} = ${b.weight.toFixed(3)} g/mol\n`;
  }
  return out;
}

module.exports = {
  calculate,
  calculateMolarMass,
  parseFormula,
  molarMass: calculateMolarMass, // legacy alias
};
