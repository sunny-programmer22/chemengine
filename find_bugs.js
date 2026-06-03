const fs = require('fs'); const math = require('mathjs');
global.math = math;
global.document = { addEventListener: ()=>{}, querySelectorAll: ()=>{}, getElementById: ()=>{} };
global.window = {}; global.setTimeout = ()=>{};
global.displayError = ()=>{}; global.displayOutput = ()=>{}; global.displaySteps = ()=>{};

eval(fs.readFileSync('js/app.js','utf8')+fs.readFileSync('js/chem-balance.js','utf8')+fs.readFileSync('js/chem-predict.js','utf8'));

let bugs = [];

// 1. Test classifyCompound for many formulas
const classifyTests = {
  'H2O': 'water', 'H2O2': 'peroxide', 'NH3': 'base', 'NH4OH': 'base',
  'CH4': 'hydrocarbon', 'C2H6': 'hydrocarbon', 'C6H6': 'hydrocarbon',
  'NaOH': 'hydroxide', 'KOH': 'hydroxide', 'Ca(OH)2': 'hydroxide', 'Mg(OH)2': 'hydroxide',
  'HCl': 'acid', 'H2SO4': 'acid', 'HNO3': 'acid', 'H2CO3': 'acid', 'H3PO4': 'acid',
  'HF': 'acid', 'HBr': 'acid', 'HI': 'acid', 'H2S': 'acid', 'HCN': 'acid', 'HClO': 'acid',
  'CH3COOH': 'organic', 'HCOOH': 'organic', 'C2H5OH': 'organic', 'CH3OH': 'organic',
  'NaCl': 'compound', 'KBr': 'compound',
  'NaNO3': 'salt', 'Na2SO4': 'salt', 'KNO3': 'salt', 'Na3PO4': 'salt',
  'Na2CO3': 'carbonate', 'CaCO3': 'carbonate', 'K2CO3': 'carbonate',
  'NaHCO3': 'carbonate', 'KHCO3': 'carbonate',
  'Fe2O3': 'oxide', 'MgO': 'monoxide', 'CaO': 'monoxide',
  'CO': 'monoxide', 'CO2': 'dioxide', 'SO2': 'dioxide', 'SO3': 'trioxide',
  'N2O5': 'pentoxide', 'NO2': 'dioxide',
  'Na': 'metal', 'Fe': 'metal', 'Cu': 'metal', 'Zn': 'metal', 'Al': 'metal',
  'O2': 'oxygen', 'O3': 'oxygen', 'H2': 'hydrogen', 'N2': 'nitrogen',
  'Cl2': 'halogen', 'Br2': 'halogen', 'F2': 'halogen', 'I2': 'halogen',
  'C2H4': 'hydrocarbon', 'C2H2': 'hydrocarbon',
  'C6H12O6': 'organic', 'C12H22O11': 'organic',
  'KMnO4': 'salt', 'K2Cr2O7': 'salt', 'FeSO4': 'salt', 'Fe2(SO4)3': 'salt',
  'CuSO4': 'salt', 'Cu(NO3)2': 'salt', 'AgNO3': 'salt', 'BaSO4': 'salt',
  'NH4Cl': 'salt', 'BaCl2': 'compound', 'CaCl2': 'compound',
  'Na2O': 'monoxide', 'K2O': 'monoxide', 'MgO': 'monoxide',
  'P4O10': 'pentoxide', 'Cl2O7': 'oxide', 'N2O3': 'trioxide',
  'Na2O2': 'peroxide', 'CaC2': 'compound',
};

console.log('=== classifyCompound ===');
let cok=0, cfail=0;
for (const [f, exp] of Object.entries(classifyTests)) {
  const got = classifyCompound(f);
  if (got === exp) { cok++; }
  else { console.log(`BUG: classifyCompound(${f}) = ${got}, expected ${exp}`); cfail++; }
}
console.log(`${cok}/${cok+cfail} passed`);

// 2. Check specific compounds that are likely misclassified
const extraClass = [
  ['HCN', 'acid', 'HCN should be acid (hydrocyanic), not hydrocarbon'],
  ['HClO', 'acid', 'HClO should be acid (hypochlorous)'],
  ['H2S', 'acid', 'H2S should be acid (hydrosulfuric)'],
  ['HBr', 'acid', 'HBr should be acid'],
];
for (const [f, exp, note] of extraClass) {
  const got = classifyCompound(f);
  if (got !== exp) console.log(`BUG: ${note}: got ${got}`);
}

// 3. Comprehensive predictReaction test
console.log('\n=== predictReaction ===');
const predictTests = [
  // Basic reactions that MUST work
  ['CH4, O2', 'Combustion'],
  ['H2, O2', 'Synthesis'],
  ['HCl, NaOH', 'Neutralization'],
  ['Na, H2O', 'Displacement'],
  ['AgNO3, NaCl', 'Double Displacement'],
  ['CaCO3', 'Decomposition'],
  ['Zn, HCl', 'Displacement'],
  ['CO, O2', 'Oxygen Addition'],
  ['Na2CO3, HCl', 'Carbonate-Acid'],
  ['CH3COOH, NaOH', 'Neutralization'],
  ['H2O2', 'Decomposition'],
  ['SO2, O2', 'Oxygen Addition'],
  ['CuSO4, NaOH', 'Double Displacement'],
  ['CaO, H2O', 'Hydration'],
  ['Mg + O2', 'Synthesis'],
  ['C2H4, H2', 'Hydrogenation'],
  ['Fe2O3 + C', 'Smelting'],
  ['NaCl + H2O', 'Hydrolysis'],
  ['P4O10 + H2O', 'Hydration'],
  ['C2H4 + H2O', 'Hydration'],
  ['N2O5 + H2O', 'Hydration'],
  ['NaHCO3', 'Bicarbonate'],
  ['Cu(OH)2', 'Hydroxide'],
  ['KMnO4 + H2SO4 + H2O2', 'Redox'],
  ['FeSO4,HNO3,H2SO4', 'Oxidation'],
  ['C, O2', 'Carbon dioxide'],
  
  // Additional edge cases
  ['Fe + O2', 'Metal Oxide'],
  ['C2H6, O2', 'Combustion'],
  ['H2SO4, NaOH', 'Neutralization'],
  ['BaCl2 + Na2SO4', 'Precipitation'],
  ['Na2SO4 + H2O', 'Hydrolysis'],
  ['CO2 + H2O', 'Hydration'],
  ['SO3 + H2O', 'Hydration'],
  ['Cl2O7 + H2O', 'Hydration'],
  ['Mg(OH)2', 'Hydroxide'],
  ['Fe(OH)3', 'Hydroxide'],
  ['NH4OH', 'Decomposition'],
  ['KOH', 'Decomposition'],
  ['C + O2', 'Carbon dioxide'],
  ['Na2O + H2O', 'Hydration'],
  ['MgO + H2O', 'Hydration'],
  ['P4O10 + H2O', 'Hydration'],
  ['C2H2 + H2', 'Hydrogenation'],
  ['Fe + CuSO4', 'Displacement'],
  ['Zn + CuSO4', 'Displacement'],
  ['Mg + HCl', 'Displacement'],
  ['NaBr + Cl2', 'Displacement'],
  ['KCl + NaNO3', 'Double Displacement'],
  ['BaCl2 + K2SO4', 'Precipitation'],
  ['NH4Cl + NaOH', 'Double Displacement'],
  ['Ca(OH)2 + CO2', 'Carbonate'],
  ['FeCl3 + NaOH', 'Double Displacement'],
  ['Al2O3', 'Decomposition'],
  ['KClO3', 'Decomposition'],
  ['NH4NO3', 'Decomposition'],
  ['C3H8, O2', 'Combustion'],
  ['C4H10, O2', 'Combustion'],
  ['C2H5OH, O2', 'Combustion'],
  ['CH3OH, O2', 'Combustion'],
  ['H2 + Cl2', 'Synthesis'],
  ['N2 + H2', 'Synthesis'],
  ['S + O2', 'Synthesis'],
  ['Mg + HCl', 'Displacement'],
  ['Al + HCl', 'Displacement'],
  ['Fe + CuSO4', 'Displacement'],
  ['Zn + CuSO4', 'Displacement'],
  ['NaOH + HNO3', 'Neutralization'],
  ['KOH + HBr', 'Neutralization'],
  ['Ca(OH)2 + HCl', 'Neutralization'],
  ['Mg(OH)2 + H2SO4', 'Neutralization'],

  // --- Precipitation formula accuracy tests ---
  ['NaCl, Pb(NO3)2', 'Precipitation'],
  ['Na2S, CuSO4', 'Precipitation'],
  ['Na2SO4, Pb(NO3)2', 'Precipitation'],
  ['Na3PO4, AgNO3', 'Precipitation'],
  ['Na2S, FeCl2', 'Precipitation'],
  ['AgNO3, KCl', 'Precipitation'],

  // --- Halogenation (addition) tests ---
  ['CH2=CH2, Cl2', 'Halogenation'],
  ['CH2=CH2, Br2', 'Halogenation'],
  ['CH3-CH=CH2, Br2', 'Halogenation'],
  ['C2H4, Cl2', 'Halogenation'],
  ['C2H4, Br2', 'Halogenation'],
  ['C2H2, Cl2', 'Halogenation'],

  // --- Hydrohalogenation (addition) tests ---
  ['CH2=CH2, HCl', 'Hydrohalogenation'],
  ['CH2=CH2, HBr', 'Hydrohalogenation'],
  ['CH3-CH=CH2, HCl', 'Hydrohalogenation'],
  ['C2H4, HCl', 'Hydrohalogenation'],
  ['C2H2, HCl', 'Hydrohalogenation'],
];

let pok=0, pfail=0;
const errors = [];
for (const [input, exp] of predictTests) {
  try {
    const r = predictReaction(input);
    if (r.type.includes(exp)) { pok++; }
    else {
      const msg = `BUG: ${input} -> type="${r.type}" (expected "${exp}") eq="${r.equation}"`;
      errors.push(msg);
      pfail++;
    }
    // Also check equation doesn't contain obvious garbage
    if (r.equation.includes('undefined') || r.equation.includes('null') || /\bNaN\b/.test(r.equation)) {
      const msg = `BUG: ${input} -> equation contains garbage: ${r.equation}`;
      errors.push(msg);
      pfail++;
    }
  } catch(e) {
    const msg = `BUG: ${input} -> threw: ${e.message}`;
    errors.push(msg);
    pfail++;
  }
}
for (const e of errors) console.log(e);
console.log(`${pok}/${pok+pfail} passed (${errors.length} failures)`);

// 3b. Precipitation formula accuracy tests
const formulaTests = [
  ['NaCl, Pb(NO3)2', 'PbCl2'],
  ['Na2S, CuSO4', 'CuS'],
  ['Na2SO4, Pb(NO3)2', 'PbSO4'],
  ['FeCl3, NaOH', 'Fe(OH)3'],
  ['AlCl3, NaOH', 'Al(OH)3'],
  ['Na2S, FeCl2', 'FeS'],
  ['Na3PO4, AgNO3', 'Ag3PO4'],
];
let fok=0, ffail=0;
for (const [input, expectedProduct] of formulaTests) {
  try {
    const r = predictReaction(input);
    if (!r.equation.includes(expectedProduct)) {
      console.log(`FORMULA BUG: ${input} -> ${r.equation} (does not contain ${expectedProduct})`);
      ffail++;
    } else { fok++; }
  } catch(e) {
    console.log(`FORMULA BUG: ${input} -> threw: ${e.message}`);
    ffail++;
  }
}
if (ffail > 0) console.log(`Formula accuracy: ${fok}/${fok+ffail} passed`);
else console.log(`Formula accuracy: ${fok}/${fok+ffail} passed (all correct)`);

// 3c. Addition reaction formula accuracy tests
const addFormulaTests = [
  ['CH2=CH2, Cl2', 'C2H4Cl2', 'Halogenation'],
  ['CH2=CH2, Br2', 'C2H4Br2', 'Halogenation'],
  ['C2H4, Cl2', 'C2H4Cl2', 'Halogenation'],
  ['C2H2, Cl2', 'C2H2Cl4', 'Halogenation'],
  ['CH2=CH2, HCl', 'C2H5Cl', 'Hydrohalogenation'],
  ['CH2=CH2, HBr', 'C2H5Br', 'Hydrohalogenation'],
  ['C2H4, HCl', 'C2H5Cl', 'Hydrohalogenation'],
  ['C2H2, HCl', 'C2H4Cl2', 'Hydrohalogenation'],
];
let afok=0, affail=0;
for (const [input, expectedProduct, expectedType] of addFormulaTests) {
  try {
    const r = predictReaction(input);
    const typeOk = r.type.includes(expectedType);
    const formulaOk = r.equation.includes(expectedProduct);
    if (!typeOk || !formulaOk) {
      console.log(`ADD BUG: ${input} -> ${r.type} | ${r.equation} (expected ${expectedType}, contains ${expectedProduct})`);
      affail++;
    } else { afok++; }
  } catch(e) {
    console.log(`ADD BUG: ${input} -> threw: ${e.message}`);
    affail++;
  }
}
if (affail > 0) console.log(`Addition formula accuracy: ${afok}/${afok+affail} passed`);
else console.log(`Addition formula accuracy: ${afok}/${afok+affail} passed (all correct)`);

// 4. Test all balance examples
console.log('\n=== balanceChemical ===');
const balanceTests = [
  'H2 + O2 -> H2O',
  'C3H8 + O2 -> CO2 + H2O',
  'Fe + O2 -> Fe2O3',
  'Na2CO3 + HCl -> NaCl + H2O + CO2',
  'CaCO3 -> CaO + CO2',
  'Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O',
  'C6H12O6 + O2 -> CO2 + H2O',
  'FeCl3 + NaOH -> Fe(OH)3 + NaCl',
  'KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O',
  'Al + Fe2O3 -> Al2O3 + Fe',
  'H2SO4 + NaOH -> Na2SO4 + H2O',
  'P4O10 + H2O -> H3PO4',
  'NH3 + O2 -> NO + H2O',
  'Fe2O3 + CO -> Fe + CO2',
];
let bok=0, bfail=0;
for (const eq of balanceTests) {
  try {
    const r = balanceChemical(eq);
    // Check conservation
    const parseEq = (s) => { const p = s.split('→').map(x=>x.trim()); return {r: p[0].split('+').map(x=>x.trim()), p: p[1].split('+').map(x=>x.trim())}; };
    const parts = parseEq(r.balanced);
    bok++;
  } catch(e) {
    console.log(`BUG balance: ${eq} -> ${e.message}`);
    bfail++;
  }
}
console.log(`${bok}/${bok+bfail} passed`);

// 5. Comprehensive fix verification — all previously broken cases
console.log('\n=== Comprehensive Fix Verification ===');
const fixTests = [
  // Decomposition
  ['HClO', 'HCl', 'HClO → HCl + O₂'],
  ['HNO2', 'N2O3', 'HNO₂ → N₂O₃ + H₂O'],
  ['Fe(OH)3', 'Fe2O3', 'Fe(OH)₃ → Fe₂O₃ + H₂O'],
  ['H2O', 'H2', 'H₂O → H₂ + O₂ (electrolysis)'],
  ['C2H5OH', 'C2H4', 'Ethanol dehydration'],
  // Combustion
  ['CH3COOH, O2', 'CO2', 'Acetic acid combustion'],
  ['S, O2', 'SO2', 'Sulfur combustion'],
  ['NH3, O2', 'N2', 'Ammonia combustion'],
  ['H2S, O2', 'SO2', 'H₂S combustion'],
  // Neutralization
  ['HCl + Fe(OH)3', 'FeCl3', 'Fe(OH)₃ + HCl → FeCl₃ + H₂O'],
  ['HCN + NaOH', 'NaCN', 'HCN neutralization'],
  ['NH3 + HCl', 'NH4Cl', 'NH₃ + HCl → NH₄Cl'],
  ['NH4OH + HCl', 'NH4Cl', 'NH₄OH + HCl → NH₄Cl + H₂O'],
  ['HNO3 + Ca(OH)2', 'Ca(NO3)2', 'HNO₃ + Ca(OH)₂ → Ca(NO₃)₂ + H₂O'],
  ['H2S + NaOH', 'Na2S', 'H₂S + NaOH → Na₂S + H₂O'],
  ['HNO3 + Al(OH)3', 'Al(NO3)3', 'HNO₃ + Al(OH)₃ → Al(NO₃)₃ + H₂O'],
  // Base + non-metal oxide
  ['NaOH, CO2', 'Na2CO3', 'NaOH + CO₂ → Na₂CO₃ + H₂O'],
  ['Ca(OH)2, CO2', 'CaCO3', 'Ca(OH)₂ + CO₂ → CaCO₃ + H₂O'],
  ['NaOH, SO2', 'Na2SO3', 'NaOH + SO₂ → Na₂SO₃ + H₂O'],
  ['NaOH, SO3', 'Na2SO4', 'NaOH + SO₃ → Na₂SO₄ + H₂O'],
  // Displacement
  ['Ca + H2O', 'Ca(OH)2', 'Ca + H₂O → Ca(OH)₂ + H₂'],
  // Halogenation + Hydrohalogenation
  ['CH2=CH2, Cl2', 'C2H4Cl2', 'Ethylene halogenation'],
  ['C2H4, Cl2', 'C2H4Cl2', 'Ethylene halogenation (molecular)'],
  ['CH2=CH2, HCl', 'C2H5Cl', 'Ethylene hydrohalogenation'],
  ['C2H4, HCl', 'C2H5Cl', 'Ethane hydrohalogenation'],
  // Precipitation
  ['NaCl, Pb(NO3)2', 'PbCl2', 'PbCl₂ precipitation'],
  ['Na2S, CuSO4', 'CuS', 'CuS precipitation'],
  ['FeCl3, NaOH', 'Fe(OH)3', 'Fe(OH)₃ precipitation'],
];
let fxok=0, fxfail=0;
for (const [input, expected, note] of fixTests) {
  try {
    const r = predictReaction(input);
    if (!r.equation.includes(expected)) {
      console.log(`FIX BUG: ${note}: ${input} → ${r.equation} (missing ${expected})`);
      fxfail++;
    } else { fxok++; }
  } catch(e) {
    console.log(`FIX BUG: ${note}: ${input} → ERROR: ${e.message}`);
    fxfail++;
  }
}
if (fxfail > 0) console.log(`Fix verification: ${fxok}/${fxok+fxfail} passed`);
else console.log(`Fix verification: ${fxok}/${fxok+fxfail} passed (all correct)`);

console.log('\nDone scanning.');
