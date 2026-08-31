/**
 * Multi-source chemistry search tool
 */

const axios = require('axios');
const { config } = require('../config');

/**
 * Search across PubChem and Wikipedia
 * @param {string} query - Search query
 * @returns {Promise<string>} Formatted search results
 */
async function query(searchQuery) {
  try {
    const [pubchemResult, wikiResult] = await Promise.allSettled([
      searchPubChem(searchQuery),
      searchWikipedia(searchQuery)
    ]);

    let result = `<b>🔍 Search Results for: "${searchQuery}"</b>\n\n`;

    // PubChem results
    if (pubchemResult.status === 'fulfilled' && pubchemResult.value) {
      result += `📊 <b>PubChem:</b>\n${pubchemResult.value}\n\n`;
    } else {
      result += `📊 <b>PubChem:</b> No results found\n\n`;
    }

    // Wikipedia results
    if (wikiResult.status === 'fulfilled' && wikiResult.value) {
      result += `📚 <b>Wikipedia:</b>\n${wikiResult.value}\n\n`;
    } else {
      result += `📚 <b>Wikipedia:</b> No results found\n\n`;
    }

    return result;
  } catch (err) {
    return `Search failed: ${err.message}`;
  }
}

/**
 * Search PubChem
 * @param {string} query - Search query
 * @returns {Promise<string>} PubChem results
 */
async function searchPubChem(query) {
  try {
    const url = `${config.pubchemBase}/compound/name/${encodeURIComponent(query)}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`;
    const response = await axios.get(url, { timeout: 8000 });
    const props = response.data?.PropertyTable?.Properties?.[0];

    if (props) {
      return `<b>IUPAC:</b> ${props.IUPACName || 'N/A'}
<b>Formula:</b> ${props.MolecularFormula || 'N/A'}
<b>Weight:</b> ${props.MolecularWeight || 'N/A'} g/mol
<b>CID:</b> ${props.CID}`;
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Search Wikipedia
 * @param {string} query - Search query
 * @returns {Promise<string>} Wikipedia results
 */
async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 8000 });
    const data = response.data;

    if (data && data.extract) {
      const extract = data.extract.length > 400
        ? data.extract.substring(0, 400) + '...'
        : data.extract;

      return `<b>${data.title}</b>
${extract}

<a href="${data.content_urls?.desktop?.page || '#'}">Read more on Wikipedia</a>`;
    }

    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { query };
