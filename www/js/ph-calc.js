document.addEventListener('DOMContentLoaded', () => {
  const formulaInput = document.getElementById('ph-formula');
  const concInput = document.getElementById('ph-conc');
  const calcBtn = document.getElementById('ph-calc');
  const output = document.getElementById('ph-output');
  const steps = document.getElementById('ph-steps');

  calcBtn.addEventListener('click', () => {
    const formula = formulaInput.value.trim();
    const conc = parseFloat(concInput.value.trim());
    if (!formula) { displayError(output, 'Enter a chemical formula.'); return; }
    if (isNaN(conc) || conc <= 0) { displayError(output, 'Enter a valid positive concentration.'); return; }
    showSpinner('ph');
    setTimeout(() => {
      try {
        const result = computePH(formula, conc);
        output.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'result-table';
        table.innerHTML = '<tr><th>Property</th><th>Value</th></tr>'
          + '<tr><td>Substance</td><td>' + result.label + '</td></tr>'
          + '<tr><td>Type</td><td>' + result.typeLabel + '</td></tr>'
          + '<tr><td>Concentration</td><td>' + conc + ' M</td></tr>'
          + '<tr><td>[H⁺]</td><td>' + result.hConcentration.toExponential(4) + ' M</td></tr>'
          + '<tr><td>[OH⁻]</td><td>' + result.ohConcentration.toExponential(4) + ' M</td></tr>'
          + '<tr><td><strong>pH</strong></td><td><strong>' + result.pH.toFixed(4) + '</strong></td></tr>'
          + '<tr><td>pOH</td><td>' + result.pOH.toFixed(4) + '</td></tr>'
          + '<tr><td>Classification</td><td>' + result.classification + '</td></tr>';
        output.appendChild(table);
        output.classList.remove('error');
        output.classList.add('show', 'success');
        displaySteps(steps, result.steps);
        addHistory('ph', formula + ' ' + conc + 'M → pH=' + result.pH.toFixed(2));
      } catch (e) { displayError(output, 'Error: ' + e.message); }
      hideSpinner('ph');
    }, 50);
  });

  formulaInput.addEventListener('keydown', e => { if (e.key === 'Enter') calcBtn.click(); });
  concInput.addEventListener('keydown', e => { if (e.key === 'Enter') calcBtn.click(); });
});

/* --- known strong acids and bases --- */
const STRONG_ACIDS = ['HCL','HBR','HI','HNO3','H2SO4','HCLO4','HCLO3','HBRO3','HIO3','HBRO4','HIO4'];
const STRONG_BASES = ['LOH','NAOH','KOH','RBOH','CSOH','CA(OH)2','SR(OH)2','BA(OH)2'];

/* --- Ka/Kb lookup for common weak acids/bases --- */
const ACID_KA = {
  'CH3COOH': 1.8e-5, 'CH3CO2H': 1.8e-5, 'C2H4O2': 1.8e-5,
  'HCOOH': 1.8e-4, 'HCO2H': 1.8e-4, 'CH2O2': 1.8e-4,
  'HF': 6.6e-4,
  'HNO2': 4.5e-4,
  'H2SO3': 1.3e-2,
  'H3PO4': 7.5e-3,
  'H2CO3': 4.3e-7,
  'H2S': 9.1e-8,
  'HCLO': 3.0e-8,
  'H3BO3': 5.8e-10,
  'NH4': 5.6e-10,
  'C6H8O6': 6.7e-5,
  'C6H8O7': 6.4e-5,
  'C4H6O6': 9.2e-4,
  'C3H6O3': 1.4e-4,
};

const BASE_KB = {
  'NH3': 1.8e-5, 'NH4OH': 1.8e-5,
  'CH3NH2': 4.4e-4,
  'C2H5NH2': 5.6e-4,
  'C6H5NH2': 4.0e-10,
  'PYRIDINE': 1.7e-9,
};

function computePH(formula, conc) {
  const steps = [];
  const f = formula.replace(/\s/g, '');
  const fUpper = f.toUpperCase();
  steps.push('Substance: ' + f + ', Concentration: ' + conc + ' M');

  const els = parseCompoundElements(f);
  const hasMetal = containsMetal(f);

  let type, label, Ka, Kb, hConcentration;

  if (STRONG_ACIDS.includes(fUpper)) {
    type = 'strong-acid';
    label = f + ' (Strong Acid)';
    steps.push('Recognised as a strong acid — complete dissociation.');
    hConcentration = conc;
  } else if (STRONG_BASES.includes(fUpper) || (hasMetal && els.OH && els.OH >= 1 && els.OH <= 3 && Object.keys(els).length <= 3)) {
    type = 'strong-base';
    label = f + ' (Strong Base)';
    steps.push('Recognised as a strong base — complete dissociation.');
    hConcentration = 1e-14 / (conc * (els.OH || 1));
  } else if (isAcid(f)) {
    Ka = ACID_KA[fUpper] || 1.8e-5;
    type = 'weak-acid';
    label = f + ' (Weak Acid, Ka=' + Ka.toExponential(2) + ')';
    steps.push('Recognised as a weak acid with Ka=' + Ka.toExponential(2));
    hConcentration = Math.sqrt(Ka * conc);
  } else if (fUpper === 'NH3' || fUpper === 'NH4OH' || (els.N && els.H && !hasMetal && !els.O && els.N === 1 && els.H === 3) || classifyCompound(f) === 'base') {
    Kb = BASE_KB[fUpper] || 1.8e-5;
    type = 'weak-base';
    label = f + ' (Weak Base, Kb=' + Kb.toExponential(2) + ')';
    steps.push('Recognised as a weak base with Kb=' + Kb.toExponential(2));
    const ohConc = Math.sqrt(Kb * conc);
    hConcentration = 1e-14 / ohConc;
  } else if (hasMetal && els.OH) {
    type = 'strong-base';
    label = f + ' (Strong Base)';
    steps.push('Metal hydroxide — treated as a strong base.');
    hConcentration = 1e-14 / (conc * Math.max(els.OH, 1));
  } else if (els.H && !hasMetal && els.H >= 1) {
    Ka = ACID_KA[fUpper] || 1.8e-5;
    type = 'weak-acid';
    label = f + ' (Weak Acid, Ka=' + Ka.toExponential(2) + ')';
    steps.push('Contains hydrogen but no metal — treated as a weak acid with Ka=' + Ka.toExponential(2));
    hConcentration = Math.sqrt(Ka * conc);
  } else {
    type = 'weak-acid';
    Ka = 1.8e-5;
    label = f + ' (assumed Weak Acid, Ka≈1.8×10⁻⁵)';
    steps.push('Could not determine type — assuming weak acid with Ka≈1.8×10⁻⁵');
    hConcentration = Math.sqrt(Ka * conc);
  }

  const pH = -Math.log10(hConcentration);
  const ohConcentration = 1e-14 / hConcentration;
  const pOH = -Math.log10(ohConcentration);
  let classification;
  if (pH < 3) classification = 'Strongly acidic';
  else if (pH < 6) classification = 'Weakly acidic';
  else if (pH < 8) classification = 'Neutral';
  else if (pH < 11) classification = 'Weakly basic';
  else classification = 'Strongly basic';
  steps.push('pH = -log₁₀(' + hConcentration.toExponential(4) + ') = ' + pH.toFixed(4));

  const ohSteps = steps.length;
  let typeLabel = '';
  if (type === 'strong-acid') typeLabel = 'Strong Acid';
  else if (type === 'strong-base') typeLabel = 'Strong Base';
  else if (type === 'weak-acid') typeLabel = 'Weak Acid';
  else if (type === 'weak-base') typeLabel = 'Weak Base';

  return { pH, pOH, hConcentration, ohConcentration, classification, label, typeLabel, steps };
}
