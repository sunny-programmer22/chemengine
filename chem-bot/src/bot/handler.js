/**
 * Bot command handlers for the Chemistry Bot
 * Wires up all Telegram bot commands and inline queries
 */

const { logger } = require('../config');
const { splitMessage, formatError, formatList } = require('./formatters');

// Placeholder imports for tools (will be implemented later)
const balancer = require('../tools/balancer');
const predictor = require('../tools/predictor');
const molar = require('../tools/molar');
const element = require('../tools/element');
const phCalc = require('../tools/ph');
const iupac = require('../tools/iupac');
const safety = require('../tools/safety');
const search = require('../tools/search');
const stoichiometry = require('../tools/stoichiometry');
const llm = require('../llm/index');

// Patterns for auto-detection
const EQUATION_PATTERN = /(?:->|→|<->|⇌|[0-9]?\s*[A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*\s*(?:\+|→|->|<->|⇌)\s*)+/i;
const FORMULA_WITH_NUMBER_PATTERN = /^([A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*)\s+(\d+(?:\.\d+)?)\s*$/i;
const GREETINGS = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'sup', 'how are you', 'how are you?', 'how r u', "how's it going", "what's up", 'whats up', 'how are u'];

/**
 * Send welcome message for /start command
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const welcomeText = `
<b>🧪 Welcome to the Chemistry Bot!</b>

I can help you with all things chemistry. Here's what I can do:

${formatList([
  '/balance <equation> — Balance chemical equations',
  '/predict <reactants> — Predict reaction products',
  '/molar <formula> — Calculate molar mass',
  '/stoich <eq> <compound> <amount> <unit> — Stoichiometry',
  '/ph <formula> <concentration> — Calculate pH',
  '/element <symbol|name|Z> — Get element information',
  '/iupac <name> — Look up IUPAC names',
  '/ask <question> — Ask any chemistry question',
  '/safety <formula> — Get safety information',
  '/search <query> — Search chemistry databases',
  '/help — Show all commands'
])}

<b>Quick Tips:</b>
• Just type a chemical equation like "H2 + O2 -> H2O" to balance it
• Type a formula followed by a number for quick molar mass
• Start with a greeting and I'll say hello back!

<i>Powered by PubChem, Wikidata, and AI</i>
`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '🔮 Predict', callback_data: 'cmd_predict' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '⚗️ pH', callback_data: 'cmd_ph' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '🔍 Search', callback_data: 'cmd_search' }, { text: '🤖 Ask AI', callback_data: 'cmd_ask' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    },
    parse_mode: 'HTML'
  };

  try {
    await bot.sendMessage(chatId, welcomeText.trim(), keyboard);
  } catch (err) {
    logger.error('Error sending start message:', err);
    await bot.sendMessage(chatId, formatError(err));
  }
}

/**
 * Handle /help command - list all commands
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;
  const helpText = `
<b>📚 Chemistry Bot Commands</b>

<b>Basic Commands:</b>
${formatList([
  '/start — Get started with the bot',
  '/help — Show this help message'
])}

<b>Chemistry Tools:</b>
${formatList([
  '/balance H2 + O2 -> H2O — Balance any chemical equation',
  '/predict Na + Cl2 — Predict products of a reaction',
  '/molar H2SO4 — Calculate molar mass',
  '/stoich 2H2 + O2 -> 2H2O H2O 10 mol — Stoichiometry',
  '/ph HCl 0.1 — Calculate pH of a solution',
  '/element Fe or Iron or 26 — Get element info',
  '/iupac acetic acid — Get systematic IUPAC name'
])}

<b>AI-Powered:</b>
${formatList([
  '/ask Why is the sky blue? — Free-form Q&A',
  '/safety H2SO4 — Get hazard info from PubChem',
  '/search Vitamin C — Search chemistry databases'
])}

<b>Examples:</b>
<pre>
/molar NaCl
/molar Ca(OH)2
/element gold
/balance CH4 + O2 -> CO2 + H2O
/predict Zn + HCl
/ask What is the mechanism of SN1 reactions?
</pre>

Type any command to get started!
`;

  try {
    await bot.sendMessage(chatId, helpText.trim(), { parse_mode: 'HTML' });
  } catch (err) {
    logger.error('Error sending help message:', err);
    await bot.sendMessage(chatId, formatError(err));
  }
}

/**
 * Handle /balance command - balance chemical equations
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleBalance(bot, msg, args) {
  const chatId = msg.chat.id;
  const equation = args.join(' ').trim();

  if (!equation) {
    await bot.sendMessage(chatId, 'Please provide a chemical equation.\nUsage: /balance H2 + O2 -> H2O', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await balancer.balance(equation);
    const message = `<b>⚖️ Balanced Equation</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Balance error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /predict command - predict reaction products
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handlePredict(bot, msg, args) {
  const chatId = msg.chat.id;
  const reactants = args.join(' ').trim();

  if (!reactants) {
    await bot.sendMessage(chatId, 'Please provide reactants.\nUsage: /predict Na + Cl2', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await predictor.predict(reactants);
    const message = `<b>🔮 Reaction Prediction</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Predict error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /molar command - calculate molar mass
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleMolar(bot, msg, args) {
  const chatId = msg.chat.id;
  const formula = args.join(' ').trim();

  if (!formula) {
    await bot.sendMessage(chatId, 'Please provide a chemical formula.\nUsage: /molar H2SO4', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await molar.calculate(formula);
    const message = `<b>⚛️ Molar Mass Calculator</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Molar mass error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /stoich command - stoichiometry calculations
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleStoich(bot, msg, args) {
  const chatId = msg.chat.id;

  if (args.length < 4) {
    await bot.sendMessage(chatId,
      'Usage: /stoich <equation> <compound> <amount> <unit>\n' +
      'Example: /stoich 2H2 + O2 -> 2H2O H2O 10 mol',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Parse arguments - find the equation, then compound, amount, unit
  const input = args.join(' ');
  const eqMatch = input.match(/(.+?)\s+(\w+(?:\([^)]+\))?\d*)\s+(\d+(?:\.\d+)?)\s*(mol|g|kg|mg|mol|mmol)?$/i);

  if (!eqMatch) {
    await bot.sendMessage(chatId, 'Could not parse the arguments. Please check the format.', { parse_mode: 'HTML' });
    return;
  }

  const [, equation, compound, amount, unit] = eqMatch;

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await stoichiometry.calculate(equation, compound, parseFloat(amount), unit || 'mol');
    const message = `<b>📊 Stoichiometry Calculation</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Stoichiometry error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /ph command - calculate pH
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handlePh(bot, msg, args) {
  const chatId = msg.chat.id;

  if (args.length < 2) {
    await bot.sendMessage(chatId, 'Usage: /ph <formula> <concentration>\nExample: /ph HCl 0.1\nNote: Concentration in mol/L (M)', { parse_mode: 'HTML' });
    return;
  }

  const formula = args[0];
  const concStr = args.slice(1).join(' ');
  const concentration = parseFloat(concStr);

  if (isNaN(concentration) || concentration <= 0) {
    await bot.sendMessage(chatId, 'Please provide a valid positive concentration.\nExample: /ph HCl 0.1', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await phCalc.calculate(formula, concentration);
    const message = `<b>⚗️ pH Calculator</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('pH calculation error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /element command - get element information
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleElement(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId, 'Please provide an element symbol, name, or atomic number.\nUsage: /element Fe or /element Iron or /element 26', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await element.getInfo(query);
    // Result may be { ok, element, formatted } or a string
    let body = '';
    if (typeof result === 'string') {
      body = result;
    } else if (result && result.formatted) {
      body = result.formatted;
    } else if (result && result.ok && result.element) {
      const e = result.element;
      body = `<b>${e.name}</b> (${e.symbol}) — Z = ${e.z}\n` +
             (e.category ? `Category: ${e.category}\n` : '') +
             (e.atomicMass ? `Atomic mass: ${e.atomicMass} u\n` : '');
    } else {
      body = 'No information found.';
    }
    const message = `<b>🔬 Element Information</b>\n\n${body}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Element lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /iupac command - look up IUPAC names
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleIupac(bot, msg, args) {
  const chatId = msg.chat.id;
  const name = args.join(' ').trim();

  if (!name) {
    await bot.sendMessage(chatId, 'Please provide a compound name to look up.\nUsage: /iupac acetic acid', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await iupac.lookup(name);
    const message = `<b>📖 IUPAC Name Lookup</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('IUPAC lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /ask command - free-form chemistry Q&A
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleAsk(bot, msg, args) {
  const chatId = msg.chat.id;
  const question = args.join(' ').trim();

  if (!question) {
    await bot.sendMessage(chatId, 'Please ask a chemistry question.\nUsage: /ask What is the mechanism of SN1 reactions?', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await (llm.askChem || llm.ask)(question, msg.from);
    const answer = result && typeof result === 'object' ? (result.answer || String(result)) : String(result);
    await sendFormattedMessage(bot, chatId, answer);
  } catch (err) {
    logger.error('LLM ask error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /safety command - get safety information from PubChem
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleSafety(bot, msg, args) {
  const chatId = msg.chat.id;
  const formula = args.join(' ').trim();

  if (!formula) {
    await bot.sendMessage(chatId, 'Please provide a chemical formula or name.\nUsage: /safety H2SO4', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await safety.getInfo(formula);
    const message = `<b>⚠️ Safety Information</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Safety lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle /search command - search across databases
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleSearch(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId, 'Please provide a search query.\nUsage: /search Vitamin C', { parse_mode: 'HTML' });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await search.query(query);
    const message = `<b>🔍 Search Results</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message);
  } catch (err) {
    logger.error('Search error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' });
  }
}

/**
 * Handle inline queries for quick chemistry lookups
 * @param {Object} bot - Telegram bot instance
 * @param {Object} query - Inline query object
 */
async function handleInlineQuery(bot, query) {
  const queryText = query.query.trim();

  if (!queryText) {
    await bot.answerInlineQuery(query.id, []);
    return;
  }

  try {
    // Try to parse as chemical formula
    const results = [];

    if (/^[A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*$/i.test(queryText)) {
      const molarMass = await molar.calculate(queryText);
      results.push({
        type: 'article',
        id: 'molar-' + queryText,
        title: `Molar Mass: ${queryText}`,
        description: molarMass.substring(0, 200),
        input_message_content: {
          message_text: `<b>⚛️ Molar Mass</b>\n\n${molarMass}`,
          parse_mode: 'HTML'
        }
      });
    }

    await bot.answerInlineQuery(query.id, results);
  } catch (err) {
    logger.error('Inline query error:', err);
    await bot.answerInlineQuery(query.id, []);
  }
}

/**
 * Auto-detection router for messages without commands
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
async function routeMessage(bot, msg) {
  const text = msg.text || msg.caption || '';
  const chatId = msg.chat.id;

  // Check for greetings / casual human chat - very short replies
  const lowerText = text.toLowerCase().trim();
  const casualPhrases = ['how are you', 'how r u', "how's it going", "what's up", 'whats up', 'how are u', 'hru', 'wbu', 'what about you', 'i am fine', "i'm fine", 'i am good', "i'm good"];
  if (GREETINGS.some(g => lowerText === g || lowerText.startsWith(g + ' ') || lowerText.startsWith(g + '?') || lowerText.startsWith(g + '!'))) {
    const greetings = ['Hey! 👋', 'Hi there! 🧪', 'Hello! 😊', 'Hey there!'];
    await bot.sendMessage(chatId, greetings[Math.floor(Math.random() * greetings.length)]);
    return;
  }
  if (casualPhrases.some(p => lowerText === p || lowerText.startsWith(p) || lowerText.includes(p))) {
    const casualReplies = ["I'm good! 😊 How about you?", "Doing great! You?", "All good here! 👋", "Great! How can I help? 😊"];
    // Specific handling for "how are you"
    if (lowerText.includes('how are you') || lowerText.includes('how r u') || lowerText.includes('how are u') || lowerText.includes('hru')) {
      await bot.sendMessage(chatId, casualReplies[Math.floor(Math.random() * casualReplies.length)]);
      return;
    }
    if (lowerText.includes("what's up") || lowerText.includes('whats up') || lowerText.includes('sup')) {
      await bot.sendMessage(chatId, "Not much! Just chilling with chemistry 🧪 You?");
      return;
    }
  }

  // Check for chemical equation pattern
  if (EQUATION_PATTERN.test(text)) {
    await handleBalance(bot, msg, [text]);
    return;
  }

  // Check for formula with number (molar mass request)
  const formulaMatch = text.match(FORMULA_WITH_NUMBER_PATTERN);
  if (formulaMatch) {
    await handleMolar(bot, msg, [formulaMatch[1]]);
    return;
  }

  // If it's a simple formula, offer to calculate molar mass
  if (/^[A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*$/i.test(text.trim())) {
    await handleMolar(bot, msg, [text.trim()]);
    return;
  }

  // Unknown input - try LLM for general chat (very short)
  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await llm.askChem(text, msg.from);
    await sendFormattedMessage(bot, chatId, result.answer || result);
    return;
  } catch {}
  await bot.sendMessage(chatId, 'Hey! 😊 Try /help for chemistry stuff!', { parse_mode: 'HTML' });
}

/**
 * Send a formatted message, splitting if necessary
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 */
async function sendFormattedMessage(bot, chatId, text) {
  const { config } = require('../config');
  const chunks = splitMessage(text, config.maxMessageLength);

  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
  }
}

/**
 * Handle callback_query from inline keyboards
 * @param {Object} bot - Telegram bot instance
 * @param {Object} query - Callback query object
 */
async function handleCallbackQuery(bot, query) {
  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    logger.warn('answerCallbackQuery failed:', err.message);
  }

  const data = query.data;
  const chatId = query.message?.chat?.id;
  // Synthetic msg for handlers that expect msg object
  const syntheticMsg = { chat: { id: chatId }, from: query.from };

  if (!chatId) return;

  try {
    switch (data) {
      case 'cmd_start':
        await handleStart(bot, syntheticMsg);
        break;
      case 'cmd_help':
        await handleHelp(bot, syntheticMsg);
        break;
      case 'cmd_balance':
        await bot.sendMessage(chatId, '⚖️ <b>Balance Chemical Equations</b>\n\nSend: <code>/balance H2 + O2 -> H2O</code>\nOr just type an equation like <code>H2 + O2 -> H2O</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_predict':
        await bot.sendMessage(chatId, '🔮 <b>Predict Reaction Products</b>\n\nSend: <code>/predict Na + Cl2</code>\nExample: <code>/predict Zn + HCl</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_molar':
        await bot.sendMessage(chatId, '⚛️ <b>Molar Mass Calculator</b>\n\nSend: <code>/molar H2SO4</code>\nExamples: <code>/molar NaCl</code>, <code>/molar Ca(OH)2</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_stoich':
        await bot.sendMessage(chatId, '📊 <b>Stoichiometry</b>\n\nSend: <code>/stoich 2H2 + O2 -> 2H2O H2O 10 mol</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_element':
        await bot.sendMessage(chatId, '🔬 <b>Element Information</b>\n\nSend: <code>/element Fe</code> or <code>/element Iron</code> or <code>/element 26</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_ph':
        await bot.sendMessage(chatId, '⚗️ <b>pH Calculator</b>\n\nSend: <code>/ph HCl 0.1</code>\nUsage: <code>/ph &lt;formula&gt; &lt;concentration&gt;</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_iupac':
        await bot.sendMessage(chatId, '📖 <b>IUPAC Lookup</b>\n\nSend: <code>/iupac acetic acid</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_ask':
        await bot.sendMessage(chatId, '🤖 <b>Ask Chemistry Question</b>\n\nSend: <code>/ask What is the mechanism of SN1 reactions?</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_safety':
        await bot.sendMessage(chatId, '⚠️ <b>Safety Information</b>\n\nSend: <code>/safety H2SO4</code>', { parse_mode: 'HTML' });
        break;
      case 'cmd_search':
        await bot.sendMessage(chatId, '🔍 <b>Search Chemistry Databases</b>\n\nSend: <code>/search Vitamin C</code>', { parse_mode: 'HTML' });
        break;
      default:
        // Generic fallback for any cmd_* not explicitly listed
        if (data && data.startsWith('cmd_')) {
          const cmd = data.replace(/^cmd_/, '');
          await bot.sendMessage(chatId, `Send: /${cmd} &lt;your input&gt;\nUse /help to see all commands.`, { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chatId, 'Unknown action. Use /help to see available commands.', { parse_mode: 'HTML' });
        }
        break;
    }
  } catch (err) {
    logger.error('Callback query error:', err);
    try { await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML' }); } catch {}
  }
}

/**
 * Register all bot handlers
 * @param {Object} bot - Telegram bot instance (node-telegram-bot-api classic)
 */
function registerHandlers(bot) {
  // Command handlers - classic API using onText
  bot.onText(/^\/start(?:@\w+)?(?:\s|$)/, (msg) => handleStart(bot, msg));
  bot.onText(/^\/help(?:@\w+)?(?:\s|$)/, (msg) => handleHelp(bot, msg));

  // Commands with optional arguments
  bot.onText(/\/balance(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleBalance(bot, msg, args);
  });
  bot.onText(/\/predict(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handlePredict(bot, msg, args);
  });
  bot.onText(/\/molar(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleMolar(bot, msg, args);
  });
  bot.onText(/\/stoich(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleStoich(bot, msg, args);
  });
  bot.onText(/\/ph(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handlePh(bot, msg, args);
  });
  bot.onText(/\/element(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleElement(bot, msg, args);
  });
  bot.onText(/\/iupac(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleIupac(bot, msg, args);
  });
  bot.onText(/\/ask(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleAsk(bot, msg, args);
  });
  bot.onText(/\/safety(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleSafety(bot, msg, args);
  });
  bot.onText(/\/search(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleSearch(bot, msg, args);
  });

  // Inline query handler - classic: query object directly
  bot.on('inline_query', (query) => handleInlineQuery(bot, query));

  // Callback query handler for inline keyboard button presses
  bot.on('callback_query', (query) => handleCallbackQuery(bot, query));

  // Message router for non-command messages
  bot.on('message', (msg) => {
    // Skip commands and channel posts - commands already handled by onText
    if (msg.text && !msg.text.startsWith('/') && msg.chat.type !== 'channel') {
      routeMessage(bot, msg);
    }
  });

  // Edited message support — node-telegram-bot-api#processUpdate (lib/telegram.js:827-835)
  // only emits 'edited_message' / 'edited_message_text' for update.edited_message,
  // it does NOT run _textRegexpCallbacks (onText) for edited messages.
  // If user sent "/molar" (empty -> error) then edited to "/molar H2SO4", onText never fires.
  // Re-dispatch edited text through the same onText callbacks to fix the 9:47/9:48 edge.
  bot.on('edited_message', (msg) => {
    const text = msg.text || msg.caption || '';
    if (!text) return;
    let matched = false;
    if (bot._textRegexpCallbacks && bot._textRegexpCallbacks.length) {
      bot._textRegexpCallbacks.some((reg) => {
        if (!(reg.regexp instanceof RegExp)) reg.regexp = new RegExp(reg.regexp);
        const result = reg.regexp.exec(text);
        if (!result) return false;
        reg.regexp.lastIndex = 0;
        reg.callback(msg, result);
        matched = true;
        return bot.options && bot.options.onlyFirstMatch;
      });
    }
    // Non-command edited text: run auto-detection (equations / formulas / greetings)
    if (!matched && !text.trim().startsWith('/') && msg.chat && msg.chat.type !== 'channel') {
      routeMessage(bot, msg);
    }
  });

  logger.info('Bot handlers registered successfully');
}

module.exports = { registerHandlers };
