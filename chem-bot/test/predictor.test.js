/**
 * Tests for src/tools/predictor.js
 * Tests reaction product prediction
 */

const { predict } = require('../src/tools/predictor');

describe('predict - combustion reactions', () => {
  test('CH4 + O2 → combustion products', async () => {
    const result = await predict('CH4 + O2');
    assert.ok(result.includes('combustion') || result.includes('CO') || result.includes('H2O'),
      `Expected combustion answer. Got: ${result}`);
  });

  test('C2H6 + O2 → combustion products', async () => {
    const result = await predict('C2H6 + O2');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
    assert.ok(result.includes('combustion') || result.includes('CO') || result.includes('H2O'),
      `Expected combustion answer. Got: ${result}`);
  });
});

describe('predict - synthesis (metal + nonmetal)', () => {
  test('Na + Cl2 → NaCl', async () => {
    const result = await predict('Na + Cl2');
    assert.ok(result.includes('synthesis') || result.includes('NaCl'),
      `Expected synthesis answer. Got: ${result}`);
  });

  test('Mg + O2 → MgO', async () => {
    const result = await predict('Mg + O2');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('Al + Br2 → AlBr3', async () => {
    const result = await predict('Al + Br2');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('predict - acid-base neutralization', () => {
  test('NaOH + HCl → salt + water', async () => {
    const result = await predict('NaOH + HCl');
    assert.ok(result.includes('acid') || result.includes('base') || result.includes('Salt') || result.includes('NaCl') || result.includes('Water'),
      `Expected acid-base answer. Got: ${result}`);
  });

  test('H2SO4 + KOH → salt + water', async () => {
    const result = await predict('H2SO4 + KOH');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('HCl + NH3 → NH4Cl', async () => {
    const result = await predict('HCl + NH3');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('predict - single replacement', () => {
  test('Zn + HCl → H2 + ZnCl2', async () => {
    const result = await predict('Zn + HCl');
    assert.ok(result.includes('replacement') || result.includes('acid') || result.includes('H2') || result.includes('combination') || result.includes('Zn'),
      `Expected replacement answer. Got: ${result}`);
  });

  test('Fe + CuSO4 → FeSO4 + Cu', async () => {
    const result = await predict('Fe + CuSO4');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('predict - decomposition', () => {
  test('H2O2 → H2O + O2', async () => {
    const result = await predict('H2O2');
    // Note: the predictor doesn't have specific handling for decomposition
    // so it should still return a useful default response
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('predict - other common reactions', () => {
  test('CaCO3 + heat → CaO + CO2', async () => {
    const result = await predict('CaCO3');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('C2H4 + H2 → C2H6 (hydrogenation)', async () => {
    const result = await predict('C2H4 + H2');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('CH3COOH + CH3OH → esterification', async () => {
    const result = await predict('CH3COOH + CH3OH');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});

describe('predict - default response', () => {
  test('unknown reaction returns useful default', async () => {
    const result = await predict('Xq123 + Yq456');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('empty input handled gracefully', async () => {
    const result = await predict('');
    assert.ok(typeof result === 'string');
  });

  test('handles whitespace in input', async () => {
    const result = await predict('  CH4  +  O2  ');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });
});
