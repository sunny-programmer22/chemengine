/**
 * Tests for src/bot/safety.js
 * Tests that harmful queries are blocked and educational queries are allowed
 */

const { checkQuery, isAllowed, isBlocked, BLOCKED_PATTERNS } = require('../src/bot/safety');

describe('safety filter - harmful queries (should block)', () => {
  test('"how to make meth" → blocked', () => {
    const r = checkQuery('how to make meth');
    assert.strictEqual(r.allowed, false);
    assert.ok(r.reason);
  });

  test('"how to build a bomb" → blocked', () => {
    const r = checkQuery('how to build a bomb');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to make sarin" → blocked', () => {
    const r = checkQuery('how to make sarin');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to synthesize fentanyl" → blocked', () => {
    const r = checkQuery('how to synthesize fentanyl');
    assert.strictEqual(r.allowed, false);
  });

  test('"meth recipe" → blocked', () => {
    const r = checkQuery('meth recipe');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to make a pipe bomb" → blocked', () => {
    const r = checkQuery('how to make a pipe bomb');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to produce a nerve agent" → blocked', () => {
    const r = checkQuery('how to produce a nerve agent');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to make cocaine" → blocked', () => {
    const r = checkQuery('how to make cocaine');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to synthesize heroin" → blocked', () => {
    const r = checkQuery('how to synthesize heroin');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to cook meth" → blocked', () => {
    const r = checkQuery('how to cook meth');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to construct a bomb" → blocked', () => {
    const r = checkQuery('how to construct a bomb');
    assert.strictEqual(r.allowed, false);
  });

  test('"how to make lsd" → blocked', () => {
    const r = checkQuery('how to make lsd');
    assert.strictEqual(r.allowed, false);
  });
});

describe('safety filter - educational queries (should allow)', () => {
  test('"what is sarin" → allowed (educational)', () => {
    const r = checkQuery('what is sarin');
    assert.strictEqual(r.allowed, true);
  });

  test('"balance H2 + O2" → allowed', () => {
    const r = checkQuery('balance H2 + O2');
    assert.strictEqual(r.allowed, true);
  });

  test('"what is the chemical formula of table salt" → allowed', () => {
    const r = checkQuery('what is the chemical formula of table salt');
    assert.strictEqual(r.allowed, true);
  });

  test('"what is the molar mass of NaCl" → allowed', () => {
    const r = checkQuery('what is the molar mass of NaCl');
    assert.strictEqual(r.allowed, true);
  });

  test('"what is benzene" → allowed', () => {
    const r = checkQuery('what is benzene');
    assert.strictEqual(r.allowed, true);
  });

  test('"history of the periodic table" → allowed', () => {
    const r = checkQuery('history of the periodic table');
    assert.strictEqual(r.allowed, true);
  });

  test('"what are the properties of aspirin" → allowed', () => {
    const r = checkQuery('what are the properties of aspirin');
    assert.strictEqual(r.allowed, true);
  });

  test('"element Iron" → allowed', () => {
    const r = checkQuery('element Iron');
    assert.strictEqual(r.allowed, true);
  });

  test('"predict products of Na + Cl2" → allowed', () => {
    const r = checkQuery('predict products of Na + Cl2');
    assert.strictEqual(r.allowed, true);
  });

  test('"explain photosynthesis" → allowed', () => {
    const r = checkQuery('explain photosynthesis');
    assert.strictEqual(r.allowed, true);
  });
});

describe('safety filter - helpers', () => {
  test('isAllowed returns true for educational queries', () => {
    assert.strictEqual(isAllowed('what is NaCl'), true);
  });

  test('isAllowed returns false for harmful queries', () => {
    assert.strictEqual(isAllowed('how to make meth'), false);
  });

  test('isBlocked returns true for harmful queries', () => {
    assert.strictEqual(isBlocked('how to make meth'), true);
  });

  test('isBlocked returns false for educational queries', () => {
    assert.strictEqual(isBlocked('what is NaCl'), false);
  });

  test('Empty query is allowed', () => {
    assert.strictEqual(isAllowed(''), true);
  });

  test('Null query is allowed', () => {
    assert.strictEqual(isAllowed(null), true);
  });

  test('Harmful query includes a reason', () => {
    const r = checkQuery('how to make meth');
    assert.ok(r.reason && r.reason.length > 0);
  });

  test('Harmful query includes a category', () => {
    const r = checkQuery('how to make meth');
    assert.ok(r.category);
  });
});

describe('safety filter - patterns are defined', () => {
  test('BLOCKED_PATTERNS is a non-empty array', () => {
    assert.ok(Array.isArray(BLOCKED_PATTERNS));
    assert.ok(BLOCKED_PATTERNS.length > 0);
  });

  test('BLOCKED_PATTERNS contains regex patterns', () => {
    for (const p of BLOCKED_PATTERNS) {
      assert.ok(p instanceof RegExp, `Expected RegExp, got ${typeof p}`);
    }
  });
});
