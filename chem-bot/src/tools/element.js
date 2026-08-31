'use strict';

/**
 * @file element.js
 * Look up an element by symbol, name, or atomic number (Z).
 * Maintains both an array (ELEMENTS_LIST) and a symbol-keyed object (ELEMENTS).
 *
 * @module tools/element
 */

const path = require('path');
const fs = require('fs');

let _elementsList = null;
let _ELEMENTS = null;
let _byName = null;
let _bySymbol = null;

// Stable exports — populated on first call to _loadElements().
const ELEMENTS = {};
const ELEMENTS_LIST = [];

function _loadElements() {
  if (_elementsList) return _elementsList;
  const dataPath = path.join(__dirname, '..', '..', 'data', 'elements.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  _elementsList = [];
  _byName = {};
  _bySymbol = {};

  for (const el of raw) {
    const obj = {
      z: el.Z,
      Z: el.Z,
      symbol: el.symbol,
      name: el.name,
      atomicMass: el.atomicMass,
      category: el.category,
      group: el.group,
      period: el.period,
      block: el.block,
      electronConfiguration: el.electronConfiguration,
      electronegativity: el.electronegativity,
      density: el.density,
      meltingPoint: el.meltingPoint,
      boilingPoint: el.boilingPoint,
      discoveredBy: el.discoveredBy,
      discoveryYear: el.discoveryYear,
      description: el.description,
      commonOxidationStates: el.commonOxidationStates || [],
    };
    _elementsList.push(obj);
    ELEMENTS[el.symbol] = obj;
    ELEMENTS_LIST.push(obj);
    _byName[el.name.toLowerCase()] = obj;
    _bySymbol[el.symbol.toLowerCase()] = obj;
  }
  return _elementsList;
}

/**
 * Find an element by symbol, name, or atomic number.
 *
 * @param {string|number} query
 * @returns {Object|null}
 */
function findElement(query) {
  if (query === null || query === undefined || query === '') {
    return null;
  }
  _loadElements();

  // Atomic number
  if (typeof query === 'number' || /^\d+$/.test(String(query).trim())) {
    const z = typeof query === 'number' ? query : parseInt(String(query).trim(), 10);
    return _elementsList.find((e) => e.z === z) || null;
  }

  const q = String(query).trim().toLowerCase();
  if (_bySymbol[q]) return _bySymbol[q];
  if (_byName[q]) return _byName[q];

  // Partial match on name
  for (const el of _elementsList) {
    if (el.name.toLowerCase().startsWith(q)) return el;
  }
  return null;
}

/**
 * Async getInfo wrapper for the bot handler.
 * @param {string|number} query
 * @returns {Promise<{ok:boolean, element:Object|null, formatted:string, error?:string}>}
 */
async function getInfo(query) {
  if (query === undefined || query === null || query === '') {
    return {
      ok: false,
      element: null,
      formatted: 'No element specified. Use a symbol (Au), name (gold), or atomic number (79).',
      error: 'Empty query.',
    };
  }

  const el = findElement(query);
  if (!el) {
    return {
      ok: false,
      element: null,
      formatted: `No element matched '${query}'. Try a symbol (Au), name (gold), or atomic number (79).`,
      error: `No match for '${query}'.`,
    };
  }

  return { ok: true, element: el, formatted: formatElement(el) };
}

function formatElement(el) {
  const lines = [];
  lines.push(`*${el.name}* (${el.symbol}) — Z = ${el.z}`);
  lines.push(`_Category:_ ${el.category}`);
  if (el.group) lines.push(`_Group:_ ${el.group}`);
  if (el.period) lines.push(`_Period:_ ${el.period}`);
  if (el.block) lines.push(`_Block:_ ${el.block}`);
  lines.push(`_Atomic mass:_ ${el.atomicMass} u`);
  if (el.electronegativity !== null && el.electronegativity !== undefined) {
    lines.push(`_Electronegativity:_ ${el.electronegativity}`);
  }
  lines.push(`_Electron configuration:_ ${el.electronConfiguration}`);
  if (Array.isArray(el.commonOxidationStates) && el.commonOxidationStates.length > 0) {
    lines.push(`_Common oxidation states:_ ${el.commonOxidationStates.join(', ')}`);
  }
  if (el.density !== null && el.density !== undefined) {
    lines.push(`_Density:_ ${el.density} g/cm^3`);
  }
  if (el.meltingPoint !== null && el.meltingPoint !== undefined) {
    lines.push(`_Melting point:_ ${el.meltingPoint} K`);
  }
  if (el.boilingPoint !== null && el.boilingPoint !== undefined) {
    lines.push(`_Boiling point:_ ${el.boilingPoint} K`);
  }
  if (el.discoveredBy) {
    const year = el.discoveryYear ? ` (${el.discoveryYear})` : '';
    lines.push(`_Discovered by:_ ${el.discoveredBy}${year}`);
  }
  if (el.description) {
    lines.push('');
    lines.push(el.description);
  }
  return lines.join('\n');
}

// Trigger initial load so that destructured `ELEMENTS` references are populated.
_loadElements();

module.exports = {
  findElement,
  getInfo,
  formatElement,
  ELEMENTS,
  ELEMENTS_LIST,
};
