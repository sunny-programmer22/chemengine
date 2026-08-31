/**
 * Safety filter for incoming chemistry questions
 * - Detect and politely refuse queries that ask for synthesis instructions
 *   for dangerous substances (explosives, nerve agents, illicit drugs, bioweapons).
 * - Allow informational and educational queries.
 * - Provide a disclaimer and safety note for borderline cases.
 */

// Substances that, when combined with synthesis intent, trigger a refusal.
// Note: this is a block-list used only to filter harmful synthesis requests.
// It is NOT a synthesis tutorial.
const DANGEROUS_SUBSTANCES = [
  // Explosives
  'tnt', 'trinitrotoluene', 'rdx', 'hmx', 'petn', 'nitroglycerin', 'nitroglycerine',
  'anfo', 'tatp', 'acetone peroxide', 'triacetone triperoxide', 'hmtd',
  'dynamite', 'c4', 'plastic explosive', 'semtex', 'detasheet',
  'mercury fulminate', 'lead azide', 'silver fulminate', 'picric acid',
  // Nerve / chemical warfare agents
  'sarin', 'vx', 'novichok', 'tabun', 'soman', 'mustard gas', 'lewisite',
  'phosgene', 'cyclosarin', 'agent orange', 'chlorine gas', 'nitrogen mustard',
  'nerve agent', 'nerve gas', 'chemical weapon', 'biological weapon',
  // Illicit drugs / precursors
  'methamphetamine', 'meth', 'crystal meth', 'mdma', 'ecstasy', 'lsd',
  'heroin', 'cocaine', 'fentanyl', 'carfentanil', 'pcp',
  'ghb', 'ketamine', 'pcp', 'methaqualone', 'quaalude',
  'pseudoephedrine to meth', 'red phosphorus', 'red phosphorous',
  // Biological weapons / toxins
  'ricin', 'anthrax', 'botulinum toxin', 'botox weapon', 'smallpox weapon',
  'plague weapon', 'ebola weapon', 'tularemia',
  'weaponized', 'bioweapon',
  // Other dangerous
  'thallium poison', 'arsenic poison synthesis', 'cyanide synthesis',
  'potassium cyanide synthesis'
];

// Phrasing that, combined with a dangerous substance, signals a request for
// instructions on how to make it.
const SYNTHESIS_INTENT = [
  'how to make', 'how to synthesize', 'how do i make', 'how do you make',
  'synthesize', 'synthesis of', 'preparing', 'prepare at home',
  'make at home', 'make it at home', 'home synthesis', 'diy synthesis',
  'instructions', 'recipe for', 'step by step', 'step-by-step',
  'procedure to make', 'method to make', 'method to synthesize',
  'tutorial', 'guide to making', 'guide to synthesizing',
  'create a', 'produce a', 'produce the', 'cook meth', 'cook the',
  'where to buy', 'where can i get', 'where to get',
  'build a', 'assemble a', 'mixing', 'mix the'
];

// Educational/informational phrasings - even if they mention a dangerous
// substance, these are allowed because they seek knowledge, not instructions.
const INFO_INTENT = [
  'what is', 'what are', 'define', 'explain', 'tell me about',
  'history of', 'who invented', 'who discovered', 'why is',
  'how does', 'how do', 'mechanism of action', 'effects of',
  'symptoms of', 'treatment for', 'antidote for', 'used in',
  'iupac', 'molar mass', 'molecular weight', 'molecular formula',
  'properties of', 'safety of', 'is .* safe', 'is .* dangerous',
  'wikipedia', 'background on'
];

/**
 * Check if a query contains an intent to synthesize a dangerous substance.
 * @param {string} text - User message
 * @returns {boolean} True if the query appears to be asking for synthesis
 *   instructions for a dangerous substance.
 */
function hasSynthesisIntent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SYNTHESIS_INTENT.some(p => lower.includes(p));
}

/**
 * Check if a query contains a dangerous-substance keyword.
 * @param {string} text - User message
 * @returns {boolean} True if the query mentions a flagged substance.
 */
function mentionsDangerousSubstance(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DANGEROUS_SUBSTANCES.some(s => {
    // Use word boundary semantics by checking for the phrase as-is
    // (most entries are multi-word or distinctive).
    return lower.includes(s);
  });
}

/**
 * Check if a query is purely informational/educational.
 * @param {string} text - User message
 * @returns {boolean} True if informational.
 */
function isInformational(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return INFO_INTENT.some(p => new RegExp(p, 'i').test(lower));
}

const REFUSAL_MESSAGE =
  "I can't help with that. I'm an educational chemistry assistant and won't provide " +
  "synthesis instructions, recipes, or procedures for dangerous substances such as " +
  "explosives, nerve agents, biological weapons, or illicit drugs.\n\n" +
  "I can help you with general chemistry questions (balancing, naming, periodic trends, " +
  "lab safety, classroom experiments, household chemistry, and more). " +
  "If you are researching a topic for school or legitimate science, please rephrase as an " +
  "informational question (e.g. \"What is the IUPAC name of X?\" or \"What are the properties of X?\").";

const SAFETY_NOTE =
  "Note: Information about chemical substances is provided for educational purposes. " +
  "Many compounds are hazardous. Always follow proper lab safety protocols and consult " +
  "an official Safety Data Sheet (SDS) before handling any chemical.";

// Block-list of regex patterns that flag harmful synthesis requests.
// Each pattern is a RegExp; .test(text) is used to detect a violation.
const BLOCKED_PATTERNS = [
  // Synthesis of illicit drugs (with "how/where" framing)
  /\b(how|where)\b[^.]{0,80}\b(make|synthesize|cook|produce|create|brew|distill|extract)\b[^.]{0,80}\b(meth|methamphetamine|crystal meth|mdma|ecstasy|lsd|heroin|cocaine|fentanyl|carfentanil|pcp|ghb|ketamine|methaqualone|quaalude)\b/i,
  // Drug "recipe" / shorthand
  /\bmeth\s*recipe\b/i,
  // Direct verb + drug (catches "make meth", "synthesize heroin", "cook meth")
  /\b(make|cook|synthesize|synthesise|produce|prepare|brew|distill|extract)\b[^.]{0,80}\b(meth|methamphetamine|crystal meth|lsd|heroin|cocaine|fentanyl|carfentanil|mdma|ecstasy|pcp|ghb|ketamine|methaqualone|quaalude)\b/i,
  // Explosives / bombs (with "how/where" framing)
  /\b(how|where)\b[^.]{0,80}\b(make|build|construct|assemble|create)\b[^.]{0,80}\b(bomb|explosive|pipe bomb|ied|plastic explosive|dynamite|c4|semtex|detasheet|grenade|tatp|rdx|hmx|petn|anfo|nitroglycerin|detonator)\b/i,
  // Direct verb + explosive
  /\b(make|build|construct|assemble|create)\b[^.]{0,80}\b(bomb|explosive|pipe bomb|ied|plastic explosive|dynamite|c4|semtex|detasheet|grenade|tatp|rdx|hmx|petn|anfo|nitroglycerin|detonator)\b/i,
  // Chemical weapons / nerve agents (direct verb)
  /\b(make|synthesize|synthesise|produce|cook|create)\b[^.]{0,80}\b(sarin|vx|tabun|soman|novichok|mustard gas|phosgene|lewisite|cyclosarin|nerve agent|nerve gas|chemical weapon|biological weapon|bioweapon|ricin|anthrax|botulinum)\b/i,
  // Chemical weapons / nerve agents (with "how/where" framing)
  /\b(how|where)\b[^.]{0,80}\b(make|synthesize|produce|create)\b[^.]{0,80}\b(sarin|vx|tabun|soman|novichok|mustard gas|phosgene|lewisite|cyclosarin|nerve agent|nerve gas|chemical weapon|bioweapon|ricin|anthrax|botulinum)\b/i,
];

/**
 * Check a user query against the block-list patterns.
 * Returns a structured result so callers can decide how to respond.
 * @param {string|null|undefined} text
 * @returns {{allowed: boolean, reason?: string, category?: string}}
 */
function checkQuery(text) {
  if (text === null || text === undefined || text === '') {
    return { allowed: true };
  }
  if (typeof text !== 'string') {
    return { allowed: true };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        allowed: false,
        reason: "I can't help with that. I'm an educational chemistry assistant and won't provide synthesis instructions for dangerous substances.",
        category: 'harmful_synthesis',
      };
    }
  }
  return { allowed: true };
}

/**
 * Simple boolean wrapper around checkQuery().
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
function isAllowed(text) {
  return checkQuery(text).allowed;
}

/**
 * Inverse of isAllowed().
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
function isBlocked(text) {
  return !isAllowed(text);
}

/**
 * Determine if a query is unsafe and should be refused.
 * @param {string} text - User message
 * @returns {{unsafe: boolean, refusal: string|null, note: string|null}}
 *   - unsafe: true if the bot should refuse.
 *   - refusal: refusal message to send (if unsafe).
 *   - note: safety note to append (if informational query about a dangerous topic).
 */
function isUnsafeQuery(text) {
  if (!text || typeof text !== 'string') {
    return { unsafe: false, refusal: null, note: null };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { unsafe: false, refusal: null, note: null };
  }

  const dangerous = mentionsDangerousSubstance(trimmed);
  const synthIntent = hasSynthesisIntent(trimmed);
  const info = isInformational(trimmed);

  // Refuse when: (dangerous substance AND synthesis intent)
  // and the intent is clearly about making/producing the substance.
  if (dangerous && synthIntent && !info) {
    return { unsafe: true, refusal: REFUSAL_MESSAGE, note: null };
  }

  // Also catch certain unambiguous patterns: "make sarin", "synthesize vx"
  // even without "step by step" wording.
  const lower = trimmed.toLowerCase();
  const explicitMake = /\b(make|synthesize|synthesise|produce|cook|prepare|brew|distill|extract)\b[^.]{0,80}\b(sarin|vx|tabun|soman|novichok|mustard gas|phosgene|lewisite|tatp|rdx|hmx|petn|anfo|methamphetamine|fentanyl|carfentanil|ricin|anthrax|botulinum)\b/i;
  if (explicitMake.test(lower)) {
    return { unsafe: true, refusal: REFUSAL_MESSAGE, note: null };
  }

  // Informational queries about dangerous topics are allowed, but we attach
  // a safety note as a courtesy.
  if (dangerous && info) {
    return { unsafe: false, refusal: null, note: SAFETY_NOTE };
  }

  return { unsafe: false, refusal: null, note: null };
}

module.exports = {
  // New API
  checkQuery,
  isAllowed,
  isBlocked,
  BLOCKED_PATTERNS,
  // Backward-compatible exports
  isUnsafeQuery,
  hasSynthesisIntent,
  mentionsDangerousSubstance,
  isInformational,
  REFUSAL_MESSAGE,
  SAFETY_NOTE
};
