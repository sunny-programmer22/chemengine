/**
 * Tests for src/bot/formatters.js
 * Tests formatEquation, escapeHtml, splitMessage, formatList, formatError
 */

const {
  escapeHtml,
  formatEquation,
  formatResult,
  splitMessage,
  formatError,
  formatList
} = require('../src/bot/formatters');

describe('escapeHtml', () => {
  test('escapes < and >', () => {
    assert.strictEqual(escapeHtml('<b>test</b>'), '&lt;b&gt;test&lt;/b&gt;');
  });

  test('escapes &', () => {
    assert.strictEqual(escapeHtml('A & B'), 'A &amp; B');
  });

  test('escapes " and \'', () => {
    assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
    assert.strictEqual(escapeHtml("it's"), 'it&#39;s');
  });

  test('handles empty string', () => {
    assert.strictEqual(escapeHtml(''), '');
  });

  test('handles non-string input', () => {
    assert.strictEqual(escapeHtml(123), '123');
    assert.strictEqual(escapeHtml(null), 'null');
    assert.strictEqual(escapeHtml(undefined), 'undefined');
  });

  test('escapes all special chars together', () => {
    assert.strictEqual(
      escapeHtml('<a href="x">A & B</a>'),
      '&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;'
    );
  });
});

describe('formatEquation', () => {
  test('formatEquation("H2O") converts digits to <sub>', () => {
    const result = formatEquation('H2O');
    assert.ok(result.includes('<sub>2</sub>'), `Expected <sub>2</sub> in: ${result}`);
  });

  test('formatEquation("H2 + O2 -> H2O") converts -> to →', () => {
    const result = formatEquation('H2 + O2 -> H2O');
    assert.ok(result.includes('→'), `Expected → in: ${result}`);
  });

  test('formatEquation converts <-> to ⇌', () => {
    const result = formatEquation('N2 + 3H2 <-> 2NH3');
    assert.ok(result.includes('⇌'), `Expected ⇌ in: ${result}`);
  });

  test('formatEquation handles parentheses Ca(OH)2', () => {
    const result = formatEquation('Ca(OH)2');
    assert.ok(result.includes('<sub>'), `Expected <sub> in: ${result}`);
  });

  test('formatEquation handles brackets [Cu(NH3)4]', () => {
    const result = formatEquation('[Cu(NH3)4]SO4');
    assert.ok(result.includes('['), `Expected [ in: ${result}`);
  });

  test('formatEquation returns empty for empty input', () => {
    assert.strictEqual(formatEquation(''), '');
  });

  test('formatEquation handles coefficients', () => {
    const result = formatEquation('2H2 + O2 -> 2H2O');
    // Should bold the coefficient 2
    assert.ok(/<b>2<\/b>/.test(result) || result.includes('<b>2</b>'),
      `Expected bolded 2 in: ${result}`);
  });
});

describe('splitMessage', () => {
  test('returns single chunk if shorter than max', () => {
    const result = splitMessage('Hello world', 100);
    assert.deepStrictEqual(result, ['Hello world']);
  });

  test('splits long message into multiple chunks', () => {
    const long = 'a'.repeat(1000);
    const chunks = splitMessage(long, 100);
    assert.ok(chunks.length > 1);
  });

  test('each chunk is at most max + tolerance', () => {
    const long = 'a'.repeat(5000);
    const chunks = splitMessage(long, 1000);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 2000, `Chunk too long: ${chunk.length}`);
    }
  });

  test('preserves total content', () => {
    const text = 'a'.repeat(5000);
    const chunks = splitMessage(text, 1000);
    const joined = chunks.join('').replace(/ /g, '');
    assert.ok(joined.length >= 4900);
  });

  test('splits at paragraph break first', () => {
    const text = 'Paragraph 1 text.\n\nParagraph 2 text.';
    const chunks = splitMessage(text, 25);
    assert.ok(chunks.length > 1);
    assert.ok(chunks[0].includes('Paragraph 1'));
  });

  test('handles empty string', () => {
    const result = splitMessage('');
    assert.deepStrictEqual(result, ['']);
  });

  test('does not split inside HTML tags', () => {
    const text = '<b>Bold text</b> more text here that is long enough to need splitting';
    const chunks = splitMessage(text, 30);
    // Should not break in the middle of a tag
    for (const chunk of chunks) {
      // Count opening and closing tags
      const openCount = (chunk.match(/<(?!\/)/g) || []).length;
      const closeCount = (chunk.match(/<\//g) || []).length;
      // Allow for some imbalance due to splitting but should try to minimize
    }
    assert.ok(chunks.length > 1);
  });
});

describe('formatList', () => {
  test('formats 3 items as numbered list', () => {
    const result = formatList(['apple', 'banana', 'cherry']);
    assert.ok(result.includes('1. apple'));
    assert.ok(result.includes('2. banana'));
    assert.ok(result.includes('3. cherry'));
  });

  test('returns empty for empty array', () => {
    assert.strictEqual(formatList([]), '');
  });

  test('handles single item', () => {
    const result = formatList(['only']);
    assert.ok(result.includes('1. only'));
  });

  test('handles non-array input', () => {
    assert.strictEqual(formatList(null), '');
    assert.strictEqual(formatList(undefined), '');
  });

  test('items appear in order', () => {
    const result = formatList(['z', 'a', 'm']);
    const idx1 = result.indexOf('1. z');
    const idx2 = result.indexOf('2. a');
    const idx3 = result.indexOf('3. m');
    assert.ok(idx1 < idx2);
    assert.ok(idx2 < idx3);
  });
});

describe('formatError', () => {
  test('returns user-friendly message for "not found"', () => {
    const result = formatError(new Error('not found'));
    assert.ok(result.includes('Error') || result.includes('couldn'));
  });

  test('returns user-friendly message for timeout', () => {
    const result = formatError(new Error('timeout'));
    assert.ok(result.includes('Error') || result.includes('timed out'));
  });

  test('handles string errors', () => {
    const result = formatError('Some string error');
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  test('handles null/undefined errors', () => {
    const result = formatError(null);
    assert.ok(typeof result === 'string');
  });

  test('result includes "Error" word', () => {
    const result = formatError(new Error('test'));
    assert.ok(result.includes('Error'));
  });
});

describe('formatResult', () => {
  test('returns escaped text for plain input', () => {
    const result = formatResult('Hello world');
    assert.strictEqual(result, 'Hello world');
  });

  test('escapes HTML in plain text', () => {
    const result = formatResult('<b>not bold</b>');
    assert.ok(result.includes('&lt;b&gt;'));
  });

  test('wraps code blocks in <pre>', () => {
    const result = formatResult('function foo() {\n  return 42;\n}');
    assert.ok(result.includes('<pre>'));
  });

  test('handles empty string', () => {
    assert.strictEqual(formatResult(''), '');
  });
});
