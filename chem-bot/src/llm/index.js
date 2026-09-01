/**
 * LLM orchestrator for Chem Bot
 *
 * Public API:
 *   askChem(question, context) -> { source, answer, taskType, confidence }
 *
 * Strategy:
 *   1. Classify the question into a task type.
 *   2. Try local deterministic tools first (cheap, fast, accurate).
 *   3. If tools are confident, return tool result.
 *   4. Otherwise, call the LLM (OpenAI or local) with appropriate prompt.
 *   5. If LLM is unavailable, return a clear "I don't know" answer.
 *   6. Cache by question hash (md5) in-memory (LRU 200, 30 min TTL).
 */

const crypto = require('crypto');

// Tool imports
const balancer = require('../tools/balancer');
const predictor = require('../tools/predictor');
const molar = require('../tools/molar');
const element = require('../tools/element');
const iupac = require('../tools/iupac');
const ph = require('../tools/ph');
const safetyTool = require('../tools/safety');
const search = require('../tools/search');

// LLM imports
const openai = require('./openai');
const localLlm = require('./local');
const gemini = require('./gemini');
const {
  SYSTEM_PROMPT_CHEM,
  SYSTEM_PROMPT_NAMER,
  SYSTEM_PROMPT_TUTOR,
  SYSTEM_PROMPT_GENERAL,
  TOOL_DEFINITIONS
} = require('./prompts');

// Online sources
const { searchPubchem, getSafetySummary } = require('../utils/pubchem');
const { searchWikipedia } = require('../utils/wikipedia');
const { wikidataLookup } = require('../utils/wikidata');

// Cache
const { llmCache } = require('../utils/cache');

// Safety
const { isUnsafeQuery, SAFETY_NOTE } = require('../bot/safety');

// Logger
const { logger } = require('../config');

/**
 * Simple in-memory LRU + TTL cache for askChem.
 * (Distinct from the lower-level llmCache for raw LLM responses; this
 * caches the fully-formed answer so the entire pipeline can be skipped.)
 */
const ASK_CACHE_MAX = 200;
const ASK_CACHE_TTL = 30 * 60 * 1000; // 30 min
const askCache = new Map(); // key -> { value, expires }

function askCacheGet(key) {
  const entry = askCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    askCache.delete(key);
    return null;
  }
  // Refresh LRU
  askCache.delete(key);
  askCache.set(key, entry);
  return entry.value;
}

function askCacheSet(key, value) {
  if (askCache.has(key)) askCache.delete(key);
  if (askCache.size >= ASK_CACHE_MAX) {
    // Evict oldest
    const oldest = askCache.keys().next().value;
    if (oldest) askCache.delete(oldest);
  }
  askCache.set(key, { value, expires: Date.now() + ASK_CACHE_TTL });
}

function hashQuestion(question) {
  return crypto.createHash('md5').update(String(question || '').toLowerCase().trim()).digest('hex');
}

/**
 * Task type enumeration
 */
const TASK_TYPES = {
  BALANCE: 'balance',
  PREDICT: 'predict',
  MOLAR: 'molar',
  ELEMENT: 'element',
  IUPAC: 'iupac',
  PH: 'ph',
  STOICH: 'stoich',
  SAFETY: 'safety',
  GENERAL: 'general',
  SEARCH: 'search',
  CALCULATE: 'calculate',
  EXPLAIN: 'explain'
};

/**
 * Classify a question into a task type.
 * @param {string} question
 * @returns {string} task type
 */
function classify(question) {
  if (!question) return TASK_TYPES.GENERAL;
  const q = question.toLowerCase();

  // Balance: contains arrow (->) or words like balance
  if (/->|→|=|balance( this)?( the)?( equation)?|combustion of|reaction between/i.test(q)) {
    return TASK_TYPES.BALANCE;
  }

  // pH
  if (/\bph\s*(of|=|:|is|of a)?|\bpoh\b|\bh\+|\boh-|calculate.*ph|\bph calculation/i.test(q)) {
    return TASK_TYPES.PH;
  }

  // Stoichiometry
  if (/\bstoich|moles of|grams to moles|mol to|limiting reagent|excess reagent|theoretical yield|percent yield/i.test(q)) {
    return TASK_TYPES.STOICH;
  }

  // Molar mass
  if (/\bmolar\s*mass|molecular\s*weight|mw\b|formula\s*weight|\bg\/mol\b/i.test(q)) {
    return TASK_TYPES.MOLAR;
  }

  // Predict products
  if (/\bproducts? of\b|\bwhat (does|do) .* (give|produce|form|yield)\b|\bwhat (is|are) (formed|produced)\b|\bpredict\b/i.test(q)) {
    return TASK_TYPES.PREDICT;
  }

  // Element info
  if (/\belement\b|\batomic number\b|\batomic weight\b|\batomic mass\b|\bperiodic\b|\bgroup\b|\bperiod\b|\belectron config/i.test(q) &&
      !/^what is\b/i.test(q)) {
    // Could still be an element question
    return TASK_TYPES.ELEMENT;
  }

  // IUPAC / naming
  if (/\biupac\b|\bsystematic name\b|\bcommon name\b|\bnaming\b|\bnamed\b/i.test(q)) {
    return TASK_TYPES.IUPAC;
  }

  // Safety
  if (/\bsafety\b|\bghs\b|\bmsds\b|\bsds\b|\bhazard\b|\bflammable\b|\btoxic\b|\birritant\b/i.test(q)) {
    return TASK_TYPES.SAFETY;
  }

  // Calculate
  if (/\bcalculate\b|\bcompute\b|\bconvert\b|\bwhat is .* (in|to)\b/i.test(q)) {
    return TASK_TYPES.CALCULATE;
  }

  // Search / lookup
  if (/\bsearch\b|\bfind\b|\blookup\b|\blook up\b/i.test(q) && !/how|why|what|when/i.test(q)) {
    return TASK_TYPES.SEARCH;
  }

  // Explain / why / how
  if (/^(why|how|explain|describe|what is|what are|define|tell me about)/i.test(q)) {
    return TASK_TYPES.EXPLAIN;
  }

  return TASK_TYPES.GENERAL;
}

/**
 * Try to extract a chemical formula or name from a question.
 * @param {string} question
 * @returns {string|null}
 */
function extractFormula(question) {
  if (!question) return null;
  // Match a token that looks like a chemical formula
  // (capital letter, optional lowercase, optional digits, possibly with parentheses)
  const m = question.match(/\b([A-Z][a-z]?(?:\d|[A-Z][a-z]?\d*|\([A-Z][a-z]?\d*\)\d*)*)\b/);
  if (m && /[A-Z]/.test(m[1]) && /\d|[A-Z]/.test(m[1])) {
    return m[1];
  }
  return null;
}

/**
 * Try to extract a chemical equation (reactants -> products).
 * @param {string} question
 * @returns {string|null}
 */
function extractEquation(question) {
  if (!question) return null;
  const m = question.match(/([A-Za-z0-9()+\s]+?)\s*(?:->|→|=)\s*([A-Za-z0-9()+\s]+)/);
  return m ? `${m[1].trim()} -> ${m[2].trim()}` : null;
}

/**
 * Extract a chemical name (multi-word) from a question.
 * @param {string} question
 * @returns {string|null}
 */
function extractName(question) {
  if (!question) return null;
  // Try "what is the IUPAC name of X" or "name of X"
  const m1 = question.match(/\b(?:iupac\s*name\s*of|systematic\s*name\s*of|name\s*of|named?)\s+([A-Za-z0-9\- ]{2,40})/i);
  if (m1) return m1[1].trim();
  // Try "what is X" where X is a multi-word name
  const m2 = question.match(/\bwhat\s+is\s+([A-Za-z][A-Za-z0-9\- ]{1,40})/i);
  if (m2) {
    const candidate = m2[1].trim().replace(/[?.!]+$/, '');
    if (candidate.length > 2) return candidate;
  }
  return null;
}

/**
 * Try local tools. Returns a confident answer or null.
 * @param {string} question
 * @param {string} taskType
 * @returns {Promise<{answer: string, source: string, confidence: number}|null>}
 */
async function tryLocalTools(question, taskType) {
  try {
    switch (taskType) {
      case TASK_TYPES.BALANCE: {
        const eq = extractEquation(question);
        if (eq) {
          const r = await balancer.balance(eq);
          // If the result is "Original: ... Note: Could not balance", treat as failure
          if (r && !/Could not balance/i.test(r)) {
            return { answer: r, source: 'tool:balancer', confidence: 0.95 };
          }
        }
        break;
      }
      case TASK_TYPES.MOLAR: {
        const f = extractFormula(question);
        if (f) {
          const r = await molar.calculate(f);
          return { answer: r, source: 'tool:molar', confidence: 0.95 };
        }
        break;
      }
      case TASK_TYPES.PREDICT: {
        const f = extractFormula(question);
        if (f) {
          const r = await predictor.predict(f);
          return { answer: r, source: 'tool:predictor', confidence: 0.7 };
        }
        break;
      }
      case TASK_TYPES.ELEMENT: {
        // Try to extract element symbol/name/number
        const tokens = question.split(/\s+/);
        for (const t of tokens) {
          const e = element.findElement(t);
          if (e) {
            const r = await element.getInfo(e.symbol);
            return { answer: r, source: 'tool:element', confidence: 0.9 };
          }
        }
        break;
      }
      case TASK_TYPES.IUPAC: {
        const name = extractName(question) || extractFormula(question);
        if (name) {
          const r = await iupac.lookup(name);
          return { answer: r, source: 'tool:iupac', confidence: 0.85 };
        }
        break;
      }
      case TASK_TYPES.PH: {
        // Try to find formula and concentration
        const f = extractFormula(question);
        const concMatch = question.match(/(\d+(?:\.\d+)?)\s*(m|mol\/l|molar)?/i);
        const conc = concMatch ? parseFloat(concMatch[1]) : 0.1;
        if (f) {
          try {
            const r = await ph.calculate(f, conc);
            return { answer: r, source: 'tool:ph', confidence: 0.9 };
          } catch (err) {
            // ignore
          }
        }
        break;
      }
      case TASK_TYPES.SAFETY: {
        const f = extractFormula(question) || extractName(question);
        if (f) {
          const r = await safetyTool.getInfo(f);
          return { answer: r, source: 'tool:safety', confidence: 0.9 };
        }
        break;
      }
      case TASK_TYPES.STOICH: {
        const eq = extractEquation(question);
        if (eq) {
          // Use balancer's stoichiometry if a target compound can be identified
          const r = await balancer.stoichiometry(eq, '', 1, 'mol');
          return { answer: r, source: 'tool:balancer', confidence: 0.7 };
        }
        break;
      }
      case TASK_TYPES.SEARCH: {
        const q = question.replace(/^\/?search\s*/i, '').trim();
        try {
          const r = await search.search(q);
          return { answer: r, source: 'tool:search', confidence: 0.7 };
        } catch (err) {
          // ignore
        }
        break;
      }
      case TASK_TYPES.CALCULATE: {
        // Try molar mass first, then pH
        const f = extractFormula(question);
        if (f && /\bmolar|mass|mw|molecular\s*weight/i.test(question)) {
          try {
            const r = await molar.calculate(f);
            return { answer: r, source: 'tool:molar', confidence: 0.95 };
          } catch (err) { /* ignore */ }
        }
        if (f && /\bph\b/i.test(question)) {
          const concMatch = question.match(/(\d+(?:\.\d+)?)/);
          const conc = concMatch ? parseFloat(concMatch[1]) : 0.1;
          try {
            const r = await ph.calculate(f, conc);
            return { answer: r, source: 'tool:ph', confidence: 0.9 };
          } catch (err) { /* ignore */ }
        }
        break;
      }
    }
  } catch (err) {
    logger.warn('Local tool failed', err.message);
  }
  return null;
}

/**
 * Try online sources (PubChem, Wikipedia, Wikidata) for a question.
 * @param {string} question
 * @returns {Promise<{answer: string, source: string, confidence: number}|null>}
 */
async function tryOnlineSources(question) {
  const q = question.trim();
  // Try PubChem first (chemistry data)
  try {
    const formula = extractFormula(q);
    const name = extractName(q);
    const target = name || formula || q;

    const pc = await searchPubchem(target);
    if (pc && (pc.iupacName || pc.formula || pc.weight)) {
      let answer = `From PubChem (CID ${pc.cid || '?'}):\n`;
      if (pc.name) answer += `Name: ${pc.name}\n`;
      if (pc.iupacName) answer += `IUPAC: ${pc.iupacName}\n`;
      if (pc.formula) answer += `Formula: ${pc.formula}\n`;
      if (pc.weight) answer += `Molecular Weight: ${pc.weight} g/mol\n`;
      if (pc.smiles) answer += `SMILES: ${pc.smiles}\n`;
      if (pc.inchiKey) answer += `InChIKey: ${pc.inchiKey}\n`;
      if (pc.description) {
        const desc = pc.description.length > 400 ? pc.description.slice(0, 400) + '...' : pc.description;
        answer += `\nDescription: ${desc}\n`;
      }
      return { answer, source: 'pubchem', confidence: 0.85 };
    }
  } catch (err) {
    // ignore
  }

  // Try Wikidata for element/compound enrichment
  try {
    const target = extractName(q) || extractFormula(q) || q;
    const wd = await wikidataLookup(target);
    if (wd && (wd.label || wd.image || wd.meltingPoint || wd.boilingPoint)) {
      let answer = `From Wikidata (${wd.qid}):\n`;
      if (wd.label) answer += `Label: ${wd.label}\n`;
      if (wd.meltingPoint) answer += `Melting Point: ${wd.meltingPoint} K\n`;
      if (wd.boilingPoint) answer += `Boiling Point: ${wd.boilingPoint} K\n`;
      if (wd.density) answer += `Density: ${wd.density} kg/m^3\n`;
      if (wd.image) answer += `Image: ${wd.image}\n`;
      if (wd.pubchemCid) answer += `PubChem CID: ${wd.pubchemCid}\n`;
      if (wd.cas) answer += `CAS: ${wd.cas}\n`;
      return { answer, source: 'wikidata', confidence: 0.8 };
    }
  } catch (err) {
    // ignore
  }

  // Try Wikipedia for an open-ended explanation
  try {
    const target = extractName(q) || q.replace(/^(what|who|why|how|when|where) (is|are|was|were|did) /i, '').trim();
    const results = await searchWikipedia(target);
    if (results && results.length > 0) {
      const top = results[0];
      let answer = `From Wikipedia (${top.title}):\n${top.extract || 'No extract available.'}\nSource: ${top.url}`;
      if (results.length > 1) {
        answer += `\n\nOther results:\n` + results.slice(1).map(r => `- ${r.title}: ${r.url}`).join('\n');
      }
      return { answer, source: 'wikipedia', confidence: 0.7 };
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Choose which system prompt to use based on task type and question.
 * @param {string} taskType
 * @param {string} question
 * @returns {string}
 */
function chooseSystemPrompt(taskType, question) {
  const q = (question || '').toLowerCase();
  if (taskType === TASK_TYPES.GENERAL) {
    return SYSTEM_PROMPT_GENERAL;
  }
  if (taskType === TASK_TYPES.IUPAC || /\b(naming|iupac name|systematic name)\b/.test(q)) {
    return SYSTEM_PROMPT_NAMER;
  }
  if (taskType === TASK_TYPES.EXPLAIN || /^(why|how|explain)/i.test(q)) {
    return SYSTEM_PROMPT_TUTOR;
  }
  return SYSTEM_PROMPT_CHEM;
}

/**
 * Call the LLM (OpenAI → Gemini → local) and return content.
 * @param {Array} messages
 * @param {Object} options
 * @returns {Promise<{content: string, source: string}|null>}
 */
async function callLlm(messages, options = {}) {
  // OpenAI first
  if (openai.isAvailable()) {
    try {
      const r = await openai.chat(messages, options);
      if (r && r.content) {
        return { content: r.content, source: 'openai' };
      }
    } catch (err) {
      // fall through to Gemini
    }
  }

  // Gemini second
  if (gemini.isAvailable()) {
    try {
      const r = await gemini.chat(messages, options);
      if (r && r.content) {
        return { content: r.content, source: 'gemini' };
      }
    } catch (err) {
      // fall through to local
    }
  }

  // Local LLM fallback
  if (localLlm.isEnabled()) {
    try {
      const r = await localLlm.chat(messages, options);
      if (r && r.content) {
        return { content: r.content, source: 'local' };
      }
    } catch (err) {
      // ignore
    }
  }

  return null;
}

/**
 * Public API: ask a chemistry question.
 * @param {string} question
 * @param {Object} [context] - Optional context (unused for now)
 * @returns {Promise<{source: string, answer: string, taskType: string, confidence: number}>}
 */
async function askChem(question, context = {}) {
  // Defensive: handle empty/garbage input
  if (!question || typeof question !== 'string') {
    return {
      source: 'none',
      answer: "I didn't receive a question. Please send a chemistry question (e.g., \"What is the molar mass of H2SO4?\").",
      taskType: TASK_TYPES.GENERAL,
      confidence: 0
    };
  }

  const trimmed = question.trim();
  if (!trimmed) {
    return {
      source: 'none',
      answer: "Please send a chemistry question (e.g., \"What is the molar mass of H2SO4?\").",
      taskType: TASK_TYPES.GENERAL,
      confidence: 0
    };
  }

  // Safety check first
  const safety = isUnsafeQuery(trimmed);
  if (safety.unsafe) {
    return {
      source: 'safety',
      answer: safety.refusal,
      taskType: 'safety_refusal',
      confidence: 1
    };
  }

  // Cache check
  const cacheKey = hashQuestion(trimmed);
  const cached = askCacheGet(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const taskType = classify(trimmed);

  // 1) Try local deterministic tools
  const toolResult = await tryLocalTools(trimmed, taskType);
  if (toolResult && toolResult.confidence >= 0.85) {
    const result = { source: toolResult.source, answer: toolResult.answer, taskType, confidence: toolResult.confidence };
    askCacheSet(cacheKey, result);
    return result;
  }

  // 2) For general/explain questions, try online sources (Wikipedia) first
  //    because they are free and often give a good answer.
  if (taskType === TASK_TYPES.GENERAL || taskType === TASK_TYPES.EXPLAIN) {
    const online = await tryOnlineSources(trimmed);
    if (online && online.confidence >= 0.7) {
      let answer = online.answer;
      if (safety.note) answer += `\n\n${safety.note}`;
      const result = { source: online.source, answer, taskType, confidence: online.confidence };
      askCacheSet(cacheKey, result);
      return result;
    }
  }

  // 3) Call the LLM
  const systemPrompt = chooseSystemPrompt(taskType, trimmed);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: trimmed }
  ];

  const maxTokens = (taskType === TASK_TYPES.GENERAL ? 150 : 400);
  const llmResult = await callLlm(messages, { max_tokens: maxTokens, temperature: 0.3 });
  if (llmResult && llmResult.content) {
    let answer = llmResult.content;
    if (safety.note) answer += `\n\n${safety.note}`;
    const result = {
      source: llmResult.source,
      answer,
      taskType,
      confidence: 0.8
    };
    askCacheSet(cacheKey, result);
    return result;
  }

  // 4) Fall back to online sources if LLM is unavailable
  if (taskType !== TASK_TYPES.GENERAL && taskType !== TASK_TYPES.EXPLAIN) {
    const online = await tryOnlineSources(trimmed);
    if (online) {
      const result = { source: online.source, answer: online.answer, taskType, confidence: online.confidence };
      askCacheSet(cacheKey, result);
      return result;
    }
  }

  // 5) Final fallback
  const result = {
    source: 'fallback',
    answer: "I'm not sure how to answer that. The LLM is unavailable and my local tools don't recognize this query.\n\n" +
            "Try one of these specific commands instead:\n" +
            "  /molar <formula> - molar mass\n" +
            "  /balance <equation> - balance equation\n" +
            "  /element <name> - element info\n" +
            "  /iupac <name> - IUPAC name lookup\n" +
            "  /ph <formula> <concentration> - pH calculation\n" +
            "  /predict <reactants> - predict reaction products\n" +
            "  /safety <formula> - safety data",
    taskType,
    confidence: 0
  };
  askCacheSet(cacheKey, result);
  return result;
}

// Re-export module pieces for direct use
module.exports = {
  askChem,
  classify,
  TASK_TYPES,
  tryLocalTools,
  tryOnlineSources
};
