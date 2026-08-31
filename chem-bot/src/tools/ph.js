'use strict';

/**
 * @file ph.js
 * Calculate pH from acid/base formula and concentration (mol/L).
 * Supports strong acids, weak acids (Ka), strong bases, weak bases (Kb).
 *
 * @module tools/ph
 */

/** Water ionisation constant at 25°C. */
const KW = 1e-14;

/**
 * Strong acids - completely dissociate in water.
 * @type {Object.<string, {name: string, formula: string}>}
 */
const STRONG_ACIDS = {
  HCl: { name: 'Hydrochloric acid', formula: 'HCl' },
  HBr: { name: 'Hydrobromic acid', formula: 'HBr' },
  HI: { name: 'Hydroiodic acid', formula: 'HI' },
  HNO3: { name: 'Nitric acid', formula: 'HNO3' },
  HClO4: { name: 'Perchloric acid', formula: 'HClO4' },
  H2SO4: { name: 'Sulfuric acid', formula: 'H2SO4' },
};

/**
 * Strong bases - completely dissociate in water.
 * @type {Object.<string, {name: string, formula: string}>}
 */
const STRONG_BASES = {
  NaOH: { name: 'Sodium hydroxide', formula: 'NaOH' },
  KOH: { name: 'Potassium hydroxide', formula: 'KOH' },
  LiOH: { name: 'Lithium hydroxide', formula: 'LiOH' },
  RbOH: { name: 'Rubidium hydroxide', formula: 'RbOH' },
  CsOH: { name: 'Cesium hydroxide', formula: 'CsOH' },
  CaOH: { name: 'Calcium hydroxide (monoprotic)', formula: 'CaOH' },
  'Ca(OH)2': { name: 'Calcium hydroxide', formula: 'Ca(OH)2' },
  'Ba(OH)2': { name: 'Barium hydroxide', formula: 'Ba(OH)2' },
  'Sr(OH)2': { name: 'Strontium hydroxide', formula: 'Sr(OH)2' },
};

/**
 * Weak acids - partially dissociate, with known Ka values.
 * @type {Object.<string, {name: string, formula: string, Ka: number, pKa: number}>}
 */
const WEAK_ACIDS = {
  CH3COOH: { name: 'Acetic acid', formula: 'CH3COOH', Ka: 1.8e-5, pKa: 4.74 },
  HF: { name: 'Hydrofluoric acid', formula: 'HF', Ka: 6.8e-4, pKa: 3.17 },
  HCN: { name: 'Hydrocyanic acid', formula: 'HCN', Ka: 4.9e-10, pKa: 9.31 },
  H2S: { name: 'Hydrosulfuric acid', formula: 'H2S', Ka: 1.3e-7, pKa: 6.91 },
  HNO2: { name: 'Nitrous acid', formula: 'HNO2', Ka: 7.2e-4, pKa: 3.14 },
  HClO: { name: 'Hypochlorous acid', formula: 'HClO', Ka: 2.9e-8, pKa: 7.54 },
  H2CO3: { name: 'Carbonic acid', formula: 'H2CO3', Ka: 4.3e-7, pKa: 6.37 },
  H3PO4: { name: 'Phosphoric acid', formula: 'H3PO4', Ka: 7.5e-3, pKa: 2.12 },
  NH4Cl: { name: 'Ammonium chloride', formula: 'NH4Cl', Ka: 5.6e-10, pKa: 9.25 },
};

/**
 * Weak bases - partially dissociate, with known Kb values.
 * @type {Object.<string, {name: string, formula: string, Kb: number, pKb: number}>}
 */
const WEAK_BASES = {
  NH3: { name: 'Ammonia', formula: 'NH3', Kb: 1.8e-5, pKb: 4.74 },
};

/**
 * Classify a formula as a strong acid, weak acid, strong base, or weak base.
 * @param {string} formula
 * @returns {{type: string, formula?: string, name?: string, Ka?: number, Kb?: number, pKa?: number, pKb?: number}}
 */
function classifyAcidBase(formula) {
  const f = (formula || '').trim();

  if (STRONG_ACIDS[f]) {
    const rec = STRONG_ACIDS[f];
    return { type: 'strong_acid', formula: rec.formula, name: rec.name };
  }
  if (STRONG_BASES[f]) {
    const rec = STRONG_BASES[f];
    return { type: 'strong_base', formula: rec.formula, name: rec.name };
  }
  if (WEAK_ACIDS[f]) {
    const rec = WEAK_ACIDS[f];
    return { type: 'weak_acid', formula: rec.formula, name: rec.name, Ka: rec.Ka, pKa: rec.pKa };
  }
  if (WEAK_BASES[f]) {
    const rec = WEAK_BASES[f];
    return { type: 'weak_base', formula: rec.formula, name: rec.name, Kb: rec.Kb, pKb: rec.pKb };
  }

  return { type: 'unknown', formula: f };
}

/**
 * Format a number in scientific notation with a fixed number of decimals.
 * @param {number} x
 * @param {number} digits
 * @returns {string}
 */
function sci(x, digits) {
  if (x === 0) return '0.000e+0';
  return x.toExponential(digits);
}

/**
 * Calculate pH for a given acid/base at a concentration.
 * Returns a formatted HTML/markdown string describing the result.
 *
 * @param {string} formula - e.g. "HCl", "NaOH", "CH3COOH", "NH3".
 * @param {number} concM - Concentration in mol/L.
 * @returns {Promise<string>} Formatted result string.
 */
async function calculate(formula, concM) {
  if (!formula || typeof formula !== 'string') {
    return `*pH calculation*\n  No formula provided. pH cannot be determined.\n`;
  }

  if (concM === undefined || concM === null || isNaN(concM) || concM <= 0) {
    return `*pH calculation*\n  Compound: ${formula.trim()}\n  Invalid concentration '${concM}'. Concentration must be a positive number in mol/L.\n`;
  }

  const classification = classifyAcidBase(formula.trim());
  const { type } = classification;
  const f = formula.trim();

  let pH = 0;
  let pOH = 0;
  let H = 0;
  let OH = 0;
  let percentDissociation = null;
  let details = '';
  let typeLabel = 'Unknown';
  let compoundName = f;

  if (type === 'strong_acid') {
    H = concM;
    // H2SO4 is diprotic: first proton fully dissociates, second has Ka2 ≈ 1.2e-2.
    // For 0.1 M, solve: [H+] = c + x, where x^2 + (c + Ka2)*x - Ka2*c = 0.
    if (f === 'H2SO4') {
      const Ka2 = 1.2e-2;
      const c = concM;
      const a = 1;
      const b = c + Ka2;
      const cQ = -Ka2 * c;
      const disc = b * b - 4 * a * cQ;
      const x = (-b + Math.sqrt(disc)) / (2 * a);
      H = c + x;
      details = `Diprotic strong acid. First proton fully dissociates; second with Ka2 = ${Ka2} (pKa2 = 1.92). [H+] = ${sci(H, 3)} M (effective ~1.0 H+/formula unit at this concentration).`;
    } else {
      details = `[H+] = ${sci(H, 3)} M — complete dissociation assumed.`;
    }
    OH = KW / H;
    pH = -Math.log10(H);
    pOH = -Math.log10(OH);
    typeLabel = 'Strong acid (complete dissociation)';
    compoundName = classification.name || f;

  } else if (type === 'weak_acid') {
    const Ka = classification.Ka;
    if (!Ka) {
      return `*pH calculation*\n  Compound: ${f}\n  Weak acid found but no Ka value available.\n`;
    }
    // Solve: Ka = x^2 / (c - x)  where x = [H+]
    // Quadratic: x^2 + Ka x - Ka c = 0
    const c = concM;
    const a = 1;
    const b = Ka;
    const cQ = Ka * c;
    const disc = b * b + 4 * a * cQ; // Ka*c is positive; b^2 + 4ac form
    H = (-b + Math.sqrt(disc)) / (2 * a);
    OH = KW / H;
    pH = -Math.log10(H);
    pOH = -Math.log10(OH);
    percentDissociation = (H / c) * 100;
    details = `Ka = ${Ka} (pKa = ${(-Math.log10(Ka)).toFixed(2)}); [H+] from quadratic solution.`;
    typeLabel = 'Weak acid (partial dissociation)';
    compoundName = classification.name || f;

  } else if (type === 'strong_base') {
    OH = concM;
    // For Ca(OH)2 and Ba(OH)2, two hydroxide ions per formula unit
    if (f === 'Ca(OH)2' || f === 'Ba(OH)2' || f === 'Sr(OH)2') {
      OH = concM * 2;
      details = `[OH-] = ${sci(OH, 3)} M — diprotic strong base, complete dissociation assumed.`;
    } else {
      details = `[OH-] = ${sci(OH, 3)} M — complete dissociation assumed.`;
    }
    H = KW / OH;
    pH = -Math.log10(H);
    pOH = -Math.log10(OH);
    typeLabel = 'Strong base (complete dissociation)';
    compoundName = classification.name || f;

  } else if (type === 'weak_base') {
    const Kb = classification.Kb;
    if (!Kb) {
      return `*pH calculation*\n  Compound: ${f}\n  Weak base found but no Kb value available.\n`;
    }
    const c = concM;
    const a = 1;
    const b = Kb;
    const cQ = Kb * c;
    const disc = b * b + 4 * a * cQ;
    OH = (-b + Math.sqrt(disc)) / (2 * a);
    H = KW / OH;
    pH = -Math.log10(H);
    pOH = -Math.log10(OH);
    percentDissociation = (OH / c) * 100;
    details = `Kb = ${Kb} (pKb = ${(-Math.log10(Kb)).toFixed(2)}); [OH-] from quadratic solution.`;
    typeLabel = 'Weak base (partial dissociation)';
    compoundName = classification.name || f;

  } else {
    // Generic fallback: assume strong acid behaviour to give a useful pH estimate.
    H = concM;
    OH = KW / H;
    pH = -Math.log10(H);
    pOH = -Math.log10(OH);
    details = `Generic strong-acid estimate for unrecognised formula '${f}'.`;
    typeLabel = 'Generic (assumed strong acid)';
    compoundName = f;
  }

  // Format the concentration nicely
  let concStr;
  if (concM >= 0.001 && concM < 1000) {
    concStr = concM.toString();
    // Use toString for clean output (no trailing zeros)
    if (concM === Math.floor(concM)) {
      concStr = concM.toFixed(1);
    } else {
      // Strip trailing zeros from natural representation
      concStr = parseFloat(concM.toPrecision(4)).toString();
    }
  } else {
    concStr = sci(concM, 3);
  }

  let formatted =
    `*pH calculation*\n` +
    `  Compound: ${compoundName} (${typeLabel})\n` +
    `  Concentration: ${concStr} M\n` +
    `  pH = <b>${pH.toFixed(2)}</b>\n` +
    `  pOH = ${pOH.toFixed(2)}\n` +
    `  [H+] = ${sci(H, 3)} M\n` +
    `  [OH-] = ${sci(OH, 3)} M\n`;

  if (percentDissociation !== null) {
    formatted += `  % dissoc.: ${percentDissociation.toFixed(2)}%\n`;
  }

  formatted += `\n_${details}_`;

  return formatted;
}

module.exports = {
  calculate,
  calculatePh: calculate, // legacy alias
  classifyAcidBase,
  STRONG_ACIDS,
  STRONG_BASES,
  WEAK_ACIDS,
};
