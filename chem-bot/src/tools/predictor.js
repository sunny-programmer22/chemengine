'use strict';

/**
 * @file predictor.js
 * Predict products and reaction type from a set of reactants.
 * Uses a heuristic decision tree: combustion, decomposition, single/double replacement,
 * neutralisation, metathesis, redox, and various named industrial reactions.
 *
 * @module tools/predictor
 */

const { parseCompound, parseEquation } = require('../utils/parser');

// ---------------------------------------------------------------------------
// Compound classification helpers
// ---------------------------------------------------------------------------

const HALOGENS = new Set(['F', 'Cl', 'Br', 'I']);
const NOBLE_GASES = new Set(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn']);

/** Alkali metals (group 1, excluding H). */
const ALKALI = new Set(['Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']);
/** Alkaline earth metals (group 2). */
const ALKALINE_EARTH = new Set(['Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra']);

/**
 * Get all element symbols in a parsed composition.
 * @param {Object} composition
 * @returns {string[]}
 */
function _elements(composition) {
  return composition ? Object.keys(composition) : [];
}

/**
 * Does the formula contain at least one carbon and at least one hydrogen?
 * @param {Object} composition
 * @returns {boolean}
 */
function _hasCH(composition) {
  return (composition.C || 0) >= 1 && (composition.H || 0) >= 1;
}

/**
 * Does the formula contain a metal cation (alkali, alkaline earth, or transition metal)?
 * Simple heuristic: any element symbol that is not in our "non-metals" set.
 * @param {Object} composition
 * @returns {boolean}
 */
const NON_METALS = new Set([
  'H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Se', 'Br', 'I',
]);
const SEMI_METALS = new Set(['B', 'Si', 'Ge', 'As', 'Sb', 'Te', 'Po']);

function _hasMetal(composition) {
  for (const sym of _elements(composition)) {
    if (NOBLE_GASES.has(sym)) continue;
    if (NON_METALS.has(sym)) continue;
    if (SEMI_METALS.has(sym)) continue;
    return true;
  }
  return false;
}

/**
 * Does the formula contain carbon bonded to hydrogen (hydrocarbon skeleton)?
 * @param {Object} composition
 * @returns {boolean}
 */
function _isHydrocarbon(composition) {
  const elems = _elements(composition);
  if (elems.length !== 2) return false;
  return (composition.C || 0) > 0 && (composition.H || 0) > 0;
}

/**
 * Is the formula an acid? Looks for an H that is "loose" (not bonded to a non-metal
 * that is itself bonded to only H) — simple heuristic: the formula has H plus
 * an anion-forming element (non-metal other than H).
 * @param {Object} composition
 * @returns {boolean}
 */
function _isAcid(parsed) {
  const c = parsed.elements;
  if (!c.H || c.H === 0) return false;
  // Binary acid: H + 1 other element
  const nonH = _elements(c).filter((e) => e !== 'H');
  if (nonH.length === 1 && !NON_METALS.has(nonH[0]) === false) {
    // HX where X is halogen or S
    if (HALOGENS.has(nonH[0]) || nonH[0] === 'S' || nonH[0] === 'Se' || nonH[0] === 'Te' || nonH[0] === 'N') {
      return true;
    }
  }
  // Oxyacid: H, O, and another non-metal
  if (c.O && c.O > 0 && nonH.some((e) => !['H', 'O'].includes(e) && NON_METALS.has(e))) {
    return true;
  }
  return false;
}

/**
 * Is the formula a base? Metal hydroxide (metal + OH).
 * @param {Object} parsed
 * @returns {boolean}
 */
function _isBase(parsed) {
  const c = parsed.elements;
  if (!_hasMetal(c)) return false;
  if ((c.O || 0) < 1 || (c.H || 0) < 1) return false;
  // Look for OH group: H : O = 1:1
  if (c.H === c.O) {
    return true;
  }
  return false;
}

/**
 * Get the cation symbol of a compound (heuristic: first non-O element with
 * positive character, often the metal). Returns a single symbol.
 * @param {Object} composition
 * @returns {string|null}
 */
function _cation(composition) {
  for (const sym of _elements(composition)) {
    if (sym === 'O' || sym === 'H') continue;
    if (NON_METALS.has(sym) || SEMI_METALS.has(sym)) continue;
    return sym;
  }
  return null;
}

/**
 * Get the anion-forming non-metal of a compound (often O for oxides,
 * halogens for halides, etc.). Simple heuristic: O if present, else first
 * non-cation non-metal.
 * @param {Object} composition
 * @returns {string|null}
 */
function _anion(composition) {
  if (composition.O) return 'O';
  for (const sym of _elements(composition)) {
    if (NON_METALS.has(sym) || SEMI_METALS.has(sym)) {
      return sym;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Activity series (for single replacement)
// ---------------------------------------------------------------------------

const ACTIVITY_SERIES = [
  'Cs', 'Fr',
  'Rb', 'K', 'Na', 'Li', 'Ba', 'Sr', 'Ca', 'Mg',
  'Be', 'Al', 'Mn', 'Zn', 'Cr', 'Fe', 'Cd', 'Co', 'Ni', 'Sn', 'Pb',
  'H',
  'Cu', 'Hg', 'Ag', 'Au', 'Pt',
];

function _activityRank(sym) {
  const idx = ACTIVITY_SERIES.indexOf(sym);
  return idx === -1 ? -1 : idx;
}

// ---------------------------------------------------------------------------
// Reaction prediction engine
// ---------------------------------------------------------------------------

/**
 * Predict reaction products and type from a list of reactants.
 *
 * @param {string} reactantsStr - A string like "CH4 + O2" or "HCl + NaOH".
 * @returns {Promise<{
 *   ok: boolean,
 *   reactionType: string,
 *   products: string[],
 *   balancedEquation: string,
 *   description: string,
 *   formatted: string,
 *   error?: string
 * }>}
 */
async function predict(reactantsStr) {
  if (!reactantsStr || typeof reactantsStr !== 'string') {
    return 'No reactants provided.';
  }

  const cleaned = reactantsStr.replace(/->|=>|→|=|\s+/g, ' ').trim();
  const parts = cleaned.split(/[+]/g).map((s) => s.trim()).filter(Boolean);

  if (parts.length === 0) {
    return 'No reactants could be parsed.';
  }

  const parsedList = parts.map((p) => parseCompound(p));

  // -- 1) Combustion: hydrocarbon + O2 -----------------------------------------
  if (parts.length === 2 && parts[1].toLowerCase() === 'o2') {
    const p = parsedList[0];
    if (_hasCH(p.elements)) {
      return _respond('combustion', [
        'CO2',
        'H2O',
      ], `${p.formula} + O2 -> CO2 + H2O`, 'Complete combustion of a hydrocarbon. With limited O2, CO and/or C may form instead.');
    }
  }

  // -- 2) Single reactant decomposition ----------------------------------------
  if (parts.length === 1) {
    const p = parsedList[0];
    const c = p.elements;
    const elems = _elements(c);

    // Water electrolysis
    if (c.H === 2 && c.O === 1) {
      return _respond('decomposition (electrolysis)', ['H2', 'O2'],
        '2 H2O -> 2 H2 + O2', 'Electrolysis of water. Use a power source (e.g., DC current).');
    }
    // Carbonates -> oxide + CO2
    if (c.C === 1 && c.O === 3 && _hasMetal(c)) {
      return _respond('decomposition (thermal)', ['MO', 'CO2'],
        'MCO3 -> MO + CO2 (with heat)', 'Carbonates decompose on heating to give the metal oxide and carbon dioxide.');
    }
    // Metal chlorates -> chloride + O2
    if (_hasMetal(c) && c.Cl === 1 && c.O === 3) {
      return _respond('decomposition (thermal)', ['MCl', 'O2'],
        '2 MClO3 -> 2 MCl + 3 O2 (with heat, MnO2 catalyst)', 'Metal chlorates decompose on heating (often with MnO2 catalyst) to give the chloride and oxygen.');
    }
    // Metal oxides (high-temp) — placeholders
    if (_hasMetal(c) && elems.length === 2) {
      return _respond('decomposition', ['M', 'X'],
        `${p.formula} -> M + X (with heat or electrolysis)`,
        'Many compounds decompose when heated or electrolysed. Specific products depend on the compound.');
    }
    return _respond('decomposition (general)', ['various products'],
      `${p.formula} -> products`, 'A single compound decomposing. Use a tool like the balancer to test specific product sets.');
  }

  // -- 3) Two-reactant cases --------------------------------------------------
  if (parts.length === 2) {
    const [a, b] = parsedList;
    const cA = a.elements;
    const cB = b.elements;

    // Acid + base (neutralisation)
    if ((_isAcid(a) && _isBase(b)) || (_isAcid(b) && _isBase(a))) {
      return _respond('neutralization (acid-base)', ['salt', 'H2O'],
        'HA + BOH -> BA + H2O', 'Acid-base neutralisation produces a salt and water. The exact salt depends on the cation/anion involved.');
    }

    // Hydrocarbon + H2 (hydrogenation)
    if (_isHydrocarbon(cA) && (b.formula || '').toLowerCase() === 'h2') {
      return _respond('hydrogenation (addition)', ['alkane'],
        'CnHm + (n) H2 -> CnH(2n+2) (with Pt/Pd/Ni catalyst)',
        'Hydrogenation of an alkene/alakynepolyne adds H2 across multiple bonds. Requires a metal catalyst (Pt, Pd, or Ni).');
    }

    // Hydrocarbon + H2O (hydration)
    if (_isHydrocarbon(cA) && (b.formula || '').toLowerCase() === 'h2o') {
      return _respond('hydration (addition)', ['alcohol'],
        'CnHm + H2O -> CnH(m+1)OH (Markovnikov, acid catalyst)',
        'Acid-catalysed addition of water across a C=C bond gives an alcohol. Markovnikov regiochemistry.');
    }

    // Alkene + halogen (halogenation, addition)
    if (_isHydrocarbon(cA) && HALOGENS.has(Object.keys(cB)[0]) && Object.keys(cB).length === 1) {
      return _respond('halogenation (addition)', ['dihaloalkane'],
        'CnHm + X2 -> CnHmX2', 'Halogens add across C=C double bonds to give vicinal dihalides.');
    }

    // Synthesis: free metal + free non-metal (often a halogen or O2)
    // e.g. 2 Na + Cl2 -> 2 NaCl ;  2 Mg + O2 -> 2 MgO ;  2 Al + 3 Br2 -> 2 AlBr3
    if (elemsAreSingle(a) && elemsAreSingle(b)) {
      const aElem = Object.keys(cA)[0];
      const bElem = Object.keys(cB)[0];
      const aIsMetal = _hasMetal(cA) && !NON_METALS.has(aElem) && !SEMI_METALS.has(aElem);
      const bIsMetal = _hasMetal(cB) && !NON_METALS.has(bElem) && !SEMI_METALS.has(bElem);
      // Metal + non-metal -> ionic salt (synthesis)
      if (aIsMetal && !bIsMetal) {
        return _synthesise(aElem, a, bElem, b);
      }
      if (bIsMetal && !aIsMetal) {
        return _synthesise(bElem, b, aElem, a);
      }
      // Two non-metals: combination reaction with a generic product
      if (!aIsMetal && !bIsMetal) {
        return _respond('synthesis (combination)', [`${aElem}${bElem}`],
          `${a.formula} + ${b.formula} -> ${aElem}${bElem}`,
          'Direct combination of two non-metals. The product is a covalent compound of the two elements.');
      }
    }

    // Single replacement: free element + compound
    if (elemsAreSingle(a) && !elemsAreSingle(b)) {
      return _singleReplace(a, b);
    }
    if (elemsAreSingle(b) && !elemsAreSingle(a)) {
      return _singleReplace(b, a);
    }

    // Both compounds: double replacement
    if (!_hasMetal(cA) === false || !_hasMetal(cB) === false) {
      // Heuristic: if both have at least one non-metal, suspect double replacement
      if (elemsAreCompound(cA) && elemsAreCompound(cB)) {
        return _doubleReplace(a, b);
      }
    }
  }

  // -- 4) Fallback ------------------------------------------------------------
  return _respond('unspecified', ['?'],
    `${parts.join(' + ')} -> ?`,
    'Could not match a specific reaction pattern. Try the balancer with a candidate equation, or use a more specific predictor.');
}

function elemsAreSingle(p) {
  const elems = _elements(p.elements);
  // Single element if composition has one entry and a count >= 1
  return elems.length === 1;
}

function elemsAreCompound(p) {
  return _elements(p.elements).length > 1;
}

function _singleReplace(element, compound) {
  const sym = _elements(element.elements)[0];
  const target = _cation(compound.elements);
  if (target && _activityRank(sym) >= 0 && _activityRank(target) >= 0) {
    if (_activityRank(sym) > _activityRank(target)) {
      const anion = _anion(compound.elements);
      const newCompound = anion ? `${sym}${anion}` : `${sym}?`;
      return _respond('single replacement (redox)', [newCompound, target],
        `${sym} + ${target}-compound -> ${newCompound} + ${target}`,
        `Single replacement: ${sym} is more reactive than ${target} (activity series), so it displaces ${target} from its compound.`);
    } else {
      return _respond('no reaction', [], `${sym} + ${target}-compound -> no reaction`,
        `${sym} is below ${target} in the activity series, so no displacement occurs.`);
    }
  }
  return _respond('single replacement (redox)', ['?'],
    `${sym} + compound -> ?`,
    'Single replacement (redox) reaction. The free element may displace another from its compound if it is higher in the activity series.');
}

function _doubleReplace(a, b) {
  const cA = a.elements;
  const cB = b.elements;
  const cA2 = _cation(cA);
  const cB2 = _cation(cB);
  const aA = _anion(cA);
  const aB = _anion(cB);

  if (cA2 && cB2 && aA && aB) {
    const newA = `${cA2}${aB}`;
    const newB = `${cB2}${aA}`;
    return _respond('double replacement (metathesis)', [newA, newB],
      `${a.formula} + ${b.formula} -> ${newA} + ${newB}`,
      'Double replacement: the cations swap anions. A precipitate, gas, or water usually drives the reaction.');
  }
  return _respond('double replacement (metathesis)', ['?'],
    `${a.formula} + ${b.formula} -> products`,
    'Double replacement. The products form by swapping anions; the reaction is driven by formation of a precipitate, gas, or weak electrolyte.');
}

/**
 * Predict a synthesis (combination) reaction: free metal + free non-metal.
 * Returns a string containing the predicted ionic product and equation.
 */
function _synthesise(metalSym, metalParsed, nonMetalSym, nonMetalParsed) {
  // The product is an ionic compound: Metal_xNonMetal_y.
  // For diatomic non-metals (O2, N2, H2, halogens), we have to figure out the
  // simplest integer stoichiometry.
  const metal = metalParsed.formula;          // e.g. "Na"
  const nonMetal = nonMetalParsed.formula;    // e.g. "Cl2"
  const nonMetalAtoms = Object.values(nonMetalParsed.elements)[0] || 1; // 2 for Cl2, 1 for S, 1 for O...

  // Common charges: alkali = +1, alkaline earth = +2, Al = +3.
  // Halides are -1; O is -2; S is -2; N is -3.
  const chargeMap = {
    'F': 1, 'Cl': 1, 'Br': 1, 'I': 1,
    'O': 2, 'S': 2, 'Se': 2, 'Te': 2,
    'N': 3, 'P': 3,
    'H': 1,
  };
  const metalChargeMap = {
    'Li': 1, 'Na': 1, 'K': 1, 'Rb': 1, 'Cs': 1, 'Fr': 1,
    'Be': 2, 'Mg': 2, 'Ca': 2, 'Sr': 2, 'Ba': 2, 'Ra': 2,
    'Al': 3,
  };
  const mChg = metalChargeMap[metalSym] || 1;
  const xChg = chargeMap[nonMetalSym] || 1;

  // Product formula: Metal_xNonMetal_y where mChg * y = xChg * x (charge balance).
  // The conventional formula writes the cation first with the SMALLER subscript.
  // Solving: simplest integer ratio is x = xChg/gcd, y = mChg/gcd.
  //   Na+ + Cl-  : mChg=1, xChg=1 → x=1, y=1 → NaCl ✓
  //   Mg2+ + O2- : mChg=2, xChg=2 → x=1, y=1 → MgO ✓
  //   Al3+ + Br- : mChg=3, xChg=1 → x=1, y=3 → AlBr3 ✓
  const g = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
  const gd = g(mChg, xChg);
  const xSub = xChg / gd;
  const ySub = mChg / gd;

  // Build the product formula with both subscripts when > 1.
  const metalPart = xSub > 1 ? `${metalSym}${xSub}` : metalSym;
  const nonMetalPart = ySub > 1 ? `${nonMetalSym}${ySub}` : nonMetalSym;
  const productFormula = `${metalPart}${nonMetalPart}`;

  // Balance: a*Metal + b*nonMetalSrc -> c*Product
  //   metal atoms:   a = c * xSub
  //   non-metal atoms: b * nonMetalAtoms = c * ySub
  // Therefore b = c * ySub / nonMetalAtoms. Smallest c such that a and b are
  // both integers:
  //   a is always integer (a = c * xSub).
  //   b is integer iff c * ySub is divisible by nonMetalAtoms.
  // For nonMetalAtoms=2 (diatomic), xSub=1, ySub=1: c=2 → a=2, b=1 → 2 Na + Cl2 -> 2 NaCl.
  // For nonMetalAtoms=2, xSub=1, ySub=1: c=2 → a=2, b=1 → 2 Mg + O2 -> 2 MgO.
  // For nonMetalAtoms=2, xSub=1, ySub=3: c=2 → a=2, b=3 → 2 Al + 3 Br2 -> 2 AlBr3.
  let c = 1;
  for (let trial = 1; trial <= 12; trial++) {
    if ((trial * ySub) % nonMetalAtoms === 0) { c = trial; break; }
  }
  const a = c * xSub;
  const b = (c * ySub) / nonMetalAtoms;

  const lhs = (a === 1 ? metal : `${a} ${metal}`) + ' + ' +
    (b === 1 ? nonMetal : `${b} ${nonMetal}`);
  const rhs = (c === 1 ? productFormula : `${c} ${productFormula}`);
  const balanced = `${lhs} -> ${rhs}`;

  return _respond('synthesis (combination)', [productFormula],
    balanced,
    `Direct combination of a metal and a non-metal. The product is the ionic salt ` +
    `${productFormula} (Metal ${mChg >= 0 ? '+' + mChg : mChg}, Non-metal ${xChg >= 0 ? '-' + xChg : xChg}). ` +
    `This is an exothermic redox reaction — the metal is oxidised, the non-metal is reduced.`);
}

function _respond(type, products, balanced, description) {
  const formatted =
    `*Predicted reaction type:* ${type}\n\n` +
    `*Equation:*\n  ${balanced}\n\n` +
    `*Products:*\n  ${products.join(', ')}\n\n` +
    `*Note:* ${description}`;
  return formatted;
}

module.exports = { predict };
