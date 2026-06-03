/* ============================================================
   CHEM-PREDICT.js — Chemical Reaction Predictor
   Data tables and classification utilities are now in
   classification.js (loaded before this file).
   ============================================================ */

/* ==================== SECTION 1: UI SETUP ==================== */

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('predict-input');
  const output = document.getElementById('predict-output');
  const rxnsDiv = document.getElementById('predict-rxns');
  const solveBtn = document.getElementById('predict-solve');
  const exampleBtn = document.getElementById('predict-example');

  const examples = [
    'CH4, O2','Fe, O2','H2, O2','HCl, NaOH','Na, H2O','C2H6, O2',
    'AgNO3, NaCl','CaCO3','Zn, HCl','H2SO4, NaOH','CO, O2',
    'Na2CO3, HCl','CH3COOH, NaOH','H2O2','SO2, O2',
    'Na + H2O','CuSO4, NaOH','CaO, H2O','Mg + O2','C2H4, H2',
    'Fe2O3 + C','NaCl + H2O','P4O10 + H2O','C2H4 + H2O',
    'KMnO4 + H2SO4 + H2O2'
  ];
  let exIdx = 0;

  exampleBtn.addEventListener('click', () => {
    input.value = examples[exIdx % examples.length];
    exIdx++;
  });

  function viewStructure(formula) {
    const structInput = document.getElementById('structure-input');
    const structTab = document.querySelector('[data-tab="structure"]');
    if (structInput) structInput.value = formula;
    if (structTab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      structTab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      document.getElementById('sec-structure').classList.add('active');
    }
    window.location.hash = encodeURIComponent(formula);
    setTimeout(() => {
      const fetchBtn = document.getElementById('structure-fetch');
      if (fetchBtn) fetchBtn.click();
    }, 100);
  }

  function extractCompounds(eqn) {
    const compounds = [];
    const parts = eqn.split(/[→⇌+]/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        const numericPrefix = trimmed.match(/^(\d*)(.*)/);
        const formula = numericPrefix ? numericPrefix[2] : trimmed;
        if (formula && formula.length >= 2 && formula.length <= 30) compounds.push(formula);
      }
    }
    return [...new Set(compounds)];
  }

  solveBtn.addEventListener('click', () => {
    const raw = input.value.trim();
    if (!raw) { displayError(output, 'Enter reactants.'); return; }
    showSpinner('predict');
    setTimeout(() => {
      try {
        const result = predictReaction(raw);
        output.innerHTML = '';
        const compounds = extractCompounds(result.equation);
        const actions = [
          { label: '📋 Copy', fn: () => { navigator.clipboard.writeText(result.equation); } }
        ];
        const structF = compounds[compounds.length - 1] || compounds[0];
        if (structF) {
          actions.push({ label: '🔬 View Structure', fn: () => viewStructure(structF) });
        }
        const card = buildResultCard(result.type, result.equation, actions);
        output.appendChild(card);
        if (result.predictions.length > 1) {
          const optsDiv = document.createElement('div');
          optsDiv.style.marginTop = '0.5rem';
          optsDiv.style.padding = '0.5rem';
          optsDiv.style.borderTop = '1px solid var(--border)';
          result.predictions.forEach((p, i) => {
            const opt = document.createElement('div');
            opt.style.marginTop = '0.25rem';
            opt.style.fontSize = '0.85rem';
            opt.innerHTML = '<span style="color:var(--text-link);font-weight:500;">Option ' + (i + 1) + ':</span> ' + p;
            optsDiv.appendChild(opt);
          });
          output.appendChild(optsDiv);
        }
        output.classList.remove('error');
        output.classList.add('show', 'success');
        displaySteps(rxnsDiv, result.steps);
        addHistory('predict', result.type + ' | ' + result.equation);
      } catch (e) { displayError(output, 'Error: ' + e.message); }
      hideSpinner('predict');
    }, 50);
  });
});

/* All data tables (VALENCY, POLYATOMIC_IONS, SOLUBILITY, METALS_LIST, etc.)
   and classification utilities (parseCompoundElements, containsMetal, isAcid,
   classifyCompound, etc.) are now in classification.js (loaded before this file). */

/* ==================== SECTION 9: MAIN PREDICTOR ==================== */

function predictReaction(str) {
  const steps = [];
  str = str.replace(/\s*\+\s*/g, ' + ');
  steps.push('Analyzing reactants: ' + str);
  const separators = str.includes(' + ') ? /\+|,/ : /,/;
  const reactants = str.split(separators).map(s => s.trim().replace(/^\+ /, '').replace(/ \+$/, '')).filter(s => s);
  if (reactants.length === 0) throw new Error('No reactants provided.');
  for (const r of reactants) {
    const v = validateFormula(r);
    if (!v.valid) throw new Error('Invalid formula "' + r + '": ' + v.error);
  }

  const rTypes = reactants.map(r => classifyCompound(r));
  const rEls = reactants.map(r => parseCompoundElements(r));
  steps.push('Classifications: ' + reactants.map((r, i) => r + '=' + rTypes[i]).join(', '));

  const n = reactants.length;

  if (n === 1) return handleSingleReactant(reactants, rTypes, rEls, steps);
  if (n === 2) return handleTwoReactants(reactants, rTypes, rEls, steps);
  if (n >= 3) return handleMultiReactant(reactants, rTypes, rEls, steps);
  throw new Error('No reactants provided.');
}

/* ==================== SECTION 10: SINGLE REACTANT ==================== */

function handleSingleReactant(reactants, rTypes, rEls, steps) {
  const r = reactants[0];
  const rt = rTypes[0];
  const els = rEls[0];
  const hasMetal = containsMetal(r);
  let type, products;

  let isomResult = null;

  if (isUnsaturated(r) && !hasMetal) {
    steps.push('Unsaturated compound detected — polymerization possible');
    return handlePolymerization(reactants);
  }

  /* Dehydrogenation: saturated alkane → alkene + H₂ (before combustion) */
  if (isHydrocarbon(r) && els.C && !els.O && !els.N && !els.S) {
    const cCount = els.C, hCount = els.H;
    if (hCount === 2 * cCount + 2 && cCount >= 2) {
      /* For saturated alkanes, try isomerisation first */
      isomResult = handleIsomerisation(r, steps);
      if (isomResult) return isomResult;
      type = 'Dehydrogenation (Alkane → Alkene + H₂)';
      products = ['C' + cCount + 'H' + (hCount - 2), 'H2'];
    } else {
      return handleCHydrocarbon(reactants);
    }
  }

  else if (isHydrocarbon(r)) return handleCHydrocarbon(reactants);

  if (rt === 'peroxide' || r === 'H2O2') {
    if (r === 'H2O2') { type = 'Decomposition (Peroxide)'; products = ['H2O', 'O2']; }
    else { type = 'Decomposition (Peroxide)'; products = ['O2']; }
  }
  else if (hasMetal && r.includes('HCO3')) {
    type = 'Decomposition (Bicarbonate → Carbonate + CO₂ + H₂O)';
    const metal = getFirstMetal(r);
    const metalCount = els[metal] || 1;
    const metalOx = getOxidationState(metal);
    const carbonate = metalOx === 1 ? metal + '2CO3' : (metalOx === 2 ? metal + 'CO3' : metal + '2(CO3)3');
    products = [carbonate, 'CO2', 'H2O'];
  }
  else if (hasMetal && els.C && els.O) {
    type = 'Decomposition (Carbonate → Oxide + CO₂)';
    const metal = getFirstMetal(r);
    const oxState2 = getElementOxidationStateInCompound(r, metal) || getOxidationState(metal);
    const oxide2 = oxState2 === 1 ? metal + '2O' : (oxState2 === 2 ? metal + 'O' : metal + '2O3');
    products = [oxide2, 'CO2'];
  }
  else if (hasMetal && hasHydroxide(r)) {
    type = 'Decomposition (Hydroxide → Oxide + Water)';
    const metal = getFirstMetal(r);
    const oxState3 = getElementOxidationStateInCompound(r, metal) || getOxidationState(metal);
    const oxide3 = oxState3 === 1 ? metal + '2O' : (oxState3 === 2 ? metal + 'O' : metal + '2O3');
    products = [oxide3, 'H2O'];
  }
  else if (rt === 'monoxide' || rt === 'dioxide' || rt === 'trioxide' || rt === 'tetraoxide' || rt === 'pentoxide' || rt === 'oxide') {
    type = 'Decomposition (Oxide → Elements)';
    const nonO = Object.keys(els).find(e => e !== 'O');
    products = [nonO, 'O2'];
  }
  else if (rt === 'acid' && els.O) {
    type = 'Decomposition (Oxyacid → Anhydride + Water)';
    const nonH = Object.keys(els).find(e => e !== 'H' && e !== 'O');
    if (nonH) {
      if (els.S && els.S === 1 && els.O === 4) products = ['SO3', 'H2O'];
      else if (els.C && els.C === 1 && els.O === 3) products = ['CO2', 'H2O'];
      else if (els.N && els.N === 1 && els.O === 3) products = ['NO2', 'O2', 'H2O'];
      else if (els.N && els.N === 1 && els.O === 2) products = ['N2O3', 'H2O'];
      else if (els.Cl && els.O === 1) products = [nonH + '2', 'O2'];
      else products = [nonH + 'O' + (els.O - 1), 'H2O'];
    } else { products = Object.keys(els); }
  }
  else if (r === 'NH4OH') {
    type = 'Decomposition (Ammonium Hydroxide → Ammonia + Water)';
    products = ['NH3', 'H2O'];
  }
  else if (r === 'NH4NO3') {
    type = 'Decomposition (Ammonium Nitrate → Nitrous Oxide + Water)';
    products = ['N2O', 'H2O'];
  }
  else if (r.includes('ClO3') && hasMetal && !els.C) {
    type = 'Decomposition (Chlorate → Chloride + Oxygen)';
    const metal = getFirstMetal(r);
    products = [metal + 'Cl', 'O2'];
  }
  else if (els.N && els.H && !els.O) {
    type = 'Decomposition';
    const metal = getFirstMetal(r);
    if (metal) products = [metal, 'N2', 'H2'];
    else products = ['N2', 'H2'];
  }
  else if (rt === 'organic' && isAlcohol(r)) {
    if (r === 'CH3OH' || r === 'CH4O') {
      type = 'Stable Compound (Methanol)';
      products = [r];
    } else {
      /* Generate both dehydration and dehydrogenation predictions */
      const cCount = els.C || 0;
      let dehydProducts, dehydType, dehydroProducts, dehydroType;
      /* Dehydration: alcohol → alkene + H2O */
      if (cCount === 2) { dehydProducts = ['C2H4', 'H2O']; dehydroProducts = ['C2H4O', 'H2']; }
      else if (cCount === 3) { dehydProducts = ['C3H6', 'H2O']; dehydroProducts = ['C3H6O', 'H2']; }
      else if (cCount === 4) { dehydProducts = ['C4H8', 'H2O']; dehydroProducts = ['C4H8O', 'H2']; }
      else { dehydProducts = [r]; dehydroProducts = [r]; }
      dehydType = 'Dehydration (Alcohol → Alkene + Water)';
      dehydroType = 'Dehydrogenation (Alcohol → Aldehyde/Ketone + H₂)';
      const eqDehyd = tryBalanceOneWay([r], dehydProducts, dehydType);
      const eqDehydro = tryBalanceOneWay([r], dehydroProducts, dehydroType);
      type = dehydType;
      const eqStr = eqDehyd;
      const allPredictions = [eqDehyd, eqDehydro];
      steps.push('Dehydration: ' + eqDehyd);
      steps.push('Dehydrogenation: ' + eqDehydro);
      return { type, equation: eqStr, predictions: allPredictions, steps };
    }
  }
  /* Dehalogenation / Dehydrohalogenation: organic halide → alkene + X₂ / HX */
  else if (els.C && els.H) {
    /* Try isomerisation first (e.g. C3H7Cl has positional isomers) */
    isomResult = handleIsomerisation(r, steps);
    if (isomResult) return isomResult;
    const halogens = {'Cl':1,'Br':1,'I':1,'F':1};
    const hKeys = Object.keys(els).filter(k => halogens[k]);
    if (hKeys.length === 1) {
      const hKey = hKeys[0];
      const hCount = els[hKey];
      const cCount = els.C;
      const satIndex = (2 * cCount + 2 - els.H - hCount) / 2;
      if (satIndex === 0 && cCount >= 2) {
        if (hCount === 1) {
          /* Dehydrohalogenation: alkyl halide → alkene + HX */
          type = 'Dehydrohalogenation (Alkyl Halide → Alkene + HX)';
          const alkeneFormula = 'C' + cCount + 'H' + (els.H - 1);
          products = [alkeneFormula, 'H' + hKey];
        }
        else if (hCount === 2 && els.H >= 2) {
          /* Dehalogenation: vicinal dihalide → alkene + X₂ */
          type = 'Dehalogenation (Vicinal Dihalide → Alkene + X₂)';
          const alkeneFormula = 'C' + cCount + 'H' + els.H;
          products = [alkeneFormula, hKey + '2'];
        }
      }
    }
  }

  /* Generic isomerisation check for compounds not handled by specific decompositions */
  if (!isomResult) {
    isomResult = handleIsomerisation(r, steps);
    if (isomResult) return isomResult;
  }

  if (!type) {
    type = 'Decomposition (General)';
    const keys = Object.keys(els);
    if (keys.length === 2 && !hasMetal) {
      if (r === 'H2O') products = ['H2', 'O2'];
      else products = keys;
    }
    else if (keys.length === 2 && hasMetal) {
      const nonMetal = keys.find(e => !METALS_LIST.includes(e));
      const metalEl = getFirstMetal(r);
      const diatomicHalogens = {'Cl':'Cl2','Br':'Br2','I':'I2','F':'F2'};
      if (diatomicHalogens[nonMetal]) products = [metalEl, diatomicHalogens[nonMetal]];
      else products = [metalEl, nonMetal];
    } else throw new Error('Cannot predict decomposition for ' + r);
  }

  steps.push('Reaction type: ' + type);
  const eqStr = tryBalanceOneWay(reactants, products, type);
  steps.push('Predicted equation: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

const HYDRATE_DB = {
  'CuSO4': 'CuSO4.5H2O',
  'Na2CO3': 'Na2CO3.10H2O',
  'FeSO4': 'FeSO4.7H2O',
  'CoCl2': 'CoCl2.6H2O',
  'NiCl2': 'NiCl2.6H2O',
  'MgSO4': 'MgSO4.7H2O',
  'CaSO4': 'CaSO4.2H2O',
  'Na2SO4': 'Na2SO4.10H2O',
  'BaCl2': 'BaCl2.2H2O',
  'Cu(NO3)2': 'Cu(NO3)2.6H2O',
  'FeCl3': 'FeCl3.6H2O',
  'AlCl3': 'AlCl3.6H2O',
  'Na2B4O7': 'Na2B4O7.10H2O',
  'MgCl2': 'MgCl2.6H2O',
  'CaCl2': 'CaCl2.6H2O',
  'NiSO4': 'NiSO4.6H2O',
  'ZnSO4': 'ZnSO4.7H2O',
  'MnSO4': 'MnSO4.4H2O',
};

function getWaterCoefficient(f) {
  const m = f.match(/^(\d+)(H2O)$/i);
  return m ? parseInt(m[1]) : 1;
}

function isWaterCoefficient(f) {
  return /^\d+H2O$/i.test(f);
}

function isHydrateFormation(reactants) {
  const [r1, r2] = reactants;
  const t1 = classifyCompound(r1), t2 = classifyCompound(r2);
  const saltIdx = (t1 === 'salt' || t1 === 'carbonate' || t1 === 'hydroxide') ? 0 :
                  ((t2 === 'salt' || t2 === 'carbonate' || t2 === 'hydroxide') ? 1 : -1);
  if (saltIdx === -1) return false;
  const waterIdx = saltIdx === 0 ? 1 : 0;
  const waterR = reactants[waterIdx];
  if (t1 === 'acid' || t2 === 'acid') return false;
  if (!isWaterCoefficient(waterR)) return false;
  return true;
}

function handleHydrateFormation(reactants) {
  const [r1, r2] = reactants;
  const t1 = classifyCompound(r1), t2 = classifyCompound(r2);
  const steps = [];
  let salt, waterR;
  if (t1 === 'salt' || t1 === 'carbonate' || t1 === 'hydroxide') {
    salt = r1; waterR = r2;
  } else {
    salt = r2; waterR = r1;
  }
  const n = getWaterCoefficient(waterR);
  const hydrate = HYDRATE_DB[salt];
  let product;
  if (hydrate) {
    product = hydrate;
  } else {
    product = salt + '.' + (n === 1 ? '' : n) + 'H2O';
  }
  const waterDisplay = n === 1 ? 'H2O' : n + 'H2O';
  const eqStr = salt + ' + ' + waterDisplay + ' → ' + product;
  steps.push('Hydrate formation: ' + eqStr);
  const type = 'Hydrate Formation (Anhydrous Salt → Hydrated Salt)';
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* ==================== SECTION 11: TWO REACTANTS ==================== */

function handleTwoReactants(reactants, rTypes, rEls, steps) {
  const r1 = reactants[0], r2 = reactants[1];
  const t1 = rTypes[0], t2 = rTypes[1];
  const e1 = rEls[0], e2 = rEls[1];
  let type, products;

  /* 0. Isomer interconversion: two reactants with same molecular formula */
  if (getCanonicalFormula(r1) === getCanonicalFormula(r2) && r1 !== r2) {
    steps.push('Isomer interconversion: ' + r1 + ' ⇌ ' + r2);
    const type = 'Isomerisation (Isomer Interconversion)';
    const eqStr = r1 + ' ⇌ ' + r2;
    return { type, equation: eqStr, predictions: [eqStr], steps };
  }

  /* 1. Combustion: hydrocarbon/organic/base/acid + O2 → CO₂ + H₂O */
  if (isHydrocarbon(r1) && isOxygen(r2)) return handleCHydrocarbon(reactants);
  if (isOxygen(r1) && isHydrocarbon(r2)) return handleCHydrocarbon([r2, r1]);
  else if ((t1 === 'organic' || t1 === 'acid' || t1 === 'base' || isCarboxylicAcid(r1)) && isOxygen(r2))
    return handleCHydrocarbon(reactants);
  else if ((t2 === 'organic' || t2 === 'acid' || t2 === 'base' || isCarboxylicAcid(r2)) && isOxygen(r1))
    return handleCHydrocarbon([r2, r1]);

  /* 2. Metal + O2 → Metal Oxide (Oxidation / Oxygen Addition) */
  if (isMetal(r1) && isOxygen(r2)) return handleMetalOxygen(reactants);
  if (isOxygen(r1) && isMetal(r2)) return handleMetalOxygen([r2, r1]);

  /* 3. Hydrogen + O2 → Water (Synthesis) */
  if (isHydrogen(r1) && isOxygen(r2)) { type = 'Synthesis (Water formation)'; products = ['H2O']; }
  else if (isOxygen(r1) && isHydrogen(r2)) { type = 'Synthesis (Water formation)'; products = ['H2O']; }

  /* 4. Oxide + O2 → Higher Oxide (Oxidation / Oxygen Addition) */
  else if ((t1 === 'monoxide' || t1 === 'dioxide') && isOxygen(r2))
    return handleOxideSynthesis(r1, r2);
  else if ((t2 === 'monoxide' || t2 === 'dioxide') && isOxygen(r1))
    return handleOxideSynthesis(r2, r1);

  /* 4a. Roasting: metal sulfide + O2 → metal oxide + SO2 */
  else if (containsMetal(r1) && isOxygen(r2) && parseCompoundElements(r1).S && !parseCompoundElements(r1).O)
    return handleRoasting(r1, r2);
  else if (containsMetal(r2) && isOxygen(r1) && parseCompoundElements(r2).S && !parseCompoundElements(r2).O)
    return handleRoasting(r2, r1);

  /* 5. Metal + Halogen → Metal Halide (Halogen Addition) */
  else if (isMetal(r1) && isHalogen(r2) || isMetal(r2) && isHalogen(r1)) {
    const [metal, halogen] = isMetal(r1) ? [r1, r2] : [r2, r1];
    const mEl = getFirstMetal(metal);
    const hEl = getHalogen(halogen);
    type = 'Synthesis (Metal Halide / Halogen Addition)';
    const oxState = getOxidationState(mEl);
    if (oxState === 1) products = [mEl + hEl];
    else if (oxState === 2) products = [mEl + hEl + '2'];
    else if (oxState === 3) products = [mEl + hEl + '3'];
    else products = [mEl + hEl + oxState];
  }

  /* 6. Metal + Non-metal → Binary Compound (Synthesis) */
  else if (isMetal(r1) && isNonMetal(r2) || isMetal(r2) && isNonMetal(r1)) {
    const [metal, nonMetal] = isMetal(r1) ? [r1, r2] : [r2, r1];
    const mEl = getFirstMetal(metal);
    type = 'Synthesis (Binary Compound)';
    const nmEl = Object.keys(parseCompoundElements(nonMetal))[0];
    products = [mEl + nmEl];
  }

  /* 7. Non-metal + Non-metal → Covalent Compound (Synthesis) */
  else if (isNonMetal(r1) && isNonMetal(r2)) {
    const nm1 = Object.keys(e1)[0], nm2 = Object.keys(e2)[0];
    const halogens = ['F','Cl','Br','I'];
    if (halogens.includes(nm1) || halogens.includes(nm2)) {
      const nm = halogens.includes(nm1) ? nm2 : nm1;
      const h = halogens.includes(nm1) ? nm1 : nm2;
      if (nm === 'H') { type = 'Synthesis (Hydrogen Halide)'; products = ['H' + h]; }
      else {
        const nmVal = {'H':1,'B':3,'C':4,'Si':4,'N':3,'P':3,'As':3,'Sb':3,'O':2,'S':2,'Se':2,'Te':2,'F':1,'Cl':3,'Br':3,'I':3}[nm] || 2;
        type = 'Synthesis (Non-metal Halide / Halogen Addition)';
        products = [nm + h + (nmVal > 1 ? nmVal : '')];
      }
    }
    else if (nm1 === 'H' && nm2 === 'O') { type = 'Synthesis (Water)'; products = ['H2O']; }
    else if (nm2 === 'H' && nm1 === 'O') { type = 'Synthesis (Water)'; products = ['H2O']; }
    else if (nm1 === 'N' && nm2 === 'H') { type = 'Synthesis (Ammonia)'; products = ['NH3']; }
    else if (nm1 === 'H' && nm2 === 'N') { type = 'Synthesis (Ammonia)'; products = ['NH3']; }
    else if (nm1 === 'C' && nm2 === 'O') { type = 'Synthesis (Carbon dioxide)'; products = ['CO2']; }
    else if (nm1 === 'O' && nm2 === 'C') { type = 'Synthesis (Carbon dioxide)'; products = ['CO2']; }
    else if (nm1 === 'S' && nm2 === 'O') { type = 'Synthesis (Sulfur dioxide)'; products = ['SO2']; }
    else if (nm1 === 'O' && nm2 === 'S') { type = 'Synthesis (Sulfur dioxide)'; products = ['SO2']; }
    else if (nm1 === 'P' && nm2 === 'O') { type = 'Synthesis (Phosphorus pentoxide)'; products = ['P4O10']; }
    else if (nm1 === 'O' && nm2 === 'P') { type = 'Synthesis (Phosphorus pentoxide)'; products = ['P4O10']; }
    else { type = 'Synthesis (Covalent Compound)'; products = [nm1 + nm2]; }
  }

  /* 7a. Condensation polymerization: dicarboxylic acid + diol/diamine → polymer + H2O */
  else if (isCondensationPolymerPair(r1, r2))
    return handleCondensationPolymerization(reactants);
  else if (isCondensationPolymerPair(r2, r1))
    return handleCondensationPolymerization([r2, r1]);

  /* 8. Acid + Base / Hydroxide → Neutralization */
  /* 8a. Ester + Base/Hydroxide → Saponification (Salt + Alcohol) */
  else if ((isEster(r1) && (t2 === 'base' || t2 === 'hydroxide' || containsMetal(r2))) ||
           (isEster(r2) && (t1 === 'base' || t1 === 'hydroxide' || containsMetal(r1))))
    return handleSaponification(reactants);

  /* 9. Carboxylic acid + alcohol → Esterification */
  else if (isCarboxylicAcid(r1) && isAlcohol(r2) || isCarboxylicAcid(r2) && isAlcohol(r1))
    return handleEsterification(reactants);

  /* 10. Acid + Base / Hydroxide → Neutralization */
  else if (t1 === 'acid' && t2 === 'base' || t1 === 'base' && t2 === 'acid')
    return handleAcidBase(reactants);
  else if (t1 === 'acid' && t2 === 'hydroxide' || t1 === 'hydroxide' && t2 === 'acid')
    return handleAcidBase(reactants);
  else if ((t1 === 'acid' || isAcid(r1)) && hasHydroxide(r2) || (t2 === 'acid' || isAcid(r2)) && hasHydroxide(r1))
    return handleAcidBase(reactants);

  /* 11. Carboxylic acid + hydroxide → Neutralization */
  else if (isCarboxylicAcid(r1) && hasHydroxide(r2) || isCarboxylicAcid(r2) && hasHydroxide(r1))
    return handleAcidBase(reactants);

  /* 11. Hydration: oxide + H2O → hydroxide / acid */
  else if ((t1 === 'monoxide' || t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'tetraoxide' || t1 === 'pentoxide' || t1 === 'oxide') && isWater(r2))
    return handleHydration(r1, r2);
  else if ((t2 === 'monoxide' || t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'tetraoxide' || t2 === 'pentoxide' || t2 === 'oxide') && isWater(r1))
    return handleHydration(r2, r1);

  /* 11a. Acid + Metal Oxide → Salt + H2O (Neutralization) */
  else if ((t1 === 'monoxide' || t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'tetraoxide' || t1 === 'pentoxide' || t1 === 'oxide') && containsMetal(r1) && isAcid(r2))
    return handleAcidMetalOxide(r1, r2);
  else if ((t2 === 'monoxide' || t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'tetraoxide' || t2 === 'pentoxide' || t2 === 'oxide') && containsMetal(r2) && isAcid(r1))
    return handleAcidMetalOxide(r2, r1);

  /* 12. Metal + water → Single displacement */
  else if (isMetal(r1) && isWater(r2) || isWater(r1) && isMetal(r2)) {
    const metal = isMetal(r1) ? r1 : r2;
    const mEl = getFirstMetal(metal);
    const mIdx = REACTIVITY.indexOf(mEl);
    if (mIdx < 0 || mIdx > 3) throw new Error(mEl + ' is not reactive enough to displace H from water');
    type = 'Single Displacement (Metal + Water)';
    const oxState = getElementOxidationStateInCompound(metal, mEl) || getOxidationState(mEl);
    if (['Na','K','Li','Ca','Ba'].includes(mEl)) {
      const hydroxide = oxState === 1 ? mEl + 'OH' : (oxState === 2 ? mEl + '(OH)2' : mEl + '(OH)' + oxState);
      products = [hydroxide, 'H2'];
    } else {
      const oxide = oxState === 1 ? mEl + '2O' : (oxState === 2 ? mEl + 'O' : mEl + '2O3');
      products = [oxide, 'H2'];
    }
  }

  /* 13. Carbonate + acid → Salt + H2O + CO2 */
  else if (isCarbonate(r1) && isAcid(r2) || isAcid(r1) && isCarbonate(r2))
    return handleCarbonateAcid(reactants);

  /* 13a. Base + non-metal oxide (CO2/SO2/SO3) → Salt + H2O */
  else if ((t1 === 'hydroxide' || t1 === 'base' || (containsMetal(r1) && hasHydroxide(r1)) || r1 === 'NH3' || r1 === 'NH4OH') &&
           (t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'pentoxide' || t2 === 'oxide'))
    return handleBaseNonMetalOxide(r1, r2);
  else if ((t2 === 'hydroxide' || t2 === 'base' || (containsMetal(r2) && hasHydroxide(r2)) || r2 === 'NH3' || r2 === 'NH4OH') &&
           (t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'pentoxide' || t1 === 'oxide'))
    return handleBaseNonMetalOxide(r2, r1);

  /* 14. Hydrogenation: unsaturated + H2 → saturated */
  else if (isUnsaturated(r1) && isHydrogen(r2)) return handleHydrogenation(r1);
  else if (isUnsaturated(r2) && isHydrogen(r1)) return handleHydrogenation(r2);

  /* 14a. Carbonyl reduction: aldehyde/ketone + H2 → alcohol (Addition of Hydrogen / Reduction) */
  else if (isHydrogen(r1) && isCarbonyl(r2))
    return handleCarbonylReduction(r2, r1);
  else if (isHydrogen(r2) && isCarbonyl(r1))
    return handleCarbonylReduction(r1, r2);

  /* 14b. Halogenation: unsaturated + Cl2/Br2/F2/I2 → vicinal dihalide */
  else if (isUnsaturated(r1) && isHalogen(r2)) return handleHalogenation(r1, r2);
  else if (isUnsaturated(r2) && isHalogen(r1)) return handleHalogenation(r2, r1);

  /* 14b. Hydrohalogenation: unsaturated + HX → haloalkane */
  else if (isUnsaturated(r1) && isHydrogenHalide(r2)) return handleHydrohalogenation(r1, r2);
  else if (isUnsaturated(r2) && isHydrogenHalide(r1)) return handleHydrohalogenation(r2, r1);

  /* 14d. Hydrocyanation: unsaturated + HCN → alkyl cyanide */
  else if (isUnsaturated(r1) && isHydrogenCyanide(r2))
    return handleHydrocyanation(r1, r2, rEls[0]);
  else if (isUnsaturated(r2) && isHydrogenCyanide(r1))
    return handleHydrocyanation(r2, r1, rEls[1]);

  /* 14e. Epoxidation: unsaturated + H2O2 → epoxide + H2O */
  else if (isUnsaturated(r1) && isPeroxide(r2))
    return handleEpoxidation(r1, r2, rEls[0]);
  else if (isUnsaturated(r2) && isPeroxide(r1))
    return handleEpoxidation(r2, r1, rEls[1]);

  /* 15. Reduction by H2: oxide + H2 → element + H2O (Reduction) */
  else if ((t1 === 'monoxide' || t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'tetraoxide' || t1 === 'pentoxide' || t1 === 'oxide') && isHydrogen(r2))
    return handleReductionByHydrogen(r1, r2);
  else if ((t2 === 'monoxide' || t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'tetraoxide' || t2 === 'pentoxide' || t2 === 'oxide') && isHydrogen(r1))
    return handleReductionByHydrogen(r2, r1);

  /* 16. Reduction by Carbon: metal oxide + C → metal + CO2 (Smelting) */
  else if ((t1 === 'monoxide' || t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'tetraoxide' || t1 === 'pentoxide' || t1 === 'oxide') && parseCompoundElements(r2).C && Object.keys(parseCompoundElements(r2)).length <= 2)
    return handleCarbonReduction(r1, r2);
  else if ((t2 === 'monoxide' || t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'tetraoxide' || t2 === 'pentoxide' || t2 === 'oxide') && parseCompoundElements(r1).C && Object.keys(parseCompoundElements(r1)).length <= 2)
    return handleCarbonReduction(r2, r1);

  /* 17. Alkene Hydration: unsaturated + H2O → alcohol */
  else if (isUnsaturated(r1) && isWater(r2))
    return handleAlkeneHydration(r1);
  else if (isUnsaturated(r2) && isWater(r1))
    return handleAlkeneHydration(r2);

  /* 18b. Copolymerization: two different unsaturated compounds */
  else if (r1 !== r2 && isUnsaturated(r1) && isUnsaturated(r2) && !containsMetal(r1) && !containsMetal(r2)) {
    return handlePolymerization(reactants);
  }

  /* 19. Polymerization: two identical unsaturated compounds */
  else if (r1 === r2 && isUnsaturated(r1)) {
    return handlePolymerization(reactants);
  }

  /* 19a. Dehydrogenation: alkane → alkene + H2 */
  else if (isHydrocarbon(r1) && !isOxygen(r2) && !isWater(r2) && !isHydrogen(r2) && !isAcid(r2)) {
    type = 'Dehydrogenation';
    const els = rEls[0];
    const hRemoved = Math.min(els.H || 0, 2);
    products = [r1.replace(/H(\d+)/, (m, n) => 'H' + (parseInt(n) - hRemoved)), 'H2'];
  }

  /* 19a. Hydrate formation: anhydrous salt + water → hydrated salt */
  else if (isHydrateFormation(reactants)) {
    return handleHydrateFormation(reactants);
  }

  /* 19b. Hydrolysis: salt + water */
  else if ((t1 === 'salt' || t1 === 'base' || t1 === 'compound' || t1 === 'carbonate') && isWater(r2))
    return handleHydrolysis(reactants);
  else if (isWater(r1) && (t2 === 'salt' || t2 === 'base' || t2 === 'compound' || t2 === 'carbonate'))
    return handleHydrolysis([r2, r1]);

  /* 19b. Ester hydrolysis: ester + water → carboxylic acid + alcohol */
  else if (isEster(r1) && isWater(r2))
    return handleEsterHydrolysis(r1, r2);
  else if (isEster(r2) && isWater(r1))
    return handleEsterHydrolysis(r2, r1);

  /* 20. Double displacement → Precipitation */
  else if (hasHalogen(r1) && containsMetal(r1) && hasHalogen(r2) && containsMetal(r2))
    return handleDoubleDisplacement(reactants);
  else if ((hasHalogen(r1) || hasNO3(r1)) && containsMetal(r1) &&
           (hasHalogen(r2) || hasNO3(r2)) && containsMetal(r2))
    return handleDoubleDisplacement(reactants);
  else if (containsMetal(r1) && containsOxygen(r1) && containsMetal(r2) && containsOxygen(r2))
    return handleDoubleDisplacement(reactants);

  /* 21. Metal + Hydrogen → Metal Hydride */
  else if (containsMetal(r1) && isHydrogen(r2) || isHydrogen(r1) && containsMetal(r2)) {
    const metal = containsMetal(r1) ? r1 : r2;
    const mEl = getFirstMetal(metal);
    type = 'Synthesis (Metal Hydride / Hydrogen Addition)';
    const oxState = getOxidationState(mEl);
    products = [mEl + 'H' + (oxState === 1 ? '' : oxState)];
  }

  /* 22. Metal + Acid → Salt + H2 (Single Displacement) */
  else if (containsMetal(r1) && isAcid(r2) || isAcid(r1) && containsMetal(r2)) {
    const [metal, acid] = containsMetal(r1) ? [r1, r2] : [r2, r1];
    return handleMetalAcid(metal, acid);
  }

  /* 22.5. Thermite: metal + metal oxide → different metal + metal oxide */
  else if (isMetal(r1) && (t2 === 'monoxide' || t2 === 'dioxide' || t2 === 'trioxide' || t2 === 'tetraoxide' || t2 === 'pentoxide' || t2 === 'oxide') && containsMetal(r2) && r1 !== getFirstMetal(r2))
    return handleThermite(r1, r2);
  else if (isMetal(r2) && (t1 === 'monoxide' || t1 === 'dioxide' || t1 === 'trioxide' || t1 === 'tetraoxide' || t1 === 'pentoxide' || t1 === 'oxide') && containsMetal(r1) && r2 !== getFirstMetal(r1))
    return handleThermite(r2, r1);

  /* 23. Metal Displacement: metal + metal salt → different salt + metal */
  else if (isMetal(r1) && containsMetal(r2) && r1 !== getFirstMetal(r2))
    return handleMetalDisplacement(r1, r2);
  else if (isMetal(r2) && containsMetal(r1) && r2 !== getFirstMetal(r1))
    return handleMetalDisplacement(r2, r1);

  /* 24. Halogen Displacement: halogen + halide salt → different halide salt + halogen */
  else if (isHalogen(r1) && containsMetal(r2) && getHalogen(r2))
    return handleHalogenDisplacement(r1, r2);
  else if (isHalogen(r2) && containsMetal(r1) && getHalogen(r1))
    return handleHalogenDisplacement(r2, r1);

  /* 26. General addition / synthesis fallback */
  else if (isMetal(r1) || isNonMetal(r1) || isMetal(r2) || isNonMetal(r2)) {
    type = 'Synthesis (Addition)';
    const el1 = Object.keys(e1)[0], el2 = Object.keys(e2)[0];
    if (el1 && el2) products = [el1 + el2];
    else products = [r1 + r2];
  }

  /* 28. Fallback: Double displacement */
  else { return handleDoubleDisplacement(reactants); }

  steps.push('Reaction type: ' + type);
  const eqStr = tryBalanceOneWay(reactants, products, type);
  steps.push('Predicted equation: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* ==================== SECTION 12: MULTI-REACTANT (3+) ==================== */

function handleMultiReactant(reactants, rTypes, rEls, steps) {
  steps.push('Multi-reactant reaction (' + reactants.length + ' reactants)');
  let type, products;

  /* Look for common patterns */

  /* KMnO4 + H2SO4 + H2O2 → redox */
  const hasKMnO4 = reactants.some(r => r.toUpperCase().includes('KMN') || r.toUpperCase().includes('KMN'));
  const hasH2SO4 = reactants.some(r => r.toUpperCase().includes('H2SO4'));
  const hasH2O2 = reactants.some(r => r.toUpperCase().includes('H2O2') || r === 'H2O2');

  if (hasKMnO4 && hasH2SO4 && hasH2O2) {
    type = 'Redox (KMnO₄ + H₂SO₄ + H₂O₂ → O₂)';
    const metalReactant = reactants.find(r => r.toUpperCase().includes('KMN'));
    const metalEl = getFirstMetal(metalReactant || 'KMnO4') || 'K';
    products = [metalEl + '2SO4', 'MnSO4', 'O2', 'H2O'];
    const eqStr = tryBalanceOneWay(reactants, products, type);
    steps.push('Predicted: ' + eqStr);
    return { type, equation: eqStr, predictions: [eqStr], steps };
  }

  /* K2Cr2O7 + FeSO4 + H2SO4 → redox (dichromate oxidises Fe²⁺ to Fe³⁺) */
  const hasDichromate = reactants.some(r => r.toUpperCase().includes('CR2O7') || r.toUpperCase().includes('CR2O7'));
  const hasFeSO4 = reactants.some(r => r.toUpperCase().includes('FESO4'));
  if (hasDichromate && hasFeSO4 && hasH2SO4) {
    type = 'Redox (Dichromate + Fe²⁺ → Cr³⁺ + Fe³⁺)';
    products = ['K2SO4', 'Cr2(SO4)3', 'Fe2(SO4)3', 'H2O'];
    const eqStr = tryBalanceOneWay(reactants, products, type);
    steps.push('Predicted: ' + eqStr);
    return { type, equation: eqStr, predictions: [eqStr], steps };
  }

  /* FeSO4 + HNO3 + H2SO4 → Fe₂(SO₄)₃ + NO + H₂O (Redox) */
  const hasMetalSulfate = reactants.some(r => containsMetal(r) && r.includes('SO4') && r !== 'H2SO4');
  const hasHNO3 = reactants.some(r => r.toUpperCase() === 'HNO3');
  if (hasMetalSulfate && hasHNO3 && hasH2SO4) {
    const ms = reactants.find(r => containsMetal(r) && r.includes('SO4') && r !== 'H2SO4');
    const metalEl = getFirstMetal(ms);
    const oxState = getOxidationState(metalEl);
    if (oxState === 2) {
      type = 'Redox (Metal(II) Oxidation by HNO₃/H₂SO₄)';
      products = [metalEl + '2(SO4)3', 'NO', 'H2O'];
      const eqStr = tryBalanceOneWay(reactants, products, type);
      steps.push('Predicted: ' + eqStr);
      return { type, equation: eqStr, predictions: [eqStr], steps };
    }
  }

  /* Acid + oxidizing agent + organic → oxidation */
  const hasAcid = reactants.some(r => isAcid(r));
  const hasOxidizer = reactants.some(r => isOxygen(r) || r === 'H2O2' || r === 'KMnO4' || r === 'K2Cr2O7');
  const hasOrganic = reactants.some(r => isOrganic(r) || isHydrocarbon(r));

  if (hasAcid && hasOxidizer && hasOrganic) {
    const organic = reactants.find(r => isOrganic(r) || isHydrocarbon(r));
    if (organic) {
      return handleCHydrocarbon([organic, 'O2']);
    }
  }

  /* General redox: look for oxidizer + variable-oxidation-state compound */
  const oxidizers = reactants.filter(r => isOxygen(r) || r === 'H2O2' || r === 'HNO3');
  const redoxMetals = ['Fe','Cu','Mn','Cr','V','Co','Ce','Sn','Pb','Hg'];
  const oxidizable = reactants.filter(r => {
    const parsed = parseCompoundElements(r);
    return Object.keys(parsed).some(el => redoxMetals.includes(el) && getElementOxidationStateInCompound(r, el) !== null && getElementOxidationStateInCompound(r, el) < 7);
  });
  if (oxidizers.length > 0 && oxidizable.length > 0) {
    const ox = oxidizable[0];
    const oxEl = Object.keys(parseCompoundElements(ox)).find(el => redoxMetals.includes(el));
    const currOx = getElementOxidationStateInCompound(ox, oxEl);
    if (currOx !== null && currOx < 7) {
      steps.push(oxEl + ' at oxidation state ' + currOx + ' can be oxidized further');
      type = 'Redox (General Oxidation)';
      const anion = 'SO4';
      const higherOxState = currOx === 2 ? 3 : (currOx + 1);
      const guess = higherOxState <= 3 ? oxEl + '2(SO4)3' : oxEl + 'O' + (higherOxState > 1 ? higherOxState : '');
      products = [guess];
      const others = reactants.filter(r => r !== ox && r !== 'H2SO4' && r !== 'HNO3' && !isOxygen(r) && r !== 'H2O2');
      products.push(...others);
      if (reactants.some(r => containsOxygen(r))) products.push('H2O');
      const eqStr = tryBalanceOneWay(reactants, products, type);
      steps.push('Predicted: ' + eqStr);
      return { type, equation: eqStr, predictions: [eqStr], steps };
    }
  }

  /* Metal + acid + something else (only for actual reactive metals, not salts) */
  const isReactiveMetal = r => containsMetal(r) && !r.includes('SO4') && !r.includes('NO3') && !r.includes('Cl') && !r.includes('Br') && !r.includes('I') && !r.includes('CO3') && !r.includes('PO4') && !r.includes('Cr2O7') && !r.includes('CrO4') && !r.includes('C2O4');
  const rMetals = reactants.filter(r => isReactiveMetal(r));
  const acids = reactants.filter(r => isAcid(r));
  if (rMetals.length >= 1 && acids.length >= 1) {
    const metal = rMetals[0];
    const acid = acids[0];
    steps.push('Detected metal + acid pattern among ' + reactants.length + ' reactants');
    return handleMetalAcid(metal, acid);
  }

  /* Fallback: try targeted pairwise decomposition */
  steps.push('Trying pairwise decomposition...');
  const pairResult = tryPairwise(reactants, rTypes, rEls, steps);
  if (pairResult) return pairResult;

  /* Last-resort: generic oxide/salt formation */
  const allAtoms = {};
  reactants.forEach(r => {
    const parsed = rEls[reactants.indexOf(r)];
    for (const [el, cnt] of Object.entries(parsed))
      allAtoms[el] = (allAtoms[el] || 0) + cnt;
  });
  const totalO = allAtoms.O || 0;
  const totalH = allAtoms.H || 0;
  const totalC = allAtoms.C || 0;
  const totalMetal = Object.keys(allAtoms).filter(e => METALS_LIST.includes(e));
  const totalNonMetal = Object.keys(allAtoms).filter(e => !METALS_LIST.includes(e) && !['O','H'].includes(e));

  if (totalC && totalO >= 2) { type = 'Combustion'; products = ['CO2']; if (totalH >= 2) products.push('H2O'); }
  else if (totalMetal.length && totalNonMetal.length) {
    type = 'Salt Formation';
    const cat = totalMetal[0];
    const anion = totalNonMetal[0];
    if (totalO >= 2 && totalH >= 2) products = [cat + anion, 'H2O'];
    else products = [cat + anion];
  } else {
    throw new Error('Cannot predict products for this multi-reactant combination.');
  }

  steps.push('Reaction type: ' + type);
  const eqStr = tryBalanceOneWay(reactants, products, type);
  steps.push('Predicted equation: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

function tryPairwise(reactants, rTypes, rEls, steps) {
  const n = reactants.length;

  /* O2 + organic/hydrocarbon → combustion, others as spectators */
  const oxyIdx = reactants.findIndex(r => isOxygen(r));
  const orgIdx = reactants.findIndex(r => r !== 'H2O' && r !== 'CO2' && (isHydrocarbon(r) || (isOrganic(r) && !containsMetal(r))));
  if (oxyIdx >= 0 && orgIdx >= 0) {
    const fuel = reactants[orgIdx];
    const fuelEls = parseCompoundElements(fuel);
    const prod = [];
    if (fuelEls.C) prod.push('CO2');
    if (fuelEls.H) prod.push('H2O');
    if (fuelEls.N) prod.push('N2');
    if (fuelEls.S) prod.push('SO2');
    if (prod.length === 0) return null;
    const spectators = reactants.filter((_, k) => k !== oxyIdx && k !== orgIdx);
    prod.push(...spectators);
    const typ = 'Combustion (Multi-reactant)';
    const eqStr = tryBalanceOneWay(reactants, prod, typ);
    steps.push('Pairwise: combustion of ' + fuel + ' with O₂');
    steps.push('Predicted: ' + eqStr);
    return { type: typ, equation: eqStr, predictions: [eqStr], steps: steps.slice() };
  }

  /* Metal + H₂O + O₂ → hydroxide (e.g. Na + H₂O + O₂ → NaOH + H₂O₂) */
  const metalIdx = reactants.findIndex(r => containsMetal(r) && !r.includes('OH'));
  const h2oIdx = reactants.findIndex(r => isWater(r));
  if (metalIdx >= 0 && h2oIdx >= 0 && oxyIdx >= 0) {
    const metal = reactants[metalIdx];
    const metalEl = getFirstMetal(metal);
    const oxState = getOxidationState(metalEl) || 1;
    const hydroxide = oxState === 1 ? metalEl + 'OH' : (oxState === 2 ? metalEl + '(OH)2' : metalEl + '(OH)3');
    const spectators2 = reactants.filter((_, k) => k !== metalIdx && k !== h2oIdx && k !== oxyIdx);
    const prod2 = [hydroxide, ...spectators2];
    const typ2 = 'Redox (Metal Oxidation)';
    const eqStr2 = tryBalanceOneWay(reactants, prod2, typ2);
    if (eqStr2) {
      steps.push('Pairwise: metal + H₂O + O₂ → hydroxide');
      steps.push('Predicted: ' + eqStr2);
      return { type: typ2, equation: eqStr2, predictions: [eqStr2], steps: steps.slice() };
    }
  }

  /* Metal + acid + anything → metal-acid reaction, other as spectator */
  const acidIdx = reactants.findIndex(r => isAcid(r));
  if (metalIdx >= 0 && acidIdx >= 0) {
    try {
      const pairResult = handleTwoReactants(
        [reactants[metalIdx], reactants[acidIdx]],
        [rTypes[metalIdx], rTypes[acidIdx]],
        [rEls[metalIdx], rEls[acidIdx]],
        []
      );
      if (pairResult && pairResult.equation) {
        const spectators3 = reactants.filter((_, k) => k !== metalIdx && k !== acidIdx);
        const arrowIdx = pairResult.equation.search(/[→⇌]/);
        let baseEq = arrowIdx >= 0 ? pairResult.equation.slice(0, arrowIdx).trim() : reactants[metalIdx] + ' + ' + reactants[acidIdx];
        if (spectators3.length > 0) baseEq += ' + ' + spectators3.join(' + ');
        baseEq += ' → ';
        const prodList3 = arrowIdx >= 0 ? pairResult.equation.slice(arrowIdx + 1).trim().split('+').map(s => s.trim()).filter(s => s) : [];
        baseEq += [...prodList3, ...spectators3].join(' + ');
        steps.push('Pairwise: metal + acid, others as spectators');
        steps.push('Predicted: ' + baseEq);
        return { type: pairResult.type + ' (Multi-reactant)', equation: baseEq, predictions: [baseEq], steps: steps.slice() };
      }
    } catch (_) {}
  }

  /* Acid + base + anything → neutralization */
  const baseIdx = reactants.findIndex(r => classifyCompound(r) === 'base' || (r.includes('OH') && containsMetal(r)));
  if (acidIdx >= 0 && baseIdx >= 0) {
    try {
      const pairResult = handleTwoReactants(
        [reactants[acidIdx], reactants[baseIdx]],
        [rTypes[acidIdx], rTypes[baseIdx]],
        [rEls[acidIdx], rEls[baseIdx]],
        []
      );
      if (pairResult && pairResult.equation) {
        const spectators4 = reactants.filter((_, k) => k !== acidIdx && k !== baseIdx);
        const arrowIdx = pairResult.equation.search(/[→⇌]/);
        let baseEq = arrowIdx >= 0 ? pairResult.equation.slice(0, arrowIdx).trim() : reactants[acidIdx] + ' + ' + reactants[baseIdx];
        if (spectators4.length > 0) baseEq += ' + ' + spectators4.join(' + ');
        baseEq += ' → ';
        const prodList4 = arrowIdx >= 0 ? pairResult.equation.slice(arrowIdx + 1).trim().split('+').map(s => s.trim()).filter(s => s) : [];
        baseEq += [...prodList4, ...spectators4].join(' + ');
        steps.push('Pairwise: acid + base neutralization, others as spectators');
        steps.push('Predicted: ' + baseEq);
        return { type: 'Neutralization (Multi-reactant)', equation: baseEq, predictions: [baseEq], steps: steps.slice() };
      }
    } catch (_) {}
  }

  return null;
}

/* ==================== SECTION 13: REACTION HANDLERS ==================== */

/* --- Combustion --- */
function handleCHydrocarbon(reactants) {
  const steps = [];
  steps.push('Identified: Combustion');
  let fuel, oxygen;
  if (reactants.length === 1) { fuel = reactants[0]; oxygen = 'O2'; }
  else {
    const hydIdx = reactants.findIndex(r => isHydrocarbon(r) || isOrganic(r));
    const oxIdx = reactants.findIndex(r => isOxygen(r));
    if (hydIdx >= 0 && oxIdx >= 0) { fuel = reactants[hydIdx]; oxygen = reactants[oxIdx]; }
    else { fuel = reactants[0]; oxygen = 'O2'; }
  }

  const els = parseCompoundElements(fuel);
  const hasC = !!els.C, hasN = !!els.N, hasS = !!els.S, hasH = !!els.H;
  const type = hasC ? (hasN ? 'Combustion with Nitrogen' : 'Complete Combustion') : 'Combustion';
  steps.push('Fuel: ' + fuel + ', Oxidizer: ' + oxygen);
  const products = [];
  if (hasC) products.push('CO2');
  if (hasH) products.push('H2O');
  if (hasN) products.push('N2');
  if (hasS) products.push('SO2');
  if (!hasC && !hasH && !hasN && !hasS) products.push('CO2', 'H2O');
  const eqStr = tryBalanceOneWay([fuel, oxygen], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Metal + Oxygen → Metal Oxide --- */
function handleMetalOxygen(reactants) {
  const steps = [];
  const metal = reactants[0];
  const mEl = getFirstMetal(metal);
  const oxState = getOxidationState(mEl);
  let oxideFormula;
  if (oxState === 1) oxideFormula = mEl + '2O';
  else if (oxState === 2) oxideFormula = mEl + 'O';
  else if (oxState === 3) oxideFormula = mEl + '2O3';
  else oxideFormula = mEl + '2O' + oxState;
  const type = 'Synthesis (Metal Oxide / Oxygen Addition)';
  steps.push(mEl + ' + O₂ → ' + oxideFormula);
  const eqStr = tryBalanceOneWay(reactants, [oxideFormula], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Roasting: metal sulfide + O₂ → metal oxide + SO₂ --- */
function handleRoasting(sulfide, oxygen) {
  const steps = [];
  steps.push('Roasting: ' + sulfide + ' + ' + oxygen);
  const els = parseCompoundElements(sulfide);
  const mEl = getFirstMetal(sulfide);
  const oxState = getElementOxidationStateInCompound(sulfide, mEl) || getOxidationState(mEl);
  let oxideFormula;
  if (oxState === 1) oxideFormula = mEl + '2O';
  else if (oxState === 2) oxideFormula = mEl + 'O';
  else if (oxState === 3) oxideFormula = mEl + '2O3';
  else oxideFormula = mEl + '2O' + oxState;
  const type = 'Roasting (Metal Sulfide → Metal Oxide + SO₂)';
  steps.push('Products: ' + oxideFormula + ' + SO₂');
  const products = [oxideFormula, 'SO2'];
  const eqStr = tryBalanceOneWay([sulfide, oxygen], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Oxide + O₂ → Higher Oxide (Oxygen Addition) --- */
function handleOxideSynthesis(oxide, oxygen) {
  const steps = [];
  steps.push('Oxide: ' + oxide + ' + O₂');
  const els = parseCompoundElements(oxide);
  const nonO = Object.keys(els).find(e => e !== 'O');
  const currentO = els.O || 0;
  let product, type;
  const pairs = {
    'C:1': ['CO2', 'CO → CO₂'],
    'S:2': ['SO3', 'SO₂ → SO₃'],
    'N:1': ['NO2', 'NO → NO₂'],
    'N:2': ['N2O5', 'NO₂ → N₂O₅'],
    'P:2': ['P2O5', 'P₂O₃ → P₂O₅'],
  };
  const key = nonO + ':' + currentO;
  if (pairs[key]) { product = pairs[key][0]; type = 'Oxygen Addition (' + pairs[key][1] + ')'; }
  else { product = nonO + 'O' + (currentO + 1); type = 'Oxygen Addition (Oxide → Higher Oxide)'; }
  steps.push('Product: ' + product);
  const eqStr = tryBalanceOneWay([oxide, oxygen], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Hydration: oxide + H₂O → hydroxide / acid --- */
function handleHydration(oxide, water) {
  const steps = [];
  steps.push('Hydration: ' + oxide + ' + ' + water);
  const els = parseCompoundElements(oxide);
  const nonO = Object.keys(els).find(e => e !== 'O');
  const hasMetal = containsMetal(oxide);
  let products, type;

  if (hasMetal) {
    type = 'Hydration (Metal Oxide → Hydroxide)';
    const oxState = getOxidationState(nonO);
    if (oxState === 1) products = [nonO + 'OH'];
    else if (oxState === 2) products = [nonO + '(OH)2'];
    else if (oxState === 3) products = [nonO + '(OH)3'];
    else products = [nonO + 'OH'];
    if (oxide === 'CaO') products = ['Ca(OH)2'];
    if (oxide === 'MgO') products = ['Mg(OH)2'];
    if (oxide === 'Na2O') products = ['NaOH'];
    if (oxide === 'K2O') products = ['KOH'];
    if (oxide === 'Fe2O3') products = ['Fe(OH)3'];
    if (oxide === 'Fe3O4') { products = ['Fe(OH)2','Fe(OH)3']; type = 'Hydration (Mixed Oxide → Hydroxides)'; }
  } else {
    type = 'Hydration (Non-metal Oxide → Oxyacid)';
    if (oxide === 'CO2') products = ['H2CO3'];
    else if (oxide === 'SO2') products = ['H2SO3'];
    else if (oxide === 'SO3') products = ['H2SO4'];
    else if (oxide === 'N2O5') products = ['HNO3'];
    else if (oxide === 'N2O3') products = ['HNO2'];
    else if (oxide === 'P4O10' || oxide === 'P2O5') products = ['H3PO4'];
    else if (oxide === 'Cl2O7') products = ['HClO4'];
    else if (oxide === 'Cl2O') products = ['HClO'];
    else if (oxide === 'ClO2') products = ['HClO2'];
    else if (oxide === 'Cl2O5') products = ['HClO3'];
    else if (oxide === 'NO2') products = ['HNO3','HNO2'];
    else if (oxide === 'SiO2') products = ['H2SiO3'];
    else if (oxide === 'Br2O') products = ['HBrO'];
    else if (oxide === 'I2O') products = ['HIO'];
    else if (oxide === 'I2O5') products = ['HIO3'];
    else if (oxide === 'P2O3') products = ['H3PO3'];
    else if (oxide === 'As2O3') products = ['H3AsO3'];
    else if (oxide === 'As2O5') products = ['H3AsO4'];
    else products = ['H2' + nonO + 'O' + (els.O + 1)];
  }
  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([oxide, water], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Hydrogenation: unsaturated + H₂ → saturated --- */
function handleHydrogenation(reactant) {
  const steps = [];
  steps.push('Hydrogenation: ' + reactant + ' + H₂');
  const els = parseCompoundElements(reactant);
  const type = 'Hydrogenation (Addition of H₂ to Unsaturated Compound)';
  const c = els.C || 0;
  const h = els.H || 0;
  const o = els.O || 0;
  const db = Math.floor((2 * c + 2 - h) / 2);
  const hAdded = 2 * db;
  let product;
  if (o > 0) product = 'C' + c + 'H' + (h + hAdded) + 'O' + o;
  else product = 'C' + c + 'H' + (h + hAdded);
  steps.push('Product: ' + product);
  const eqStr = tryBalanceOneWay([reactant, 'H2'], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Halogenation: unsaturated + Cl₂/Br₂/F₂/I₂ → vicinal dihalide --- */
function handleHalogenation(unsaturated, halogen) {
  const steps = [];
  steps.push('Halogenation: ' + unsaturated + ' + ' + halogen);
  const hEl = getHalogen(halogen);
  if (!hEl) throw new Error('Not a halogen: ' + halogen);
  const els = parseCompoundElements(unsaturated);
  const c = els.C || 0;
  const h = els.H || 0;
  const halogens = (els.F||0)+(els.Cl||0)+(els.Br||0)+(els.I||0);
  const du = Math.max(1, Math.floor((2*c+2-h-halogens)/2));
  const xAdded = 2*du;
  const allEls = { ...els };
  allEls[hEl] = (allEls[hEl]||0)+xAdded;
  const order = ['C','H','O','N','S','P','F','Cl','Br','I'];
  const sorted = Object.keys(allEls).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  let product = '';
  for (const el of sorted) { product += el; if (allEls[el]>1) product += allEls[el]; }
  steps.push('Product: ' + product);
  const type = 'Halogenation (Addition of ' + halogen + ' to Unsaturated Compound)';
  const eqStr = tryBalanceOneWay([unsaturated, halogen], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Hydrohalogenation: unsaturated + HCl/HBr/HI → haloalkane --- */
function handleHydrohalogenation(unsaturated, hx) {
  const steps = [];
  steps.push('Hydrohalogenation: ' + unsaturated + ' + ' + hx);
  const hxEls = parseCompoundElements(hx);
  const xEl = Object.keys(hxEls).find(e => e !== 'H') || 'Cl';
  const els = parseCompoundElements(unsaturated);
  const c = els.C || 0;
  const h = els.H || 0;
  const halogens = (els.F||0)+(els.Cl||0)+(els.Br||0)+(els.I||0);
  const du = Math.max(1, Math.floor((2*c+2-h-halogens)/2));
  const allEls = { ...els };
  allEls['H'] = (allEls['H']||0)+du;
  allEls[xEl] = (allEls[xEl]||0)+du;
  const order = ['C','H','O','N','S','P','F','Cl','Br','I'];
  const sorted = Object.keys(allEls).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  let product = '';
  for (const el of sorted) { product += el; if (allEls[el]>1) product += allEls[el]; }
  const type = 'Hydrohalogenation (Addition of ' + hx + ' to Unsaturated Compound)';
  steps.push('Product: ' + product);
  const eqStr = tryBalanceOneWay([unsaturated, hx], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

function isHydrogenCyanide(f) {
  const u = f.toUpperCase();
  return u === 'HCN' || u === 'HNC';
}

function handleHydrocyanation(unsaturated, hcn, els) {
  const steps = [];
  steps.push('Hydrocyanation: ' + unsaturated + ' + ' + hcn);
  const c = els.C || 0;
  const h = els.H || 0;
  const n = (els.N||0) + 1;
  const cStr = c + 1 > 1 ? 'C' + (c + 1) : 'C';
  const hStr = h + 1;
  const nStr = n > 1 ? 'N' + n : 'N';
  const product = cStr + 'H' + hStr + nStr;
  const type = 'Hydrocyanation (Addition of HCN to Unsaturated Compound)';
  steps.push('Product: ' + product);
  const eqStr = tryBalanceOneWay([unsaturated, hcn], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

function handleEpoxidation(unsaturated, peroxide, els) {
  const steps = [];
  steps.push('Epoxidation: ' + unsaturated + ' + ' + peroxide);
  const c = els.C || 0;
  const h = els.H || 0;
  const product1 = 'C' + (c > 1 ? c : '') + 'H' + h + 'O';
  const type = 'Epoxidation (Addition of Oxygen to Unsaturated Compound)';
  steps.push('Products: ' + product1 + ' + H2O');
  const eqStr = tryBalanceOneWay([unsaturated, peroxide], [product1, 'H2O'], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Reduction by H₂: oxide + H₂ → element + H₂O --- */
function handleReductionByHydrogen(oxide, hydrogen) {
  const steps = [];
  steps.push('Reduction: ' + oxide + ' + ' + hydrogen);
  const els = parseCompoundElements(oxide);
  const nonO = Object.keys(els).find(e => e !== 'O');
  const type = 'Reduction (Oxygen Removal by H₂)';
  const products = [nonO, 'H2O'];
  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([oxide, hydrogen], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

function isCarbonyl(f) {
  const els = parseCompoundElements(f);
  if (!els.C || !els.H || !els.O) return false;
  if (isAcid(f) || isAlcohol(f) || isCarboxylicAcid(f)) return false;
  if (isUnsaturated(f)) return false;
  return els.O === 1 && Object.keys(els).length <= 3;
}

function handleCarbonylReduction(carbonyl, hydrogen) {
  const steps = [];
  steps.push('Reduction: ' + carbonyl + ' + ' + hydrogen);
  const els = parseCompoundElements(carbonyl);
  const type = 'Reduction (Carbonyl → Alcohol / Hydrogen Addition)';
  const cStr = els.C > 1 ? 'C' + els.C : 'C';
  const products = [cStr + 'H' + (els.H + 2) + 'O'];
  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([carbonyl, hydrogen], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Reduction by Carbon: metal oxide + C → metal + CO₂ (Smelting) --- */
function handleCarbonReduction(oxide, carbon) {
  const steps = [];
  steps.push('Reduction (Smelting): ' + oxide + ' + ' + carbon);
  const els = parseCompoundElements(oxide);
  const metals = Object.keys(els).filter(e => METALS_LIST.includes(e));
  const metalEl = metals.length > 0 ? metals[0] : Object.keys(els).find(e => e !== 'O');
  const type = 'Reduction (Carbon Smelting)';
  const products = [metalEl, 'CO2'];
  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([oxide, carbon], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Alkene Hydration: unsaturated + H₂O → alcohol --- */
function handleAlkeneHydration(alkene) {
  const steps = [];
  steps.push('Alkene Hydration: ' + alkene + ' + H₂O');
  const els = parseCompoundElements(alkene);
  const type = 'Hydration (Alkene → Alcohol)';
  els.H = (els.H || 0) + 2;
  els.O = (els.O || 0) + 1;
  const order = ['C','H','O','N','S','P','F','Cl','Br','I'];
  const sorted = Object.keys(els).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  let product = '';
  for (const el of sorted) {
    product += el;
    if (els[el] > 1) product += els[el];
  }
  steps.push('Product: ' + product);
  const eqStr = tryBalanceOneWay([alkene, 'H2O'], [product], type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Hydrolysis: salt + H₂O --- */
function handleHydrolysis(reactants) {
  const steps = [];
  const salt = reactants[0];
  const water = reactants[1];
  steps.push('Hydrolysis: ' + salt + ' + ' + water);
  const els = parseCompoundElements(salt);
  const metals = Object.keys(els).filter(e => METALS_LIST.includes(e));
  const poly = extractPolyatomic(salt);
  const hasMetal = metals.length > 0;
  let type, products;

  /* Conjugate acid lookup for common polyatomic anions */
  const CONJUGATE_ACID = {
    'CO3': 'H2CO3', 'HCO3': 'H2CO3',
    'NO3': 'HNO3', 'NO2': 'HNO2',
    'SO4': 'H2SO4', 'SO3': 'H2SO3',
    'PO4': 'H3PO4', 'HPO4': 'H2PO4', 'H2PO4': 'H3PO4',
    'ClO': 'HClO', 'ClO2': 'HClO2', 'ClO3': 'HClO3', 'ClO4': 'HClO4',
    'CH3COO': 'CH3COOH', 'HCOO': 'HCOOH',
    'MnO4': 'HMnO4', 'Cr2O7': 'H2Cr2O7', 'CrO4': 'H2CrO4',
    'C2O4': 'H2C2O4', 'S2O3': 'H2S2O3',
    'CN': 'HCN', 'SCN': 'HSCN',
    'BO3': 'H3BO3', 'SiO3': 'H2SiO3', 'AsO4': 'H3AsO4',
  };

  if (poly === 'NH4' && !hasMetal) {
    type = 'Hydrolysis (Ammonium Salt → Ammonia + Acid)';
    const nonO = Object.keys(els).filter(e => e !== 'N' && e !== 'H' && e !== 'O');
    if (nonO.length > 0) {
      const anion = nonO[0];
      const halogen = ['F','Cl','Br','I'].includes(anion) ? 'H' + anion : null;
      products = halogen ? ['NH3', halogen] : ['NH3', 'H' + anion];
    } else products = ['NH3', 'H2O'];
  } else if (poly && hasMetal) {
    const metal = metals[0];
    const oxState = getElementOxidationStateInCompound(salt, metal) || getOxidationState(metal);
    const hydroxide = oxState === 1 ? metal + 'OH' : (oxState === 2 ? metal + '(OH)2' : metal + '(OH)' + oxState);
    if (['CO3','HCO3'].includes(poly)) {
      type = 'Hydrolysis (Carbonate → Hydroxide + CO₂)';
      products = [hydroxide, 'CO2'];
    } else if (poly === 'SO4' || poly === 'SO3') {
      type = 'Hydrolysis (Salt → Hydroxide + Acid)';
      products = [hydroxide, CONJUGATE_ACID[poly] || 'H2' + poly];
    } else {
      type = 'Hydrolysis (Salt → Hydroxide + Acid)';
      products = [hydroxide, CONJUGATE_ACID[poly] || 'H' + poly];
    }
  } else if (hasMetal) {
    const metal = metals[0];
    const halogen = getHalogen(salt);
    if (!halogen) throw new Error('Cannot predict hydrolysis for ' + salt);
    type = 'Hydrolysis (Salt → Hydroxide + Acid)';
    const oxState = getElementOxidationStateInCompound(salt, metal) || getOxidationState(metal);
    const hydroxide = oxState === 1 ? metal + 'OH' : (oxState === 2 ? metal + '(OH)2' : metal + '(OH)' + oxState);
    products = [hydroxide, 'H' + halogen];
  } else {
    type = 'Hydrolysis (General)';
    throw new Error('Cannot predict hydrolysis for ' + salt);
  }

  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([salt, water], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Acid-Base Neutralization --- */
function handleAcidBase(reactants) {
  const steps = [];
  const acidIdx = reactants.findIndex(r => isAcid(r));
  const baseIdx = reactants.findIndex(r => !isAcid(r));
  if (acidIdx < 0 || baseIdx < 0) {
    const nohIdx = reactants.findIndex(r => r.includes('OH'));
    if (nohIdx >= 0) {
      const swapped = [reactants[1 - nohIdx], reactants[nohIdx]];
      if (swapped[0] === reactants[0] && swapped[1] === reactants[1]) throw new Error('Could not identify acid and base.');
      return handleAcidBase(swapped);
    }
    throw new Error('Could not identify acid and base.');
  }
  const acid = reactants[acidIdx];
  const base = reactants[baseIdx];
  steps.push('Acid: ' + acid + ', Base: ' + base);

  const aEls = parseCompoundElements(acid);
  const bEls = parseCompoundElements(base);
  let cation = null, anion = null;

  if (isCarboxylicAcid(acid)) {
    anion = acid.slice(0, -1);
  } else {
    /* Check for CN (cyanide) polyatomic in HCN */
    if (aEls.C === 1 && aEls.N === 1 && !aEls.O) {
      anion = 'CN';
    } else {
      const nonH = Object.keys(aEls).find(e => e !== 'H' && e !== 'O');
      if (nonH && aEls.O) {
        const centralEl = nonH;
        const numO = aEls.O;
        if (centralEl === 'S' && numO === 4) anion = 'SO4';
        else if (centralEl === 'N' && numO === 3) anion = 'NO3';
        else if (centralEl === 'N' && numO === 2) anion = 'NO2';
        else if (centralEl === 'C' && numO === 3) anion = 'CO3';
        else if (centralEl === 'P' && numO === 4) anion = 'PO4';
        else if (centralEl === 'Cl' && numO === 1) anion = 'ClO';
        else if (centralEl === 'Cl' && numO === 2) anion = 'ClO2';
        else if (centralEl === 'Cl' && numO === 3) anion = 'ClO3';
        else if (centralEl === 'Cl' && numO === 4) anion = 'ClO4';
        else if (centralEl === 'C' && numO === 2) anion = 'C2O4';
        else anion = nonH + 'O' + numO;
      } else if (nonH) { anion = nonH; }
      else if (aEls.F) { anion = 'F'; }
      else if (aEls.Cl) { anion = 'Cl'; }
      else if (aEls.Br) { anion = 'Br'; }
      else if (aEls.I) { anion = 'I'; }
      else { throw new Error('Unknown acid anion.'); }
    }
  }

  /* Determine cation from base — check NH4/NH3 first */
  const metalFromBase = getFirstMetal(base);
  const baseHasNH4 = base.includes('NH4') || base === 'NH3' || base === 'NH4OH';
  if (baseHasNH4 && !metalFromBase) {
    cation = 'NH4';
  } else {
    const baseMetals = Object.keys(bEls).filter(e => e !== 'O' && e !== 'H');
    cation = metalFromBase || (baseMetals.length > 0 ? baseMetals[0] : 'NH4');
  }
  const type = 'Acid-Base Neutralization';
  steps.push('Cation: ' + cation + ', Anion: ' + anion);

  const cationCharge = POLYATOMIC_IONS[cation] ? POLYATOMIC_IONS[cation].charge : (getElementOxidationStateInCompound(base, cation) || getOxidationState(cation));
  const anionChargeMap = {'F':1,'Cl':1,'Br':1,'I':1,'OH':1,'NO3':1,'NO2':1,'ClO':1,'ClO2':1,'ClO3':1,'ClO4':1,'CO3':2,'SO4':2,'SO3':2,'PO4':3,'C2O4':2,'O':2,'S':2,'CN':1};
  const anionCharge = POLYATOMIC_IONS[anion] ? Math.abs(POLYATOMIC_IONS[anion].charge) : (anionChargeMap[anion] || 1);

  let salt;
  const isPolyCation = POLYATOMIC_IONS[cation] !== undefined && cation !== 'NH4' ? true : ['NH4'].includes(cation);
  const isPolyAnion = POLYATOMIC_IONS[anion] !== undefined;
  if (cationCharge === anionCharge) {
    salt = cation + anion;
  } else if (Math.abs(cationCharge) === 2 && Math.abs(anionCharge) === 1) {
    salt = isPolyAnion ? cation + '(' + anion + ')2' : cation + anion + '2';
  }
  else if (Math.abs(cationCharge) === 1 && Math.abs(anionCharge) === 2) {
    salt = isPolyCation ? '(' + cation + ')2' + anion : cation + '2' + anion;
  }
  else if (Math.abs(cationCharge) === 3 && Math.abs(anionCharge) === 1) {
    salt = isPolyAnion ? cation + '(' + anion + ')3' : cation + anion + '3';
  }
  else if (Math.abs(cationCharge) === 1 && Math.abs(anionCharge) === 3) {
    salt = isPolyCation ? '(' + cation + ')3' + anion : cation + '3' + anion;
  }
  else if (Math.abs(cationCharge) === 2 && Math.abs(anionCharge) === 3) { salt = cation + '3(' + anion + ')2'; }
  else if (Math.abs(cationCharge) === 3 && Math.abs(anionCharge) === 2) { salt = cation + '2(' + anion + ')3'; }
  else { salt = cation + anion; }

  if (isCarboxylicAcid(acid)) {
    if (cationCharge === 1) salt = anion + cation;
    else if (cationCharge === 2) salt = '(' + anion + ')2' + cation;
    else salt = anion + cation;
  }

  const products = [salt, 'H2O'];
  const eqStr = tryBalanceOneWay(reactants, products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Base + Non-metal Oxide → Salt + H₂O --- */
function handleBaseNonMetalOxide(base, oxide) {
  const steps = [];
  steps.push('Base: ' + base + ', Non-metal Oxide: ' + oxide);
  const bEls = parseCompoundElements(base);
  const oEls = parseCompoundElements(oxide);
  const metal = getFirstMetal(base);
  const isNH4Base = base.includes('NH4') || base === 'NH3' || base === 'NH4OH';

  let cation;
  if (isNH4Base) cation = 'NH4';
  else if (metal) cation = metal;
  else throw new Error('Unrecognized base: ' + base);

  const oxideForm = oxide.toUpperCase();
  let anion, anionCharge, type;
  if (oxideForm === 'CO2') { anion = 'CO3'; anionCharge = 2; type = 'Acid-Base (Base + CO₂ → Carbonate + H₂O)'; }
  else if (oxideForm === 'SO2') { anion = 'SO3'; anionCharge = 2; type = 'Acid-Base (Base + SO₂ → Sulfite + H₂O)'; }
  else if (oxideForm === 'SO3') { anion = 'SO4'; anionCharge = 2; type = 'Acid-Base (Base + SO₃ → Sulfate + H₂O)'; }
  else throw new Error('Unrecognized non-metal oxide: ' + oxide);

  const cationCharge = POLYATOMIC_IONS[cation] ? POLYATOMIC_IONS[cation].charge : (getElementOxidationStateInCompound(base, cation) || getOxidationState(cation));
  const isPolyCation = POLYATOMIC_IONS[cation] !== undefined && cation !== 'NH4' ? true : ['NH4'].includes(cation);
  let salt;
  if (Math.abs(cationCharge) === 1 && anionCharge === 2) salt = isPolyCation ? '(' + cation + ')2' + anion : cation + '2' + anion;
  else if (Math.abs(cationCharge) === 2 && anionCharge === 2) salt = cation + anion;
  else if (Math.abs(cationCharge) === 3 && anionCharge === 2) salt = cation + '2(' + anion + ')3';
  else salt = cation + anion;

  steps.push('Salt: ' + salt + ', H₂O');
  const products = [salt, 'H2O'];
  const eqStr = tryBalanceOneWay([base, oxide], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Carbonate + Acid → Salt + CO₂ + H₂O --- */
function handleCarbonateAcid(reactants) {
  const steps = [];
  const carbIdx = reactants.findIndex(r => isCarbonate(r));
  const acidIdx = reactants.findIndex(r => isAcid(r));
  if (carbIdx < 0 || acidIdx < 0) throw new Error('Need a carbonate and an acid.');
  const carb = reactants[carbIdx], acid = reactants[acidIdx];
  steps.push('Carbonate: ' + carb + ', Acid: ' + acid);
  const mEl = getFirstMetal(carb);
  const aEls = parseCompoundElements(acid);
  if (!mEl) throw new Error('No metal in carbonate ' + carb);

  let anion;
  if (aEls.S && aEls.O === 4) anion = 'SO4';
  else if (aEls.N && aEls.O === 3) anion = 'NO3';
  else if (aEls.N && aEls.O === 2) anion = 'NO2';
  else if (aEls.P && aEls.O === 4) anion = 'PO4';
  else if (aEls.C && aEls.O === 3 && aEls.H >= 2) anion = 'CO3';
  else if (aEls.F && !aEls.O) anion = 'F';
  else if (aEls.Cl && !aEls.O) anion = 'Cl';
  else if (aEls.Br && !aEls.O) anion = 'Br';
  else if (aEls.I && !aEls.O) anion = 'I';
  else if (aEls.Cl && aEls.O === 1) anion = 'ClO';
  else if (aEls.Cl && aEls.O === 2) anion = 'ClO2';
  else if (aEls.Cl && aEls.O === 3) anion = 'ClO3';
  else if (aEls.Cl && aEls.O === 4) anion = 'ClO4';
  else if (aEls.Cl) anion = 'Cl';
  else anion = Object.keys(aEls).find(e => e !== 'H' && e !== 'O') || 'Cl';

  const cationCharge = getElementOxidationStateInCompound(carb, mEl) || getOxidationState(mEl);
  const anionChargeMap = {'F':1,'Cl':1,'Br':1,'I':1,'OH':1,'NO3':1,'NO2':1,'ClO':1,'ClO2':1,'ClO3':1,'ClO4':1,'SO4':2,'CO3':2,'PO4':3};
  const aCharge = anionChargeMap[anion] || 1;

  let salt;
  if (cationCharge === aCharge) {
    salt = mEl + anion;
    if (['Cl','F','Br','I'].includes(anion)) salt = mEl + anion;
    else if (['CO3','SO4','SO3','PO4'].includes(anion)) {
      salt = mEl + '2' + anion;
      if (cationCharge === 2) salt = mEl + anion;
      if (cationCharge === 1 && anion === 'PO4') salt = mEl + '3PO4';
      if (cationCharge === 2 && anion === 'PO4') salt = mEl + '3(PO4)2';
      if (cationCharge === 3 && anion === 'PO4') salt = mEl + 'PO4';
    } else { salt = mEl + anion; }
  } else if (cationCharge === 2 && aCharge === 1) { salt = mEl + anion + '2'; }
  else if (cationCharge === 1 && aCharge === 2) { salt = mEl + '2' + anion; }
  else if (cationCharge === 3 && aCharge === 1) { salt = mEl + anion + '3'; }
  else if (cationCharge === 1 && aCharge === 3) { salt = mEl + '3' + anion; }
  else if (cationCharge === 2 && aCharge === 3) { salt = mEl + '3(' + anion + ')2'; }
  else if (cationCharge === 3 && aCharge === 2) { salt = mEl + '2(' + anion + ')3'; }
  else { salt = mEl + anion; }

  const type = 'Carbonate-Acid (Neutralization with CO₂)';
  steps.push('Salt: ' + salt + ', CO₂ + H₂O');
  const products = [salt, 'H2O', 'CO2'];
  const eqStr = tryBalanceOneWay([carb, acid], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Acid + Metal Oxide → Salt + H₂O (Neutralization) --- */
function handleAcidMetalOxide(oxide, acid) {
  const steps = [];
  steps.push('Acid: ' + acid + ', Metal Oxide: ' + oxide);
  const mEl = getFirstMetal(oxide);
  if (!mEl) throw new Error('No metal in oxide ' + oxide);
  const aEls = parseCompoundElements(acid);
  let anion, anionCharge = 1;
  if (isCarboxylicAcid(acid)) { anion = acid.slice(0, -1); }
  else if (aEls.C === 1 && aEls.N === 1 && !aEls.O) { anion = 'CN'; }
  else {
    const nonH = Object.keys(aEls).find(e => e !== 'H' && e !== 'O');
    if (nonH && aEls.O) {
      const ce = nonH, no = aEls.O;
      if (ce === 'S' && no === 4) { anion = 'SO4'; anionCharge = 2; }
      else if (ce === 'N' && no === 3) { anion = 'NO3'; }
      else if (ce === 'N' && no === 2) { anion = 'NO2'; }
      else if (ce === 'C' && no === 3) { anion = 'CO3'; anionCharge = 2; }
      else if (ce === 'P' && no === 4) { anion = 'PO4'; anionCharge = 3; }
      else if (ce === 'Cl' && no === 1) { anion = 'ClO'; }
      else if (ce === 'Cl' && no === 2) { anion = 'ClO2'; }
      else if (ce === 'Cl' && no === 3) { anion = 'ClO3'; }
      else if (ce === 'Cl' && no === 4) { anion = 'ClO4'; }
      else if (ce === 'C' && no === 2) { anion = 'C2O4'; anionCharge = 2; }
      else { anion = nonH + 'O' + no; }
    } else if (nonH) { anion = nonH; }
    else if (aEls.F) { anion = 'F'; }
    else if (aEls.Cl) { anion = 'Cl'; }
    else if (aEls.Br) { anion = 'Br'; }
    else if (aEls.I) { anion = 'I'; }
    else throw new Error('Unknown acid anion.');
  }
  const cationCharge = getElementOxidationStateInCompound(oxide, mEl) || getOxidationState(mEl);
  const anionChargeMap = {'F':1,'Cl':1,'Br':1,'I':1,'OH':1,'NO3':1,'NO2':1,'ClO':1,'ClO2':1,'ClO3':1,'ClO4':1,'CO3':2,'SO4':2,'SO3':2,'PO4':3,'C2O4':2,'O':2,'S':2,'CN':1};
  const aCharge = POLYATOMIC_IONS[anion] ? Math.abs(POLYATOMIC_IONS[anion].charge) : (anionChargeMap[anion] || 1);
  const isPolyAnion = POLYATOMIC_IONS[anion] !== undefined;
  let salt;
  if (Math.abs(cationCharge) === 1 && Math.abs(aCharge) === 1) salt = mEl + anion;
  else if (Math.abs(cationCharge) === 2 && Math.abs(aCharge) === 1) salt = isPolyAnion ? mEl + '(' + anion + ')2' : mEl + anion + '2';
  else if (Math.abs(cationCharge) === 3 && Math.abs(aCharge) === 1) salt = isPolyAnion ? mEl + '(' + anion + ')3' : mEl + anion + '3';
  else if (Math.abs(cationCharge) === 1 && Math.abs(aCharge) === 2) salt = mEl + '2' + anion;
  else if (Math.abs(cationCharge) === 2 && Math.abs(aCharge) === 2) salt = mEl + anion;
  else if (Math.abs(cationCharge) === 3 && Math.abs(aCharge) === 2) salt = mEl + '2(' + anion + ')3';
  else if (Math.abs(cationCharge) === 1 && Math.abs(aCharge) === 3) salt = mEl + '3' + anion;
  else if (Math.abs(cationCharge) === 2 && Math.abs(aCharge) === 3) salt = mEl + '3(' + anion + ')2';
  else if (Math.abs(cationCharge) === 3 && Math.abs(aCharge) === 3) salt = mEl + anion;
  else salt = mEl + anion;
  const type = 'Neutralization (Acid + Metal Oxide → Salt + H₂O)';
  steps.push('Salt: ' + salt + ', H₂O');
  const products = [salt, 'H2O'];
  const eqStr = tryBalanceOneWay([oxide, acid], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Metal + Acid → Salt + H₂ --- */
function handleMetalAcid(metal, acid) {
  const steps = [];
  steps.push('Metal: ' + metal + ', Acid: ' + acid);
  const mEl = getFirstMetal(metal);
  if (!mEl) throw new Error('No metal found in ' + metal);
  const mIdx = REACTIVITY.indexOf(mEl);
  const hIdx = REACTIVITY.indexOf('H');
  if (mIdx < 0 || mIdx > hIdx) throw new Error(mEl + ' is less reactive than H — no single-displacement reaction with acid');
  const aEls = parseCompoundElements(acid);
  const nonH = Object.keys(aEls).find(e => e !== 'H' && e !== 'O');
  let anion = nonH || 'Cl', anionCharge = 1;

  if (aEls.S && aEls.O === 4) { anion = 'SO4'; anionCharge = 2; }
  else if (aEls.N && aEls.O === 3) { anion = 'NO3'; anionCharge = 1; }
  else if (aEls.N && aEls.O === 2) { anion = 'NO2'; anionCharge = 1; }
  else if (aEls.Cl && aEls.O === 1) { anion = 'ClO'; anionCharge = 1; }
  else if (aEls.Cl && aEls.O === 2) { anion = 'ClO2'; anionCharge = 1; }
  else if (aEls.Cl && aEls.O === 3) { anion = 'ClO3'; anionCharge = 1; }
  else if (aEls.Cl && aEls.O === 4) { anion = 'ClO4'; anionCharge = 1; }
  else if (aEls.P && aEls.O === 4) { anion = 'PO4'; anionCharge = 3; }
  else if (aEls.C && aEls.O === 3) { anion = 'CO3'; anionCharge = 2; }
  else if (aEls.F) { anion = 'F'; anionCharge = 1; }
  else if (aEls.Cl && !aEls.O) { anion = 'Cl'; anionCharge = 1; }
  else if (aEls.Br && !aEls.O) { anion = 'Br'; anionCharge = 1; }
  else if (aEls.I && !aEls.O) { anion = 'I'; anionCharge = 1; }

  const oxState = getElementOxidationStateInCompound(metal, mEl) || getOxidationState(mEl);
  let salt;
  if (['Cl','F','Br','I'].includes(anion)) {
    if (oxState === 1) salt = mEl + anion;
    else if (oxState === 2) salt = mEl + anion + '2';
    else if (oxState === 3) salt = mEl + anion + '3';
    else salt = mEl + anion + oxState;
  } else if (anionCharge === 1 && oxState === 1) { salt = mEl + anion; }
  else if (anionCharge === 1 && oxState === 2) { salt = mEl + '(' + anion + ')2'; }
  else if (anionCharge === 1 && oxState === 3) { salt = mEl + '(' + anion + ')3'; }
  else if (anionCharge === 2 && oxState === 1) { salt = mEl + '2' + anion; }
  else if (anionCharge === 2 && oxState === 2) { salt = mEl + anion; }
  else if (anionCharge === 2 && oxState === 3) { salt = mEl + '2(' + anion + ')3'; }
  else if (anionCharge === 3 && oxState === 1) { salt = mEl + '3' + anion; }
  else if (anionCharge === 3 && oxState === 2) { salt = mEl + '3(' + anion + ')2'; }
  else { salt = mEl + anion; }

  const type = 'Single Displacement (Metal + Acid → Salt + H₂)';
  steps.push('Salt: ' + salt + ', H₂ produced');
  const products = [salt, 'H2'];
  const eqStr = tryBalanceOneWay([metal, acid], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Esterification --- */
function handleEsterification(reactants) {
  const steps = [];
  const acidIdx = reactants.findIndex(r => isCarboxylicAcid(r));
  const alcIdx = reactants.findIndex(r => isAlcohol(r));
  const acid = reactants[acidIdx], alcohol = reactants[alcIdx];
  steps.push('Carboxylic acid: ' + acid + ', Alcohol: ' + alcohol);
  const known = {
    'CH3COOH+CH3OH': 'CH3COOCH3',
    'CH3COOH+CH3CH2OH': 'CH3COOCH2CH3',
    'CH3COOH+C2H5OH': 'CH3COOCH2CH3',
    'HCOOH+CH3OH': 'HCOOCH3',
    'HCOOH+CH3CH2OH': 'HCOOCH2CH3',
    'HCOOH+C2H5OH': 'HCOOCH2CH3',
  };
  const key = acid + '+' + alcohol;
  const ester = known[key] || 'RCOOR';
  const type = 'Esterification (Carboxylic Acid + Alcohol → Ester + H₂O)';
  steps.push('Products: ' + ester + ' + H₂O');
  const products = [ester, 'H2O'];
  const eqStr = tryBalanceOneWay([acid, alcohol], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Saponification: ester + base/hydroxide → salt + alcohol --- */
function handleSaponification(reactants) {
  const steps = [];
  const estIdx = reactants.findIndex(r => isEster(r));
  const baseIdx = reactants.findIndex(r => r !== reactants[estIdx]);
  const ester = reactants[estIdx], base = reactants[baseIdx];
  steps.push('Ester: ' + ester + ', Base: ' + base);
  const s = ester.replace(/[-=≡]/g, '');
  const cooIdx = s.indexOf('COO');
  const rGroup = s.substring(0, cooIdx);
  let alkGroup = s.substring(cooIdx + 3);
  const metal = getFirstMetal(base);
  const salt = rGroup + 'COO' + metal;
  const alcohol = alkGroup + 'OH';
  const type = 'Saponification (Ester + Base → Salt + Alcohol)';
  steps.push('Products: ' + salt + ' + ' + alcohol);
  const products = [salt, alcohol];
  const eqStr = tryBalanceOneWay([ester, base], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Ester Hydrolysis: ester + H2O → carboxylic acid + alcohol --- */
function handleEsterHydrolysis(ester, water) {
  const steps = [];
  steps.push('Ester hydrolysis: ' + ester + ' + ' + water);
  const s = ester.replace(/[-=≡]/g, '');
  const cooIdx = s.indexOf('COO');
  const rGroup = s.substring(0, cooIdx);
  const alkGroup = s.substring(cooIdx + 3);
  const products = [rGroup + 'COOH', alkGroup + 'OH'];
  const type = 'Hydrolysis (Ester → Carboxylic Acid + Alcohol)';
  steps.push('Product(s): ' + products.join(', '));
  const eqStr = tryBalanceOneWay([ester, water], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Double Displacement / Precipitation --- */
function handleDoubleDisplacement(reactants) {
  const steps = [];
  const r1 = reactants[0], r2 = reactants[1];
  steps.push('Double displacement: ' + r1 + ' + ' + r2);
  const e1 = parseCompoundElements(r1), e2 = parseCompoundElements(r2);
  const metals1 = Object.keys(e1).filter(e => isMetalElement(e));
  const metals2 = Object.keys(e2).filter(e => isMetalElement(e));
  const nonMetals1 = Object.keys(e1).filter(e => !isMetalElement(e) && e !== 'H' && e !== 'O');
  const nonMetals2 = Object.keys(e2).filter(e => !isMetalElement(e) && e !== 'H' && e !== 'O');
  const poly1 = extractPolyatomic(r1), poly2 = extractPolyatomic(r2);

  let cation1 = metals1.length > 0 ? metals1[0] : 'H';
  let cation2 = metals2.length > 0 ? metals2[0] : 'H';
  let anion1 = null, anion2 = null;

  const polyCharge = (p) => POLYATOMIC_IONS[p] ? POLYATOMIC_IONS[p].charge : 0;

  if (poly1) {
    if (polyCharge(poly1) > 0) cation1 = poly1;
    else anion1 = poly1;
  }
  if (!anion1) {
    if (nonMetals1.length > 0) anion1 = nonMetals1[0];
    else if (!metals1.length && !(poly1 && polyCharge(poly1) > 0)) {
      if (e1.H) cation1 = 'H';
      const nonH1 = Object.keys(e1).find(e => e !== 'H' && e !== 'O');
      if (nonH1) anion1 = e1.O > 0 ? nonH1 + 'O' + e1.O : nonH1;
    } else if (!anion1) anion1 = 'O';
  }

  if (poly2) {
    if (polyCharge(poly2) > 0) cation2 = poly2;
    else anion2 = poly2;
  }
  if (!anion2) {
    if (nonMetals2.length > 0) anion2 = nonMetals2[0];
    else if (!metals2.length && !(poly2 && polyCharge(poly2) > 0)) {
      if (e2.H) cation2 = 'H';
      const nonH2 = Object.keys(e2).find(e => e !== 'H' && e !== 'O');
      if (nonH2) anion2 = e2.O > 0 ? nonH2 + 'O' + e2.O : nonH2;
    } else if (!anion2) anion2 = 'O';
  }

  steps.push('Swapping: ' + cation1 + ' + ' + anion2 + ' → P1; ' + cation2 + ' + ' + anion1 + ' → P2');

  function getCationCharge(cat, srcCompound) {
    if (POLYATOMIC_IONS[cat]) return POLYATOMIC_IONS[cat].charge;
    if (cat === 'H') return 1;
    const ox = getElementOxidationStateInCompound(srcCompound, cat);
    if (ox !== null && ox !== undefined) return ox;
    const fallback = {'Li':1,'Na':1,'K':1,'Rb':1,'Cs':1,'Be':2,'Mg':2,'Ca':2,'Sr':2,'Ba':2,'Al':3,'Fe':3,'Cu':2,'Zn':2,'Ag':1,'NH4':1};
    return fallback[cat] || 2;
  }
  function getSimpleAnionCharge(an) {
    if (POLYATOMIC_IONS[an]) return Math.abs(POLYATOMIC_IONS[an].charge);
    return Math.abs(MONATOMIC_ANION_CHARGES[an] || 1);
  }
  const cCharge1 = getCationCharge(cation1, r1);
  const cCharge2 = getCationCharge(cation2, r2);
  const aCharge1 = getSimpleAnionCharge(anion1);
  const aCharge2 = getSimpleAnionCharge(anion2);

  const product1 = predictIonicFormula(cation1, cCharge1, anion2, aCharge2) || cation1 + anion2;
  const product2 = predictIonicFormula(cation2, cCharge2, anion1, aCharge1) || cation2 + anion1;

  const p1Soluble = isSoluble(product1);
  const p2Soluble = isSoluble(product2);
  const precipitate = !p1Soluble ? product1 : (!p2Soluble ? product2 : null);

  const type = precipitate ? 'Double Displacement (Precipitation)' : 'Double Displacement';
  steps.push('Products: ' + product1 + ' + ' + product2);
  if (precipitate) steps.push(precipitate + ' is insoluble → precipitate');

  const products = [product1, product2];
  const eqStr = tryBalanceOneWay(reactants, products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Thermite: metal + metal oxide → different metal + metal oxide (Reduction by Active Metal) --- */
function handleThermite(activeMetal, metalOxide) {
  const steps = [];
  steps.push('Thermite: ' + activeMetal + ' + ' + metalOxide);
  const mEl = getFirstMetal(activeMetal);
  const oxEl = getFirstMetal(metalOxide);
  const mOxState = getElementOxidationStateInCompound(activeMetal, mEl) || getOxidationState(mEl);
  const oxInOxide = getElementOxidationStateInCompound(metalOxide, oxEl) || getOxidationState(oxEl);
  let newOxide;
  if (mOxState === 1) newOxide = mEl + '2O';
  else if (mOxState === 2) newOxide = mEl + 'O';
  else if (mOxState === 3) newOxide = mEl + '2O3';
  else newOxide = mEl + 'O' + mOxState;
  const type = 'Thermite (Reduction by Active Metal → Metal + Metal Oxide)';
  steps.push('Products: ' + newOxide + ' + ' + oxEl);
  const products = [newOxide, oxEl];
  const eqStr = tryBalanceOneWay([activeMetal, metalOxide], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Metal Displacement: metal + metal salt → different salt + metal --- */
const REACTIVITY = ['K','Ca','Na','Mg','Al','Zn','Fe','Sn','Pb','H','Cu','Ag','Au'];

function handleMetalDisplacement(metal, salt) {
  const steps = [];
  steps.push('Metal displacement: ' + metal + ' + ' + salt);
  const mEl = getFirstMetal(metal);
  const saltMetalEl = getFirstMetal(salt);
  const mIdx = REACTIVITY.indexOf(mEl);
  const saltIdx = REACTIVITY.indexOf(saltMetalEl);
  if (mIdx < 0 || saltIdx < 0 || mIdx >= saltIdx) throw new Error('No displacement reaction: ' + metal + ' is not more reactive than ' + saltMetalEl);

  const saltEls = parseCompoundElements(salt);
  const poly = extractPolyatomic(salt);
  const nonMetalEls = Object.keys(saltEls).filter(e => !METALS_LIST.includes(e) && e !== 'H' && e !== 'O');
  const anions = saltEls.O ? Object.keys(saltEls).filter(e => !METALS_LIST.includes(e) && e !== 'O') : nonMetalEls;
  let anion = poly || (anions.length > 0 ? anions[0] : (nonMetalEls.length > 0 ? nonMetalEls[0] : 'Cl'));

  const mCharge = getElementOxidationStateInCompound(metal, mEl) || getOxidationState(mEl);
  const aCharge = POLYATOMIC_IONS[anion] ? Math.abs(POLYATOMIC_IONS[anion].charge) : 1;

  const newSalt = predictIonicFormula(mEl, mCharge, anion, aCharge) || mEl + anion;
  const type = 'Single Displacement (Metal + Salt → Different Salt + Metal)';
  steps.push('Products: ' + newSalt + ' + ' + saltMetalEl);
  const products = [newSalt, saltMetalEl];
  const eqStr = tryBalanceOneWay([metal, salt], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Halogen Displacement: halogen + halide salt → different halide salt + halogen --- */
const HALOGEN_REACTIVITY = ['F2','Cl2','Br2','I2'];

function handleHalogenDisplacement(halogen, salt) {
  const steps = [];
  steps.push('Halogen displacement: ' + halogen + ' + ' + salt);
  const hEl = getHalogen(halogen);
  const saltHalogen = getHalogen(salt);
  if (!hEl || !saltHalogen) throw new Error('Missing halogen');
  const hIdx = HALOGEN_REACTIVITY.indexOf(halogen);
  const saltIdx = HALOGEN_REACTIVITY.indexOf(saltHalogen + '2');
  if (saltIdx < 0 || hIdx < 0 || hIdx >= saltIdx) throw new Error('No halogen displacement: ' + halogen + ' is not more reactive than ' + saltHalogen);

  const saltEls = parseCompoundElements(salt);
  const metals = Object.keys(saltEls).filter(e => METALS_LIST.includes(e));
  const cation = metals.length > 0 ? metals[0] : 'H';
  const type = 'Single Displacement (Halogen Displacement)';
  const newSalt = cation + hEl;
  const freedHalogen = saltHalogen + '2';
  steps.push('Products: ' + newSalt + ' + ' + freedHalogen);
  const products = [newSalt, freedHalogen];
  const eqStr = tryBalanceOneWay([halogen, salt], products, type);
  steps.push('Balanced: ' + eqStr);
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* ==================== SECTION 14: UTILITY ==================== */

/* --- Polymerization: unsaturated hydrocarbon → polymer --- */
function handlePolymerization(reactants) {
  const steps = [];
  const monomer = reactants[0];
  steps.push('Monomer: ' + monomer);
  const type = reactants.length > 1 ? 'Polymerization (Copolymerization)' : 'Polymerization (Addition)';
  const polymerFormulas = {
    'C2H4': '(-CH2-CH2-)n',
    'CH2=CH2': '(-CH2-CH2-)n',
    'C2H2': '(-CH=CH-)n',
    'C3H6': '(-CH2-CH(CH3)-)n',
    'CH2=CH-CH3': '(-CH2-CH(CH3)-)n',
    'C4H8': '(-C4H8-)n',
    'CH3-CH=CH-CH3': '(-CH(CH3)-CH(CH3)-)n',
    'CH2=CH-CH2-CH3': '(-CH2-CH(CH2CH3)-)n',
    'C2H3Cl': '(-CH2-CHCl-)n',
    'CH2=CHCl': '(-CH2-CHCl-)n',
    'C6H5-CH=CH2': '(-CH2-CH(C6H5)-)n',
    'C6H5CH=CH2': '(-CH2-CH(C6H5)-)n',
    'CH2=CH-C6H5': '(-CH2-CH(C6H5)-)n',
    'CH2=CH-CN': '(-CH2-CH(CN)-)n',
    'CH2=CHCN': '(-CH2-CH(CN)-)n',
    'CH2=C(CH3)2': '(-CH2-C(CH3)2-)n',
    'CH2=CCl2': '(-CH2-CCl2-)n',
    'CH2=CH-CH=CH2': '(-CH2-CH=CH-CH2-)n',
    'CH2=CH-COOCH3': '(-CH2-CH(COOCH3)-)n',
    'CH2=CHCOOCH3': '(-CH2-CH(COOCH3)-)n',
  };
  if (reactants.length === 1) {
    const product = polymerFormulas[monomer] || '(' + monomer + ')n';
    steps.push('Product: ' + product + ' (polymer chain)');
    const eqStr = reactants.join(' + ') + ' → ' + product;
    return { type, equation: eqStr, predictions: [eqStr], steps };
  }
  /* Copolymer: two different monomers */
  steps.push('Monomers: ' + reactants.join(' + '));
  const p1 = polymerFormulas[reactants[0]] || reactants[0];
  const p2 = polymerFormulas[reactants[1]] || reactants[1];
  const product = '(' + p1.replace(/^\(|\)n$/g, '') + '-co-' + p2.replace(/^\(|\)n$/g, '') + ')n';
  steps.push('Product: ' + product + ' (copolymer chain)');
  const eqStr = reactants.join(' + ') + ' → ' + product;
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Condensation polymerization: dicarboxylic acid + diol/diamine → polymer + H2O --- */
function isCondensationPolymerPair(a, b) {
  const aCOOH = (a.match(/COOH/g) || []).length + (a.match(/HOOC/g) || []).length;
  const isDiacid = aCOOH >= 2;
  if (!isDiacid) return false;
  let bOH = (b.match(/OH/g) || []).length + (b.match(/HO/g) || []).length;
  const bCOOH = (b.match(/COOH/g) || []).length + (b.match(/HOOC/g) || []).length;
  bOH -= bCOOH;
  const isDiol = bOH >= 2;
  const isDiamine = ((b.match(/NH2/g) || []).length + (b.match(/H2N/g) || []).length) >= 2;
  return isDiol || isDiamine;
}

function handleCondensationPolymerization(reactants) {
  const steps = [];
  steps.push('Monomers for condensation polymerization: ' + reactants.join(' + '));
  const hasAmino = reactants[1] && (reactants[1].includes('NH2'));
  const type = hasAmino ? 'Polymerization (Condensation — Polyamide)' : 'Polymerization (Condensation — Polyester)';
  /* Compute repeating unit formula = (monomer1 + monomer2 - H2O) */
  const e1 = parseCompoundElements(reactants[0]);
  const e2 = parseCompoundElements(reactants[1]);
  const repeatEls = {};
  for (const [el, cnt] of Object.entries(e1)) repeatEls[el] = (repeatEls[el] || 0) + cnt;
  for (const [el, cnt] of Object.entries(e2)) repeatEls[el] = (repeatEls[el] || 0) + cnt;
  repeatEls.H = (repeatEls.H || 0) - 2;
  repeatEls.O = (repeatEls.O || 0) - 1;
  const order = ['C','H','O','N','S','P','F','Cl','Br','I'];
  const sorted = Object.keys(repeatEls).filter(e => repeatEls[e] > 0).sort((a,b) => order.indexOf(a) - order.indexOf(b));
  const formula = sorted.map(el => el + (repeatEls[el] > 1 ? repeatEls[el] : '')).join('');
  const product = '(' + formula + ')n';
  steps.push('Small molecule byproduct: H2O');
  steps.push('Repeating unit: ' + formula + ' (polymer chain)');
  const eqStr = reactants.join(' + ') + ' → ' + product + ' + H2O';
  return { type, equation: eqStr, predictions: [eqStr], steps };
}

/* --- Oxidation state of any element in a compound --- */
function getElementOxidationStateInCompound(compound, element) {
  if (element === 'Mn' && compound.includes('MnO4')) return 7;
  if (element === 'Cr' && compound.includes('Cr2O7')) return 6;
  if (element === 'S' && compound.includes('SO4')) return 6;
  if (element === 'S' && compound.includes('SO3')) return 4;
  if (element === 'N' && compound.includes('NO3')) return 5;
  if (element === 'N' && compound.includes('NO2')) return 3;
  if (element === 'C' && compound.includes('CO3')) return 4;
  if (element === 'Cl' && compound.includes('ClO4')) return 7;
  if (element === 'Cl' && compound.includes('ClO3')) return 5;
  if (element === 'Cl' && compound.includes('ClO2')) return 3;
  if (element === 'Cl' && compound.includes('ClO')) return 1;
  if (element === 'P' && compound.includes('PO4')) return 5;
  if (element === 'Fe') {
    if (compound.includes('Fe2(SO4)3') || compound.includes('Fe2O3') || compound.includes('FeCl3') || compound.includes('Fe(NO3)3') || compound.includes('Fe(OH)3')) return 3;
    return 2;
  }
  if (element === 'Cu') {
    if (compound.includes('Cu2O') || compound.includes('Cu2S')) return 1;
    return 2;
  }
  const els = parseCompoundElements(compound);
  const GROUP1 = ['Li','Na','K','Rb','Cs','Fr'];
  const GROUP2 = ['Be','Mg','Ca','Sr','Ba','Ra'];
  if (GROUP1.includes(element)) return 1;
  if (GROUP2.includes(element)) return 2;
  if (element === 'Al') return 3;
  if (element === 'Ag') return 1;
  if (element === 'Zn') return 2;
  const keys = Object.keys(els);
  if (keys.length === 2 && keys.includes('O')) {
    const other = keys.find(k => k !== 'O');
    if (other === element) {
      if (GROUP1.includes(other)) return 1;
      if (GROUP2.includes(other)) return 2;
      if (other === 'H') return 1;
      return -(-2 * els.O) / els[element];
    }
  }
  return null;
}

function tryBalanceOneWay(reactants, products, _type) {
  const all = [...reactants, ...products];
  const parsed = all.map(c => parseCompoundElements(c));
  const allElements = new Set();
  parsed.forEach(p => Object.keys(p).forEach(el => allElements.add(el)));
  const elements = Array.from(allElements);
  if (elements.length === 0) return reactants.join(' + ') + ' → ' + products.join(' + ');

  const n = all.length, nr = reactants.length;
  let m = elements.length;

  const A = [];
  for (let i = 0; i < m; i++) {
    const el = elements[i];
    const row = [];
    for (let j = 0; j < n; j++) {
      const count = parsed[j][el] || 0;
      row.push(j < reactants.length ? count : -count);
    }
    A.push(row);
  }

  if (n === 1) return reactants.join(' + ') + ' → ' + products.join(' + ');

  const fixIdx = n - 1;
  const numEq = n - 1;

  if (m > numEq) { A.splice(numEq); m = numEq; }

  const Asmall = A.map(row => row.slice(0, fixIdx));
  const bvec = A.map(row => [-row[fixIdx]]);

  let coeffs;
  try {
    const sol = math.lusolve(math.matrix(Asmall), math.matrix(bvec));
    coeffs = [];
    for (let i = 0; i < fixIdx; i++) coeffs.push(sol.get([i, 0]));
    coeffs.push(1);
  } catch (_) { coeffs = new Array(n).fill(1); }

  if (coeffs.some(c => c < -1e-10)) coeffs = coeffs.map(c => -c);
  if (coeffs.some(c => Math.abs(c) < 1e-10)) coeffs = coeffs.map(c => Math.abs(c) < 1e-10 ? 1 : c);

  for (let denom = 1; denom <= 10000; denom++) {
    const scaled = coeffs.map(c => c * denom);
    if (scaled.every(s => Math.abs(s - Math.round(s)) < 1e-6)) {
      coeffs = scaled.map(s => Math.round(s)); break;
    }
  }
  let g = coeffs.reduce((g, c) => gcd2(g, c), 0);
  if (g > 1) coeffs = coeffs.map(c => Math.round(c / g));
  coeffs = coeffs.map(c => Math.round(c));

  const rParts = reactants.map((r, i) => formatCoeff(coeffs[i], r));
  const pParts = products.map((p, i) => formatCoeff(coeffs[nr + i], p));
  return rParts.join(' + ') + ' → ' + pParts.join(' + ');
}

function gcd2(a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) { [a, b] = [b, a % b]; } return a;
}

function formatCoeff(c, formula) {
  c = Math.round(c);
  if (c <= 0) return '';
  formula = formula.replace(/^\d+/, '');
  return c === 1 ? formula : c + formula;
}

/* ==================== SECTION 15: ISOMERISATION ==================== */

/* --- Canonical molecular formula: sort elements so C,H then alphabetically --- */
/* getCanonicalFormula and detectFunctionalGroups are in classification.js */

/* --- Normalize structural formula to a display string with subscripts --- */
function formatStructural(structural) {
  return structural.replace(/(\d+)/g, (m) => {
    const digits = m.split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[parseInt(d)]).join('');
    return digits;
  }).replace(/=/g, '=').replace(/≡/g, '≡').replace(/-/g, '-');
}

/* --- ISOMERISATION DATABASE --- */
const ISOMERISATION_DB = {
  /* Functional Group Isomerisation */
  'C2H6O': [
    { id: 'ethanol_dme', name: 'Alcohol ↔ Ether',
      inputs: ['CH3CH2OH','CH3-CH2-OH','C2H5OH','CH3OCH3','CH3-O-CH3'],
      outputDisplay: 'CH₃CH₂OH ⇌ CH₃OCH₃',
      show: [{ structural: 'CH3CH2OH', display: 'CH₃CH₂OH' }, { structural: 'CH3OCH3', display: 'CH₃OCH₃' }] }
  ],
  'C3H8O': [
    { id: 'propanol_eme', name: 'Alcohol ↔ Ether',
      inputs: ['CH3CH2CH2OH','CH3CH2-O-CH3','CH3CH2OCH3'],
      outputDisplay: 'CH₃CH₂CH₂OH ⇌ CH₃CH₂OCH₃',
      show: [{ structural: 'CH3CH2CH2OH', display: 'CH₃CH₂CH₂OH' }, { structural: 'CH3CH2OCH3', display: 'CH₃CH₂-O-CH₃' }] }
  ],
  'C2H4O': [
    { id: 'acetaldehyde_oxirane', name: 'Aldehyde ↔ Epoxide',
      inputs: ['CH3CHO','CH3CH=O','C2H4O'],
      outputDisplay: 'CH₃CHO (acetaldehyde) → C₂H₄O (oxirane) ⇌ CH₂=CHOH (vinyl alcohol)',
      show: [{ structural: 'CH3CHO', display: 'CH₃CHO' }, { structural: 'C2H4O', display: 'C₂H₄O (oxirane)' }] },
    { id: 'acetaldehyde_enol', name: 'Keto-Enol Tautomerism',
      inputs: ['CH3CHO','CH2=CHOH'],
      outputDisplay: 'CH₃CHO ⇌ CH₂=CHOH',
      show: [{ structural: 'CH3CHO', display: 'CH₃CHO' }, { structural: 'CH2=CHOH', display: 'CH₂=CHOH' }] }
  ],
  'C3H6O': [
    { id: 'acetone_propanal', name: 'Ketone ↔ Aldehyde',
      inputs: ['CH3COCH3','CH3CH2CHO','CH3-CO-CH3','CH3-CH2-CHO'],
      outputDisplay: 'CH₃COCH₃ (acetone) ⇌ CH₃CH₂CHO (propanal)',
      show: [{ structural: 'CH3COCH3', display: 'CH₃COCH₃' }, { structural: 'CH3CH2CHO', display: 'CH₃CH₂CHO' }] },
    { id: 'acetone_enol', name: 'Keto-Enol Tautomerism',
      inputs: ['CH3COCH3','CH2=C(OH)CH3'],
      outputDisplay: 'CH₃COCH₃ ⇌ CH₂=C(OH)CH₃ (enol)',
      show: [{ structural: 'CH3COCH3', display: 'CH₃COCH₃' }, { structural: 'CH2=C(OH)CH3', display: 'CH₂=C(OH)CH₃' }] },
    { id: 'acetone_allyl', name: 'Functional Isomerism',
      inputs: ['CH3COCH3','CH2=CHCH2OH'],
      outputDisplay: 'CH₃COCH₃ ⇌ CH₂=CH-CH₂OH (allyl alcohol)',
      show: [{ structural: 'CH3COCH3', display: 'CH₃COCH₃' }, { structural: 'CH2=CHCH2OH', display: 'CH₂=CH-CH₂OH' }] }
  ],
  'C2H4O2': [
    { id: 'acetic_ester', name: 'Acid ↔ Ester',
      inputs: ['CH3COOH','CH3CO2H','HCOOCH3','H-CO-O-CH3'],
      outputDisplay: 'CH₃COOH (acetic acid) ⇌ HCOOCH₃ (methyl formate)',
      show: [{ structural: 'CH3COOH', display: 'CH₃COOH' }, { structural: 'HCOOCH3', display: 'HCOOCH₃' }] }
  ],
  'C3H6O2': [
    { id: 'propionic_esters', name: 'Acid ↔ Esters',
      inputs: ['CH3CH2COOH','CH3COOCH3','HCOOCH2CH3','CH3CH2CO2H'],
      outputDisplay: 'CH₃CH₂COOH ⇌ CH₃COOCH₃ ⇌ HCOOCH₂CH₃',
      show: [{ structural: 'CH3CH2COOH', display: 'CH₃CH₂COOH' }, { structural: 'CH3COOCH3', display: 'CH₃COOCH₃' }, { structural: 'HCOOCH2CH3', display: 'HCOOCH₂CH₃' }] }
  ],
  'C4H10O': [
    { id: 'butanol_ethers', name: 'Alcohol ↔ Ether',
      inputs: ['CH3CH2CH2CH2OH','CH3CH2OCH2CH3'],
      outputDisplay: 'CH₃(CH₂)₃OH ⇌ CH₃CH₂-O-CH₂CH₃',
      show: [{ structural: 'CH3CH2CH2CH2OH', display: 'CH₃(CH₂)₃OH' }, { structural: 'CH3CH2OCH2CH3', display: 'CH₃CH₂-O-CH₂CH₃' }] }
  ],

  /* Chain Isomerisation */
  'C4H10': [
    { id: 'butane_isobutane', name: 'Chain Isomerism',
      inputs: ['CH3CH2CH2CH3','CH(CH3)3','(CH3)2CHCH3','CH3CH(CH3)2'],
      outputDisplay: 'CH₃CH₂CH₂CH₃ (n-butane) ⇌ (CH₃)₂CHCH₃ (isobutane)',
      show: [{ structural: 'CH3CH2CH2CH3', display: 'n-Butane CH₃CH₂CH₂CH₃' }, { structural: 'CH(CH3)3', display: 'Isobutane (CH₃)₂CHCH₃' }] }
  ],
  'C5H12': [
    { id: 'pentane_isomers', name: 'Chain Isomerism (3 isomers)',
      inputs: ['CH3CH2CH2CH2CH3','(CH3)2CHCH2CH3','C(CH3)4'],
      outputDisplay: 'C₅H₁₂ has 3 isomers: n-pentane, isopentane, neopentane',
      show: [{ structural: 'CH3CH2CH2CH2CH3', display: 'n-Pentane' }, { structural: '(CH3)2CHCH2CH3', display: 'Isopentane' }, { structural: 'C(CH3)4', display: 'Neopentane' }] }
  ],
  'C6H14': [
    { id: 'hexane_isomers', name: 'Chain Isomerism (5 isomers)',
      inputs: ['CH3CH2CH2CH2CH2CH3','(CH3)2CHCH2CH2CH3','CH3CH2CH(CH3)CH2CH3','(CH3)2CHCH(CH3)2','(CH3)3CCH2CH3'],
      outputDisplay: 'C₆H₁₄ has 5 isomers (hexane, 2-methylpentane, 3-methylpentane, 2,3-dimethylbutane, 2,2-dimethylbutane)',
      show: [{ structural: 'CH3CH2CH2CH2CH2CH3', display: 'n-Hexane' }, { structural: '(CH3)2CHCH2CH2CH3', display: '2-Methylpentane' }] }
  ],

  /* Positional Isomerisation */
  'C3H7Cl': [
    { id: 'propyl_chloride', name: 'Positional Isomerism',
      inputs: ['CH3CH2CH2Cl','CH3CHClCH3'],
      outputDisplay: 'CH₃CH₂CH₂Cl (1-chloropropane) ⇌ CH₃CHClCH₃ (2-chloropropane)',
      show: [{ structural: 'CH3CH2CH2Cl', display: '1-Chloropropane' }, { structural: 'CH3CHClCH3', display: '2-Chloropropane' }] }
  ],
  'C4H9OH': [
    { id: 'butanol_isomers', name: 'Positional & Chain Isomerism (4 isomers)',
      inputs: ['CH3CH2CH2CH2OH','CH3CH2CH(OH)CH3','(CH3)2CHCH2OH','(CH3)3COH'],
      outputDisplay: 'C₄H₉OH has 4 isomers: 4 alcohols are possible',
      show: [{ structural: 'CH3CH2CH2CH2OH', display: 'Butan-1-ol' }, { structural: 'CH3CH2CH(OH)CH3', display: 'Butan-2-ol' }, { structural: '(CH3)2CHCH2OH', display: '2-Methylpropan-1-ol' }, { structural: '(CH3)3COH', display: '2-Methylpropan-2-ol' }] }
  ],

  /* Named Rearrangements */
  'CH4N2O': [
    { id: 'wohler', name: 'Wöhler Synthesis (Isomerisation)',
      inputs: ['NH4CNO','NH4-CNO','H2N-CO-NH2','(NH2)2CO'],
      outputDisplay: 'NH₄CNO (ammonium cyanate) → (NH₂)₂CO (urea)',
      show: [{ structural: 'NH4CNO', display: 'NH₄CNO (ammonium cyanate)' }, { structural: '(NH2)2CO', display: '(NH₂)₂CO (urea)' }] }
  ]
};

/* --- Detect isomerisation for a given formula --- */
function detectIsomerisation(formula) {
  const canonical = getCanonicalFormula(formula);
  const entries = ISOMERISATION_DB[canonical];
  if (!entries || entries.length === 0) return null;

  const formulaNorm = formula.replace(/[-=≡]/g, '').toUpperCase();
  const groups = detectFunctionalGroups(formula);

  for (const entry of entries) {
    /* Match by structural formula input */
    for (const input of entry.inputs) {
      if (input.toUpperCase() === formulaNorm) {
        return { match: entry, matchType: 'exact' };
      }
    }
    /* Match by canonical formula (e.g. C4H10 matches all entries) */
    return { match: entry, matchType: 'canonical' };
  }

  return null;
}

/* --- Handle isomerisation reaction --- */
function handleIsomerisation(formula, steps) {
  const result = detectIsomerisation(formula);
  if (!result) return null;

  const entry = result.match;
  const allIsomers = entry.show.map(s => s.structural);
  const formulaNorm = formula.replace(/[-=≡]/g, '').toUpperCase();
  const inputIdx = allIsomers.findIndex(s => s.replace(/[-=≡]/g, '').toUpperCase() === formulaNorm);
  const products = allIsomers.filter((_, i) => i !== inputIdx);
  const type = 'Isomerisation (' + entry.name + ')';
  steps.push('Molecular formula: ' + getCanonicalFormula(formula));
  steps.push('Isomerisation detected: ' + entry.outputDisplay);
  if (products.length > 0) {
    steps.push('Isomer(s): ' + products.join(', '));
    const eqStr = tryBalanceOneWay([formula], products, type);
    steps.push('Balanced: ' + eqStr);
    return { type, equation: eqStr, predictions: [eqStr], steps };
  }
  const eqStr = formula + ' → ' + entry.show.map(s => s.display).join(' / ');
  return { type, equation: eqStr, predictions: [eqStr], steps };
}
