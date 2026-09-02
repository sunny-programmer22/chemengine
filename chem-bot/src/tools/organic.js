'use strict';

/**
 * @file organic.js
 * Comprehensive organic chemistry reference for chem-bot.
 * Covers 5 (+1) core sections required by the task:
 *   1. Hydrocarbons (alkanes, alkenes, alkynes, aromatic / Hückel, cycloalkanes)
 *   2. Functional Groups (alcohols, ethers, aldehydes, ketones, carboxylic acids,
 *      esters, amines, amides, nitriles, thiols, phenols, halides …)
 *   3. Reaction Mechanisms (SN1/SN2, E1/E2, electrophilic & nucleophilic addition,
 *      EAS, radical) with competition rules
 *   4. Stereochemistry (R/S via CIP, E/Z, chiral centers, enantiomers,
 *      diastereomers, meso, racemic, Fischer/Newman/chair)
 *   5. Spectroscopy & Analysis (IR, ¹H/¹³C NMR, MS) + worked interpretation example
 *   6. Polymers & Biomolecules (addition vs condensation polymers; carbohydrates,
 *      lipids, proteins, nucleic acids) — included as requested OR branch
 *
 * Each exported function returns a detailed, Telegram-HTML-ready formatted string.
 * Without an argument it returns a full overview; with a query it filters to the
 * matching sub-topic.  All functions are also async-safe (they may be awaited).
 *
 * Data is loaded from JSON in `data/organic-*.json` with in-memory fallbacks so the
 * module works even if the JSON files are absent.
 *
 * @module tools/organic
 */

const fs = require('fs');
const path = require('path');
let _parser = null;
function _getParser() {
  if (_parser) return _parser;
  try { _parser = require('../utils/parser'); } catch { _parser = {}; }
  return _parser;
}

// ---------------------------------------------------------------------------
// Data loading with graceful fallback
// ---------------------------------------------------------------------------

/** Cache for file JSON reads. @type {Object.<string, any>} */
const _jsonCache = {};

function _loadJson(relativePath, fallback) {
  if (_jsonCache[relativePath]) return _jsonCache[relativePath];
  try {
    const full = path.join(__dirname, '..', '..', relativePath);
    if (fs.existsSync(full)) {
      const raw = fs.readFileSync(full, 'utf8');
      const data = JSON.parse(raw);
      _jsonCache[relativePath] = data;
      return data;
    }
  } catch (_) {}
  _jsonCache[relativePath] = fallback;
  return fallback;
}

// Built-in minimal fallbacks (full data lives in JSON)
const _fallbackFunctionalGroups = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'functional-groups.json'), 'utf8'));
  } catch (_) {
    return [];
  }
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _norm(s) {
  return String(s || '').trim().toLowerCase();
}

function _contains(hay, needle) {
  return _norm(hay).includes(_norm(needle));
}

function _normalizeSpectroscopyQuery(query) {
  const q = _norm(query);
  if (!q) return { query: '', tokens: [], aliases: [] };

  const aliases = new Set([q]);
  const add = (value) => {
    const v = _norm(value);
    if (v) aliases.add(v);
  };

  const tokenPatterns = [
    [/\bcarbonyl\b/g, ['c=o', 'c=o ketone', 'c=o aldehyde', 'c=o ester', 'c=o acid']],
    [/\bhydroxyl\b/g, ['o-h', 'oh', 'alcohol', 'phenol', 'acid o-h']],
    [/\baldehyde\b/g, ['cho', 'c=h', 'formyl']],
    [/\bketone\b/g, ['c=o', 'carbonyl']],
    [/\bcarboxyl(?:ic)? acid\b/g, ['cooh', 'c=o', 'o-h', 'carboxylic acid']],
    [/\besters?\b/g, ['coo', 'c=o', 'c-o']],
    [/\bnitrile\b/g, ['c#n', 'c≡n', 'c=n']],
    [/\balkyne\b/g, ['c#c', 'c≡c']],
    [/\balkene\b/g, ['c=c']],
    [/\bamine\b/g, ['n-h', 'nh2', 'nh']],
    [/\bamide\b/g, ['conh2', 'c=o', 'n-h']],
    [/\bether\b/g, ['c-o']],
    [/\balkyl\b/g, ['c-h']],
  ];

  for (const [pattern, mapped] of tokenPatterns) {
    if (pattern.test(q)) {
      for (const item of mapped) add(item);
    }
    pattern.lastIndex = 0;
  }

  const cleaned = q.replace(/[^a-z0-9\-+]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned ? cleaned.split(' ') : [];
  // Only add tokens of length >= 3. Two-letter tokens like "ir"/"ms" match
  // substring noise inside row text and cause unrelated rows to pass the filter.
  for (const t of tokens) if (t.length >= 3) add(t);

  return { query: q, tokens, aliases: Array.from(aliases) };
}

function _spectroscopyMatch(hay, queryInfo) {
  if (!queryInfo || !queryInfo.query) return true;
  const text = _norm(hay);
  if (text.includes(queryInfo.query)) return true;
  for (const alias of queryInfo.aliases || []) {
    if (alias && text.includes(alias)) return true;
  }
  return false;
}

function _anyContains(arr, needle) {
  if (!Array.isArray(arr)) return _contains(String(arr), needle);
  return arr.some((v) => _contains(String(v), needle));
}

/**
 * Escape minimal HTML for user-supplied query echoes (keeps <b>/<i> we generate).
 * @param {string} s
 * @returns {string}
 */
function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _header(title, emoji) {
  return `<b>${emoji} ${title}</b>\n`;
}

function _subHeader(text) {
  return `\n<b>${text}</b>\n`;
}

function _bullet(items) {
  return items.map((it) => `  • ${it}`).join('\n');
}

function _numbered(items) {
  return items.map((it, i) => `  ${i + 1}. ${it}`).join('\n');
}

function _sep() {
  return '\n' + '─'.repeat(40) + '\n';
}

// ---------------------------------------------------------------------------
// 1. HYDROCARBONS
// ---------------------------------------------------------------------------

/**
 * Retrieve hydrocarbon data array.
 * @returns {Array}
 */
function _hydrocarbonsData() {
  const fallback = [];
  const data = _loadJson('data/organic-hydrocarbons.json', fallback);
  return Array.isArray(data) ? data : fallback;
}

/**
 * Format one hydrocarbon entry as a block.
 * @param {Object} h
 * @returns {string}
 */
function _formatHydrocarbon(h) {
  const lines = [];
  lines.push(`<b>⬢ ${h.name}</b>  <i>${h.suffix || ''} · ${h.generalFormula || ''}</i>`);
  if (h.hybridization) lines.push(`  Hybridisation: ${h.hybridization} — ${h.geometry || ''}`);
  if (h.bondType) lines.push(`  Bonding: ${h.bondType}`);
  if (h.example) {
    const ex = typeof h.example === 'object' ? `${h.example.formula || ''} — ${(h.example.names || []).join(', ')}${h.example.structure ? `  e.g. ${h.example.structure}` : ''}` : String(h.example);
    lines.push(`  Example: ${ex}`);
  }
  if (h.physicalProperties) lines.push(`  Physical: ${h.physicalProperties}`);
  if (h.chemicalProperties) lines.push(`  Chemical: ${h.chemicalProperties}`);
  if (Array.isArray(h.reactions) && h.reactions.length) {
    lines.push(`  Key reactions:`);
    for (const r of h.reactions) lines.push(`    ‣ ${r}`);
  }
  if (Array.isArray(h.iupacExamples) && h.iupacExamples.length) {
    lines.push(`  IUPAC e.g.: ${h.iupacExamples.join('; ')}`);
  }
  return lines.join('\n');
}

/**
 * Detailed hydrocarbons reference.  Covers alkanes, alkenes, alkynes, aromatics &
 * cycloalkanes, with IUPAC names, hybridization, isomerism and characteristic reactions.
 *
 * @param {string} [query] - Optional filter (e.g. "alkane", "alkene", "alkyne",
 *   "aromatic", "benzene", "cyclo", or a formula like "C4H10").
 *   If omitted or "overview"/"all" returns the full section.
 * @returns {string} HTML-formatted detailed string (always non-empty)
 */
function getHydrocarbons(query) {
  const q = _norm(query);
  const all = _hydrocarbonsData();

  // Built-in overview when JSON missing or empty
  if (!all.length) {
    return (
      _header('Hydrocarbons — Overview', '🛢️') +
      `Hydrocarbons contain only C and H. Four families dominate organic chemistry.\n` +
      _subHeader('1 — Alkanes (CnH2n+2, sp³, 109.5°)') +
      `  • Single σ bonds only; saturated; tetrahedral.\n` +
      `  • IUPAC: meth-, eth-, prop-, but-, pent-, hex- + -ane; branched: longest chain + alkyl substituents.\n` +
      `  • Reactions: combustion (CH4+2O2→CO2+2H2O), radical halogenation (CH4+Cl2—hv→CH3Cl+HCl), cracking.\n` +
      `  • IR ~2960 cm⁻¹; ¹H NMR δ 0.9-1.5.\n` +
      _subHeader('2 — Alkenes (CnH2n, sp², 120°)') +
      `  • One σ+one π (C=C); planar; cis/trans & E/Z isomerism.\n` +
      `  • Naming: -ene, locant for double bond (but-1-ene vs but-2-ene).\n` +
      `  • Reactions: electrophilic addition (H2/Pt→alkane, Br2→dibromo anti, HBr Markovnikov, H2O/H⁺→alcohol).\n` +
      _subHeader('3 — Alkynes (CnH2n-2, sp, 180°)') +
      `  • One σ+two π (C≡C); linear; terminal ≡C-H acidic pKa~25.\n` +
      `  • Reactions: 2× addition, acetylide alkylation, Hg²⁺ hydration → ketone.\n` +
      _subHeader('4 — Aromatic (benzene C6H6, 4n+2 Hückel, sp² hexagonal)') +
      `  • Resonance stabilization ~150 kJ/mol; planar ring; IR 1500/1600 + 3030; NMR δ7-8.\n` +
      `  • Reaction: electrophilic aromatic substitution (EAS) via σ-complex → retains aromaticity (nitration, halogenation, Friedel-Crafts).\n` +
      `  • Substituent effects: activating o/p (-OH,-OR,-NH2, alkyl); deactivating m (-NO2,-COR,-CN); halogens deactivating o/p.\n` +
      _subHeader('Cycloalkanes (CnH2n)') +
      `  • Ring strain: cyclopropane 60° highly strained → ring-opening; cyclohexane chair (axial/equatorial, ring flip, no strain).` +
      `\n\n<i>Tip: query e.g. getHydrocarbons("alkene") or getHydrocarbons("benzene") for a filtered card.</i>`
    );
  }

  // No query → full overview + each block
  if (!q || q === 'overview' || q === 'all' || q === 'hydrocarbon' || q === 'hydrocarbons') {
    let out = _header('Hydrocarbons — Complete Reference', '🛢️');
    out += `Families: <b>alkanes</b> · <b>alkenes</b> · <b>alkynes</b> · <b>aromatic (arenes)</b> · <b>cycloalkanes</b>\n`;
    out += `General: C-C σ + C-H σ in all; π bonds (alkenes/alkynes/aromatics) are the reactive sites.\n`;
    out += _sep();
    for (const h of all) {
      out += _formatHydrocarbon(h) + '\n' + _sep();
    }
    out += _subHeader('Quick comparison table');
    out += `  Family      | Formula (one unsat.) | Hybrid | Geometry      | Reactivity\n`;
    out += `  Alkanes     | CnH2n+2              | sp³    | 109.5° tetra. | combustion, radical substitution\n`;
    out += `  Alkenes     | CnH2n                | sp²    | 120° planar   | electrophilic addition (Markovnikov, anti)\n`;
    out += `  Alkynes     | CnH2n-2              | sp     | 180° linear   | addition ×2, acetylide, hydration→ketone\n`;
    out += `  Aromatic    | CnH2n-6 (benzene)    | sp²    | hexagonal     | EAS (σ-complex), substituent directing\n`;
    out += `  Cycloalkane | CnH2n                | sp³    | chair/strained| ring-opening (small rings)\n`;
    out += _subHeader('Isomerism cheat-sheet');
    out += _bullet([
      'Chain isomerism: same formula different connectivity (butane vs 2-methylpropane).',
      'Position isomerism: same skeleton double/triple at different locant (but-1-ene vs but-2-ene).',
      'Geometric: cis/trans & E/Z around C=C or ring (requires two different groups per C).',
      'Aromatic: ortho/meta/para disubstitution patterns on benzene.'
    ]);
    out += `\n\n<i>Filtered queries: try "alkane", "alkene", "alkyne", "aromatic", "cyclo", or "C4H10".</i>`;
    return out;
  }

  // Filtered search — two-stage: strict (id/name/alias/suffix) first, then broad fallback
  const strictHits = all.filter((h) => {
    const strictHay = [h.id, h.name, h.suffix, ...(h.aliases || [])].join(' ').toLowerCase();
    // Allow "alkane" to match only "alkane"/"alkanes" not "alkenes": require word-boundary style check
    // We check if strictHay contains q as a distinct token or id exactly
    if (strictHay.includes(q)) {
      // Prevent false "alkane" → "alkene" via substring: require that matched token is correct family
      // For hydrocarbon families, enforce exact alias/id match when q is a family word
      const familyWords = ['alkane', 'alkanes', 'alkene', 'alkenes', 'alkyne', 'alkynes', 'aromatic', 'arene', 'cycloalkane', 'cycloalkanes'];
      if (familyWords.includes(q)) {
        const tokens = strictHay.split(/[\s,;\/]+/);
        // also check aliases list
        const aliasMatch = (h.aliases || []).some((a) => _norm(a) === q);
        const idMatch = _norm(h.id) === q || _norm(h.id + 's') === q;
        const nameMatch = _norm(h.name).includes(q);
        // For "alkane" strictly match alkane only (not cycloalkane) to avoid confusion; cycloalkane has its own query
        if (q === 'alkane' || q === 'alkanes') return h.id === 'alkane';
        if (q === 'alkene' || q === 'alkenes') return h.id === 'alkene';
        if (q === 'alkyne' || q === 'alkynes') return h.id === 'alkyne';
        if (q === 'aromatic' || q === 'arene' || q === 'benzene') return h.id === 'aromatic';
        if (q === 'cycloalkane' || q === 'cycloalkanes' || q === 'cyclo') return h.id === 'cycloalkane';
        // fallback to generic alias check
        return aliasMatch || idMatch || nameMatch;
      }
      return true;
    }
    // also check example formula exact token (e.g. C4H10)
    if (h.example && typeof h.example === 'object') {
      const exTokens = [h.example.formula, ...(h.example.names || [])].join(' ').toLowerCase();
      if (exTokens.includes(q)) return true;
    }
    return false;
  });
  let hits = strictHits;
  if (hits.length === 0) {
    // Broad fallback: allow searching in descriptions, reactions, examples
    hits = all.filter((h) => {
      const hay = [h.id, h.name, h.suffix, h.generalFormula, h.hybridization, h.geometry, h.bondType, h.physicalProperties, h.chemicalProperties, ...(h.aliases || []), ...(h.iupacExamples || []), ...(h.reactions || [])].join(' ').toLowerCase();
      if (h.example && typeof h.example === 'object') {
        const exHay = [h.example.formula, ...(h.example.names || []), h.example.structure].join(' ').toLowerCase();
        if (exHay.includes(q)) return true;
      }
      return hay.includes(q);
    });
  }

  if (hits.length === 0) {
    let out = _header('Hydrocarbons — Search', '🛢️');
    out += `No exact match for "<b>${_esc(query)}</b>". Showing overview instead.\n`;
    out += `Available families: ${all.map((h) => h.name).join(', ')}.\n`;
    out += `Try one of: ${all.map((h) => h.id).join(', ')}, or "alkane", "alkene", "alkyne", "aromatic".\n`;
    out += _sep();
    // still show closest: if query looks like hydrocarbon formula, give naming tip via fallback
    if (/^c\d*h\d*$/i.test(q.replace(/\s/g, ''))) {
      out += _subHeader('Hydrocarbon formula typing tip');
      out += `  • CnH2n+2 → alkane (e.g. C4H10 = butane)\n`;
      out += `  • CnH2n   → alkene (one C=C) or cycloalkane (e.g. C4H8 = butene / cyclobutane)\n`;
      out += `  • CnH2n-2 → alkyne (one C≡C) or diene (e.g. C4H6 = butyne)\n`;
      out += `  • CnH2n-6 → aromatic (e.g. C6H6 benzene)\n`;
    }
    return out;
  }

  let out = _header(`Hydrocarbons — ${hits.map((h) => h.name).join(' + ')}`, '🛢️');
  if (hits.length === 1) {
    out += `Matched filter: "<b>${_esc(query)}</b>" → <b>${hits[0].name}</b>\n\n`;
  } else {
    out += `Matched filter: "<b>${_esc(query)}</b>" → ${hits.length} families\n\n`;
  }
  for (const h of hits) {
    out += _formatHydrocarbon(h) + '\n' + _sep();
  }
  // Add a contextual tip for single-hit
  if (hits.length === 1) {
    const single = hits[0];
    if (single.id === 'alkane') {
      out += _subHeader('IUPAC naming tip — branched alkane');
      out += `  1. Longest chain = parent (butane/pentane...).\n  2. Number to give substituents lowest locants.\n  3. Alphabetize substituents (ignore di/tri). E.g. CH3CH(CH3)CH2CH3 → 2-methylbutane.\n`;
    } else if (single.id === 'alkene') {
      out += _subHeader('Markovnikov quick rule');
      out += `  HBr adds H to carbon with MORE H → X goes to MORE substituted carbon (more stable carbocation).\n  Example: CH3CH=CH2 + HBr → CH3CHBrCH3 (not CH2Br). Hydroboration gives the opposite (anti-Markovnikov).\n`;
    } else if (single.id === 'aromatic') {
      out += _subHeader('Directing effects mnemonic');
      out += `  Activating o/p: OH > NH2 > OR > NHCOR > phenyl > alkyl.  Halogens: deactivating but o/p.  Deactivating m: NO2 > CN > CHO > COR > COOH > SO3H > CF3.\n`;
    }
  }
  return out;
}

// Aliases for hydrocarbons
const getHydrocarbonInfo = getHydrocarbons;
const hydrocarbons = getHydrocarbons;
const describeHydrocarbon = getHydrocarbons;

// ---------------------------------------------------------------------------
// 2. FUNCTIONAL GROUPS
// ---------------------------------------------------------------------------

function _functionalGroupsData() {
  const data = _fallbackFunctionalGroups;
  if (Array.isArray(data) && data.length) return data;
  return [];
}

function _formatFunctionalGroup(g) {
  const lines = [];
  lines.push(`<b>⬡ ${g.name}</b>  <i>${g.suffix ? `suffix ${g.suffix}` : ''}${g.suffix && g.prefix ? ' · ' : ''}${g.prefix ? `prefix ${g.prefix}` : ''}</i>`);
  if (g.exampleFormula) lines.push(`  Example: ${g.exampleFormula}`);
  if (g.description) lines.push(`  ${g.description}`);
  // Enrich with curated extra notes for common groups
  const enrich = _fgEnrich(_norm(g.name));
  if (enrich) lines.push(`  ${enrich}`);
  return lines.join('\n');
}

function _fgEnrich(key) {
  const map = {
    alcohol: 'Classes: 1° (RCH2OH) 2° (R2CHOH) 3° (R3COH); Tests: Jones/CrO3 oxidizes 1°→acid 2°→ketone 3° no reaction; Lucas (ZnCl2/HCl): 3° instant cloudy, 2° 5 min, 1° no reaction; RXN: dehydration —H2SO4/Δ→ alkene, substitution → alkyl halide, esterification.',
    ether: 'R-O-Rʹ; Williamson: RO⁻ Na⁺ + Rʹ-X (primary) → R-O-Rʹ (SN2); cleavage: RORʹ + HI → RI + RʹOH; peroxide risk on storage; IR C-O ~1100; NMR OCH δ3-4.',
    aldehyde: 'R-CHO, suffix -al, C=O ~1720 + aldehydic C-H 2720/2820 doublet; tests: Tollens Ag⁺→Ag mirror (aldehyde positive, ketone negative), Fehling/Cu²⁺ similar; RXN: NaBH4→1° alcohol, Grignard→2° alcohol, Wittig→alkene, aldol.',
    ketone: 'R-CO-Rʹ, suffix -one, C=O ~1715; tests: 2,4-DNP orange ppt (all carbonyl), iodoform CHI3 yellow ppt for CH3CO- or CH3CHOH-; RXN: NaBH4→2° alcohol, Grignard→3° alcohol.',
    'carboxylic acid': 'R-COOH, suffix -oic acid, pKa~4-5; dimer H-bond → broad IR 3300-2500 + 1710; RXN: acid + RʹOH —H2SO4→ ester + H2O (Fischer), SOCl2→RCOCl, RCOO⁻ Na⁺ water-soluble.',
    ester: 'R-CO-O-Rʹ, suffix -oate, C=O ~1735; RXN: saponification RCOORʹ+NaOH→RCOO⁻+RʹOH (soap), hydrolysis —H⁺/OH⁻→ acid+alcohol.',
    amide: 'R-CO-NR2, suffix -amide, C=O ~1650 (amide I); planarity due to resonance; RXN: hydrolysis —acid/base, heat→ acid+amine; dehydration → nitrile (P2O5).',
    amine: 'R-NH2 (1°), R2NH (2°), R3N (3°), R4N⁺ (quat); suffix -amine; basic (pKa of conjugate ~10 for alkyl, ~4 for aryl due to resonance); test Hinsberg: 1°→ soluble sulfonamide, 2°→ insoluble, 3°→ no reaction.',
    halide: 'R-X (F,Cl,Br,I); prefix halo-; reactivity I>Br>Cl>>F; RXN: SN1/SN2/E1/E2 precursors, Grignard RMgX formation (dry ether).',
    phenol: 'Ar-OH, acidity pKa~10 (more acidic than alcohol due to phenoxide resonance); gives purple FeCl3, white ppt with Br2(aq) (2,4,6-tribromophenol), IR O-H ~3350.',
    thiol: 'R-SH, suffix -thiol, pKa~10, foul odor; oxidation → disulfide R-S-S-R (e.g., hair curling); more acidic & nucleophilic than alcohol.',
    nitrile: 'R-C≡N, suffix -nitrile, IR 2260; hydrolysis → amide → acid; reduction LiAlH4→ amine.',
    nitro: 'R-NO2, two IR bands 1550 & 1350; reduction Sn/HCl → amine; activating? deactivating meta in EAS.',
    anhydride: 'R-CO-O-CO-Rʹ, two C=O 1850+1780; acylating agent like acid chloride but milder.',
  };
  return map[key] || null;
}

/**
 * Full functional-group reference.  Tables suffix/prefix, general formula,
 * characteristic IR/NMR/spectroscopy cues, chemical tests and typical reactions.
 *
 * @param {string} [query] - Optional name filter (e.g. "alcohol", "ketone",
 *   "carboxylic", "ester", "amine", "phenol", "thiol"). Empty → full list.
 * @returns {string}
 */
function getFunctionalGroups(query) {
  const q = _norm(query);
  const all = _functionalGroupsData();

  // Priority table for IUPAC (when multiple groups present)
  const priorityTable = [
    '1. -COOH (carboxylic acid, -oic acid) — highest',
    '2. -COOR (ester, -oate)',
    '3. -CONR2 (amide, -amide)',
    '4. -C≡N (nitrile, -nitrile)',
    '5. -CHO (aldehyde, -al)',
    '6. -CO- (ketone, -one)',
    '7. -OH (alcohol, -ol)',
    '8. -NH2 (amine, -amine)',
    '9. C=C (-ene)',
    '10. C≡C (-yne)',
    '11. -O- (ether, alkoxy- prefix only)',
    '12. -X (halide, halo- prefix)',
  ];

  if (!q || q === 'all' || q === 'overview' || q === 'functional' || q === 'functional groups') {
    let out = _header('Functional Groups — Complete Table', '🧬');
    out += `IUPAC rule: the <b>highest-priority</b> group becomes the <b>suffix</b>; all others are <b>prefixes</b> (alphabetized). Parent chain must include the principal group.\n`;
    out += _subHeader('Priority (suffix) — highest → lowest');
    out += _numbered(priorityTable) + '\n';
    out += _subHeader('Catalog (30 groups: name · suffix/prefix · example — description)');
    if (all.length) {
      for (const g of all) {
        out += `  ${_formatFunctionalGroup(g).replace(/\n/g, '\n  ')}\n\n`;
      }
    } else {
      out += `  (embedded functional-groups data unavailable — using curated summary)\n`;
      const curated = ['alcohol -ol / hydroxy- (ROH)', 'ether ether / alkoxy- (ROR)', 'aldehyde -al / oxo- (RCHO)', 'ketone -one / oxo- (RCOR)', 'carboxylic acid -oic acid / carboxy- (RCOOH)', 'ester -oate / alkoxycarbonyl- (RCOOR)', 'amide -amide / carbamoyl- (RCONR2)', 'amine -amine / amino- (RNH2)', 'nitrile -nitrile / cyano- (RCN)', 'halide / halo- (RX)', 'phenol -phenol / hydroxy- (ArOH)', 'thiol -thiol / mercapto- (RSH)'];
      out += _bullet(curated) + '\n';
    }
    out += _subHeader('Spectroscopic fingerprints (quick)');
    out += _bullet([
      'Alcohol O-H: broad IR 3400-3200 + C-O 1050-1300; ¹H OH δ0.5-5 (D2O exchangeable).',
      'Aldehyde: IR C=O 1720 + C-H doublet 2720/2820; ¹H CHO δ9-10 singlet.',
      'Ketone: IR 1715; ¹H CH3CO δ2.1 singlet (diagnostic).',
      'Acid: IR very broad 3300-2500 + 1710; ¹H COOH δ11-12 (D2O).',
      'Ester: IR 1735 + two C-O bands 1300-1000.',
      'Amine: IR 3300-3500 (1° two peaks, 2° one); ¹H NH δ0.5-5 broad.',
      'Nitrile: IR 2260 sharp; ¹³C CN δ115-125.',
      'Phenol: IR OH ~3350, C=C 1500/1600; ¹H ArOH δ4-8; FeCl3 purple.',
    ]);
    out += _subHeader('Chemical-test quick chart');
    out += _bullet([
      'Tollens/Fehling: aldehyde positive (silver mirror / Cu2O red), ketone negative.',
      'Iodoform: CH3CO- or CH3CHOH- → CHI3 yellow ppt.',
      'Lucas (ZnCl2/HCl): 3° alcohol → instant turbidity, 2° ~5 min, 1° no reaction.',
      'Br2 decolor & KMnO4 purple→brown: C=C / C≡C positive; aromatic negative.',
      'FeCl3: phenol purple; NaHCO3 fizz: carboxylic acid; 2,4-DNP orange: carbonyl.',
    ]);
    out += `\n<i>Tip: query by name, e.g. getFunctionalGroups("ketone") or getFunctionalGroups("phenol").</i>`;
    return out;
  }

  // Filtered mode — strict name/suffix/prefix first, broad description fallback only if no strict hit
  const strictHitsFG = all.filter((g) => {
    const strictHay = [g.name, g.suffix, g.prefix].join(' ').toLowerCase();
    return strictHay.includes(q);
  });
  let hits = strictHitsFG;
  if (hits.length === 0) {
    hits = all.filter((g) => {
      const hay = [g.name, g.suffix, g.prefix, g.exampleFormula, g.description].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  if (hits.length === 0) {
    // Try alias fuzzy: if query is short like "ol" or "al", match relevant family
    let hint = '';
    if (q.includes('ol') || q === 'hydroxy') hint = 'Did you mean "alcohol" or "phenol"?';
    else if (q === 'al' || q.includes('aldehyd')) hint = 'Did you mean "aldehyde"?';
    else if (q.includes('one') || q === 'co') hint = 'Did you mean "ketone"?';
    else if (q.includes('oic') || q.includes('acid')) hint = 'Try "carboxylic acid".';
    return (
      _header('Functional Groups — Search', '🧬') +
      `No exact match for "<b>${_esc(query)}</b>". ${hint}\n` +
      `Available (30 groups): ${all.map((g) => g.name).join(', ')}.\n` +
      `Examples: alcohol, ether, aldehyde, ketone, carboxylic acid, ester, amide, amine, nitrile, thiol, phenol, halide.\n` +
      `Or call with no argument for the full table including IUPAC priority.`
    );
  }

  let out = _header(`Functional Groups — ${hits.map((g) => g.name).join(' + ')}`, '🧬');
  out += `Filter: "<b>${_esc(query)}</b>" → ${hits.length} hit(s). IUPAC priority noted above (higher → suffix).\n\n`;
  for (const g of hits) {
    out += _formatFunctionalGroup(g) + '\n\n';
  }
  // If single hit, add maybe spectroscopy/test extra
  if (hits.length === 1) {
    const single = hits[0];
    out += _sep();
    out += _subHeader(`More on ${single.name}`);
    out += `  Usage in synthesis: see reaction mechanisms (SN1/SN2, addition) and spectroscopy sections.\n`;
    out += `  Related: ${all.filter((x) => x.name !== single.name).slice(0, 5).map((x) => x.name).join(', ')}… (call with no arg for full catalog).\n`;
  }
  return out;
}

const getFunctionalGroupInfo = getFunctionalGroups;
const functionalGroups = getFunctionalGroups;
const describeFunctionalGroup = getFunctionalGroups;

// ---------------------------------------------------------------------------
// 3. REACTION MECHANISMS
// ---------------------------------------------------------------------------

function _mechanismsData() {
  return _loadJson('data/organic-mechanisms.json', []);
}

function _formatMechanism(m) {
  const lines = [];
  lines.push(`<b>⚙️ ${m.name}</b>  <i>(${m.id ? m.id.toUpperCase() : m.aliases ? m.aliases[0] : ''})</i>`);
  if (m.mechanism) lines.push(`  Mechanism: ${m.mechanism}`);
  if (m.rateLaw) lines.push(`  Rate law: ${m.rateLaw}`);
  if (m.substrate) lines.push(`  Substrate: ${m.substrate}`);
  if (m.nucleophile) lines.push(`  Nucleophile: ${m.nucleophile}`);
  if (m.base) lines.push(`  Base: ${m.base}`);
  if (m.leavingGroup) lines.push(`  Leaving group: ${m.leavingGroup}`);
  if (m.solvent) lines.push(`  Solvent: ${m.solvent}`);
  if (m.stereochemistry) lines.push(`  Stereochem: ${m.stereochemistry}`);
  if (m.competition) lines.push(`  Competition: ${m.competition}`);
  if (Array.isArray(m.examples) && m.examples.length) {
    lines.push(`  Examples:`);
    for (const ex of m.examples) lines.push(`    ‣ ${ex}`);
  }
  if (Array.isArray(m.variants) && m.variants.length) {
    lines.push(`  Variants:`);
    for (const v of m.variants) {
      const parts = [v.name, v.reagents ? `⟨${v.reagents}⟩` : '', v.regio ? `regio:${v.regio}` : '', v.stereo ? `stereo:${v.stereo}` : '', v.example || v.product || ''].filter(Boolean).join(' — ');
      lines.push(`    ‣ ${parts}`);
      if (v.notes) lines.push(`       • ${v.notes}`);
    }
  }
  if (m.electrophiles) {
    lines.push(`  Electrophiles (EAS):`);
    for (const e of m.electrophiles) {
      lines.push(`    ‣ ${e.reaction}: ${e.electrophile} ⟨${e.reagents}⟩ → ${e.product}${e.limitations ? ` — ${e.limitations}` : ''}${e.notes ? ` — ${e.notes}` : ''}`);
    }
  }
  if (m.substituentEffects) {
    const se = m.substituentEffects;
    if (Array.isArray(se.activatingOrthoPara)) lines.push(`  Activating o/p: ${se.activatingOrthoPara.join(', ')}`);
    if (Array.isArray(se.weaklyDeactivatingOrthoPara)) lines.push(`  Weakly deactivating o/p: ${se.weaklyDeactivatingOrthoPara.join(', ')}`);
    if (Array.isArray(se.deactivatingMeta)) lines.push(`  Deactivating m: ${se.deactivatingMeta.join(', ')}`);
    if (se.notes) lines.push(`  Note: ${se.notes}`);
  }
  if (m.selectivity) lines.push(`  Selectivity: ${m.selectivity}`);
  if (m.quickDecisionTable) lines.push(`  Decision: ${m.quickDecisionTable}`);
  if (m.reactivityOrder) lines.push(`  Reactivity: ${m.reactivityOrder}`);
  if (m.energyDiagram) lines.push(`  Energy: ${m.energyDiagram}`);
  return lines.join('\n');
}

/**
 * Reaction mechanisms — SN1/SN2/E1/E2, addition (electrophilic & nucleophilic),
 * EAS and radical.  Includes rate laws, conditions, stereochemistry and competition.
 *
 * @param {string} [query] - e.g. "SN1", "SN2", "E1", "E2", "addition",
 *   "markovnikov", "EAS", "friedel", "radical", "competition". Empty → full overview.
 * @returns {string}
 */
function getReactionMechanisms(query) {
  const q = _norm(query);
  const all = _mechanismsData();

  if (!all.length) {
    // Fallback overview if JSON fails
    return (
      _header('Reaction Mechanisms — Overview', '⚙️') +
      `SN1 (carbocation, 1st order, racemization, polar protic, tertiary) vs SN2 (concerted backside, 2nd order, inversion, polar aprotic, primary).\n` +
      `E1 (carbocation + weak base → alkene, Saytzeff,heat) vs E2 (concerted anti-periplanar, strong bulky base, Hofmann vs Saytzeff).\n` +
      `Electrophilic addition (Markovnikov via carbocation/halonium; hydroboration anti-Markovnikov syn). Nucleophilic addition to C=O (Grignard → alcohols, acetal, Wittig).\n` +
      `EAS: σ-complex → substitution retaining aromaticity; substituents direct o/p vs m.\n`
    );
  }

  const isOverview = !q || q === 'overview' || q === 'all' || q === 'mechanisms' || q === 'mechanism';

  if (isOverview) {
    let out = _header('Reaction Mechanisms — Complete Field Guide', '⚙️');
    out += `Core patterns: <b>substitution</b> (SN1/SN2) · <b>elimination</b> (E1/E2) · <b>addition</b> (electrophilic & nucleophilic) · <b>EAS</b> (aromatic) · <b>radical</b>.\n`;
    out += `Master rule: <b>SN1/E1 share the same carbocation</b> (first-order, tertiary, polar protic, heat → E1); <b>SN2/E2 share concerted</b> (second-order, primary/tertiary, strong Nu vs strong base, anti-periplanar for E2).\n`;
    out += _sep();
    for (const m of all) {
      out += _formatMechanism(m) + '\n' + _sep();
    }
    out += _subHeader('SN1 vs SN2 vs E1 vs E2 — decision matrix (exam saver)');
    out += `  Substrate \\ Conditions   | Weak Nu/base, polar protic, low T | Strong Nu (small), polar aprotic, low T | Strong bulky base, heat\n`;
    out += `  Methyl (CH3X)            | SN1 ✗ (no cation)                  | SN2 ✓                           | E2 ✗ (no β-H)\n`;
    out += `  Primary (RCH2X)          | SN1 very slow                      | SN2 ✓ (major)                   | E2 ✓ (with bulky base)\n`;
    out += `  Secondary (R2CHX)        | SN1/E1 compete                     | SN2 (if small Nu) else E2       | E2 ✓\n`;
    out += `  Tertiary (R3CX)          | SN1 (low T) / E1 (high T)          | SN2 ✗ (hindered) E2 ✓           | E2 ✓\n`;
    out += `  Benzylic/Allylic         | SN1 fast even primary (resonance)  | SN2 also fast                   | E2 may dominate with base\n`;
    out += `\n  Nucleophile strength ↑ → SN2; Basicity ↑ + bulk ↑ → E2; Heat ↑ → elimination (entropy).\n`;
    out += _subHeader('Common pitfalls');
    out += _bullet([
      'SN1 carbocations rearrange (hydride/methyl shift) → check for more stable cation; E2 does NOT rearrange.',
      'E2 requires anti-periplanar H-C-C-LG (180°) → in cyclohexane, axial LG + axial H anti gives product stereospecifically.',
      'Hofmann (less substituted alkene) only with bulky base (t-BuOK), otherwise Saytzeff (more substituted) is major.',
      'In EAS, −NH2 is strongly activating but in Friedel-Crafts it complexes AlCl3 and becomes deactivating meta-director (protect as −NHCOCH3).',
      'Radical halogenation: Br2 is highly selective for 3°/allylic/benzylic (NBS for allylic); Cl2 less selective.',
    ]);
    out += `\n<i>Filter e.g. getReactionMechanisms("SN1"), "E2", "addition", "EAS", or "radical".</i>`;
    return out;
  }

  // Special query: "competition" → decision matrix only
  if (q === 'competition' || q === 'sn1 vs sn2' || q === 'e1 vs e2' || q === 'choose') {
    let out = _header('Mechanism Competition — How to Choose', '⚙️');
    out += _formatMechanism(all.find((m) => m.id === 'sn1') || all[0]) + '\n' + _sep();
    out += _formatMechanism(all.find((m) => m.id === 'sn2') || all[1]) + '\n' + _sep();
    out += _formatMechanism(all.find((m) => m.id === 'e1') || all[2]) + '\n' + _sep();
    out += _formatMechanism(all.find((m) => m.id === 'e2') || all[3]) + '\n' + _sep();
    out += `Decision matrix covers substrate × nucleophile/base × solvent × temperature (see full overview).\n`;
    return out;
  }

  // Two-stage: strict exact-id for SN/EAS, then broad fallback — prevents "SN1" also matching E1 via cross-reference text
  const exactIds = ['sn1', 'sn2', 'e1', 'e2', 'eas', 'radical'];
  let hits = [];
  if (exactIds.includes(q)) {
    hits = all.filter((m) => m.id === q || (m.aliases || []).some((a) => _norm(a) === q));
  } else if (q === 'addition') {
    hits = all.filter((m) => m.id.includes('addition'));
  } else if (q.includes('friedel')) {
    hits = all.filter((m) => m.id === 'eas');
  } else if (q.includes('markov')) {
    hits = all.filter((m) => m.id === 'addition-electrophilic');
  } else if (q.includes('grignard')) {
    hits = all.filter((m) => m.id === 'addition-nucleophilic');
  }
  if (hits.length === 0) {
    hits = all.filter((m) => {
      const hay = [m.id, m.name, ...(m.aliases || []), ...(m.keywords || []), m.mechanism, m.substrate, m.nucleophile, m.base, m.solvent, m.stereochemistry, ...(m.examples || []), m.selectivity, m.reactivityOrder].join(' ').toLowerCase();
      if (m.variants) {
        const vHay = m.variants.map((v) => [v.name, v.reagents, v.regio, v.stereo, v.example, v.product, v.notes].join(' ')).join(' ').toLowerCase();
        if (vHay.includes(q)) return true;
      }
      if (m.electrophiles) {
        const eHay = m.electrophiles.map((e) => [e.reaction, e.electrophile, e.reagents, e.product].join(' ')).join(' ').toLowerCase();
        if (eHay.includes(q)) return true;
      }
      return hay.includes(q);
    });
  }

  if (hits.length === 0) {
    return (
      _header('Reaction Mechanisms — Search', '⚙️') +
      `No match for "<b>${_esc(query)}</b>". Available: ${all.map((m) => `${m.id} — ${m.name}`).join('; ')}.\n` +
      `Try: SN1, SN2, E1, E2, addition, markovnikov, EAS, friedel-crafts, radical, grignard.\n` +
      `Or call with no argument for the full competition matrix.`
    );
  }

  let out = _header(`Reaction Mechanisms — ${hits.map((h) => h.name).join(' + ')}`, '⚙️');
  out += `Filter: "<b>${_esc(query)}</b>" → ${hits.length} hit(s).\n\n`;
  for (const h of hits) {
    out += _formatMechanism(h) + '\n' + _sep();
  }
  // For single SN/E, add quick mnemonic
  if (hits.length === 1) {
    const id = hits[0].id;
    if (id === 'sn1' || id === 'sn2' || id === 'e1' || id === 'e2') {
      out += _subHeader('Mnemonic');
      out += `  SN1 = 1 molecule in RDS → 1st order, 1 step that matters (ionization), tertiary loves it.\n`;
      out += `  SN2 = 2 molecules in RDS → 2nd order, backside attack, primary loves it, inversion.\n`;
      out += `  E1  = 1st order, same carbocation as SN1, weak base, heat → alkene.\n`;
      out += `  E2  = 2nd order, concerted, anti-periplanar, strong (bulky → Hofmann) base.\n`;
    }
  }
  return out;
}

const getMechanismInfo = getReactionMechanisms;
const reactionMechanisms = getReactionMechanisms;
const getMechanisms = getReactionMechanisms;

// ---------------------------------------------------------------------------
// 4. STEREOCHEMISTRY
// ---------------------------------------------------------------------------

function _stereoData() {
  return _loadJson('data/organic-stereochemistry.json', { concepts: [], quickReference: {} });
}

function _formatStereoConcept(c) {
  const lines = [];
  lines.push(`<b>🔷 ${c.name}</b>  <i>${c.id || ''}</i>`);
  if (c.definition) lines.push(`  ${c.definition}`);
  if (Array.isArray(c.criteria)) {
    lines.push(`  Criteria:`);
    for (const cr of c.criteria) lines.push(`    • ${cr}`);
  }
  if (Array.isArray(c.rules)) {
    lines.push(`  CIP Rules / How-to:`);
    for (const r of c.rules) lines.push(`    • ${r}`);
  }
  if (Array.isArray(c.examples) && c.examples.length) {
    lines.push(`  Examples:`);
    for (const ex of c.examples) {
      if (typeof ex === 'string') lines.push(`    ‣ ${ex}`);
      else {
        const kv = Object.entries(ex).map(([k, v]) => `${k}: ${v}`).join(' — ');
        lines.push(`    ‣ ${kv}`);
      }
    }
  }
  if (Array.isArray(c.relationships)) {
    for (const rel of c.relationships) {
      lines.push(`\n  <b>${rel.term}</b>: ${rel.definition}`);
      if (rel.example) lines.push(`    e.g. ${rel.example}`);
      if (rel.test) lines.push(`    test: ${rel.test}`);
      if (rel.recognition) lines.push(`    recognition: ${rel.recognition}`);
      if (rel.separation) lines.push(`    separation: ${rel.separation}`);
    }
  }
  if (Array.isArray(c.conformation)) {
    for (const cf of c.conformation) {
      lines.push(`  — ${cf.type}: ${cf.detail}`);
      if (cf.diagram) lines.push(`    diagram: ${cf.diagram}`);
      if (cf.axialEquatorial) lines.push(`    ${cf.axialEquatorial}`);
    }
  }
  if (c.fischer) lines.push(`  Fischer: ${c.fischer}`);
  if (c.opticalRotation) lines.push(`  Optical rotation: ${c.opticalRotation}`);
  if (c.resolutionMethods) lines.push(`  Resolution: ${c.resolutionMethods}`);
  if (c.identificationSteps) {
    lines.push(`  How to find stereocenters:`);
    for (const s of c.identificationSteps) lines.push(`    • ${s}`);
  }
  if (Array.isArray(c.rules) === false && c.rules && typeof c.rules === 'object') {
    // already handled
  }
  if (c.maxIsomers) lines.push(`  Max isomers: ${c.maxIsomers}`);
  return lines.join('\n');
}

/**
 * Stereochemistry reference — CIP R/S, E/Z, chirality, meso, enantiomers,
 * diastereomers, conformations (Newman, chair, Fischer).
 *
 * @param {string} [query] - e.g. "R/S", "R S", "CIP", "E/Z", "chiral",
 *   "enantiomer", "meso", "racemic", "Fischer", "Newman", "chair".
 *   Empty → full overview.
 * @returns {string}
 */
function getStereochemistry(query) {
  const q = _norm(query);
  const data = _stereoData();
  const concepts = Array.isArray(data.concepts) ? data.concepts : [];
  const qr = data.quickReference || {};

  if (!concepts.length) {
    return (
      _header('Stereochemistry — Overview', '🔷') +
      `Chiral center: sp³ C with 4 different groups → non-superimposable mirror images.\n` +
      `R/S via CIP: rank by atomic number, put lowest to back, 1→2→3 clockwise=R.\n` +
      `E/Z for C=C: rank each carbon, both high same side=Z, opposite=E.\n` +
      `Enantiomers mirror images (optical ±), diastereomers not mirrors (different properties), meso achiral despite stereocenters (internal plane).\n`
    );
  }

  const isOverview = !q || q === 'overview' || q === 'all' || q === 'stereo' || q === 'stereochemistry';

  if (isOverview) {
    let out = _header('Stereochemistry — Complete Reference', '🔷');
    out += `Core idea: <b>3-D arrangement matters</b>. Same connectivity, different spatial arrangement → different properties, especially in biology (enzymes are chiral!).\n`;
    out += _sep();
    for (const c of concepts) {
      out += _formatStereoConcept(c) + '\n' + _sep();
    }
    out += _subHeader('Quick-reference mnemonics');
    for (const [k, v] of Object.entries(qr)) {
      out += `  • <b>${k}</b>: ${v}\n`;
    }
    out += _subHeader('Exam checklist for assigning R/S');
    out += _bullet([
      '1. Identify stereocenter (4 different groups, not just first atom — go out by CIP).',
      '2. Rank 1→4 by atomic number (duplicate bonds: C=O → C bonded to O,O).',
      '3. Rotate so #4 is on dashed bond (back). If #4 is wedged, swap two groups and flip final answer.',
      '4. Trace 1→2→3: clockwise = R, counterclockwise = S.',
      'Example: CHFClBr → Br(35) > Cl(17) > F(9) > H(1); with H back, Br→Cl→F clockwise = R.',
    ]);
    out += _subHeader('E/Z checklist');
    out += _bullet([
      '1. For each C of C=C, rank its two groups by CIP.',
      '2. Locate the #1 on left C and #1 on right C.',
      '3. Same side (both up or both down) = Z (zusammen); opposite = E (entgegen).',
      'Example: 2-butene CH3CH=CHCH3: CH3>H on each side → both CH3 same side = Z (cis).',
    ]);
    out += _subHeader('Chirality quick tests');
    out += _bullet([
      'Molecule chiral? → has stereocenter AND no internal plane of symmetry.',
      'Enantiomers: mirror, opposite rotation, identical NMR/IR in achiral environment.',
      'Diastereomers: non-mirror, different physical properties, separable.',
      'Racemic 1:1 mix optically inactive (rotations cancel); resolve via chiral agent or chromatography.',
      'R/S does NOT predict +/- rotation (experimental); D/L is Fischer convention unrelated to R/S or +/-.',
    ]);
    out += `\n<i>Filter e.g. getStereochemistry("R/S"), "E/Z", "chiral", "meso", "enantiomer".</i>`;
    return out;
  }

  // Aliases mapping
  let effectiveQ = q;
  if (q === 'rs' || q === 'r/s' || q === 'r s' || q === 'cip' || q.includes('cahn')) effectiveQ = 'rs';
  else if (q === 'ez' || q === 'e/z' || q === 'e z' || q === 'cis trans' || q === 'cistrans') effectiveQ = 'ez';
  else if (q.includes('enantiomer')) effectiveQ = 'enantiomer-diastereomer';
  else if (q.includes('diastereomer')) effectiveQ = 'enantiomer-diastereomer';
  else if (q.includes('meso')) effectiveQ = 'enantiomer-diastereomer';
  else if (q.includes('racemic') || q.includes('racemate')) effectiveQ = 'enantiomer-diastereomer';

  const strictStereoIds = ['rs', 'ez', 'enantiomer-diastereomer'];
  const hits = concepts.filter((c) => {
    if (strictStereoIds.includes(effectiveQ)) {
      return c.id === effectiveQ;
    }
    // For "chiral" we also prefer strictly chirality + enantiomer concepts only, not every mention
    if (q === 'chiral' || q === 'chirality' || q === 'stereocenter' || q === 'chiral center') {
      return c.id === 'chirality' || c.id === 'enantiomer-diastereomer';
    }
    const hay = [c.id, c.name, c.definition, ...(c.criteria || []), ...(c.rules || []), c.fischer, c.opticalRotation, c.resolutionMethods, ...(c.relationships ? c.relationships.flatMap((r) => [r.term, r.definition, r.example]) : []), ...(c.conformation ? c.conformation.flatMap((x) => [x.type, x.detail]) : [])].join(' ').toLowerCase();
    return hay.includes(effectiveQ) || hay.includes(q);
  });

  if (hits.length === 0) {
    return (
      _header('Stereochemistry — Search', '🔷') +
      `No match for "<b>${_esc(query)}</b>". Concepts: ${concepts.map((c) => c.name).join(', ')}.\n` +
      `Try: "R/S" or "CIP", "E/Z", "chiral", "enantiomer", "meso", "racemic", "Fischer", "Newman", "chair".\n` +
      `Or call with no argument for the full illustrated reference.`
    );
  }

  let out = _header(`Stereochemistry — ${hits.map((h) => h.name).join(' + ')}`, '🔷');
  out += `Filter: "<b>${_esc(query)}</b>" → ${hits.length} hit(s).\n\n`;
  for (const h of hits) out += _formatStereoConcept(h) + '\n' + _sep();

  // Add quick reference snippet for single hits
  if (hits.length === 1 && qr) {
    if (hits[0].id === 'rs') {
      out += _subHeader('R/S mnemonic');
      out += `  ${qr.rsAssignmentMnemonic || 'CIP → lowest to back → 1→2→3 clockwise=R'}\n`;
    } else if (hits[0].id === 'ez') {
      out += _subHeader('E/Z mnemonic');
      out += `  ${qr.ezMnemonic || 'Z zusammen (together), E entgegen (opposite)'}\n`;
    }
  }
  return out;
}

const getStereochemistryInfo = getStereochemistry;
const stereochemistry = getStereochemistry;

// ---------------------------------------------------------------------------
// 5. SPECTROSCOPY & ANALYSIS
// ---------------------------------------------------------------------------

function _spectroscopyData() {
  return _loadJson('data/organic-spectroscopy.json', { ir: { tables: [] }, nmr: { hNmrShifts: [] }, massSpec: { commonFragmentations: [] } });
}

function _formatIrTable(rows, filter) {
  const lines = [];
  const queryInfo = typeof filter === 'string' ? _normalizeSpectroscopyQuery(filter) : null;
  for (const r of rows) {
    if (queryInfo && !_spectroscopyMatch([r.group, r.frequency, r.notes].join(' '), queryInfo)) continue;
    lines.push(`  <b>${r.group}</b> — ${r.frequency} cm⁻¹ (${r.intensity}) — ${r.notes}`);
  }
  return lines.length ? lines.join('\n') : '  (no IR bands matched filter)';
}

function _formatNmrShifts(shifts, filter) {
  const lines = [];
  const queryInfo = typeof filter === 'string' ? _normalizeSpectroscopyQuery(filter) : null;
  for (const s of shifts) {
    if (queryInfo && !_spectroscopyMatch([s.type, s.delta, s.example, s.notes].join(' '), queryInfo)) continue;
    lines.push(`  <b>${s.type}</b> δ ${s.delta} — e.g. ${s.example || s.notes} — ${s.notes || ''}`);
  }
  return lines.length ? lines.join('\n') : '  (no NMR shifts matched filter)';
}


/**
 * Spectroscopy & analysis — IR frequencies, ¹H/¹³C NMR chemical shifts,
 * splitting (n+1), coupling constants, and MS fragmentation patterns.
 * Includes interpretation strategy and a worked combined problem.
 *
 * @param {string} [query] - e.g. "IR", "infrared", "NMR", "proton", "C13",
 *   "carbon-13", "MS", "mass spec", "fragmentation", "O-H", "carbonyl",
 *   "1700", "3300". Empty → full spectroscopy guide.
 * @returns {string}
 */
function getSpectroscopy(query) {
  const q = _norm(query);
  const data = _spectroscopyData();
  const ir = data.ir || {};
  const nmr = data.nmr || {};
  const ms = data.massSpec || {};
  const isOverview = !q || q === 'overview' || q === 'all' || q === 'spectroscopy' || q === 'analysis';

  if (isOverview) {
    let out = _header('Spectroscopy & Analysis — Complete Guide', '🔬');
    out += `Structure elucidation uses <b>IR</b> (functional groups), <b>NMR</b> (carbon skeleton + H environment), <b>MS</b> (mass & fragments). Combined they give an unambiguous assignment.\n`;
    out += _sep();
    // IR
    out += _subHeader(ir.title || 'Infrared (IR)');
    if (ir.principle) out += `Principle: ${ir.principle}\n\n`;
    out += `Key bands (cm⁻¹):\n`;
    out += _formatIrTable(ir.tables || []) + '\n';
    if (Array.isArray(ir.interpretationTips)) {
      out += `\nInterpretation tips:\n` + _bullet(ir.interpretationTips) + '\n';
    }
    out += _sep();
    // NMR
    out += _subHeader(nmr.title || 'Nuclear Magnetic Resonance (NMR)');
    if (nmr.principle) out += `Principle: ${nmr.principle}\n\n`;
    out += `¹H NMR chemical shifts (ppm, TMS 0):\n`;
    out += _formatNmrShifts(nmr.hNmrShifts || []) + '\n';
    if (Array.isArray(nmr.cNmrShifts) && nmr.cNmrShifts.length) {
      out += `\n¹³C NMR shifts:\n`;
      for (const c of nmr.cNmrShifts) out += `  <b>${c.type}</b> δ ${c.delta} — ${c.notes}\n`;
    }
    if (nmr.splittingRules) out += `\nSplitting: ${nmr.splittingRules}\n`;
    if (nmr.deuterium) out += `D2O test: ${nmr.deuterium}\n`;
    out += _sep();
    // MS
    out += _subHeader(ms.title || 'Mass Spectrometry (MS)');
    if (ms.principle) out += `Principle: ${ms.principle}\n\n`;
    if (Array.isArray(ms.commonFragmentations)) {
      out += `Common fragmentations:\n`;
      for (const f of ms.commonFragmentations) {
        out += `  <b>${f.type}</b>: ${f.description}\n`;
        if (f.examples) out += `    e.g. ${f.examples.join('; ')}\n`;
        if (f.example) out += `    e.g. ${f.example}\n`;
        if (f.tip) out += `    tip: ${f.tip}\n`;
        if (f.condition) out += `    condition: ${f.condition}\n`;
      }
    }
    if (Array.isArray(ms.interpretationSteps)) {
      out += `\nMS interpretation steps:\n` + _numbered(ms.interpretationSteps) + '\n';
    }
    if (data.combinedProblemExample) {
      const cp = data.combinedProblemExample;
      out += _sep();
      out += _subHeader('Worked combined spectroscopy problem');
      out += `  <b>Unknown</b>: ${cp.unknown}\n`;
      out += `  <b>Solution</b>: ${cp.solution}\n`;
    }
    out += _sep();
    out += _subHeader('Integrated workflow (how to solve an unknown)');
    out += _numbered([
      'Molecular formula from MS (M⁺·) + elemental analysis; degree of unsaturation DU = C - H/2 + N/2 +1 (halogen as H).',
      'IR: identify functional groups present/absent (C=O? broad O-H? alkyne 3300? alkene 1650? aromatic 1500?).',
      '¹H NMR: count signals = unique H environments; integration = count of H per signal; splitting (n+1) tells neighbours; chemical shift tells type.',
      '¹³C NMR: count carbons (more accurate than ¹H); DEPT tells CH3/CH2/CH/Cq; carbonyl δ170-215 distinctive.',
      'MS fragments: confirm substructures (m/z 91 benzyl, 43 acetyl, 31 CH2OH, M-18 H2O).',
      'Assemble puzzle: propose structure, check DU + all spectra consistent, consider isomers.',
    ]);
    out += `\n<i>Filter e.g. getSpectroscopy("IR carbonyl"), "NMR aldehyde", "MS 91", "3300".</i>`;
    return out;
  }

  // Filtered mode: decide which subsection to show based on query keywords
  const qLower = q;
  const isGenericIR = qLower === 'ir' || qLower === 'infrared' || qLower === 'ir spectroscopy';
  const isGenericNMR = qLower === 'nmr' || qLower === '1h nmr' || qLower === 'proton nmr' || qLower === '13c nmr' || qLower === 'chemical shift';
  const isGenericMS = qLower === 'ms' || qLower === 'mass' || qLower === 'mass spec' || qLower === 'mass spectrometry';
  const wantIR = isGenericIR || ['ir', 'infrared', 'frequency', 'cm', 'carbonyl', 'oh', 'o-h', '3300', '1710', '1735', 'alkyne', 'nitrile', 'fingerprint'].some((k) => qLower.includes(k));
  const wantNMR = isGenericNMR || ['nmr', 'proton', '1h', '13c', 'carbon', 'chemical shift', 'ppm', 'delta', 'coupling', 'splitting', 'aldehyde 9', 'aromatic 7', 'acetyl 2.1'].some((k) => qLower.includes(k));
  const wantMS = isGenericMS || ['ms', 'mass', 'fragment', 'm/z', 'molecular ion', '91', 'mclafferty', 'tropylium', 'isotope'].some((k) => qLower.includes(k));

  // If no specific wants detected, search all
  let out = _header(`Spectroscopy — Search "${_esc(query)}"`, '🔬');

  if ((wantIR || (!wantIR && !wantNMR && !wantMS)) && ir.tables) {
    out += _subHeader('IR matches');
    const irFilter = isGenericIR ? null : query;
    out += _formatIrTable(ir.tables || [], irFilter) + '\n\n';
    // If query looks like a number e.g. 1700, also give assignment tip
    if (/\d{3,4}/.test(qLower)) {
      out += `  Tip: Strong band near ${qLower.match(/\d{3,4}/)[0]} cm⁻¹ — compare to C=O (1700-1850), C≡C/N (2100-2260), O-H (3200-3650), C-H (<3000 alkyl, >3000 vinyl/aromatic).\n\n`;
    }
  }
  if ((wantNMR || (!wantIR && !wantNMR && !wantMS)) && nmr.hNmrShifts) {
    out += _subHeader('¹H NMR matches');
    const nmrFilter = isGenericNMR ? null : query;
    out += _formatNmrShifts(nmr.hNmrShifts || [], nmrFilter) + '\n';
    if (Array.isArray(nmr.cNmrShifts)) {
      const cFilter = isGenericNMR ? null : query;
      const cInfo = cFilter == null ? null : _normalizeSpectroscopyQuery(cFilter);
      const cMatches = cInfo == null ? nmr.cNmrShifts : nmr.cNmrShifts.filter((c) => _spectroscopyMatch([c.type, c.delta, c.notes].join(' '), cInfo));
      if (cMatches.length) {
        out += `\n¹³C NMR matches:\n`;
        for (const c of cMatches) out += `  <b>${c.type}</b> δ ${c.delta} — ${c.notes}\n`;
      }
    }
    out += '\n';
  }
  if ((wantMS || (!wantIR && !wantNMR && !wantMS)) && ms.commonFragmentations) {
    const msFilter = isGenericMS ? null : query;
    const msInfo = msFilter == null ? null : _normalizeSpectroscopyQuery(msFilter);
    const msHits = msInfo == null ? ms.commonFragmentations : ms.commonFragmentations.filter((f) => _spectroscopyMatch([f.type, f.description, ...(f.examples || []), f.example, f.tip].join(' '), msInfo));
    if (msHits.length) {
      out += _subHeader('MS matches');
      for (const f of msHits) {
        out += `  <b>${f.type}</b>: ${f.description}\n`;
        if (f.examples) out += `    e.g. ${f.examples.join('; ')}\n`;
        if (f.example) out += `    e.g. ${f.example}\n`;
      }
      out += '\n';
    }
  }

  if (out.trim() === _header(`Spectroscopy — Search "${_esc(query)}"`, '🔬').trim()) {
    out += `No direct spectrum match for "<b>${_esc(query)}</b>".\n`;
    out += `Try keywords: IR, carbonyl, 1710, O-H, alkyne, NMR, aldehyde, aromatic, MS, fragmentation, 91.\n`;
    out += `Or call with no argument for the complete IR/NMR/MS tables and worked problem.\n`;
  } else {
    out += _sep() + `<i>Call with no argument for the full integrated workflow and tables.</i>`;
  }
  return out;
}

const getSpectroscopyInfo = getSpectroscopy;
const spectroscopy = getSpectroscopy;
const getAnalysis = getSpectroscopy;

// ---------------------------------------------------------------------------
// 6. POLYMERS & BIOMOLECULES (bonus section — satisfies OR alternative)
// ---------------------------------------------------------------------------

function _polymersData() {
  return _loadJson('data/organic-polymers-biomolecules.json', { polymers: {}, biomolecules: {} });
}

function _formatPolymerBlock(p) {
  const lines = [];
  if (p.type) lines.push(`<b>${p.type}</b>`);
  if (p.mechanism) lines.push(`  Mechanism: ${p.mechanism}`);
  if (p.initiators) lines.push(`  Initiators: ${p.initiators}`);
  if (Array.isArray(p.examples) && p.examples.length) {
    lines.push(`  Examples:`);
    for (const ex of p.examples) {
      const mon = ex.monomer || ex.monomers || '';
      const poly = ex.polymer || '';
      const uses = ex.uses ? ` — uses: ${ex.uses}` : '';
      const variants = ex.variants ? ` (${ex.variants})` : '';
      const tact = ex.tacticity ? ` tacticity: ${ex.tacticity}` : '';
      const notes = ex.notes ? ` — ${ex.notes}` : '';
      lines.push(`    ‣ ${mon}${mon && poly ? ' → ' : ''}${poly}${variants}${tact}${uses}${notes}`);
      if (ex.reactionType) lines.push(`       reaction: ${ex.reactionType}`);
    }
  }
  return lines.join('\n');
}

/**
 * Polymers & biomolecules — addition vs condensation polymers, plus
 * carbohydrates, lipids, proteins and nucleic acids.  Covers monomers,
 * linkages, structures (helix/sheet/bilayer/double-helix) and everyday tests.
 *
 * @param {string} [query] - e.g. "polymer", "addition", "condensation",
 *   "PET", "nylon", "PE", "carbohydrate", "starch", "cellulose",
 *   "lipid", "triglyceride", "protein", "amino acid", "nucleic", "DNA".
 *   Empty → full overview of both polymers and biomolecules.
 * @returns {string}
 */
function getPolymersBiomolecules(query) {
  const q = _norm(query);
  const data = _polymersData();
  const polymers = data.polymers || {};
  const bio = data.biomolecules || {};
  const isOverview = !q || q === 'overview' || q === 'all' || q === 'polymers' || q === 'biomolecules' || q === 'biomolecule';

  if (isOverview) {
    let out = _header('Polymers & Biomolecules — Complete Reference', '🧫');
    out += `Polymers: synthetic macromolecules (plastics, fibers, rubbers) from <b>addition</b> (chain-growth, C=C → chain, no by-product) or <b>condensation</b> (step-growth, functional groups → chain + H2O).\n`;
    out += `Biomolecules: natural polymers/monomers — carbohydrates, lipids, proteins, nucleic acids — built by the same condensation (dehydration) and broken by hydrolysis.\n`;
    out += _sep();
    // Polymers
    out += _subHeader('A. Synthetic Polymers');
    if (polymers.introduction) out += polymers.introduction + '\n\n';
    if (Array.isArray(polymers.classification)) {
      for (const cls of polymers.classification) out += _formatPolymerBlock(cls) + '\n' + _sep();
    }
    if (polymers.thermoplasticVsThermoset) {
      const t = polymers.thermoplasticVsThermoset;
      out += _subHeader('Thermoplastic vs Thermoset vs Elastomer');
      out += `  Thermoplastic: ${t.thermoplastic}\n`;
      out += `  Thermoset: ${t.thermoset}\n`;
      out += `  Elastomer: ${t.elastomer}\n` + _sep();
    }
    if (Array.isArray(polymers.propertiesAndTuning)) {
      out += _subHeader('Property tuning');
      out += _bullet(polymers.propertiesAndTuning) + '\n' + _sep();
    }
    if (polymers.environment) out += `Environment: ${polymers.environment}\n` + _sep();

    // Biomolecules
    out += _subHeader('B. Biomolecules');
    if (bio.introduction) out += bio.introduction + '\n\n';
    // Carbs
    if (bio.carbohydrates) {
      const c = bio.carbohydrates;
      out += `<b>Carbohydrates</b> — ${c.definition}\n`;
      if (Array.isArray(c.monosaccharides)) {
        out += `  Monosaccharides:\n`;
        for (const m of c.monosaccharides) out += `    ‣ <b>${m.name}</b> ${m.formula || ''} — ${m.structure}${m.stereochem ? ` ${m.stereochem}` : ''}${m.notes ? ` ${m.notes}` : ''}\n`;
      }
      if (c.glycosidicBond) out += `  Glycosidic bond: ${c.glycosidicBond}\n`;
      if (Array.isArray(c.disaccharides)) {
        out += `  Disaccharides:\n`;
        for (const d of c.disaccharides) out += `    ‣ <b>${d.name}</b> — ${d.structure}${d.uses ? ` (${d.uses})` : ''}\n`;
      }
      if (Array.isArray(c.polysaccharides)) {
        out += `  Polysaccharides:\n`;
        for (const p of c.polysaccharides) out += `    ‣ <b>${p.name}</b> — ${p.structure} — ${p.function}${p.notes ? ` (${p.notes})` : ''}\n`;
      }
      if (Array.isArray(c.tests)) out += `  Tests: ${c.tests.join('; ')}\n`;
      out += '\n';
    }
    // Lipids
    if (bio.lipids) {
      const l = bio.lipids;
      out += `<b>Lipids</b> — ${l.definition}\n`;
      if (Array.isArray(l.fattyAcids)) {
        out += `  Fatty acids:\n`;
        for (const f of l.fattyAcids) {
          out += `    ‣ <b>${f.name}</b> — ${f.structure}`;
          if (f.examples) out += ` (${f.examples})`;
          if (f.transFat) out += ` Trans: ${f.transFat}`;
          out += '\n';
        }
      }
      if (l.triglycerides) out += `  Triglycerides: ${l.triglycerides}\n`;
      if (l.phospholipids) out += `  Phospholipids: ${l.phospholipids}\n`;
      if (l.steroids) out += `  Steroids: ${l.steroids}\n`;
      if (l.waxes) out += `  Waxes: ${l.waxes}\n\n`;
    }
    // Proteins
    if (bio.proteins) {
      const pr = bio.proteins;
      out += `<b>Proteins (amino acids & peptides)</b> — ${pr.definition}\n`;
      if (pr.aminoAcids) {
        out += `  ${pr.aminoAcids.general}\n`;
        out += `  Peptide bond: ${pr.aminoAcids.peptideBond}\n`;
        out += `  Isoelectric pI: ${pr.aminoAcids.isoelectricPoint}\n`;
      }
      if (Array.isArray(pr.structure)) {
        for (const lvl of pr.structure) {
          out += `  <b>${lvl.level}</b>: ${lvl.detail}`;
          if (lvl.stabilized) out += ` (${lvl.stabilized})`;
          if (lvl.example) out += ` (${lvl.example})`;
          out += '\n';
        }
      }
      if (pr.enzymes) out += `  Enzymes: ${pr.enzymes}\n`;
      if (Array.isArray(pr.tests)) out += `  Tests: ${pr.tests.join('; ')}\n`;
      out += '\n';
    }
    // Nucleic acids
    if (bio.nucleicAcids) {
      const n = bio.nucleicAcids;
      out += `<b>Nucleic Acids</b> — ${n.definition}\n`;
      if (n.nucleotide) out += `  Nucleotide: ${n.nucleotide}\n`;
      if (Array.isArray(n.bases)) out += `  Bases: ${n.bases.join(', ')}\n`;
      if (n.dna) {
        out += `  DNA: ${n.dna.structure}\n`;
        if (n.dna.denaturation) out += `    Denaturation: ${n.dna.denaturation}\n`;
        if (n.dna.packaging) out += `    Packaging: ${n.dna.packaging}\n`;
      }
      if (n.rna) {
        out += `  RNA: ${Array.isArray(n.rna.types) ? n.rna.types.join('; ') : ''} — ${n.rna.differences || ''}\n`;
      }
      if (n.centralDogma) out += `  Central dogma: ${n.centralDogma}\n`;
      if (Array.isArray(n.tests)) out += `  Tests: ${n.tests.join('; ')}\n`;
      out += '\n';
    }
    if (bio.metabolismOverview) out += `Metabolism: ${bio.metabolismOverview}\n`;
    if (bio.appliedNotes) out += `Applied: ${bio.appliedNotes}\n`;
    out += `\n<i>Filter e.g. getPolymersBiomolecules("PET"), "nylon", "addition", "carbohydrate", "starch", "protein", "DNA".</i>`;
    return out;
  }

  // Filtered
  const qLower = q;

  // Try polymer search first
  let hitsPolymer = [];
  if (polymers.classification) {
    const allPolymerText = polymers.classification.map((c) => _formatPolymerBlock(c));
    // crude match
    hitsPolymer = polymers.classification.filter((c) =>
      _contains(JSON.stringify(c).toLowerCase(), qLower)
    );
  }

  // Biomolecule search
  const bioString = JSON.stringify(bio).toLowerCase();
  const wantBio = ['carbohydrate', 'carbo', 'sugar', 'glucose', 'starch', 'cellulose', 'glycogen', 'lipid', 'fat', 'triglyceride', 'phospholipid', 'steroid', 'cholesterol', 'protein', 'amino', 'peptide', 'enzyme', 'nucleic', 'dna', 'rna', 'nucleotide', 'biomolecule'].some((k) => qLower.includes(k));
  const wantPolym = ['polymer', 'poly', 'addition', 'condensation', 'pet', 'nylon', 'pe', 'ps', 'pvc', 'pp', 'teflon', 'ptfe', 'monomer', 'thermoplastic', 'thermoset', 'elastomer'].some((k) => qLower.includes(k));

  // If either category requested, filter output
  if (hitsPolymer.length > 0) {
    let out = _header(`Polymers — Search "${query}"`, '🧫');
    for (const h of hitsPolymer) out += _formatPolymerBlock(h) + '\n' + _sep();
    return out;
  }

  if (wantBio || bioString.includes(qLower)) {
    let out = _header(`Biomolecules — Search "${query}"`, '🧫');
    // Return targeted sub-section based on keyword
    if (qLower.includes('carbo') || qLower.includes('sugar') || qLower.includes('starch') || qLower.includes('cellulose') || qLower.includes('glycogen') || qLower.includes('glucose')) {
      const c = bio.carbohydrates || {};
      out += `<b>Carbohydrates</b> — ${c.definition || ''}\n`;
      if (c.glycosidicBond) out += `Glycosidic: ${c.glycosidicBond}\n`;
      if (c.polysaccharides) for (const p of c.polysaccharides) if (_contains(JSON.stringify(p), qLower) || !qLower.includes('poly')) out += `  • ${p.name}: ${p.structure} — ${p.function}\n`;
      if (c.monosaccharides) for (const m of c.monosaccharides) out += `  • ${m.name}: ${m.structure}\n`;
      return out + `\n<i>Also see starch/cellulose/glycogen differences: α-1,4 digestible vs β-1,4 indigestible.</i>`;
    }
    if (qLower.includes('lipid') || qLower.includes('fat') || qLower.includes('triglyceride') || qLower.includes('phospho') || qLower.includes('cholesterol') || qLower.includes('steroid')) {
      const l = bio.lipids || {};
      out += `<b>Lipids</b> — ${l.definition || ''}\n`;
      if (l.triglycerides) out += `Triglyceride: ${l.triglycerides}\n`;
      if (l.phospholipids) out += `Phospholipid: ${l.phospholipids}\n`;
      if (l.steroids) out += `Steroids: ${l.steroids}\n`;
      if (Array.isArray(l.fattyAcids)) for (const f of l.fattyAcids) out += `  • ${f.name}: ${f.structure}\n`;
      return out;
    }
    if (qLower.includes('protein') || qLower.includes('amino') || qLower.includes('peptide') || qLower.includes('enzyme')) {
      const pr = bio.proteins || {};
      out += `<b>Proteins</b> — ${pr.definition || ''}\n`;
      if (pr.aminoAcids) out += `${pr.aminoAcids.general}\n${pr.aminoAcids.peptideBond}\n`;
      if (Array.isArray(pr.structure)) for (const lvl of pr.structure) out += `  • ${lvl.level}: ${lvl.detail}\n`;
      if (pr.enzymes) out += `Enzymes: ${pr.enzymes}\n`;
      return out;
    }
    if (qLower.includes('nucleic') || qLower.includes('dna') || qLower.includes('rna') || qLower.includes('nucleotide') || qLower.includes('base')) {
      const n = bio.nucleicAcids || {};
      out += `<b>Nucleic Acids</b> — ${n.definition || ''}\n`;
      if (n.nucleotide) out += `${n.nucleotide}\n`;
      if (n.dna) out += `DNA: ${n.dna.structure}\n`;
      if (n.rna) out += `RNA: ${n.rna.differences || ''}\n`;
      if (n.centralDogma) out += `Central dogma: ${n.centralDogma}\n`;
      return out;
    }
    // Fallback bio overview if keyword generic
    out += `Matched biomolecule term "<b>${_esc(query)}</b>". Use a specific filter: carbohydrate, lipid, protein, DNA, starch, cellulose, etc., or call with no argument for the full polymers+biomolecules reference.\n`;
    return out;
  }

  // No hits anywhere
  return (
    _header(`Polymers & Biomolecules — Search`, '🧫') +
    `No match for "<b>${_esc(query)}</b>".\n` +
    `Polymer keywords: PET, nylon, PE, PP, PVC, PS, PTFE, addition, condensation, thermoplastic.\n` +
    `Biomolecule keywords: carbohydrate (glucose, starch, cellulose, glycogen), lipid (triglyceride, phospholipid, steroid), protein (amino acid, enzyme), nucleic acid (DNA, RNA).\n` +
    `Or call with no argument for the complete reference covering both polymers and all biomolecules.`
  );
}

const getPolymers = getPolymersBiomolecules;
const getBiomolecules = getPolymersBiomolecules;
const polymersBiomolecules = getPolymersBiomolecules;

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

/**
 * Generic organic dispatcher — routes a free-form query to the most relevant section(s).
 * Useful for the bot handler or LLM: `organic("SN1 tert-butyl")` → SN1 card.
 *
 * @param {string} query - Any organic chemistry term or question.
 * @returns {string} Formatted string from the best matching section.
 */
function organic(query) {
  const q = _norm(query);
  if (!q) return getHydrocarbons();
  // Heuristic routing by keywords
  if (['alkane', 'alkene', 'alkyne', 'benzene', 'aromatic', 'hydrocarbon', 'butane', 'ethene', 'ethyne', 'cyclo'].some((k) => q.includes(k))) {
    return getHydrocarbons(query);
  }
  if (['alcohol', 'ether', 'aldehyde', 'ketone', 'carboxyl', 'ester', 'amide', 'amine', 'phenol', 'thiol', 'nitrile', 'halide', 'functional'].some((k) => q.includes(k))) {
    return getFunctionalGroups(query);
  }
  if (['sn1', 'sn2', 'e1', 'e2', 'substitution', 'elimination', 'addition', 'markovnikov', 'mecahnism', 'mechanism', 'carbocation', 'radical', 'eas', 'friedel', 'grignard', 'wittig', 'aldol'].some((k) => q.includes(k))) {
    return getReactionMechanisms(query);
  }
  if (['r/s', 'r s', 'cip', 'e/z', 'e z', 'chiral', 'stereo', 'enantiomer', 'diastereomer', 'meso', 'racemic', 'fischer', 'newman', 'chair', 'anomer', 'epimer'].some((k) => q.includes(k))) {
    return getStereochemistry(query);
  }
  if (['ir', 'nmr', 'mass', 'fragment', 'ppm', 'carbonyl ir', 'spectroscopy', 'analysis', 'coupling', 'mclafferty', 'tropylium'].some((k) => q.includes(k))) {
    return getSpectroscopy(query);
  }
  if (['polymer', 'pet', 'nylon', 'poly', 'plastic', 'monomer', 'carbohydrate', 'starch', 'cellulose', 'lipid', 'protein', 'dna', 'rna', 'biomolecule', 'enzyme', 'triglyceride', 'nucleic'].some((k) => q.includes(k))) {
    return getPolymersBiomolecules(query);
  }
  // Formula-aware routing — detects organic formulas like "C2H5OH", "CH3COOH", "C6H6"
  // and returns an enriched functional-group/hydrocarbon card instead of the generic hub.
  // Placed after keyword checks so "SN1" (which also looks formula-like) is correctly
  // handled by the mechanism keyword route above.
  const formulaRes = _formulaOrganicResponse(String(query || '').trim());
  if (formulaRes) return formulaRes;
  // Default: give a hub with hints for all sections
  let out = _header('Organic Chemistry — Hub', '🧪');
  out += `No specific section matched "<b>${_esc(query)}</b>". Choose a section:\n\n`;
  out += _bullet([
    `<b>1. Hydrocarbons</b> — hydrocarbons("alkene"), hydrocarbons("aromatic")`,
    `<b>2. Functional Groups</b> — functionalGroups("ketone"), functionalGroups("carboxylic acid")`,
    `<b>3. Reaction Mechanisms</b> — reactionMechanisms("SN1"), reactionMechanisms("E2"), reactionMechanisms("EAS")`,
    `<b>4. Stereochemistry</b> — stereochemistry("R/S"), stereochemistry("meso")`,
    `<b>5. Spectroscopy</b> — spectroscopy("IR carbonyl"), spectroscopy("NMR aldehyde"), spectroscopy("MS")`,
    `<b>6. Polymers & Biomolecules</b> — polymersBiomolecules("PET"), polymersBiomolecules("protein"), polymersBiomolecules("DNA")`,
  ]);
  out += `\nOr call hub functions with no argument for the full overview of that section.\n`;
  out += `Example: <code>getHydrocarbons()</code> → full hydrocarbon table; <code>getSpectroscopy()</code> → IR/NMR/MS all.\n`;
  return out;
}

/**
 * Section-aware alias for the generic dispatcher.
 * @param {string} section - One of: hydrocarbons, functionalGroups, mechanisms, stereochemistry, spectroscopy, polymers
 * @param {string} [query] - Sub-query within that section
 * @returns {string}
 */
function getOrganicInfo(section, query) {
  const s = _norm(section);
  // Formula shortcut — ensures dispatcher satisfies "C2H5OH" → alcohol and similar.
  // Handles both single-arg (section is formula) and query-as-formula cases before
  // falling through to keyword-based section routing.
  const rawSec = String(section || '').trim();
  const rawQry = query ? String(query).trim() : '';
  if (rawSec && !rawQry) {
    const fr = _formulaOrganicResponse(rawSec);
    if (fr) return fr;
  }
  if (rawQry) {
    const frQ = _formulaOrganicResponse(rawQry);
    if (frQ) {
      // If section is a known category, respect it (e.g., functional + C2H5OH already handled above)
      // Otherwise the formula enrichment is the most useful answer.
      const isKnown = ['hydro', 'function', 'mechan', 'reaction', 'stereo', 'spect', 'analy', 'ir', 'nmr', 'ms', 'polym', 'biomo', 'carbo', 'lipid', 'protein', 'dna', 'nucleic'].some((p) => s.startsWith(p));
      if (!isKnown) return frQ;
    }
  }
  if (s.startsWith('hydro')) return getHydrocarbons(query);
  if (s.startsWith('function')) return getFunctionalGroups(query);
  if (s.startsWith('mechan') || s.startsWith('reaction')) return getReactionMechanisms(query);
  if (s.startsWith('stereo')) return getStereochemistry(query);
  if (s.startsWith('spect') || s.startsWith('analy') || s.startsWith('ir') || s.startsWith('nmr') || s.startsWith('ms')) return getSpectroscopy(query);
  if (s.startsWith('polym') || s.startsWith('biomo') || s.startsWith('carbo') || s.startsWith('lipid') || s.startsWith('protein') || s.startsWith('dna') || s.startsWith('nucleic')) return getPolymersBiomolecules(query);
  return organic(section + (query ? ' ' + query : ''));
}

// ---------------------------------------------------------------------------
// Handler wrappers — formula-aware aliases for bot handler (task spec)
// These ensure /organic C2H5OH gives DBE/mass, not just hub, while still
// delegating to the comprehensive JSON-backed references for conceptual queries.
// ---------------------------------------------------------------------------

function _calculateDBE(el) {
  const C = el.C || 0;
  const H = el.H || 0;
  const N = el.N || 0;
  const X = (el.F || 0) + (el.Cl || 0) + (el.Br || 0) + (el.I || 0);
  return C - (H + X) / 2 + N / 2 + 1;
}

function _isFormulaLike(s) {
  const t = String(s || '').trim();
  if (!t || t.includes(' ') || t.length > 30) return false;
  // Must look like chemical formula: starts with element symbol, contains only elements and numbers/brackets
  return /^[A-Z][A-Za-z0-9()\[\].·*+-]+$/.test(t) && /[A-Z]/.test(t);
}

/**
 * Internal helper — if raw looks like an organic formula (contains C) return an
 * enriched organic response (mass + DBE + best section). Returns null if not applicable.
 * Used by both `organic()` and `getOrganicInfo()` dispatchers to satisfy the
 * requirement that queries like "C2H5OH" route to the functional-group (alcohol) card
 * while "SN1" still routes to mechanisms via keyword checks.
 * Does NOT call `organic()` recursively — it directly delegates to section functions.
 * @param {string} rawInput
 * @returns {string|null}
 */
function _formulaOrganicResponse(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!_isFormulaLike(raw)) return null;
  try {
    const parser = _getParser();
    if (!parser.parseCompound) return null;
    const p = parser.parseCompound(raw);
    if (!p || !p.isValid || !p.elements || !p.elements.C) return null;
    const el = p.elements;
    let header = `🧪 <b>Organic Analysis — ${_esc(raw)}</b>\n\n`;
    try {
      if (parser.molecularWeight) {
        const mw = parser.molecularWeight(raw);
        header += `Molar mass: <b>${mw.weight.toFixed(3)} g/mol</b> (${Object.entries(el).map(([k, v]) => `${k}${v > 1 ? v : ''}`).join(' ')})\n`;
      }
    } catch (_) {}
    try {
      const dbe = _calculateDBE(el);
      const dbeDesc = dbe === 0 ? 'saturated (alkane, all sp³)' : dbe === 1 ? 'one unsaturation (C=C or ring)' : dbe >= 4 ? 'possible aromatic (≥4)' : 'unsaturated';
      header += `DBE (unsaturation): <b>${dbe}</b> — ${dbeDesc}\n`;
      const keys = Object.keys(el);
      const isHydroOnly = keys.every((k) => ['C', 'H'].includes(k));
      if (isHydroOnly) {
        if (dbe === 0) header += `Hydrocarbon: <b>alkane</b> CnH2n+2\n`;
        else if (dbe === 1) header += `Hydrocarbon: <b>alkene or cycloalkane</b> CnH2n\n`;
        else if (dbe === 2) header += `Hydrocarbon: <b>alkyne/diene</b> CnH2n-2\n`;
        else if (dbe === 4) header += `Hydrocarbon: <b>aromatic</b> (e.g., benzene C6H6)\n`;
      } else {
        header += `Organic — ${el.O ? 'O-containing' : el.N ? 'N-containing' : 'C-containing'}; DBE helps infer functional groups\n`;
      }
    } catch (_) {}
    header += `Composition: ${Object.entries(el).map(([k, v]) => `${k}${v > 1 ? v : ''}`).join(' ')}\n`;
    header += '\n' + _sep();
    let fgRes = null;
    try { fgRes = getFunctionalGroups(raw); } catch (_) {}
    const isFgHit = fgRes && !fgRes.includes('No exact match');
    let hcRes = null;
    try { hcRes = getHydrocarbons(raw); } catch (_) {}
    const isHcHit = hcRes && !hcRes.includes('No exact match');
    const hasHetero = Object.keys(el).some((k) => !['C', 'H'].includes(k));
    if (hasHetero && isFgHit) return header + fgRes;
    if (!hasHetero && isHcHit) return header + hcRes;
    if (isFgHit) return header + fgRes;
    if (isHcHit) return header + hcRes;
    if (hasHetero) {
      // Heuristic for heteroatoms where direct exampleFormula didn't match
      // e.g. "C2H5Cl" should map to halide, "CH3COOH" already hit but "C2H5Cl" needs fallback
      const upper = raw.toUpperCase();
      let hint = null;
      if (el.F || el.Cl || el.Br || el.I || upper.includes('CL') || upper.includes('BR')) {
        try { hint = getFunctionalGroups('halide'); } catch (_) {}
        if (hint && !hint.includes('No exact match')) return header + hint;
      }
      if ((el.O || upper.includes('OH')) && !el.N) {
        // generic O-containing saturated -> alcohol is most common for C2H5OH-style
        try { hint = getFunctionalGroups('alcohol'); } catch (_) {}
        if (hint && !hint.includes('No exact match')) return header + hint;
      }
      if (el.N) {
        try { hint = getFunctionalGroups('amine'); } catch (_) {}
        if (hint && !hint.includes('No exact match')) return header + hint;
      }
      let fallback = null;
      try { fallback = getFunctionalGroups(''); } catch (_) {}
      return header + (fallback || '');
    }
    return header + (hcRes || getHydrocarbons(''));
  } catch (_) {}
  return null;
}

function analyzeOrganic(query) {
  const q = String(query || '').trim();
  if (!q) return organic(q);
  // If it looks like a formula, provide formula-aware analysis then conceptual hub
  if (_isFormulaLike(q)) {
    try {
      const parser = _getParser();
      if (parser.parseCompound) {
        const p = parser.parseCompound(q);
        if (p && p.isValid) {
          const el = p.elements || {};
          const hasC = !!el.C;
          let massInfo = '';
          let dbeInfo = '';
          let classInfo = '';
          try {
            if (parser.molecularWeight) {
              const mw = parser.molecularWeight(q);
              massInfo = `Molar mass: <b>${mw.weight.toFixed(3)} g/mol</b> (${Object.entries(el).map(([k,v])=>`${k}${v>1?v:''}`).join(' ')})`;
            }
          } catch {}
          try {
            const dbe = _calculateDBE(el);
            dbeInfo = `DBE (unsaturation): <b>${dbe}</b> — ${dbe===0?'saturated (alkane, all sp³)':dbe===1?'one unsaturation (C=C or ring)':dbe>=4?'possible aromatic (≥4)':'unsaturated'}`;
            if (hasC) {
              if (el.C && el.H && Object.keys(el).every(k=>['C','H'].includes(k))) {
                if (dbe===0) classInfo = 'Hydrocarbon: <b>alkane</b> CnH2n+2';
                else if (dbe===1) classInfo = 'Hydrocarbon: <b>alkene or cycloalkane</b> CnH2n';
                else if (dbe===2) classInfo = 'Hydrocarbon: <b>alkyne/diene</b> CnH2n-2';
                else if (dbe===4) classInfo = 'Hydrocarbon: <b>aromatic</b> (e.g., benzene C6H6)';
              } else if (hasC) {
                classInfo = `Organic — ${el.O?'O-containing':el.N?'N-containing':'C-containing'}; DBE helps infer functional groups`;
              }
            }
          } catch {}
          // Build enriched answer: formula block + conceptual reference
          let header = `🧪 <b>Organic Analysis — ${_esc(q)}</b>\n\n`;
          if (massInfo) header += `${massInfo}\n`;
          if (dbeInfo) header += `${dbeInfo}\n`;
          if (classInfo) header += `${classInfo}\n`;
          header += `Composition: ${Object.entries(el).map(([k,v])=>`${k}${v>1?v:''}`).join(' ')}\n`;
          // Delegate to functional groups for likely groups if formula, plus hub
          let func = '';
          try { func = getFunctionalGroups(q); } catch {}
          // If func is just header with no match, keep header only
          // Return enriched header + truncated func/hub
          // Prefer functional group insight over generic hub for formula
          let out = header + '\n' + _sep();
          if (func && !func.includes('No specific section matched')) out += func;
          else out += organic(q);
          return out;
        }
      }
    } catch {}
  }
  return organic(query);
}

function analyzeHydrocarbon(query) {
  // Direct delegation — getHydrocarbons already handles filtering and DBE-style tables
  const res = getHydrocarbons(query);
  // If getHydrocarbons returned "No match" but query is formula-like, provide helper fallback
  if (res.includes('No specific section matched') || res.includes('No match')) {
    try {
      const parser = _getParser();
      const p = parser.parseCompound(String(query||'').trim());
      if (p && p.isValid) {
        const el = p.elements;
        const keys = Object.keys(el);
        const nonCH = keys.filter(k=>!['C','H'].includes(k));
        if (nonCH.length) {
          return `⛽ <b>Hydrocarbon Check</b>\n\nFormula <b>${_esc(query)}</b> contains non-hydrocarbon elements: <b>${nonCH.join(', ')}</b>.\nHydrocarbons are C and H only.\n\nTry tapping 🧬 Organic for general analysis.`;
        }
      }
    } catch {}
  }
  return res;
}

function explainMechanism(query) {
  return getReactionMechanisms(query);
}

function identifyFunctional(query) {
  return getFunctionalGroups(query);
}

function explainStereo(query) {
  const q = String(query||'').trim().toLowerCase();
  let res = getStereochemistry(query);
  // Enhance alkene E/Z cases that currently return "No match"
  if ((res.includes('No match') || res.includes('No specific section')) && (q.includes('ene') || q.includes('alkene') || q.includes('c4h8') || q.includes('but'))) {
    const ez = getStereochemistry('E/Z');
    return ez + '\n\n' + `Query-specific: <b>${_esc(query)}</b> — alkene; E/Z (cis/trans) applies where each C=C carbon bears two different groups. But-2-ene: cis (Z, both CH3 same side) vs trans (E, opposite).`;
  }
  if ((res.includes('No match') || res.includes('No specific')) && (q.includes('chiral') || q.includes('lactic') || q.includes('glucose'))) {
    return getStereochemistry('chiral');
  }
  return res;
}

function analyzeSpectroscopy(query) {
  return getSpectroscopy(query);
}

// ---------------------------------------------------------------------------
// Module exports — satisfy requirement: ≥5 exported functions returning strings
// ---------------------------------------------------------------------------

module.exports = {
  // Primary section exports (the 5 + 1 required)
  getHydrocarbons,
  getFunctionalGroups,
  getReactionMechanisms,
  getStereochemistry,
  getSpectroscopy,
  getPolymersBiomolecules,

  // Aliases to match task wording variants
  getHydrocarbonInfo,
  getFunctionalGroupInfo,
  getMechanismInfo,
  getStereochemistryInfo,
  getSpectroscopyInfo,
  getPolymers,
  getBiomolecules,

  // Lowercase/shorthand aliases
  hydrocarbons,
  functionalGroups,
  reactionMechanisms,
  stereochemistry,
  spectroscopy,
  polymersBiomolecules,
  describeHydrocarbon,

  // Generic dispatchers
  organic,
  getOrganicInfo,
  getMechanisms,
  getAnalysis,

  // Handler-required aliases (task spec: handleOrganic etc. call organic tools)
  analyzeOrganic,
  analyzeHydrocarbon,
  explainMechanism,
  identifyFunctional,
  explainStereo,
  analyzeSpectroscopy,

  // Additional aliases for flexibility
  hydrocarbon: getHydrocarbons,
  functional: getFunctionalGroups,
  mechanism: getReactionMechanisms,
  stereo: getStereochemistry,

  // For iterating all sections
  listSections: () => ['hydrocarbons', 'functionalGroups', 'reactionMechanisms', 'stereochemistry', 'spectroscopy', 'polymersBiomolecules'],
};
