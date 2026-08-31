/**
 * Tests for src/utils/parser.js
 * Covers parseCompound, parseEquation, molecularWeight
 */

const { parseCompound, parseEquation, molecularWeight, getElements } = require('../src/utils/parser');

describe('parseCompound', () => {

  // H2O
  test('parseCompound("H2O") returns H:2, O:1', () => {
    const r = parseCompound('H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { H: 2, O: 1 });
  });

  // NaCl
  test('parseCompound("NaCl") returns Na:1, Cl:1', () => {
    const r = parseCompound('NaCl');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Na: 1, Cl: 1 });
  });

  // Ca(OH)2 - parentheses
  test('parseCompound("Ca(OH)2") returns Ca:1, O:2, H:2', () => {
    const r = parseCompound('Ca(OH)2');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Ca: 1, O: 2, H: 2 });
  });

  // Al2(SO4)3
  test('parseCompound("Al2(SO4)3") returns Al:2, S:3, O:12', () => {
    const r = parseCompound('Al2(SO4)3');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Al: 2, S: 3, O: 12 });
  });

  // CuSO4.5H2O - hydrate
  test('parseCompound("CuSO4.5H2O") handles hydrate with .', () => {
    const r = parseCompound('CuSO4.5H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Cu: 1, S: 1, O: 9, H: 10 });
  });

  // [Cu(NH3)4]SO4 - brackets
  test('parseCompound("[Cu(NH3)4]SO4") handles brackets', () => {
    const r = parseCompound('[Cu(NH3)4]SO4');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Cu: 1, N: 4, H: 12, S: 1, O: 4 });
  });

  // Fe3[Fe(CN)6]2
  test('parseCompound("Fe3[Fe(CN)6]2") handles complex brackets', () => {
    const r = parseCompound('Fe3[Fe(CN)6]2');
    assert.strictEqual(r.isValid, true);
    // 3 Fe (outer) + 2 Fe (inner) = 5 Fe, 2*6=12 C, 2*6=12 N
    assert.deepStrictEqual(r.elements, { Fe: 5, C: 12, N: 12 });
  });

  // SO4^2- with charge
  test('parseCompound("SO4^2-") extracts charge', () => {
    const r = parseCompound('SO4^2-');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { S: 1, O: 4 });
    assert.strictEqual(r.charge, -2);
  });

  // Fe^3+
  test('parseCompound("Fe^3+") extracts positive charge', () => {
    const r = parseCompound('Fe^3+');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Fe: 1 });
    assert.strictEqual(r.charge, 3);
  });

  // Cl^- (single negative)
  test('parseCompound("Cl^-") extracts single negative charge', () => {
    const r = parseCompound('Cl^-');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Cl: 1 });
    assert.strictEqual(r.charge, -1);
  });

  // NO3^-
  test('parseCompound("NO3^-") handles polyatomic with charge', () => {
    const r = parseCompound('NO3^-');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { N: 1, O: 3 });
    assert.strictEqual(r.charge, -1);
  });

  // Weird inputs
  test('parseCompound("") returns invalid', () => {
    const r = parseCompound('');
    assert.strictEqual(r.isValid, false);
  });

  test('parseCompound("  ") returns invalid', () => {
    const r = parseCompound('   ');
    assert.strictEqual(r.isValid, false);
  });

  test('parseCompound(null) returns invalid', () => {
    const r = parseCompound(null);
    assert.strictEqual(r.isValid, false);
  });

  test('parseCompound("XxY") returns invalid (unknown element)', () => {
    const r = parseCompound('XxY');
    assert.strictEqual(r.isValid, false);
  });

  test('parseCompound("H2(O") returns invalid (unmatched paren)', () => {
    const r = parseCompound('H2(O');
    assert.strictEqual(r.isValid, false);
  });

  // Single element
  test('parseCompound("Fe") returns Fe:1', () => {
    const r = parseCompound('Fe');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Fe: 1 });
  });

  // Mixed case element
  test('parseCompound("Na2CO3") returns Na:2, C:1, O:3', () => {
    const r = parseCompound('Na2CO3');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Na: 2, C: 1, O: 3 });
  });

  test('parseCompound("Fe2O3") returns Fe:2, O:3', () => {
    const r = parseCompound('Fe2O3');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.elements, { Fe: 2, O: 3 });
  });
});

describe('parseEquation', () => {

  // 2H2 + O2 -> 2H2O
  test('parseEquation("2H2 + O2 -> 2H2O") splits correctly', () => {
    const r = parseEquation('2H2 + O2 -> 2H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['2H2', 'O2']);
    assert.deepStrictEqual(r.products, ['2H2O']);
  });

  // → arrow
  test('parseEquation("H2 + O2 → H2O") handles → arrow', () => {
    const r = parseEquation('H2 + O2 → H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['H2', 'O2']);
    assert.deepStrictEqual(r.products, ['H2O']);
  });

  // + signs
  test('parseEquation("H2+O2->H2O") works without spaces', () => {
    const r = parseEquation('H2+O2->H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['H2', 'O2']);
    assert.deepStrictEqual(r.products, ['H2O']);
  });

  // Plain (no coefficients, no spaces)
  test('parseEquation("Fe+O2->Fe2O3") returns parsed', () => {
    const r = parseEquation('Fe+O2->Fe2O3');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['Fe', 'O2']);
    assert.deepStrictEqual(r.products, ['Fe2O3']);
  });

  // <-> equilibrium
  test('parseEquation("N2 + 3H2 <-> 2NH3") handles equilibrium arrow', () => {
    const r = parseEquation('N2 + 3H2 <-> 2NH3');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['N2', '3H2']);
    assert.deepStrictEqual(r.products, ['2NH3']);
  });

  // No arrow
  test('parseEquation("H2O") without arrow returns invalid', () => {
    const r = parseEquation('H2O');
    assert.strictEqual(r.isValid, false);
  });

  // Empty
  test('parseEquation("") returns invalid', () => {
    const r = parseEquation('');
    assert.strictEqual(r.isValid, false);
  });

  // Multiple products
  test('parseEquation("CH4 + O2 -> CO2 + H2O") has 2 products', () => {
    const r = parseEquation('CH4 + O2 -> CO2 + H2O');
    assert.strictEqual(r.isValid, true);
    assert.deepStrictEqual(r.reactants, ['CH4', 'O2']);
    assert.deepStrictEqual(r.products, ['CO2', 'H2O']);
  });

  test('parseEquation preserves original text', () => {
    const r = parseEquation('2H2 + O2 -> 2H2O');
    assert.strictEqual(r.original, '2H2 + O2 -> 2H2O');
  });
});

describe('molecularWeight', () => {

  // H2O = 18.015
  test('molecularWeight("H2O") ≈ 18.015', () => {
    const r = molecularWeight('H2O');
    assert.ok(Math.abs(r.weight - 18.015) < 0.01, `expected ~18.015, got ${r.weight}`);
  });

  // NaCl = 58.44
  test('molecularWeight("NaCl") ≈ 58.44', () => {
    const r = molecularWeight('NaCl');
    assert.ok(Math.abs(r.weight - 58.44) < 0.05, `expected ~58.44, got ${r.weight}`);
  });

  // C6H12O6 = 180.16
  test('molecularWeight("C6H12O6") ≈ 180.16', () => {
    const r = molecularWeight('C6H12O6');
    assert.ok(Math.abs(r.weight - 180.16) < 0.05, `expected ~180.16, got ${r.weight}`);
  });

  // CO2
  test('molecularWeight("CO2") ≈ 44.01', () => {
    const r = molecularWeight('CO2');
    assert.ok(Math.abs(r.weight - 44.01) < 0.05);
  });

  // Na2CO3
  test('molecularWeight("Na2CO3") ≈ 105.99', () => {
    const r = molecularWeight('Na2CO3');
    assert.ok(r.weight > 100 && r.weight < 110, `expected ~106, got ${r.weight}`);
  });

  // Ca(OH)2
  test('molecularWeight("Ca(OH)2") ≈ 74.09', () => {
    const r = molecularWeight('Ca(OH)2');
    // Ca: 40.08, O*2: 32, H*2: 2.016 → 74.096
    assert.ok(Math.abs(r.weight - 74.09) < 0.5, `expected ~74.09, got ${r.weight}`);
  });

  // Fe = 55.85
  test('molecularWeight("Fe") ≈ 55.85', () => {
    const r = molecularWeight('Fe');
    assert.ok(Math.abs(r.weight - 55.85) < 0.05);
  });

  // Breakdown
  test('molecularWeight returns a breakdown array', () => {
    const r = molecularWeight('H2O');
    assert.ok(Array.isArray(r.breakdown));
    assert.strictEqual(r.breakdown.length, 2);
    assert.strictEqual(r.breakdown[0].element, 'H');
    assert.strictEqual(r.breakdown[0].count, 2);
  });

  // Invalid formula throws
  test('molecularWeight("XxY") throws', () => {
    assert.throws(() => molecularWeight('XxY'), /Invalid formula/);
  });

  // getElements
  test('getElements("H2O") returns ["H", "O"]', () => {
    const els = getElements('H2O');
    assert.ok(els.includes('H'));
    assert.ok(els.includes('O'));
    assert.strictEqual(els.length, 2);
  });

  test('molecularWeight("Al2(SO4)3") ≈ 342.15', () => {
    const r = molecularWeight('Al2(SO4)3');
    // Al: 26.98*2 = 53.96, S: 32.07*3 = 96.21, O: 16*12 = 192
    // Total: 342.17
    assert.ok(Math.abs(r.weight - 342.15) < 1.0, `expected ~342.15, got ${r.weight}`);
  });
});
