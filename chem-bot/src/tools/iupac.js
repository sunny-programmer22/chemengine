/**
 * IUPAC name lookup tool
 */

const axios = require('axios');
const { config } = require('../config');

/**
 * Try to look up IUPAC name from PubChem
 * @param {string} name - Compound name
 * @returns {Promise<string>} Formatted result
 */
async function lookup(name) {
  try {
    // Try PubChem first
    const url = `${config.pubchemBase}/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,IUPACName/JSON`;
    const response = await axios.get(url, { timeout: 10000 });
    const props = response.data?.PropertyTable?.Properties?.[0];

    if (props) {
      const { MolecularFormula, IUPACName } = props;

      return `<b>IUPAC Name Lookup</b>

<b>Input:</b> ${name}

<b>IUPAC Name:</b> ${IUPACName || 'Not available'}
<b>Molecular Formula:</b> ${MolecularFormula || 'Not available'}

<i>Source: PubChem</i>

Try tapping ⚛️ Molar Mass to calculate the molar mass of this compound!`;
    }

    return `Could not find IUPAC name for "${name}". Try a different name or formula.`;
  } catch (err) {
    // Fallback to basic lookups
    return fallbackLookup(name);
  }
}

/**
 * Fallback IUPAC lookup for common compounds
 * @param {string} name - Compound name
 * @returns {string} Formatted result
 */
function fallbackLookup(name) {
  const lower = name.toLowerCase().trim();
  const common = COMMON_COMPOUNDS[lower];

  if (common) {
    return `<b>IUPAC Name Lookup</b>

<b>Input:</b> ${name}

<b>IUPAC Name:</b> ${common.iupac}
<b>Molecular Formula:</b> ${common.formula}
<b>Common Name:</b> ${common.common}

<i>Source: Internal database</i>`;
  }

  return `<b>IUPAC Name Lookup</b>

I couldn't find a definitive IUPAC name for "${name}".

Common IUPAC naming patterns:
• Methane (CH₄), Ethane (C₂H₆), Propane (C₃H₈)
• Methanol (CH₃OH), Ethanol (C₂H₅OH)
• Acetic acid (CH₃COOH), Formic acid (HCOOH)
• Sulfuric acid (H₂SO₄), Hydrochloric acid (HCl)

Try tapping 🔍 Search for more options about "${name}".`;
}

/**
 * Common compounds database
 */
const COMMON_COMPOUNDS = {
  'water': { iupac: 'Oxidane', formula: 'H2O', common: 'Water' },
  'methane': { iupac: 'Methane', formula: 'CH4', common: 'Methane' },
  'ethane': { iupac: 'Ethane', formula: 'C2H6', common: 'Ethane' },
  'propane': { iupac: 'Propane', formula: 'C3H8', common: 'Propane' },
  'butane': { iupac: 'Butane', formula: 'C4H10', common: 'Butane' },
  'methanol': { iupac: 'Methanol', formula: 'CH3OH', common: 'Methyl alcohol' },
  'ethanol': { iupac: 'Ethanol', formula: 'C2H5OH', common: 'Ethyl alcohol' },
  'propanol': { iupac: 'Propan-1-ol', formula: 'C3H7OH', common: 'Propyl alcohol' },
  'isopropanol': { iupac: 'Propan-2-ol', formula: 'C3H7OH', common: 'Isopropyl alcohol' },
  'acetic acid': { iupac: 'Acetic acid / Ethanoic acid', formula: 'CH3COOH', common: 'Vinegar' },
  'formic acid': { iupac: 'Formic acid / Methanoic acid', formula: 'HCOOH', common: 'Formic acid' },
  'propionic acid': { iupac: 'Propanoic acid', formula: 'C2H5COOH', common: 'Propionic acid' },
  'sulfuric acid': { iupac: 'Sulfuric acid', formula: 'H2SO4', common: 'Oil of vitriol' },
  'hydrochloric acid': { iupac: 'Hydrogen chloride (aqueous)', formula: 'HCl', common: 'Muriatic acid' },
  'nitric acid': { iupac: 'Nitric acid', formula: 'HNO3', common: 'Aqua fortis' },
  'phosphoric acid': { iupac: 'Phosphoric acid', formula: 'H3PO4', common: 'Orthophosphoric acid' },
  'sodium hydroxide': { iupac: 'Sodium hydroxide', formula: 'NaOH', common: 'Caustic soda' },
  'potassium hydroxide': { iupac: 'Potassium hydroxide', formula: 'KOH', common: 'Caustic potash' },
  'calcium hydroxide': { iupac: 'Calcium hydroxide', formula: 'Ca(OH)2', common: 'Slaked lime' },
  'ammonia': { iupac: 'Azane', formula: 'NH3', common: 'Ammonia' },
  'glucose': { iupac: 'D-Glucose / (2R,3S,4R,5R)-2,3,4,5,6-Pentahydroxyhexanal', formula: 'C6H12O6', common: 'Dextrose' },
  'sucrose': { iupac: 'Sucrose / β-D-Fructofuranosyl α-D-glucopyranoside', formula: 'C12H22O11', common: 'Table sugar' },
  'aspirin': { iupac: 'Acetylsalicylic acid', formula: 'C9H8O4', common: 'Aspirin' },
  'caffeine': { iupac: '1,3,7-Trimethylpurine-2,6-dione', formula: 'C8H10N4O2', common: 'Caffeine' }
};

module.exports = { lookup };
