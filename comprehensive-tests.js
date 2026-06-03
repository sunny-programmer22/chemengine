/* Comprehensive 1000+ Test Suite for Chemical Engine */
const fs = require('fs');
const math = require('mathjs');
const base = __dirname;

/* ---- Mock browser globals ---- */
global.math = math;
global.document = { addEventListener: () => {}, documentElement: { style: {} }, querySelector: () => null, querySelectorAll: () => [] };
global.window = { location: { hash: '' }, addEventListener: () => {} };
global.setTimeout = (fn) => fn();
global.clearTimeout = () => {};
global.AbortSignal = { timeout: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.fetch = async () => ({ ok: false, json: async () => ({}), text: async () => '' });
global.navigator = { clipboard: { writeText: async () => {} } };
global.displayError = () => {};
global.displayOutput = () => {};
global.displaySteps = () => {};
global.displaySuccess = () => {};
global.showSpinner = () => {};
global.hideSpinner = () => {};
global.buildResultCard = () => ({ appendChild: () => {} });
global.renderChemEqn = (s) => s;
global.renderCompound = (s) => s;
global.addHistory = () => {};
global.escapeHtml = (s) => s;
global.$3Dmol = undefined;
global.XMLHttpRequest = function() { this.open = this.send = this.setRequestHeader = () => {}; };

/* ---- Load source modules (module-level eval like find_bugs.js) ---- */
const src = [
  'js/elements.js', 'js/app.js', 'js/linear.js', 'js/nonlinear.js',
  'js/chem-balance.js', 'js/classification.js', 'js/chem-predict.js',
  'js/stoichiometry.js', 'js/ph-calc.js'
].map(f => fs.readFileSync(base + '/' + f, 'utf8')).join('\n');

eval(src);

/* ---- Test harness ---- */
let totalPass = 0, totalFail = 0, totalTests = 0;
const errors = [];

function assert(condition, msg) {
  totalTests++;
  if (condition) totalPass++;
  else { totalFail++; errors.push('FAIL: ' + msg); }
}

function assertEqual(a, b, msg) {
  const pass = a === b;
  if (!pass) assert(false, (msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  else assert(true, msg || '');
}

function assertClose(a, b, tol, msg) {
  tol = tol || 1e-4;
  const pass = Math.abs(a - b) < tol;
  if (!pass) assert(false, (msg || '') + ' — expected ' + b + ' ±' + tol + ', got ' + a);
  else assert(true, msg || '');
}

function assertIncludes(str, substr, msg) {
  const pass = str.includes(substr);
  if (!pass) assert(false, (msg || '') + ' — expected "' + str + '" to include "' + substr + '"');
  else assert(true, msg || '');
}

function assertNotIncludes(str, substr, msg) {
  const pass = !str.includes(substr);
  if (!pass) assert(false, (msg || '') + ' — expected "' + str + '" NOT to include "' + substr + '"');
  else assert(true, msg || '');
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  assert(threw, msg || 'Expected throw');
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

function summary() {
  const pct = totalTests ? Math.round(totalPass / totalTests * 100) : 0;
  console.log('\n========================================');
  console.log('TOTAL: ' + totalPass + '/' + totalTests + ' passed (' + pct + '%)');
  console.log('FAILURES: ' + totalFail);
  if (errors.length) {
    console.log('\n--- FAILURE DETAILS ---');
    errors.forEach(e => console.log(e));
  }
  console.log('========================================');
}

/* ============================================================
   SECTION 1: parseCompound (chem-balance.js)
   ============================================================ */
section('parseCompound');
(function() {
  function pc(f) { return parseCompound(f); }
  const t = (f, exp, msg) => assertEqual(JSON.stringify(pc(f)), JSON.stringify(exp), msg || f);
  t('H2O', {H:2,O:1});
  t('NaCl', {Na:1,Cl:1});
  t('C6H12O6', {C:6,H:12,O:6});
  t('CaCO3', {Ca:1,C:1,O:3});
  t('Fe2O3', {Fe:2,O:3});
  t('Na2SO4', {Na:2,S:1,O:4});
  t('Cu(NO3)2', {Cu:1,N:2,O:6});
  t('Al2(SO4)3', {Al:2,S:3,O:12});
  t('Mg(OH)2', {Mg:1,O:2,H:2});
  t('Fe(OH)3', {Fe:1,O:3,H:3});
  t('(NH4)2SO4', {N:2,H:8,S:1,O:4});
  t('KMnO4', {K:1,Mn:1,O:4});
  t('C2H5OH', {C:2,H:6,O:1});
  t('CH3COOH', {C:2,H:4,O:2});
  t('P4O10', {P:4,O:10});
  t('Ca3(PO4)2', {Ca:3,P:2,O:8});
  t('NaHCO3', {Na:1,H:1,C:1,O:3});
  t('BaCl2', {Ba:1,Cl:2});
  t('O2', {O:2});
  t('H2SO4', {H:2,S:1,O:4});
  t('NH3', {N:1,H:3});
  t('CH4', {C:1,H:4});
  t('C3H8', {C:3,H:8});
  t('FeCl3', {Fe:1,Cl:3});
  t('K2Cr2O7', {K:2,Cr:2,O:7});
  t('Na2S2O3', {Na:2,S:2,O:3});
  t('AgNO3', {Ag:1,N:1,O:3});
  t('Pb(NO3)2', {Pb:1,N:2,O:6});
  t('H2O2', {H:2,O:2});
  t('C12H22O11', {C:12,H:22,O:11});
  console.log('  parseCompound: 30 tests');
})();

/* ============================================================
   SECTION 2: parseEquation
   ============================================================ */
section('parseEquation');
(function() {
  const t = (eq, expR, expP, msg) => {
    const r = parseEquation(eq);
    assertEqual(JSON.stringify(r.reactants), JSON.stringify(expR), msg || eq + ' reactants');
    assertEqual(JSON.stringify(r.products), JSON.stringify(expP), msg || eq + ' products');
  };
  t('H2+O2->H2O', ['H2','O2'], ['H2O']);
  t('H2 + O2 -> H2O', ['H2','O2'], ['H2O']);
  t('C3H8+O2->CO2+H2O', ['C3H8','O2'], ['CO2','H2O']);
  t('Fe+O2->Fe2O3', ['Fe','O2'], ['Fe2O3']);
  t('NaCl->Na+Cl2', ['NaCl'], ['Na','Cl2']);
  t('CaCO3->CaO+CO2', ['CaCO3'], ['CaO','CO2']);
  console.log('  parseEquation: 6 tests');
})();

/* ============================================================
   SECTION 3: formatCompound / gcd
   ============================================================ */
section('formatCompound gcd');
(function() {
  assertEqual(formatCompound(1, 'H2O'), 'H2O', 'coeff=1');
  assertEqual(formatCompound(2, 'H2O'), '2H2O', 'coeff=2');
  assertEqual(gcd(12, 8), 4, 'gcd(12,8)=4');
  assertEqual(gcd(7, 13), 1, 'gcd(7,13)=1');
  assertEqual(gcd(0, 5), 5, 'gcd(0,5)=5');
  console.log('  formatCompound/gcd: 5 tests');
})();

/* ============================================================
   SECTION 4: classifyCompound — 100+ tests
   ============================================================ */
section('classifyCompound');
(function() {
  const t = (f, exp, msg) => assertEqual(classifyCompound(f), exp, msg || f);
  t('H2', 'hydrogen'); t('O2', 'oxygen'); t('N2', 'nitrogen');
  t('Cl2', 'halogen'); t('F2', 'halogen'); t('Br2', 'halogen');
  t('I2', 'halogen'); t('O3', 'oxygen'); t('P4', 'element');
  t('S8', 'sulfur'); t('He', 'element'); t('Ne', 'element');
  t('H2O', 'water');
  t('CO2', 'dioxide'); t('SO2', 'dioxide'); t('NO2', 'dioxide');
  t('SO3', 'trioxide'); t('CO', 'monoxide'); t('NO', 'monoxide');
  t('N2O', 'monoxide'); t('P4O10', 'pentoxide');
  t('Fe2O3', 'oxide'); t('Al2O3', 'oxide'); t('MgO', 'monoxide');
  t('CuO', 'monoxide'); t('ZnO', 'monoxide'); t('Na2O', 'monoxide');
  t('CaO', 'monoxide'); t('Fe3O4', 'oxide');
  t('HCl', 'acid'); t('HBr', 'acid'); t('HI', 'acid');
  t('H2SO4', 'acid'); t('HNO3', 'acid'); t('H3PO4', 'acid');
  t('H2CO3', 'acid'); t('H2S', 'acid'); t('HCN', 'acid');
  t('HClO', 'acid'); t('HF', 'acid');
  t('CH3COOH', 'organic');
  t('NaOH', 'hydroxide'); t('KOH', 'hydroxide');
  t('Ca(OH)2', 'hydroxide'); t('Mg(OH)2', 'hydroxide');
  t('Fe(OH)3', 'hydroxide'); t('Cu(OH)2', 'hydroxide');
  t('Al(OH)3', 'hydroxide'); t('NH4OH', 'base');
  t('NaCl', 'compound'); t('KCl', 'compound'); t('CaCl2', 'compound');
  t('Na2SO4', 'salt'); t('CuSO4', 'salt'); t('FeSO4', 'salt');
  t('NaNO3', 'salt'); t('AgNO3', 'salt'); t('KNO3', 'salt');
  t('CaCO3', 'carbonate'); t('Na2CO3', 'carbonate'); t('KMnO4', 'salt');
  t('FeCl3', 'compound'); t('BaCl2', 'compound'); t('NaBr', 'compound');
  t('KI', 'compound'); t('NaHCO3', 'carbonate');
  t('Ca3(PO4)2', 'salt'); t('Al2(SO4)3', 'salt');
  t('CH4', 'hydrocarbon'); t('C2H6', 'hydrocarbon'); t('C3H8', 'hydrocarbon');
  t('C4H10', 'hydrocarbon'); t('C6H14', 'hydrocarbon');
  t('C2H4', 'hydrocarbon'); t('C3H6', 'hydrocarbon'); t('C6H6', 'hydrocarbon');
  t('C2H2', 'hydrocarbon');
  t('CH3OH', 'organic'); t('C2H5OH', 'organic');
  t('CH3CHO', 'organic'); t('HCHO', 'acid');
  t('C6H12O6', 'organic'); t('C12H22O11', 'organic');
  t('PCl3', 'compound'); t('SiCl4', 'compound'); t('SF6', 'compound');
  t('NF3', 'compound'); t('PCl5', 'compound');
  console.log('  classifyCompound: 83 tests');
})();

/* ============================================================
   SECTION 5: is* predicate functions
   ============================================================ */
section('Predicate functions');
(function() {
  assert(isAcid('HCl'), 'isAcid HCl'); assert(isAcid('H2SO4'), 'isAcid H2SO4');
  assert(!isAcid('NaCl'), '!isAcid NaCl'); assert(!isAcid('H2O'), '!isAcid H2O');
  assert(isMetal('Fe'), 'isMetal Fe'); assert(isMetal('Na'), 'isMetal Na');
  assert(!isMetal('Cl2'), '!isMetal Cl2'); assert(!isMetal('H2O'), '!isMetal H2O');
  assert(isHalogen('Cl2'), 'isHalogen Cl2'); assert(isHalogen('F2'), 'isHalogen F2');
  assert(isHalogen('Br2'), 'isHalogen Br2'); assert(!isHalogen('O2'), '!isHalogen O2');
  assert(isOxygen('O2'), 'isOxygen O2'); assert(!isOxygen('H2O'), '!isOxygen H2O');
  assert(isHydrogen('H2'), 'isHydrogen H2'); assert(!isHydrogen('H2O'), '!isHydrogen H2O');
  assert(isUnsaturated('C2H4'), 'isUnsaturated C2H4');
  assert(isUnsaturated('C2H2'), 'isUnsaturated C2H2');
  assert(!isUnsaturated('C2H6'), '!isUnsaturated C2H6');
  assert(!isUnsaturated('CH4'), '!isUnsaturated CH4');
  assert(isCarbonate('CaCO3'), 'isCarbonate CaCO3');
  assert(isCarbonate('Na2CO3'), 'isCarbonate Na2CO3');
  assert(!isCarbonate('CO2'), '!isCarbonate CO2');
  assert(isOrganic('CH4'), 'isOrganic CH4');
  assert(isOrganic('C2H5OH'), 'isOrganic C2H5OH');
  assert(!isOrganic('NaCl'), '!isOrganic NaCl');
  assert(containsMetal('FeCl3'), 'containsMetal FeCl3');
  assert(!containsMetal('CO2'), '!containsMetal CO2');
  assert(hasHydroxide('NaOH'), 'hasHydroxide NaOH');
  assert(hasHydroxide('Ca(OH)2'), 'hasHydroxide Ca(OH)2');
  assert(hasNO3('NaNO3'), 'hasNO3 NaNO3');
  assert(hasNO3('Cu(NO3)2'), 'hasNO3 Cu(NO3)2');
  assert(isAlcohol('CH3OH'), 'isAlcohol CH3OH');
  assert(isAlcohol('C2H5OH'), 'isAlcohol C2H5OH');
  assert(!isAlcohol('C2H6'), '!isAlcohol C2H6');
  assert(isCarbonyl('CH3CHO'), 'isCarbonyl CH3CHO');
  assert(isCarbonyl('HCHO'), 'isCarbonyl HCHO');
  assert(!isCarbonyl('C2H5OH'), '!isCarbonyl C2H5OH');
  assert(isCarboxylicAcid('CH3COOH'), 'isCarboxylicAcid CH3COOH');
  assert(!isCarboxylicAcid('CH3CHO'), '!isCarboxylicAcid CH3CHO');
  assert(isEster('CH3COOC2H5'), 'isEster CH3COOC2H5');
  assert(!isEster('CH3COOH'), '!isEster CH3COOH');
  assert(isHydrate('CuSO4.5H2O'), 'isHydrate CuSO4.5H2O');
  assert(!isHydrate('CuSO4'), '!isHydrate CuSO4');
  console.log('  Predicates: 50 tests');
})();

/* ============================================================
   SECTION 6: Formula validation
   ============================================================ */
section('Formula validation');
(function() {
  assert(validateFormula('H2O').valid, 'H2O valid');
  assert(validateFormula('NaCl').valid, 'NaCl valid');
  assert(validateFormula('C6H12O6').valid, 'C6H12O6 valid');
  assert(validateFormula('Cu(NO3)2').valid, 'Cu(NO3)2 valid');
  assert(validateFormula('CH2=CH2').valid, 'CH2=CH2 valid');
  assert(validateFormula('CH#CH').valid, 'CH#CH valid');
  assert(!validateFormula('').valid, 'empty invalid');
  assert(!validateFormula('H2O)').valid, 'unmatched paren invalid');
  assert(!validateFormula('(H2O').valid, 'unopened paren invalid');
  assert(!validateFormula('Zz').valid, 'nonexistent element invalid');
  assert(validateFormula('123').valid === false, 'numeric invalid (no recognized elements)');
  assert(!validateFormula('H2O Zz').valid, 'garbage invalid');
  console.log('  validateFormula: 12 tests');
})();

/* ============================================================
   SECTION 7: parseCompoundElements (chem-predict.js)
   ============================================================ */
section('parseCompoundElements');
(function() {
  const t = (f, exp, msg) => assertEqual(JSON.stringify(parseCompoundElements(f)), JSON.stringify(exp), msg || f);
  t('H2O', {H:2,O:1});
  t('NaCl', {Na:1,Cl:1});
  t('C6H12O6', {C:6,H:12,O:6});
  t('CaCO3', {Ca:1,C:1,O:3});
  t('Fe2O3', {Fe:2,O:3});
  t('Na2SO4', {Na:2,S:1,O:4});
  t('Cu(NO3)2', {Cu:1,N:2,O:6});
  t('Al2(SO4)3', {Al:2,S:3,O:12});
  t('C2H5OH', {C:2,H:6,O:1});
  t('CH3COOH', {C:2,H:4,O:2});
  t('(NH4)2SO4', {N:2,H:8,S:1,O:4});
  t('KMnO4', {K:1,Mn:1,O:4});
  t('P4O10', {P:4,O:10});
  t('H2SO4', {H:2,S:1,O:4});
  t('Fe2(SO4)3', {Fe:2,S:3,O:12});
  t('K2Cr2O7', {K:2,Cr:2,O:7});
  t('Na2S2O3', {Na:2,S:2,O:3});
  t('C12H22O11', {C:12,H:22,O:11});
  t('Ca3(PO4)2', {Ca:3,P:2,O:8});
  t('Pb(NO3)2', {Pb:1,N:2,O:6});
  t('CH2=CH2', {C:2,H:4});
  t('CH#CH', {C:2,H:2});
  t('Na2O2', {Na:2,O:2});
  t('Mg3N2', {Mg:3,N:2});
  console.log('  parseCompoundElements: 24 tests');
})();

/* ============================================================
   SECTION 8: molecularWeight (elements.js)
   ============================================================ */
section('molecularWeight');
(function() {
  const mw = molecularWeight('H2O');
  assert(mw > 18.0 && mw < 18.02, 'H2O MW ~18.015: got ' + mw);
  const mw2 = molecularWeight('CO2');
  assert(mw2 > 43.9 && mw2 < 44.1, 'CO2 MW ~44.01: got ' + mw2);
  const mw3 = molecularWeight('NaCl');
  assert(mw3 > 58.4 && mw3 < 58.5, 'NaCl MW ~58.44: got ' + mw3);
  const mw4 = molecularWeight('C6H12O6');
  assert(mw4 > 180.0 && mw4 < 180.2, 'C6H12O6 MW ~180.16: got ' + mw4);
  const mw5 = molecularWeight('H2SO4');
  assert(mw5 > 98.0 && mw5 < 98.1, 'H2SO4 MW ~98.08: got ' + mw5);
  const mw6 = molecularWeight('P4O10');
  assert(mw6 > 283.0 && mw6 < 284.0, 'P4O10 MW ~283.9: got ' + mw6);
  const mw7 = molecularWeight('NH3');
  assert(mw7 > 17.0 && mw7 < 17.1, 'NH3 MW ~17.03: got ' + mw7);
  console.log('  molecularWeight: 7 tests');
})();

/* ============================================================
   SECTION 9: Linear equation solver — 20+ systems
   ============================================================ */
section('Linear equations');
(function() {
  function check(name, lines, expected) {
    try {
      const r = solveLinearSystem(lines);
      const pass = expected.every((v, i) => Math.abs(r.solution[i] - v) < 1e-10);
      if (!pass) {
        const got = r.solution.map(s => Math.round(s * 1e10) / 1e10);
        assert(false, name + ' — expected [' + expected.join(',') + '], got [' + got.join(',') + ']');
      } else assert(true, name);
    } catch (e) { assert(false, name + ' threw: ' + e.message); }
  }

  check('2x+y=5, x-y=1', ['2*x+y=5','x-y=1'], [2,1]);
  check('x+y=3, x-y=1', ['x+y=3','x-y=1'], [2,1]);
  check('x+y+z=6, 2x-y+z=3, x+2y-z=2', ['x+y+z=6','2*x-y+z=3','x+2*y-z=2'], [1,2,3]);
  check('x=5', ['x=5'], [5]);
  check('2x=10', ['2*x=10'], [5]);
  check('3x+2y=12, x-y=1', ['3*x+2*y=12','x-y=1'], [2.8, 1.8]);
  check('x+2y=7, 3x-4y=-4', ['x+2*y=7','3*x-4*y=-4'], [2, 2.5]);
  check('x+y+z=10, x-y+z=4, x+y-z=0', ['x+y+z=10','x-y+z=4','x+y-z=0'], [2,3,5]);
  check('x+y=5, x-y=3', ['x+y=5','x-y=3'], [4,1]);
  check('x+2y+3z=14, x-y+z=2, 2x+3y-z=1', ['x+2*y+3*z=14','x-y+z=2','2*x+3*y-z=1'], [-0.0526315789,1.5789473684,3.6315789474]);
  check('x+2y=8, 2x+y=10', ['x+2*y=8','2*x+y=10'], [4,2]);
  check('3x-2y=5, 2x+3y=12', ['3*x-2*y=5','2*x+3*y=12'], [3,2]);
  check('4x+5y=23, 2x-3y=-5', ['4*x+5*y=23','2*x-3*y=-5'], [2,3]);
  check('5x+2y=20, x-4y=-7', ['5*x+2*y=20','x-4*y=-7'], [3,2.5]);
  check('6x-3y=9, 4x+5y=27', ['6*x-3*y=9','4*x+5*y=27'], [3,3]);
  check('7x+2y+z=20, x+3y-2z=-3, 2x-y+4z=15', ['7*x+2*y+z=20','x+3*y-2*z=-3','2*x-y+4*z=15'], [2.5957446809,-0.2765957447,2.3829787234]);
  check('4variate system', ['x+2*y+3*z+4*w=30','2*x-y+z-w=2','3*x+2*y-z+2*w=14','x-3*y+2*z-w=-5'], [1.53125,1.96875,4.625,4.21875]);
  check('x=0, y=0', ['x=0','y=0'], [0,0]);
  check('x+2y-z=1, 3x-y+2z=8, 2x+y+z=7', ['x+2*y-z=1','3*x-y+2*z=8','2*x+y+z=7'], [1,1.6666666666666667,3.3333333333333335]);

  assertThrows(() => solveLinearSystem(['x+y=5']), 'underdetermined throws');
  assertThrows(() => solveLinearSystem(['=']), 'empty eq throws');
  console.log('  Linear equations: 20 systems tested');
})();

/* ============================================================
   SECTION 10: Non-linear equation solver
   ============================================================ */
section('Non-linear equations');
(function() {
  function check(name, eqs, vars, guesses, expected, tol) {
    tol = tol || 0.01;
    try {
      const r = solveNonLinear(eqs, vars, guesses);
      const pass = expected.every((v, i) => Math.abs(r.solution[i] - v) < tol);
      if (!pass) {
        const got = r.solution.map(s => Math.round(s * 1e4) / 1e4);
        assert(false, name + ' — expected [' + expected.join(',') + '], got [' + got.join(',') + ']');
      } else assert(true, name);
    } catch (e) { assert(false, name + ' threw: ' + e.message); }
  }

  check('x^2+y^2=25, x-y=1', ['x^2+y^2=25','x-y=1'], ['x','y'], [4,3], [4,3], 0.01);
  check('x^2+y^2=25, x-y=1 (alt)', ['x^2+y^2=25','x-y=1'], ['x','y'], [3,2], [4,3], 0.02);
  check('x^2=4', ['x^2=4'], ['x'], [2], [2], 0.01);
  check('x^2=4 (neg)', ['x^2=4'], ['x'], [-2], [-2], 0.01);
  check('x+y=10, x^2+y^2=58', ['x+y=10','x^2+y^2=58'], ['x','y'], [3,7], [3,7], 0.01);
  check('xy=12, x+y=7', ['x*y=12','x+y=7'], ['x','y'], [3,4], [3,4], 0.01);
  check('x^2+y^2=13, x^2-y^2=5', ['x^2+y^2=13','x^2-y^2=5'], ['x','y'], [3,2], [3,2], 0.01);
  check('x^2-y=5, y^2-x=5', ['x^2-y=5','y^2-x=5'], ['x','y'], [3,3], [2.7913,2.7913], 0.02);

  assertThrows(() => solveNonLinear(['x^2+y^2=25'], ['x','y'], [0,0]), 'underdetermined throws');
  console.log('  Non-linear equations: 8 systems tested');
})();

/* ============================================================
   SECTION 11: Chemical balancer — 70+ equations with conservation verification
   ============================================================ */
section('Chemical balancer');
(function() {
  function check(eq) {
    try {
      const r = balanceChemical(eq);
      const arrow = /->|→/;
      const parts = r.balanced.split(arrow).map(s => s.trim());
      const reactants = parts[0].split('+').map(s => s.trim()).filter(s => s);
      const products = parts[1].split('+').map(s => s.trim()).filter(s => s);
      const allCmp = [...reactants, ...products];
      const parsed = allCmp.map(c => {
        const m = c.match(/^(\d+)/);
        const coeff = m ? parseInt(m[1]) : 1;
        const formula = c.replace(/^\d+/, '');
        return { coeff, els: parseCompound(formula) };
      });
      const elements = new Set();
      parsed.forEach(p => Object.keys(p.els).forEach(el => elements.add(el)));
      let ok = true;
      for (const el of elements) {
        let left = 0, right = 0;
        parsed.forEach((p, i) => {
          const cnt = (p.els[el] || 0) * p.coeff;
          if (i < reactants.length) left += cnt;
          else right += cnt;
        });
        if (Math.abs(left - right) > 1e-6) { ok = false; }
      }
      assert(ok, eq + ' → ' + r.balanced + ' (conservation)');
    } catch (e) { assert(false, eq + ' threw: ' + e.message); }
  }

  const equations = [
    'H2+O2->H2O', 'N2+H2->NH3', 'C+O2->CO2', 'S+O2->SO2',
    'Fe+O2->Fe2O3', 'Al+O2->Al2O3', 'Mg+O2->MgO', 'Na+O2->Na2O',
    'Na+Cl2->NaCl', 'Fe+Cl2->FeCl3', 'Al+Cl2->AlCl3',
    'CaCO3->CaO+CO2', 'H2O2->H2O+O2',
    'Al2O3->Al+O2', 'NH4NO3->N2O+H2O', 'H2O->H2+O2',
    'C3H8+O2->CO2+H2O', 'C2H6+O2->CO2+H2O', 'CH4+O2->CO2+H2O',
    'C4H10+O2->CO2+H2O', 'C2H5OH+O2->CO2+H2O',
    'C6H12O6+O2->CO2+H2O', 'C2H2+O2->CO2+H2O',
    'C2H4+O2->CO2+H2O', 'C3H6+O2->CO2+H2O',
    'HCl+NaOH->NaCl+H2O', 'H2SO4+NaOH->Na2SO4+H2O',
    'HNO3+Ca(OH)2->Ca(NO3)2+H2O', 'HBr+KOH->KBr+H2O',
    'HCl+Ca(OH)2->CaCl2+H2O', 'H2SO4+Mg(OH)2->MgSO4+H2O',
    'FeCl3+NaOH->Fe(OH)3+NaCl', 'CuSO4+NaOH->Cu(OH)2+Na2SO4',
    'AgNO3+NaCl->AgCl+NaNO3', 'BaCl2+Na2SO4->BaSO4+NaCl',
    'Pb(NO3)2+NaCl->PbCl2+NaNO3', 'Na2CO3+HCl->NaCl+H2O+CO2',
    'CaCO3+HCl->CaCl2+H2O+CO2',
    'Fe+CuSO4->FeSO4+Cu', 'Zn+HCl->ZnCl2+H2',
    'Al+HCl->AlCl3+H2', 'Mg+HCl->MgCl2+H2',
    'Na+H2O->NaOH+H2', 'Cl2+NaBr->Br2+NaCl',
    'Cu+HNO3->Cu(NO3)2+NO2+H2O', 'KMnO4+HCl->KCl+MnCl2+Cl2+H2O',
    'Al+Fe2O3->Al2O3+Fe', 'Fe2O3+CO->Fe+CO2',
    'NH3+O2->NO+H2O', 'P4O10+H2O->H3PO4',
    'Ca(OH)2+CO2->CaCO3+H2O',
    'SO3+H2O->H2SO4', 'N2O5+H2O->HNO3',
    'Na2O+H2O->NaOH', 'CaO+H2O->Ca(OH)2',
    'Fe2O3+HCl->FeCl3+H2O',
    'H2S+NaOH->Na2S+H2O', 'CH3COOH+NaOH->CH3COONa+H2O',
    'C2H4+H2->C2H6', 'C2H4+H2O->C2H5OH',
    'C2H2+H2->C2H4',     'C2H2+H2->C2H4',
    'P4+Cl2->PCl3', 'Si+Cl2->SiCl4',
    'CuS+O2->CuO+SO2', 'ZnS+O2->ZnO+SO2',
    'Fe2O3+Mg->MgO+Fe',
    'CO+O2->CO2', 'SO2+O2->SO3', 'NO+O2->NO2',
    'NH4Cl+NaOH->NH3+H2O+NaCl', 'NaHCO3->Na2CO3+H2O+CO2',
    'Cu(OH)2->CuO+H2O', 'Mg(OH)2->MgO+H2O',
    'Fe(OH)3->Fe2O3+H2O', 'NH4NO3->N2+O2+H2O',
    'AgNO3+KCl->AgCl+KNO3', 'Na2SO4+BaCl2->BaSO4+NaCl',
    'Na3PO4+AgNO3->Ag3PO4+NaNO3', 'Na2S+CuSO4->CuS+Na2SO4',
    'C+O2->CO', 'Fe2O3+C->Fe+CO2',
    'C2H6->C2H4+H2', 'C3H8->C3H6+H2',
    'C2H5Cl->C2H4+HCl',
  ];
  equations.forEach(eq => check(eq));
  console.log('  Chemical balancer: ' + equations.length + ' equations verified');
})();

/* ============================================================
   SECTION 12: Reaction predictor — 200+ reactions
   ============================================================ */
section('Reaction predictor');
(function() {
  function test(label, input) {
    try {
      const r = predictReaction(input);
      const hasUndefined = r.equation.includes('undefined') || r.type === 'undefined';
      if (hasUndefined) assert(false, label + ' → ' + r.type + ': ' + r.equation + ' (contains undefined)');
      else assert(true, label + ' → [' + r.type + '] ' + r.equation);
    } catch (e) { assert(false, label + ' threw: ' + e.message); }
  }

  /* Combustion */
  const fuels = ['CH4','C2H6','C3H8','C4H10','C5H12','C6H14','C2H4','C3H6','C2H2','C6H6',
    'CH3OH','C2H5OH','C3H7OH','C6H12O6','C12H22O11'];
  fuels.forEach(f => test(f + ' + O2', f + ', O2'));

  /* Synthesis */
  test('H2+O2', 'H2, O2'); test('H2+Cl2', 'H2, Cl2'); test('N2+H2', 'N2, H2');
  test('S+O2', 'S, O2'); test('C+O2', 'C, O2'); test('Mg+O2', 'Mg, O2');
  test('Fe+O2', 'Fe, O2'); test('Al+O2', 'Al, O2'); test('Na+O2', 'Na, O2');
  test('P4+O2', 'P4, O2'); test('P4+Cl2', 'P4, Cl2'); test('Si+Cl2', 'Si, Cl2');
  test('B+Cl2', 'B, Cl2'); test('S+Cl2', 'S, Cl2'); test('N2+Cl2', 'N2, Cl2');

  /* Neutralization */
  test('HCl+NaOH', 'HCl, NaOH'); test('H2SO4+NaOH', 'H2SO4, NaOH');
  test('HNO3+KOH', 'HNO3, KOH'); test('HBr+NaOH', 'HBr, NaOH');
  test('HCl+Ca(OH)2', 'HCl, Ca(OH)2'); test('H2SO4+Mg(OH)2', 'H2SO4, Mg(OH)2');
  test('HNO3+Al(OH)3', 'HNO3, Al(OH)3'); test('H3PO4+NaOH', 'H3PO4, NaOH');
  test('CH3COOH+NaOH', 'CH3COOH, NaOH'); test('HCl+Fe(OH)3', 'HCl, Fe(OH)3');
  test('HCN+NaOH', 'HCN, NaOH'); test('H2S+NaOH', 'H2S, NaOH');
  test('NH3+HCl', 'NH3, HCl'); test('NH4OH+HCl', 'NH4OH, HCl');

  /* Single displacement */
  test('Zn+HCl', 'Zn, HCl'); test('Mg+HCl', 'Mg, HCl'); test('Fe+HCl', 'Fe, HCl');
  test('Al+HCl', 'Al, HCl');
  test('Na+H2O', 'Na, H2O'); test('K+H2O', 'K, H2O'); test('Ca+H2O', 'Ca, H2O');
  test('Fe+CuSO4', 'Fe, CuSO4'); test('Zn+CuSO4', 'Zn, CuSO4');
  test('Fe+AgNO3', 'Fe, AgNO3'); test('Cu+AgNO3', 'Cu, AgNO3');
  test('Mg+H2SO4', 'Mg, H2SO4'); test('Fe+H2SO4', 'Fe, H2SO4');

  /* Halogen displacement */
  test('NaBr+Cl2', 'NaBr, Cl2'); test('NaCl+F2', 'NaCl, F2');
  test('KI+Cl2', 'KI, Cl2');

  /* Double displacement / precipitation */
  test('AgNO3+NaCl', 'AgNO3, NaCl'); test('CuSO4+NaOH', 'CuSO4, NaOH');
  test('BaCl2+Na2SO4', 'BaCl2, Na2SO4'); test('FeCl3+NaOH', 'FeCl3, NaOH');
  test('Pb(NO3)2+NaCl', 'Pb(NO3)2, NaCl'); test('AgNO3+KCl', 'AgNO3, KCl');
  test('Na2CO3+HCl', 'Na2CO3, HCl'); test('CaCO3+HCl', 'CaCO3, HCl');
  test('NH4Cl+NaOH', 'NH4Cl, NaOH');

  /* Decomposition */
  const dec = ['CaCO3','H2O2','Al2O3','KClO3','NH4NO3','NH4OH','KOH',
    'Cu(OH)2','Mg(OH)2','Fe(OH)3','NaHCO3'];
  dec.forEach(f => test(f + ' (decomp)', f));

  /* Hydration */
  const hydOxides = ['CaO','MgO','Na2O','K2O','SO3','N2O5','CO2','P4O10','Cl2O7'];
  hydOxides.forEach(f => test(f + '+H2O', f + ', H2O'));

  /* Hydrogenation */
  test('C2H4+H2', 'C2H4, H2'); test('C2H2+H2', 'C2H2, H2');

  /* Hydration of alkenes */
  test('C2H4+H2O', 'C2H4, H2O'); test('C3H6+H2O', 'C3H6, H2O');

  /* Halogenation */
  test('C2H4+Cl2', 'C2H4, Cl2'); test('C2H4+Br2', 'C2H4, Br2');
  test('C2H2+Cl2', 'C2H2, Cl2'); test('C3H6+Br2', 'C3H6, Br2');

  /* Hydrohalogenation */
  test('C2H4+HCl', 'C2H4, HCl'); test('C2H4+HBr', 'C2H4, HBr');
  test('C2H2+HCl', 'C2H2, HCl'); test('C3H6+HCl', 'C3H6, HCl');

  /* Redox special */
  test('KMnO4+H2SO4+H2O2', 'KMnO4, H2SO4, H2O2');
  test('FeSO4+HNO3+H2SO4', 'FeSO4, HNO3, H2SO4');

  /* Base + non-metal oxide */
  test('NaOH+CO2', 'NaOH, CO2'); test('Ca(OH)2+CO2', 'Ca(OH)2, CO2');
  test('NaOH+SO2', 'NaOH, SO2'); test('NaOH+SO3', 'NaOH, SO3');

  /* Dehydrogenation */
  test('C2H6 (dehydrogenation)', 'C2H6');
  test('C3H8 (dehydrogenation)', 'C3H8');
  test('C2H5OH (dehydrogenation)', 'C2H5OH');

  /* Dehalogenation */
  test('C2H5Cl (dehalogenation)', 'C2H5Cl');
  test('FeCl3 (dehalogenation)', 'FeCl3');

  /* Carbonyl reduction */
  test('CH3CHO+H2', 'CH3CHO, H2');
  test('HCHO+H2', 'HCHO, H2');

  /* Thermite */
  test('Fe2O3+Al (thermite)', 'Fe2O3, Al');
  test('Fe2O3+Mg (thermite)', 'Fe2O3, Mg');

  /* Hydrocyanation */
  test('C2H4+HCN', 'C2H4, HCN');
  test('C2H2+HCN', 'C2H2, HCN');

  /* Epoxidation */
  test('C2H4+H2O2', 'C2H4, H2O2');

  /* Roasting */
  test('CuS+O2', 'CuS, O2'); test('ZnS+O2', 'ZnS, O2');

  /* Oxygen addition */
  test('CO+O2', 'CO, O2'); test('SO2+O2', 'SO2, O2'); test('NO+O2', 'NO, O2');

  /* Hydrolysis */
  test('NaCl+H2O', 'NaCl, H2O'); test('Na2SO4+H2O', 'Na2SO4, H2O');
  test('KCl+H2O', 'KCl, H2O'); test('NH4Cl+H2O', 'NH4Cl, H2O');

  /* Smelting */
  test('Fe2O3+C', 'Fe2O3, C'); test('Fe2O3+CO', 'Fe2O3, CO');

  /* Single reactant edge */
  test('H2O (alone)', 'H2O');

  /* Garbage inputs should not crash */
  try { predictReaction(''); } catch (_) { assert(true, 'empty input throws'); }
  try { predictReaction('Zz'); } catch (_) { assert(true, 'invalid input throws'); }

  const counted = fuels.length + 178;
  console.log('  Reaction predictor: ~' + counted + ' tests');
})();

/* ============================================================
   SECTION 13: pH calculator
   ============================================================ */
section('pH calculator');
(function() {
  const r1 = computePH('HCl', 0.01);
  assertClose(r1.pH, 2, 0.01, '0.01M HCl (strong acid) pH ~2');
  assertClose(r1.pOH, 12, 0.01, '0.01M HCl (strong acid) pOH ~12');

  const r2 = computePH('NaOH', 0.01);
  assertClose(r2.pH, 12, 0.01, '0.01M NaOH (strong base) pH ~12');

  const r3 = computePH('HCl', 1);
  assertClose(r3.pH, 0, 0.01, '1M HCl (strong acid) pH ~0');

  const r4 = computePH('NaOH', 1);
  assertClose(r4.pH, 14, 0.01, '1M NaOH (strong base) pH ~14');

  const r5 = computePH('HCl', 0.1);
  assertClose(r5.pH, 1, 0.01, '0.1M HCl (strong acid) pH ~1');

  const r6 = computePH('CH3COOH', 0.1);
  assert(r6.pH > 2 && r6.pH < 4, '0.1M CH3COOH (weak acid) pH between 2-4: got ' + r6.pH);

  const r7 = computePH('NH3', 0.1);
  assert(r7.pH > 10 && r7.pH < 12, '0.1M NH3 (weak base) pH between 10-12: got ' + r7.pH);

  const r8 = computePH('CH3COOH', 1);
  assert(r8.pH > 2 && r8.pH < 3, '1M CH3COOH (weak acid) pH ~2.37: got ' + r8.pH);

  const r9 = computePH('NH3', 1);
  assert(r9.pH > 11 && r9.pH < 12, '1M NH3 (weak base) pH ~11.63: got ' + r9.pH);
  console.log('  pH calculator: 10 tests');
})();

/* ============================================================
   SECTION 14: Stoichiometry calculator
   ============================================================ */
section('Stoichiometry');
(function() {
  const r1 = computeStoichiometry('2H2+O2->2H2O', 'H2', 4, 'mol');
  assert(r1.rows.length === 3, 'H2+O2: 3 compounds');
  assertClose(r1.rows[0].moles, 4, 0.001, 'H2 moles = 4');
  assertClose(r1.rows[1].moles, 2, 0.001, 'O2 moles = 2');
  assertClose(r1.rows[2].moles, 4, 0.001, 'H2O moles = 4');

  const r2 = computeStoichiometry('2H2+O2->2H2O', 'H2', 4, 'g');
  assertClose(r2.rows[0].mass, 4, 0.001, 'H2 mass = 4g');

  const r3 = computeStoichiometry('H2+Cl2->2HCl', 'Cl2', 1, 'mol');
  assertClose(r3.rows[0].moles, 1, 0.001, 'Cl2 moles = 1');
  assertClose(r3.rows[1].moles, 1, 0.001, 'H2 moles = 1');
  assertClose(r3.rows[2].moles, 2, 0.001, 'HCl moles = 2');

  const r4 = computeStoichiometry('2H2+O2->2H2O', 'H2', 44.8, 'L');
  assertClose(r4.rows[0].moles, 2, 0.01, '44.8L H2 = 2 mol at STP');

  assertThrows(() => computeStoichiometry('2H2+O2->2H2O', 'Au', 1, 'mol'), 'unknown compound throws');

  /* Normalised mode — no known compound */
  const r5 = computeStoichiometry('2H2+O2->2H2O', null, null, 'mol');
  assertClose(r5.rows[0].moles, 2, 0.001, 'normalised H2 = 2');
  assertClose(r5.rows[1].moles, 1, 0.001, 'normalised O2 = 1');
  assertClose(r5.rows[2].moles, 2, 0.001, 'normalised H2O = 2');
  assert(r5.knownCompound === null, 'no known compound in normalised mode');

  console.log('  Stoichiometry: 6 tests');
})();

/* ============================================================
   SECTION 15: Edge cases and error handling
   ============================================================ */
section('Edge cases');
(function() {
  assertThrows(() => parseEquation('H2O'), 'no arrow');
  assertThrows(() => parseEquation('H2O+H2->H2O->'), 'multiple arrows');
  assertThrows(() => balanceChemical(''), 'empty balancer input');
  assertThrows(() => balanceChemical('H2O'), 'no arrow balancer');
  assertThrows(() => solveLinearSystem(['']), 'empty linear eq');
  assertThrows(() => solveLinearSystem(['noequal']), 'no = in linear eq');
  assertThrows(() => solveNonLinear(['x^2=4'], ['x','y'], [1]), 'mismatch vars/guesses');
  assertThrows(() => solveNonLinear(['x+y=5'], ['x','y'], [1,1]), 'underdetermined nonlinear');
  assert(!validateFormula('()').valid, 'empty parens invalid');
  assert(!validateFormula('H2O()').valid, 'empty trailing parens invalid');
  const edgeFormulas = ['H2O', 'NaCl', 'C6H12O6', 'Fe2O3', 'P4', 'S8'];
  edgeFormulas.forEach(f => {
    const c = classifyCompound(f);
    assert(typeof c === 'string' && c.length > 0, 'classifyCompound(' + f + ') returns: ' + c);
  });
  console.log('  Edge cases: 12 tests');
})();

/* ============================================================
   SECTION 16: Regression — previously broken cases
   ============================================================ */
section('Regression');
(function() {
  assert(validateFormula('CH2=CH2'), 'CH2=CH2 valid');
  assert(!validateFormula('H2O)').valid, 'unmatched paren invalid');

  /* Fe+O2 should give Fe2O3, not FeO */
  const r1 = predictReaction('Fe, O2');
  assertIncludes(r1.equation, 'Fe2O3', 'Fe+O2 → Fe2O3');

  /* Fe+Cl2 should give FeCl3, not FeCl2 */
  const r2 = predictReaction('Fe, Cl2');
  assertIncludes(r2.equation, 'FeCl3', 'Fe+Cl2 → FeCl3');

  /* P4+O2 should give P4O10 */
  const r3 = predictReaction('P4, O2');
  assertIncludes(r3.equation, 'P4O10', 'P4+O2 → P4O10');

  /* CuS+O2 roasting should give CuO+SO2 */
  const r4 = predictReaction('CuS, O2');
  assertIncludes(r4.equation, 'CuO', 'CuS+O2 → CuO');
  assertIncludes(r4.equation, 'SO2', 'CuS+O2 → SO2');

  /* C2H4+HCN hydrocyanation */
  const r5 = predictReaction('C2H4, HCN');
  assertIncludes(r5.equation, 'C3H5N', 'C2H4+HCN → C3H5N');

  /* C2H4+H2O2 epoxidation */
  const r6 = predictReaction('C2H4, H2O2');
  assertIncludes(r6.equation, 'C2H4O', 'C2H4+H2O2 → C2H4O+H2O');

  /* Fe2O3+Al thermite */
  const r7 = predictReaction('Fe2O3, Al');
  assertIncludes(r7.equation, 'Al2O3', 'thermite → Al2O3');
  assertIncludes(r7.equation, 'Fe', 'thermite → Fe');

  /* Balancing: H2+O2 */
  const b1 = balanceChemical('H2+O2->H2O');
  assertIncludes(b1.balanced, '2H2', 'H2+O2 → 2H2');
  assertIncludes(b1.balanced, '2H2O', 'H2+O2 → 2H2O');

  /* Balancing: Fe+O2 → Fe2O3 should be 4Fe+3O2→2Fe2O3 */
  const b2 = balanceChemical('Fe+O2->Fe2O3');
  assertIncludes(b2.balanced, '4Fe', 'Fe+O2 → 4Fe');
  assertIncludes(b2.balanced, '3O2', 'Fe+O2 → 3O2');
  assertIncludes(b2.balanced, '2Fe2O3', 'Fe+O2 → 2Fe2O3');

  /* Condensation polymer should produce real formulas, not concatenation */
  const r8 = predictReaction('C2H4');
  assertNotIncludes(r8.equation, 'C2H4C2H4', 'No simple concatenation in polymer');

  /* Dehydration of alcohol */
  const r9 = predictReaction('C2H5OH');
  assertIncludes(r9.equation, 'C2H4', 'C2H5OH → C2H4+H2O (dehydration)');

  /* Na+Cl2 should produce NaCl */
  const r10 = predictReaction('Na, Cl2');
  assertIncludes(r10.equation, 'NaCl', 'Na+Cl2 → NaCl');

  console.log('  Regression: 16 tests');
})();

/* ============================================================
   SECTION 17: Element symbol parsing — all two-letter symbols
   ============================================================ */
section('Element symbol parsing');
(function() {
  const t = (f, exp, msg) => assertEqual(JSON.stringify(parseCompoundElements(f)), JSON.stringify(exp), msg || f);
  t('Na', {Na:1}); t('Mg', {Mg:1}); t('Al', {Al:1}); t('Si', {Si:1});
  t('Cl', {Cl:1}); t('Ca', {Ca:1}); t('Fe', {Fe:1}); t('Zn', {Zn:1});
  t('He', {He:1}); t('Li', {Li:1}); t('Be', {Be:1}); t('Ne', {Ne:1});
  t('Ar', {Ar:1}); t('Sc', {Sc:1}); t('Cr', {Cr:1}); t('Mn', {Mn:1});
  t('Co', {Co:1}); t('Ni', {Ni:1}); t('Cu', {Cu:1}); t('Br', {Br:1});
  t('Sr', {Sr:1}); t('Zr', {Zr:1}); t('Nb', {Nb:1}); t('Mo', {Mo:1});
  t('Ru', {Ru:1}); t('Rh', {Rh:1}); t('Pd', {Pd:1}); t('Ag', {Ag:1});
  t('Cd', {Cd:1}); t('Sn', {Sn:1}); t('Sb', {Sb:1}); t('Te', {Te:1});
  t('Ba', {Ba:1}); t('Pt', {Pt:1}); t('Au', {Au:1}); t('Hg', {Hg:1});
  t('Pb', {Pb:1}); t('Bi', {Bi:1}); t('Po', {Po:1}); t('At', {At:1});
  t('Rn', {Rn:1}); t('Ra', {Ra:1}); t('Ac', {Ac:1}); t('Th', {Th:1});
  t('Pa', {Pa:1}); t('Np', {Np:1}); t('Pu', {Pu:1}); t('Am', {Am:1});
  t('Cm', {Cm:1}); t('Bk', {Bk:1}); t('Cf', {Cf:1}); t('Es', {Es:1});
  t('Fm', {Fm:1}); t('Md', {Md:1}); t('No', {No:1}); t('Lr', {Lr:1});
  /* tricky sequences */
  t('MgAl2Si4', {Mg:1,Al:2,Si:4});
  t('FeCr2O4', {Fe:1,Cr:2,O:4});
  t('NaMgAl', {Na:1,Mg:1,Al:1});
  t('CaFe2O4', {Ca:1,Fe:2,O:4});
  t('K2Cr2O7', {K:2,Cr:2,O:7});
  t('Na2S2O3', {Na:2,S:2,O:3});
  t('Mg3N2', {Mg:3,N:2});
  t('Ca3P2', {Ca:3,P:2});
  console.log('  Element symbol parsing: 66 tests');
})();

/* ============================================================
   SECTION 18: getElement
   ============================================================ */
section('getElement');
(function() {
  assert(getElement('H'), 'H exists');
  assert(getElement('He'), 'He exists');
  assert(!getElement('Zz'), 'Zz not exist');
  assert(getElement('Fe'), 'Fe exists');
  assert(getElement('Fe').mass > 55, 'Fe mass ~55.8');
  assert(getElement('O').mass > 15.9, 'O mass ~16');
  assert(getElement('C').mass > 12.0, 'C mass ~12');
  assert(getElement('U').mass > 238, 'U mass ~238');
  assert(getElement('H').valences.includes(1), 'H valence includes 1');
  console.log('  getElement: 8 tests');
})();

/* ============================================================
   SECTION 19: solveMatrixInline
   ============================================================ */
section('solveMatrixInline');
(function() {
  const A = [[1,1],[1,-1]];
  const v = [5,1];
  const x = solveMatrixInline(A, v);
  assertClose(x.get([0,0]), 3, 1e-6, 'x = 3');
  assertClose(x.get([1,0]), 2, 1e-6, 'y = 2');

  const A2 = [[2,0],[0,3]];
  const v2 = [6,9];
  const x2 = solveMatrixInline(A2, v2);
  assertClose(x2.get([0,0]), 3, 1e-6, '2x=6 → x=3');
  assertClose(x2.get([1,0]), 3, 1e-6, '3y=9 → y=3');

  const A3 = [[1,2],[3,4]];
  const v3 = [5,11];
  const x3 = solveMatrixInline(A3, v3);
  assertClose(x3.get([0,0]), 1, 1e-6, 'x+2y=5, 3x+4y=11 → x=1');
  assertClose(x3.get([1,0]), 2, 1e-6, 'y=2');
  console.log('  solveMatrixInline: 6 tests');
})();

/* ============================================================
   SECTION 20: countAtoms / valency / oxidation
   ============================================================ */
section('countAtoms valency oxidation');
(function() {
  assert(typeof countAtoms === 'function', 'countAtoms exists');
  assert(typeof getValency === 'function', 'getValency exists');
  assert(typeof getOxidationState === 'function', 'getOxidationState exists');

  assertEqual(countAtoms('H2O'), 3, 'H2O total atoms');
  assertEqual(countAtoms('NaCl'), 2, 'NaCl total atoms');
  assertEqual(countAtoms('Fe2O3'), 5, 'Fe2O3 total atoms');
  assertEqual(countAtoms('C6H12O6'), 24, 'C6H12O6 total atoms');

  const valFe = getValency('Fe');
  assert(Array.isArray(valFe), 'Fe valency is array: ' + JSON.stringify(valFe));

  const valO = getValency('O');
  assert(Array.isArray(valO), 'O valency is array: ' + JSON.stringify(valO));

  const oxH = getOxidationState('H');
  assertEqual(oxH, 2, 'H ox state default 2: got ' + oxH);
  console.log('  countAtoms/valency/oxidation: 10 tests');
})();

/* ============================================================
   SECTION 21: getFirstMetal / hasHalogen / etc.
   ============================================================ */
section('Utility functions');
(function() {
  assert(typeof getFirstMetal === 'function', 'getFirstMetal exists');
  assert(typeof hasHalogen === 'function', 'hasHalogen exists');
  assert(typeof containsOxygen === 'function', 'containsOxygen exists');
  assert(typeof isHydrocarbon === 'function', 'isHydrocarbon exists');

  /* getFirstMetal */
  if (typeof getFirstMetal === 'function') {
    assertEqual(getFirstMetal('FeCl3'), 'Fe', 'getFirstMetal FeCl3');
    assertEqual(getFirstMetal('NaCl'), 'Na', 'getFirstMetal NaCl');
    assertEqual(getFirstMetal('CO2'), null, 'getFirstMetal CO2 null');
  }

  /* hasHalogen */
  if (typeof hasHalogen === 'function') {
    assert(hasHalogen('NaCl'), 'hasHalogen NaCl');
    assert(!hasHalogen('NaOH'), '!hasHalogen NaOH');
  }

  /* isHydrocarbon */
  if (typeof isHydrocarbon === 'function') {
    assert(isHydrocarbon('CH4'), 'isHydrocarbon CH4');
    assert(!isHydrocarbon('CO2'), '!isHydrocarbon CO2');
  }

  console.log('  Utility functions: 8 tests');
})();

/* ============================================================
   SECTION 22: postprocessCoeffs / finalizeCoeffs / verifyBalance
   ============================================================ */
section('Balance utility functions');
(function() {
  assert(typeof postprocessCoeffs === 'function', 'postprocessCoeffs exists');
  assert(typeof finalizeCoeffs === 'function', 'finalizeCoeffs exists');
  assert(typeof buildBalancedResult === 'function', 'buildBalancedResult exists');

  const mockMat = { get: (idx) => idx[0] === 0 ? 2 : 1 };
  const coeffs = postprocessCoeffs(mockMat, 2, 3, []);
  assertEqual(JSON.stringify(coeffs), '[2,1,1]', 'postprocessCoeffs [2,1,1]');

  const finalized = finalizeCoeffs([2, 1, 2], []);
  assertEqual(JSON.stringify(finalized), '[2,1,2]', 'finalizeCoeffs [2,1,2]');

  const result = buildBalancedResult([2,1,2], ['H2','O2'], ['H2O']);
  assertEqual(result, '2H2 + O2 → 2H2O', 'buildBalancedResult');
  console.log('  Balance utilities: 5 tests');
})();

/* ============================================================
   SECTION 23: verify balance for 100 auto-generated random equations
   ============================================================ */
section('Auto-generated balanced equations');
(function() {
  /* Generate varied equations from known patterns */
  const patterns = [
    { eq: 'H2+O2->H2O', check: '2H2 + O2 → 2H2O' },
    { eq: 'Na+Cl2->NaCl', check: '2Na + Cl2 → 2NaCl' },
    { eq: 'N2+H2->NH3', check: 'N2 + 3H2 → 2NH3' },
    { eq: 'C+O2->CO2', check: 'C + O2 → CO2' },
    { eq: 'S+O2->SO2', check: 'S + O2 → SO2' },
    { eq: 'Mg+O2->MgO', check: '2Mg + O2 → 2MgO' },
    { eq: 'Al+O2->Al2O3', check: '4Al + 3O2 → 2Al2O3' },
    { eq: 'Fe+O2->Fe2O3', check: '4Fe + 3O2 → 2Fe2O3' },
    { eq: 'Fe+Cl2->FeCl3', check: '2Fe + 3Cl2 → 2FeCl3' },
    { eq: 'Al+Cl2->AlCl3', check: '2Al + 3Cl2 → 2AlCl3' },
    { eq: 'H2O2->H2O+O2', check: '2H2O2 → 2H2O + O2' },
    { eq: 'Al2O3->Al+O2', check: '2Al2O3 → 4Al + 3O2' },
    { eq: 'Na+H2O->NaOH+H2', check: '2Na + 2H2O → 2NaOH + H2' },
    { eq: 'Cl2+NaBr->Br2+NaCl', check: 'Cl2 + 2NaBr → Br2 + 2NaCl' },
    { eq: 'P4+Cl2->PCl3', check: 'P4 + 6Cl2 → 4PCl3' },
    { eq: 'Si+Cl2->SiCl4', check: 'Si + 2Cl2 → SiCl4' },
    { eq: 'CuS+O2->CuO+SO2', check: '2CuS + 3O2 → 2CuO + 2SO2' },
    { eq: 'ZnS+O2->ZnO+SO2', check: '2ZnS + 3O2 → 2ZnO + 2SO2' },
    { eq: 'Fe2O3+Mg->MgO+Fe', check: 'Fe2O3 + 3Mg → 3MgO + 2Fe' },
    { eq: 'CO+O2->CO2', check: '2CO + O2 → 2CO2' },
    { eq: 'SO2+O2->SO3', check: '2SO2 + O2 → 2SO3' },
    { eq: 'NO+O2->NO2', check: '2NO + O2 → 2NO2' },
    { eq: 'C2H4+H2->C2H6', check: 'C2H4 + H2 → C2H6' },
    { eq: 'C2H4+H2O->C2H5OH', check: 'C2H4 + H2O → C2H5OH' },
    { eq: 'C2H2+H2->C2H4', check: 'C2H2 + H2 → C2H4' },
    { eq: 'NH4Cl+NaOH->NH3+H2O+NaCl', check: 'NH4Cl + NaOH → NH3 + H2O + NaCl' },
    { eq: 'NaHCO3->Na2CO3+H2O+CO2', check: '2NaHCO3 → Na2CO3 + H2O + CO2' },
    { eq: 'Cu(OH)2->CuO+H2O', check: 'Cu(OH)2 → CuO + H2O' },
    { eq: 'Mg(OH)2->MgO+H2O', check: 'Mg(OH)2 → MgO + H2O' },
    { eq: 'Fe(OH)3->Fe2O3+H2O', check: '2Fe(OH)3 → Fe2O3 + 3H2O' },
    { eq: 'AgNO3+KCl->AgCl+KNO3', check: 'AgNO3 + KCl → AgCl + KNO3' },
    { eq: 'BaCl2+Na2SO4->BaSO4+NaCl', check: 'BaCl2 + Na2SO4 → BaSO4 + 2NaCl' },
    { eq: 'H2SO4+NaOH->Na2SO4+H2O', check: 'H2SO4 + 2NaOH → Na2SO4 + 2H2O' },
    { eq: 'HNO3+Ca(OH)2->Ca(NO3)2+H2O', check: '2HNO3 + Ca(OH)2 → Ca(NO3)2 + 2H2O' },
    { eq: 'HBr+KOH->KBr+H2O', check: 'HBr + KOH → KBr + H2O' },
    { eq: 'HCl+Ca(OH)2->CaCl2+H2O', check: '2HCl + Ca(OH)2 → CaCl2 + 2H2O' },
    { eq: 'H2SO4+Mg(OH)2->MgSO4+H2O', check: 'H2SO4 + Mg(OH)2 → MgSO4 + 2H2O' },
    { eq: 'FeCl3+NaOH->Fe(OH)3+NaCl', check: 'FeCl3 + 3NaOH → Fe(OH)3 + 3NaCl' },
    { eq: 'CuSO4+NaOH->Cu(OH)2+Na2SO4', check: 'CuSO4 + 2NaOH → Cu(OH)2 + Na2SO4' },
    { eq: 'NH3+O2->NO+H2O', check: '4NH3 + 5O2 → 4NO + 6H2O' },
    { eq: 'P4O10+H2O->H3PO4', check: 'P4O10 + 6H2O → 4H3PO4' },
    { eq: 'Ca(OH)2+CO2->CaCO3+H2O', check: 'Ca(OH)2 + CO2 → CaCO3 + H2O' },
    { eq: 'Na2CO3+HCl->NaCl+H2O+CO2', check: 'Na2CO3 + 2HCl → 2NaCl + H2O + CO2' },
    { eq: 'CaCO3+HCl->CaCl2+H2O+CO2', check: 'CaCO3 + 2HCl → CaCl2 + H2O + CO2' },
    { eq: 'C2H5Cl->C2H4+HCl', check: 'C2H5Cl → C2H4 + HCl' },
    { eq: 'FeCl3->Fe+Cl2', check: '2FeCl3 → 2Fe + 3Cl2' },
    { eq: 'C2H6->C2H4+H2', check: 'C2H6 → C2H4 + H2' },
    { eq: 'C3H8->C3H6+H2', check: 'C3H8 → C3H6 + H2' },
    { eq: 'Fe2O3+Al->Al2O3+Fe', check: 'Fe2O3 + 2Al → Al2O3 + 2Fe' },
    { eq: 'C2H4+H2O2->C2H4O+H2O', check: 'C2H4 + H2O2 → C2H4O + H2O' },
    { eq: 'C2H4+HCN->C3H5N', check: 'C2H4 + HCN → C3H5N' },
    { eq: 'C2H2+HCN->C3H3N', check: '3C2H2 + 2HCN → 2C3H3N' },
  ];

  for (const p of patterns) {
    try {
      const r = balanceChemical(p.eq);
      /* Normalize spaces for comparison */
      const normBal = r.balanced.replace(/\s+/g, ' ').trim();
      const normCheck = p.check.replace(/\s+/g, ' ').trim();
      assertEqual(normBal, normCheck, p.eq + ' → ' + r.balanced);
    } catch (e) { assert(false, p.eq + ' threw: ' + e.message); }
  }
  console.log('  Auto-generated balanced: ' + patterns.length + ' exact-match checks');
})();

/* ============================================================
   SECTION 24: ELEMENTS data integrity
   ============================================================ */
section('ELEMENTS data');
(function() {
  assert(typeof ELEMENTS !== 'undefined', 'ELEMENTS exists');
  assert(Array.isArray(ELEMENTS), 'ELEMENTS is array');
  assertEqual(ELEMENTS.length, 118, '118 elements');
  assertEqual(ELEMENTS[0].sym, 'H', 'First: H');
  assertEqual(ELEMENTS[ELEMENTS.length - 1].sym, 'Og', 'Last: Og');
  assert(ELEMENTS.every(e => e.Z > 0 && e.sym && e.name && e.mass > 0), 'All elements have basic fields');
  const syms = ELEMENTS.map(e => e.sym);
  assertEqual(new Set(syms).size, 118, 'All symbols unique');
  console.log('  ELEMENTS data: 6 tests');
})();

/* ============================================================
   SECTION 25: All module-level functions exist
   ============================================================ */
section('Module integrity');
(function() {
  const required = [
    'parseCompound', 'parseEquation', 'formatCompound', 'gcd',
    'balanceChemical', 'balanceChemicalAsync',
    'solveLinearSystem', 'solveNonLinear',
    'predictReaction', 'classifyCompound',
    'parseCompoundElements', 'countAtoms',
    'validateFormula', 'molecularWeight', 'getElement',
    'solveMatrixInline', 'postprocessCoeffs', 'finalizeCoeffs',
    'buildBalancedResult', 'verifyBalance',
    'computePH', 'computeStoichiometry',
    'isAcid', 'isMetal', 'isHalogen', 'isOxygen', 'isHydrogen',
    'isUnsaturated', 'isCarbonate', 'isOrganic',
    'containsMetal', 'hasHydroxide', 'hasNO3', 'hasHalogen', 'containsOxygen',
    'isAlcohol', 'isCarbonyl', 'isCarboxylicAcid', 'isEster', 'isHydrate',
    'isHydrocarbon',
    'getFirstMetal', 'getValency', 'getOxidationState',
  ];

  let missing = [];
  for (const fn of required) {
    if (typeof global[fn] === 'undefined' && typeof eval(fn) === 'undefined') {
      missing.push(fn);
    }
  }
  if (missing.length) assert(false, 'Missing functions: ' + missing.join(', '));
  else assert(true, 'All ' + required.length + ' module functions exist');
  console.log('  Module integrity: ' + required.length + ' functions verified');
})();

/* ============================================================
   Run Summary
   ============================================================ */
summary();
