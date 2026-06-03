document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('test-run');
  const resultsDiv = document.getElementById('test-results');
  if (!runBtn || !resultsDiv) return;

  runBtn.addEventListener('click', () => {
    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    resultsDiv.innerHTML = '<div class="spinner"></div>';
    setTimeout(() => {
      try {
        const results = runTests();
        renderTestResults(results, resultsDiv);
      } catch (e) {
        resultsDiv.innerHTML = '<div class="error show">Test harness error: ' + escapeHtml(e.message) + '</div>';
      }
      runBtn.disabled = false;
      runBtn.textContent = 'Run Tests';
    }, 100);
  });
});

function runTests() {
  const results = [];
  function assert(condition, msg) {
    results.push({ pass: !!condition, msg: msg || 'Assertion' });
    return condition;
  }
  function assertEqual(a, b, msg) {
    const pass = a === b;
    results.push({ pass, msg: (msg || '') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a) });
    return pass;
  }
  function contains(haystack, needle) {
    return haystack.includes(needle);
  }

  /* 1. Formula validator */
  assert(typeof validateFormula === 'function', 'validateFormula exists');
  assert(validateFormula('H2O'), 'H2O valid');
  assert(validateFormula('CH2=CH2'), 'CH2=CH2 valid (bond chars stripped)');
  assert(validateFormula('NaCl'), 'NaCl valid');
  assert(!validateFormula('H2O)'), 'H2O) invalid (unmatched paren)');
  assert(!validateFormula('Zz'), 'Zz invalid (nonexistent element)');

  /* 2. Balance linear */
  if (typeof balanceLinear === 'function') {
    const r = balanceLinear('H2', 'O2', 'H2O');
    assert(r && r.balanced, 'H2+O2 balanced');
    if (r && r.balanced) assertEqual(r.coeffs.join(','), '2,1,2', 'H2+O2 coeffs');
    const r2 = balanceLinear('Fe', 'O2', 'Fe2O3');
    assert(r2 && r2.balanced, 'Fe+O2 balanced');
  }

  /* 3. Balance nonlinear */
  if (typeof balanceNonlinear === 'function') {
    const r = balanceNonlinear('C2H6', 'O2', 'CO2', 'H2O');
    assert(r && r.balanced, 'C2H6+O2 nonlinear');
  }

  /* 4. Predict & all redox */
  if (typeof predictReaction === 'function') {
    const r1 = predictReaction('H2', 'O2');
    assert(r1, 'H2+O2 predicted');
    const r2 = predictReaction('Fe', 'O2');
    assert(r2, 'Fe+O2 predicted');
    const r3 = predictReaction('C2H4', 'H2O');
    assert(r3, 'C2H4+H2O predicted');
    const r4 = predictReaction('P4', 'Cl2');
    assert(r4, 'P4+Cl2 predicted (redox)');
    const r5 = predictReaction('Na', 'Cl2');
    assert(r5, 'Na+Cl2 predicted');
    const r6 = predictReaction('C2H4', 'H2');
    assert(r6, 'C2H4+H2 predicted');
    const r7 = predictReaction('CH3CH2OH');
    assert(r7, 'dehydration predicted');
    const r8 = predictReaction('P4', 'O2');
    assert(r8, 'P4+O2 predicted');
    const r9 = predictReaction('NaCl');
    assert(r9, 'NaCl predicted');
    const r10 = predictReaction('C2H5Cl');
    assert(r10, 'C2H5Cl dehalogenation predicted');
    const r11 = predictReaction('CH3CHO', 'H2');
    assert(r11, 'CH3CHO+H2 carbonyl reduction predicted');
    const r12 = predictReaction('Fe2O3', 'Al');
    assert(r12, 'Fe2O3+Al thermite predicted');
    const r13 = predictReaction('C2H4', 'HCN');
    assert(r13, 'C2H4+HCN hydrocyanation predicted');
    const r14 = predictReaction('C2H4', 'H2O2');
    assert(r14, 'C2H4+H2O2 epoxidation predicted');
    const r15 = predictReaction('CuS', 'O2');
    assert(r15, 'CuS+O2 roasting predicted');
  }

  /* 5. parseCompoundElements */
  assert(typeof parseCompoundElements === 'function', 'parseCompoundElements exists');
  assertEqual(JSON.stringify(parseCompoundElements('H2O')), '{"H":2,"O":1}', 'H2O parsed');
  assertEqual(JSON.stringify(parseCompoundElements('C2H5OH')), '{"C":2,"H":6,"O":1}', 'C2H5OH parsed');
  assertEqual(JSON.stringify(parseCompoundElements('Na2SO4')), '{"Na":2,"S":1,"O":4}', 'Na2SO4 parsed');

  /* 6. molecular weight */
  if (typeof molecularWeight === 'function') {
    const mw = molecularWeight('H2O');
    assert(mw > 17 && mw < 19, 'H2O MW ~18');
  }

  /* 7. Stoichiometry */
  if (typeof computeStoichiometry === 'function') {
    const r = computeStoichiometry('2H2+O2->2H2O', 'H2', 4, 'mol');
    assert(r, 'stoichiometry H2+O2');
    assert(r.rows.length === 3, '3 compounds in stoichiometry');
  }

  /* 8. pH calculator */
  if (typeof computePH === 'function') {
    const r = computePH('strong-acid', 0.01);
    assert(r, 'pH 0.01M strong acid');
    assert(Math.abs(r.pH - 2) < 0.01, 'pH ~2');
    const r2 = computePH('strong-base', 0.01);
    assert(r2, 'pH 0.01M strong base');
    assert(Math.abs(r2.pH - 12) < 0.01, 'pH ~12');
  }

  /* 9. PubChem cache operations */
  assert(typeof getCachedCID === 'function' || typeof loadPubchemCache === 'function', 'cache functions exist');

  /* 10. History */
  assert(typeof addHistory === 'function', 'addHistory exists');
  assert(typeof loadHistory === 'function', 'loadHistory exists');

  return results;
}

function renderTestResults(results, container) {
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;
  const pct = total ? Math.round(passed / total * 100) : 0;

  let html = '<div class="test-summary ' + (failed === 0 ? 'success' : 'error') + '">';
  html += '<strong>' + passed + '/' + total + ' passed (' + pct + '%)</strong>';
  html += '</div>';
  html += '<table class="result-table" style="width:100%"><tr><th>#</th><th>Result</th><th>Test</th></tr>';
  results.forEach((r, i) => {
    html += '<tr class="' + (r.pass ? 'test-pass' : 'test-fail') + '">';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td>' + (r.pass ? '✓' : '✗') + '</td>';
    html += '<td>' + escapeHtml(r.msg) + '</td>';
    html += '</tr>';
  });
  html += '</table>';
  container.innerHTML = html;
}
