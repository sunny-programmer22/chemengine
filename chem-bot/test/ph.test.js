/**
 * Tests for src/tools/ph.js
 * Tests pH calculation for acids, bases, weak acids
 */

const { calculate, STRONG_ACIDS, STRONG_BASES, WEAK_ACIDS } = require('../src/tools/ph');

describe('strong acids', () => {
  test('HCl 0.1 M → pH 1.0', async () => {
    const result = await calculate('HCl', 0.1);
    // pH should be approximately 1.00
    assert.ok(result.includes('1.0') || result.includes('1,0') || /pH\s*=\s*<b>1\.00/.test(result),
      `Expected pH 1.0. Got: ${result}`);
  });

  test('HBr 0.01 M → pH 2.0', async () => {
    const result = await calculate('HBr', 0.01);
    assert.ok(result.includes('2.0') || result.includes('2,0') || /pH\s*=\s*<b>2\.00/.test(result),
      `Expected pH 2.0. Got: ${result}`);
  });

  test('HNO3 0.001 M → pH 3.0', async () => {
    const result = await calculate('HNO3', 0.001);
    assert.ok(result.includes('3.0') || result.includes('3,0') || /pH\s*=\s*<b>3\.00/.test(result),
      `Expected pH 3.0. Got: ${result}`);
  });

  test('HI 0.1 M → pH 1.0', async () => {
    const result = await calculate('HI', 0.1);
    assert.ok(result.includes('1.0') || result.includes('1,0') || /pH\s*=\s*<b>1\.00/.test(result),
      `Expected pH 1.0. Got: ${result}`);
  });

  test('H2SO4 0.1 M → pH ~1.0 (diprotic strong acid)', async () => {
    const result = await calculate('H2SO4', 0.1);
    assert.ok(result.includes('1.0') || result.includes('1,0') || /pH\s*=\s*<b>1\.00/.test(result),
      `Expected pH ~1.0. Got: ${result}`);
  });
});

describe('strong bases', () => {
  test('NaOH 0.1 M → pH 13.0', async () => {
    const result = await calculate('NaOH', 0.1);
    assert.ok(result.includes('13.0') || result.includes('13,0') || /pH\s*=\s*<b>13\.00/.test(result),
      `Expected pH 13.0. Got: ${result}`);
  });

  test('KOH 0.01 M → pH 12.0', async () => {
    const result = await calculate('KOH', 0.01);
    assert.ok(result.includes('12.0') || result.includes('12,0') || /pH\s*=\s*<b>12\.00/.test(result),
      `Expected pH 12.0. Got: ${result}`);
  });

  test('LiOH 0.001 M → pH 11.0', async () => {
    const result = await calculate('LiOH', 0.001);
    assert.ok(result.includes('11.0') || result.includes('11,0') || /pH\s*=\s*<b>11\.00/.test(result),
      `Expected pH 11.0. Got: ${result}`);
  });
});

describe('weak acids', () => {
  test('CH3COOH 0.1 M → pH ~2.87', async () => {
    const result = await calculate('CH3COOH', 0.1);
    // Acetic acid pH = -log(sqrt(1.8e-5 * 0.1)) = -log(sqrt(1.8e-6)) ≈ 2.87
    assert.ok(/2\.[78]\d/.test(result) || /2,8[78]/.test(result) || result.includes('2.8'),
      `Expected pH ~2.87. Got: ${result}`);
  });

  test('HF 0.1 M → pH ~2.08 (Ka = 6.8e-4)', async () => {
    const result = await calculate('HF', 0.1);
    // pH = -log(sqrt(6.8e-4 * 0.1)) = -log(sqrt(6.8e-5)) ≈ 2.08
    assert.ok(/2\.[01]\d/.test(result) || /2,[01]\d/.test(result) || result.includes('2.0') || result.includes('2.1'),
      `Expected pH ~2.0-2.1. Got: ${result}`);
  });

  test('HCN 0.1 M → pH ~5.15 (Ka = 4.9e-10)', async () => {
    const result = await calculate('HCN', 0.1);
    // pH = -log(sqrt(4.9e-10 * 0.1)) = -log(sqrt(4.9e-11)) ≈ 5.15
    assert.ok(/5\.[01]\d/.test(result) || /5,[01]\d/.test(result) || result.includes('5.1'),
      `Expected pH ~5.1. Got: ${result}`);
  });
});

describe('generic / unknown compounds', () => {
  test('Unknown formula gets generic strong-acid estimate', async () => {
    const result = await calculate('XYZ123', 0.1);
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('pH') || result.includes('Generic'));
  });

  test('HCl 1.0 M → pH 0.0', async () => {
    const result = await calculate('HCl', 1.0);
    assert.ok(result.includes('0.0') || /pH\s*=\s*<b>0\.00/.test(result) || result.includes('0,0'),
      `Expected pH 0.0. Got: ${result}`);
  });

  test('Result includes compound name and concentration', async () => {
    const result = await calculate('HCl', 0.1);
    assert.ok(result.includes('HCl') || result.includes('Hydrochloric'),
      `Expected compound name. Got: ${result}`);
    assert.ok(result.includes('0.1'),
      `Expected concentration. Got: ${result}`);
  });
});

describe('pH database sanity', () => {
  test('STRONG_ACIDS has expected entries', () => {
    assert.ok(STRONG_ACIDS.HCl);
    assert.ok(STRONG_ACIDS.H2SO4);
    assert.ok(STRONG_ACIDS.HNO3);
  });

  test('STRONG_BASES has expected entries', () => {
    assert.ok(STRONG_BASES.NaOH);
    assert.ok(STRONG_BASES.KOH);
  });

  test('WEAK_ACIDS has expected entries', () => {
    assert.ok(WEAK_ACIDS.CH3COOH);
    assert.ok(WEAK_ACIDS.HF);
  });
});
