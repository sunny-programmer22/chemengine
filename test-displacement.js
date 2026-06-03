/* Test harness for chem-predict.js displacement reactions */
const math = require('mathjs');

// Mock minimal document for DOMContentLoaded guard
global.document = { addEventListener: () => {} };
global.math = math;

// Load and evaluate the predictor
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/js/chem-predict.js', 'utf8');
eval(code);

// Test function
function test(label, input) {
  try {
    const result = predictReaction(input);
    console.log(`  ${label}: [${result.type}] ${result.equation}`);
    return { ok: true, type: result.type, eq: result.equation };
  } catch (e) {
    console.log(`  ${label}: [ERROR] ${e.message}`);
    return { ok: false, error: e.message };
  }
}

console.log('===================================================================');
console.log(' DISPLACEMENT REACTION TESTS');
console.log('===================================================================');

console.log('\n--- Metal + Acid (Single Displacement) ---');
test('Zn + HCl', 'Zn, HCl');
test('Mg + HCl', 'Mg, HCl');
test('Fe + HCl', 'Fe, HCl');
test('Al + HCl', 'Al, HCl');
test('Cu + HCl', 'Cu, HCl');
test('Ag + HCl', 'Ag, HCl');

console.log('\n--- Metal + H2O (Single Displacement) ---');
test('Na + H2O', 'Na, H2O');
test('K + H2O', 'K, H2O');
test('Ca + H2O', 'Ca, H2O');
test('Mg + H2O', 'Mg, H2O');

console.log('\n--- Metal + Salt (Metal Displacement) ---');
test('Fe + CuSO4', 'Fe, CuSO4');
test('Zn + CuSO4', 'Zn, CuSO4');
test('Cu + FeSO4', 'Cu, FeSO4');
test('Fe + AgNO3', 'Fe, AgNO3');
test('Cu + AgNO3', 'Cu, AgNO3');

console.log('\n--- Halogen Displacement ---');
test('NaBr + Cl2', 'NaBr, Cl2');
test('NaCl + Br2', 'NaCl, Br2');
test('NaCl + F2', 'NaCl, F2');
test('KI + Cl2', 'KI, Cl2');

console.log('\n--- Metal + Sulfuric Acid ---');
test('Mg + H2SO4', 'Mg, H2SO4');
test('Fe + H2SO4', 'Fe, H2SO4');
test('Al + H2SO4', 'Al, H2SO4');

console.log('\n===================================================================');
console.log(' COMPLETE');
console.log('===================================================================');
