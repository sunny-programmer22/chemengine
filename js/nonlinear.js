document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('nonlinear-input');
  const varsInput = document.getElementById('nonlinear-vars');
  const guessInput = document.getElementById('nonlinear-guess');
  const output = document.getElementById('nonlinear-output');
  const steps = document.getElementById('nonlinear-steps');
  const solveBtn = document.getElementById('nonlinear-solve');
  const exampleBtn = document.getElementById('nonlinear-example');

  const example = 'x^2 + y^2 - 25 = 0\nx - y - 1 = 0';

  exampleBtn.addEventListener('click', () => {
    input.value = example; varsInput.value = 'x,y'; guessInput.value = '3,2';
  });

  solveBtn.addEventListener('click', () => {
    const lines = input.value.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { displayError(output, 'Enter at least one equation.'); return; }
    const varNames = varsInput.value.trim().split(',').map(v => v.trim()).filter(v => v);
    const guesses = guessInput.value.trim().split(',').map(g => parseFloat(g.trim())).filter(g => !isNaN(g));
    if (varNames.length !== lines.length) { displayError(output, 'Number of variables must equal number of equations.'); return; }
    if (guesses.length !== varNames.length) { displayError(output, 'Provide one initial guess per variable.'); return; }
    showSpinner('nonlinear');
    setTimeout(() => {
      try {
        const result = solveNonLinear(lines, varNames, guesses);
        const msg = varNames.map((v, i) => v + ' = ' + result.solution[i].toFixed(8)).join('\n');
        output.innerHTML = '';
        const card = buildResultCard('Non-Linear System', msg, [
          { label: 'Copy', fn: () => { navigator.clipboard.writeText(msg); } }
        ]);
        output.appendChild(card);
        output.classList.remove('error');
        output.classList.add('show', 'success');
        displaySteps(steps, result.steps);
        addHistory('nonlinear', varNames.map((v, i) => v + '=' + result.solution[i].toFixed(4)).join(', '));
      } catch (e) { displayError(output, 'Error: ' + e.message); }
      hideSpinner('nonlinear');
    }, 50);
  });
});

function solveNonLinear(eqStrs, varNames, guesses) {
  const steps = [];
  const n = varNames.length;
  steps.push('Variables: ' + varNames.join(', '));
  steps.push('Initial guesses: [' + guesses.map(g => g.toFixed(4)).join(', ') + ']');
  steps.push('Newton-Raphson with numerical Jacobian and damping...');

  const prepped = eqStrs.map(eq => {
    const parts = eq.split('=').map(s => s.trim());
    if (parts.length !== 2) throw new Error('Each equation must have exactly one "=".');
    const exprStr = '(' + parts[0] + ')-(' + parts[1] + ')';
    return exprStr.replace(/(\d)([a-zA-Z])/g, '$1*$2');
  });

  function evalF(vals) {
    const scope = {};
    varNames.forEach((v, i) => { scope[v] = vals[i]; });
    return prepped.map(expr => math.evaluate(expr, scope));
  }

  function jacobian(vals) {
    const eps = 1e-8;
    const f0 = evalF(vals);
    const J = [];
    for (let eqIdx = 0; eqIdx < n; eqIdx++) {
      const row = [];
      for (let vIdx = 0; vIdx < n; vIdx++) {
        const v = [...vals];
        v[vIdx] += eps;
        const f1 = evalF(v);
        row.push((f1[eqIdx] - f0[eqIdx]) / eps);
      }
      J.push(row);
    }
    return J;
  }

  let x = [...guesses];
  const maxIter = 100;
  const tol = 1e-12;

  for (let iter = 0; iter < maxIter; iter++) {
    const F = evalF(x);
    const maxF = Math.max(...F.map(f => Math.abs(f)));

    if (!isFinite(maxF)) {
      throw new Error('NaN/Infinity in residual at iteration ' + iter + '. Try different initial guesses or a simpler system.');
    }

    if (maxF < tol) {
      steps.push('Converged in ' + iter + ' iterations (residual = ' + maxF.toExponential(4) + ').');
      return { solution: x, steps };
    }
    if (iter % 10 === 0 && iter > 0) {
      steps.push('Iter ' + iter + ': residual = ' + maxF.toExponential(4));
    }
    const J = jacobian(x);

    let delta;
    try {
      const negF = F.map(f => [-f]);
      if (n === 1) {
        if (Math.abs(J[0][0]) < 1e-15) throw new Error('derivative is zero');
        delta = [negF[0][0] / J[0][0]];
      } else {
        const deltaMat = math.lusolve(math.matrix(J), math.matrix(negF));
        delta = [];
        for (let i = 0; i < n; i++) delta.push(deltaMat.get([i, 0]));
      }
    } catch (_e) {
      try {
        const negF2 = F.map(f => [-f]);
        const delta2 = math.lusolve(J, negF2);
        delta = delta2.map(r => r[0]);
      } catch (_e2) {
        throw new Error('Singular Jacobian at iteration ' + iter + '. Try different initial guesses.');
      }
    }

    if (delta.some(d => !isFinite(d))) {
      throw new Error('NaN/Infinity in Newton step at iteration ' + iter + '. Try different initial guesses.');
    }

    /* Damped Newton: backtrack if residual increases */
    let stepSize = 1;
    let bestX = [...x];
    let bestF = maxF;
    for (let attempt = 0; attempt < 8; attempt++) {
      const trial = x.map((xi, i) => xi + stepSize * delta[i]);
      const trialF = evalF(trial);
      const trialMaxF = Math.max(...trialF.map(f => Math.abs(f)));
      if (trialMaxF < bestF) {
        bestX = trial;
        bestF = trialMaxF;
        break;
      }
      stepSize *= 0.5;
    }
    x = bestX;
  }

  const finalF = evalF(x);
  const finalMaxF = Math.max(...finalF.map(f => Math.abs(f)));

  if (!isFinite(finalMaxF)) {
    throw new Error('Solution diverged (NaN/Infinity). Try different initial guesses.');
  }
  if (finalMaxF > 1e-3) {
    throw new Error('Failed to converge after ' + maxIter + ' iterations (residual = ' + finalMaxF.toExponential(4) + '). Try different initial guesses.');
  }
  if (finalMaxF > 1e-6) steps.push('Partially converged. Residual = ' + finalMaxF.toExponential(4));
  else steps.push('Converged (residual = ' + finalMaxF.toExponential(4) + ').');
  return { solution: x, steps };
}
