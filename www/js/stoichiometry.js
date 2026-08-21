document.addEventListener('DOMContentLoaded', () => {
  const eqnInput = document.getElementById('stoich-eqn');
  const cmpInput = document.getElementById('stoich-cmp');
  const valInput = document.getElementById('stoich-val');
  const unitSelect = document.getElementById('stoich-unit');
  const solveBtn = document.getElementById('stoich-solve');
  const output = document.getElementById('stoich-output');
  const steps = document.getElementById('stoich-steps');

  solveBtn.addEventListener('click', () => {
    const eqn = eqnInput.value.trim();
    const targetCmp = cmpInput.value.trim();
    const value = parseFloat(valInput.value.trim());
    const unit = unitSelect.value;
    if (!eqn) { displayError(output, 'Enter a balanced equation.'); return; }
    showSpinner('stoich');
    setTimeout(() => {
      try {
        const result = computeStoichiometry(eqn, targetCmp || null, isNaN(value) ? null : value, unit);
        output.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'result-table';
        table.style.width = '100%';
        let html = '<tr><th>Compound</th><th>Coefficient</th><th>Moles (mol)</th><th>Mass (g)</th>';
        if (result.knownPhase === 'gas' || result.knownPhase === 'any') html += '<th>Volume (L at STP)</th>';
        html += '</tr>';
        for (const row of result.rows) {
          html += '<tr><td>' + row.compound + '</td><td>' + row.coeff + '</td><td>' + row.moles.toFixed(4) + '</td><td>' + row.mass.toFixed(4) + '</td>';
          if (result.knownPhase === 'gas' || result.knownPhase === 'any') html += '<td>' + row.volume.toFixed(2) + '</td>';
          html += '</tr>';
        }
        table.innerHTML = html;
        output.appendChild(table);
        output.classList.remove('error');
        output.classList.add('show', 'success');
        displaySteps(steps, result.steps);
        const label = result.knownCompound
          ? result.knownCompound + ' = ' + value + ' ' + unit
          : 'normalised view';
        addHistory('stoich', label);
      } catch (e) { displayError(output, 'Error: ' + e.message); }
      hideSpinner('stoich');
    }, 50);
  });

  eqnInput.addEventListener('keydown', e => { if (e.key === 'Enter') solveBtn.click(); });
  cmpInput.addEventListener('keydown', e => { if (e.key === 'Enter') solveBtn.click(); });
  valInput.addEventListener('keydown', e => { if (e.key === 'Enter') solveBtn.click(); });
});

function computeStoichiometry(eqn, knownCompound, value, unit) {
  const steps = [];
  steps.push('Equation: ' + eqn);
  const arrow = /->|→/;
  const parts = eqn.split(arrow).map(s => s.trim());
  if (parts.length !== 2) throw new Error('Use "->" or "→".');
  const reactParts = parts[0].split('+').map(s => s.trim()).filter(s => s);
  const prodParts = parts[1].split('+').map(s => s.trim()).filter(s => s);
  const allCompounds = [...reactParts, ...prodParts];
  const allParsed = allCompounds.map(c => ({ formula: c, coeff: extractCoeff(c), els: parseCompoundElements(stripCoeff(c)) }));
  const n = allCompounds.length;

  const reParsed = allCompounds.map(c => parseCompoundElements(stripCoeff(c)));
  const elements = [...new Set(reParsed.flatMap(p => Object.keys(p)))].sort();
  const m = elements.length;
  if (m === 0 || n === 0) throw new Error('Invalid equation.');

  let knownIdx = -1;
  if (knownCompound) {
    knownIdx = allCompounds.findIndex(c => stripCoeff(c).toUpperCase() === knownCompound.toUpperCase());
    if (knownIdx < 0) throw new Error('Compound "' + knownCompound + '" not found in equation.');
  }

  const coeffs = allParsed.map(p => p.coeff);

  /* Determine the scaling factor */
  let scaleFactor, knownMoles, knownName;

  if (knownIdx >= 0 && value != null) {
    /* User provided a known amount — scale from it */
    const knownCoeff = coeffs[knownIdx];
    const knownMW = molecularWeight(stripCoeff(allCompounds[knownIdx]));
    if (!knownMW) throw new Error('Cannot compute molecular weight of ' + knownCompound);
    steps.push('Known: ' + stripCoeff(allCompounds[knownIdx]) + ' (coefficient ' + knownCoeff + ')');
    steps.push('Molecular weight of known: ' + knownMW.toFixed(3) + ' g/mol');

    if (unit === 'mol') knownMoles = value;
    else if (unit === 'g') knownMoles = value / knownMW;
    else if (unit === 'L') knownMoles = value / 22.414;
    else throw new Error('Unknown unit: ' + unit);
    steps.push('Moles of known: ' + knownMoles.toFixed(6) + ' mol');

    scaleFactor = knownMoles / knownCoeff;
    knownName = stripCoeff(allCompounds[knownIdx]);
  } else {
    /* No known amount — normalise so the smallest coefficient = 1 */
    const minCoeff = Math.min(...coeffs);
    scaleFactor = 1 / minCoeff;
    knownName = null;
    steps.push('No known amount given — normalised to smallest coefficient = 1');
    steps.push('Smallest coefficient: ' + minCoeff + ' → scaled by 1/' + minCoeff);
  }

  const rows = allCompounds.map((c, i) => {
    const clean = stripCoeff(c);
    const coeff = coeffs[i];
    const mw = molecularWeight(clean);
    const moles = coeff * scaleFactor;
    const mass = mw ? moles * mw : 0;
    const volume = (clean !== 'H2O' && !containsMetal(clean)) ? moles * 22.414 : 0;
    return { compound: clean, coeff, moles, mass, volume, mw };
  });

  const knownPhase = rows.some(r => r.volume > 0) ? 'gas' : 'any';
  steps.push('Computed all quantities.');
  return { rows, steps, knownCompound: knownName, knownPhase };
}

function extractCoeff(formula) {
  const m = formula.match(/^(\d+)/);
  return m ? parseInt(m[1]) : 1;
}

function stripCoeff(formula) {
  return formula.replace(/^\d+/, '');
}
