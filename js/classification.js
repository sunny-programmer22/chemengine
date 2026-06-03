/* ============================================================
   CLASSIFICATION.js — Shared Classification & Formula Utilities
   Extracted from chem-predict.js for cross-module use.
   ============================================================ */

/* ==================== DATA TABLES ==================== */

const VALENCY = {
  'H':  [1],                    'He': [0],
  'Li': [1],   'Be': [2],                                      'B':  [3],    'C':  [-4,2,4],  'N':  [-3,1,2,3,4,5], 'O':  [-2,-1], 'F':  [-1],
  'Na': [1],   'Mg': [2],                                      'Al': [3],    'Si': [-4,2,4],  'P':  [-3,1,3,5],     'S':  [-2,2,4,6], 'Cl': [-1,1,3,5,7],
  'K':  [1],   'Ca': [2],                     'Sc': [3],       'Ti': [2,3,4],'V':  [2,3,4,5],  'Cr': [2,3,6],        'Mn': [2,3,4,6,7], 'Fe': [2,3],
  'Co': [2,3], 'Ni': [2,3], 'Cu': [1,2],     'Zn': [2],       'Ga': [3],    'Ge': [2,4],    'As': [-3,3,5],       'Se': [-2,4,6], 'Br': [-1,1,3,5,7],
  'Rb': [1],   'Sr': [2],                     'Y':  [3],       'Zr': [4],    'Nb': [3,5],    'Mo': [3,4,6],        'Tc': [4,7],    'Ru': [3,4],
  'Rh': [3],   'Pd': [2,4],  'Ag': [1],       'Cd': [2],       'In': [3],    'Sn': [2,4],    'Sb': [3,5],          'Te': [-2,4,6], 'I':  [-1,1,3,5,7],
  'Cs': [1],   'Ba': [2],                     'La': [3],       'Hf': [4],    'Ta': [5],      'W':  [4,6],          'Re': [4,7],    'Os': [3,4],
  'Ir': [3,4], 'Pt': [2,4],  'Au': [1,3],     'Hg': [1,2],     'Tl': [1,3],  'Pb': [2,4],    'Bi': [3,5],
  'Ra': [2],   'Ac': [3],                     'Ce': [3,4],     'Th': [4],    'U':  [3,4,5,6]
};

const POLYATOMIC_IONS = {
  'NH4':   { charge:  1 },  'OH':    { charge: -1 },
  'NO3':   { charge: -1 },  'NO2':   { charge: -1 },
  'ClO':   { charge: -1 },  'ClO2':  { charge: -1 },
  'ClO3':  { charge: -1 },  'ClO4':  { charge: -1 },
  'CO3':   { charge: -2 },  'HCO3':  { charge: -1 },
  'SO4':   { charge: -2 },  'SO3':   { charge: -2 },
  'PO4':   { charge: -3 },  'HPO4':  { charge: -2 },
  'H2PO4': { charge: -1 },  'C2O4':  { charge: -2 },
  'CH3COO':{ charge: -1 },  'HCOO':  { charge: -1 },
  'MnO4':  { charge: -1 },  'Cr2O7': { charge: -2 },
  'CrO4':  { charge: -2 },  'CN':    { charge: -1 },
  'SCN':   { charge: -1 },  'O2':    { charge: -2 },
  'S2O3':  { charge: -2 },  'BO3':   { charge: -3 },
  'SiO3':  { charge: -2 },  'AsO4':  { charge: -3 },
  'SbO4':  { charge: -3 },  'SeO4':  { charge: -2 },
  'IO3':   { charge: -1 },  'BrO3':  { charge: -1 },
};

const SOLUBILITY = {
  alwaysSoluble: ['Li','Na','K','Rb','Cs','NH4','NO3','NO2','ClO4','ClO3','CH3COO','HCOO','C2H3O2'],
  usuallySoluble: {
    'Cl': ['Ag','Pb','Hg','Cu'],
    'Br': ['Ag','Pb','Hg'],
    'I':  ['Ag','Pb','Hg'],
    'SO4':['Ba','Pb','Sr','Ca','Ag','Ra'],
    'F':  ['Mg','Ca','Sr','Ba','Pb'],
  },
  usuallyInsoluble: {
    'OH':  ['Li','Na','K','Rb','Cs','NH4','Ba','Sr','Ca','Tl'],
    'CO3': ['Li','Na','K','Rb','Cs','NH4'],
    'PO4': ['Li','Na','K','Rb','Cs','NH4'],
    'S':   ['Li','Na','K','Rb','Cs','NH4','Mg','Ca','Sr','Ba'],
    'SO3': ['Li','Na','K','Rb','Cs','NH4'],
    'C2O4':['Li','Na','K','Rb','Cs','NH4'],
  }
};

const GROUP1 = ['Li','Na','K','Rb','Cs','Fr'];
const GROUP2 = ['Be','Mg','Ca','Sr','Ba','Ra'];
const HALOGENS = ['F','Cl','Br','I'];
const NOBLE_GASES = ['He','Ne','Ar','Kr','Xe','Rn'];
const METALS_LIST = ['Li','Na','K','Rb','Cs','Fr','Be','Mg','Ca','Sr','Ba','Ra',
  'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Al','Ga','Ge',
  'Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn',
  'Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','La','Ce','Th','U'];

const MONATOMIC_ANION_CHARGES = { 'H':-1,'F':-1,'Cl':-1,'Br':-1,'I':-1,'O':-2,'S':-2,'N':-3,'P':-3,'C':-4 };

/* ==================== FORMULA PARSING ==================== */

function parseCompoundElements(formula) {
  const stack = [{}];
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === '(') { stack.push({}); i++; }
    else if (formula[i] === ')') {
      i++; let numStr = '';
      while (i < formula.length && /\d/.test(formula[i])) { numStr += formula[i]; i++; }
      const mult = numStr === '' ? 1 : parseInt(numStr);
      const top = stack.pop();
      for (const [el, cnt] of Object.entries(top))
        stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt * mult;
    } else if (/[A-Z]/.test(formula[i])) {
      let el = formula[i]; i++;
      while (i < formula.length && /[a-z]/.test(formula[i])) { el += formula[i]; i++; }
      let numStr = '';
      while (i < formula.length && /\d/.test(formula[i])) { numStr += formula[i]; i++; }
      const cnt = numStr === '' ? 1 : parseInt(numStr);
      stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt;
    } else { i++; }
  }
  return stack[0];
}

function hasElement(formula, el) { return parseCompoundElements(formula).hasOwnProperty(el); }

function countAtoms(formula) {
  return Object.values(parseCompoundElements(formula)).reduce((a, b) => a + b, 0);
}

function containsMetal(formula) {
  for (const m of METALS_LIST)
    if (hasElement(formula, m)) return true;
  return false;
}

function getFirstMetal(formula) {
  const els = parseCompoundElements(formula);
  for (const m of METALS_LIST)
    if (els[m]) return m;
  return null;
}

function getHalogen(formula) {
  const els = parseCompoundElements(formula);
  for (const h of HALOGENS)
    if (els[h]) return h;
  return null;
}

/* ==================== VALIDATION ==================== */

function validateFormula(formula) {
  if (!formula || formula.trim().length === 0) return { valid: false, error: 'Formula is empty.' };
  /* Strip hydrate suffix (e.g. .5H2O or ·5H2O) before validation */
  const base = formula.replace(/[·.]\d*H2O$/i, '');
  if (/[^A-Za-z0-9()\]\[\-=≡#]/.test(base.replace(/[\d]/g, ''))) return { valid: false, error: 'Contains invalid characters.' };
  let depth = 0;
  const openStack = [];
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (ch === '(' || ch === '[') { depth++; openStack.push(i); }
    if (ch === ')' || ch === ']') {
      depth--;
      if (depth < 0) return { valid: false, error: 'Unmatched closing parenthesis.' };
      const openPos = openStack.pop();
      const inner = formula.substring(openPos + 1, i);
      if (/^[0-9]*$/.test(inner)) return { valid: false, error: 'Empty parentheses.' };
    }
  }
  if (depth !== 0) return { valid: false, error: 'Unmatched opening parenthesis.' };
  const clean = formula.replace(/[-=≡#]/g, '');
  const els = parseCompoundElements(clean);
  if (Object.keys(els).length === 0) return { valid: false, error: 'No elements recognized.' };
  const validSymbols = ['H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm','Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'];
  for (const el of Object.keys(els)) {
    if (!validSymbols.includes(el)) return { valid: false, error: 'Unknown element: ' + el };
  }
  return { valid: true };
}

/* ==================== VALENCY HELPERS ==================== */

function getValency(el) {
  return VALENCY[el] || null;
}

function getOxidationState(metal) {
  const common = {'Li':1,'Na':1,'K':1,'Rb':1,'Cs':1,'Be':2,'Mg':2,'Ca':2,'Sr':2,'Ba':2,
    'Al':3,'Fe':3,'Cu':2,'Zn':2,'Ag':1,'Au':3,'Hg':2,'Pb':2,'Sn':2,'Mn':2,'Co':2,'Ni':2};
  return common[metal] || 2;
}

function getPolyatomicCharge(poly) {
  return POLYATOMIC_IONS[poly] ? POLYATOMIC_IONS[poly].charge : null;
}

function predictIonicFormula(cation, cationCharge, anion, anionCharge) {
  if (!cation || !anion) return null;
  const l = lcm(Math.abs(cationCharge), Math.abs(anionCharge));
  const cIdx = l / Math.abs(cationCharge);
  const aIdx = l / Math.abs(anionCharge);
  const isPolyAnion = POLYATOMIC_IONS[anion] !== undefined;
  const isPolyCation = POLYATOMIC_IONS[cation] !== undefined;

  let cationPart = cation;
  let anionPart = anion;

  if (cIdx > 1 && !isPolyCation) cationPart = cation + (cIdx > 1 ? cIdx : '');
  if (aIdx > 1 && isPolyAnion) anionPart = '(' + anion + ')' + aIdx;
  else if (aIdx > 1 && !isPolyAnion) anionPart = anion + aIdx;
  if (cIdx === 1 && aIdx === 1) return cation + anion;
  if (cIdx > 1 && aIdx === 1 && !isPolyCation) return cation + cIdx + anion;
  if (cIdx === 1 && aIdx > 1 && isPolyAnion) return cation + '(' + anion + ')' + aIdx;
  if (cIdx === 1 && aIdx > 1) return cation + anion + aIdx;

  if (isPolyCation) return '(' + cation + ')' + cIdx + anionPart;
  if (isPolyAnion) return cationPart + '(' + anion + ')' + aIdx;
  return cationPart + anionPart;
}

function lcm(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  if (!a || !b) return 1;
  let g = a;
  let temp = b;
  while (temp) { const t = temp; temp = g % temp; g = t; }
  return (a * b) / g;
}

/* ==================== SOLUBILITY ==================== */

function isSoluble(formula) {
  const els = parseCompoundElements(formula);
  const metals = Object.keys(els).filter(e => METALS_LIST.includes(e));
  const cation = metals.length > 0 ? metals[0] : null;
  const poly = extractPolyatomic(formula);
  const nonMetals = Object.keys(els).filter(e => !METALS_LIST.includes(e) && !['O','H'].includes(e));
  const anion = poly || (nonMetals.length > 0 ? nonMetals[0] : null);

  if (cation && SOLUBILITY.alwaysSoluble.includes(cation)) return true;
  if (anion && SOLUBILITY.alwaysSoluble.includes(anion)) return true;

  if (anion && SOLUBILITY.usuallySoluble[anion]) {
    if (cation && !SOLUBILITY.usuallySoluble[anion].includes(cation)) return true;
  }
  if (anion && SOLUBILITY.usuallyInsoluble[anion]) {
    if (cation && !SOLUBILITY.usuallyInsoluble[anion].includes(cation)) return false;
    if (!cation) return false;
  }
  if (!cation) return true;
  if (GROUP1.includes(cation) || cation === 'NH4') return true;
  return false;
}

/* ==================== COMPOUND CLASSIFICATION ==================== */

function classifyCompound(formula) {
  const els = parseCompoundElements(formula);
  const elements = Object.keys(els);
  const numEls = elements.length;
  const hasMetal = containsMetal(formula);

  if (numEls === 1) {
    const el = elements[0];
    if (['O','O2','O3'].includes(formula)) return 'oxygen';
    if (['H2','H'].includes(formula)) return 'hydrogen';
    if (['F2','Cl2','Br2','I2'].includes(formula)) return 'halogen';
    if (['N2'].includes(formula)) return 'nitrogen';
    if (['S'].includes(formula) || ['S8'].includes(formula)) return 'sulfur';
    if (hasMetal) return 'metal';
    return 'element';
  }

  if (formula === 'H2O') return 'water';
  if (/^\d*H2O$/i.test(formula)) return 'water';
  if (formula === 'H2O2') return 'peroxide';
  if (formula === 'NH3' || formula === 'NH4OH') return 'base';
  if (formula === 'CH4') return 'hydrocarbon';

  const hasCO3_str = formula.includes('CO3');
  const hasSO4_str = formula.includes('SO4');
  const hasNO3_str = formula.includes('NO3');
  const hasPO4_str = formula.includes('PO4');
  const hasSO3_str = formula.includes('SO3') && (hasMetal || formula.includes('NH4') || formula.includes('('));
  const isPoly = hasCO3_str || hasSO4_str || hasNO3_str || hasPO4_str || hasSO3_str;

  if ((formula.endsWith('COOH') || formula.endsWith('CO2H')) && !hasMetal) return 'organic';

  const hasOH = formula.includes('OH');
  if (hasOH && els.C && els.H && !hasMetal) return 'organic';
  if (hasOH && hasMetal) return 'hydroxide';
  if (hasOH && !hasMetal) return 'base';

  if (els.C && els.H && !els.O && numEls === 2) return 'hydrocarbon';
  if (formula.startsWith('H') && !hasMetal && numEls >= 2) return 'acid';
  if (els.C && els.H && els.O && numEls <= 3) return 'organic';
  if (hasMetal && hasCO3_str) return 'carbonate';
  if (hasMetal && (hasSO4_str || hasNO3_str || hasPO4_str || hasSO3_str)) return 'salt';

  if (formula === 'P4O10') return 'pentoxide';

  if (['H2O2','Na2O2','K2O2','CaO2','BaO2','MgO2','ZnO2','Li2O2','Rb2O2','Cs2O2','SrO2'].includes(formula)) return 'peroxide';

  if (els.O && numEls === 2 && !isPoly) {
    const nonO = elements.find(e => e !== 'O');
    if (nonO === 'H') return 'water';
    if (els.O === 1) return 'monoxide';
    if (els.O === 2) return 'dioxide';
    if (els.O === 3 && !hasMetal) return 'trioxide';
    if (els.O === 3 && hasMetal) return 'oxide';
    if (els.O === 4 && !hasMetal) return 'tetraoxide';
    if (els.O === 4 && hasMetal) return 'oxide';
    if (els.O === 5 && !hasMetal) return 'pentoxide';
    if (els.O >= 3) return 'oxide';
  }

  if (formula.includes('NH4') && !hasMetal) return 'salt';
  if (els.H && !els.O && numEls >= 2) {
    if (!hasMetal) return 'hydride';
  }
  if (hasMetal && els.O) return 'salt';
  if (els.C && els.O && els.H) return 'organic';
  if (els.H && !hasMetal && numEls >= 2) return 'acid';
  if (els.O && numEls === 2) return 'oxide';
  return 'compound';
}

/* ==================== PREDICATE CHECKS ==================== */

function isHydrocarbon(formula) {
  const els = parseCompoundElements(formula);
  return Object.keys(els).length <= 2 && els.C && els.H;
}

function isHydroxide(formula) { return formula.includes('OH'); }

function isCarbonate(formula) {
  const els = parseCompoundElements(formula);
  return els.C && els.O && containsMetal(formula);
}

function isOxygen(formula) { return ['O','O2','O3'].includes(formula.toUpperCase()); }

function isWater(formula) { return formula.toUpperCase() === 'H2O'; }

function isHydrogen(f) { return ['H2','H'].includes(f.toUpperCase()); }

function isMetal(f) {
  const metals = METALS_LIST;
  const els = parseCompoundElements(f);
  return Object.keys(els).length === 1 && metals.includes(Object.keys(els)[0]);
}

function isNonMetal(f) {
  const nonMetals = ['H','He','B','C','N','O','F','Ne','Si','P','S','Cl','Ar','Se','Br','Kr','I','Xe','Rn'];
  const els = parseCompoundElements(f);
  return Object.keys(els).length === 1 && nonMetals.includes(Object.keys(els)[0]);
}

function isHalogen(f) { return ['F2','CL2','BR2','I2','F','CL','BR','I'].includes(f.toUpperCase()); }

function isHydrogenHalide(f) {
  const els = parseCompoundElements(f);
  const keys = Object.keys(els);
  if (keys.length !== 2) return false;
  if (!els.H) return false;
  const other = keys.find(k => k !== 'H');
  return ['F','Cl','Br','I'].includes(other) && els[other] === 1;
}

function hasHalogen(f) { return getHalogen(f) !== null; }

function hasNO3(f) { return f.includes('NO3') || f.includes('NO2'); }

function containsOxygen(f) { return hasElement(f, 'O'); }

function isAcid(f) {
  if (containsMetal(f)) return false;
  if (f === 'H2O' || f === 'H2O2') return false;
  if (/^\d*H2O$/i.test(f)) return false;
  if (!isCarboxylicAcid(f) && f.includes('OH')) return false;
  if (isEster(f)) return false;
  const el = parseCompoundElements(f);
  const keys = Object.keys(el);
  if (!el.H) return false;
  if (f.startsWith('H') && keys.length >= 2) {
    if (el.C && el.O === 1) return false;
    return true;
  }
  if (keys.length >= 2 && el.O && el.H && (el.O >= 2 || !el.C)) return true;
  if (keys.length === 2 && (el.F || el.Cl || el.Br || el.I)) return true;
  return false;
}

function isOrganic(f) {
  const el = parseCompoundElements(f);
  return el.C && el.H;
}

function hasHydroxide(f) { return f.includes('OH'); }

function isCarboxylicAcid(f) { return f.endsWith('COOH') || f.endsWith('CO2H'); }

function isMonoxide(f) { const e = parseCompoundElements(f); return e.O === 1 && Object.keys(e).length === 2; }

function isDioxide(f) { const e = parseCompoundElements(f); return e.O === 2 && Object.keys(e).length === 2 && !isCarbonate(f); }

function isPeroxide(f) { const e = parseCompoundElements(f); return f === 'H2O2' || (e.O === 2 && f.includes('O2') && !isCarbonate(f)); }

function isAlcohol(f) {
  if (!f.includes('OH')) return false;
  if (isCarboxylicAcid(f)) return false;
  if (containsMetal(f)) return false;
  if (isWater(f)) return false;
  const els = parseCompoundElements(f);
  return !!els.C;
}

function isEster(f) {
  if (containsMetal(f)) return false;
  if (isCarboxylicAcid(f)) return false;
  const els = parseCompoundElements(f);
  if (!els.C || !els.O) return false;
  const clean = f.replace(/[-=≡]/g, '');
  return clean.includes('COO') && !clean.endsWith('COOH') && !clean.endsWith('CO2H');
}

function isUnsaturated(f) {
  const els = parseCompoundElements(f);
  if (!els.C || !els.H) return false;
  if (f.includes('=') || f.includes('≡') || f.includes('#')) return true;
  if (els.O || els.N || els.S || els.P) return false;
  if (containsMetal(f)) return false;
  if (els.C === 6 && els.H === 6 && Object.keys(els).length === 2) return false;
  if (els.C === 10 && els.H === 8 && Object.keys(els).length === 2) return false;
  const halogens = (els.F || 0) + (els.Cl || 0) + (els.Br || 0) + (els.I || 0);
  const saturationIndex = (2 * els.C + 2 - els.H - halogens) / 2;
  return saturationIndex > 0;
}

function isDiatomic(f) {
  return ['H2','N2','O2','F2','CL2','BR2','I2'].includes(f.toUpperCase());
}

function isHydrate(f) { return /[·.]\d*H2O$/i.test(f); }

function parseHydrate(f) {
  const match = f.match(/^(.+?)[·.](\d*)H2O$/i);
  if (!match) return null;
  return {
    anhydrous: match[1],
    waterCount: match[2] === '' ? 1 : parseInt(match[2])
  };
}

function isMetalElement(el) { return METALS_LIST.includes(el); }

/* ==================== EXTRACT POLYATOMIC ==================== */

function extractPolyatomic(formula) {
  const polys = Object.keys(POLYATOMIC_IONS).sort((a, b) => b.length - a.length);
  for (const p of polys) {
    if (formula.includes(p)) return p;
  }
  return null;
}

function parseCompoundElements(formula) {
  /* Pre-process hydrate: extract water of crystallization */
  let hydrateWater = 0;
  let baseFormula = formula;
  if (isHydrate(formula)) {
    const info = parseHydrate(formula);
    baseFormula = info.anhydrous;
    hydrateWater = info.waterCount;
  }
  const stack = [{}];
  let i = 0;
  while (i < baseFormula.length) {
    if (baseFormula[i] === '(') { stack.push({}); i++; }
    else if (baseFormula[i] === ')') {
      i++; let numStr = '';
      while (i < baseFormula.length && /\d/.test(baseFormula[i])) { numStr += baseFormula[i]; i++; }
      const mult = numStr === '' ? 1 : parseInt(numStr);
      const top = stack.pop();
      for (const [el, cnt] of Object.entries(top))
        stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt * mult;
    } else if (/[A-Z]/.test(baseFormula[i])) {
      let el = baseFormula[i]; i++;
      while (i < baseFormula.length && /[a-z]/.test(baseFormula[i])) { el += baseFormula[i]; i++; }
      let numStr = '';
      while (i < baseFormula.length && /\d/.test(baseFormula[i])) { numStr += baseFormula[i]; i++; }
      const cnt = numStr === '' ? 1 : parseInt(numStr);
      stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt;
    } else { i++; }
  }
  const result = stack[0];
  /* Add water of crystallization */
  if (hydrateWater > 0) {
    result.H = (result.H || 0) + hydrateWater * 2;
    result.O = (result.O || 0) + hydrateWater;
  }
  return result;
}

/* ==================== CANONICAL FORMULA ==================== */

function getCanonicalFormula(formula) {
  const els = parseCompoundElements(formula);
  const keys = Object.keys(els).sort((a, b) => {
    if (a === 'C') return -1; if (b === 'C') return 1;
    if (a === 'H') return -1; if (b === 'H') return 1;
    return a < b ? -1 : 1;
  });
  return keys.map(k => k + (els[k] > 1 ? els[k] : '')).join('');
}

/* ==================== FUNCTIONAL GROUP DETECTION ==================== */

function detectFunctionalGroups(structural) {
  const s = structural.replace(/[-=≡]/g, '');
  const groups = [];
  if (/COOH/.test(s)) groups.push('carboxylic_acid');
  if (/COO(?!H)/.test(s)) groups.push('ester');
  if (/CONH2/.test(s) || /CONHR/.test(s)) groups.push('amide');
  if (/CO(?!OH|NH2|O)/.test(s)) groups.push('carbonyl');
  if (/OH/.test(s) && !/COOH/.test(s)) groups.push('alcohol');
  if (/O-?C/.test(s) || /C-?O-?C/.test(s) || /C-?O-?[A-Z]/.test(s)) groups.push('ether');
  if (/C=C/.test(s)) groups.push('alkene');
  if (/C≡C/.test(s)) groups.push('alkyne');
  if (/NH2/.test(s)) groups.push('amine');
  if (/CHO/.test(s)) groups.push('aldehyde');
  if (/\([^)]+\)\d/.test(s)) groups.push('branched');
  if (/NH4/.test(s)) groups.push('ammonium');
  return groups;
}
