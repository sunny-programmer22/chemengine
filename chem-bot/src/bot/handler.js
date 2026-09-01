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
const organic = require('../tools/organic');
const llm = require('../llm/index');

// Patterns for auto-detection
const EQUATION_PATTERN = /(?:->|→|<->|⇌|[0-9]?\s*[A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*\s*(?:\+|→|->|<->|⇌)\s*)+/i;
const FORMULA_WITH_NUMBER_PATTERN = /^([A-Z][a-z]?[0-9]*(?:\([^)]+\)[0-9]*)*)\s+(\d+(?:\.\d+)?)\s*$/i;
const GREETINGS = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'sup', 'how are you', 'how are you?', 'how r u', "how's it going", "what's up", 'whats up', 'how are u'];

// User state map for button flow — after clicking a button, next plain text is treated as input for that action without slash
const userAwaiting = new Map(); // chatId -> {action, expires}

function setAwaiting(chatId, action) { userAwaiting.set(chatId, {action, expires: Date.now()+5*60*1000}); }
function getAwaiting(chatId) { const e=userAwaiting.get(chatId); if(!e) return null; if(Date.now()>e.expires){userAwaiting.delete(chatId); return null;} return e.action; }
function clearAwaiting(chatId) { userAwaiting.delete(chatId); }

// ── Follow-up inline keyboards (next-step UX everywhere) ──────────────
const KB = {
  balance: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔮 Predict Reaction', callback_data: 'cmd_predict' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  molar: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '🔮 Predict Reaction', callback_data: 'cmd_predict' }],
        [{ text: '⚠️ Safety', callback_data: 'cmd_safety' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }, { text: '📖 IUPAC', callback_data: 'cmd_iupac' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    }
  },
  predict: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '🏠 Menu', callback_data: 'cmd_start' }, { text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    }
  },
  element: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '📖 IUPAC', callback_data: 'cmd_iupac' }],
        [{ text: '⚠️ Safety', callback_data: 'cmd_safety' }, { text: '⚖️ Balance', callback_data: 'cmd_balance' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  ph: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  stoich: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }],
        [{ text: '🔮 Predict', callback_data: 'cmd_predict' }, { text: '⚗️ pH', callback_data: 'cmd_ph' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  organic: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }, { text: '🔬 Stereo', callback_data: 'cmd_stereo' }],
        [{ text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '📖 IUPAC', callback_data: 'cmd_iupac' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  hydrocarbon: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '🔬 Stereo', callback_data: 'cmd_stereo' }, { text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }],
        [{ text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '📖 IUPAC', callback_data: 'cmd_iupac' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  mechanism: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }, { text: '🔬 Stereo', callback_data: 'cmd_stereo' }],
        [{ text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '🤖 Ask AI', callback_data: 'cmd_ask' }, { text: '📚 Help', callback_data: 'cmd_help' }],
        [{ text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  functional: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }],
        [{ text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }, { text: '🔬 Stereo', callback_data: 'cmd_stereo' }],
        [{ text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  stereo: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }, { text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }],
        [{ text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '🔮 Predict', callback_data: 'cmd_predict' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  spectroscopy: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }, { text: '🔬 Stereo', callback_data: 'cmd_stereo' }],
        [{ text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }, { text: '📖 IUPAC', callback_data: 'cmd_iupac' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  iupac: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '🔍 Search', callback_data: 'cmd_search' }],
        [{ text: '⚠️ Safety', callback_data: 'cmd_safety' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  safety: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚗️ pH', callback_data: 'cmd_ph' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  search: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }],
        [{ text: '🔬 Element', callback_data: 'cmd_element' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '🔍 Search Again', callback_data: 'cmd_search' }, { text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    }
  },
  help: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '🔮 Predict', callback_data: 'cmd_predict' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '⚗️ pH', callback_data: 'cmd_ph' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }],
        [{ text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '🔬 Stereo', callback_data: 'cmd_stereo' }, { text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '🤖 Ask AI', callback_data: 'cmd_ask' }, { text: '🔍 Search', callback_data: 'cmd_search' }],
        [{ text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  ask: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Functional Groups', callback_data: 'topic_groups' }, { text: '⚗️ Reaction Types', callback_data: 'topic_reactions' }],
        [{ text: '🧪 Acids & Bases', callback_data: 'topic_acids' }, { text: '📚 Periodic Trends', callback_data: 'topic_periodic' }],
        [{ text: '⚛️ Mechanisms', callback_data: 'topic_mechanism' }, { text: '📖 IUPAC Naming', callback_data: 'topic_naming' }],
        [{ text: '🏠 Menu', callback_data: 'cmd_start' }, { text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    }
  },
  organic_short: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧬 Next: Functional Groups', callback_data: 'topic_groups' }, { text: '⚗️ Next: Reactions', callback_data: 'topic_reactions' }],
        [{ text: '🧪 Acids & Bases', callback_data: 'topic_acids' }, { text: '🏠 Menu', callback_data: 'cmd_start' }]
      ]
    }
  },
  greeting: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '⚛️ Molar', callback_data: 'cmd_molar' }],
        [{ text: '🤖 Ask AI', callback_data: 'cmd_ask' }, { text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    }
  }
};

// Topic preset questions for organic follow-ups
const TOPIC_QUESTIONS = {
  topic_groups: 'Explain functional groups in organic chemistry with examples — alcohol, aldehyde, ketone, carboxylic acid, amine, etc.',
  topic_reactions: 'Explain the main types of chemical reactions — synthesis, decomposition, single and double replacement, combustion, redox — with examples.',
  topic_acids: 'Explain acids and bases: Arrhenius, Brønsted-Lowry, Lewis, pH scale, conjugate acid-base pairs with examples.',
  topic_periodic: 'Explain periodic trends: atomic radius, ionization energy, electronegativity, electron affinity across periods and groups.',
  topic_mechanism: 'Explain organic reaction mechanisms: SN1, SN2, E1, E2 — how they work, stereochemistry and examples.',
  topic_naming: 'Explain IUPAC naming rules for organic compounds: alkanes, alkenes, alkynes, with examples.'
};

/**
 * Send welcome message for /start command
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const welcomeText = `
<b>🧪 Welcome to the Chemistry Bot!</b>

I can help you with all things chemistry. Tap a button below to get started:

${formatList([
  '⚖️ Balance Equations — Tap ⚖️ Balance below',
  '🔮 Predict Reaction — Tap 🔮 Predict below',
  '⚛️ Molar Mass — Tap ⚛️ Molar Mass below',
  '📊 Stoichiometry — Tap 📊 Stoichiometry below',
  '⚗️ pH Calculator — Tap ⚗️ pH below',
  '🔬 Element Info — Tap 🔬 Element below',
  '📖 IUPAC Lookup — Tap 📖 IUPAC below',
  '🤖 Ask AI — Tap 🤖 Ask AI below',
  '⚠️ Safety Info — Tap ⚠️ Safety below',
  '🔍 Chemistry Search — Tap 🔍 Search below',
  '🧬 Organic Analysis — Tap 🧬 Organic below',
  '⛽ Hydrocarbon — Tap ⛽ Hydrocarbon below',
  '⚙️ Mechanism — Tap ⚙️ Mechanism below',
  '🧩 Functional Groups — Tap 🧩 Functional below',
  '🔬 Stereo — Tap 🔬 Stereo below',
  '🌈 Spectroscopy — Tap 🌈 Spectroscopy below',
  '📚 Help — Tap 📚 Help below'
])}

<b>Quick Tips:</b>
• Just type a chemical equation like "H2 + O2 → H2O" to balance it
• Type a formula like "H2SO4" for instant molar mass
• Try tapping 🧬 Organic or ⛽ Hydrocarbon for organic help!
• Or tap any button below — no need to type commands!

<i>Powered by PubChem, Wikidata, and AI</i>
`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚖️ Balance', callback_data: 'cmd_balance' }, { text: '🔮 Predict', callback_data: 'cmd_predict' }],
        [{ text: '⚛️ Molar Mass', callback_data: 'cmd_molar' }, { text: '🔬 Element', callback_data: 'cmd_element' }],
        [{ text: '⚗️ pH', callback_data: 'cmd_ph' }, { text: '📊 Stoichiometry', callback_data: 'cmd_stoich' }],
        [{ text: '📖 IUPAC', callback_data: 'cmd_iupac' }, { text: '⚠️ Safety', callback_data: 'cmd_safety' }],
        [{ text: '🧬 Organic', callback_data: 'cmd_organic' }, { text: '⛽ Hydrocarbon', callback_data: 'cmd_hydrocarbon' }],
        [{ text: '⚙️ Mechanism', callback_data: 'cmd_mechanism' }, { text: '🧩 Functional', callback_data: 'cmd_functional' }],
        [{ text: '🔬 Stereo', callback_data: 'cmd_stereo' }, { text: '🌈 Spectroscopy', callback_data: 'cmd_spectroscopy' }],
        [{ text: '🤖 Ask AI', callback_data: 'cmd_ask' }, { text: '🔍 Search', callback_data: 'cmd_search' }],
        [{ text: '📚 Help', callback_data: 'cmd_help' }]
      ]
    },
    parse_mode: 'HTML'
  };

  // Persistent ReplyKeyboardMarkup — alternative bottom-row buttons (always visible)
  // Telegram ReplyKeyboardMarkup stays at bottom of chat for quick access
  const persistentReplyKeyboard = {
    keyboard: [
      [{ text: '⚖️ Balance' }, { text: '🔮 Predict' }],
      [{ text: '⚛️ Molar Mass' }, { text: '🔬 Element' }],
      [{ text: '⚗️ pH' }, { text: '📊 Stoichiometry' }],
      [{ text: '📖 IUPAC' }, { text: '⚠️ Safety' }],
      [{ text: '🧬 Organic' }, { text: '⛽ Hydrocarbon' }],
      [{ text: '⚙️ Mechanism' }, { text: '🧩 Functional' }],
      [{ text: '🔬 Stereo' }, { text: '🌈 Spectroscopy' }],
      [{ text: '🤖 Ask AI' }, { text: '🔍 Search' }],
      [{ text: '📚 Help' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false
  };
  // Expose for optional use: send with { reply_markup: persistentReplyKeyboard } to show bottom bar
  void persistentReplyKeyboard;

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
<b>📚 Chemistry Bot — Tap a Button to Start</b>

<b>Getting Started:</b>
${formatList([
  '🏠 Start — Tap 📚 Help to see the welcome screen',
  '📚 Help — You are here! Tap any button below'
])}

<b>Chemistry Tools:</b>
${formatList([
  '⚖️ Balance Equations — Tap ⚖️ Balance then send H2 + O2 → H2O',
  '🔮 Predict Reaction — Tap 🔮 Predict then send Na + Cl2',
  '⚛️ Molar Mass — Tap ⚛️ Molar Mass then send H2SO4',
  '📊 Stoichiometry — Tap 📊 Stoichiometry then send equation + amount',
  '⚗️ pH Calculator — Tap ⚗️ pH then send HCl 0.1',
  '🔬 Element Info — Tap 🔬 Element then send Fe or Iron or 26',
  '📖 IUPAC Lookup — Tap 📖 IUPAC then send acetic acid'
])}

<b>Organic Chemistry:</b>
${formatList([
  '🧬 Organic Analysis — Tap 🧬 Organic then send C2H5OH',
  '⛽ Hydrocarbon — Tap ⛽ Hydrocarbon then send C6H6',
  '⚙️ Mechanism — Tap ⚙️ Mechanism then send SN1',
  '🧩 Functional Groups — Tap 🧩 Functional then send CH3COOH',
  '🔬 Stereo — Tap 🔬 Stereo then send but-2-ene',
  '🌈 Spectroscopy — Tap 🌈 Spectroscopy then send C2H5OH'
])}

<b>AI-Powered:</b>
${formatList([
  '🤖 Ask AI — Tap 🤖 Ask AI then send any chemistry question',
  '⚠️ Safety Info — Tap ⚠️ Safety then send H2SO4',
  '🔍 Chemistry Search — Tap 🔍 Search then send Vitamin C'
])}

<b>Examples — tap a button first, then type:</b>
<pre>
Tap ⚛️ Molar Mass → NaCl
Tap ⚛️ Molar Mass → Ca(OH)2
Tap 🔬 Element → gold
Tap ⚖️ Balance → CH4 + O2 → CO2 + H2O
Tap 🔮 Predict → Zn + HCl
Tap 🧬 Organic → C2H5OH
Tap ⛽ Hydrocarbon → C6H6
Tap ⚙️ Mechanism → SN1
Tap 🧩 Functional → CH3COOH
Tap 🔬 Stereo → lactic acid
Tap 🌈 Spectroscopy → C2H5OH
Tap 🤖 Ask AI → What is the mechanism of SN1 reactions?
</pre>

👇 Tap any button below or just type a formula like H2O!
`;

  // Persistent ReplyKeyboardMarkup alternative — bottom row buttons (always visible)
  const helpPersistentKeyboard = {
    keyboard: [
      [{ text: '⚖️ Balance' }, { text: '🔮 Predict' }],
      [{ text: '⚛️ Molar Mass' }, { text: '🔬 Element' }],
      [{ text: '⚗️ pH' }, { text: '📊 Stoichiometry' }],
      [{ text: '📖 IUPAC' }, { text: '⚠️ Safety' }],
      [{ text: '🧬 Organic' }, { text: '⛽ Hydrocarbon' }],
      [{ text: '⚙️ Mechanism' }, { text: '🧩 Functional' }],
      [{ text: '🔬 Stereo' }, { text: '🌈 Spectroscopy' }],
      [{ text: '🤖 Ask AI' }, { text: '🔍 Search' }],
      [{ text: '📚 Help' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false
  };
  void helpPersistentKeyboard;

  try {
    await bot.sendMessage(chatId, helpText.trim(), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide a chemical equation.\nTap ⚖️ Balance and just type: H2 + O2 -> H2O', { parse_mode: 'HTML', ...KB.balance });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await balancer.balance(equation);
    const message = `<b>⚖️ Balanced Equation</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.balance);
  } catch (err) {
    logger.error('Balance error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide reactants.\nTap 🔮 Predict and just type: Na + Cl2', { parse_mode: 'HTML', ...KB.predict });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await predictor.predict(reactants);
    const message = `<b>🔮 Reaction Prediction</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.predict);
  } catch (err) {
    logger.error('Predict error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide a chemical formula.\nTap ⚛️ Molar Mass and just type: H2SO4', { parse_mode: 'HTML', ...KB.molar });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await molar.calculate(formula);
    const message = `<b>⚛️ Molar Mass Calculator</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.molar);
  } catch (err) {
    logger.error('Molar mass error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
      'Please provide full details.\nTap 📊 Stoichiometry and just type: 2H2 + O2 -> 2H2O H2O 10 mol\nFormat: <equation> <compound> <amount> <unit>',
      { parse_mode: 'HTML', ...KB.stoich }
    );
    return;
  }

  // Parse arguments - find the equation, then compound, amount, unit
  const input = args.join(' ');
  const eqMatch = input.match(/(.+?)\s+(\w+(?:\([^)]+\))?\d*)\s+(\d+(?:\.\d+)?)\s*(mol|g|kg|mg|mol|mmol)?$/i);

  if (!eqMatch) {
    await bot.sendMessage(chatId, 'Could not parse the arguments. Please check the format.', { parse_mode: 'HTML', ...KB.stoich });
    return;
  }

  const [, equation, compound, amount, unit] = eqMatch;

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await stoichiometry.calculate(equation, compound, parseFloat(amount), unit || 'mol');
    const message = `<b>📊 Stoichiometry Calculation</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.stoich);
  } catch (err) {
    logger.error('Stoichiometry error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide formula and concentration.\nTap ⚗️ pH and just type: HCl 0.1\nNote: Concentration in mol/L (M)', { parse_mode: 'HTML', ...KB.ph });
    return;
  }

  const formula = args[0];
  const concStr = args.slice(1).join(' ');
  const concentration = parseFloat(concStr);

  if (isNaN(concentration) || concentration <= 0) {
    await bot.sendMessage(chatId, 'Please provide a valid positive concentration.\nTap ⚗️ pH and just type: HCl 0.1', { parse_mode: 'HTML', ...KB.ph });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await phCalc.calculate(formula, concentration);
    const message = `<b>⚗️ pH Calculator</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.ph);
  } catch (err) {
    logger.error('pH calculation error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide an element symbol, name, or atomic number.\nTap 🔬 Element and just type: Fe or Iron or 26', { parse_mode: 'HTML', ...KB.element });
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
    await sendFormattedMessage(bot, chatId, message, KB.element);
  } catch (err) {
    logger.error('Element lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide a compound name to look up.\nTap 📖 IUPAC and just type: acetic acid', { parse_mode: 'HTML', ...KB.iupac });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await iupac.lookup(name);
    const message = `<b>📖 IUPAC Name Lookup</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.iupac);
  } catch (err) {
    logger.error('IUPAC lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please ask a chemistry question.\nTap 🤖 Ask AI and just type: What is the mechanism of SN1 reactions?', { parse_mode: 'HTML', ...KB.ask });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await (llm.askChem || llm.ask)(question, msg.from);
    const answer = result && typeof result === 'object' ? (result.answer || String(result)) : String(result);
    await sendFormattedMessage(bot, chatId, answer, KB.ask);
  } catch (err) {
    logger.error('LLM ask error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide a chemical formula or name.\nTap ⚠️ Safety and just type: H2SO4', { parse_mode: 'HTML', ...KB.safety });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await safety.getInfo(formula);
    const message = `<b>⚠️ Safety Information</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.safety);
  } catch (err) {
    logger.error('Safety lookup error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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
    await bot.sendMessage(chatId, 'Please provide a search query.\nTap 🔍 Search and just type: Vitamin C', { parse_mode: 'HTML', ...KB.search });
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await search.query(query);
    const message = `<b>🔍 Search Results</b>\n\n${result}`;
    await sendFormattedMessage(bot, chatId, message, KB.search);
  } catch (err) {
    logger.error('Search error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /organic command - general organic analysis (DBE, classification, functional hints)
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleOrganic(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a formula or name.\nTap 🧬 Organic and just type: <code>C2H5OH</code> or <code>benzene</code>\nExamples: <code>CH3COOH</code>, <code>glucose</code>',
      { parse_mode: 'HTML', ...KB.organic }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await organic.analyzeOrganic(query);
    await sendFormattedMessage(bot, chatId, result, KB.organic);
  } catch (err) {
    logger.error('Organic error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /hydrocarbon command - hydrocarbon classification
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleHydrocarbon(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a hydrocarbon formula.\nTap ⛽ Hydrocarbon and just type: <code>C6H6</code>\nExamples: <code>CH4</code>, <code>C2H4</code>, <code>C2H2</code>',
      { parse_mode: 'HTML', ...KB.hydrocarbon }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await organic.analyzeHydrocarbon(query);
    await sendFormattedMessage(bot, chatId, result, KB.hydrocarbon);
  } catch (err) {
    logger.error('Hydrocarbon error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /mechanism command - reaction mechanism explanation
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleMechanism(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a mechanism type or reaction.\nTap ⚙️ Mechanism and just type: <code>SN1</code>\nExamples: <code>SN2</code>, <code>E1</code>, <code>addition</code>, <code>EAS</code>',
      { parse_mode: 'HTML', ...KB.mechanism }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await organic.explainMechanism(query);
    await sendFormattedMessage(bot, chatId, result, KB.mechanism);
  } catch (err) {
    logger.error('Mechanism error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /functional command - functional group identification
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleFunctional(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a formula or name.\nTap 🧩 Functional and just type: <code>CH3COOH</code>\nExamples: <code>C2H5OH</code>, <code>benzene</code>',
      { parse_mode: 'HTML', ...KB.functional }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await organic.identifyFunctional(query);
    await sendFormattedMessage(bot, chatId, result, KB.functional);
  } catch (err) {
    logger.error('Functional error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /stereo command - stereochemistry & isomerism
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleStereo(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a formula or name.\nTap 🔬 Stereo and just type: <code>but-2-ene</code>\nExamples: <code>lactic acid</code>, <code>glucose</code>, <code>C4H8</code>',
      { parse_mode: 'HTML', ...KB.stereo }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await organic.explainStereo(query);
    await sendFormattedMessage(bot, chatId, result, KB.stereo);
  } catch (err) {
    logger.error('Stereo error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
  }
}

/**
 * Handle /spectroscopy command - IR/NMR/MS analysis
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Message object
 * @param {string[]} args - Command arguments
 */
async function handleSpectroscopy(bot, msg, args) {
  const chatId = msg.chat.id;
  const query = args.join(' ').trim();

  if (!query) {
    await bot.sendMessage(chatId,
      'Please provide a spectrum or compound query.\nTap 🌈 Spectroscopy and just type: <code>C2H5OH</code> or <code>IR carbonyl</code>\nExamples: <code>NMR aldehyde</code>, <code>MS 91</code>',
      { parse_mode: 'HTML', ...KB.spectroscopy }
    );
    return;
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await (organic.analyzeSpectroscopy || organic.getSpectroscopy || organic.getSpectroscopyInfo)(query);
    await sendFormattedMessage(bot, chatId, result, KB.spectroscopy);
  } catch (err) {
    logger.error('Spectroscopy error:', err);
    await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help });
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

  // ── Button flow: if user clicked a button, next plain text is input for that action (no slash needed)
  const awaiting = getAwaiting(chatId);
  if (awaiting) {
    clearAwaiting(chatId);
    switch (awaiting) {
      case 'balance': await handleBalance(bot, msg, [text.trim()]); return;
      case 'predict': await handlePredict(bot, msg, [text.trim()]); return;
      case 'molar': await handleMolar(bot, msg, [text.trim()]); return;
      case 'stoich': await handleStoich(bot, msg, text.trim().split(/\s+/)); return;
      case 'element': await handleElement(bot, msg, [text.trim()]); return;
      case 'ph': await handlePh(bot, msg, text.trim().split(/\s+/)); return;
      case 'iupac': await handleIupac(bot, msg, [text.trim()]); return;
      case 'ask': await handleAsk(bot, msg, [text.trim()]); return;
      case 'safety': await handleSafety(bot, msg, [text.trim()]); return;
      case 'search': await handleSearch(bot, msg, [text.trim()]); return;
      case 'organic': await handleOrganic(bot, msg, [text.trim()]); return;
      case 'hydrocarbon': await handleHydrocarbon(bot, msg, [text.trim()]); return;
      case 'mechanism': await handleMechanism(bot, msg, [text.trim()]); return;
      case 'functional': await handleFunctional(bot, msg, [text.trim()]); return;
      case 'stereo': await handleStereo(bot, msg, [text.trim()]); return;
      case 'spectroscopy': await handleSpectroscopy(bot, msg, [text.trim()]); return;
      default: break;
    }
  }

  // Check for greetings / casual human chat - very short replies with quick nav
  const lowerText = text.toLowerCase().trim();
  const casualPhrases = ['how are you', 'how r u', "how's it going", "what's up", 'whats up', 'how are u', 'hru', 'wbu', 'what about you', 'i am fine', "i'm fine", 'i am good', "i'm good"];
  if (GREETINGS.some(g => lowerText === g || lowerText.startsWith(g + ' ') || lowerText.startsWith(g + '?') || lowerText.startsWith(g + '!'))) {
    const greetings = ['Hey! 👋', 'Hi there! 🧪', 'Hello! 😊', 'Hey there!'];
    await bot.sendMessage(chatId, greetings[Math.floor(Math.random() * greetings.length)], { ...KB.greeting });
    return;
  }
  if (casualPhrases.some(p => lowerText === p || lowerText.startsWith(p) || lowerText.includes(p))) {
    const casualReplies = ["I'm good! 😊 How about you?", "Doing great! You?", "All good here! 👋", "Great! How can I help? 😊"];
    // Specific handling for "how are you"
    if (lowerText.includes('how are you') || lowerText.includes('how r u') || lowerText.includes('how are u') || lowerText.includes('hru')) {
      await bot.sendMessage(chatId, casualReplies[Math.floor(Math.random() * casualReplies.length)], { ...KB.greeting });
      return;
    }
    if (lowerText.includes("what's up") || lowerText.includes('whats up') || lowerText.includes('sup')) {
      await bot.sendMessage(chatId, "Not much! Just chilling with chemistry 🧪 You?", { ...KB.greeting });
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

  // Unknown input - try LLM for general chat (organic explanations can be longer, with next-step buttons)
  try {
    await bot.sendChatAction(chatId, 'typing');
    const result = await llm.askChem(text, msg.from);
    const answer = result && typeof result === 'object' ? (result.answer || String(result)) : String(result);
    await sendFormattedMessage(bot, chatId, answer, KB.organic_short);
    return;
  } catch {}
  await bot.sendMessage(chatId, 'Hey! 😊 Try tapping 📚 Help for chemistry stuff!', { parse_mode: 'HTML', ...KB.help });
}

/**
 * Send a formatted message, splitting if necessary, with optional inline keyboard on last chunk
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {string} text - Message text
 * @param {Object} [extra] - Extra options like reply_markup (applied to last chunk only)
 */
async function sendFormattedMessage(bot, chatId, text, extra = {}) {
  const { config } = require('../config');
  const chunks = splitMessage(text, config.maxMessageLength);

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const opts = { parse_mode: 'HTML', ...(isLast ? extra : {}) };
    await bot.sendMessage(chatId, chunks[i], opts);
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

  // Organic topic follow-ups — use LLM to explain then offer next steps
  if (data && data.startsWith('topic_')) {
    const question = TOPIC_QUESTIONS[data];
    if (question) {
      try {
        await bot.sendChatAction(chatId, 'typing');
        const result = await llm.askChem(question, query.from);
        const answer = result && typeof result === 'object' ? (result.answer || String(result)) : String(result);
        await sendFormattedMessage(bot, chatId, answer, KB.ask);
      } catch (err) {
        logger.warn('Topic LLM failed:', err.message);
        const fallbackHints = {
          topic_groups: '🧬 <b>Functional Groups</b>\n\nJust type: <code>What are functional groups? Give examples</code>',
          topic_reactions: '⚗️ <b>Reaction Types</b>\n\nJust type: <code>Explain reaction types with examples</code>',
          topic_acids: '🧪 <b>Acids &amp; Bases</b>\n\nJust type: <code>Explain acids and bases and pH</code>',
          topic_periodic: '📚 <b>Periodic Trends</b>\n\nJust type: <code>Explain periodic trends</code>',
          topic_mechanism: '⚛️ <b>Mechanisms</b>\n\nJust type: <code>Explain SN1 vs SN2 mechanisms</code>',
          topic_naming: '📖 <b>IUPAC Naming</b>\n\nJust type: <code>How to name organic compounds IUPAC?</code>'
        };
        await bot.sendMessage(chatId, fallbackHints[data] || 'Just type your question!', { parse_mode: 'HTML', ...KB.ask });
      }
      return;
    }
  }

  try {
    switch (data) {
      case 'cmd_start':
        await handleStart(bot, syntheticMsg);
        break;
      case 'cmd_help':
        await handleHelp(bot, syntheticMsg);
        break;
      case 'cmd_balance':
        setAwaiting(chatId, 'balance');
        await bot.sendMessage(chatId, '⚖️ <b>Balance Chemical Equations</b>\n\nJust type: <code>H2 + O2 -> H2O</code>', { parse_mode: 'HTML', ...KB.balance });
        break;
      case 'cmd_predict':
        setAwaiting(chatId, 'predict');
        await bot.sendMessage(chatId, '🔮 <b>Predict Reaction Products</b>\n\nJust type: <code>Na + Cl2</code>\nExample: <code>Zn + HCl</code>', { parse_mode: 'HTML', ...KB.predict });
        break;
      case 'cmd_molar':
        setAwaiting(chatId, 'molar');
        await bot.sendMessage(chatId, '⚛️ <b>Molar Mass Calculator</b>\n\nJust type: <code>H2SO4</code>\nExamples: <code>NaCl</code>, <code>Ca(OH)2</code>', { parse_mode: 'HTML', ...KB.molar });
        break;
      case 'cmd_stoich':
        setAwaiting(chatId, 'stoich');
        await bot.sendMessage(chatId, '📊 <b>Stoichiometry</b>\n\nJust type: <code>2H2 + O2 -> 2H2O H2O 10 mol</code>', { parse_mode: 'HTML', ...KB.stoich });
        break;
      case 'cmd_element':
        setAwaiting(chatId, 'element');
        await bot.sendMessage(chatId, '🔬 <b>Element Information</b>\n\nJust type: <code>Fe</code> or <code>Iron</code> or <code>26</code>', { parse_mode: 'HTML', ...KB.element });
        break;
      case 'cmd_ph':
        setAwaiting(chatId, 'ph');
        await bot.sendMessage(chatId, '⚗️ <b>pH Calculator</b>\n\nJust type: <code>HCl 0.1</code>\nUsage: <code>&lt;formula&gt; &lt;concentration&gt;</code>', { parse_mode: 'HTML', ...KB.ph });
        break;
      case 'cmd_iupac':
        setAwaiting(chatId, 'iupac');
        await bot.sendMessage(chatId, '📖 <b>IUPAC Lookup</b>\n\nJust type: <code>acetic acid</code>', { parse_mode: 'HTML', ...KB.iupac });
        break;
      case 'cmd_ask':
        setAwaiting(chatId, 'ask');
        await bot.sendMessage(chatId, '🤖 <b>Ask Chemistry Question</b>\n\nJust type: <code>What is the mechanism of SN1 reactions?</code>', { parse_mode: 'HTML', ...KB.ask });
        break;
      case 'cmd_safety':
        setAwaiting(chatId, 'safety');
        await bot.sendMessage(chatId, '⚠️ <b>Safety Information</b>\n\nJust type: <code>H2SO4</code>', { parse_mode: 'HTML', ...KB.safety });
        break;
      case 'cmd_search':
        setAwaiting(chatId, 'search');
        await bot.sendMessage(chatId, '🔍 <b>Search Chemistry Databases</b>\n\nJust type: <code>Vitamin C</code>', { parse_mode: 'HTML', ...KB.search });
        break;
      case 'cmd_organic':
        setAwaiting(chatId, 'organic');
        await bot.sendMessage(chatId, '🧬 <b>Organic Analysis</b>\n\nJust type: <code>C2H5OH</code> or <code>benzene</code>\nExamples: <code>CH3COOH</code>, <code>glucose</code>', { parse_mode: 'HTML', ...KB.organic });
        break;
      case 'cmd_hydrocarbon':
        setAwaiting(chatId, 'hydrocarbon');
        await bot.sendMessage(chatId, '⛽ <b>Hydrocarbon Classification</b>\n\nJust type: <code>C6H6</code>\nExamples: <code>CH4</code>, <code>C2H4</code>, <code>C2H2</code>', { parse_mode: 'HTML', ...KB.hydrocarbon });
        break;
      case 'cmd_mechanism':
        setAwaiting(chatId, 'mechanism');
        await bot.sendMessage(chatId, '⚙️ <b>Reaction Mechanisms</b>\n\nJust type: <code>SN1</code>\nExamples: <code>SN2</code>, <code>E1</code>, <code>E2</code>, <code>addition</code>', { parse_mode: 'HTML', ...KB.mechanism });
        break;
      case 'cmd_functional':
        setAwaiting(chatId, 'functional');
        await bot.sendMessage(chatId, '🧩 <b>Functional Groups</b>\n\nJust type: <code>CH3COOH</code>\nExamples: <code>C2H5OH</code>, <code>benzene</code>', { parse_mode: 'HTML', ...KB.functional });
        break;
      case 'cmd_stereo':
        setAwaiting(chatId, 'stereo');
        await bot.sendMessage(chatId, '🔬 <b>Stereochemistry</b>\n\nJust type: <code>but-2-ene</code>\nExamples: <code>lactic acid</code>, <code>glucose</code>', { parse_mode: 'HTML', ...KB.stereo });
        break;
      case 'cmd_spectroscopy':
        setAwaiting(chatId, 'spectroscopy');
        await bot.sendMessage(chatId, '🔬 <b>Spectroscopy</b>\n\nJust type: <code>IR carbonyl</code> or <code>C2H5OH</code>\nExamples: <code>NMR aldehyde</code>, <code>MS 91</code>', { parse_mode: 'HTML', ...KB.spectroscopy });
        break;
      default:
        // Generic fallback for any cmd_* not explicitly listed
        if (data && data.startsWith('cmd_')) {
          const cmd = data.replace(/^cmd_/, '');
          await bot.sendMessage(chatId, `Just type: &lt;your input&gt;\nTap Help to see all commands.`, { parse_mode: 'HTML', ...KB.help });
        } else {
          await bot.sendMessage(chatId, 'Unknown action. Tap 📚 Help to see available commands.', { parse_mode: 'HTML', ...KB.help });
        }
        break;
    }
  } catch (err) {
    logger.error('Callback query error:', err);
    try { await bot.sendMessage(chatId, formatError(err), { parse_mode: 'HTML', ...KB.help }); } catch {}
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
  bot.onText(/\/organic(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleOrganic(bot, msg, args);
  });
  bot.onText(/\/hydrocarbon(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleHydrocarbon(bot, msg, args);
  });
  bot.onText(/\/mechanism(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleMechanism(bot, msg, args);
  });
  bot.onText(/\/functional(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleFunctional(bot, msg, args);
  });
  bot.onText(/\/stereo(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleStereo(bot, msg, args);
  });
  bot.onText(/\/spectroscopy(?:@\w+)?(?:\s+(.*))?/, (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    handleSpectroscopy(bot, msg, args);
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

module.exports = {
  registerHandlers,
  // exposed for testing button flow
  setAwaiting, getAwaiting, clearAwaiting, userAwaiting,
  handleCallbackQuery, routeMessage,
  handleMolar, handleBalance, handlePredict, handleElement, handlePh, handleIupac,
  handleAsk, handleSafety, handleSearch, handleOrganic, handleHydrocarbon,
  handleMechanism, handleFunctional, handleStereo, handleSpectroscopy,
  handleStart, handleHelp,
  KB,
};
