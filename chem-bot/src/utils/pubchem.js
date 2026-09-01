/**
 * PubChem REST API integration
 * - Search compounds by name or formula
 * - Fetch safety/GHS data
 * - Cached results for performance
 */

const { safeGet } = require('./http');
const { pubchemCache } = require('./cache');
const { config } = require('../config');

const BASE = config.pubchemBase || 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const TIMEOUT_MS = 10000;

/**
 * Organic chemistry handling: mechanism-only terms should skip PubChem
 * and representative compounds for class terms like "Grignard reagent"
 */
const ORGANIC_MECHANISM_ONLY = new Set([
  'sn1', 'sn2', 'e1', 'e2', 'e1cb',
  'sn1 reaction', 'sn2 reaction', 'e1 reaction', 'e2 reaction',
  'markovnikov', "markovnikov's rule", 'markovnikov rule',
  'zaitsev', 'zaitseff', 'saytzeff', "zaitsev's rule",
  'aldol condensation', 'claisen condensation',
  'friedel-crafts', 'friedel crafts', 'diels-alder', 'diels alder',
  'wittig', 'cannizzaro', 'perkin', 'wurtz', 'kolbe'
]);

const ORGANIC_COMPOUND_MAP = {
  'grignard reagent': 'methylmagnesium bromide',
  'grignard': 'methylmagnesium bromide',
  'aldol condensation': '3-hydroxybutanal',
  'aldol': '3-hydroxybutanal',
  'claisen condensation': 'ethyl acetoacetate',
  'claisen': 'ethyl acetoacetate',
  'friedel-crafts': 'acetophenone',
  'friedel crafts': 'acetophenone',
  'diels-alder': 'cyclohexene',
  'diels alder': 'cyclohexene',
  'wittig': 'methylenetriphenylphosphorane',
  'cannizzaro': 'benzyl alcohol',
  'markovnikov': '2-chloropropane',
  'zaitsev': 'but-2-ene',
  'zaitseff': 'but-2-ene',
  'saytzeff': 'but-2-ene'
};

/**
 * Clean a natural-language query for PubChem.
 * Strips question words and keeps the chemical identifier.
 * @param {string} query
 * @returns {string}
 */
function cleanPubChemQuery(query) {
  if (!query || typeof query !== 'string') return '';
  let q = query.trim();
  // Remove leading question prefixes
  q = q.replace(/^(what\s+is|what\s+are|what's|explain|describe|define|tell me about|what is the|explain the|describe the|define the)\s+/i, '').trim();
  // Remove trailing question marks / exclamation
  q = q.replace(/[?.!]+$/g, '').trim();
  // Remove trailing "in chemistry" etc.
  q = q.replace(/\s+in\s+(organic\s+)?chemistry\s*$/i, '').trim();
  // For mechanism queries, keep the term; for PubChem we may later map to representative compound
  return q;
}

/**
 * Check if a query is purely a mechanism/rule term (PubChem will not have it)
 * @param {string} query
 * @returns {boolean}
 */
function isMechanismOnlyQuery(query) {
  if (!query) return false;
  const lower = query.toLowerCase().trim();
  // Exact match or contains only mechanism phrase plus filler
  const cleaned = lower.replace(/^(what is|explain|describe|define)[\s]+/, '').replace(/[?.!]+$/, '').trim();
  if (ORGANIC_MECHANISM_ONLY.has(cleaned)) return true;
  if (ORGANIC_MECHANISM_ONLY.has(lower)) return true;
  // SN1/SN2 with just "reaction" suffix still mechanism-only
  if (/^(sn1|sn2|e1|e2|e1cb)(\s+reaction)?$/i.test(lower)) return true;
  if (/^(markovnikov|zaitsev|aldol|claisen)(\s+(rule|condensation|reaction))?$/i.test(lower)) return true;
  return false;
}

/**
 * Normalize a PubChem property table response
 * @param {Object} data - PubChem response data
 * @returns {Object|null} Normalized properties
 */
function normalizeProps(data) {
  const props = data?.PropertyTable?.Properties?.[0];
  if (!props) return null;
  return {
    cid: props.CID || props.cid,
    name: props.Name || null,
    formula: props.MolecularFormula || null,
    weight: props.MolecularWeight ? parseFloat(props.MolecularWeight) : null,
    iupacName: props.IUPACName || null,
    smiles: props.CanonicalSMILES || props.IsomericSMILES || null,
    inchi: props.InChI || null,
    inchiKey: props.InChIKey || null
  };
}

/**
 * Search PubChem by compound name
 * @param {string} query - Compound name (e.g. "aspirin", "caffeine")
 * @returns {Promise<Object|null>} Compound data
 */
async function searchByName(name) {
  const key = `name:${name.toLowerCase().trim()}`;
  if (pubchemCache.has(key)) return pubchemCache.get(key);

  try {
    const url = `${BASE}/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const result = normalizeProps(data);
    if (result) pubchemCache.set(key, result);
    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Search PubChem by molecular formula (returns first CID)
 * @param {string} formula - Molecular formula
 * @returns {Promise<number|null>} CID or null
 */
async function searchByFormula(formula) {
  const key = `formula:${formula.toLowerCase().trim()}`;
  if (pubchemCache.has(key)) return pubchemCache.get(key);

  try {
    const url = `${BASE}/compound/fastformula/${encodeURIComponent(formula)}/cids/JSON`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const cid = data?.IdentifierList?.CID?.[0] || null;
    if (cid) pubchemCache.set(key, cid);
    return cid;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch a compound by CID
 * @param {number} cid - PubChem CID
 * @returns {Promise<Object|null>} Compound data
 */
async function getByCid(cid) {
  const key = `cid:${cid}`;
  if (pubchemCache.has(key)) return pubchemCache.get(key);

  try {
    const url = `${BASE}/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const result = normalizeProps(data);
    if (result) pubchemCache.set(key, result);
    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch description for a compound
 * @param {number} cid - PubChem CID
 * @returns {Promise<string|null>} Description text
 */
async function getDescription(cid) {
  const key = `desc:${cid}`;
  if (pubchemCache.has(key)) return pubchemCache.get(key);

  try {
    const url = `${BASE}/compound/cid/${cid}/description/JSON`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const info = data?.InformationList?.Information?.[0];
    const desc = info?.Description || null;
    if (desc) pubchemCache.set(key, desc);
    return desc;
  } catch (err) {
    return null;
  }
}

/**
 * Search PubChem (main entry point)
 * Enhanced for organic chemistry: cleans question phrasing,
 * maps reagent/reaction classes to representative compounds,
 * and skips pure mechanism terms quickly.
 * @param {string} query - Compound name or formula or natural question
 * @returns {Promise<Object|null>} Combined data { name, formula, weight, iupacName, cid, smiles, inchi, description }
 */
async function searchPubchem(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Quick skip for pure mechanism/rule queries that PubChem cannot answer
  // (Wikipedia should handle them: SN1, Markovnikov, etc.)
  const lowerTrimmed = trimmed.toLowerCase();
  if (isMechanismOnlyQuery(trimmed) || isMechanismOnlyQuery(lowerTrimmed)) {
    // Still try mapping to representative compound if available (e.g. Grignard -> methylmagnesium bromide)
    const mapped = ORGANIC_COMPOUND_MAP[lowerTrimmed] || ORGANIC_COMPOUND_MAP[lowerTrimmed.replace(/\s+reaction$/,'')] || null;
    if (!mapped) return null;
    // Fall through to mapped compound search
    const mappedResult = await searchByName(mapped);
    if (mappedResult) {
      let cid = mappedResult.cid;
      if (!mappedResult.description && cid) {
        try { mappedResult.description = await getDescription(cid); } catch (e) {}
      }
      return {
        name: mappedResult.name,
        formula: mappedResult.formula,
        weight: mappedResult.weight,
        iupacName: mappedResult.iupacName,
        cid: mappedResult.cid,
        smiles: mappedResult.smiles,
        inchi: mappedResult.inchi,
        inchiKey: mappedResult.inchiKey,
        description: mappedResult.description
      };
    }
    return null;
  }

  // Build candidate list: original, cleaned, mapped representative
  const candidates = [];
  candidates.push(trimmed);
  const cleaned = cleanPubChemQuery(trimmed);
  if (cleaned && cleaned.toLowerCase() !== trimmed.toLowerCase()) candidates.push(cleaned);
  // Also try lowercased mapping for organic reagent classes
  const lowerCleaned = cleaned.toLowerCase();
  if (ORGANIC_COMPOUND_MAP[lowerCleaned]) {
    candidates.push(ORGANIC_COMPOUND_MAP[lowerCleaned]);
  }
  // If original trimmed is a reagent class, also map
  if (ORGANIC_COMPOUND_MAP[lowerTrimmed]) {
    if (!candidates.includes(ORGANIC_COMPOUND_MAP[lowerTrimmed])) candidates.push(ORGANIC_COMPOUND_MAP[lowerTrimmed]);
  }
  // Try each candidate by name, then by formula, return first success
  for (const cand of candidates) {
    if (!cand || cand.length < 2) continue;
    // Skip if candidate is still a pure mechanism after cleaning and no mapping exists
    if (isMechanismOnlyQuery(cand) && !ORGANIC_COMPOUND_MAP[cand.toLowerCase()]) continue;

    let result = await searchByName(cand);
    let cid = result?.cid;

    // If not found, try by formula (only if candidate looks like formula)
    if (!result && /^[A-Z][A-Za-z0-9()]*\d*/.test(cand) && cand.length < 20) {
      cid = await searchByFormula(cand);
      if (cid) {
        result = await getByCid(cid);
      }
    }

    if (result) {
      if (!result.description && cid) {
        try {
          result.description = await getDescription(cid);
        } catch (err) {
          // ignore
        }
      }
      return {
        name: result.name,
        formula: result.formula,
        weight: result.weight,
        iupacName: result.iupacName,
        cid: result.cid,
        smiles: result.smiles,
        inchi: result.inchi,
        inchiKey: result.inchiKey,
        description: result.description
      };
    }
  }

  return null;
}

/**
 * Fetch GHS safety summary for a compound
 * @param {number|string} cidOrQuery - CID number or query string
 * @returns {Promise<string|null>} Formatted safety text
 */
async function getSafetySummary(cidOrQuery) {
  let cid = cidOrQuery;

  // If not a number, look up CID
  if (typeof cidOrQuery === 'string') {
    const found = await searchPubchem(cidOrQuery);
    if (!found) return null;
    cid = found.cid;
  }

  if (!cid) return null;

  const cacheKey = `safety:${cid}`;
  if (pubchemCache.has(cacheKey)) return pubchemCache.get(cacheKey);

  try {
    // Try to fetch GHS section data
    const url = `${BASE}/compound/cid/${cid}/section/Safety-and-Hazards/JSON`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const sections = data?.Record?.Section || [];

    if (sections.length === 0) {
      const msg = 'No detailed GHS safety data available from PubChem for this compound.';
      pubchemCache.set(cacheKey, msg);
      return msg;
    }

    let text = `GHS Safety Summary (PubChem CID ${cid}):\n\n`;

    for (const section of sections.slice(0, 3)) {
      const heading = section.TOCHeading || 'Safety Information';
      text += `${heading}:\n`;

      for (const info of (section.Information || []).slice(0, 5)) {
        const name = info.Name || '';
        const values = info.Value?.StringWithMarkup || [];
        for (const v of values.slice(0, 3)) {
          const s = v.String || '';
          if (s && s.length < 300) {
            text += `  - ${name ? name + ': ' : ''}${s}\n`;
          }
        }
      }
      text += '\n';
    }

    text += 'Note: Always consult the official Safety Data Sheet (SDS) for full details.';
    pubchemCache.set(cacheKey, text);
    return text;
  } catch (err) {
    return null;
  }
}

module.exports = {
  searchPubchem,
  getSafetySummary,
  searchByName,
  searchByFormula,
  getByCid,
  getDescription,
  cleanPubChemQuery,
  isMechanismOnlyQuery,
  ORGANIC_COMPOUND_MAP,
  ORGANIC_MECHANISM_ONLY
};
