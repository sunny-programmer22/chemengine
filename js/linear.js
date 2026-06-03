document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('linear-input');
  const output = document.getElementById('linear-output');
  const steps = document.getElementById('linear-steps');
  const solveBtn = document.getElementById('linear-solve');
  const exampleBtn = document.getElementById('linear-example');

  const example = '2*x + y - z = 8\n-3*x - y + 2*z = -11\n-2*x + y + 2*z = -3';

  exampleBtn.addEventListener('click', () => { input.value = example; });

  solveBtn.addEventListener('click', () => {
    const lines = input.value.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { displayError(output, 'Enter at least one equation.'); return; }
    showSpinner('linear');
    setTimeout(() => {
      try {
        const result = solveLinearSystem(lines);
        const msg = result.variables.map((v, i) => v + ' = ' + result.solution[i]).join('\n');
        output.innerHTML = '';
        const card = buildResultCard('Linear System', msg, [
          { label: 'Copy', fn: () => { navigator.clipboard.writeText(msg); } }
        ]);
        output.appendChild(card);
        output.classList.remove('error');
        output.classList.add('show', 'success');
        displaySteps(steps, result.steps);
        addHistory('linear', result.variables.map((v, i) => v + '=' + result.solution[i]).join(', '));
      } catch (e) { displayError(output, 'Error: ' + e.message); }
      hideSpinner('linear');
    }, 50);
  });
});

function solveLinearSystem(lines) {
  const steps = [];
  steps.push('Parsing ' + lines.length + ' equations...');

  const sides = lines.map(line => {
    const parts = line.split('=').map(s => s.trim());
    if (parts.length !== 2) throw new Error('Each equation must have exactly one "=".');
    return { lhs: parts[0], rhs: parts[1] };
  });

  const allVars = new Set();
  sides.forEach(({ lhs, rhs }) => {
    [lhs, rhs].forEach(part => {
      try {
        const node = math.parse(part.replace(/(\d)([a-zA-Z])/g, '$1*$2'));
        node.traverse(child => {
          if (child.isSymbolNode && /^[a-zA-Z]/.test(child.name)) {
            allVars.add(child.name);
          }
        });
      } catch (_) {}
    });
  });

  const variables = Array.from(allVars).sort();
  steps.push('Variables: ' + variables.join(', '));
  if (variables.length === 0) throw new Error('No variables found.');

  const n = variables.length;
  const m = sides.length;
  if (m < n) throw new Error('Need at least ' + n + ' equations for ' + n + ' variables.');

  const A = [];
  const b = [];
  const scopeZero = {};
  variables.forEach(v => scopeZero[v] = 0);

  sides.forEach(({ lhs, rhs }) => {
    const row = [];
    const raw = '(' + lhs + ')-(' + rhs + ')';
    const exprStr = raw.replace(/(\d)([a-zA-Z])/g, '$1*$2');

    for (const v of variables) {
      const scopeOn = { ...scopeZero, [v]: 1 };
      const f1 = math.evaluate(exprStr, scopeOn);
      const f0 = math.evaluate(exprStr, scopeZero);
      row.push(f1 - f0);
    }
    const constant = math.evaluate(exprStr, scopeZero);
    A.push(row);
    b.push(-constant);
  });

  steps.push('Matrix size: ' + m + '×' + n);
  steps.push('Solving using Gauss elimination...');

  const matA = math.matrix(A);
  const vecB = math.matrix(b.map(v => [v]));
  const sol = math.lusolve(matA, vecB);

  const solution = variables.map((v, i) => {
    const val = sol.get([i, 0]);
    return Math.abs(val) < 1e-12 ? 0 : Math.round(val * 1e12) / 1e12;
  });

  steps.push('Solution found.');
  return { variables, solution, steps };
}
