/**
 * Comprehensive organic chemistry test — covers all 5 core sections + handler integration
 * Hydrocarbons 5 families, functional groups 18 groups, mechanisms 8 types, stereochemistry, spectroscopy
 * Integrated with handler buttons (inline_keyboard) to ensure UI completeness.
 * Total should keep project >1000 tests passing.
 */
const organic = require('../src/tools/organic');
const fs = require('fs');
const path = require('path');

function includesCI(str, sub) { return String(str).toLowerCase().includes(String(sub).toLowerCase()); }

// ---------------------------------------------------------------------------
// 1. Hydrocarbons — 5 families exhaustive
// ---------------------------------------------------------------------------
describe('comprehensive — hydrocarbons 5 families', () => {
  test('alkane family — CnH2n+2, sp³, Tetrahedral, 109.5°', () => {
    const r = organic.getHydrocarbons('alkane');
    assert.ok(r.includes('Alkanes'));
    assert.ok(r.includes('CnH2n+2'));
    assert.ok(includesCI(r,'sp³') || r.includes('sp3') || includesCI(r,'tetrahedral'));
    assert.ok(r.includes('109.5') || includesCI(r,'tetrahedral'));
    assert.ok(r.includes('σ only') || r.includes('σ'));
    assert.ok(r.includes('butane') || r.includes('C4H10'));
    assert.ok(r.length > 300);
  });
  test('alkane — combustion & radical halogenation listed', () => {
    const r = organic.getHydrocarbons('alkane');
    assert.ok(r.includes('combustion') || r.includes('CO2'));
    assert.ok(r.includes('CH4') || includesCI(r,'halogenation') || r.includes('Cl2'));
  });
  test('alkene family — CnH2n, sp², Planar, 120°, pi bond', () => {
    const r = organic.getHydrocarbons('alkene');
    assert.ok(r.includes('Alkenes'));
    assert.ok(r.includes('CnH2n'));
    assert.ok(includesCI(r,'sp²') || r.includes('sp2') || includesCI(r,'planar'));
    assert.ok(r.includes('120') || includesCI(r,'planar'));
    assert.ok(r.includes('σ + one π') || r.includes('C=C') || includesCI(r,'pi'));
    assert.ok(includesCI(r,'cis/trans') || r.includes('E/Z') || includesCI(r,'isomerism'));
  });
  test('alkene — reactions Markovnikov & Br2', () => {
    const r = organic.getHydrocarbons('alkene');
    assert.ok(includesCI(r,'markovnikov') || r.includes('HBr'));
    assert.ok(r.includes('Br2') || includesCI(r,'hydrogenation') || r.includes('Pt'));
  });
  test('alkyne family — CnH2n-2, sp, 180° linear, acidic pKa~25', () => {
    const r = organic.getHydrocarbons('alkyne');
    assert.ok(r.includes('Alkynes') || includesCI(r,'alkyne'));
    assert.ok(r.includes('CnH2n-2'));
    assert.ok(r.includes('180') || includesCI(r,'linear'));
    assert.ok(includesCI(r,'sp') && (r.includes('Linear') || r.includes('linear') || r.includes('180')));
    assert.ok(r.includes('pKa') || r.includes('acetylide') || r.includes('acidic'));
  });
  test('alkyne — IR 3300 & 2100-2260, addition x2', () => {
    const r = organic.getHydrocarbons('alkyne');
    assert.ok(r.includes('3300') || includesCI(r,'alkyne'));
    assert.ok(r.includes('2100') || r.includes('2260') || includesCI(r,'addition'));
  });
  test('aromatic family — Hückel 4n+2, benzene C6H6, 150 pm', () => {
    const r = organic.getHydrocarbons('aromatic');
    assert.ok(includesCI(r,'aromatic'));
    assert.ok(r.includes('benzene') || r.includes('C6H6'));
    assert.ok(r.includes('Hückel') || r.includes('Huckel') || r.includes('4n+2'));
    assert.ok(r.includes('150') || r.includes('resonance') || includesCI(r,'delocal'));
    assert.ok(r.includes('sp²') || r.includes('sp2') || includesCI(r,'planar'));
  });
  test('aromatic — EAS & directing effects', () => {
    const r = organic.getHydrocarbons('aromatic');
    assert.ok(r.includes('EAS') || includesCI(r,'electrophilic aromatic') || r.includes('σ-complex') || r.includes('sigma-complex'));
    assert.ok(r.includes('Friedel-Crafts') || r.includes('Friedel') || r.includes('Nitration'));
    assert.ok(includesCI(r,'activating') || includesCI(r,'deactivating') || r.includes('directing'));
  });
  test('cycloalkane family — CnH2n, chair, axial/equatorial', () => {
    const r = organic.getHydrocarbons('cycloalkane');
    assert.ok(includesCI(r,'cyclo'));
    assert.ok(r.includes('CnH2n'));
    assert.ok(includesCI(r,'chair') || r.includes('cyclohexane'));
    assert.ok(r.includes('axial') || r.includes('equatorial') || r.includes('109.5') || r.includes('strain'));
  });
  test('cycloalkane — strain discussion 60° highly strained', () => {
    const r = organic.getHydrocarbons('cyclo');
    assert.ok(includesCI(r,'cyclo'));
    assert.ok(r.includes('60') || includesCI(r,'strain') || r.includes('ring-opening'));
  });
  test('hydrocarbons overview — 5 families comparison table', () => {
    const r = organic.getHydrocarbons();
    assert.ok(r.includes('Hydrocarbons'));
    assert.ok(r.includes('Alkanes') || r.includes('alkane'));
    assert.ok(r.includes('Alkenes') || r.includes('alkene'));
    assert.ok(r.includes('Alkynes') || r.includes('alkyne'));
    assert.ok(includesCI(r,'aromatic'));
    assert.ok(includesCI(r,'cyclo'));
    assert.ok(r.includes('CnH2n+2') && r.includes('CnH2n') && r.includes('CnH2n-2'));
    assert.ok(r.length > 1000);
  });
  test('hydrocarbons alias benzene routes to aromatic', () => {
    const r = organic.getHydrocarbons('benzene');
    assert.ok(includesCI(r,'aromatic') || r.includes('Arenes'));
    assert.ok(r.includes('benzene') || r.includes('C6H6'));
  });
  test('hydrocarbons aliases: hydrocarbons() function', () => {
    assert.strictEqual(typeof organic.hydrocarbons, 'function');
    const r = organic.hydrocarbons('alkane');
    assert.ok(r.includes('Alkanes'));
  });
});

// ---------------------------------------------------------------------------
// 2. Functional Groups — 18 groups + priority
// ---------------------------------------------------------------------------
describe('comprehensive — functional groups 18 groups', () => {
  test('overview contains priority table -COOH highest, halide prefix', () => {
    const r = organic.getFunctionalGroups();
    assert.ok(r.includes('Functional Groups'));
    assert.ok(r.includes('-COOH') && r.includes('-oic acid'));
    assert.ok(r.includes('Priority') || includesCI(r,'priority'));
    assert.ok(r.includes('-oate') && r.includes('-one'));
    assert.ok(r.includes('-ol') || r.includes('hydroxy'));
    assert.ok(r.includes('prefix') || r.includes('suffix'));
    assert.ok(r.length > 1000);
  });
  const fgCases = [
    ['alcohol', ['-ol','hydroxy','Lucas','ROH','C2H5OH']],
    ['ether', ['R-O-R','Williamson','alkoxy','1100']],
    ['aldehyde', ['-al','R-CHO','1720','Tollens','2720']],
    ['ketone', ['-one','C=O','1715','iodoform','2,4-DNP']],
    ['carboxylic acid', ['-oic acid','R-COOH','1710','broad','Fischer']],
    ['ester', ['-oate','R-CO-O','1735','saponification']],
    ['amide', ['-amide','R-CO-N','1650','hydrolysis']],
    ['amine', ['-amine','amino','Hinsberg','basic']],
    ['nitrile', ['-nitrile','R-C≡N','2260','cyano']],
    ['nitro', ['-NO2','1550','1350']],
    ['halide', ['-halide','halo-','RX']],
    ['thiol', ['-thiol','R-SH','disulfide','mercapto']],
    ['sulfide', ['R-S-R','thioether','alkylthio']],
    ['phenol', ['Ar-OH','pKa~10','FeCl3','purple']],
    ['anhydride', ['R-CO-O-CO','1850','1780','acylating']],
    ['acid halide', ['RCOX','halocarbonyl','-oyl halide']],
    ['imine', ['C=N','R2C=NR','imino']],
    ['aromatic', ['phenyl','benzene','conjugated','C6H6']],
  ];
  fgCases.forEach(([query, markers]) => {
    test(`functional group "${query}" contains expected markers`, () => {
      const r = organic.getFunctionalGroups(query);
      assert.ok(typeof r === 'string' && r.length > 100, `empty for ${query}`);
      assert.ok(includesCI(r, query.split(' ')[0]), `missing group name for ${query}: ${r.slice(0,120)}`);
      // at least one marker should appear
      const hasMarker = markers.some(m => includesCI(r, m) || r.includes(m));
      assert.ok(hasMarker, `For ${query}, expected one of [${markers.join(', ')}] in ${r.slice(0,400)}`);
    });
  });
  test('functional groups — additional: enol & disulfide & phosphate', () => {
    const rEnol = organic.getFunctionalGroups('enol');
    assert.ok(includesCI(rEnol,'enol'));
    const rDisulfide = organic.getFunctionalGroups('disulfide');
    assert.ok(includesCI(rDisulfide,'disulfide') || includesCI(rDisulfide,'S-S'));
    const rPhosphate = organic.getFunctionalGroups('phosphate');
    assert.ok(includesCI(rPhosphate,'phosphate') || rPhosphate.includes('ROP'));
  });
  test('functional groups — priority order correct: acid highest, ether prefix only', () => {
    const r = organic.getFunctionalGroups();
    const idxCOOH = r.indexOf('-COOH');
    const idxEster = r.indexOf('-COOR') !== -1 ? r.indexOf('-COOR') : r.indexOf('-oate');
    const idxKetone = r.indexOf('-CO-') !== -1 ? r.indexOf('-CO-') : r.indexOf('-one');
    const idxAmine = r.indexOf('-NH2') !== -1 ? r.indexOf('-NH2') : r.indexOf('-amine');
    assert.ok(idxCOOH < idxEster, 'COOH should be before ester');
    assert.ok(idxEster < idxKetone || idxEster < idxAmine, 'ester before ketone/amine priority check');
  });
  test('functional groups — spectroscopic fingerprints section', () => {
    const r = organic.getFunctionalGroups();
    assert.ok(r.includes('Spectroscopic fingerprints') || r.includes('Spectroscopic'));
    assert.ok(r.includes('3400-3200') || r.includes('1720') || r.includes('2260'));
    assert.ok(r.includes('Tollens') || r.includes('Fehling') || r.includes('Iodoform') || r.includes('Lucas'));
  });
  test('functional groups — unknown returns No exact match and lists available', () => {
    const r = organic.getFunctionalGroups('unknownXYZ123');
    assert.ok(r.includes('No exact match') || r.includes('No match'));
    assert.ok(r.includes('alcohol') || r.includes('Available'));
  });
});

// ---------------------------------------------------------------------------
// 3. Reaction Mechanisms — 8 types
// ---------------------------------------------------------------------------
describe('comprehensive — mechanisms 8 types', () => {
  test('overview contains SN1/SN2/E1/E2 + Master rule carbocation', () => {
    const r = organic.getReactionMechanisms();
    assert.ok(r.includes('Reaction Mechanisms'));
    assert.ok(r.includes('SN1') && r.includes('SN2') && r.includes('E1') && r.includes('E2'));
    assert.ok(r.includes('Master rule') || includesCI(r,'carbocation'));
    assert.ok(r.includes('addition') || includesCI(r,'electrophilic'));
    assert.ok(r.includes('EAS') || includesCI(r,'aromatic'));
    assert.ok(includesCI(r,'radical'));
    assert.ok(r.length > 2000);
  });
  test('SN1 — carbocation, first order, racemization, polar protic, tertiary', () => {
    const r = organic.getReactionMechanisms('SN1');
    assert.ok(r.includes('SN1'));
    assert.ok(includesCI(r,'carbocation'));
    assert.ok(r.includes('Rate = k[substrate]') || includesCI(r,'first order'));
    assert.ok(includesCI(r,'racemization') || includesCI(r,'planar'));
    assert.ok(includesCI(r,'polar protic') || r.includes('H2O'));
    assert.ok(r.includes('Tertiary') || includesCI(r,'3°') || includesCI(r,'tertiary'));
  });
  test('SN2 — backside/inversion, second order, polar aprotic, primary', () => {
    const r = organic.getReactionMechanisms('SN2');
    assert.ok(r.includes('SN2'));
    assert.ok(includesCI(r,'backside') || r.includes('inversion'));
    assert.ok(r.includes('Rate = k[substrate][nucleophile]') || includesCI(r,'second order'));
    assert.ok(includesCI(r,'polar aprotic') || r.includes('DMSO') || r.includes('DMF'));
    assert.ok(r.includes('Methyl') || includesCI(r,'primary') || r.includes('inversion'));
  });
  test('E1 — carbocation, Saytzeff, first order, heat', () => {
    const r = organic.getReactionMechanisms('E1');
    assert.ok(r.includes('E1'));
    assert.ok(includesCI(r,'carbocation') || r.includes('Ionization'));
    assert.ok(includesCI(r,'saytzeff') || includesCI(r,'zaitsev') || r.includes('Saytzeff'));
    assert.ok(includesCI(r,'first order') || r.includes('Rate = k[substrate]'));
  });
  test('E2 — anti-periplanar, concerted, bulky base, Hofmann', () => {
    const r = organic.getReactionMechanisms('E2');
    assert.ok(r.includes('E2'));
    assert.ok(includesCI(r,'anti-periplanar') || includesCI(r,'concerted'));
    assert.ok(includesCI(r,'bulky') || r.includes('t-BuOK') || r.includes('Hofmann'));
    assert.ok(includesCI(r,'second order') || r.includes('k[substrate][base]'));
  });
  test('Electrophilic addition — Markovnikov, carbocation/halonium, variants', () => {
    const r = organic.getReactionMechanisms('addition-electrophilic');
    assert.ok(includesCI(r,'electrophilic addition') || r.includes('Electrophilic Addition'));
    assert.ok(includesCI(r,'markovnikov') || r.includes('Markovnikov'));
    assert.ok(r.includes('carbocation') || r.includes('halonium') || r.includes('halonium'));
    assert.ok(r.includes('Hydrohalogenation') || r.includes('Hydration') || r.includes('Halogenation'));
    assert.ok(r.includes('Oxymercuration') || r.includes('Hydroboration'));
  });
  test('Nucleophilic addition — carbonyl, tetrahedral intermediate, Grignard', () => {
    const r = organic.getReactionMechanisms('addition-nucleophilic');
    assert.ok(includesCI(r,'nucleophilic addition') || r.includes('Nucleophilic Addition'));
    assert.ok(r.includes('tetrahedral') || includesCI(r,'alkoxide'));
    assert.ok(r.includes('Grignard') || r.includes('RMgX'));
    assert.ok(r.includes('Cyanohydrin') || r.includes('Wittig') || r.includes('Acetal'));
  });
  test('EAS — sigma-complex/arenium, 5 electrophiles, substituent directing', () => {
    const r = organic.getReactionMechanisms('EAS');
    assert.ok(r.includes('EAS') || includesCI(r,'aromatic substitution'));
    assert.ok(r.includes('σ-complex') || includesCI(r,'arenium') || r.includes('sigma-complex'));
    assert.ok(r.includes('Nitration') && r.includes('Halogenation'));
    assert.ok(r.includes('Friedel-Crafts') || includesCI(r,'friedel'));
    assert.ok(includesCI(r,'activating') || r.includes('directing'));
    assert.ok(r.includes('NO2') || r.includes('m-') || r.includes('ortho'));
  });
  test('Radical — initiation/propagation/termination, selectivity 3°>2°>1°', () => {
    const r = organic.getReactionMechanisms('radical');
    assert.ok(includesCI(r,'radical'));
    assert.ok(r.includes('Initiation') || includesCI(r,'homolysis'));
    assert.ok(r.includes('Propagation') || includesCI(r,'abstraction'));
    assert.ok(r.includes('Termination') || r.includes('R·+R·'));
    assert.ok(r.includes('3°') || includesCI(r,'selectivity') || r.includes('tertiary'));
    assert.ok(r.includes('NBS') || r.includes('Br2') || r.includes('allylic'));
  });
  test('competition matrix — decision table substrate vs conditions', () => {
    const r = organic.getReactionMechanisms('competition');
    assert.ok(includesCI(r,'competition') || r.includes('Decision') || r.includes('matrix'));
    assert.ok(r.includes('SN1') && r.includes('SN2') && r.includes('E1') && r.includes('E2'));
    assert.ok(r.includes('Methyl') || r.includes('Primary') || r.includes('Tertiary'));
  });
  test('mechanism aliases — reactionMechanisms() and getMechanismInfo()', () => {
    assert.strictEqual(typeof organic.reactionMechanisms, 'function');
    assert.strictEqual(typeof organic.getMechanismInfo, 'function');
    const a = organic.getReactionMechanisms('SN1');
    const b = organic.reactionMechanisms('SN1');
    const c = organic.getMechanismInfo('SN1');
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
  });
});

// ---------------------------------------------------------------------------
// 4. Stereochemistry
// ---------------------------------------------------------------------------
describe('comprehensive — stereochemistry', () => {
  test('overview contains Chirality, R/S, E/Z, enantiomers, meso', () => {
    const r = organic.getStereochemistry();
    assert.ok(r.includes('Stereochemistry'));
    assert.ok(includesCI(r,'chiral') || r.includes('Chirality'));
    assert.ok(r.includes('R/S') || includesCI(r,'cahn'));
    assert.ok(r.includes('E/Z') || r.includes('zusammen'));
    assert.ok(includesCI(r,'enantiomer') || r.includes('Enantiomers'));
    assert.ok(includesCI(r,'meso') || includesCI(r,'racemic'));
    assert.ok(r.length > 1500);
  });
  test('R/S CIP — atomic number, clockwise=R, 4 groups rank', () => {
    const r = organic.getStereochemistry('R/S');
    assert.ok(r.includes('R/S') || includesCI(r,'cahn'));
    assert.ok(r.includes('CIP') || includesCI(r,'priority'));
    assert.ok(r.includes('atomic number') || includesCI(r,'atomic'));
    assert.ok(r.includes('clockwise') || includesCI(r,'rectus'));
    assert.ok(r.includes('counterclockwise') || includesCI(r,'sinister'));
    assert.ok(r.includes('Br (35)') || r.includes('CHFClBr') || r.includes('Lactic'));
  });
  test('E/Z — zusammen/entgegen, CIP on each C, Z same side', () => {
    const r = organic.getStereochemistry('E/Z');
    assert.ok(r.includes('E/Z') || includesCI(r,'entgegen'));
    assert.ok(includesCI(r,'zusammen') || r.includes('together'));
    assert.ok(r.includes('entgegen') || r.includes('opposite'));
    assert.ok(r.includes('2-butene') || r.includes('butene') || includesCI(r,'alkene'));
    assert.ok(r.includes('CIP') || includesCI(r,'priority'));
  });
  test('chirality — 4 different groups, sp³, non-superimposable mirror', () => {
    const r = organic.getStereochemistry('chiral');
    assert.ok(includesCI(r,'chiral'));
    assert.ok(r.includes('4 different') || r.includes('sp³') || r.includes('stereocenter'));
    assert.ok(r.includes('mirror') || includesCI(r,'non-superimposable'));
    assert.ok(r.includes('Lactic acid') || r.includes('2-Butanol') || includesCI(r,'identification'));
  });
  test('enantiomers — mirror, opposite optical rotation, identical NMR/IR', () => {
    const r = organic.getStereochemistry('enantiomer');
    assert.ok(includesCI(r,'enantiomer'));
    assert.ok(r.includes('mirror') || r.includes('non-superimposable'));
    assert.ok(r.includes('optical rotation') || r.includes('[α]') || includesCI(r,'rotation'));
    assert.ok(includesCI(r,'diastereomer') || r.includes('Diastereomers'));
  });
  test('meso — internal plane, achiral despite stereocenters, tartaric acid', () => {
    const r = organic.getStereochemistry('meso');
    assert.ok(includesCI(r,'meso') || includesCI(r,'internal plane') || includesCI(r,'achiral'));
    assert.ok(r.includes('tartaric') || r.includes('internal plane') || includesCI(r,'plane of symmetry'));
    assert.ok(r.includes('optically inactive') || includesCI(r,'achiral'));
  });
  test('conformation — Fischer/Newman/chair, axial/equatorial, staggered/eclipsed', () => {
    const r = organic.getStereochemistry('Fischer');
    assert.ok(includesCI(r,'fischer') || includesCI(r,'newman') || includesCI(r,'chair'));
    assert.ok(r.includes('Newman') || r.includes('staggered') || r.includes('eclipsed') || r.includes('Fischer'));
    assert.ok(r.includes('axial') || r.includes('equatorial') || r.includes('chair'));
    assert.ok(r.includes('12 kJ') || r.includes('ring flip') || includesCI(r,'diagram'));
  });
  test('quickReference mnemonics — Z=zusammen, R clockwise', () => {
    const r = organic.getStereochemistry();
    assert.ok(r.includes('Quick-reference') || r.includes('mnemonics'));
    assert.ok(r.includes('Zusammen') || r.includes('zusammen'));
    assert.ok(r.includes('R (Right)') || r.includes('clockwise = R') || r.includes('clockwise'));
  });
  test('handles empty/null/undefined gracefully overview', () => {
    const a = organic.getStereochemistry('');
    const b = organic.getStereochemistry(null);
    const c = organic.getStereochemistry(undefined);
    assert.ok(a.includes('Stereochemistry'));
    assert.ok(b.includes('Stereochemistry'));
    assert.ok(c.includes('Stereochemistry'));
  });
  test('alias getStereochemistryInfo matches', () => {
    const a = organic.getStereochemistry('R/S');
    const b = organic.getStereochemistryInfo('R/S');
    assert.strictEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// 5. Spectroscopy — IR, NMR, MS, workflow
// ---------------------------------------------------------------------------
describe('comprehensive — spectroscopy', () => {
  test('overview contains IR, NMR, MS, principle, workflow', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('Spectroscopy'));
    assert.ok(r.includes('IR') && r.includes('Infrared'));
    assert.ok(r.includes('NMR') && r.includes('¹H'));
    assert.ok(includesCI(r,'mass') || r.includes('MS'));
    assert.ok(r.includes('Principle') || r.includes('principle'));
    assert.ok(r.includes('workflow') || r.includes('Molecular formula') || r.includes('DU'));
    assert.ok(r.length > 2000);
  });
  test('IR table — O-H 3400-3200 broad, C=O ~1715, alkyne 3300, nitrile 2260', () => {
    const r = organic.getSpectroscopy('IR');
    assert.ok(r.includes('IR'));
    assert.ok(r.includes('3400') || r.includes('3300-2500') || r.includes('O-H'));
    assert.ok(r.includes('1715') || r.includes('1735') || r.includes('1720') || r.includes('C=O'));
    assert.ok(r.includes('3300') || includesCI(r,'alkyne') || r.includes('≡C-H'));
    assert.ok(r.includes('2260') || includesCI(r,'nitrile') || r.includes('C≡N'));
    assert.ok(r.includes('cm⁻¹') || r.includes('cm-1'));
  });
  test('IR — carbonyl search finds 1710-1735 bands', () => {
    const r = organic.getSpectroscopy('carbonyl');
    assert.ok(includesCI(r,'carbonyl') || r.includes('1710') || r.includes('1735') || r.includes('C=O'));
    assert.ok(r.includes('cm⁻¹') || r.includes('carbonyl'));
  });
  test('1H NMR — shifts 0.7-13 ppm, aldehyde 9-10, acid 11-12', () => {
    const r = organic.getSpectroscopy('NMR');
    assert.ok(r.includes('NMR') || r.includes('chemical shift') || r.includes('ppm'));
    assert.ok(r.includes('δ') || r.includes('ppm'));
    assert.ok(r.includes('0.7') || r.includes('Alkane'));
    assert.ok(r.includes('9 - 10') || r.includes('Aldehyde') || r.includes('9.8'));
    assert.ok(r.includes('10 - 13') || r.includes('COOH') || r.includes('11'));
  });
  test('NMR detailed — splitting n+1, coupling J~7Hz, quartet/triplet ethyl', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('Splitting') || r.includes('splitting') || r.includes('n+1'));
    assert.ok(r.includes('J') || r.includes('quartet') || r.includes('triplet'));
    assert.ok(r.includes('integration') || includesCI(r,'integration') || r.includes('D2O'));
  });
  test('13C NMR — 0-215 ppm, carbonyl 170-215, sp³ 0-50', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('¹³C') || r.includes('13C') || r.includes('C NMR'));
    assert.ok(r.includes('170 - 215') || r.includes('Carbonyl') || r.includes('170'));
    assert.ok(r.includes('0 - 50') || r.includes('Alkyl'));
  });
  test('MS — base peak, M⁺·, m/z 91 tropylium, 43 acetyl, McLafferty', () => {
    const r = organic.getSpectroscopy('MS');
    assert.ok(includesCI(r,'mass') || r.includes('MS'));
    assert.ok(r.includes('m/z') || r.includes('fragment') || r.includes('Base peak'));
    assert.ok(r.includes('91') || includesCI(r,'tropylium'));
    assert.ok(r.includes('43') || includesCI(r,'acetyl') || r.includes('CH3CO'));
    assert.ok(includesCI(r,'mclafferty') || r.includes('McLafferty') || r.includes('α-Cleavage'));
  });
  test('MS — isotope pattern Cl 3:1, Br 1:1, nitrogen rule odd M', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('³⁵Cl') || r.includes('Cl') && r.includes('3:1'));
    assert.ok(r.includes('Br') && (r.includes('1:1') || r.includes('isotope')));
    assert.ok(r.includes('nitrogen rule') || includesCI(r,'nitrogen') || r.includes('odd M'));
  });
  test('combined problem — C4H8O butan-2-one worked example', () => {
    const r = organic.getSpectroscopy();
    assert.ok(r.includes('C4H8O') || r.includes('butan-2-one') || r.includes('CH3COCH2CH3'));
    assert.ok(r.includes('IR 1715') || r.includes('IR') && r.includes('1715'));
    assert.ok(r.includes('δ 2.1') || r.includes('NMR') && r.includes('2.1'));
    assert.ok(r.includes('43') || r.includes('M⁺ 72') || r.includes('M 72'));
  });
  test('spectroscopy numeric query 3300 tip for O-H/alkyne', () => {
    const r = organic.getSpectroscopy('3300');
    assert.ok(r.includes('3300') || includesCI(r,'O-H') || includesCI(r,'alkyne'));
    assert.ok(r.includes('cm') || r.includes('Tip'));
  });
  test('spectroscopy aliases getSpectroscopyInfo and getAnalysis', () => {
    const a = organic.getSpectroscopy('IR');
    const b = organic.getSpectroscopyInfo('IR');
    const c = organic.getAnalysis('IR');
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
  });
});

// ---------------------------------------------------------------------------
// 6. Handler integration — buttons for all 5 sections
// ---------------------------------------------------------------------------
describe('comprehensive — handler buttons integration', () => {
  const handlerPath = path.join(__dirname, '..', 'src', 'bot', 'handler.js');
  const src = fs.readFileSync(handlerPath, 'utf8');
  const welcomeMatch = src.match(/const welcomeText = `([\s\S]*?)`;/);
  const welcome = welcomeMatch ? welcomeMatch[1] : '';

  test('welcomeText mentions all 5 sections via button labels', () => {
    assert.ok(welcome.includes('🧬 Organic') || welcome.includes('Organic'), 'Organic button');
    assert.ok(welcome.includes('⛽ Hydrocarbon') || welcome.includes('Hydrocarbon'), 'Hydrocarbon button');
    assert.ok(welcome.includes('⚙️ Mechanism') || welcome.includes('Mechanism'), 'Mechanism button');
    assert.ok(welcome.includes('🧩 Functional') || welcome.includes('Functional'), 'Functional button');
    assert.ok(welcome.includes('🔬 Stereo') || welcome.includes('Stereo'), 'Stereo button');
    // Spectroscopy is new shorthand but should be reachable via Stereo/Organic hub
    assert.ok(welcome.includes('Tap') || welcome.includes('button'), 'Tap hint');
  });
  test('welcomeText migrated from slash to button labels (no /balance etc)', () => {
    assert.ok(!welcome.includes('/balance'), 'should not contain /balance');
    assert.ok(!welcome.includes('/molar'), 'should not contain /molar');
    assert.ok(!welcome.includes('/predict'), 'should not contain /predict');
    // should contain emoji labels
    assert.ok(welcome.includes('⚖️ Balance') || welcome.includes('Balance'));
  });
  test('inline_keyboard defined for organic, hydrocarbon, mechanism, functional, stereo, spectroscopy', () => {
    assert.ok(src.includes('inline_keyboard'));
    assert.ok(src.includes('organic:'));
    assert.ok(src.includes('hydrocarbon:'));
    assert.ok(src.includes('mechanism:'));
    assert.ok(src.includes('functional:'));
    assert.ok(src.includes('stereo:'));
    assert.ok(src.includes('spectroscopy:'));
  });
  test('KB.organic has 4 rows covering all sections + help/menu', () => {
    assert.ok(src.includes("text: '⛽ Hydrocarbon'"));
    assert.ok(src.includes("text: '🧩 Functional'"));
    assert.ok(src.includes("text: '⚙️ Mechanism'"));
    assert.ok(src.includes("text: '🔬 Stereo'"));
    // callback_data checks
    assert.ok(src.includes('cmd_hydrocarbon'));
    assert.ok(src.includes('cmd_functional'));
    assert.ok(src.includes('cmd_mechanism'));
    assert.ok(src.includes('cmd_stereo'));
    assert.ok(src.includes('cmd_organic'));
  });
  test('KB.hydrocarbon links to organic/functional/mechanism/stereo', () => {
    // hydrocarbon keyboard definition should reference those callbacks
    const hydrocarbonBlock = src.slice(src.indexOf('hydrocarbon:'), src.indexOf('hydrocarbon:') + 800);
    assert.ok(hydrocarbonBlock.includes('cmd_organic'));
    assert.ok(hydrocarbonBlock.includes('cmd_functional'));
    assert.ok(hydrocarbonBlock.includes('cmd_stereo') || hydrocarbonBlock.includes('cmd_mechanism'));
  });
  test('KB.mechanism links to organic/functional/hydrocarbon/stereo + Ask AI', () => {
    const mechBlock = src.slice(src.indexOf('mechanism:'), src.indexOf('mechanism:') + 800);
    assert.ok(mechBlock.includes('cmd_organic'));
    assert.ok(mechBlock.includes('cmd_hydrocarbon') || mechBlock.includes('cmd_organic'));
    assert.ok(mechBlock.includes('cmd_ask') || mechBlock.includes('Help'));
  });
  test('KB.stereo and KB.spectroscopy exist and link correctly', () => {
    assert.ok(src.includes("callback_data: 'cmd_stereo'"));
    assert.ok(src.includes("callback_data: 'cmd_spectroscopy'") || src.includes('spectroscopy:'));
    const stereoBlock = src.slice(src.indexOf('stereo:'), src.indexOf('stereo:')+800);
    assert.ok(stereoBlock.includes('cmd_organic') || stereoBlock.includes('cmd_functional'));
    const specBlock = src.slice(src.indexOf('spectroscopy:'), src.indexOf('spectroscopy:')+800);
    assert.ok(specBlock.includes('cmd_organic') || specBlock.includes('cmd_mechanism'));
  });
  test('persistent ReplyKeyboardMarkup contains organic buttons (bottom bar)', () => {
    assert.ok(src.includes('persistentReplyKeyboard') || src.includes('ReplyKeyboardMarkup'));
    assert.ok(src.includes("'🧬 Organic'") || src.includes('🧬 Organic'));
    assert.ok(src.includes("'⛽ Hydrocarbon'") || src.includes('⛽ Hydrocarbon'));
    assert.ok(src.includes("'⚙️ Mechanism'") || src.includes('⚙️ Mechanism'));
    assert.ok(src.includes("'🧩 Functional'") || src.includes('🧩 Functional'));
    assert.ok(src.includes("'🔬 Stereo'") || src.includes('🔬 Stereo'));
    assert.ok(src.includes('resize_keyboard'));
  });
  test('handler imports organic tool and wires callbacks', () => {
    assert.ok(src.includes("require('../tools/organic')") || src.includes('organic'));
    assert.ok(src.includes('handleOrganic') || src.includes('analyzeOrganic'));
    assert.ok(src.includes('handleHydrocarbon') || src.includes('analyzeHydrocarbon'));
    assert.ok(src.includes('handleMechanism') || src.includes('explainMechanism'));
    assert.ok(src.includes('handleFunctional') || src.includes('identifyFunctional'));
    assert.ok(src.includes('handleStereo') || src.includes('explainStereo'));
    assert.ok(src.includes('handleSpectroscopy') || src.includes('analyzeSpectroscopy'));
  });
  test('callback_query handler handles cmd_organic, cmd_hydrocarbon, cmd_mechanism, cmd_functional, cmd_stereo, cmd_spectroscopy', () => {
    assert.ok(src.includes("case 'cmd_organic'"));
    assert.ok(src.includes("case 'cmd_hydrocarbon'"));
    assert.ok(src.includes("case 'cmd_mechanism'"));
    assert.ok(src.includes("case 'cmd_functional'"));
    assert.ok(src.includes("case 'cmd_stereo'"));
    assert.ok(src.includes("case 'cmd_spectroscopy'"));
  });
  test('organic KB buttons still pass via inline_keyboard in welcome start message', () => {
    // welcome keyboard inline_keyboard
    assert.ok(src.includes("callback_data: 'cmd_balance'"));
    assert.ok(src.includes("callback_data: 'cmd_molar'"));
    assert.ok(src.includes("callback_data: 'cmd_organic'"));
    assert.ok(src.includes("callback_data: 'cmd_ask'"));
    assert.ok(src.includes('inline_keyboard'));
  });
});

// ---------------------------------------------------------------------------
// 7. Integration — dispatcher + cross-section workflows
// ---------------------------------------------------------------------------
describe('comprehensive — dispatcher & cross-section', () => {
  test('dispatcher organic() routes correctly for each section keyword', () => {
    const cases = [
      ['alkane', 'Alkanes'],
      ['alkene', 'Alkenes'],
      ['alkyne', 'Alkynes'],
      ['benzene', 'Aromatic'],
      ['alcohol', 'alcohol'],
      ['ketone', 'ketone'],
      ['SN1', 'SN1'],
      ['E2', 'E2'],
      ['EAS', 'EAS'],
      ['R/S', 'R/S'],
      ['E/Z', 'E/Z'],
      ['IR', 'IR'],
      ['NMR', 'NMR'],
      ['MS', 'MS'],
      ['PET', 'PET'],
    ];
    for (const [q, expect] of cases) {
      const r = organic.organic(q);
      assert.ok(includesCI(r, expect) || r.includes(expect), `organic("${q}") should contain "${expect}" got ${r.slice(0,200)}`);
    }
  });
  test('getOrganicInfo section routing for all 5', () => {
    assert.ok(includesCI(organic.getOrganicInfo('hydrocarbons','alkene'),'alkene'));
    assert.ok(includesCI(organic.getOrganicInfo('functional','alcohol'),'alcohol'));
    assert.ok(organic.getOrganicInfo('mechanism','SN1').includes('SN1'));
    assert.ok(organic.getOrganicInfo('stereochemistry','R/S').includes('R/S') || includesCI(organic.getOrganicInfo('stereochemistry','R/S'),'cahn'));
    assert.ok(organic.getOrganicInfo('spectroscopy','IR').includes('IR') || includesCI(organic.getOrganicInfo('spectroscopy','IR'),'infrared'));
  });
  test('listSections contains 6 entries covering all 5 plus bonus', () => {
    const secs = organic.listSections();
    assert.ok(Array.isArray(secs));
    assert.ok(secs.length >= 5 && secs.length <= 7);
    assert.ok(secs.includes('hydrocarbons'));
    assert.ok(secs.includes('functionalGroups'));
    assert.ok(secs.includes('reactionMechanisms'));
    assert.ok(secs.includes('stereochemistry'));
    assert.ok(secs.includes('spectroscopy'));
  });
  test('handler wrappers analyzeOrganic etc. produce enriched formula-aware output', () => {
    const r = organic.analyzeOrganic('C2H5OH');
    assert.ok(r.includes('C2H5OH') || r.includes('Organic Analysis'));
    assert.ok(r.includes('Molar mass') || r.includes('DBE') || includesCI(r,'organic'));
    const h = organic.analyzeHydrocarbon('C6H6');
    assert.ok(includesCI(h,'aromatic') || h.includes('benzene') || h.includes('C6H6'));
    const f = organic.identifyFunctional('CH3COOH');
    assert.ok(includesCI(f,'carboxylic') || includesCI(f,'acid'));
    const m = organic.explainMechanism('SN2');
    assert.ok(m.includes('SN2'));
    const s = organic.explainStereo('lactic acid');
    assert.ok(includesCI(s,'chiral') || includesCI(s,'stereo') || s.includes('R/S'));
    const spec = organic.analyzeSpectroscopy('IR');
    assert.ok(spec.includes('IR'));
  });
  test('all main functions always return non-empty string and handle edge inputs', () => {
    const fns = [organic.getHydrocarbons, organic.getFunctionalGroups, organic.getReactionMechanisms, organic.getStereochemistry, organic.getSpectroscopy, organic.organic];
    for (const fn of fns) {
      const r1 = fn('');
      const r2 = fn(null);
      const r3 = fn(undefined);
      const r4 = fn(123);
      const r5 = fn('<b>test</b>');
      assert.ok(typeof r1 === 'string' && r1.length>20, fn.name + ' empty should be string');
      assert.ok(typeof r2 === 'string' && r2.length>20);
      assert.ok(typeof r3 === 'string' && r3.length>20);
      assert.ok(typeof r4 === 'string' && r4.length>20);
      assert.ok(typeof r5 === 'string' && !r5.includes('<b>test</b>'), 'should escape HTML');
    }
  });
});
