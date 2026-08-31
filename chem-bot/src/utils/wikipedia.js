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
  'thermodynamic', 'kinetic', 'electrochem', 'biochem'
];

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
  isChemRelevant
};
