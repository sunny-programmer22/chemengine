# Chem Bot — Commands

The bot is **command-first** (slash commands) but also **smart-routes** free
text. Type any formula and it auto-calculates molar mass; type any equation
and it auto-balances.

---

## Slash commands

| Command | Args | What it does | Example |
|---|---|---|---|
| `/start` | — | Welcome message and command list | `/start` |
| `/help` | — | Show all commands with examples | `/help` |
| `/balance` | equation | Balance a chemical equation | `/balance CH4 + O2 -> CO2 + H2O` |
| `/predict` | reactants | Predict products and reaction type | `/predict Zn + HCl` |
| `/molar` | formula | Molar mass + per-element breakdown | `/molar H2SO4` |
| `/stoich` | equation compound amount unit | Stoichiometry (mass-to-mass, etc.) | `/stoich 2H2 + O2 -> 2H2O H2O 4 g` |
| `/ph` | acid-or-base concentration | pH of an aqueous solution | `/ph HCl 0.1` |
| `/element` | symbol / name / Z | Element info card | `/element Fe`, `/element Iron`, `/element 26` |
| `/iupac` | name | IUPAC name (PubChem) | `/iupac acetic acid` |
| `/ask` | question | Free-form Q&A via LLM | `/ask Why does ice float?` |
| `/safety` | compound | Hazard summary (PubChem) | `/safety HCl` |
| `/search` | query | Multi-source search | `/search Vitamin C` |

### Unit cheat sheet for `/stoich`

| Unit | Meaning |
|---|---|
| `g` / `gram` | grams |
| `kg` / `kilogram` | kilograms |
| `mg` / `milligram` | milligrams |
| `mol` / `moles` | moles |
| `L` / `liter` | liters at STP (22.414 L/mol) |
| `mL` / `milliliter` | milliliters at STP |
| `molecule` / `molecules` | discrete molecule count |

The output also includes a grams-equivalent so the textbook value is always
visible.

---

## Smart routing

Drop the slash command and type free text:

| Input shape | Routed to |
|---|---|
| `H2O` | molar mass |
| `H2 + O2 -> H2O` | balance + stoichiometry |
| `CH4 + O2` | predict |
| `ph HCl 0.1` | pH (lowercased) |
| `iron` / `Iron` / `Fe` / `26` | element info |
| anything else | LLM `/ask` |

---

## Reaction types the predictor handles

The reaction predictor is a deterministic decision tree. It produces a
balanced equation and a short note.

| Reactants | Predicted type | Example |
|---|---|---|
| Hydrocarbon + O2 | combustion | `CH4 + O2 -> CO2 + H2O` |
| Single compound | decomposition | `H2O -> H2 + O2` (electrolysis) |
| Metal carbonate | thermal decomposition | `CaCO3 -> CaO + CO2` |
| Metal chlorate | thermal decomposition | `2 KClO3 -> 2 KCl + 3 O2` |
| Acid + base | neutralization | `HCl + NaOH -> NaCl + H2O` |
| Alkene + H2 | hydrogenation | `C2H4 + H2 -> C2H6` |
| Alkene + H2O | hydration | `C2H4 + H2O -> C2H5OH` |
| Alkene + X2 | halogenation | `C2H4 + Cl2 -> C2H4Cl2` |
| Metal + non-metal | synthesis | `2 Na + Cl2 -> 2 NaCl` |
| Free element + compound | single replacement (activity series) | `Zn + CuSO4 -> ZnSO4 + Cu` |
| Two compounds | double replacement (metathesis) | `AgNO3 + NaCl -> AgCl + NaNO3` |
| Anything else | "unspecified" with a note | — |

---

## Inline mode

Enable inline mode via @BotFather (`/setinline`). Then in any chat:

```
@YourChemBot H2SO4
@YourChemBot Fe
@YourChemBot balance CH4 + O2 -> CO2 + H2O
```

The bot returns a one-line card suitable for inserting into a conversation.

---

## Reply formatting

- All command replies are HTML (Telegram's `parse_mode: HTML`).
- Subscripts in formulas use `<sub>` (e.g. `H<sub>2</sub>O`).
- Superscripts in charges use `<sup>` (e.g. `SO<sub>4</sub><sup>2-</sup>`).
- Section headers are `<b>…</b>` and notes are `<i>…</i>`.

If the bot needs to send a message longer than `MAX_MESSAGE_LENGTH` (default
3500 chars), it splits it at blank lines and sends multiple messages.
