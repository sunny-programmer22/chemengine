/**
 * Reacto Web Chat Client
 * Connects frontend homepage chat interface to the backend API
 */

document.addEventListener('DOMContentLoaded', () => {
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  if (!chatMessages || !chatInput || !chatSend) return;

  const STORAGE_KEY = 'reacto-chat-history';

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved) && saved.length > 0) {
        saved.forEach(msg => appendMessage(msg.text, msg.sender, false));
        return;
      }
    } catch {}
    // Default welcome
    appendMessage("Hey! 👋 I'm Reacto, your chemistry AI. Ask me anything, balance equations, calculate molar mass, or tap a quick action below!", 'bot', false);
  }

  function saveHistory() {
    try {
      const msgs = Array.from(chatMessages.querySelectorAll('.chat-msg')).map(el => ({
        text: el.querySelector('.chat-msg-text').textContent,
        sender: el.classList.contains('user') ? 'user' : 'bot'
      })).slice(-40); // keep last 40
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {}
  }

  function appendMessage(text, sender, save = true) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + sender;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🧪';

    const content = document.createElement('div');
    content.className = 'chat-msg-content';

    const textEl = document.createElement('div');
    textEl.className = 'chat-msg-text';
    try {
      textEl.innerHTML = formatMarkdown(text);
    } catch (_) {
      textEl.textContent = String(text); // safest fallback — never let a render bug kill the chat
    }

    content.appendChild(textEl);
    div.appendChild(avatar);
    div.appendChild(content);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (save) saveHistory();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  function formatMarkdown(text) {
    if (text === null || text === undefined) return '';
    text = String(text);

    // Escape HTML first (including quotes + backticks so they can't break markup or inject)
    let escaped = escapeHtml(text);

    // Code blocks
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code
    escaped = escaped.replace(/&#96;([^&#96;]+)&#96;/g, '<code>$1</code>');
    // Bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Newlines
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'chat-msg bot typing-indicator';
    div.id = 'typing-indicator';
    div.innerHTML = '<div class="chat-avatar">🧪</div><div class="chat-msg-content"><div class="chat-msg-text"><span>.</span><span>.</span><span>.</span></div></div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    const msg = text.trim();
    chatInput.value = '';

    try {
      appendMessage(msg, 'user');
      showTyping();

      // Determine API URL (same origin or local dev server)
      const apiUrl = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'http://localhost:3000/api/chat'
        : '/api/chat';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });

      hideTyping();

      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (!res.ok) {
        const serverMsg = data && data.reply ? data.reply : ('Server responded with ' + res.status);
        appendMessage('⚠️ ' + serverMsg, 'bot');
        return;
      }

      appendMessage((data && data.reply) || 'No response received.', 'bot');
    } catch (err) {
      try { hideTyping(); } catch (_) {}
      appendMessage('⚠️ Could not connect to chat server. Make sure the backend is running or use the Telegram bot at t.me/ReactoLab_bot', 'bot');
    }
  }

  // Wire up the handlers inside their own guard so no single bad listener
  // (or a blocked/inaccessible element) can take down the whole chat.
  try {
    chatSend.addEventListener('click', () => sendMessage(chatInput.value));
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(chatInput.value);
      }
    });

    // Quick action buttons
    document.querySelectorAll('.chat-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) sendMessage(prompt);
      });
    });

    // Focus input so the user can type immediately on mobile/desktop
    if ('requestAnimationFrame' in window) {
      requestAnimationFrame(() => { try { chatInput.focus({ preventScroll: true }); } catch (_) {} });
    }
  } catch (err) {
    // Chat handlers failed to attach — surface an inline fallback rather than nothing.
    try { appendMessage('⚠️ Something went wrong starting the chat. Please reload the page.', 'bot'); } catch (_) {}
  }

  loadHistory();
});
