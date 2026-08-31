'use strict';

/**
 * @file namer.js
 * Look up common or IUPAC names for chemical compounds, and apply basic
 * IUPAC naming rules for simple inorganic and organic formulas.
 *
 * @module tools/namer
 */

const path = require('path');
const fs = require('fs');
const { parseCompound, molecularWeight, _loadElementsData } = require('../utils/parser');

/** @type {Array|null} */
let _commonCompounds = null;
/** @type {Object|null} */
let _byFormula = null;
/** @type {Object|null} */
let _byName = null;

/**
 * Load common-compounds data.
 * @returns {Array}
 */
function _loadCompounds() {
  if (_commonCompounds) return _commonCompounds;
  const dataPath = path.join(__dirname, '..', '..', 'data', 'common-compounds.json');
  _commonCompounds = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  _byFormula = {};
  _byName = {};
  for (const c of _commonCompounds) {
    _byFormula[c.formula] = c;
    if (c.name) _byName[c.name.toLowerCase()] = c;
    if (c.commonName) _byName[c.commonName.toLowerCase()] = c;
    if (c.iupacName) _byName[c.iupacName.toLowerCase()] = c;
  }
  return _commonCompounds;
}

/**
 * Look up the IUPAC name of a compound by formula or common name.
 *
 * @param {string} query - A formula ("H2O") or name ("water").
 * @returns {Promise<{
 *   ok: boolean,
 *   query: string,
 *   formula: string,
 *   iupacName: string,
 *   commonName: string,
 *   source: string,
 *   formatted: string,
 *   error?: string
 * }>}
 */
async function iupacName(query) {
  if (!query || typeof query !== 'string') {
    return {
      ok: false,
      query: String(query || ''),
      formula: '',
      iupacName: '',
      commonName: '',
      source: '',
      formatted: 'No compound name or formula provided.',
      error: 'Empty query.',
    };
  }

  const q = query.trim();
  const compounds = _loadCompounds();

  // Try exact formula match
  let comp = _byFormula[q];
  let source = 'common-compounds table';

  if (!comp) {
    // Try common name / IUPAC name lookup
    const lower = q.toLowerCase();
    comp = _byName[lower];
  }

  if (!comp) {
    // Try parsing the formula and naming from rules
    const synthetic = _tryNameFromRules(q);
    if (synthetic) {
      comp = { formula: q, name: synthetic.name, iupacName: synthetic.name, commonName: synthetic.name };
      source = 'heuristic IUPAC rules';
    } else {
      return {
        ok: false,
        query: q,
        formula: '',
        iupacName: '',
        commonName: '',
        source: '',
        formatted: `Could not find or compute a name for '${q}'.`,
        error: 'No match found.',
      };
    }
  }

  const formatted =
    `*Naming lookup*\n` +
    `  Query       : ${q}\n` +
    `  Formula     : ${comp.formula}\n` +
    `  IUPAC name  : ${comp.iupacName || comp.name}\n` +
    `  Common name : ${comp.commonName || comp.name}\n` +
    `  Source      : ${source}\n` +
    (comp.uses ? `  Uses        : ${(comp.uses || []).join(', ')}\n` : '') +
    (comp.molarMass ? `  Molar mass  : ${comp.molarMass} g/mol\n` : '');

  return {
    ok: true,
    query: q,
    formula: comp.formula,
    iupacName: comp.iupacName || comp.name,
    commonName: comp.commonName || comp.name,
    source,
    formatted,
    entry: comp,
  };
}

/**
 * Best-effort heuristic naming for simple compounds not in the table.
 * Handles: binary acids, oxyacids, simple ionic, basic hydrocarbons.
 *
 * @param {string} formula
 * @returns {{ name: string }|null}
 */
function _tryNameFromRules(formula) {
  const parsed = parseCompound(formula);
  const c = parsed.elements;
  const elems = Object.keys(c);
  if (elems.length === 0) return null;

  // 1) Simple hydrocarbons CnHm
  if (elems.length === 2 && c.C && c.H && !c.O) {
    // Alkane CnH(2n+2) → saturated
    // Alkene CnH(2n) → one C=C
    // Alkyne CnH(2n-2) → one C≡C
    const n = c.C;
    const h = c.H;
    if (h === 2 * n + 2) {
      const prefix = greekPrefix(n);
      return { name: `${prefix}ane` };
    }
    if (h === 2 * n) {
      const prefix = greekPrefix(n);
      return { name: n === 2 ? 'ethene' : `${prefix}ene` };
    }
    if (h === 2 * n - 2) {
      const prefix = greekPrefix(n);
      return { name: n === 2 ? 'ethyne' : `${prefix}yne` };
    }
    // Cyclic alkane CnH(2n)
    if (h === 2 * n) {
      const prefix = greekPrefix(n);
      return { name: `cyclo${prefix}ane` };
    }
  }

  // 2) Binary acids: HX where X is a non-metal (no O)
  if (elems.length === 2 && c.H && !c.O) {
    const other = elems.find((e) => e !== 'H');
    if (other && ['F', 'Cl', 'Br', 'I', 'S', 'Se', 'Te'].includes(other)) {
      const root = { F: 'fluor', Cl: 'chlor', Br: 'brom', I: 'iod', S: 'sulfur', Se: 'selen', Te: 'tellur' }[other];
      return { name: `hydro${root}ic acid` };
    }
  }

  // 3) Oxyacids: Hx X O y — name after the parent ion
  if (c.H && c.O && elems.length >= 3) {
    // Strip H from composition, infer anion formula
    const anionElems = elems.filter((e) => e !== 'H');
    if (anionElems.length === 1) {
      // H_n X O_m  → X has oxidation state = (2m - n)/1 if X is single
      // Naming is tricky; default to "X-oxide hydrate" form
      const x = anionElems[0];
      return { name: `${x.toLowerCase()}-based oxyacid` };
    }
  }

  // 4) Simple ionic MXn
  if (elems.length === 2) {
    const a = elems[0];
    const b = elems[1];
    // Assume cation comes first alphabetically or by convention
    return { name: `${capitalize(a)} ${b.toLowerCase()}` };
  }

  return null;
}

/**
 * Greek prefix for IUPAC naming of carbon count.
 * @param {number} n
 * @returns {string}
 */
function greekPrefix(n) {
  const table = {
    1: 'meth', 2: 'eth', 3: 'prop', 4: 'but', 5: 'pent', 6: 'hex',
    7: 'hept', 8: 'oct', 9: 'non', 10: 'dec',
    11: 'undec', 12: 'dodec', 20: 'icos',
  };
  return table[n] || `C${n}`;
}

/**
 * Capitalise the first letter of a string.
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

module.exports = { iupacName };
