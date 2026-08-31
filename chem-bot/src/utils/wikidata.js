/**
 * Wikidata API integration
 * - Lookup element/compound data: image, instance-of, structural formula,
 *   melting/boiling point
 * - Uses both the REST API and SPARQL endpoint
 */

const { safeGet } = require('./http');
const { wikidataCache } = require('./cache');
const { config } = require('../config');

const WD_API = config.wikidataApi || 'https://www.wikidata.org/w/api.php';
const WD_SPARQL = 'https://query.wikidata.org/sparql';
const TIMEOUT_MS = 12000;

// Wikidata properties
const PROP = {
  IMAGE: 'P18',
  INSTANCE_OF: 'P31',
  STRUCTURAL_FORMULA: 'P117',
  MELTING_POINT: 'P2101',
  BOILING_POINT: 'P2102',
  PUBCHEM_CID: 'P662',
  CHEBI: 'P683',
  SMILES: 'P233',
  INCHI: 'P234',
  INCHIKEY: 'P235',
  DENSITY: 'P2054',
  MASS: 'P2067',
  APPEARS_IN_TAXON: 'P171',
  PART_OF: 'P361'
};

// Common instance-of Q-IDs
const Q = {
  CHEMICAL_ELEMENT: 'Q11344',
  CHEMICAL_COMPOUND: '11173'.startsWith('Q') ? 'Q11173' : 'Q11173',
  // note: wikidata Q11173 is "chemical element" (see Q11173 page)
  ELEMENT_OLD: 'Q11173',
  ELEMENT_CORRECT: 'Q11344'
};

/**
 * Search Wikidata for an item by label
 * @param {string} query - Search term
 * @returns {Promise<string|null>} Wikidata QID (e.g. "Q629") or null
 */
async function searchEntity(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cacheKey = `wd:search:${trimmed.toLowerCase()}`;
  if (wikidataCache.has(cacheKey)) return wikidataCache.get(cacheKey);

  try {
    const url = `${WD_API}?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(trimmed)}`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const results = data?.search || [];
    if (results.length === 0) {
      wikidataCache.set(cacheKey, null);
      return null;
    }
    // Pick the first result (or one whose description mentions chemistry/element/compound)
    const best = results.find(r => /chem|element|compound|molecule|substance/i.test(r.description || '')) || results[0];
    wikidataCache.set(cacheKey, best.id);
    return best.id;
  } catch (err) {
    return null;
  }
}

/**
 * Run a SPARQL query against Wikidata
 * @param {string} sparql - SPARQL query string
 * @returns {Promise<Array<Object>>} Bound variables
 */
async function runSparql(sparql) {
  try {
    const url = `${WD_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`;
    const data = await safeGet(url, {
      timeout: TIMEOUT_MS,
      retries: 1,
      headers: { Accept: 'application/sparql-results+json' }
    });
    return data?.results?.bindings || [];
  } catch (err) {
    return [];
  }
}

/**
 * Fetch the structured data for a Wikidata entity
 * @param {string} qid - Wikidata QID (e.g. "Q629")
 * @returns {Promise<Object|null>} Entity data
 */
async function getEntity(qid) {
  if (!qid) return null;
  const cacheKey = `wd:entity:${qid}`;
  if (wikidataCache.has(cacheKey)) return wikidataCache.get(cacheKey);

  try {
    const url = `${WD_API}?action=wbgetentities&format=json&ids=${qid}&props=labels|claims&languages=en`;
    const data = await safeGet(url, { timeout: TIMEOUT_MS, retries: 2 });
    const entity = data?.entities?.[qid];
    if (!entity) {
      wikidataCache.set(cacheKey, null);
      return null;
    }

    const claims = entity.claims || {};
    const label = entity.labels?.en?.value || qid;

    // Image (P18) -> File:XYZ.jpg
    let image = null;
    if (claims[PROP.IMAGE] && claims[PROP.IMAGE][0]) {
      const f = claims[PROP.IMAGE][0].mainsnak?.datavalue?.value;
      if (f) image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}`;
    }

    // Instance-of (P31) -> Q-IDs
    const instanceOf = (claims[PROP.INSTANCE_OF] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

    // Structural formula (P117) -> filename -> commons URL
    let structuralFormula = null;
    if (claims[PROP.STRUCTURAL_FORMULA] && claims[PROP.STRUCTURAL_FORMULA][0]) {
      const f = claims[PROP.STRUCTURAL_FORMULA][0].mainsnak?.datavalue?.value;
      if (f) structuralFormula = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}`;
    }

    // Melting/boiling point - quantity datatype
    function getQuantity(claimList) {
      if (!claimList || !claimList[0]) return null;
      const v = claimList[0].mainsnak?.datavalue?.value;
      if (v && typeof v.amount === 'string') {
        const n = parseFloat(v.amount);
        return isNaN(n) ? null : n;
      }
      return null;
    }
    const meltingPoint = getQuantity(claims[PROP.MELTING_POINT]);
    const boilingPoint = getQuantity(claims[PROP.BOILING_POINT]);
    const density = getQuantity(claims[PROP.DENSITY]);
    const mass = getQuantity(claims[PROP.MASS]);

    // PubChem CID
    let pubchemCid = null;
    if (claims[PROP.PUBCHEM_CID] && claims[PROP.PUBCHEM_CID][0]) {
      pubchemCid = claims[PROP.PUBCHEM_CID][0].mainsnak?.datavalue?.value;
    }

    // InChI / SMILES / InChIKey
    function getString(claimList) {
      if (!claimList || !claimList[0]) return null;
      return claimList[0].mainsnak?.datavalue?.value || null;
    }
    const smiles = getString(claims[PROP.SMILES]);
    const inchi = getString(claims[PROP.INCHI]);
    const inchiKey = getString(claims[PROP.INCHIKEY]);

    const result = {
      qid,
      label,
      image,
      instanceOf,
      structuralFormula,
      meltingPoint,
      boilingPoint,
      density,
      mass,
      pubchemCid,
      smiles,
      inchi,
      inchiKey
    };

    wikidataCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return null;
  }
}

/**
 * Lookup an element or compound by query string
 * Combines entity search and data fetch
 * @param {string} query - Search term
 * @returns {Promise<Object|null>} Combined enrichment data
 */
async function wikidataLookup(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const cacheKey = `wd:lookup:${trimmed.toLowerCase()}`;
  if (wikidataCache.has(cacheKey)) return wikidataCache.get(cacheKey);

  const qid = await searchEntity(trimmed);
  if (!qid) {
    wikidataCache.set(cacheKey, null);
    return null;
  }

  const entity = await getEntity(qid);
  if (!entity) {
    wikidataCache.set(cacheKey, null);
    return null;
  }

  // Optional: enrich with SPARQL data (e.g. CAS number) for known items
  try {
    const sparql = `
      SELECT ?cas WHERE {
        wd:${qid} wdt:P231 ?cas .
      } LIMIT 1
    `;
    const rows = await runSparql(sparql);
    if (rows.length > 0 && rows[0].cas) {
      entity.cas = rows[0].cas.value;
    }
  } catch (err) {
    // SPARQL is optional; ignore failures
  }

  wikidataCache.set(cacheKey, entity);
  return entity;
}

module.exports = {
  wikidataLookup,
  searchEntity,
  getEntity,
  runSparql,
  PROP,
  Q
};
