let balanceWorker = null;

function initBalanceWorker() {
  try {
    balanceWorker = new Worker('js/balance-worker.js');
  } catch (_) {
    balanceWorker = null;
  }
}

function solveMatrixWithWorker(A, v) {
  return new Promise((resolve, reject) => {
    if (!balanceWorker) { reject(new Error('no worker')); return; }
    const id = Math.random().toString(36).slice(2);
    const handler = (e) => {
      if (e.data.id === id) {
        balanceWorker.removeEventListener('message', handler);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.x);
      }
    };
    balanceWorker.addEventListener('message', handler);
    balanceWorker.postMessage({ A, v, id });
    setTimeout(() => { balanceWorker.removeEventListener('message', handler); reject(new Error('worker timeout')); }, 5000);
  });
}

async function solveMatrixAsync(A, v) {
  try {
    if (A.length > 4 || A[0].length > 6) {
      const x = await solveMatrixWithWorker(A, v);
      if (x) return x;
    }
  } catch (_) {}
  return math.lusolve(math.matrix(A), math.matrix(v.map(x => [x])));
}

document.addEventListener('DOMContentLoaded', () => {
  initBalanceWorker();

  const input = document.getElementById('balance-input');
  const output = document.getElementById('balance-output');
  const steps = document.getElementById('balance-steps');
  const solveBtn = document.getElementById('balance-solve');
  const exampleBtn = document.getElementById('balance-example');

  const examples = [
    'H2 + O2 -> H2O',
    'C3H8 + O2 -> CO2 + H2O',
    'Fe + O2 -> Fe2O3',
    'Al + Fe2O3 -> Al2O3 + Fe',
    'Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O',
    'C6H12O6 + O2 -> CO2 + H2O',
    'H2SO4 + NaOH -> Na2SO4 + H2O',
    'P4O10 + H2O -> H3PO4',
    'FeCl3 + NaOH -> Fe(OH)3 + NaCl',
    'KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O'
  ];
  let exIdx = 0;

  exampleBtn.addEventListener('click', () => {
    input.value = examples[exIdx % examples.length];
    exIdx++;
  });

  solveBtn.addEventListener('click', async () => {
    const raw = input.value.trim();
    if (!raw) { displayError(output, 'Enter a chemical equation.'); return; }
    showSpinner('balance');
    try {
      const result = await balanceChemicalAsync(raw);
      output.innerHTML = '';
      const card = buildResultCard('Balanced Equation', result.balanced, [
        { label: 'Copy', fn: () => { navigator.clipboard.writeText(result.balanced); } }
      ]);
      output.appendChild(card);
      output.classList.remove('error');
      output.classList.add('show', 'success');
      displaySteps(steps, result.steps);
      addHistory('balance', result.balanced);
    } catch (e) { displayError(output, 'Error: ' + e.message); }
    hideSpinner('balance');
  });
});

function parseCompound(formula) {
  /* Pre-process hydrate: extract water of crystallization */
  let hydrateWater = 0;
  let baseFormula = formula;
  if (typeof isHydrate !== 'undefined' && isHydrate(formula)) {
    const info = parseHydrate(formula);
    baseFormula = info.anhydrous;
    hydrateWater = info.waterCount;
  }
  const stack = [{}];
  let i = 0;
  while (i < baseFormula.length) {
    if (baseFormula[i] === '(') { stack.push({}); i++; }
    else if (baseFormula[i] === ')') {
      i++;
      let numStr = '';
      while (i < baseFormula.length && /\d/.test(baseFormula[i])) { numStr += baseFormula[i]; i++; }
      const multiplier = numStr === '' ? 1 : parseInt(numStr);
      const top = stack.pop();
      for (const [el, cnt] of Object.entries(top))
        stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt * multiplier;
    } else if (/[A-Z]/.test(baseFormula[i])) {
      let el = baseFormula[i]; i++;
      while (i < baseFormula.length && /[a-z]/.test(baseFormula[i])) { el += baseFormula[i]; i++; }
      let numStr = '';
      while (i < baseFormula.length && /\d/.test(baseFormula[i])) { numStr += baseFormula[i]; i++; }
      const cnt = numStr === '' ? 1 : parseInt(numStr);
      stack[stack.length - 1][el] = (stack[stack.length - 1][el] || 0) + cnt;
    } else { i++; }
  }
  const result = stack[0];
  /* Add water of crystallization */
  if (hydrateWater > 0) {
    result.H = (result.H || 0) + hydrateWater * 2;
    result.O = (result.O || 0) + hydrateWater;
  }
  return result;
}

function parseEquation(str) {
  const arrow = /->|→/;
  const parts = str.split(arrow).map(s => s.trim());
  if (parts.length !== 2) throw new Error('Use "->" or "→" to separate reactants and products.');
  const reactants = parts[0].split('+').map(s => s.trim()).filter(s => s);
  const products = parts[1].split('+').map(s => s.trim()).filter(s => s);
  return { reactants, products };
}

function formatCompound(coeff, formula) {
  return coeff === 1 ? formula : coeff + formula;
}

function gcd(a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function solveMatrixInline(A, v) {
  return math.lusolve(math.matrix(A), math.matrix(v.map(x => [x])));
}

function postprocessCoeffs(xSub, fixIdx, n, steps) {
  const coeffs = [];
  for (let i = 0; i < fixIdx; i++) {
    if (typeof xSub.get === 'function') coeffs.push(xSub.get([i, 0]));
    else coeffs.push(xSub[i]);
  }
  for (let i = fixIdx; i < n; i++) coeffs.push(1);
  return coeffs;
}

function buildBalancedResult(coeffs, reactants, products) {
  const rParts = reactants.map((r, i) => formatCompound(coeffs[i], r));
  const pParts = products.map((p, i) => formatCompound(coeffs[reactants.length + i], p));
  return rParts.join(' + ') + ' → ' + pParts.join(' + ');
}

function finalizeCoeffs(coeffs, steps) {
  steps.push('Raw coefficients: [' + coeffs.map(c => c.toFixed(4)).join(', ') + ']');

  if (coeffs.some(c => c < -1e-10)) {
    steps.push('Negating to make all coefficients positive...');
    coeffs = coeffs.map(c => -c);
  }

  if (coeffs.some(c => Math.abs(c) < 1e-10)) {
    coeffs = coeffs.map(c => Math.abs(c) < 1e-10 ? 1 : c);
  }

  const scaleToInt = (arr) => {
    for (let denom = 1; denom <= 10000; denom++) {
      const scaled = arr.map(c => c * denom);
      if (scaled.every(s => Math.abs(s - Math.round(s)) < 1e-6)) {
        return scaled.map(s => Math.round(s));
      }
    }
    return arr.map(c => Math.round(c * 1000) / 1000);
  };

  coeffs = scaleToInt(coeffs);

  let g = coeffs.reduce((g, c) => gcd(g, c), 0);
  if (g > 1) coeffs = coeffs.map(c => c / g);

  coeffs = coeffs.map(c => Math.round(c));
  return coeffs;
}

function verifyBalance(coeffs, reactants, products, elements) {
  const checkScopes = {};
  elements.forEach(el => { checkScopes[el] = 0; });
  reactants.forEach((r, i) => {
    const els = parseCompound(r);
    for (const [el, cnt] of Object.entries(els)) checkScopes[el] += coeffs[i] * cnt;
  });
  products.forEach((p, i) => {
    const els = parseCompound(p);
    for (const [el, cnt] of Object.entries(els)) checkScopes[el] -= coeffs[reactants.length + i] * cnt;
  });
  return elements.every(el => Math.abs(checkScopes[el]) < 1e-6);
}

function balanceChemical(str) {
  const steps = [];
  steps.push('Parsing: ' + str);
  const { reactants, products } = parseEquation(str);
  steps.push('Reactants: ' + reactants.join(', '));
  steps.push('Products: ' + products.join(', '));

  const allCompounds = [...reactants, ...products];
  const parsed = allCompounds.map(c => parseCompound(c));
  const allElements = new Set();
  parsed.forEach(p => Object.keys(p).forEach(el => allElements.add(el)));
  const elements = Array.from(allElements).sort();
  steps.push('Elements: ' + elements.join(', '));

  const m = elements.length;
  const n = allCompounds.length;
  if (m === 0 || n === 0) throw new Error('Invalid equation.');

  const M = [];
  for (let i = 0; i < m; i++) {
    const el = elements[i];
    const row = [];
    for (let j = 0; j < n; j++) {
      const count = parsed[j][el] || 0;
      row.push(j < reactants.length ? count : -count);
    }
    M.push(row);
  }

  steps.push('Conservation matrix: ' + m + ' elements × ' + n + ' compounds');
  steps.push('Setting last coefficient = 1 and solving...');

  let numFix = 1;
  if (n - numFix > m) {
    numFix = n - m;
    steps.push('Setting last ' + numFix + ' coefficients = 1');
  }

  const fixIdx = n - numFix;
  let workingM = M;
  if (m > fixIdx) {
    workingM = M.slice(0, fixIdx);
    steps.push('System overdetermined: using ' + fixIdx + ' of ' + m + ' element equations.');
  }

  const A = workingM.map(row => row.slice(0, fixIdx));
  const v = workingM.map(row => {
    let sum = 0;
    for (let j = fixIdx; j < n; j++) sum += row[j];
    return -sum;
  });

  let xSub;
  try {
    xSub = solveMatrixInline(A, v);
  } catch (e) {
    if (fixIdx === 0) throw new Error('Cannot balance: singular system. Check the equation.');
    steps.push('Trying with different coefficient fixed...');
    const A2 = workingM.map(row => row.slice(0, n - 1));
    const v2 = workingM.map(row => [-row[n - 1]]);
    xSub = solveMatrixInline(A2, v2);
  }

  let coeffs = postprocessCoeffs(xSub, fixIdx, n, steps);
  coeffs = finalizeCoeffs(coeffs, steps);
  const balanced = buildBalancedResult(coeffs, reactants, products);
  steps.push('Balanced: ' + balanced);
  const ok = verifyBalance(coeffs, reactants, products, elements);
  steps.push(ok ? '✓ Conservation check passed.' : '⚠ Conservation check failed!');

  return { balanced, reactants, products, steps };
}

async function balanceChemicalAsync(str) {
  const steps = [];
  steps.push('Parsing: ' + str);
  const { reactants, products } = parseEquation(str);
  steps.push('Reactants: ' + reactants.join(', '));
  steps.push('Products: ' + products.join(', '));

  const allCompounds = [...reactants, ...products];
  const parsed = allCompounds.map(c => parseCompound(c));
  const allElements = new Set();
  parsed.forEach(p => Object.keys(p).forEach(el => allElements.add(el)));
  const elements = Array.from(allElements).sort();
  steps.push('Elements: ' + elements.join(', '));

  const m = elements.length;
  const n = allCompounds.length;
  if (m === 0 || n === 0) throw new Error('Invalid equation.');

  const M = [];
  for (let i = 0; i < m; i++) {
    const el = elements[i];
    const row = [];
    for (let j = 0; j < n; j++) {
      const count = parsed[j][el] || 0;
      row.push(j < reactants.length ? count : -count);
    }
    M.push(row);
  }

  steps.push('Conservation matrix: ' + m + ' elements × ' + n + ' compounds');
  steps.push('Setting last coefficient = 1 and solving...');

  let numFix = 1;
  if (n - numFix > m) {
    numFix = n - m;
    steps.push('Setting last ' + numFix + ' coefficients = 1');
  }

  const fixIdx = n - numFix;
  let workingM = M;
  if (m > fixIdx) {
    workingM = M.slice(0, fixIdx);
    steps.push('System overdetermined: using ' + fixIdx + ' of ' + m + ' element equations.');
  }

  const A = workingM.map(row => row.slice(0, fixIdx));
  const v = workingM.map(row => {
    let sum = 0;
    for (let j = fixIdx; j < n; j++) sum += row[j];
    return -sum;
  });

  let xSub;
  try {
    xSub = await solveMatrixAsync(A, v);
  } catch (e) {
    if (fixIdx === 0) throw new Error('Cannot balance: singular system. Check the equation.');
    steps.push('Trying with different coefficient fixed...');
    const A2 = workingM.map(row => row.slice(0, n - 1));
    const v2 = workingM.map(row => [-row[n - 1]]);
    xSub = await solveMatrixAsync(A2, v2);
  }

  let coeffs = postprocessCoeffs(xSub, fixIdx, n, steps);
  coeffs = finalizeCoeffs(coeffs, steps);
  const balanced = buildBalancedResult(coeffs, reactants, products);
  steps.push('Balanced: ' + balanced);
  const ok = verifyBalance(coeffs, reactants, products, elements);
  steps.push(ok ? '✓ Conservation check passed.' : '⚠ Conservation check failed!');

  return { balanced, reactants, products, steps };
}
