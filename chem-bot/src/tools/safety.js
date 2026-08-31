/**
 * Safety information tool using PubChem
 *
 * Uses PubChem PUG View API to retrieve safety data including
 * GHS classification, hazards, and exposure limits.
 */

const axios = require('axios');
const { config } = require('../config');

const PUG_VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound';
const SAFETY_HEADINGS = [
  'Safety and Hazards',
  'Hazards Identification',
  'GHS Classification',
  'Hazards Summary',
  'Health Hazards',
  'Fire Hazards',
  'Toxicity Summary',
  'Toxicological Information'
];

/**
 * Find sections by heading name (case-insensitive, partial match)
 * @param {Array} sections
 * @param {string} target
 * @returns {Array} matched sections
 */
function findSections(sections, target) {
  const results = [];
  for (const s of sections || []) {
    if (s.TOCHeading && s.TOCHeading.toLowerCase().includes(target.toLowerCase())) {
      results.push(s);
    }
    if (s.Section) {
      results.push(...findSections(s.Section, target));
    }
  }
  return results;
}

/**
 * Extract text content from a PubChem section
 * @param {Object} section
 * @returns {string} text
 */
function extractSectionText(section) {
  let text = '';
  if (section.Information) {
    for (const info of section.Information) {
      const name = info.Name || '';
      if (info.Value && info.Value.StringWithMarkup) {
        for (const v of info.Value.StringWithMarkup) {
          const t = (v.String || '').trim();
          // Filter out icon-only strings (mostly whitespace with markup icons)
          if (t && t.replace(/\s+/g, '').length > 3) {
            text += (name ? `**${name}:** ` : '') + t.substring(0, 500) + '\n';
          }
        }
      } else if (info.Value && typeof info.Value === 'object' && info.Value.String) {
        text += `${name ? name + ': ' : ''}${info.Value.String}\n`;
      }
    }
  }
  if (section.Section) {
    for (const sub of section.Section) {
      const subText = extractSectionText(sub);
      if (subText) text += `\n[${sub.TOCHeading || 'Sub'}]\n${subText}`;
    }
  }
  return text.trim();
}

/**
 * Get safety information from PubChem
 * @param {string} formula - Chemical formula or name
 * @returns {Promise<string>} Formatted safety info
 */
async function getInfo(formula) {
  try {
    // Get CID from PubChem
    const lookupUrl = `${config.pubchemBase}/compound/name/${encodeURIComponent(formula)}/cids/JSON`;
    const lookupRes = await axios.get(lookupUrl, { timeout: 10000 });
    const cid = lookupRes.data?.IdentifierList?.CID?.[0];

    if (!cid) {
      return `Could not find safety information for "${formula}". Try a different formula or name.`;
    }

    // Get full PUG View data
    const viewUrl = `${PUG_VIEW}/${cid}/JSON`;
    const viewRes = await axios.get(viewUrl, { timeout: 15000 });
    const allSections = viewRes.data?.Record?.Section || [];

    let result = `<b>⚠️ Safety Information</b>\n\n<b>Compound:</b> ${formula}\n<b>CID:</b> ${cid}\n\n`;

    let foundAny = false;
    for (const heading of SAFETY_HEADINGS) {
      const matches = findSections(allSections, heading);
      for (const m of matches) {
        const text = extractSectionText(m);
        // Accept text of any length up to 4000 chars
        if (text && text.length > 0) {
          result += `<b>${m.TOCHeading}:</b>\n${text.substring(0, 1500)}\n\n`;
          foundAny = true;
        }
      }
    }

    if (!foundAny) {
      result += 'No detailed safety data available from PubChem.\n\n';
      result += 'For accurate safety information:\n';
      result += '• Consult Safety Data Sheets (SDS)\n';
      result += '• Check GHS classification databases\n';
      result += '• Refer to your institution\'s safety guidelines\n\n';
      result += '⚠️ <b>Always treat unknown chemicals as hazardous!</b>';
      return result;
    }

    result += '⚠️ <b>Disclaimer:</b> This is a reference only. Always consult official SDS sheets.';
    return result;
  } catch (err) {
    return `Unable to retrieve safety information for "${formula}".

For safety information, please:
• Check the official PubChem page: https://pubchem.ncbi.nlm.nih.gov
• Consult a Safety Data Sheet (SDS)
• Contact your local safety officer

⚠️ <b>Always treat unknown chemicals as hazardous!</b>`;
  }
}

module.exports = { getInfo };
