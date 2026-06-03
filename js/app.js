/* ===== THEME TOGGLE ===== */
document.addEventListener('DOMContentLoaded', () => {
  const saved = typeof localStorage !== 'undefined' ? (localStorage.getItem('engine-theme') || 'dark') : 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (typeof localStorage !== 'undefined') localStorage.setItem('engine-theme', next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
});

/* ===== SIDEBAR / HAMBURGER ===== */
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (hamburger && sidebar && overlay) {
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); };
    hamburger.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
    overlay.addEventListener('click', closeSidebar);
    document.querySelectorAll('#sidebar nav a').forEach(a => a.addEventListener('click', closeSidebar));
  }
});

/* ===== TAB SWITCHING ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      const sec = document.getElementById('sec-' + target);
      if (sec) sec.classList.add('active');
    });
  });
});

/* ===== CLEAR BUTTONS ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.btn.secondary').forEach(btn => {
    if (btn.textContent.trim() === 'Clear') {
      btn.addEventListener('click', () => {
        const section = btn.closest('.tab-content');
        if (!section) return;
        section.querySelectorAll('textarea, input.wide-input').forEach(el => el.value = '');
        section.querySelectorAll('.output, .steps').forEach(el => {
          el.classList.remove('show', 'success', 'error');
          el.innerHTML = '';
          el.textContent = '';
        });
      });
    }
  });
});

/* ===== KEYBOARD SHORTCUTS ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const section = e.target.closest('.tab-content');
        if (!section) return;
        const primaryBtn = section.querySelector('.btn.primary');
        if (primaryBtn) { e.preventDefault(); primaryBtn.click(); }
      }
    }
  });
});

/* ===== HISTORY ===== */
const HISTORY_KEY = 'engine-history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
}

function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* quota exceeded */ }
}

function addHistory(sectionId, entry) {
  const h = getHistory();
  if (!h[sectionId]) h[sectionId] = [];
  h[sectionId].unshift({ text: entry, ts: Date.now() });
  if (h[sectionId].length > 20) h[sectionId].length = 20;
  saveHistory(h);
  renderHistory(sectionId);
}

function removeHistory(sectionId, index) {
  const h = getHistory();
  if (!h[sectionId]) return;
  h[sectionId].splice(index, 1);
  saveHistory(h);
  renderHistory(sectionId);
}

function renderHistory(sectionId) {
  const list = document.getElementById(sectionId + '-history-list');
  if (!list) return;
  const h = getHistory();
  const items = h[sectionId] || [];
  list.innerHTML = '';
  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = '<span>' + escapeHtml(item.text) + '</span><button class="del-btn" data-idx="' + i + '" data-section="' + sectionId + '">✕</button>';
    div.querySelector('.del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeHistory(sectionId, i);
    });
    list.appendChild(div);
  });
}

/* ===== LOADING SPINNER ===== */
function showSpinner(sectionId) {
  const sp = document.getElementById(sectionId + '-spinner');
  if (sp) sp.classList.add('active');
}

function hideSpinner(sectionId) {
  const sp = document.getElementById(sectionId + '-spinner');
  if (sp) sp.classList.remove('active');
}

/* ===== RICH EQUATION RENDERING ===== */
function renderChemEqn(eqn) {
  let h = '';
  let i = 0;
  while (i < eqn.length) {
    if (eqn[i] === '→' || eqn[i] === '⇌') {
      h += '<span class="arrow">' + eqn[i] + '</span>'; i++;
    } else if (eqn[i] === '+' || eqn[i] === ',') {
      h += '<span class="plus"> ' + eqn[i] + ' </span>'; i++;
    } else if (eqn[i] === ' ') { h += ' '; i++; }
    else {
      let comp = '';
      while (i < eqn.length && !/[+\s→⇌,]/.test(eqn[i])) { comp += eqn[i]; i++; }
      h += '<span class="compound">' + renderCompound(comp) + '</span>';
    }
  }
  return h;
}

function renderCompound(comp) {
  let h = '';
  let numStr = '';
  let i = 0;
  while (i < comp.length && /\d/.test(comp[i])) { numStr += comp[i]; i++; }
  if (numStr) h += '<span class="coeff">' + numStr + '</span>';
  let rest = '';
  for (let j = i; j < comp.length; j++) {
    if (/\d/.test(comp[j])) {
      let num = '';
      while (j < comp.length && /\d/.test(comp[j])) { num += comp[j]; j++; }
      rest += '<sub>' + num + '</sub>';
      j--;
    } else { rest += comp[j]; }
  }
  h += rest;
  return h;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

/* ===== DISPLAY FUNCTIONS ===== */
function displayOutput(el, msg, type) {
  el.innerHTML = '';
  el.classList.remove('error', 'success');
  if (typeof msg === 'string') {
    if (type === 'success' || type === 'error') { el.textContent = msg; }
    else { el.innerHTML = msg; }
  } else {
    const pre = document.createElement('pre');
    pre.textContent = msg.toString();
    el.appendChild(pre);
  }
  if (type) el.classList.add(type);
  el.classList.add('show');
}

function displayError(el, msg) {
  el.innerHTML = '';
  el.classList.remove('success');
  el.classList.add('error', 'show');
  el.textContent = msg;
}

function displaySuccess(el, msg) {
  el.innerHTML = '';
  el.classList.remove('error');
  el.classList.add('success', 'show');
  el.textContent = msg;
}

function displaySteps(el, steps) {
  el.innerHTML = '';
  if (!steps || !steps.length) return;
  steps.forEach(s => {
    const p = document.createElement('div');
    p.textContent = '> ' + s;
    el.appendChild(p);
  });
  el.classList.add('show');
}

/* ===== CARD BUILDER ===== */
function buildResultCard(type, eqn, actions) {
  const card = document.createElement('div');
  card.className = 'result-card';
  const header = document.createElement('div');
  header.className = 'card-header';
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = type;
  header.appendChild(badge);
  if (actions && actions.length) {
    const acts = document.createElement('div');
    acts.className = 'card-actions';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      acts.appendChild(btn);
    });
    header.appendChild(acts);
  }
  card.appendChild(header);
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = '<div class="chem-eqn">' + renderChemEqn(eqn) + '</div>';
  card.appendChild(body);
  return card;
}
