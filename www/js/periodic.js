document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('periodic-grid');
  const info = document.getElementById('periodic-info');
  const filters = document.querySelector('.periodic-filters');
  if (!grid || !info) return;

  let currentFilter = null;

  function isFblock(el) {
    return el.category === 'lanthanide' || el.category === 'actinide';
  }

  function renderTable() {
    grid.innerHTML = '';
    info.classList.remove('show');
    info.innerHTML = '';

    if (filters) filters.style.display = 'flex';

    const allFiltered = currentFilter
      ? ELEMENTS.filter(e => e.category === currentFilter || e.sym === currentFilter)
      : ELEMENTS;

    const mainEls = allFiltered.filter(e => !isFblock(e));
    const fEls = allFiltered.filter(e => isFblock(e));

    grid.style.gridTemplateColumns = 'repeat(18, 1fr)';

    const periodMap = {};
    for (const el of mainEls) {
      if (!periodMap[el.period]) periodMap[el.period] = [];
      periodMap[el.period].push(el);
    }

    let gridRow = 1;

    for (let p = 1; p <= 7; p++) {
      const els = periodMap[p];
      if (!els || els.length === 0) continue;
      els.sort((a, b) => a.group - b.group);

      let prevGroup = 0;
      for (const el of els) {
        const col = el.group;
        const gap = col - prevGroup - 1;
        if (gap > 0) {
          if (p === 6 && el.Z === 72) {
            const labelCell = document.createElement('div');
            labelCell.className = 'el-series-label';
            labelCell.textContent = 'Lanthanides';
            labelCell.style.gridColumn = (col - gap) + ' / span ' + gap;
            labelCell.style.gridRow = gridRow;
            grid.appendChild(labelCell);
          } else if (p === 7 && el.Z === 104) {
            const labelCell = document.createElement('div');
            labelCell.className = 'el-series-label';
            labelCell.textContent = 'Actinides';
            labelCell.style.gridColumn = (col - gap) + ' / span ' + gap;
            labelCell.style.gridRow = gridRow;
            grid.appendChild(labelCell);
          }
        }

        const cell = document.createElement('div');
        cell.className = 'el-cell';
        cell.dataset.z = el.Z;
        cell.dataset.category = el.category;
        cell.style.setProperty('--cat-color', CATEGORY_COLORS[el.category] || '#888');
        cell.style.gridColumn = col;
        cell.style.gridRow = gridRow;
        cell.innerHTML = '<span class="el-num">' + el.Z + '</span><span class="el-sym">' + el.sym + '</span>';
        cell.addEventListener('click', () => showElementDetail(el));
        grid.appendChild(cell);
        prevGroup = col;
      }
      gridRow++;
    }

    /* Lanthanides row */
    const lanthanides = fEls.filter(e => e.category === 'lanthanide').sort((a, b) => a.Z - b.Z);
    if (lanthanides.length > 0) {
      gridRow++;
      const labelCell = document.createElement('div');
      labelCell.className = 'el-series-label el-series-row-label';
      labelCell.textContent = 'Lanthanides';
      labelCell.style.gridColumn = '1 / span 3';
      labelCell.style.gridRow = gridRow;
      grid.appendChild(labelCell);

      for (const el of lanthanides) {
        const col = el.Z - 56 + 4;
        const cell = document.createElement('div');
        cell.className = 'el-cell';
        cell.dataset.z = el.Z;
        cell.dataset.category = el.category;
        cell.style.setProperty('--cat-color', CATEGORY_COLORS[el.category] || '#888');
        cell.style.gridColumn = col;
        cell.style.gridRow = gridRow;
        cell.innerHTML = '<span class="el-num">' + el.Z + '</span><span class="el-sym">' + el.sym + '</span>';
        cell.addEventListener('click', () => showElementDetail(el));
        grid.appendChild(cell);
      }
    }

    /* Actinides row */
    const actinides = fEls.filter(e => e.category === 'actinide').sort((a, b) => a.Z - b.Z);
    if (actinides.length > 0) {
      gridRow++;
      const labelCell = document.createElement('div');
      labelCell.className = 'el-series-label el-series-row-label';
      labelCell.textContent = 'Actinides';
      labelCell.style.gridColumn = '1 / span 3';
      labelCell.style.gridRow = gridRow;
      grid.appendChild(labelCell);

      for (const el of actinides) {
        const col = el.Z - 88 + 4;
        const cell = document.createElement('div');
        cell.className = 'el-cell';
        cell.dataset.z = el.Z;
        cell.dataset.category = el.category;
        cell.style.setProperty('--cat-color', CATEGORY_COLORS[el.category] || '#888');
        cell.style.gridColumn = col;
        cell.style.gridRow = gridRow;
        cell.innerHTML = '<span class="el-num">' + el.Z + '</span><span class="el-sym">' + el.sym + '</span>';
        cell.addEventListener('click', () => showElementDetail(el));
        grid.appendChild(cell);
      }
    }
  }

  document.querySelectorAll('.periodic-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.periodic-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter === 'all' ? null : btn.dataset.filter;
      renderTable();
    });
  });

  function showElementDetail(el) {
    if (filters) filters.style.display = 'none';
    grid.innerHTML = '';
    info.classList.remove('show');
    const catColor = CATEGORY_COLORS[el.category] || '#888';
    info.innerHTML = '<div class="el-detail" style="border-left:4px solid ' + catColor + ';padding-left:1rem;">'
      + '<button id="el-back" class="btn secondary" style="margin-bottom:1rem;">&larr; Back to Table</button>'
      + '<h3 style="font-size:2rem;margin:0;">' + el.sym + ' <span style="font-size:1rem;color:var(--text-secondary);">' + el.Z + '. ' + el.name + '</span></h3>'
      + '<table class="result-table">'
      + '<tr><td>Atomic Mass</td><td>' + el.mass.toFixed(3) + ' g/mol</td></tr>'
      + '<tr><td>Category</td><td style="color:' + catColor + ';">' + el.category + '</td></tr>'
      + '<tr><td>Group</td><td>' + el.group + '</td></tr>'
      + '<tr><td>Period</td><td>' + el.period + '</td></tr>'
      + '<tr><td>Block</td><td>' + el.block + '</td></tr>'
      + '<tr><td>Electron Config</td><td><code>' + el.config + '</code></td></tr>'
      + '<tr><td>Common Valences</td><td>' + el.valences.join(', ') + '</td></tr>'
      + '</table></div>';
    info.classList.add('show');

    const backBtn = document.getElementById('el-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        renderTable();
      });
    }
  }

  renderTable();
});
