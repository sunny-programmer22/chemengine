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
const { searchWikipedia, isOrganicQuery: wikiIsOrganic, extractOrganicTerm: wikiExtractOrganic, ORGANIC_SEARCH_MAP } = require('../utils/wikipedia');
const { wikidataLookup } = require('../utils/wikidata');

// Cache
const { llmCache } = require('../utils/cache');

// Safety
const { isUnsafeQuery, SAFETY_NOTE } = require('../bot/safety');

// Logger
const { logger } = require('../config');

/**
 * Organic chemistry keyword detection and term extraction
 * Re-uses wikipedia utilities but also provides index-local helpers for speed
 */
const ORGANIC_KEYWORDS = [
  'sn1','sn2','e1','e2','e1cb','sn1 reaction','sn2 reaction','e1 elimination','e2 elimination','e1cb elimination',
  'nucleophilic substitution','electrophilic addition','electrophilic aromatic substitution',
  'nucleophilic addition','elimination','substitution','addition reaction','rearrangement',
  'markovnikov',"markovnikov's rule",'zaitsev','zaitseff','saytzeff',"zaitsev's rule",'aldol','aldol condensation','aldol reaction','claisen','claisen condensation',
  'grignard','grignard reagent','friedel-crafts','friedel crafts','friedel–crafts',
  'diels-alder','diels alder','diels–alder','wittig','wittig reaction','cannizzaro','cannizzaro reaction','perkin',
  'wurtz','kolbe','fischer esterification','michael addition','mannich','heck','suzuki',
  'esterification','saponification','polymerization','condensation','hydrolysis',
  'reduction','oxidation','alkane','alkene','alkyne','aromatic','alcohol','phenol',
  'ether','aldehyde','ketone','carboxylic acid','ester','amide','amine','nitrile',
  'haloalkane','heterocycle','epoxide','anhydride','organometallic','organolithium',
  'gilman','carbocation','carbanion','free radical','enol','enolate','tautomerization',
  'resonance','hyperconjugation','inductive effect','mesomeric effect',
  'chirality','chiral','enantiomer','diastereomer','racemic','meso','optical isomer',
  'stereochemistry','stereocenter','conformation','benzene','pyridine','furan','pyrrole'
];

function isOrganicQueryLocal(question) {
  if (!question || typeof question !== 'string') return false;
  const lower = question.toLowerCase();
  // Use wikipedia's more complete check first
  if (typeof wikiIsOrganic === 'function' && wikiIsOrganic(question)) return true;
  return ORGANIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Alias exported for external use; prefers wikipedia's extractOrganicTerm
 * @param {string} question
 * @returns {string|null}
 */
function extractOrganicTermLocal(question) {
  if (typeof wikiExtractOrganic === 'function') {
    const w = wikiExtractOrganic(question);
    if (w) return w;
  }
  if (!question) return null;
  const lower = question.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const kw of ORGANIC_KEYWORDS) {
    if (lower.includes(kw) && kw.length > bestLen) {
      best = kw;
      bestLen = kw.length;
    }
  }
  if (!best) return null;
  if (ORGANIC_SEARCH_MAP && ORGANIC_SEARCH_MAP[best]) return ORGANIC_SEARCH_MAP[best];
  return best.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Subset that should prioritize Wikipedia over PubChem (mechanisms, named reactions, reagents)
 * Simple compounds like benzene/alkane will stay PubChem-first to avoid degrading existing behavior.
 */
const ORGANIC_WIKI_PRIORITY = [
  'sn1','sn2','e1','e2','e1cb','sn1 reaction','sn2 reaction','e1 elimination','e2 elimination','e1cb elimination',
  'nucleophilic substitution','electrophilic addition','electrophilic aromatic substitution',
  'nucleophilic addition','rearrangement','markovnikov',"markovnikov's rule",'zaitsev','zaitseff','saytzeff',"zaitsev's rule",
  'aldol','aldol condensation','aldol reaction','claisen','claisen condensation',
  'grignard','grignard reagent','friedel-crafts','friedel crafts','friedel–crafts',
  'diels-alder','diels alder','diels–alder','wittig','wittig reaction','cannizzaro','cannizzaro reaction',
  'perkin','wurtz','kolbe','fischer esterification','michael addition','mannich','heck','suzuki',
  'carbocation','carbanion','free radical','enol','enolate','tautomerization','resonance','hyperconjugation',
  'chirality','chiral','enantiomer','diastereomer','racemic','meso','optical isomer','stereochemistry'
];

function isWikiPriorityQuery(question) {
  if (!question || typeof question !== 'string') return false;
  const lower = question.toLowerCase();
  return ORGANIC_WIKI_PRIORITY.some(kw => lower.includes(kw));
}

// Public helpers (also exported below)
const isOrganicQuery = isOrganicQueryLocal;
const extractOrganicTerm = extractOrganicTermLocal;

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
  // Casual greeting override: keep greetings as GENERAL for fast friendly reply
  if (isCasualGreeting(question)) return TASK_TYPES.GENERAL;
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

  // Organic chemistry: explicit routing for mechanisms, named reactions, reagents
  // Ensures "aldol condensation", "Grignard reagent", "SN1", "Markovnikov" etc. go to online search
  if (isOrganicQuery(question)) {
    return TASK_TYPES.EXPLAIN;
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
 * Enhanced for organic chemistry: captures mechanism/reaction/reagents
 * like "SN1", "Markovnikov's rule", "aldol condensation", "Grignard reagent",
 * and handles prefixes "explain", "define", "what is", etc.
 * @param {string} question
 * @returns {string|null}
 */
function extractName(question) {
  if (!question) return null;
  const q = question.trim();

  // Try organic term first for high precision (e.g., "aldol condensation")
  const organicTerm = extractOrganicTerm(q);
  // We'll still try regex captures for more context

  const patterns = [
    // "IUPAC name of X" / "name of X" (allow apostrophe, hyphen, digits)
    /\b(?:iupac\s*name\s*of|systematic\s*name\s*of|name\s*of|named?)\s+([A-Za-z0-9\-'’\s]{2,60})/i,
    // "what is / what are / what's X"
    /\bwhat\s+is\s+([A-Za-z0-9\-'’\s]{2,60})/i,
    /\bwhat\s+are\s+([A-Za-z0-9\-'’\s]{2,60})/i,
    /\bwhat's\s+([A-Za-z0-9\-'’\s]{2,60})/i,
    // "explain / describe / define / tell me about X"
    /\b(?:explain|describe|define)\s+(?:the\s+)?([A-Za-z0-9\-'’\s]{2,60})/i,
    /\btell me about\s+([A-Za-z0-9\-'’\s]{2,60})/i
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (m && m[1]) {
      let candidate = m[1].trim();
      // Strip trailing punctuation and filler phrases
      candidate = candidate.replace(/[?.!]+$/g, '').trim();
      candidate = candidate.replace(/\s+in\s+(organic\s+)?chemistry\s*$/i, '').trim();
      // Remove leading "the" that may have been captured ("what is the aldol...")
      candidate = candidate.replace(/^the\s+/i, '').trim();
      // Remove trailing "reaction/mechanism" filler only if not part of organic term? Keep but clean.
      // For "what is SN1 reaction" -> keep as "SN1 reaction" for better search, but also accept "SN1"
      // Limit length and validate
      if (candidate.length >= 2 && candidate.length <= 60) {
        // Clean up extra words like "please", "for me"
        candidate = candidate.replace(/\s+(please|for me|briefly|in detail)\s*$/i, '').trim();
        return candidate;
      }
    }
  }

  // If query is short and looks like an organic term by itself (e.g., "aldol condensation")
  // return the organic term directly
  if (organicTerm) {
    // For bare queries like "aldol condensation" (no prefix), organicTerm is ideal
    // Check if query is essentially the organic term plus minimal fluff
    const cleanedQ = q.toLowerCase().replace(/[?.!]+$/g, '').trim();
    if (cleanedQ.length <= 60 && isOrganicQuery(q)) {
      // Prefer the most complete name captured earlier, otherwise organicTerm
      // Example: "Markovnikov" -> returns "Markovnikov's rule" via organicTerm mapping
      return organicTerm;
    }
  }

  // Fallback: if query is short (<60 chars) and not a greeting, return the cleaned query itself
  // This handles bare terms like "Grignard reagent" typed without prefix
  if (q.length >= 3 && q.length <= 60 && !isCasualGreeting(q)) {
    const lower = q.toLowerCase();
    // Heuristic: if query contains no verb-heavy generic chat, treat as name
    // Avoid returning full sentences containing "how does" etc.
    if (!/^(hi|hello|hey)\b/i.test(q) && !/\b(how are you|what's up)\b/i.test(lower)) {
      // Strip leading filler "explain" etc. if we missed
      let bare = q.replace(/^(explain|describe|define|tell me about)\s+/i, '').trim();
      bare = bare.replace(/[?.!]+$/g, '').trim();
      if (bare.length >= 2 && /^[A-Za-z0-9\-'’\s]+$/.test(bare) && bare.length <= 60) {
        // Only return if it looks like a chemical/organic name (contains organic keyword or chem-like)
        if (isOrganicQuery(bare) || /^[A-Z][a-z]*(\s|$)/.test(bare) || bare.split(/\s+/).length <= 4) {
          return bare;
        }
      }
    }
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
 * Returns true if the question is a short casual greeting that should skip online sources.
 * Prevents "how are you" (10 chars) from hitting wikidataLookup("how are you") -> Q17092041.
 * @param {string} question
 * @returns {boolean}
 */
function isCasualGreeting(question) {
  if (!question) return false;
  const q = question.trim();
  if (q.length >= 30) return false;
  return /^(hi|hello|hey|how are you|whats up|what's up|how r u|how are u|good morning|good afternoon|good evening|hey there|hi there)\b/i.test(q);
}

/**
 * Try online sources (PubChem, Wikipedia, Wikidata) for a question.
 * Enhanced for organic chemistry: prioritizes Wikipedia for mechanisms,
 * named reactions, and reagents (SN1, Markovnikov, aldol, Grignard).
 * @param {string} question
 * @returns {Promise<{answer: string, source: string, confidence: number}|null>}
 */
async function tryOnlineSources(question) {
  // Early skip for casual greetings: don't hit Wikidata/Wikipedia/PubChem for "how are you"
  if (isCasualGreeting(question)) return null;
  const q = question.trim();
  const isOrganic = isOrganicQuery(q);
  const isWikiPriority = isWikiPriorityQuery(q);
  const organicTerm = extractOrganicTerm(q);

  // For organic WIKI-priority queries (mechanisms, named reactions, reagents), prioritize Wikipedia first
  // Simple compounds like benzene will fall through to normal PubChem-first path to preserve existing behavior
  if (isWikiPriority) {
    try {
      const wikiTarget = organicTerm || extractName(q) || q.replace(/^(what|who|why|how|when|where|explain|describe|define|tell me about)\s+(is|are|was|were|did)?\s*/i, '').trim().replace(/[?.!]+$/g, '').trim();
      // Clean target: remove trailing filler but keep chemistry context
      let cleanTarget = (wikiTarget || '').trim();
      // If target is still a full question, strip leading explain/what is again
      cleanTarget = cleanTarget.replace(/^(what is|what are|explain|describe|define|tell me about)\s+/i, '').trim();
      if (cleanTarget) {
        const results = await searchWikipedia(cleanTarget);
        if (results && results.length > 0 && results[0].extract && results[0].extract.length > 20) {
          const top = results[0];
          let answer = `From Wikipedia (${top.title}):\n${top.extract}\nSource: ${top.url}`;
          if (results.length > 1) {
            answer += `\n\nOther results:\n` + results.slice(1).map(r => `- ${r.title}: ${r.url}`).join('\n');
          }
          return { answer, source: 'wikipedia', confidence: 0.85 };
        }
        // Fallback: try with "organic chemistry" qualifier for short ambiguous terms (e.g., "SN1")
        if (cleanTarget.split(/\s+/).length <= 3) {
          try {
            const altResults = await searchWikipedia(`${cleanTarget} organic chemistry`);
            if (altResults && altResults.length > 0 && altResults[0].extract && altResults[0].extract.length > 30) {
              const top = altResults[0];
              let answer = `From Wikipedia (${top.title}):\n${top.extract}\nSource: ${top.url}`;
              if (altResults.length > 1) {
                answer += `\n\nOther results:\n` + altResults.slice(1).map(r => `- ${r.title}: ${r.url}`).join('\n');
              }
              return { answer, source: 'wikipedia', confidence: 0.82 };
            }
          } catch (_) {}
        }
        // Even if extract is empty, return title/url if we have a hit (better than LLM hallucination)
        if (results && results.length > 0) {
          const top = results[0];
          let answer = `From Wikipedia (${top.title}):\n${top.extract || 'No extract available.'}\nSource: ${top.url}`;
          return { answer, source: 'wikipedia', confidence: 0.78 };
        }
      }
    } catch (err) {
      // ignore, fall through to PubChem/Wikidata
    }

    // Also try PubChem with representative compound mapping for reagent/class terms
    // e.g., "Grignard reagent" -> PubChem for "methylmagnesium bromide"
    try {
      const pcTarget = extractName(q) || organicTerm || q;
      const pc = await searchPubchem(pcTarget);
      if (pc && (pc.iupacName || pc.formula || pc.weight)) {
        let answer = `From PubChem (CID ${pc.cid || '?'}):\n`;
        if (pc.name) answer += `Name: ${pc.name}\n`;
        if (pc.iupacName) answer += `IUPAC: ${pc.iupacName}\n`;
        if (pc.formula) answer += `Formula: ${pc.formula}\n`;
        if (pc.weight) answer += `Molecular Weight: ${pc.weight} g/mol\n`;
        if (pc.smiles) answer += `SMILES: ${pc.smiles}\n`;
        if (pc.inchiKey) answer += `InChIKey: ${pc.inchiKey}\n`;
        if (pc.description) {
          const desc = pc.description.length > 500 ? pc.description.slice(0, 500) + '...' : pc.description;
          answer += `\nDescription: ${desc}\n`;
        }
        // For organic reagent classes, append Wikipedia hint
        if (/grignard|aldol|claisen|friedel|diels/i.test(q)) {
          answer += `\nFor detailed mechanism see Wikipedia: ${organicTerm || pcTarget}`;
        }
        return { answer, source: 'pubchem', confidence: 0.83 };
      }
    } catch (err) {
      // ignore
    }

    // Try Wikidata for organic compounds as enrichment
    try {
      const target = organicTerm || extractName(q) || extractFormula(q) || q;
      const wd = await wikidataLookup(target);
      if (wd && (wd.label || wd.image || wd.meltingPoint || wd.boilingPoint || wd.smiles)) {
        let answer = `From Wikidata (${wd.qid}):\n`;
        if (wd.label) answer += `Label: ${wd.label}\n`;
        if (wd.meltingPoint) answer += `Melting Point: ${wd.meltingPoint} K\n`;
        if (wd.boilingPoint) answer += `Boiling Point: ${wd.boilingPoint} K\n`;
        if (wd.density) answer += `Density: ${wd.density} kg/m^3\n`;
        if (wd.image) answer += `Image: ${wd.image}\n`;
        if (wd.pubchemCid) answer += `PubChem CID: ${wd.pubchemCid}\n`;
        if (wd.cas) answer += `CAS: ${wd.cas}\n`;
        if (wd.smiles) answer += `SMILES: ${wd.smiles}\n`;
        return { answer, source: 'wikidata', confidence: 0.8 };
      }
    } catch (err) {
      // ignore
    }
    // If organic and all above failed, still attempt generic Wikipedia before giving up
    try {
      const fallbackTarget = q.replace(/^(what|who|why|how|when|where|explain|describe|define|tell me about)\s+(is|are|was|were|did)?\s*/i, '').trim().replace(/[?.!]+$/g, '').trim();
      const results = await searchWikipedia(fallbackTarget);
      if (results && results.length > 0) {
        const top = results[0];
        let answer = `From Wikipedia (${top.title}):\n${top.extract || 'No extract available.'}\nSource: ${top.url}`;
        return { answer, source: 'wikipedia', confidence: 0.75 };
      }
    } catch (_) {}
    // If still nothing, return null to let LLM try (but askChem will retry online after LLM)
    // For organic we already exhausted best sources, so don't waste PubChem on generic again below
  }

  // Non-organic path (or organic fallback): original order PubChem -> Wikidata -> Wikipedia
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

  // Try Wikipedia for an open-ended explanation (improved target cleaning)
  try {
    const target = extractName(q) || q.replace(/^(what|who|why|how|when|where|explain|describe|define|tell me about)\s+(is|are|was|were|did)?\s*/i, '').trim().replace(/[?.!]+$/g, '').trim();
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

  // Fast path for GENERAL: casual greetings or short queries (<80 chars) skip online sources
  // Saves time/tokens for "how are you", "tell me a joke" etc. -> direct gpt-4o-mini (non-thinking)
  // BUT never short-circuit organic chemistry queries (they need Wikipedia/PubChem for accurate mechanisms)
  if (taskType === TASK_TYPES.GENERAL && !isOrganicQuery(trimmed) && (isCasualGreeting(trimmed) || trimmed.length < 80)) {
    const fastMessages = [
      { role: 'system', content: SYSTEM_PROMPT_GENERAL },
      { role: 'user', content: trimmed }
    ];
    // callLlm prioritizes OpenAI (gpt-4o-mini) -> temperature 0.7, max_tokens 80 for efficient GENERAL
    const fastResult = await callLlm(fastMessages, { max_tokens: 80, temperature: 0.7 });
    if (fastResult && fastResult.content) {
      let answer = fastResult.content;
      if (safety.note) answer += `\n\n${safety.note}`;
      const result = { source: fastResult.source, answer, taskType, confidence: 0.8 };
      askCacheSet(cacheKey, result);
      return result;
    }
    // if LLM unavailable, fall through to fallback flow below
  }

  // 2) For general/explain/organic questions, try online sources (Wikipedia) first
  //    because they are free and often give a good answer.
  // Skip online sources for casual greetings like "how are you" -> let LLM answer "I'm good!"
  // Also skip for short GENERAL (<80) already handled by fast path above (except organic)
  if ((taskType === TASK_TYPES.GENERAL || taskType === TASK_TYPES.EXPLAIN || isOrganicQuery(trimmed)) && !isCasualGreeting(trimmed)) {
    const shouldSkipOnline = (taskType === TASK_TYPES.GENERAL && trimmed.length < 80 && !isOrganicQuery(trimmed));
    if (!shouldSkipOnline) {
      const online = await tryOnlineSources(trimmed);
      if (online && online.confidence >= 0.7) {
        let answer = online.answer;
        if (safety.note) answer += `\n\n${safety.note}`;
        const result = { source: online.source, answer, taskType, confidence: online.confidence };
        askCacheSet(cacheKey, result);
        return result;
      }
    }
  }

  // 3) Call the LLM (OpenAI prioritized)
  const systemPrompt = chooseSystemPrompt(taskType, trimmed);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: trimmed }
  ];

  const maxTokens = (taskType === TASK_TYPES.GENERAL ? 80 : 400);
  const temperature = (taskType === TASK_TYPES.GENERAL ? 0.7 : 0.3);
  const llmResult = await callLlm(messages, { max_tokens: maxTokens, temperature });
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
  // Includes retry for organic queries with looser confidence, plus all non-GENERAL/EXPLAIN types
  const isOrganicFallback = isOrganicQuery(trimmed);
  const needsOnlineRetry = (taskType !== TASK_TYPES.GENERAL && taskType !== TASK_TYPES.EXPLAIN) || isOrganicFallback;
  if (needsOnlineRetry) {
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
            "Try tapping one of these buttons instead:\n" +
            "  ⚛️ Molar Mass — tap ⚛️ Molar Mass and send a formula like H2SO4\n" +
            "  ⚖️ Balance — tap ⚖️ Balance and send an equation like H2 + O2 -> H2O\n" +
            "  🔬 Element — tap 🔬 Element and send a name like Fe\n" +
            "  📖 IUPAC — tap 📖 IUPAC and send a name like acetic acid\n" +
            "  ⚗️ pH — tap ⚗️ pH and send a formula and concentration like HCl 0.1\n" +
            "  🔮 Predict — tap 🔮 Predict and send reactants like Na + Cl2\n" +
            "  ⚠️ Safety — tap ⚠️ Safety and send a formula like H2SO4",
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
  tryOnlineSources,
  isCasualGreeting,
  isOrganicQuery,
  extractOrganicTerm,
  extractName,
  extractFormula,
  extractEquation,
  ORGANIC_KEYWORDS
};
