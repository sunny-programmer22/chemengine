document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('structure-input');
  const info = document.getElementById('structure-info');
  const viewerDiv = document.getElementById('structure-viewer');
  const fetchBtn = document.getElementById('structure-fetch');

  let viewer = null;
  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    if (input.value.trim().length >= 2) {
      debounceTimer = setTimeout(() => fetchBtn.click(), 600);
    }
  });

  fetchBtn.addEventListener('click', async () => {
    const formula = input.value.trim();
    if (!formula) { displayError(info, 'Enter a molecular formula.'); return; }
    info.classList.remove('show', 'error', 'success');
    info.innerHTML = '';
    viewerDiv.innerHTML = '';
    viewer = null;
    showSpinner('structure');

    try {
      const formulaUpper = formula.charAt(0).toUpperCase() + formula.slice(1);
      displayOutput(info, '<span class="spinner"></span> Searching PubChem for ' + formulaUpper + '...');

      const cid = await findCID(formulaUpper);
      if (!cid) {
        displayError(info, 'No PubChem compound found for ' + formulaUpper);
        hideSpinner('structure');
        return;
      }

      info.innerHTML = 'Found CID: ' + cid + '. Fetching 3D structure...';

      const molData = await fetchSDF(cid);
      if (!molData || molData.includes('$$$$') === false && molData.trim().length < 50) {
        try {
          const molData2 = await fetchMol2(cid);
          if (molData2 && molData2.length > 50) {
            renderStructure(molData2, 'mol2', formulaUpper, cid);
            hideSpinner('structure');
            return;
          }
        } catch (e2) {
          displayOutput(info, '2D structure available. Try another compound.<br>PubChem CID: ' + cid);
          fetchPubChemInfo(info, formulaUpper, cid);
          hideSpinner('structure');
          return;
        }
        displayOutput(info, 'No 3D structure available for ' + formulaUpper + '.<br>PubChem CID: ' + cid);
        fetchPubChemInfo(info, formulaUpper, cid);
        hideSpinner('structure');
        return;
      }

      renderStructure(molData, 'sdf', formulaUpper, cid);
      hideSpinner('structure');
    } catch (e) {
      displayError(info, 'Error: ' + e.message);
      hideSpinner('structure');
    }
  });

  async function findCID(formula) {
    try {
      const cache = JSON.parse(localStorage.getItem('pubchem-cache') || '{}');
      if (cache[formula]) return cache[formula];
    } catch {}
    const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/' +
                encodeURIComponent(formula) + '/cids/JSON';
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        const url2 = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/' +
                     encodeURIComponent(formula) + '/cids/JSON';
        const resp2 = await fetch(url2, { signal: AbortSignal.timeout(10000) });
        if (!resp2.ok) return null;
        const data2 = await resp2.json();
        const cid = data2?.IdentifierList?.CID?.[0] || null;
        if (cid) cacheCID(formula, cid);
        return cid;
      }
      const data = await resp.json();
      const cid = data?.IdentifierList?.CID?.[0] || null;
      if (cid) cacheCID(formula, cid);
      return cid;
    } catch {
      return null;
    }
  }
  function cacheCID(formula, cid) {
    try {
      const cache = JSON.parse(localStorage.getItem('pubchem-cache') || '{}');
      cache[formula] = cid;
      const keys = Object.keys(cache);
      if (keys.length > 200) delete cache[keys[0]];
      localStorage.setItem('pubchem-cache', JSON.stringify(cache));
    } catch {}
  }

  async function fetchSDF(cid) {
    const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' +
                cid + '/record/SDF/?record_type=3d';
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      return null;
    }
  }

  async function fetchMol2(cid) {
    const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' +
                cid + '/record/MOL2/?record_type=3d';
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('No 3D data');
    return await resp.text();
  }

  async function fetchPubChemInfo(el, formula, cid) {
    const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' +
                cid + '/property/MolecularFormula,MolecularWeight,IUPACName/JSON';
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = await resp.json();
        const props = data?.PropertyTable?.Properties?.[0];
        if (props) {
          el.innerHTML = 'Formula: ' + (props.MolecularFormula || formula) +
            '<br>MW: ' + (props.MolecularWeight || 'N/A') +
            '<br>IUPAC: ' + (props.IUPACName || 'N/A');
          el.classList.remove('error');
          el.classList.add('show', 'success');
          addHistory('structure', formula + ' (CID:' + cid + ')');
        }
      }
    } catch {}
  }

  function renderStructure(data, format, formula, cid) {
    function waitFor3Dmol(cb) {
      if (typeof $3Dmol !== 'undefined') cb();
      else setTimeout(() => waitFor3Dmol(cb), 100);
    }
    waitFor3Dmol(() => doRender(data, format, formula, cid));
  }

  function doRender(data, format, formula, cid) {
    if (typeof $3Dmol === 'undefined') {
      displayOutput(info, '3Dmol.js library failed to load. Structure cannot be displayed.<br>PubChem CID: ' + cid);
      return;
    }

    try {
      viewer = $3Dmol.createViewer('structure-viewer', {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0d1117'
      });

      if (format === 'sdf') viewer.addModel(data, 'sdf');
      else if (format === 'mol2') viewer.addModel(data, 'mol2');

      viewer.setStyle({}, {
        stick: { radius: 0.15, colorscheme: 'Jmol' },
        sphere: { radius: 0.5, colorscheme: 'Jmol' }
      });

      viewer.zoomTo();
      viewer.render();

      info.innerHTML = formula + ' (CID: ' + cid + ')<br>Drag to rotate · Scroll to zoom';
      info.classList.remove('error');
      info.classList.add('show', 'success');
      addHistory('structure', formula + ' (CID:' + cid + ')');
    } catch (e) {
      displayError(info, 'Render error: ' + e.message + '<br>PubChem CID: ' + cid);
    }
  }

  /* Read formula from URL hash (set by other sections) */
  window.addEventListener('hashchange', () => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && hash.length > 0 && hash.length < 50) {
      input.value = hash;
      setTimeout(() => fetchBtn.click(), 300);
    }
  });
  if (window.location.hash.length > 1) {
    window.dispatchEvent(new Event('hashchange'));
  }
});
