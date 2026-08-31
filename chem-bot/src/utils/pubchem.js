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
 * @param {string} query - Compound name or formula
 * @returns {Promise<Object|null>} Combined data { name, formula, weight, iupacName, cid, smiles, inchi, description }
 */
async function searchPubchem(query) {
  if (!query || typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Try by name first
  let result = await searchByName(trimmed);
  let cid = result?.cid;

  // If not found, try by formula
  if (!result) {
    cid = await searchByFormula(trimmed);
    if (cid) {
      result = await getByCid(cid);
    }
  }

  if (!result) return null;

  // Try to enrich with description
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
  getDescription
};
