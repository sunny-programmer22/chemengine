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

const metalChargeMap = {
  'Li': 1, 'Na': 1, 'K': 1, 'Rb': 1, 'Cs': 1, 'Fr': 1,
  'Be': 2, 'Mg': 2, 'Ca': 2, 'Sr': 2, 'Ba': 2, 'Ra': 2,
  'Al': 3, 'Sc': 3, 'Y': 3, 'La': 3,
  'Ti': 4, 'Zr': 4, 'Hf': 4,
  'V': 3, 'Nb': 3, 'Ta': 3,
  'Cr': 3, 'Mo': 3, 'W': 3,
  'Mn': 2, 'Tc': 2, 'Re': 2,
  'Fe': 2, 'Fe3': 3, 'Ru': 2, 'Os': 2,
  'Co': 2, 'Rh': 2, 'Ir': 2,
  'Ni': 2, 'Pd': 2, 'Pt': 2,
  'Cu': 2, 'Ag': 1, 'Au': 3,
  'Zn': 2, 'Cd': 2, 'Hg': 2,
  'Ga': 3, 'In': 3, 'Tl': 3,
  'Sn': 2, 'Pb': 2,
  'Sb': 3, 'Bi': 3,
};

const TRANSITION_METALS = new Set([
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd',
  'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn',
]);

function _gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

function _getMetalCharge(sym) {
  if (metalChargeMap[sym] !== undefined) return metalChargeMap[sym];
  if (TRANSITION_METALS.has(sym)) return 2;
  if (ALKALI.has(sym)) return 1;
  if (ALKALINE_EARTH.has(sym)) return 2;
  return 1;
}

function _buildFormulaFromElements(elementsMap, excludeSet) {
  let formula = '';
  for (const [sym, cnt] of Object.entries(elementsMap)) {
    if (excludeSet.has(sym)) continue;
    if (!cnt) continue;
    formula += sym + (cnt > 1 ? String(cnt) : '');
  }
  return formula;
}

function _isPolyatomic(formula) {
  if (!formula) return false;
  const parsed = parseCompound(formula);
  if (parsed && parsed.isValid) {
    const n = Object.keys(parsed.elements).length;
    if (n >= 2) return true;
  }
  const elems = formula.match(/[A-Z][a-z]?/g);
  if (elems && elems.length >= 2) return true;
  return formula.length > 2;
}

function _buildSaltFormula(metalSym, metalCharge, anionFormula, anionCharge) {
  const g = _gcd(metalCharge, anionCharge);
  const x = anionCharge / g;
  const y = metalCharge / g;
  const metalPart = x > 1 ? `${metalSym}${x}` : metalSym;
  let anionPart = anionFormula;
  if (y > 1) {
    if (_isPolyatomic(anionFormula)) {
      anionPart = `(${anionFormula})${y}`;
    } else {
      anionPart = `${anionFormula}${y}`;
    }
  }
  return `${metalPart}${anionPart}`;
}

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

  const LOWER_CLEAN = cleaned.toLowerCase();

  // ── 0a) Named reaction conditions / triggers ─────────────────────────────
  // The user named a process — tag the specific type. These win over the
  // ordinary classification because the user told us what it is.
  if (/\b(photo|photochem|photon|hν|uv)/i.test(LOWER_CLEAN) && !/\b(photo)?(synth|decomp)/.test(LOWER_CLEAN)) {
    return _respond('photochemical reaction', ['products (light-driven)'],
      `${parts.join(' + ')} + hν -> products`,
      'A photochemical reaction is initiated or driven by absorption of a photon (light). Products depend on the molecule and wavelength (e.g. photosynthesis, halogen photo-dissociation).');
  }
  if (/\b(electrolys|electrolytic|electric\s*current|applied\s*dc)/i.test(LOWER_CLEAN)) {
    return _respond('electrolysis', ['cathode product', 'anode product'],
      `${parts.join(' + ')} -> products (applied DC current)`,
      'Electrolysis applies a direct electric current to drive a non-spontaneous redox change at the electrodes (e.g. electrolysis of molten NaCl or water).');
  }
  if (/\b(radiolyt|radiolysis?|ionizing\s*radiation|γ|\balpha-?ray\b|\bbeta-?ray\b|radiation)/i.test(LOWER_CLEAN)) {
    return _respond('radiolytic reaction', ['fragments (radiation-decomposed)'],
      `${parts.join(' + ')} -> fragments (ionizing radiation)`,
      'Radiolysis is chemical decomposition driven by ionizing radiation (γ-rays, α/β particles) — e.g. water radiolysis into H2 and H2O2.');
  }
  if (/\b(enzym|biocatal|biological)/i.test(LOWER_CLEAN)) {
    return _respond('enzymatic catalysis', ['products (enzyme-catalysed)'],
      `${parts.join(' + ')} -> products (enzyme)`,
      'An enzyme accelerates the reaction under physiological conditions without being consumed, lowering the activation energy and giving high specificity.');
  }
  if (/\birreversible\b/i.test(LOWER_CLEAN)) {
    return _respond('irreversible reaction', ['products'],
      `${parts.join(' + ')} -> products`,
      'This is an irreversible reaction: it proceeds in one direction until at least one reactant is fully consumed (e.g. combustion, most precipitations).');
  }
  if (/[⇌]|<=>|\breversible\b/i.test(cleaned)) {
    return _respond('reversible reaction', ['products'],
      `${parts.join(' + ')} ⇌ products`,
      'This is a reversible reaction: the products can revert to reactants, so an equilibrium (dynamic balance) establishes between both sides.');
  }
  if (/\bo?xid\w*|oxidation|redox/i.test(LOWER_CLEAN) && !/reduc|reduc\w*/i.test(LOWER_CLEAN)) {
    return _respond('oxidation (redox loss)', ['oxidised product'],
      `${parts.join(' + ')} -> products (electrons lost)`,
      'Oxidation is a reaction step where an atom or molecule loses electrons (increase in oxidation state).');
  }
  if (/\bredu(c\w*|ction|ct)/i.test(LOWER_CLEAN) && !/oxid|rearr/i.test(LOWER_CLEAN)) {
    return _respond('reduction (redox gain)', ['reduced product'],
      `${parts.join(' + ')} -> products (electrons gained)`,
      'Reduction is a reaction step where an atom or molecule gains electrons (decrease in oxidation state). Oxidation and reduction always occur together (redox).');
  }
  if (/\bendothermic\b|\babsorbs?\s*(heat|energy)\b/i.test(LOWER_CLEAN) && !/exothermic/.test(LOWER_CLEAN)) {
    return _respond('endothermic reaction', ['products'],
      `${parts.join(' + ')} + heat -> products`,
      'Endothermic reactions absorb thermal energy from the surroundings (ΔH > 0) — e.g. photosynthesis, thermal decomposition of CaCO3.');
  }
  if (/\bexothermic\b|\breleases?\s*(heat|energy)\b/i.test(LOWER_CLEAN) && !/endothermic/.test(LOWER_CLEAN)) {
    return _respond('exothermic reaction', ['products', 'heat'],
      `${parts.join(' + ')} -> products + heat`,
      'Exothermic reactions release thermal energy to the surroundings (ΔH < 0) — e.g. combustion, neutralisation, most combination reactions.');
  }
  if (/\bautocatal|\bself-?catal/.test(LOWER_CLEAN)) {
    return _respond('autocatalysis', ['products (catalysed by a product)'],
      `${parts.join(' + ')} -> products`,
      'Autocatalysis is a reaction where one of the products acts as the catalyst for its own formation (e.g. the permanganate–oxalate reaction).');
  }
  if (/\brearrang/i.test(LOWER_CLEAN)) {
    return _respond('rearrangement (e.g. Beckmann, Wagner–Meerwein)', ['structural isomer'],
      `${parts.join(' + ')} -> structural isomer`,
      'A rearrangement re-organises the carbon skeleton or functional group to give a structural isomer (e.g. Beckmann, Wagner–Meerwein, pinacol).');
  }
  if (/\bisomeri[sz]/i.test(LOWER_CLEAN)) {
    return _respond('isomerization', ['structural isomer'],
      `${parts.join(' + ')} -> structural isomer`,
      'Isomerisation rearranges atoms within a molecule without changing its formula, producing a structural (or configurational) isomer.');
  }

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

  // -- 1b) Polymerisation (keyword) — must precede single-reactant decomposition
  if (parts.length === 1 && /\bpolymer|polymeriz|\bn\b|monomer/i.test(LOWER_CLEAN)) {
    return _respond('polymerization (addition/condensation)', ['polymer chain'],
      `n (${parts[0]}) -> [-repeat unit-]n`,
      'Small repeating units (monomers) link covalently into long chains — addition polymerisation (no by-product) or condensation polymerisation (releases H2O/alcohol).');
  }

  // -- 1c) Isomerisation / rearrangement hints — must precede decomposition
  if (parts.length === 1 && (/\bisomer/i.test(LOWER_CLEAN) || /\brearrang/i.test(LOWER_CLEAN))) {
    return _respond(
      LOWER_CLEAN.includes('rearrang') ? 'rearrangement (e.g. Beckmann, Wagner–Meerwein)' : 'isomerization',
      ['structural isomer'],
      `${parts[0]} -> structural isomer`,
      LOWER_CLEAN.includes('rearrang')
        ? 'A rearrangement re-organises the carbon skeleton/functional group to a structural isomer (e.g. Beckmann, Wagner–Meerwein, pinacol).'
        : 'Isomerisation rearranges atoms within a molecule without changing its formula, producing a structural (or configurational) isomer.');
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

    // Combustion: one reactant is O2, the other a fuel (H2, hydrocarbon, or C/H/O compound)
    const o2IsA = (a.formula || '').toLowerCase() === 'o2';
    const o2IsB = (b.formula || '').toLowerCase() === 'o2';
    const fuelA = (a.elements.C && a.elements.C > 0) || (a.elements.H && a.elements.H > 0);
    const fuelB = (b.elements.C && b.elements.C > 0) || (b.elements.H && b.elements.H > 0);
    if ((o2IsA && fuelB) || (o2IsB && fuelA)) {
      const fuel = o2IsA ? b : a;
      const isHydrocarbonFuel = fuel.elements.C > 0;
      return _respond('combustion', isHydrocarbonFuel ? ['CO2', 'H2O'] : ['H2O'],
        isHydrocarbonFuel ? 'CxHy + O2 -> CO2 + H2O (complete)' : 'H2 + O2 -> H2O',
        isHydrocarbonFuel
          ? 'Combustion of a hydrocarbon in oxygen produces carbon dioxide and water (complete combustion; incomplete gives CO or C).'
          : 'Combustion of hydrogen in oxygen is the classic vigorous reaction producing water with a large exothermic release.');
    }

    // Complexation: transition-metal salt + a neutral ligand (NH3, H2O, CO, CN-)
    // Guard: ligand must be a compound (not a free single element like Cl2 or Br2).
    const _isLigandComp = (p) => _isLigand(p) && elemsAreCompound(p);
    if ((_hasMetal(cA) && _isLigandComp(b)) || (_hasMetal(cB) && _isLigandComp(a))) {
      const metalSalt = _hasMetal(cA) ? a : b;
      const ligand = metalSalt === a ? b : a;
      const metalSym = _cation(metalSalt.elements) || 'M';
      const ligandSym = (ligand.formula || 'L').replace(/[0-9]/g, '');
      return _respond('complexation (coordination)', [`[${metalSym}(${ligandSym})x]`],
        `${metalSalt.formula} + ${ligand.formula} -> [${metalSym}(${ligandSym})x]`,
        'A metal ion (Lewis acid) accepts electron pairs from the ligand (Lewis base) to form a coordination complex. Aqua/ammino/cyano complexes are common.');
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
      // Aromatic rings undergo substitution, not addition — detect by C:H ratio
      // benzene has C:H = 1:1; alkenes have C:H = 1:2 (alkenes) or higher.
      if (cA.C > 0 && cA.H > 0 && cA.C === cA.H) {
        return _respond('electrophilic substitution', ['aryl halide', 'HX'],
          `${a.formula} + ${b.formula} -> Ar-X + HX`,
          'Electrophilic aromatic substitution: the halogen replaces a ring H (requires Lewis-acid catalyst like FeBr3/AlCl3).');
      }
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

    // -- 2b) Disproportionation (halogen + alkali hydroxide) --
    // Must run before generic single-replacement or the halogen gets mis-classified.
    const monoReactant = elemsAreSingle(a) && !elemsAreSingle(b) ? a
      : (elemsAreSingle(b) && !elemsAreSingle(a) ? b : null);
    if (monoReactant) {
      const baseReactant = monoReactant === a ? b : a;
      const monoElem = Object.keys(monoReactant.elements)[0];
      if (HALOGENS.has(monoElem) && _isBase(baseReactant)) {
        const metal = _cation(baseReactant.elements) || 'M';
        const halide = `${metal}${monoElem}`;
        const oxyhalide = `${metal}${monoElem}O`;
        return _respond('disproportionation', [halide, oxyhalide, 'H2O'],
          `${monoElem}2 + ${baseReactant.formula} -> ${halide} + ${oxyhalide} + H2O`,
          `Disproportionation: the halogen ${monoElem}2 is simultaneously oxidised and reduced (e.g. ${monoElem}2 + 2OH- -> ${monoElem}- + ${monoElem}O- + H2O), a hallmark redox of a single species.`);
      }
    }

    // Single replacement: free element + compound
    if (elemsAreSingle(a) && !elemsAreSingle(b)) {
      return _singleReplace(a, b);
    }
    if (elemsAreSingle(b) && !elemsAreSingle(a)) {
      return _singleReplace(b, a);
    }

    // Both compounds: specific patterns first, then generic double-replace.
    if (elemsAreCompound(a) && elemsAreCompound(b)) {

      // Precipitation: two ionic salts forming an insoluble salt.
      const aIonic = _hasMetal(cA);
      const bIonic = _hasMetal(cB);
      if (aIonic && bIonic) {
        const cationA = _cation(cA), anionA = _anion(cA);
        const cationB = _cation(cB), anionB = _anion(cB);
        if (cationA && cationB && anionA && anionB) {
          const p1 = `${cationA}${anionB}`, p2 = `${cationB}${anionA}`;
          if (INSOLUBLE_SALTS.has(p1) || INSOLUBLE_SALTS.has(p2)) {
            const ppt = INSOLUBLE_SALTS.has(p1) ? p1 : p2;
            return _respond('precipitation', [p1, p2],
              `${a.formula} + ${b.formula} -> ${p1} + ${p2}`,
              `Precipitation: the insoluble salt ${ppt} forms as a solid from two soluble aqueous salts (a type of double displacement metathesis).`);
          }
        }
      }

      // Complexation: metal species + ligand (ligand must be a compound, not a free element).
      if ((aIonic || bIonic) && elemsAreCompound(a) && elemsAreCompound(b)) {
        const metalP = aIonic ? a : b;
        const otherP = aIonic ? b : a;
        const ligF = (otherP.formula || '').toLowerCase();
        if (LIGANDS.has(ligF) || LIGANDS.has(ligF.replace(/[()]/g, ''))) {
          const mSym = _cation(metalP.elements) || 'M';
          const lSym = (otherP.formula || '').replace(/[()]/g, '');
          return _respond('complexation (coordination)', [`[${mSym}(${lSym})n]`],
            `${metalP.formula} + ${otherP.formula} -> [${mSym}(${lSym})n]`,
            `Complexation: the Lewis base ligand ${lSym} donates a lone pair to the metal ${mSym}, forming a coordination complex.`);
        }
      }

      // Hydrolysis: organic compound + H2O. Must run before organic-addition rules
      // (which would otherwise mis-classify ester/amide/halide + H2O as electrophilic
      // addition of H2O to an alkene).
      const aLower = (a.formula || '').toLowerCase();
      const bLower = (b.formula || '').toLowerCase();
      const h2oP = aLower === 'h2o' ? a : bLower === 'h2o' ? b : null;
      const otherP = h2oP ? (h2oP === a ? b : a) : null;
      if (h2oP && otherP) {
        const oc = otherP.elements;
        const hasCO = (oc.C || 0) > 0 && (oc.O || 0) > 0;
        const hasN = (oc.N || 0) > 0;
        const hasHal = ['F', 'Cl', 'Br', 'I'].some(h => oc[h] > 0);
        if (hasCO && hasN) {
          return _respond('hydrolysis', ['carboxylic acid', 'amine'],
            `${otherP.formula} + H2O -> R-COOH + R'-NH2`,
            'Hydrolysis of an amide with water (acid- or base-catalysed) cleaves the C–N bond to give a carboxylic acid and an amine.');
        }
        if (hasCO) {
          return _respond('hydrolysis', ['carboxylic acid', 'alcohol'],
            `${otherP.formula} + H2O -> R-COOH + R'-OH`,
            'Hydrolysis of an ester with water (acid-catalysed) cleaves the ester C–O bond to give a carboxylic acid and an alcohol.');
        }
        if (hasN && /cn/i.test(otherP.formula)) {
          return _respond('hydrolysis', ['carboxylic acid', 'NH3'],
            `${otherP.formula} + 2H2O -> R-COOH + NH3`,
            'Hydrolysis of a nitrile with water converts the C≡N group to a carboxylic acid and ammonia.');
        }
        if (hasHal) {
          return _respond('hydrolysis', ['alcohol/hydroxide', 'HX'],
            `${otherP.formula} + H2O -> R-OH + HX`,
            'Hydrolysis of an alkyl (or acyl) halide with water replaces the halogen with a hydroxyl group, releasing HX.');
        }
      }

      // Organic nucleophilic / electrophilic substitution and addition.
      const aOrg = _hasCH(cA), bOrg = _hasCH(cB);
      const orgP = aOrg ? a : bOrg ? b : null;
      const reP = aOrg ? b : bOrg ? a : null;
      if (orgP && reP) {
        const rc = reP.elements;
        const reL = (reP.formula || '').toLowerCase();
        const reSingle = elemsAreSingle(reP);
        const reElem = reSingle ? Object.keys(rc)[0] : null;

        // Aromatic ring → electrophilic substitution
        if (/benzen|arene|ph|toluen|anilin|phenol/i.test(orgP.formula) && (HALOGENS.has(reElem) || /h2so4|hno3|so3|no2|br2|cl2/i.test(reL))) {
          return _respond('electrophilic substitution', ['substituted arene', 'HX'],
            `${orgP.formula} + ${reP.formula} -> Ar-X + HX`,
            `Electrophilic substitution on an aromatic ring: an electrophile replaces a ring H (e.g. benzene halogenation/nitration/sulphonation).`);
        }

        // Alkyl halide + base/heat → elimination
        const hasHal = ['F', 'Cl', 'Br', 'I'].some(h => cA[h] > 0 || cB[h] > 0);
        const baseL = /^(naoh|koh|nah|kh|[a-z]*oh)$/i.test(reL);
        if (hasHal && (baseL || /heat|Δ|warm/i.test(cleaned))) {
          return _respond('elimination (E1/E2)', ['alkene', 'HX'],
            `${orgP.formula} + ${reP.formula} -> R-CH=CH-R' + HX`,
            'Elimination removes H and a leaving group (halide) from adjacent carbons to form an alkene.');
        }

        // Nucleophilic substitution
        if (hasHal && /^(h2o|oh-|cn|nh3|nh2-|i-|br-|roh)$/i.test(reL)) {
          return _respond('nucleophilic substitution (SN1/SN2)', ['substituted product', 'HX'],
            `${orgP.formula} + ${reP.formula} -> R-Nu + HX`,
            'Nucleophilic substitution swaps the leaving group (halide) for a nucleophile.');
        }

        // Electrophilic / nucleophilic addition to alkene/alkyne
        if (reSingle && HALOGENS.has(reElem)) {
          return _respond('electrophilic addition', ['vicinal dihalide'],
            `${orgP.formula} + ${reP.formula} -> R-CHX-CHX-R'`,
            'Halogen adds across a C=C / C≡C π-bond (electrophilic addition) to give a vicinal dihalide.');
        }
        if (/^(h2o|hcl|hbr|h2|h2so4|h3po4)$/i.test(reL)) {
          return _respond('electrophilic addition', ['addition product'],
            `${orgP.formula} + ${reP.formula} -> R-C-R'`,
            'The reagent adds across an unsaturated π-bond (electrophilic addition; Markovnikov regiochemistry for HX/H2O).');
        }
        if (/^(nh3|cn-|oh-|roh|h2)$/i.test(reL)) {
          return _respond('nucleophilic addition', ['addition product'],
            `${orgP.formula} + ${reP.formula} -> R-C-Nu`,
            'A nucleophile forms a σ-bond with an electron-deficient C=O or C≡N / C=C.');
        }
      }

      // Generic double replacement fallback
      if (!_hasMetal(cA) === false || !_hasMetal(cB) === false) {
        return _doubleReplace(a, b);
      }
    }
  }

  // -- 3.5) Additional organic / complexation / precipitation / synthesis types
  const extra = _reactsExtra(parsedList, parts, cleaned);
  if (extra) return extra;

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

// Insoluble salts (used to flag precipitation within double displacement).
const INSOLUBLE_SALTS = new Set([
  'AgCl', 'AgBr', 'AgI', 'PbCl2', 'PbBr2', 'PbI2', 'Hg2Cl2',
  'BaSO4', 'PbSO4', 'Ag2SO4', 'SrSO4',
  'CaCO3', 'BaCO3', 'MgCO3', 'Ag2CO3', 'PbCO3', 'FeCO3', 'CuCO3',
  'Ca3(PO4)2', 'Ba3(PO4)2', 'Ag3PO4', 'FePO4',
  'Fe(OH)3', 'Al(OH)3', 'Cu(OH)2', 'Zn(OH)2', 'Mg(OH)2', 'Fe(OH)2', 'Pb(OH)2', 'Ni(OH)2', 'Co(OH)2',
  'Ag2S', 'PbS', 'CuS', 'FeS', 'ZnS', 'CdS', 'SnS', 'HgS',
]);

// Neutral/monodentate or anionic ligands commonly found in coordination complexes.
const LIGANDS = new Set(['nh3', 'h2o', 'co', 'cn', 'cn-', 'cl', 'br', 'i', 'oh', 'scn', 'oxalate', 'en']);

function _isLigand(p) {
  const f = (p.formula || '').toLowerCase().replace(/[0-9]/g, '').replace(/[()]/g, '');
  return LIGANDS.has(f);
}

/**
 * Reaction classification for patterns the main predict() switch does not
 * already own: 3+-species synthesis, disproportionation, complexation,
 * hydrolysis, organic addition/substitution/elimination/polymerisation/
 * condensation, precipitation, and is omerisation/rearrangement hints.
 *
 * Returns a formatted string (via _respond) or null to let the caller
 * fall through to the generic fallback.
 *
 * @param {Array} parsedList - parsed reactants
 * @param {string[]} parts - raw reactant tokens
 * @param {string} cleaned - joined/normalised input (lowercased copy available)
 * @returns {string|null}
 */
function _reactsExtra(parsedList, parts, cleaned) {
  const n = parsedList.length;
  const singleElems = parsedList.map((p) => elemsAreSingle(p));
  const cleanedL = cleaned.toLowerCase();

  // ── 30) Autocatalysis (already caught in the named-conditions block) ──

  // ── 1) Synthesis / combination of 3+ simple substances ───────────────────
  // e.g. Na + Cl2 + O2  or  H2 + N2 + O2  -> a ternary/simple compound.
  if (n >= 3 && singleElems.every(Boolean)) {
    const syms = [];
    for (const p of parsedList) {
      for (const s of _elements(p.elements)) syms.push(s);
    }
    const product = syms.join('');
    return _respond('synthesis (combination)', [product],
      `${parts.join(' + ')} -> ${product}`,
      'Multiple simple substances combine directly to form a more complex stoichiometric product (combination reaction, usually exothermic). The exact formula depends on oxidation states.');
  }

  // ── 2) Disproportionation: now handled in the main 2-reactant block ──

  // ── 26) Complexation (coordination): metal species + ligand ──────────────
  // e.g. Fe3+ + 6 NH3 -> [Fe(NH3)6]3+ ;  Cu2+ + 4 H2O -> [Cu(H2O)4]2+
  // Guard: diatomic elements (Cl2, Br2, I2, O2, N2, H2) are NOT ligands.
  const _isDiatomic = (p) => {
    const keys = Object.keys(p.elements);
    return keys.length === 1 && (p.elements[keys[0]] >= 2);
  };
  if (n === 2) {
    const [a, b] = parsedList;
    const hasMetal = _hasMetal(a.elements) || _hasMetal(b.elements);
    const aIsDi = _isDiatomic(a), bIsDi = _isDiatomic(b);
    const ligA = (a.formula || '').toLowerCase();
    const ligB = (b.formula || '').toLowerCase();
    const aIsLig = !aIsDi && (LIGANDS.has(ligA) || LIGANDS.has(ligA.replace(/[()]/g, '')));
    const bIsLig = !bIsDi && (LIGANDS.has(ligB) || LIGANDS.has(ligB.replace(/[()]/g, '')));
    if (hasMetal && (aIsLig || bIsLig)) {
      const metalP = _hasMetal(a.elements) ? a : b;
      const ligandP = aIsLig ? a : b;
      const mSym = _cation(metalP.elements) || 'M';
      const lSym = (ligandP.formula || '').replace(/[()]/g, '');
      return _respond('complexation (coordination)', [`[${mSym}(${lSym})n]`],
        `${metalP.formula} + ${ligandP.formula} -> [${mSym}(${lSym})n]`,
        `Complexation: the Lewis base ligand ${lSym} donates a lone pair to the metal ${mSym}, forming a coordination complex. n is set by the metal's coordination number.`);
    }
  }

  // ── 28) Hydrolysis: ester/amide/nitrile + H2O → acid + alcohol/amine ────
  if (n === 2) {
    const [a, b] = parsedList;
    const h2oP = (a.formula || '').toLowerCase() === 'h2o' ? a : (b.formula || '').toLowerCase() === 'h2o' ? b : null;
    const other = h2oP ? (h2oP === a ? b : a) : null;
    if (h2oP && other) {
      const c = other.elements;
      const hasCO = (c.C || 0) > 0 && (c.O || 0) > 0;
      const hasN = (c.N || 0) > 0;
      const hasHalide = ['F', 'Cl', 'Br', 'I'].some((h) => c[h] > 0);
      if (hasCO && hasN) {
        return _respond('hydrolysis', ['carboxylic acid', 'amine'],
          `${other.formula} + H2O -> R-COOH + R'-NH2`,
          `Hydrolysis of an amide with water (acid- or base-catalysed) cleaves the C–N bond to give a carboxylic acid and an amine.`);
      }
      if (hasCO) {
        return _respond('hydrolysis', ['carboxylic acid', 'alcohol'],
          `${other.formula} + H2O -> R-COOH + R'-OH`,
          `Hydrolysis of an ester with water (acid-catalysed) cleaves the ester C–O bond to give a carboxylic acid and an alcohol.`);
      }
      if (hasN && /cn/i.test(other.formula)) {
        return _respond('hydrolysis', ['carboxylic acid', 'NH3'],
          `${other.formula} + 2H2O -> R-COOH + NH3`,
          `Hydrolysis of a nitrile with water converts the C≡N group to a carboxylic acid and ammonia.`);
      }
      if (hasHalide) {
        return _respond('hydrolysis', ['alcohol/hydroxide', 'HX'],
          `${other.formula} + H2O -> R-OH + HX`,
          `Hydrolysis of an alkyl (or acyl) halide with water replaces the halogen with a hydroxyl group, releasing HX.`);
      }
    }
  }

  // ── 18/19/20/21/22) Organic addition / substitution / elimination ────────
  if (n === 2) {
    const [a, b] = parsedList;
    const aOrg = _hasCH(a.elements);
    const bOrg = _hasCH(b.elements);
    const orgP = aOrg ? a : bOrg ? b : null;
    const reP = aOrg ? b : bOrg ? a : null;
    if (orgP && reP) {
      const oc = orgP.elements;
      const rc = reP.elements;
      const reL = (reP.formula || '').toLowerCase();
      const reSingle = elemsAreSingle(reP);
      const reElem = reSingle ? Object.keys(rc)[0] : null;

      // Aromatic ring → electrophilic substitution (e.g. benzene + Br2 with FeBr3)
      if (/benzen|arene|ph|toluen|anilin|phenol/i.test(orgP.formula) && (HALOGENS.has(reElem) || /h2so4|hno3|so3|no2|br2|cl2/i.test(reL))) {
        return _respond('electrophilic substitution', ['substituted arene', 'HX'],
          `${orgP.formula} + ${reP.formula} -> Ar-X + HX`,
          `Electrophilic substitution on an aromatic ring: an electrophile replaces a ring H (e.g. benzene halogenation/nitration/sulphonation, usually catalysed by a Lewis acid).`);
      }

      // Alkyl halide (C,H,halogen) + base/heat → elimination (E1/E2)
      const hasHal = ['F', 'Cl', 'Br', 'I'].some((h) => oc[h] > 0);
      const baseL = /^(naoh|koh|nah|kh|[a-z]*oh)$/i.test(reL);
      if (hasHal && (baseL || /heat|Δ|warm/i.test(cleanedL))) {
        return _respond('elimination (E1/E2)', ['alkene', 'HX'],
          `${orgP.formula} + ${reP.formula} -> R-CH=CH-R' + HX`,
          'Elimination removes H and a leaving group (halide) from adjacent carbons to form an alkene; a strong base favour E2, weak base/heat favours E1.');
      }

      // Nucleophilic substitution (SN1/SN2): alkyl halide + nucleophile
      if (hasHal && /^(h2o|oh-|cn|nh3|nh2-|i-|br-|roh)$/i.test(reL)) {
        return _respond('nucleophilic substitution (SN1/SN2)', ['substituted product', 'HX'],
          `${orgP.formula} + ${reP.formula} -> R-Nu + HX`,
          'Nucleophilic substitution swaps the leaving group (halide) for a nucleophile — SN2 (one step, backside) for 1°/2° substrates, SN1 (carbocation) for 3°.');
      }

      // Electrophilic / nucleophilic addition to an alkene/alkyne
      if (reSingle && HALOGENS.has(reElem)) {
        return _respond('electrophilic addition', ['vicinal dihalide'],
          `${orgP.formula} + ${reP.formula} -> R-CHX-CHX-R'`,
          'Halogen adds across a C=C / C≡C π-bond (electrophilic addition) to give a vicinal dihalide.');
      }
      if (/^(h2o|hcl|hbr|h2|h2so4|h3po4)$/i.test(reL)) {
        return _respond('electrophilic addition', ['addition product'],
          `${orgP.formula} + ${reP.formula} -> R-C-R'`,
          'The reagent adds across an unsaturated π-bond (electrophilic addition; Markovnikov regiochemistry for HX/H2O).');
      }
      if (/^(nh3|cn-|oh-|roh|h2)$/i.test(reL)) {
        return _respond('nucleophilic addition', ['addition product'],
          `${orgP.formula} + ${reP.formula} -> R-C-Nu`,
          'A nucleophile forms a σ-bond with an electron-deficient C=O or C≡N / C=C, giving the addition product.');
      }
    }
  }

  // ── 25) Polymerisation: now handled in main predict() ────────────────

  // ── 27) Condensation: two organics losing a small molecule → dimer ──────
  if (n === 2 && _hasCH(parsedList[0].elements) && _hasCH(parsedList[1].elements)) {
    const hasOH = parsedList.some((p) => (p.elements.O || 0) >= 1);
    const hasNH = parsedList.some((p) => (p.elements.N || 0) >= 1);
    if (hasOH || hasNH) {
      return _respond('condensation', ['condensed product', 'H2O'],
        `${parts.join(' + ')} -> dimer + H2O`,
        'Condensation joins two molecules with the concurrent loss of a small molecule (water or alcohol) — e.g. esterification, amide formation, glycoside formation.');
    }
  }

  // ── 6) Precipitation: two ionic salts forming an insoluble salt ─────────
  if (n === 2) {
    const [a, b] = parsedList;
    const aIonic = _hasMetal(a.elements);
    const bIonic = _hasMetal(b.elements);
    if (aIonic && bIonic) {
      const cA2 = _cation(a.elements);
      const aA2 = _anion(a.elements);
      const cB2 = _cation(b.elements);
      const aB2 = _anion(b.elements);
      if (cA2 && cB2 && aA2 && aB2) {
        const p1 = `${cA2}${aB2}`;
        const p2 = `${cB2}${aA2}`;
        if (INSOLUBLE_SALTS.has(p1) || INSOLUBLE_SALTS.has(p2)) {
          const ppt = INSOLUBLE_SALTS.has(p1) ? p1 : p2;
          return _respond('precipitation', [p1, p2],
            `${a.formula} + ${b.formula} -> ${p1} + ${p2}`,
            `Precipitation: the insoluble salt ${ppt} forms as a solid from two soluble aqueous salts (a type of double displacement metathesis).`);
        }
      }
    }
  }

  // ── 23/24) Isomerisation/rearrangement: now handled in main predict() ──

  return null;
}

function _singleReplace(element, compound) {
  const metalSym = _elements(element.elements)[0];
  const metalCharge = _getMetalCharge(metalSym);

  // Acid-metal single replacement: Metal + Acid -> Salt + H2
  if (_isAcid(compound)) {
    const nH = compound.elements.H;
    const anionFormula = _buildFormulaFromElements(compound.elements, new Set(['H']));
    const anionCharge = nH;
    const saltFormula = _buildSaltFormula(metalSym, metalCharge, anionFormula, anionCharge);

    const metalRank = _activityRank(metalSym);
    const hRank = _activityRank('H');
    // Oxidising acids (HNO3, hot concentrated H2SO4) react even with metals below H.
    const isOxidisingAcid = /\bh?no3\b/i.test(compound.formula) || /\bh2so4/i.test(compound.formula);
    if (metalRank !== -1 && hRank !== -1 && metalRank > hRank && !isOxidisingAcid) {
      return _respond('no reaction', [], `${metalSym} + ${compound.formula} -> no reaction`,
        `${metalSym} is below H in the activity series, so no displacement occurs.`);
    }
    if (isOxidisingAcid) {
      return _respond('single replacement (redox / oxidising acid)', [`${metalSym} salt`, 'NO2 or NO', 'H2O'],
        `${metalSym} + ${compound.formula} -> ${metalSym} salt + NO2/NO + H2O`,
        `${compound.formula} is an oxidising acid: even metals below H in the activity series (like ${metalSym}) dissolve, being oxidised while the nitrate is reduced to NO2 or NO (no H2 gas forms).`);
    }

    // Brute force balancing for a Metal + b Acid -> c Salt + d H2
    let saltElements = null;
    try { saltElements = parseCompound(saltFormula).elements; } catch (_) { saltElements = null; }
    if (!saltElements) {
      return _respond('single replacement (redox)', [saltFormula, 'H2'],
        `${metalSym} + ${compound.formula} -> ${saltFormula} + H2`,
        `Single replacement: ${metalSym} is more reactive than H (activity series), so it displaces H from the acid to form ${saltFormula} and hydrogen gas.`);
    }
    const acidElements = compound.elements;
    const metalElements = element.elements;
    const h2Elements = { H: 2 };

    let best = null;
    let bestSum = Infinity;
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        for (let c = 1; c <= 12; c++) {
          for (let d = 1; d <= 12; d++) {
            const allElems = new Set([
              ...Object.keys(metalElements),
              ...Object.keys(acidElements),
              ...Object.keys(saltElements),
              ...Object.keys(h2Elements),
            ]);
            let ok = true;
            for (const el of allElems) {
              const left = (metalElements[el] || 0) * a + (acidElements[el] || 0) * b;
              const right = (saltElements[el] || 0) * c + (h2Elements[el] || 0) * d;
              if (left !== right) { ok = false; break; }
            }
            if (ok) {
              const sum = a + b + c + d;
              if (sum < bestSum) {
                bestSum = sum;
                best = [a, b, c, d];
              }
            }
          }
        }
      }
    }

    if (best) {
      const [a, b, c, d] = best;
      const leftMetal = a === 1 ? metalSym : `${a} ${metalSym}`;
      const leftAcid = b === 1 ? compound.formula : `${b} ${compound.formula}`;
      const rightSalt = c === 1 ? saltFormula : `${c} ${saltFormula}`;
      const rightH2 = d === 1 ? 'H2' : `${d} H2`;
      const balancedEquation = `${leftMetal} + ${leftAcid} -> ${rightSalt} + ${rightH2}`;
      return _respond('single replacement (redox)', [saltFormula, 'H2'], balancedEquation,
        `Single replacement: ${metalSym} is more reactive than H (activity series), so it displaces H from the acid to form ${saltFormula} and hydrogen gas.`);
    }
    // Fallback if no balance found
    const fallbackEq = `${metalSym} + ${compound.formula} -> ${saltFormula} + H2`;
    return _respond('single replacement (redox)', [saltFormula, 'H2'], fallbackEq,
      `Single replacement: ${metalSym} is more reactive than H (activity series), so it displaces H from the acid to form ${saltFormula} and hydrogen gas.`);
  }

  // Salt case: free metal + salt -> new salt + displaced metal
  const targetCation = _cation(compound.elements);
  if (targetCation) {
    let anionFormula2 = _buildFormulaFromElements(compound.elements, new Set([targetCation]));
    if (!anionFormula2) {
      return _respond('single replacement (redox)', ['?'],
        `${metalSym} + compound -> ?`,
        'Single replacement (redox) reaction. The free element may displace another from its compound if it is higher in the activity series.');
    }
    // Handle total anion part that may contain multiple empirical units (e.g., AlCl3 -> Cl3)
    // Reduce to empirical anion formula and derive per-unit charge
    let anionCharge;
    let empiricalAnion = anionFormula2;
    try {
      const parsedTotal = parseCompound(anionFormula2);
      if (parsedTotal.isValid) {
        const anionElems = parsedTotal.elements;
        const counts = Object.values(anionElems);
        let gEmp = counts[0];
        for (let i = 1; i < counts.length; i++) gEmp = _gcd(gEmp, counts[i]);
        const targetCount = compound.elements[targetCation] || 1;
        const targetChg = _getMetalCharge(targetCation);
        const totalPos = targetChg * targetCount;
        if (gEmp > 1 && totalPos % gEmp === 0) {
          anionCharge = totalPos / gEmp;
          // build empirical formula
          let emp = '';
          for (const [s, cnt] of Object.entries(anionElems)) {
            const rc = cnt / gEmp;
            emp += s + (rc > 1 ? String(rc) : '');
          }
          empiricalAnion = emp;
        } else {
          anionCharge = targetChg;
        }
      } else {
        anionCharge = _getMetalCharge(targetCation);
      }
    } catch (_) {
      anionCharge = _getMetalCharge(targetCation);
    }
    // If still not set, fallback to targetCharge
    if (anionCharge === undefined) anionCharge = _getMetalCharge(targetCation);

    const newSaltFormula = _buildSaltFormula(metalSym, metalCharge, empiricalAnion, anionCharge);

    const metalRank = _activityRank(metalSym);
    const targetRank = _activityRank(targetCation);
    if (metalRank !== -1 && targetRank !== -1 && metalRank > targetRank) {
      return _respond('no reaction', [], `${metalSym} + ${compound.formula} -> no reaction`,
        `${metalSym} is below ${targetCation} in the activity series, so no displacement occurs.`);
    }

    // Brute force balance: a Metal + b OldSalt -> c NewSalt + d TargetMetal
    let newSaltElements = null;
    let oldSaltElements = compound.elements;
    try { newSaltElements = parseCompound(newSaltFormula).elements; } catch (_) { newSaltElements = null; }
    if (!newSaltElements) {
      return _respond('single replacement (redox)', [newSaltFormula, targetCation],
        `${metalSym} + ${compound.formula} -> ${newSaltFormula} + ${targetCation}`,
        `Single replacement: ${metalSym} is more reactive than ${targetCation} (activity series), so it displaces ${targetCation} from its compound.`);
    }
    const metalElements = element.elements;
    const targetElements = { [targetCation]: 1 };

    let best = null;
    let bestSum = Infinity;
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        for (let c = 1; c <= 12; c++) {
          for (let d = 1; d <= 12; d++) {
            const allElems = new Set([
              ...Object.keys(metalElements),
              ...Object.keys(oldSaltElements),
              ...Object.keys(newSaltElements),
              ...Object.keys(targetElements),
            ]);
            let ok = true;
            for (const el of allElems) {
              const left = (metalElements[el] || 0) * a + (oldSaltElements[el] || 0) * b;
              const right = (newSaltElements[el] || 0) * c + (targetElements[el] || 0) * d;
              if (left !== right) { ok = false; break; }
            }
            if (ok) {
              const sum = a + b + c + d;
              if (sum < bestSum) { bestSum = sum; best = [a, b, c, d]; }
            }
          }
        }
      }
    }

    if (best) {
      const [a, b, c, d] = best;
      const leftMetal = a === 1 ? metalSym : `${a} ${metalSym}`;
      const leftSalt = b === 1 ? compound.formula : `${b} ${compound.formula}`;
      const rightNew = c === 1 ? newSaltFormula : `${c} ${newSaltFormula}`;
      const rightTarget = d === 1 ? targetCation : `${d} ${targetCation}`;
      const balancedEquation = `${leftMetal} + ${leftSalt} -> ${rightNew} + ${rightTarget}`;
      return _respond('single replacement (redox)', [newSaltFormula, targetCation], balancedEquation,
        `Single replacement: ${metalSym} is more reactive than ${targetCation} (activity series), so it displaces ${targetCation} from its compound.`);
    }

    const simpleEq = `${metalSym} + ${compound.formula} -> ${newSaltFormula} + ${targetCation}`;
    return _respond('single replacement (redox)', [newSaltFormula, targetCation], simpleEq,
      `Single replacement: ${metalSym} is more reactive than ${targetCation} (activity series), so it displaces ${targetCation} from its compound.`);
  }

  return _respond('single replacement (redox)', ['?'],
    `${metalSym} + compound -> ?`,
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
  const mChg = _getMetalCharge(metalSym);
  const xChg = chargeMap[nonMetalSym] || 1;

  // Product formula: Metal_xNonMetal_y where mChg * y = xChg * x (charge balance).
  // The conventional formula writes the cation first with the SMALLER subscript.
  // Solving: simplest integer ratio is x = xChg/gcd, y = mChg/gcd.
  //   Na+ + Cl-  : mChg=1, xChg=1 → x=1, y=1 → NaCl ✓
  //   Mg2+ + O2- : mChg=2, xChg=2 → x=1, y=1 → MgO ✓
  //   Al3+ + Br- : mChg=3, xChg=1 → x=1, y=3 → AlBr3 ✓
  const gd = _gcd(mChg, xChg);
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
