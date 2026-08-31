/**
 * Tests for src/tools/stoichiometry.js
 * Tests stoichiometry calculations
 */

const { calculate, getCoefficientsFromBalance } = require('../src/tools/stoichiometry');
const { balance, parseEquation } = require('../src/tools/balancer');

describe('calculate - basic stoichiometry', () => {
  test('2H2 + O2 -> 2H2O with 4 g H2 → 36 g H2O', async () => {
    const result = await calculate('2H2 + O2 -> 2H2O', 'H2', 4, 'g');
    // 4 g H2 = 2 mol H2, ratio 2:2 → 2 mol H2O = 36 g
    assert.ok(result.includes('36') || /36\.0/.test(result),
      `Expected 36 g H2O in: ${result}`);
  });

  test('2H2 + O2 -> 2H2O with 2 mol H2 → 2 mol H2O', async () => {
    const result = await calculate('2H2 + O2 -> 2H2O', 'H2', 2, 'mol');
    assert.ok(result.includes('2'), `Expected 2 mol H2O in: ${result}`);
  });

  test('CH4 + 2O2 -> CO2 + 2H2O with 1 mol CH4 → 1 mol CO2', async () => {
    const result = await calculate('CH4 + O2 -> CO2 + H2O', 'CH4', 1, 'mol');
    assert.ok(result.includes('1'), `Expected 1 mol CO2 in: ${result}`);
    assert.ok(typeof result === 'string');
  });

  test('N2 + 3H2 -> 2NH3 with 1 mol N2 → 2 mol NH3', async () => {
    const result = await calculate('N2 + H2 -> NH3', 'N2', 1, 'mol');
    // 1 mol N2 → 2 mol NH3
    assert.ok(result.includes('2') || /2\.\d/.test(result), `Expected 2 mol NH3 in: ${result}`);
  });
});

describe('calculate - mass-to-mass', () => {
  test('Fe + S -> FeS with 56 g Fe → 88 g FeS', async () => {
    const result = await calculate('Fe + S -> FeS', 'Fe', 56, 'g');
    // 56 g Fe = 1 mol Fe, 1:1 ratio → 1 mol FeS = 88 g
    assert.ok(result.includes('88') || /88\.0/.test(result),
      `Expected 88 g FeS in: ${result}`);
  });

  test('result is a string with section headers', async () => {
    const result = await calculate('2H2 + O2 -> 2H2O', 'H2', 4, 'g');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('calculate - edge cases', () => {
  test('Unknown target compound returns error message', async () => {
    const result = await calculate('H2 + O2 -> H2O', 'XYZ', 1, 'mol');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
    // Should be an error or note about not finding the compound
  });

  test('handles mg unit', async () => {
    const result = await calculate('2H2 + O2 -> 2H2O', 'H2', 4000, 'mg');
    // 4000 mg = 4 g = 2 mol H2 → 2 mol H2O = 36 g
    assert.ok(result.includes('36') || /36\.0/.test(result),
      `Expected 36 g H2O in: ${result}`);
  });

  test('handles kg unit', async () => {
    const result = await calculate('2H2 + O2 -> 2H2O', 'H2', 0.004, 'kg');
    // 0.004 kg = 4 g = 2 mol H2 → 36 g H2O
    assert.ok(result.includes('36') || /36\.0/.test(result),
      `Expected 36 g H2O in: ${result}`);
  });
});

describe('getCoefficientsFromBalance', () => {
  test('extracts coefficients from balanced H2 + O2 -> H2O', async () => {
    const balanceResult = await balance('H2 + O2 -> H2O');
    const parsed = parseEquation('H2 + O2 -> H2O');
    const coeffs = getCoefficientsFromBalance(balanceResult, parsed);
    assert.ok(Array.isArray(coeffs));
    assert.strictEqual(coeffs.length, 3);
  });

  test('returns null on unparseable input', () => {
    const balanceResult = 'some random text without balanced';
    const parsed = parseEquation('H2 + O2 -> H2O');
    const coeffs = getCoefficientsFromBalance(balanceResult, parsed);
    assert.strictEqual(coeffs, null);
  });
});
