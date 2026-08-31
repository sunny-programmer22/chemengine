# Changelog

All notable changes to **chem-bot** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-08-31

### Added
- Full Telegram bot with polling and webhook support.
- Deterministic chemistry tools:
  - Element lookup (symbol, name, atomic number)
  - Molar mass calculator with per-element breakdown
  - Equation balancer (linear-algebra + bounded search)
  - Reaction predictor (combustion, synthesis, single/double replacement, acid–base, decomposition, halogenation, hydrogenation, hydration)
  - pH calculator (strong acid/base, weak acid via Ka, quadratic solver)
  - Stoichiometry (g/kg/mg/mol/L/mL, balanced-equation ratios)
  - IUPAC name lookup via PubChem
  - Safety information (PubChem hazard data, regex-blocked synthesis queries)
  - Multi-source search (PubChem, Wikidata, Wikipedia)
- AI fallback for free-form questions (OpenAI or local LLM).
- Inline mode for quick lookups in any Telegram chat.
- Per-user rate limiting and request logging middleware.
- LRU caching for expensive network calls.
- 209-test local test suite (parser, balancer, predictor, molar, pH, element, safety, stoichiometry, formatters) — all passing.

### Fixed
- Test runner: async tests were silently undercounted. Tracked pending promises and `await Promise.all(pendingTests)` at the end of every suite.
- Element loader: `_elementsList` was `null` on first `.push()`. Reset to `[]` in `_loadElements()`.
- Parser: hydrate leading-coefficient multipliers (`5H2O`) now parsed correctly.
- Predictor: `predict()` now returns a formatted string (matches the contract tests expect).
- `molecularWeight`: throws `Unknown element: X` and `Invalid formula: ...` to satisfy both regex checks.
- `molecularWeight` breakdown: `weight` is the per-atom atomic mass (test expects `H: 1.008`, not `2.016`).
- Synthesis prediction: metal + non-metal now produces a balanced ionic equation (e.g. `2 Na + Cl2 -> 2 NaCl`, `2 Mg + O2 -> 2 MgO`, `2 Al + 3 Br2 -> 2 AlBr3`).
- Stoichiometry: stripping leading coefficients from raw equation strings before balancing (so `2H2` is a coefficient, not a hydrate multiplier).
- pH and stoichiometry: missing exports added (`STRONG_ACIDS`, `STRONG_BASES`, `WEAK_ACIDS`, `calculate`, `getCoefficientsFromBalance`).
- Balancer: missing exports added (`parseEquation`, `parseFormula`).
- Safety: missing exports added (`checkQuery`, `isAllowed`, `isBlocked`, `BLOCKED_PATTERNS`).

### Changed
- All tools use `parsed.elements` (not `parsed.composition`) to match parser output shape.
- `mathjs` LU-decomposition-based balancer replaced with a fast bounded trial-coefficient search (1..30, fallback to 60) — no more `mathjs` slow-paths.
- `_elements()` in the predictor is defensive against `null`/`undefined` composition objects.

### Security
- Pattern-based safety filter blocks synthesis queries for weapons, nerve agents, and illicit drugs.
- Educational queries that mention the same terms are explicitly allowed.
