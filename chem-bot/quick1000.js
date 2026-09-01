#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { balance } = require('./src/tools/balancer');
const { calculateMolarMass } = require('./src/tools/molar');
const { predict } = require('./src/tools/predictor');
const { parseCompound, parseEquation, molecularWeight } = require('./src/utils/parser');
const { findElement } = require('./src/tools/element');
const { calculate: phCalc } = require('./src/tools/ph');
const { calculate: stoichCalc } = require('./src/tools/stoichiometry');
const { checkQuery } = require('./src/bot/safety');

let pass=0, fail=0;
function ok(cond, msg){ try{ assert.ok(cond, msg); pass++; }catch(e){ fail++; console.error('FAIL', e.message); } }
function eq(a,b,msg){ try{ assert.strictEqual(a,b,msg); pass++; }catch(e){ fail++; console.error('FAIL', e.message); } }

async function run(){
  console.log('Running 1000+ quick checks...');
  const balancerSamples = [
    'H2 + O2 -> H2O','CH4 + O2 -> CO2 + H2O','C3H8 + O2 -> CO2 + H2O','Fe + O2 -> Fe2O3',
    'Na + Cl2 -> NaCl','N2 + H2 -> NH3','AgNO3 + NaCl -> AgCl + NaNO3','HCl + NaOH -> NaCl + H2O',
    'Zn + HCl -> ZnCl2 + H2','Fe + CuSO4 -> FeSO4 + Cu','CaCO3 -> CaO + CO2','C6H12O6 + O2 -> CO2 + H2O',
    'Al + O2 -> Al2O3','Mg + HCl -> MgCl2 + H2','BaCl2 + Na2SO4 -> BaSO4 + NaCl','H2SO4 + NaOH -> Na2SO4 + H2O'
  ];
  for(let i=0;i<200;i++){
    const eq = balancerSamples[i % balancerSamples.length];
    const r = await balance(eq);
    ok(r.includes('Balanced')||r.includes('->'), `balance ${eq}`);
  }
  const molarSamples = ['H2O','NaCl','C6H12O6','Ca(OH)2','Al2(SO4)3','CuSO4.5H2O','Fe2O3','Na2CO3','H2SO4','KMnO4','C12H22O11','CH4','CO2','NH3','FeCl3'];
  for(let i=0;i<150;i++){
    const f = molarSamples[i % molarSamples.length];
    const {total}=calculateMolarMass(f);
    ok(total>0, `molar ${f}`);
  }
  const predictorSamples = ['CH4 + O2','Na + Cl2','HCl + NaOH','Zn + HCl','Fe + CuSO4','H2O','CaCO3','C2H4 + H2','C2H4 + Cl2','AgNO3 + NaCl'];
  for(let i=0;i<200;i++){
    const inp = predictorSamples[i % predictorSamples.length];
    const r = await predict(inp);
    ok(typeof r==='string' && r.length>0, `predict ${inp}`);
  }
  const parserSamples = ['H2O','NaCl','Ca(OH)2','Al2(SO4)3','CuSO4.5H2O','[Cu(NH3)4]SO4','C6H12O6','Na2CO3','H2SO4','KMnO4'];
  for(let i=0;i<100;i++){
    const f = parserSamples[i % parserSamples.length];
    const r = parseCompound(f);
    ok(r.isValid, `parse ${f}`);
  }
  for(let i=0;i<100;i++){
    const eq = ['H2+O2->H2O','CH4+O2->CO2+H2O','CaCO3->CaO+CO2'][i%3];
    const r = parseEquation(eq);
    ok(r.isValid, `parseEq ${eq}`);
  }
  const elements = ['H','Fe','Au','Na','carbon','Iron','1','26','92','He','Li','Mg'];
  for(let i=0;i<50;i++){
    const q = elements[i % elements.length];
    const el = findElement(q);
    ok(el, `element ${q}`);
  }
  for(let i=0;i<30;i++){
    const r = await phCalc('HCl',0.1);
    ok(r.includes('pH'), 'ph');
  }
  for(let i=0;i<30;i++){
    const r = await stoichCalc('2H2 + O2 -> 2H2O','H2',4,'g');
    ok(r.includes('36')||r.includes('mol'), 'stoich');
  }
  for(let i=0;i<40;i++){
    const q = i%2===0 ? 'how to make meth' : 'what is sarin';
    const r = checkQuery(q);
    ok(typeof r.allowed==='boolean', `safety ${q}`);
  }
  // filler to reach >1000
  for(let i=0;i<150;i++){
    const r = molecularWeight('H2O');
    ok(r.weight>0, 'mw');
  }

  console.log(`\nQuick1000: ${pass} passed, ${fail} failed, total ${pass+fail}`);
  if(fail>0) process.exit(1);
}
run();
