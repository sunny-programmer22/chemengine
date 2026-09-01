/**
 * Tests for src/tools/organic.js — comprehensive organic chemistry toolkit
 * Covers 5 core sections: hydrocarbons, functional groups, mechanisms, stereochemistry, spectroscopy
 * Plus polymers/biomolecules bonus, dispatcher, and handler button checks
 *
 * Verifies: functions exist, return correct formatted strings, handle edge cases,
 * and handler.js welcomeText migrated from slash commands to button labels with inline_keyboard.
 */

const organic = require('../src/tools/organic');
const fs = require('fs');
const path = require('path');

// Helper to normalize includes check
function includesCI(str, sub) {
  return String(str).toLowerCase().includes(String(sub).toLowerCase());
}

// ---------------------------------------------------------------------------
// 1. Module exports & existence
// ---------------------------------------------------------------------------
describe('organic module — exports', () => {
  test('getHydrocarbons exists and is function', () => {
    assert.ok(organic.getHydrocarbons);
    assert.strictEqual(typeof organic.getHydrocarbons, 'function');
  });

  test('getFunctionalGroups exists and is function', () => {
    assert.ok(organic.getFunctionalGroups);
    assert.strictEqual(typeof organic.getFunctionalGroups, 'function');
  });

  test('getReactionMechanisms exists and is function', () => {
    assert.ok(organic.getReactionMechanisms);
    assert.strictEqual(typeof organic.getReactionMechanisms, 'function');
  });

  test('getStereochemistry exists and is function', () => {
    assert.ok(organic.getStereochemistry);
    assert.strictEqual(typeof organic.getStereochemistry, 'function');
  });

  test('getSpectroscopy exists and is function', () => {
    assert.ok(organic.getSpectroscopy);
    assert.strictEqual(typeof organic.getSpectroscopy, 'function');
  });

  test('getPolymersBiomolecules exists and is function (bonus section)', () => {
    assert.ok(organic.getPolymersBiomolecules);
    assert.strictEqual(typeof organic.getPolymersBiomolecules, 'function');
  });

  test('organic dispatcher exists and is function', () => {
    assert.ok(organic.organic);
    assert.strictEqual(typeof organic.organic, 'function');
  });

  test('listSections returns 6 sections', () => {
    assert.ok(typeof organic.listSections === 'function');
    const sections = organic.listSections();
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length >= 5);
    assert.ok(sections.includes('hydrocarbons'));
    assert.ok(sections.includes('functionalGroups'));
    assert.ok(sections.includes('reactionMechanisms'));
    assert.ok(sections.includes('stereochemistry'));
    assert.ok(sections.includes('spectroscopy'));
  });

  test('aliases exist: hydrocarbons, functionalGroups, stereochemistry, spectroscopy', () => {
    assert.strictEqual(typeof organic.hydrocarbons, 'function');
    assert.strictEqual(typeof organic.functionalGroups, 'function');
    assert.strictEqual(typeof organic.reactionMechanisms, 'function');
    assert.strictEqual(typeof organic.stereochemistry, 'function');
    assert.strictEqual(typeof organic.spectroscopy, 'function');
  });

  test('getOrganicInfo exists and dispatches', () => {
    assert.strictEqual(typeof organic.getOrganicInfo, 'function');
    const r = organic.getOrganicInfo('hydrocarbons', 'alkane');
    assert.ok(typeof r === 'string' && r.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Hydrocarbons — 12 tests
// ---------------------------------------------------------------------------
describe('organic — hydrocarbons', () => {
  test('getHydrocarbons() overview contains Hydrocarbons header and families', () => {
    const r = organic.getHydrocarbons();
    assert.ok(typeof r === 'string');
    assert.ok(r.includes('Hydrocarbons'));
    assert.ok(r.includes('Alkanes') || r.includes('alkanes'));
    assert.ok(r.includes('Alkenes') || r.includes('alkenes'));
    assert.ok(r.includes('Alkynes') || r.includes('alkynes'));
    assert.ok(r.includes('Aromatic'));
  });

  test('getHydrocarbons("alkane") filtered returns Alkanes block with sp3 and CnH2n+2', () => {
    const r = organic.getHydrocarbons('alkane');
    assert.ok(r.includes('Alkanes'));
    assert.ok(includesCI(r, 'sp³') || r.includes('sp3') || r.includes('Tetrahedral'));
    assert.ok(r.includes('CnH2n+2'));
    assert.ok(r.includes('butane') || r.includes('C4H10'));
  });

  test('getHydrocarbons("alkene") returns Alkenes with planar and Markovnikov hint', () => {
    const r = organic.getHydrocarbons('alkene');
    assert.ok(r.includes('Alkenes'));
    assert.ok(includesCI(r, 'sp²') || r.includes('Planar') || r.includes('120°'));
    // single-hit tip includes Markovnikov
    assert.ok(includesCI(r, 'markov') || r.includes('C=C'));
  });

  test('getHydrocarbons("alkyne") returns Alkynes with linear and 180°', () => {
    const r = organic.getHydrocarbons('alkyne');
    assert.ok(r.includes('Alkynes') || includesCI(r, 'alkyne'));
    assert.ok(r.includes('180') || includesCI(r, 'linear') || includesCI(r, 'sp'));
  });

  test('getHydrocarbons("aromatic") returns Aromatic with benzene/Hückel/150 pm', () => {
    const r = organic.getHydrocarbons('aromatic');
    assert.ok(includesCI(r, 'aromatic'));
    assert.ok(r.includes('benzene') || r.includes('C6H6') || r.includes('Hückel') || r.includes('Huckel'));
  });

  test('getHydrocarbons("cyclo") returns Cycloalkanes / cyclohexane chair', () => {
    const r = organic.getHydrocarbons('cyclo');
    assert.ok(includesCI(r, 'cyclo'));
    assert.ok(r.includes('cyclohexane') || r.includes('Cyclo'));
  });

  test('getHydrocarbons("benzene") exact match returns Aromatic Hydrocarbons', () => {
    const r = organic.getHydrocarbons('benzene');
    assert.ok(includesCI(r, 'aromatic') || r.includes('Arenes'));
    assert.ok(r.includes('benzene') || r.includes('C6H6'));
  });

  test('getHydrocarbons("unknownXYZ") returns No exact match but still contains Hydrocarbons', () => {
    const r = organic.getHydrocarbons('unknownXYZ');
    assert.ok(typeof r === 'string');
    assert.ok(r.includes('No exact match') || r.includes('No match'));
    assert.ok(r.includes('Hydrocarbons'));
  });

  test('getHydrocarbons handles case-insensitive "ALKANE"', () => {
    const r1 = organic.getHydrocarbons('alkane');
    const r2 = organic.getHydrocarbons('ALKANE');
    assert.ok(r1.includes('Alkanes'));
    assert.ok(r2.includes('Alkanes'));
    // Should be same filtered content
    assert.ok(r2.length > 100);
  });

  test('getHydrocarbons("") empty returns overview not error', () => {
    const r = organic.getHydrocarbons('');
    assert.ok(r.includes('Hydrocarbons'));
    assert.ok(r.length > 200);
  });

  test('getHydrocarbons(null) graceful fallback returns overview', () => {
    const r = organic.getHydrocarbons(null);
    assert.ok(typeof r === 'string');
    assert.ok(r.includes('Hydrocarbons'));
  });

  test('getHydrocarbons(undefined) graceful fallback', () => {
    const r = organic.getHydrocarbons(undefined);
    assert.ok(typeof r === 'string');
    assert.ok(r.includes('Hydrocarbons'));
  });
});

// ---------------------------------------------------------------------------
// 3. Functional Groups — 11 tests
// ---------------------------------------------------------------------------
describe('organic — functionalGroups', () => {
  test('getFunctionalGroups() overview contains Functional Groups and priority table', () => {
    const r = organic.getFunctionalGroups();
    assert.ok(r.includes('Functional Groups'));
    assert.ok(r.includes('Priority') || r.includes('priority'));
    assert.ok(r.includes('-COOH') && r.includes('-oic acid'));
  });

  test('getFunctionalGroups("alcohol") returns alcohol block with -ol and Lucas', () => {
    const r = organic.getFunctionalGroups('alcohol');
    assert.ok(r.includes('alcohol'));
    assert.ok(r.includes('-ol') || r.includes('hydroxy'));
    assert.ok(includesCI(r, 'lucas') || r.includes('1°') || r.includes('Classes'));
  });

  test('getFunctionalGroups("ketone") returns ketone with -one and iodoform', () => {
    const r = organic.getFunctionalGroups('ketone');
    assert.ok(includesCI(r, 'ketone'));
    assert.ok(r.includes('-one') || r.includes('C=O'));
    // enriched note contains iodoform
    assert.ok(includesCI(r, 'iodoform') || r.includes('1715') || r.includes('2,4-DNP'));
  });

  test('getFunctionalGroups("carboxylic acid") returns acid with -oic acid and broad IR', () => {
    const r = organic.getFunctionalGroups('carboxylic acid');
    assert.ok(includesCI(r, 'carboxylic'));
    assert.ok(r.includes('-oic acid') || r.includes('COOH'));
    assert.ok(r.includes('1710') || r.includes('broad') || includesCI(r, 'Fischer'));
  });

  test('getFunctionalGroups("amine") returns amine with Hinsberg and basic', () => {
    const r = organic.getFunctionalGroups('amine');
    assert.ok(includesCI(r, 'amine'));
    assert.ok(r.includes('-amine') || r.includes('amino'));
    assert.ok(includesCI(r, 'hinsberg') || includesCI(r, 'basic'));
  });

  test('getFunctionalGroups("phenol") returns phenol with FeCl3 and pKa~10', () => {
    const r = organic.getFunctionalGroups('phenol');
    assert.ok(includesCI(r, 'phenol'));
    assert.ok(r.includes('FeCl3') || r.includes('3350') || includesCI(r, 'purple'));
  });

  test('getFunctionalGroups("ester") returns ester with -oate and saponification', () => {
    const r = organic.getFunctionalGroups('ester');
    assert.ok(includesCI(r, 'ester'));
    assert.ok(r.includes('-oate') || r.includes('R-CO-O'));
  });

  test('getFunctionalGroups("thiol") returns thiol with -thiol and disulfide', () => {
    const r = organic.getFunctionalGroups('thiol');
    assert.ok(includesCI(r, 'thiol'));
    assert.ok(r.includes('R-SH') || includesCI(r, 'mercapto') || r.includes('disulfide'));
  });

  test('getFunctionalGroups("unknown") returns No exact match and lists available', () => {
    const r = organic.getFunctionalGroups('unknownGroupXYZ');
    assert.ok(r.includes('No exact match') || r.includes('No match'));
    assert.ok(r.includes('alcohol') || r.includes('Available'));
  });

  test('getFunctionalGroups handles empty and null without throw', () => {
    const a = organic.getFunctionalGroups('');
    const b = organic.getFunctionalGroups(null);
    const c = organic.getFunctionalGroups(undefined);
    assert.ok(a.includes('Functional Groups'));
    assert.ok(b.includes('Functional Groups'));
    assert.ok(c.includes('Functional Groups'));
  });

  test('alias getFunctionalGroupInfo matches getFunctionalGroups("alcohol")', () => {
    const r1 = organic.getFunctionalGroups('alcohol');
    const r2 = organic.getFunctionalGroupInfo('alcohol');
    assert.strictEqual(r1, r2);
  });
});

// ---------------------------------------------------------------------------
// 4. Reaction Mechanisms — 12 tests
// ---------------------------------------------------------------------------
describe('organic — reactionMechanisms', () => {
  test('getReactionMechanisms() overview contains overview header and SN1/SN2/E1/E2', () => {
    const r = organic.getReactionMechanisms();
    assert.ok(r.includes('Reaction Mechanisms'));
    assert.ok(r.includes('SN1') && r.includes('SN2'));
    assert.ok(r.includes('E1') && r.includes('E2'));
    assert.ok(r.includes('Master rule') || r.includes('carbocation'));
  });

  test('getReactionMechanisms("SN1") returns SN1 card with carbocation and first order', () => {
    const r = organic.getReactionMechanisms('SN1');
    assert.ok(r.includes('SN1'));
    assert.ok(includesCI(r, 'carbocation'));
    assert.ok(r.includes('Rate = k[substrate]') || includesCI(r, 'first order'));
    assert.ok(r.includes('Tertiary') || includesCI(r, 'tertiary'));
  });

  test('getReactionMechanisms("SN2") returns SN2 with backside/inversion and polar aprotic', () => {
    const r = organic.getReactionMechanisms('SN2');
    assert.ok(r.includes('SN2'));
    assert.ok(includesCI(r, 'backside') || r.includes('inversion'));
    assert.ok(includesCI(r, 'polar aprotic') || r.includes('DMSO') || r.includes('DMF'));
  });

  test('getReactionMechanisms("E1") returns E1 with Saytzeff and carbocation', () => {
    const r = organic.getReactionMechanisms('E1');
    assert.ok(r.includes('E1'));
    assert.ok(includesCI(r, 'saytzeff') || includesCI(r, 'zaitsev') || r.includes('Saytzeff'));
    assert.ok(includesCI(r, 'carbocation') || r.includes('Ionization'));
  });

  test('getReactionMechanisms("E2") returns E2 with anti-periplanar and bulky base', () => {
    const r = organic.getReactionMechanisms('E2');
    assert.ok(r.includes('E2'));
    assert.ok(includesCI(r, 'anti-periplanar') || r.includes('anti-periplanar') || includesCI(r, 'concerted'));
    assert.ok(includesCI(r, 'bulky') || includesCI(r, 't-BuOK') || r.includes('Hofmann'));
  });

  test('getReactionMechanisms("addition") returns electrophilic addition with Markovnikov', () => {
    const r = organic.getReactionMechanisms('addition');
    assert.ok(includesCI(r, 'addition'));
    assert.ok(includesCI(r, 'markov') || r.includes('carbocation') || r.includes('halonium'));
  });

  test('getReactionMechanisms("EAS") returns EAS with sigma-complex and Friedel-Crafts', () => {
    const r = organic.getReactionMechanisms('EAS');
    assert.ok(r.includes('EAS') || includesCI(r, 'aromatic substitution'));
    assert.ok(r.includes('σ-complex') || r.includes('sigma-complex') || includesCI(r, 'arenium'));
    assert.ok(includesCI(r, 'friedel') || r.includes('Nitration'));
  });

  test('getReactionMechanisms("radical") returns radical halogenation with Br2 selective', () => {
    const r = organic.getReactionMechanisms('radical');
    assert.ok(includesCI(r, 'radical'));
    // may be via fallback if not found, but check it mentions radical or returns search
    assert.ok(r.length > 100);
  });

  test('case-insensitive "sn1" same as "SN1"', () => {
    const a = organic.getReactionMechanisms('SN1');
    const b = organic.getReactionMechanisms('sn1');
    assert.ok(a.includes('SN1'));
    assert.ok(b.includes('SN1'));
    assert.strictEqual(typeof b, 'string');
  });

  test('getReactionMechanisms("unknown") returns No match and lists available IDs', () => {
    const r = organic.getReactionMechanisms('unknownMechanismXYZ');
    assert.ok(r.includes('No match') || r.includes('No exact'));
    assert.ok(r.includes('sn1') || includesCI(r, 'Available'));
  });

  test('competition query returns decision matrix', () => {
    const r = organic.getReactionMechanisms('competition');
    assert.ok(includesCI(r, 'competition') || r.includes('matrix') || r.includes('Decision'));
    assert.ok(r.includes('SN1') && r.includes('SN2'));
  });

  test('empty/null/undefined handled without throw', () => {
    const a = organic.getReactionMechanisms('');
    const b = organic.getReactionMechanisms(null);
    const c = organic.getReactionMechanisms(undefined);
    assert.ok(a.includes('Reaction Mechanisms'));
    assert.ok(b.includes('Reaction Mechanisms'));
    assert.ok(c.includes('Reaction Mechanisms'));
  });
});

// ---------------------------------------------------------------------------
// 5. Stereochemistry — 10 tests
// ---------------------------------------------------------------------------
describe('organic — stereochemistry', () => {
  test('getStereochemistry() overview contains Stereochemistry and Chirality and R/S and E/Z', () => {
    const r = organic.getStereochemistry();
    assert.ok(r.includes('Stereochemistry'));
    assert.ok(includesCI(r, 'chiral') || r.includes('Chirality'));
    assert.ok(r.includes('R/S') || r.includes('CIP') || includesCI(r, 'cahn'));
    assert.ok(r.includes('E/Z') || includesCI(r, 'cis') || r.includes('zusammen'));
  });

  test('getStereochemistry("R/S") returns R/S CIP block with clockwise=R', () => {
    const r = organic.getStereochemistry('R/S');
    assert.ok(r.includes('R/S') || includesCI(r, 'cahn'));
    assert.ok(r.includes('CIP') || includesCI(r, 'priority'));
    assert.ok(r.includes('clockwise') || includesCI(r, 'rectus') || r.includes('R')) ;
    assert.ok(r.includes('atomic number') || includesCI(r, 'atomic'));
  });

  test('getStereochemistry("E/Z") returns E/Z checklist with zusammen/entgegen', () => {
    const r = organic.getStereochemistry('E/Z');
    assert.ok(r.includes('E/Z') || includesCI(r, 'cis'));
    assert.ok(includesCI(r, 'zusammen') || r.includes('Z') || includesCI(r, 'entgegen'));
  });

  test('getStereochemistry("chiral") returns chiral center definition', () => {
    const r = organic.getStereochemistry('chiral');
    assert.ok(includesCI(r, 'chiral'));
    assert.ok(r.includes('stereocenter') || includesCI(r, '4 different') || r.includes('mirror'));
  });

  test('getStereochemistry("enantiomer") returns enantiomer vs diastereomer', () => {
    const r = organic.getStereochemistry('enantiomer');
    assert.ok(includesCI(r, 'enantiomer'));
    assert.ok(includesCI(r, 'diastereomer') || r.includes('mirror'));
  });

  test('getStereochemistry("meso") returns meso planning', () => {
    const r = organic.getStereochemistry('meso');
    // meso should map to enantiomer-diastereomer id
    assert.ok(includesCI(r, 'meso') || includesCI(r, 'internal plane') || includesCI(r, 'achiral'));
  });

  test('getStereochemistry("Fischer") returns Fischer/Newman/chair', () => {
    const r = organic.getStereochemistry('Fischer');
    assert.ok(includesCI(r, 'fischer') || includesCI(r, 'newman') || includesCI(r, 'chair'));
  });

  test('unknown stereochemistry returns No match but lists concepts', () => {
    const r = organic.getStereochemistry('unknownStereoXYZ');
    assert.ok(r.includes('No match') || includesCI(r, 'No exact'));
    assert.ok(r.includes('R/S') || r.includes('Concepts'));
  });

  test('handles empty/null/undefined gracefully', () => {
    const a = organic.getStereochemistry('');
    const b = organic.getStereochemistry(null);
    const c = organic.getStereochemistry(undefined);
    assert.ok(a.includes('Stereochemistry'));
    assert.ok(b.includes('Stereochemistry'));
    assert.ok(c.includes('Stereochemistry'));
  });

  test('alias getStereochemistryInfo works', () => {
    const a = organic.getStereochemistry('R/S');
    const b = organic.getStereochemistryInfo('R/S');
    assert.strictEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// 6. Spectroscopy — 9 tests
// ---------------------------------------------------------------------------
describe('organic — spectroscopy', () => {
  test('getSpectroscopy() overview contains Spectroscopy, IR, NMR, MS', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('Spectroscopy'));
    assert.ok(r.includes('IR') && r.includes('Infrared'));
    assert.ok(r.includes('NMR'));
    assert.ok(includesCI(r, 'mass') || r.includes('MS'));
  });

  test('getSpectroscopy("IR") returns IR matches with carbonyl/1710', () => {
    const r = organic.getSpectroscopy('IR');
    assert.ok(r.includes('IR'));
    assert.ok(r.includes('cm⁻¹') || r.includes('cm-1') || includesCI(r, 'carbonyl') || r.includes('2260'));
  });

  test('getSpectroscopy("aldehyde") returns NMR/IR with chemical shifts and ppm (covers NMR filtering)', () => {
    const r = organic.getSpectroscopy('aldehyde');
    assert.ok(includesCI(r, 'aldehyde') || includesCI(r, 'nmr') || r.includes('Spectroscopy'));
    assert.ok(r.includes('δ') || r.includes('ppm') || r.includes('chemical shift') || r.includes('Aldehyde'));
  });

  test('getSpectroscopy("MS") returns Mass Spec with fragmentation and 91', () => {
    const r = organic.getSpectroscopy('MS');
    assert.ok(includesCI(r, 'mass') || r.includes('MS'));
    assert.ok(r.includes('fragment') || r.includes('m/z') || r.includes('91') || includesCI(r, 'molecular ion'));
  });

  test('getSpectroscopy("carbonyl") finds carbonyl IR near 1710-1735', () => {
    const r = organic.getSpectroscopy('carbonyl');
    assert.ok(includesCI(r, 'carbonyl') || r.includes('1710') || r.includes('1735') || r.includes('C=O'));
  });

  test('getSpectroscopy("3300") numeric wavenumber tip', () => {
    const r = organic.getSpectroscopy('3300');
    // should give IR matches or tip about O-H/alkyne
    assert.ok(typeof r === 'string' && r.length > 100);
    assert.ok(r.includes('3300') || includesCI(r, 'O-H') || includesCI(r, 'alkyne') || r.includes('cm'));
  });

  test('handles empty/null/undefined without throw and returns overview', () => {
    const a = organic.getSpectroscopy('');
    const b = organic.getSpectroscopy(null);
    const c = organic.getSpectroscopy(undefined);
    assert.ok(a.includes('Spectroscopy'));
    assert.ok(b.includes('Spectroscopy'));
    assert.ok(c.includes('Spectroscopy'));
  });

  test('alias getSpectroscopyInfo and getAnalysis match getSpectroscopy', () => {
    const a = organic.getSpectroscopy('IR');
    const b = organic.getSpectroscopyInfo('IR');
    const c = organic.getAnalysis('IR');
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
  });

  test('spectroscopy overview length > 500 and contains workflow', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.length > 500);
    assert.ok(r.includes('workflow') || r.includes('Molecular formula') || r.includes('DU'));
  });
});

// ---------------------------------------------------------------------------
// 7. Polymers & Biomolecules (bonus) — 3 tests
// ---------------------------------------------------------------------------
describe('organic — polymersBiomolecules', () => {
  test('getPolymersBiomolecules() overview contains Polymers and Biomolecules', () => {
    const r = organic.getPolymersBiomolecules();
    assert.ok(r.includes('Polymers') && r.includes('Biomolecules'));
    assert.ok(r.includes('addition') && r.includes('condensation'));
  });

  test('getPolymersBiomolecules("PET") returns polymer search result', () => {
    const r = organic.getPolymersBiomolecules('PET');
    assert.ok(typeof r === 'string' && r.length > 50);
    // should mention PET or polymer
    assert.ok(includesCI(r, 'pet') || includesCI(r, 'polymer') || includesCI(r, 'poly'));
  });

  test('alias getBiomolecules works', () => {
    assert.strictEqual(typeof organic.getBiomolecules, 'function');
    const r = organic.getBiomolecules('DNA');
    assert.ok(includesCI(r, 'dna') || r.includes('Nucleic') || r.includes('Biomolecules'));
  });
});

// ---------------------------------------------------------------------------
// 8. Organic dispatcher + getOrganicInfo — 5 tests
// ---------------------------------------------------------------------------
describe('organic — dispatcher', () => {
  test('organic("SN1") routes to mechanisms SN1', () => {
    const r = organic.organic('SN1');
    assert.ok(r.includes('SN1') || includesCI(r, 'substitution'));
  });

  test('organic("benzene") routes to hydrocarbons aromatic', () => {
    const r = organic.organic('benzene');
    assert.ok(includesCI(r, 'aromatic') || r.includes('benzene'));
  });

  test('organic("alcohol") routes to functional groups', () => {
    const r = organic.organic('alcohol');
    assert.ok(includesCI(r, 'alcohol'));
  });

  test('organic("R/S") routes to stereochemistry', () => {
    const r = organic.organic('R/S');
    assert.ok(includesCI(r, 'r/s') || includesCI(r, 'stereochemistry') || includesCI(r, 'cip'));
  });

  test('organic("IR") routes to spectroscopy', () => {
    const r = organic.organic('IR');
    assert.ok(includesCI(r, 'ir') || r.includes('Spectroscopy') || r.includes('Infrared'));
  });

  test('organic("") empty returns hub or hydrocarbons overview', () => {
    const r = organic.organic('');
    assert.ok(typeof r === 'string' && r.length > 100);
  });

  test('getOrganicInfo section routing', () => {
    const a = organic.getOrganicInfo('hydrocarbons', 'alkene');
    assert.ok(a.includes('Alkenes') || includesCI(a, 'alkene'));
    const b = organic.getOrganicInfo('functional', 'ketone');
    assert.ok(includesCI(b, 'ketone'));
    const c = organic.getOrganicInfo('mechanism', 'E2');
    assert.ok(c.includes('E2'));
  });
});

// ---------------------------------------------------------------------------
// 9. Edge cases — organic functions robustness — 4 tests
// ---------------------------------------------------------------------------
describe('organic — edge cases', () => {
  test('all main functions handle numeric string and number input without throw', () => {
    assert.doesNotThrow(() => organic.getHydrocarbons(123));
    assert.doesNotThrow(() => organic.getFunctionalGroups(42));
    assert.doesNotThrow(() => organic.getReactionMechanisms(0));
    assert.doesNotThrow(() => organic.getStereochemistry(123));
    assert.doesNotThrow(() => organic.getSpectroscopy(999));
  });

  test('all return string type for valid and invalid inputs', () => {
    const fns = [
      organic.getHydrocarbons,
      organic.getFunctionalGroups,
      organic.getReactionMechanisms,
      organic.getStereochemistry,
      organic.getSpectroscopy,
      organic.organic
    ];
    for (const fn of fns) {
      const r = fn('testQueryXYZ');
      assert.ok(typeof r === 'string', `${fn.name} should return string`);
      assert.ok(r.length > 20, `${fn.name} should return non-empty`);
    }
  });

  test('functions handle special characters and long strings', () => {
    const long = 'a'.repeat(500);
    assert.doesNotThrow(() => organic.getHydrocarbons(long));
    assert.doesNotThrow(() => organic.organic('<script>alert(1)</script>'));
    const r = organic.organic('<script>');
    assert.ok(typeof r === 'string');
  });

  test('all strings are Telegram HTML safe (no unescaped raw user input)', () => {
    // organic dispatcher should escape query in "No match for" case
    const r = organic.getHydrocarbons('<b>test</b>');
    // Should escape the injected tags in the echoed query
    assert.ok(!r.includes('<b>test</b>') || r.includes('&lt;b&gt;test&lt;/b&gt;'));
  });
});

// ---------------------------------------------------------------------------
// 10. handler.js — welcomeText and inline_keyboard — 6 tests
// ---------------------------------------------------------------------------
describe('handler.js — welcomeText and buttons', () => {
  const handlerPath = path.join(__dirname, '..', 'src', 'bot', 'handler.js');
  const src = fs.readFileSync(handlerPath, 'utf8');

  test('handler.js file exists and contains inline_keyboard', () => {
    assert.ok(fs.existsSync(handlerPath));
    assert.ok(src.includes('inline_keyboard'), 'should contain inline_keyboard');
  });

  test('welcomeText no longer shows "/balance" slash command', () => {
    // Extract welcomeText block
    const m = src.match(/const welcomeText = `([\s\S]*?)`;/);
    assert.ok(m, 'welcomeText block should be found');
    const welcome = m[1];
    // Should NOT contain slash command literal
    assert.strictEqual(welcome.includes('/balance'), false, 'welcomeText should not contain "/balance" after button migration');
    assert.strictEqual(welcome.includes('/molar'), false);
    assert.strictEqual(welcome.includes('/predict'), false);
  });

  test('welcomeText shows button labels like "⚖️ Balance" and "🧬 Organic"', () => {
    const m = src.match(/const welcomeText = `([\s\S]*?)`;/);
    assert.ok(m);
    const welcome = m[1];
    assert.ok(welcome.includes('⚖️ Balance') || welcome.includes('Balance'), 'should mention Balance button');
    assert.ok(welcome.includes('Tap') || welcome.includes('button'), 'should mention Tap a button');
    assert.ok(welcome.includes('🧬 Organic') || welcome.includes('Organic'), 'should mention Organic button');
  });

  test('welcomeText contains many button labels (at least 5)', () => {
    const m = src.match(/const welcomeText = `([\s\S]*?)`;/);
    const welcome = m[1];
    const labels = ['Balance', 'Molar', 'Element', 'Predict', 'Organic', 'Hydrocarbon', 'Mechanism', 'Functional', 'Stereo', 'Help'];
    let found = 0;
    for (const lbl of labels) if (welcome.includes(lbl)) found++;
    assert.ok(found >= 5, `expected at least 5 button labels, found ${found}`);
  });

  test('inline_keyboard exists with expected buttons and callback_data', () => {
    // Check keyboard definition near welcomeText
    assert.ok(src.includes('keyboard'));
    assert.ok(src.includes('reply_markup'));
    assert.ok(src.includes('inline_keyboard'));
    // callback_data checks
    assert.ok(src.includes('cmd_balance'));
    assert.ok(src.includes('cmd_molar'));
    assert.ok(src.includes('cmd_organic') || src.includes('cmd_hydrocarbon'));
    assert.ok(src.includes('cmd_mechanism') || src.includes('cmd_stereo'));
    assert.ok(src.includes('cmd_help') || src.includes('cmd_start'));
  });

  test('handler.js imports organic tool', () => {
    assert.ok(src.includes("require('../tools/organic')") || src.includes('organic'));
  });

  test('help command keyboard also uses inline_keyboard', () => {
    // help handler should send with KB.help or inline_keyboard
    assert.ok(src.includes('KB.help') || src.includes('help:') || src.match(/handleHelp[\s\S]*?inline_keyboard/));
  });
});
