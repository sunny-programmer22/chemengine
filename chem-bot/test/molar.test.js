/**
 * Tests for src/tools/molar.js
 * Tests molar mass calculation
 */

const { calculate, calculateMolarMass, parseFormula } = require('../src/tools/molar');

describe('calculateMolarMass', () => {
  test('H2O ≈ 18.015 g/mol', () => {
    const { total } = calculateMolarMass('H2O');
    assert.ok(Math.abs(total - 18.015) < 0.05, `expected ~18.015, got ${total}`);
  });

  test('NaCl ≈ 58.44 g/mol', () => {
    const { total } = calculateMolarMass('NaCl');
    assert.ok(Math.abs(total - 58.44) < 0.5, `expected ~58.44, got ${total}`);
  });

  test('C6H12O6 ≈ 180.16 g/mol', () => {
    const { total } = calculateMolarMass('C6H12O6');
    assert.ok(Math.abs(total - 180.16) < 0.5, `expected ~180.16, got ${total}`);
  });

  test('Ca(OH)2 ≈ 74.09 g/mol', () => {
    const { total } = calculateMolarMass('Ca(OH)2');
    assert.ok(Math.abs(total - 74.09) < 0.5, `expected ~74.09, got ${total}`);
  });

  test('returns breakdown array', () => {
    const r = calculateMolarMass('H2O');
    assert.ok(Array.isArray(r.breakdown));
    assert.strictEqual(r.breakdown.length, 2);
    assert.strictEqual(r.breakdown[0].element, 'H');
    assert.strictEqual(r.breakdown[0].count, 2);
    assert.strictEqual(r.breakdown[0].weight, 1.008);
  });

  test('throws on unknown element', () => {
    assert.throws(() => calculateMolarMass('XxY'), /Unknown element/);
  });
});

describe('parseFormula', () => {
  test('parseFormula("H2O") returns H:2, O:1', () => {
    const r = parseFormula('H2O');
    assert.deepStrictEqual(r, { H: 2, O: 1 });
  });

  test('parseFormula("NaCl") returns Na:1, Cl:1', () => {
    const r = parseFormula('NaCl');
    assert.deepStrictEqual(r, { Na: 1, Cl: 1 });
  });

  test('parseFormula("Ca(OH)2") handles parentheses', () => {
    const r = parseFormula('Ca(OH)2');
    assert.deepStrictEqual(r, { Ca: 1, O: 2, H: 2 });
  });

  test('parseFormula("Al2(SO4)3") returns correct counts', () => {
    const r = parseFormula('Al2(SO4)3');
    assert.deepStrictEqual(r, { Al: 2, S: 3, O: 12 });
  });
});

describe('calculate - formatted string output', () => {
  test('H2O result contains "Molar Mass"', async () => {
    const result = await calculate('H2O');
    assert.ok(result.includes('Molar Mass'), `Expected "Molar Mass" in: ${result}`);
  });

  test('H2O result contains the value 18.015', async () => {
    const result = await calculate('H2O');
    assert.ok(/18\.0[12]\d?/.test(result), `Expected ~18.015 in: ${result}`);
  });

  test('NaCl result contains "Molar Mass"', async () => {
    const result = await calculate('NaCl');
    assert.ok(result.includes('Molar Mass'), `Expected "Molar Mass" in: ${result}`);
  });

  test('NaCl result contains 58.44', async () => {
    const result = await calculate('NaCl');
    assert.ok(/58\.4[34]/.test(result), `Expected ~58.44 in: ${result}`);
  });

  test('C6H12O6 result contains 180.16', async () => {
    const result = await calculate('C6H12O6');
    assert.ok(/180\.1[56]/.test(result), `Expected ~180.16 in: ${result}`);
  });

  test('Ca(OH)2 result contains 74.09', async () => {
    const result = await calculate('Ca(OH)2');
    assert.ok(/74\.[01]\d/.test(result), `Expected ~74.09 in: ${result}`);
  });

  test('Result includes element names', async () => {
    const result = await calculate('H2O');
    assert.ok(result.includes('H'), `Expected H in: ${result}`);
    assert.ok(result.includes('O'), `Expected O in: ${result}`);
  });

  test('Result includes the formula', async () => {
    const result = await calculate('NaCl');
    assert.ok(result.includes('NaCl'), `Expected NaCl in: ${result}`);
  });

  test('Result includes g/mol unit', async () => {
    const result = await calculate('H2O');
    assert.ok(result.includes('g/mol'), `Expected g/mol in: ${result}`);
  });
});
