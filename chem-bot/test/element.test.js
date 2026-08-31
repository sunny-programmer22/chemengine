/**
 * Tests for src/tools/element.js
 * Tests element lookup by symbol, name, and atomic number
 */

const { findElement, ELEMENTS } = require('../src/tools/element');

describe('findElement - by symbol', () => {
  test('findElement("H") returns Hydrogen with z=1', () => {
    const el = findElement('H');
    assert.ok(el);
    assert.strictEqual(el.name, 'Hydrogen');
    assert.strictEqual(el.symbol, 'H');
    assert.strictEqual(el.z, 1);
  });

  test('findElement("Fe") returns Iron with z=26', () => {
    const el = findElement('Fe');
    assert.ok(el);
    assert.strictEqual(el.name, 'Iron');
    assert.strictEqual(el.symbol, 'Fe');
    assert.strictEqual(el.z, 26);
  });

  test('findElement("Au") returns Gold with z=79', () => {
    const el = findElement('Au');
    assert.ok(el);
    assert.strictEqual(el.name, 'Gold');
    assert.strictEqual(el.z, 79);
  });

  test('findElement handles lowercase', () => {
    const el = findElement('fe');
    assert.ok(el);
    assert.strictEqual(el.name, 'Iron');
  });
});

describe('findElement - by name', () => {
  test('findElement("Hydrogen") returns {symbol: "H", z: 1}', () => {
    const el = findElement('Hydrogen');
    assert.ok(el);
    assert.strictEqual(el.symbol, 'H');
    assert.strictEqual(el.z, 1);
  });

  test('findElement("Carbon") returns {symbol: "C", z: 6}', () => {
    const el = findElement('Carbon');
    assert.ok(el);
    assert.strictEqual(el.symbol, 'C');
    assert.strictEqual(el.z, 6);
  });

  test('findElement("Iron") returns {symbol: "Fe", z: 26}', () => {
    const el = findElement('Iron');
    assert.ok(el);
    assert.strictEqual(el.symbol, 'Fe');
    assert.strictEqual(el.z, 26);
  });

  test('findElement("Gold") returns {symbol: "Au", z: 79}', () => {
    const el = findElement('Gold');
    assert.ok(el);
    assert.strictEqual(el.symbol, 'Au');
    assert.strictEqual(el.z, 79);
  });

  test('findElement handles case-insensitive name lookup', () => {
    const el = findElement('IRON');
    assert.ok(el);
    assert.strictEqual(el.symbol, 'Fe');
  });
});

describe('findElement - by atomic number', () => {
  test('findElement("1") returns Hydrogen', () => {
    const el = findElement('1');
    assert.ok(el);
    assert.strictEqual(el.name, 'Hydrogen');
    assert.strictEqual(el.z, 1);
  });

  test('findElement(26) returns Iron', () => {
    const el = findElement(26);
    assert.ok(el);
    assert.strictEqual(el.name, 'Iron');
    assert.strictEqual(el.z, 26);
  });

  test('findElement("92") returns Uranium', () => {
    const el = findElement('92');
    assert.ok(el);
    assert.strictEqual(el.name, 'Uranium');
    assert.strictEqual(el.z, 92);
  });
});

describe('findElement - invalid queries', () => {
  test('findElement("Xyzium") returns null', () => {
    const el = findElement('Xyzium');
    assert.strictEqual(el, null);
  });

  test('findElement("9999") returns null (out of range)', () => {
    const el = findElement('9999');
    assert.strictEqual(el, null);
  });

  test('findElement("") returns null or object', () => {
    const el = findElement('');
    // Empty string shouldn't match anything
    assert.ok(el === null || el === undefined);
  });

  test('findElement("Xx") returns null (unknown symbol)', () => {
    const el = findElement('Xx');
    assert.strictEqual(el, null);
  });
});

describe('ELEMENTS database', () => {
  test('ELEMENTS contains 103+ elements', () => {
    const count = Object.keys(ELEMENTS).length;
    assert.ok(count >= 103, `Expected at least 103 elements, got ${count}`);
  });

  test('Every element has name and z', () => {
    for (const [symbol, data] of Object.entries(ELEMENTS)) {
      assert.ok(data.name, `Element ${symbol} missing name`);
      assert.ok(data.z, `Element ${symbol} missing z`);
    }
  });

  test('Atomic numbers are unique and sequential', () => {
    const zs = Object.values(ELEMENTS).map(d => d.z).sort((a, b) => a - b);
    for (let i = 0; i < zs.length; i++) {
      assert.strictEqual(zs[i], i + 1, `Expected z=${i + 1} at position ${i}, got ${zs[i]}`);
    }
  });
});
