/**
 * Wikipedia API integration
 * - Search and fetch short extracts
 * - Filters to chemistry-relevant results where possible
 */

const { safeGet } = require('./http');
const { wikipediaCache } = require('./cache');

const TIMEOUT_MS = 10000;
const DEFAULT_LANG = 'en';
const MAX_RESULTS = 3;
const SR_LIMIT = 5;

/**
 * Chemistry-related keywords used to filter/rank search results
 */
const CHEM_KEYWORDS = [
  'chemistry', 'chemical', 'compound', 'element', 'molecule', 'reaction',
  'acid', 'base', 'organic', 'inorganic', 'polymer', 'isomer', 'isotope',
  'bond', 'ion', 'salt', 'oxide', 'hydroxide', 'carbonate', 'sulfate',
  'enzyme', 'protein', 'lipid', 'carbohydrate', 'nucleic', 'amino',
  'alkane', 'alkene', 'alkyne', 'aromatic', 'ester', 'ether', 'alcohol',
  'amine', 'amide', 'aldehyde', 'ketone', 'phenol', 'benzene',
  'catalyst', 'equilibrium', 'oxidation', 'reduction', 'titration',
  'periodic', 'valence', 'orbital', 'electron', 'proton', 'neutron',
  'thermodynamic', 'kinetic', 'electrochem', 'biochem',
  // Organic chemistry extensions (mechanisms, named reactions, stereochemistry)
  'nucleophilic', 'electrophilic', 'substitution', 'elimination', 'addition',
  'rearrangement', 'condensation', 'hydrolysis', 'esterification', 'saponification',
  'carbocation', 'carbanion', 'radical', 'heterocycle', 'aliphatic',
  'stereochemistry', 'enantiomer', 'diastereomer', 'chiral', 'achiral', 'racemic', 'meso',
  'conformation', 'resonance', 'tautomer', 'enol', 'enolate',
  'nucleophile', 'electrophile', 'leaving group', 'transition state', 'intermediate',
  'sn1', 'sn2', 'e1', 'e2', 'markovnikov', 'zaitsev', 'saytzeff', 'aldol', 'claisen',
  'grignard', 'friedel-crafts', 'diels-alder', 'wittig', 'cannizzaro', 'kolbe',
  'michael', 'mannich', 'heck', 'suzuki', 'perkin', 'wurtz',
  'organometallic', 'organolithium', 'gilman', 'carboxylic', 'anhydride', 'epoxide',
  'toluene', 'aniline', 'pyridine', 'furan', 'pyrrole',
  'inductive', 'mesomeric', 'hyperconjugation', 'optical isomer', 'stereocenter'
];

/**
 * Organic-specific keywords and Wikipedia search mappings
 * Used to route mechanism/reaction queries to the best Wikipedia title
 */
const ORGANIC_KEYWORDS = [
  'sn1', 'sn2', 'e1', 'e2', 'e1cb', 'sn1 reaction', 'sn2 reaction', 'e1 elimination', 'e2 elimination', 'e1cb elimination',
  'nucleophilic substitution', 'electrophilic addition', 'electrophilic aromatic substitution',
  'nucleophilic addition', 'elimination', 'substitution', 'addition reaction',
  'rearrangement', 'markovnikov', "markovnikov's rule", 'zaitsev', 'zaitseff', 'saytzeff', "zaitsev's rule",
  'aldol', 'aldol condensation', 'aldol reaction', 'claisen', 'claisen condensation',
  'grignard', 'grignard reagent', 'friedel-crafts', 'friedel crafts', 'friedel–crafts',
  'diels-alder', 'diels alder', 'diels–alder', 'wittig', 'wittig reaction', 'cannizzaro', 'cannizzaro reaction', 'perkin',
  'wurtz', 'kolbe', 'fischer esterification', 'michael addition',
  'mannich', 'heck', 'suzuki', 'esterification', 'saponification',
  'polymerization', 'condensation', 'hydrolysis',
  'alkane', 'alkene', 'alkyne', 'aromatic', 'alcohol', 'phenol', 'ether',
  'aldehyde', 'ketone', 'carboxylic acid', 'ester', 'amide', 'amine',
  'epoxide', 'anhydride', 'nitrile', 'haloalkane',
  'chirality', 'chiral', 'enantiomer', 'diastereomer', 'racemic', 'meso',
  'optical isomer', 'stereochemistry', 'conformation', 'resonance', 'tautomer',
  'carbocation', 'carbanion', 'free radical', 'enol', 'enolate',
  'organolithium', 'gilman', 'benzene', 'pyridine', 'hyperconjugation'
];

const ORGANIC_SEARCH_MAP = {
  'sn1': 'SN1 reaction',
  'sn1 reaction': 'SN1 reaction',
  'sn2': 'SN2 reaction',
  'sn2 reaction': 'SN2 reaction',
  'e1': 'E1 elimination',
  'e1 elimination': 'E1 elimination',
  'e2': 'E2 elimination',
  'e2 elimination': 'E2 elimination',
  'e1cb': 'E1cB elimination',
  'e1cb elimination': 'E1cB elimination',
  'markovnikov': "Markovnikov's rule",
  "markovnikov's rule": "Markovnikov's rule",
  'zaitsev': "Zaitsev's rule",
  'zaitseff': "Zaitsev's rule",
  'saytzeff': "Zaitsev's rule",
  "zaitsev's rule": "Zaitsev's rule",
  'aldol condensation': 'Aldol condensation',
  'aldol': 'Aldol reaction',
  'aldol reaction': 'Aldol reaction',
  'claisen condensation': 'Claisen condensation',
  'claisen': 'Claisen condensation',
  'grignard reagent': 'Grignard reagent',
  'grignard': 'Grignard reagent',
  'friedel-crafts': 'Friedel–Crafts reaction',
  'friedel crafts': 'Friedel–Crafts reaction',
  'friedel–crafts': 'Friedel–Crafts reaction',
  'diels-alder': 'Diels–Alder reaction',
  'diels alder': 'Diels–Alder reaction',
  'diels–alder': 'Diels–Alder reaction',
  'wittig': 'Wittig reaction',
  'wittig reaction': 'Wittig reaction',
  'cannizzaro': 'Cannizzaro reaction',
  'cannizzaro reaction': 'Cannizzaro reaction',
  'perkin': 'Perkin reaction',
  'wurtz': 'Wurtz reaction',
  'kolbe': 'Kolbe electrolysis',
  'fischer esterification': 'Fischer esterification',
  'michael addition': 'Michael reaction',
  'michael': 'Michael reaction'
};

/**
 * Check if a title or snippet looks chemistry-related
 * @param {string} text - Text to check
 * @returns {boolean} True if likely chemistry
 */
function isChemRelevant(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CHEM_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Check if a query is organic-chemistry-related
 * @param {string} text
 * @returns {boolean}
 */
function isOrganicQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return ORGANIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Check if text looks organic-relevant (title/snippet)
 * Uses organic keywords subset for ranking
 * @param {string} text
 * @returns {boolean}
 */
function isOrganicRelevant(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return ORGANIC_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Extract the best organic search term from a question.
 * Returns the ideal Wikipedia title (e.g. "SN1 reaction") or null.
 * @param {string} question
 * @returns {string|null}
 */
function extractOrganicTerm(question) {
  if (!question || typeof question !== 'string') return null;
  const lower = question.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const kw of ORGANIC_KEYWORDS) {
    if (lower.includes(kw)) {
      if (kw.length > bestLen) {
        best = kw;
        bestLen = kw.length;
      }
    }
  }
  if (!best) return null;
  // Return mapped Wikipedia title if available
  if (ORGANIC_SEARCH_MAP[best]) return ORGANIC_SEARCH_MAP[best];
  // Otherwise return the matched keyword with title-case for better search
  // Capitalize first letter of each word for phrase queries
  return best.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Get ideal Wikipedia search term for an organic query
 * @param {string} question
 * @returns {string|null}
 */
function getOrganicSearchTerm(question) {
  return extractOrganicTerm(question);
}

/**
 * Search Wikipedia and return top results
 * @param {string} query - Search query
 * @param {string} lang - Language code (default 'en')
 * @returns {Promise<Array<{title, url, extract}>>} Search results
 */
async function searchWikipedia(query, lang = DEFAULT_LANG) {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `wiki:${lang}:${trimmed.toLowerCase()}`;
  if (wikipediaCache.has(cacheKey)) return wikipediaCache.get(cacheKey);

  const apiBase = `https://${lang}.wikipedia.org/w/api.php`;

  try {
    // Step 1: search for pages
    const searchUrl = `${apiBase}?action=query&format=json&list=search&srsearch=${encodeURIComponent(trimmed)}&srlimit=${SR_LIMIT}`;
    const searchData = await safeGet(searchUrl, { timeout: TIMEOUT_MS, retries: 2 });
    const hits = searchData?.query?.search || [];

    if (hits.length === 0) {
      wikipediaCache.set(cacheKey, []);
      return [];
    }

    // Rank by chemistry relevance (chem-related first, then by index)
    const ranked = hits
      .map((h, i) => ({
        hit: h,
        index: i,
        chemScore:
          (isChemRelevant(h.title) ? 2 : 0) +
          (isChemRelevant(h.snippet || '') ? 1 : 0)
      }))
      .sort((a, b) => b.chemScore - a.chemScore || a.index - b.index);

    const top = ranked.slice(0, MAX_RESULTS);

    // Step 2: fetch short extract for each
    const pageIds = top.map(t => t.hit.pageid).join('|');
    const extractUrl = `${apiBase}?action=query&format=json&prop=extracts&exintro=1&explaintext=1&exsentences=3&pageids=${pageIds}`;
    let extractData = {};
    try {
      extractData = await safeGet(extractUrl, { timeout: TIMEOUT_MS, retries: 1 });
    } catch (err) {
      // Fall through; we will return empty extracts
    }

    const pages = extractData?.query?.pages || {};
    const results = top.map(t => {
      const page = pages[t.hit.pageid];
      const extract = page?.extract || '';
      const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.hit.title.replace(/ /g, '_'))}`;
      return {
        title: t.hit.title,
        url,
        extract: extract.trim()
      };
    });

    wikipediaCache.set(cacheKey, results);
    return results;
  } catch (err) {
    return [];
  }
}

module.exports = {
  searchWikipedia,
  isChemRelevant,
  isOrganicQuery,
  isOrganicRelevant,
  extractOrganicTerm,
  getOrganicSearchTerm,
  ORGANIC_KEYWORDS,
  ORGANIC_SEARCH_MAP,
  CHEM_KEYWORDS
};
