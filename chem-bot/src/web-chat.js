const balancer = require('./tools/balancer');
const predictor = require('./tools/predictor');
const molar = require('./tools/molar');
const stoichiometry = require('./tools/stoichiometry');
const organic = require('./tools/organic');
const llm = require('./llm/index');

const FORMULA_TOKEN = "[A-Z][a-z]?\\d*(?:\\([^()]+\\)\\d*|[A-Z][a-z]?\\d*)*";
const WITH_ARROW = /->|→|<->|⇌/;
const REACTANT_PAIR = new RegExp(`^${FORMULA_TOKEN}(?:\\s*\\+\\s*${FORMULA_TOKEN})+$`, 'i');

/**
 * Route web chat message to appropriate tool
 */
async function routeWebMessage(text) {
  text = text.trim();

  // 2. Formula (Molar Mass) FIRST — a bare formula must not be mistaken for an equation.
  if (new RegExp(`^${FORMULA_TOKEN}$`).test(text) && !WITH_ARROW.test(text)) {
    const res = await molar.calculate(text);
    return { reply: stripFormatting(res), source: 'molar' };
  }

  // Bare reactant list without an arrow (e.g. Na + Cl2) → predict reaction products
  if (REACTANT_PAIR.test(text)) {
    try {
      const res = await predictor.predict(text);
      return { reply: stripFormatting(res), source: 'predict' };
    } catch (e) {
      // fall through to AI if the predictor rejects it
    }
  }

  // Contains an arrow: balance or stoichiometry
  if (WITH_ARROW.test(text)) {
    const amountMatch = text.match(
      /\b(\w+(?:\([^)]+\))?\d*)\s+(\d+(?:\.\d+)?)\s*(mol|g|kg|mg|L|mL|moles|grams)?\s*$/i
    );
    if (amountMatch) {
      const [, compound, amount, unit] = amountMatch;
      const res = await stoichiometry.calculate(
        text.replace(amountMatch[0], '').trim(),
        compound,
        parseFloat(amount),
        unit || 'mol'
      );
      return { reply: stripFormatting(res), source: 'stoich' };
    }
    const res = await balancer.balance(text);
    return { reply: stripFormatting(res), source: 'balance' };
  }

  // 2b. Reaction type classification (e.g. "classify CH3COOH + NaOH", "what type is Na + Cl2")
  if (/\b(classify|what type|reaction type|which type)\b/i.test(text)) {
    try {
      const clean = text.replace(/\b(classify|what type of|what type|reaction type of|reaction type|which type|is)\b/gi, '').trim();
      if (clean.length > 2) {
        const cls = await organic.classifyReactionType(clean);
        let toolResult = '';
        const parts = clean.split('+').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          try {
            const pred = await predictor.predict(clean);
            toolResult = '\n\n' + stripFormatting(pred);
          } catch (_) {}
        }
        return {
          reply: stripFormatting(`**Reaction type:** ${cls.reactionType}\n\n${cls.description}${toolResult}`),
          source: 'classify'
        };
      }
    } catch (_) {}
  }

  // 3. Fallback to AI
  try {
    const result = await llm.askChem(text, { id: 'web-user' });
    const answer = result && typeof result === 'object' ? (result.answer || String(result)) : String(result);
    return { reply: stripFormatting(answer), source: 'ai' };
  } catch (err) {
    return { reply: 'hmm, that one tripped me up 😅 mind rephrasing? (try "H2 + O2 -> H2O")', source: 'error' };
  }
}

function stripFormatting(text) {
  // Unescape entities FIRST, then strip any leftover HTML tags so no raw
  // <tag> content can pass through to the frontend (which renders via innerHTML).
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, '');
}

module.exports = { routeWebMessage };
