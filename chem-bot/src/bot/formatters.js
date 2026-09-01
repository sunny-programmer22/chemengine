/**
 * Text formatters for chemistry answers
 * Handles HTML escaping, equation formatting, and message splitting
 */

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a chemical equation with proper subscripts and arrows
 * Handles parens, charges, hydrates, and converts -> to →
 * @param {string} equation - Chemical equation to format
 * @returns {string} HTML-formatted equation
 */
function formatEquation(equation) {
  if (!equation) return '';

  // Replace ASCII arrows with Unicode arrows BEFORE escaping
  let working = equation
    .replace(/<->/g, '⇌')
    .replace(/->/g, '→');

  // Wrap arrows in styled spans
  working = working.replace(/→/g, '<b>→</b>');
  working = working.replace(/⇌/g, '<b>⇌</b>');

  // Now escape HTML on the rest (preserving our <b> tags)
  // We need to do this carefully - replace the tags we made with placeholders
  const placeholders = [];
  let phIdx = 0;
  working = working.replace(/<b>(→|⇌)<\/b>/g, (m) => {
    const ph = `\x00PH${phIdx}\x00`;
    placeholders.push(m);
    phIdx++;
    return ph;
  });

  // Escape HTML
  let formatted = escapeHtml(working);

  // Restore placeholders
  for (let i = 0; i < placeholders.length; i++) {
    formatted = formatted.replace(`\x00PH${i}\x00`, placeholders[i]);
  }

  // Process chemical formulas
  // Match patterns like: Element followed by optional number, with possible (group)number
  // e.g., H2O, Ca(OH)2, H2SO4, [Fe(CN)6]4-

  // Handle bracket groups first [X]n
  formatted = formatted.replace(/\[([^\]]+)\]([0-9]*)/g, (match, group, count) => {
    return `<span>[${formatSubscripts(group)}]</span>${count ? `<sub>${count}</sub>` : ''}`;
  });

  // Handle paren groups (X)n
  formatted = formatted.replace(/\(([^)]+)\)([0-9]*)/g, (match, group, count) => {
    return `<span>(${formatSubscripts(group)})</span>${count ? `<sub>${count}</sub>` : ''}`;
  });

  // Handle remaining subscripts (Element followed by number)
  // Match capital letter, optional lowercase, then digits
  formatted = formatted.replace(/([A-Z][a-z]?)([0-9]+)/g, (match, element, count) => {
    return `${element}<sub>${count}</sub>`;
  });

  // Handle charges (e.g., Fe3+, SO42-)
  formatted = formatted.replace(/([0-9])([+-])/g, '<sup>$1$2</sup>');
  formatted = formatted.replace(/([A-Z][a-z]?)([+-])(?=[\s,])/g, '$1<sup>$2</sup>');

  // Handle coefficients at the start of species
  // e.g., "2H2O" -> "<b>2</b>H<sub>2</sub>O"
  formatted = formatted.replace(/(^|\s|\+)([0-9]+)([A-Z])/g, '$1<b>$2</b>$3');

  return formatted;
}

/**
 * Format subscripts within a group
 * @param {string} group - Group text
 * @returns {string} HTML with subscripts
 */
function formatSubscripts(group) {
  return group.replace(/([A-Z][a-z]?)([0-9]+)/g, '$1<sub>$2</sub>');
}

/**
 * Format a multi-line result
 * @param {string} text - Result text
 * @returns {string} HTML-formatted result
 */
function formatResult(text) {
  if (!text) return '';

  // If it looks like code (contains === or has multiple lines with indentation)
  if (text.includes('===') || text.match(/\n\s{2,}/)) {
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  return escapeHtml(text);
}

/**
 * Split a long message into chunks respecting Telegram's limits
 * Tries to split at paragraph/sentence boundaries and never inside HTML tags
 * @param {string} text - Message text
 * @param {number} max - Maximum chunk length (default 3500)
 * @returns {string[]} Array of message chunks
 */
function splitMessage(text, max = 3500) {
  if (!text) return [''];
  if (text.length <= max) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > max) {
    // Find a good split point
    let splitPoint = -1;

    // Try paragraph break first (\n\n)
    let idx = remaining.lastIndexOf('\n\n', max);
    if (idx > max * 0.5) {
      splitPoint = idx;
    }

    // Try single newline
    if (splitPoint === -1) {
      idx = remaining.lastIndexOf('\n', max);
      if (idx > max * 0.5) {
        splitPoint = idx;
      }
    }

    // Try sentence end (period, question mark, exclamation)
    if (splitPoint === -1) {
      const sentencePattern = /[.!?]\s/g;
      let lastSentenceIdx = -1;
      let match;
      while ((match = sentencePattern.exec(remaining.substring(0, max))) !== null) {
        lastSentenceIdx = match.index + match.length;
      }
      if (lastSentenceIdx > max * 0.5) {
        splitPoint = lastSentenceIdx;
      }
    }

    // Try space
    if (splitPoint === -1) {
      idx = remaining.lastIndexOf(' ', max);
      if (idx > max * 0.5) {
        splitPoint = idx;
      }
    }

    // Last resort: hard cut
    if (splitPoint === -1) {
      splitPoint = max;
    }

    // Don't split inside an HTML tag
    const beforeSplit = remaining.substring(0, splitPoint);
    const openTagCount = (beforeSplit.match(/<(?!\/)[^>]+>/g) || []).length;
    const closeTagCount = (beforeSplit.match(/<\/[^>]+>/g) || []).length;

    if (openTagCount > closeTagCount) {
      // We're inside an unclosed tag - find a safer split point
      const saferIdx = remaining.lastIndexOf('>', max);
      if (saferIdx > 0) {
        splitPoint = saferIdx + 1;
      }
    }

    const chunk = remaining.substring(0, splitPoint).trim();
    chunks.push(chunk);
    remaining = remaining.substring(splitPoint).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Format an error for user-friendly display
 * @param {Error|string} err - Error object or string
 * @returns {string} User-friendly error message
 */
function formatError(err) {
  const message = err?.message || String(err);

  // Common error patterns and friendly messages
  const errorPatterns = [
    { pattern: /not found/i, message: 'I couldn\'t find that information. Please check your input and try again.' },
    { pattern: /timeout/i, message: 'The request timed out. Please try again in a moment.' },
    { pattern: /rate limit/i, message: 'I\'m receiving too many requests right now. Please slow down.' },
    { pattern: /invalid/i, message: 'The input appears to be invalid. Please check the format and try again.' },
    { pattern: /network/i, message: 'There was a network issue. Please try again.' },
    { pattern: /api.*key/i, message: 'API configuration issue. Please contact the bot administrator.' }
  ];

  for (const { pattern, message: friendly } of errorPatterns) {
    if (pattern.test(message)) {
      return `❌ <b>Error</b>\n\n${friendly}\n\n<i>Details: ${escapeHtml(message)}</i>`;
    }
  }

  return `❌ <b>Error</b>\n\nSomething went wrong. Please try again or tap 📚 Help for guidance.\n\n<i>Details: ${escapeHtml(message)}</i>`;
}

/**
 * Format a list of items as HTML
 * @param {string[]} items - List items
 * @returns {string} HTML formatted numbered list
 */
function formatList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
}

module.exports = {
  escapeHtml,
  formatEquation,
  formatResult,
  splitMessage,
  formatError,
  formatList
};
