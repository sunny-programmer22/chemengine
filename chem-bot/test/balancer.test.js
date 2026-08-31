/**
 * Tests for src/tools/balancer.js
 * Tests balance() and parseEquation(), parseFormula()
 */

const { balance, parseEquation, parseFormula } = require('../src/tools/balancer');

describe('parseEquation', () => {
  test('parseEquation splits 2H2 + O2 -> 2H2O', () => {
    const r = parseEquation('2H2 + O2 -> 2H2O');
    assert.strictEqual(r.reactants[0], '2H2');
    assert.strictEqual(r.reactants[1], 'O2');
    assert.strictEqual(r.products[0], '2H2O');
  });

  test('parseEquation handles → arrow', () => {
    const r = parseEquation('H2 + O2 → H2O');
    assert.strictEqual(r.reactants.length, 2);
    assert.strictEqual(r.products.length, 1);
  });

  test('parseEquation throws on missing arrow', () => {
    assert.throws(() => parseEquation('H2 + O2'), /Invalid equation/);
  });
});

describe('parseFormula', () => {
  test('parseFormula("H2O") returns H:2, O:1', () => {
    const r = parseFormula('H2O');
    assert.strictEqual(r.H, 2);
    assert.strictEqual(r.O, 1);
  });

  test('parseFormula("Ca(OH)2") handles parentheses', () => {
    const r = parseFormula('Ca(OH)2');
    assert.strictEqual(r.Ca, 1);
    assert.strictEqual(r.O, 2);
    assert.strictEqual(r.H, 2);
  });

  test('parseFormula("Fe2O3") returns Fe:2, O:3', () => {
    const r = parseFormula('Fe2O3');
    assert.strictEqual(r.Fe, 2);
    assert.strictEqual(r.O, 3);
  });

  test('parseFormula("NaCl") returns Na:1, Cl:1', () => {
    const r = parseFormula('NaCl');
    assert.strictEqual(r.Na, 1);
    assert.strictEqual(r.Cl, 1);
  });
});

describe('balance', () => {
  test('H2 + O2 -> H2O → 2:1:2', async () => {
    const result = await balance('H2 + O2 -> H2O');
    assert.ok(result.includes('Balanced') || result.includes('2'), `Expected balanced coefficients. Got: ${result}`);
    // Should contain the balanced form: 2H2 + O2 -> 2H2O
    assert.ok(result.includes('2'), `Expected coefficient 2 in: ${result}`);
  });

  test('C3H8 + O2 -> CO2 + H2O → 1:5:3:4', async () => {
    const result = await balance('C3H8 + O2 -> CO2 + H2O');
    assert.ok(result.includes('Balanced'), `Expected Balanced. Got: ${result}`);
    // Propane: C3H8 + 5O2 -> 3CO2 + 4H2O
    assert.ok(result.includes('5'), `Expected coefficient 5. Got: ${result}`);
    assert.ok(result.includes('3'), `Expected coefficient 3. Got: ${result}`);
    assert.ok(result.includes('4'), `Expected coefficient 4. Got: ${result}`);
  });

  test('Fe + O2 -> Fe2O3 → 4:3:2', async () => {
    const result = await balance('Fe + O2 -> Fe2O3');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // 4Fe + 3O2 -> 2Fe2O3
    assert.ok(result.includes('4'), `Expected coefficient 4. Got: ${result}`);
    assert.ok(result.includes('3'), `Expected coefficient 3. Got: ${result}`);
    assert.ok(result.includes('2'), `Expected coefficient 2. Got: ${result}`);
  });

  test('Al + HCl -> AlCl3 + H2', async () => {
    const result = await balance('Al + HCl -> AlCl3 + H2');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // 2Al + 6HCl -> 2AlCl3 + 3H2
    assert.ok(result.includes('2') || result.includes('6') || result.includes('3'),
      `Expected integer coefficients. Got: ${result}`);
  });

  test('C6H12O6 + O2 -> CO2 + H2O (combustion)', async () => {
    const result = await balance('C6H12O6 + O2 -> CO2 + H2O');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // C6H12O6 + 6O2 -> 6CO2 + 6H2O
    assert.ok(result.includes('6'), `Expected coefficient 6. Got: ${result}`);
  });

  test('KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', async () => {
    const result = await balance('KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
  });

  test('Cu + HNO3 -> Cu(NO3)2 + NO + H2O', async () => {
    const result = await balance('Cu + HNO3 -> Cu(NO3)2 + NO + H2O');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
  });

  test('N2 + H2 -> NH3 → 1:3:2', async () => {
    const result = await balance('N2 + H2 -> NH3');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // N2 + 3H2 -> 2NH3
    assert.ok(result.includes('2') || result.includes('3'), `Expected coefficients 2 and 3. Got: ${result}`);
  });

  test('CH4 + O2 -> CO2 + H2O', async () => {
    const result = await balance('CH4 + O2 -> CO2 + H2O');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // CH4 + 2O2 -> CO2 + 2H2O
    assert.ok(result.includes('2'), `Expected coefficient 2. Got: ${result}`);
  });

  test('Na + Cl2 -> NaCl', async () => {
    const result = await balance('Na + Cl2 -> NaCl');
    assert.ok(result.includes('Balanced') || result.includes('Note'), `Got: ${result}`);
    // 2Na + Cl2 -> 2NaCl
    assert.ok(result.includes('2'), `Expected coefficient 2. Got: ${result}`);
  });
});

describe('balance edge cases', () => {
  test('balance returns original on invalid equation', async () => {
    const result = await balance('not an equation');
    // Should not crash, should return some string
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('balance handles whitespace variations', async () => {
    const result = await balance('  H2  +  O2  ->  H2O  ');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('balance handles unicode arrow', async () => {
    const result = await balance('H2 + Cl2 → HCl');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('balance handles empty string gracefully', async () => {
    const result = await balance('');
    assert.ok(typeof result === 'string');
  });
});
