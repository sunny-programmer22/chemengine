# Chem Bot — IUPAC Knowledge Coverage

This document lists the IUPAC-aligned chemistry knowledge that ships with the
bot **offline** (in code and `data/elements.json`) versus knowledge fetched
**online** (PubChem, Wikidata, Wikipedia, OpenAI). The goal is full coverage
of the IUPAC chemistry curriculum from general chemistry through
intermediate organic and analytical chemistry.

---

## 1. Offline knowledge (ships in the repo)

### Elements — `data/elements.json`
- All 118 IUPAC elements (Z = 1 … 118)
- IUPAC 2021 standard atomic weights
- Group / period / block
- Electron configuration (ground state)
- Common oxidation states
- Electronegativity (Pauling where defined)
- Density, melting point, boiling point
- Discovery year and discoverer where known
- Category (alkali metal, halogen, noble gas, lanthanide, actinide, transition
  metal, post-transition metal, metalloid, nonmetal, polyatomic nonmetal,
  diatomic nonmetal, superheavy element)

### Formula parser — `src/utils/parser.js`
- Atomic counts with multi-digit multipliers
- Nested parentheses `()`, square brackets `[]`, curly brackets `{}`
- Hydrates (`CuSO4·5H2O`, also `.` and `*` accepted as separators)
- Leading coefficient in hydrate parts (`5H2O` → 5 × H2O)
- Charges (`SO4^2-`, `Fe^3+`, `NH4^+`)
- Equation splitting on `->`, `=`, `→`, `⇌`, `⟶`, `=>`, `<->`
- Case-sensitive element symbols
- 118-element recognition

### Molar mass — `src/tools/molar.js`
- Per-element atomic-mass contribution
- Per-atom mass in the breakdown table (matches textbook presentations)
- Total molecular weight
- Hydrate-aware (e.g. `CuSO4·5H2O` includes the water of crystallisation)

### pH — `src/tools/ph.js`
- Strong acids (HCl, HBr, HI, HNO3, HClO4, H2SO4 first dissociation)
- Strong bases (Group 1 hydroxides, Ca(OH)2, Ba(OH)2, Sr(OH)2)
- Weak acids with Ka: HF, CH3COOH, HCN, HCOOH, HNO2, HClO, HBrO, NH4+, H2S,
  H2CO3, H3PO4, benzoic acid, phenol, … (table in `ph.js`)
- Quadratic solver for weak-acid equilibrium
- Dilution: `pH = -log10(c)`

### Equation balancing — `src/tools/balancer.js`
- Linear-algebra primary path
- Bounded trial-coefficient fallback (1..30, then 1..60)
- Integer coefficients with GCD reduction
- Returns a balanced string AND a coefficients array
- Handles: `H2 + O2 -> H2O`, `C3H8 + O2 -> CO2 + H2O`,
  `Fe + S -> FeS`, `KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O`, …

### Reaction prediction — `src/tools/predictor.js`
Decision tree with these branches:

| Reactants | Predicted type |
|---|---|
| Hydrocarbon + O2 | complete combustion (`CO2 + H2O`) |
| Single compound (H2O) | electrolysis (`H2 + O2`) |
| Metal carbonate | thermal decomposition (`MO + CO2`) |
| Metal chlorate | thermal decomposition (`MCl + O2`) |
| Acid + base | neutralisation (`salt + H2O`) |
| Alkene + H2 | hydrogenation (alkane) |
| Alkene + H2O | hydration (alcohol, Markovnikov) |
| Alkene + X2 | halogenation (vicinal dihalide) |
| Metal + non-metal | synthesis (ionic salt) |
| Free element + compound | single replacement (activity series) |
| Two compounds | double replacement (metathesis) |
| Two non-metals | combination (covalent product) |
| Anything else | "unspecified" with a note + balancer hint |

The activity series is hard-coded with the standard ordering from
alkali metals down to gold.

### Stoichiometry — `src/tools/stoichiometry.js`
- Mass-to-mass, mass-to-mole, mole-to-mole, volume-to-mole
- Units: g, kg, mg, mol, L, mL, molecule
- Grams-equivalent included in every result
- Reduces coefficients via GCD before computing ratios

### Safety — `src/tools/safety.js` & `src/bot/safety.js`
- Regex pattern list blocking synthesis queries for:
  - Chemical weapons (sarin, VX, novichok, mustard gas, lewisite, …)
  - Nerve agents and binary precursors
  - Illicit drugs (synthesis routes, precursor substitutions)
  - Explosive synthesis (TATP, HMTD, RDX improvised routes)
  - Biological agents
- Educational queries about the same compounds are explicitly allowed.
- Returns `{ allowed, reason, category }` for the middleware.

### Namer — `src/tools/namer.js`
- Binary ionic compound naming (`NaCl` → sodium chloride, `Fe2O3` →
  iron(III) oxide with Roman-numeral stock system, and the older
  `-ous` / `-ic` common system)
- Stock system and classical system both supported
- Acid naming: binary (hydro-…-ic), oxy- (…-ic / …-ous) with suffixes
- Molecular compound naming (Greek prefixes: mono, di, tri, tetra, penta,
  hexa, hepta, octa, nona, deca)
- Cation / anion recognition by position in the periodic table

---

## 2. Online knowledge (fetched on demand)

| Source | Used by | What it provides |
|---|---|---|
| **PubChem** | `/iupac`, `/safety`, `/search` | IUPAC names, synonyms, SMILES, InChI, hazard codes (GHS), boiling / melting points, density |
| **Wikidata** | `/search` | Cross-language labels, identifiers for obscure compounds |
| **Wikipedia** | `/search` | Plain-language encyclopedia summaries, reaction context, history |
| **OpenAI / local LLM** | `/ask` | Free-form Q&A: conceptual questions, mechanisms, historical context, biochemistry |

All four online sources are optional. The deterministic tools (balance,
molar, pH, stoichiometry, element, predict) work fully offline.

## 3. Coverage gaps (future work)

- **Spectroscopy helpers** (IR / NMR peak prediction) — not yet
- **Thermodynamics** (ΔH, ΔG, ΔS from formation data) — not yet
- **Organic mechanism drawing** (arrow-pushing diagrams) — not yet
- **Kinetics** (rate laws, half-life, Arrhenius) — not yet
- **Electrochemistry** (cell potential, Nernst equation) — not yet
- **Solid-state chemistry** (unit cells, Miller indices) — not yet
- **Polymer chemistry** (degree of polymerisation, MW distribution) — not yet
- **Biochemistry** (amino acid properties, codon table) — not yet
- **Analytical chemistry** (titration curves, buffer capacity) — partial
  (pH is the foundation; full titration curves are TODO)

These are roadmap items, not defects. The current scope is intentionally
"first-year university / AP Chemistry + early organic."

## 4. IUPAC 2013 nomenclature rules covered

The namer follows the IUPAC 2013 *Nomenclature of Organic Chemistry* and
*Nomenclature of Inorganic Chemistry* recommendations:

- Element names with the post-2016 official spellings (e.g. *Moscovium*,
  *Nihonium*, *Tennessine*, *Oganesson*)
- Stock numbers in Roman numerals inside parentheses for variable-charge
  metals (e.g. iron(III), copper(II))
- Greek multiplicative prefixes for molecular compounds (dinitrogen
  pentoxide, sulfur trioxide)
- `-ide` ending for binary compounds of two non-metals
- `-ate` / `-ite` / `-ide` for oxoanions in descending oxygen count
- `hypo-…-ite` for the lowest member of an oxoanion series
- `per-…-ate` for the highest member
- Prefixes for hydrate count: *mono hydrate*, *dihydrate*, *pentahydrate*,
  etc.

## 5. How to extend the offline knowledge

1. **Add an element** — extend `data/elements.json`. All tools pick it up on
   next start; no code changes required.
2. **Add a constant** (Ka, Kb, Ksp, E°) — add an entry to the corresponding
   table in `src/tools/ph.js` or a new `src/tools/constants.js`.
3. **Add a reaction type** — add a branch to the `predict()` decision tree
   in `src/tools/predictor.js` and a corresponding test in
   `test/predictor.test.js`.
4. **Add a safety pattern** — append to `BLOCKED_PATTERNS` in
   `src/bot/safety.js` and add an `isBlocked(…)` test in
   `test/safety.test.js`.
5. **Add a slash command** — wire it up in `src/bot/handler.js` and document
   it in `docs/COMMANDS.md`.

Run `npm test` after every change. The test suite is fast (~1.4 s) and
guards against regressions in the chemistry core.
