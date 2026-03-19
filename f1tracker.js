
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRnkA4y9q6MHr8gfIABpVYNxsWaDTmQgM-nhR1RqAK4SlopmACWIs2Q8Pz13j-UXp_CXjIzAr8lZC63/pub?gid=1124557769&single=true&output=csv';

/* ── TEAM & DRIVER CONFIG ────────────────────────────────── */
const TEAM_COLORS = {
  'Red Bull':     '#3671C6',
  'Ferrari':      '#E8002D',
  'McLaren':      '#FF8000',
  'Mercedes':     '#27F4D2',
  'Aston Martin': '#229971',
  'Alpine':       '#FF87BC',
  'Williams':     '#64C4FF',
  'Racing Bulls': '#6692FF',
  'Audi':         '#C9C9C9',
  'Haas':         '#B6BABD',
  'Cadillac':     '#555555',
};

// Maps driver name (as it appears in your sheet col A) to their team
const DRIVER_TEAMS = {
  'Max Verstappen':    'Red Bull',
  'Isack Hadjar':      'Red Bull',
  'Charles Leclerc':   'Ferrari',
  'Lewis Hamilton':    'Ferrari',
  'Lando Norris':      'McLaren',
  'Oscar Piastri':     'McLaren',
  'George Russell':    'Mercedes',
  'Kimi Antonelli':    'Mercedes',
  'Fernando Alonso':   'Aston Martin',
  'Lance Stroll':      'Aston Martin',
  'Pierre Gasly':      'Alpine',
  'Franco Colapinto':  'Alpine',
  'Esteban Ocon':      'Haas',
  'Oliver Bearman':    'Haas',
  'Alexander Albon':   'Williams',
  'Carlos Sainz':      'Williams',
  'Liam Lawson':       'Racing Bulls',
  'Arvid Lindblad':    'Racing Bulls',
  'Nico Hulkenberg':   'Audi',
  'Gabriel Bortoleto': 'Audi',
  'Sergio Perez':      'Cadillac',
  'Valtteri Bottas':   'Cadillac',
};

/* ── SPRINT RACES ────────────────────────────────────────── */
// Column headers in your sheet that are sprint races
const SPRINT_RACES = [
  'China Sprint', 'Miami Sprint', 'Canada Sprint',
  'GB Sprint', 'Zandvoort Sprint', 'Singapore Sprint',
];

/* ── SCORING MAPS ────────────────────────────────────────── */
const RACE_PTS   = { 22:25, 21:18, 20:15, 19:12, 18:10, 17:8, 16:6, 15:4, 14:2, 13:1 };
const SPRINT_PTS = { 22:8,  21:7,  20:6,  19:5,  18:4,  17:3, 16:2, 15:1 };

function getPoints(position, sprint) {
  const map = sprint ? SPRINT_PTS : RACE_PTS;
  return map[parseInt(position)] || 0;
}

/* ── PARSED DATA ─────────────────────────────────────────── */
// After fetch, these are populated:
// drivers = [ { name, team } ]
// races   = [ { name, sprint, results: [ { driver, pos, pts } ] } ]
// standings = [ { name, team, pts } ] sorted desc

let drivers = [];
let races   = [];
let standings = [];

/* ── CSV PARSER ──────────────────────────────────────────── */
function parseCSV(text) {
  const rows = [];
  let cur = '', inQ = false;
  const cells = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
    else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (cur.trim() || cells.length) { cells.push(cur.trim()); rows.push([...cells]); cells.length = 0; cur = ''; }
    } else { cur += ch; }
  }
  if (cur || cells.length) { cells.push(cur.trim()); rows.push(cells); }
  return rows.filter(r => r.some(c => c));
}

/* ── FETCH & PROCESS ─────────────────────────────────────── */
async function fetchData() {
  setSyncState('loading', 'Syncing…');
  setLoadingProgress(10, 'Connecting to Google Sheets…');
  showLoadingScreen();

  try {
    // Use a CORS proxy for the fetch
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(SHEET_CSV_URL)}`;
    setLoadingProgress(30, 'Downloading sheet data…');

    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    setLoadingProgress(60, 'Parsing data…');
    const csvText = await resp.text();

    setLoadingProgress(80, 'Building standings…');
    processCSV(csvText);

    setLoadingProgress(100, 'Done!');
    await sleep(400);

    hideLoadingScreen();
    setSyncState('ok', `Updated ${new Date().toLocaleTimeString()}`);
    showPage(currentPage);

  } catch (err) {
    console.error(err);
    hideLoadingScreen();
    showErrorScreen(`Failed to load: ${err.message}`);
    setSyncState('err', 'Error');
  }
}

function processCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('Sheet appears empty');

  const header = rows[0]; // row 1: Driver, Team, Australia, China Sprint, ...
  // Col 0 = Driver, Col 1 = Team, Col 2..N-1 = races, Col N = Total (AG)
  // We skip the last column (Total) since we recalculate it

  // Race columns: index 2 to header.length-2 (skip last = Total)
  const raceHeaders = header.slice(2, header.length - 1);

  drivers = [];
  races = raceHeaders.map(name => ({
    name,
    sprint: SPRINT_RACES.includes(name),
    results: [],
  }));

  const driverTotals = {};

  // Process each driver row
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const driverName = row[0]?.trim();
    const team = row[1]?.trim() || DRIVER_TEAMS[driverName] || 'Unknown';

    if (!driverName) continue;

    drivers.push({ name: driverName, team });
    driverTotals[driverName] = 0;

    raceHeaders.forEach((raceName, ci) => {
      const cellVal = row[ci + 2]?.trim();
      const pos = cellVal ? parseInt(cellVal) : null;
      if (pos && !isNaN(pos) && pos >= 1 && pos <= 22) {
        const sprint = SPRINT_RACES.includes(raceName);
        const pts = getPoints(pos, sprint);
        races[ci].results.push({ driver: driverName, pos, pts });
        driverTotals[driverName] += pts;
      }
    });
  }

  // Filter races that have at least one result
  races = races.filter(r => r.results.length > 0);

  // Sort each race by position descending (highest pos = most points)
  races.forEach(r => r.results.sort((a, b) => b.pos - a.pos));

  // Build standings
  standings = drivers
    .map(d => ({ ...d, pts: driverTotals[d.name] || 0 }))
    .sort((a, b) => b.pts - a.pts);
}

/* ── LOADING UI ──────────────────────────────────────────── */
function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loading-bar');
  const lbl = document.getElementById('loading-label');
  if (bar) bar.style.width = pct + '%';
  if (lbl) lbl.textContent = label;
}

function showLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  const es = document.getElementById('error-screen');
  if (ls) ls.style.display = 'flex';
  if (es) es.style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
}

function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
}

function showErrorScreen(msg) {
  const ls = document.getElementById('loading-screen');
  const es = document.getElementById('error-screen');
  const em = document.getElementById('error-msg');
  if (ls) ls.style.display = 'none';
  if (es) es.style.display = 'flex';
  if (em) em.textContent = msg;
}

function setSyncState(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (dot) dot.className = `sync-dot ${state}`;
  if (lbl) lbl.textContent = label;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── NAVIGATION ──────────────────────────────────────────── */
let currentPage = 'standings';

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');

  if (page === 'standings')    renderStandings();
  if (page === 'constructors') renderConstructors();
  if (page === 'history')      renderHistory();
  if (page === 'charts')       renderCharts();
  if (page === 'compare')      renderCompare();

  document.getElementById('mobile-menu').classList.remove('open');
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobile-menu').classList.toggle('open');
});

/* ── STANDINGS PAGE ──────────────────────────────────────── */
function renderStandings() {
  const maxPts = standings[0]?.pts || 1;
  const sprints = races.filter(r => r.sprint).length;
  const racesCompleted = races.filter(r => !r.sprint).length; 

  document.getElementById('header-stats').innerHTML = `
    <div class="stat-item">
      <div class="stat-value">${racesCompleted}</div>
      <div class="stat-label">Races</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${sprints}</div>
      <div class="stat-label">Sprints</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${30 - racesCompleted - sprints}</div>
      <div class="stat-label">Remaining</div>
    </div>
  `;

  // Podium
  const classes = ['p1','p2','p3'];
  const ranks = ['1st','2nd','3rd'];
  document.getElementById('podium').innerHTML = standings.slice(0,3).map((d,i) => `
    <div class="podium-card ${classes[i]}">
      <div class="podium-pos">${i+1}</div>
      <div class="podium-rank">${ranks[i]}</div>
      <div class="podium-driver">${d.name}</div>
      <div class="podium-team">
        <span class="team-dot" style="background:${TEAM_COLORS[d.team]||'#888'}"></span>
        ${d.team}
      </div>
      <div class="podium-pts">${d.pts}</div>
      <div class="podium-pts-label">POINTS</div>
    </div>
  `).join('');

  // Full list
  document.getElementById('standings-list').innerHTML = standings.map((d,i) => {
    const gap = i === 0 ? 'LEADER' : `-${standings[0].pts - d.pts}`;
    const barW = Math.round((d.pts / maxPts) * 100);
    return `
      <div class="standing-row">
        <div class="sr-pos">${i+1}</div>
        <div>
          <div class="sr-name">${d.name}</div>
          <div class="sr-team">
            <span class="team-dot" style="background:${TEAM_COLORS[d.team]||'#888'}"></span>
            ${d.team}
          </div>
        </div>
        <div class="sr-bar-wrap"><div class="sr-bar" style="width:${barW}%"></div></div>
        <div class="sr-pts">${d.pts}</div>
        <div class="sr-gap">${gap}</div>
      </div>
    `;
  }).join('');
}

/* ── CONSTRUCTORS PAGE ───────────────────────────────────── */
function calcTeamStandings() {
  const totals = {};
  const driversByTeam = {};
  drivers.forEach(d => {
    totals[d.team] = (totals[d.team] || 0);
    if (!driversByTeam[d.team]) driversByTeam[d.team] = [];
    if (!driversByTeam[d.team].includes(d.name)) driversByTeam[d.team].push(d.name);
  });
  standings.forEach(d => { totals[d.team] = (totals[d.team] || 0) + d.pts; });
  return Object.entries(totals)
    .map(([team, pts]) => ({ team, pts, drivers: driversByTeam[team] || [], color: TEAM_COLORS[team] || '#888' }))
    .sort((a, b) => b.pts - a.pts);
}

function renderConstructors() {
  const teams = calcTeamStandings();
  const maxPts = teams[0]?.pts || 1;
  document.getElementById('constructors-grid').innerHTML = teams.map((t,i) => {
    const barW = Math.round((t.pts / maxPts) * 100);
    return `
      <div class="constructor-row" style="border-left-color:${t.color}">
        <div class="cr-pos">${i+1}</div>
        <div class="cr-team">
          <span class="team-dot" style="background:${t.color};width:12px;height:12px"></span>
          <div>
            <div class="cr-team-name">${t.team}</div>
            <div class="cr-drivers">${t.drivers.join(' · ')}</div>
          </div>
        </div>
        <div class="cr-bar-wrap"><div class="cr-bar" style="width:${barW}%;background:${t.color}"></div></div>
        <div class="cr-pts">${t.pts}</div>
      </div>
    `;
  }).join('');
}

/* ── HISTORY PAGE ────────────────────────────────────────── */
function renderHistory() {
  const grid = document.getElementById('history-grid');
  const empty = document.getElementById('history-empty');
  if (races.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = [...races].reverse().map((r, ri) => {
    const realIndex = races.length - 1 - ri;
    const top3 = r.results.slice(0, 3);
    const badge = r.sprint ? `<div class="hc-sprint-badge">SPRINT</div>` : '';
    const podiumHtml = top3.map(p => {
      const team = drivers.find(d => d.name === p.driver)?.team;
      return `
        <div class="hc-pos-row">
          <div class="hc-pos-num">P${p.pos}</div>
          <span class="team-dot" style="background:${TEAM_COLORS[team]||'#888'}"></span>
          <div class="hc-pos-driver">${p.driver.split(' ').pop()}</div>
          <div class="hc-pos-pts">+${p.pts}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="history-card" onclick="openModal(${realIndex})">
        ${badge}
        <div class="hc-name">${r.name}</div>
        <div class="hc-drivers-count">${r.results.length} drivers classified</div>
        <div class="hc-podium">${podiumHtml}</div>
      </div>
    `;
  }).join('');
}

/* ── CHARTS PAGE ─────────────────────────────────────────── */
let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

const SCALE_STYLE = {
  x: { ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#1a1a1a' } },
  y: { ticks: { color: '#555', font: { family: 'DM Mono', size: 10 } }, grid: { color: '#1a1a1a' } }
};

function renderCharts() {
  renderProgressionChart();
  renderBarChart();
  renderTeamChart();
}

function renderProgressionChart() {
  destroyChart('progression');
  const ctx = document.getElementById('chart-progression');
  if (!races.length) return;

  const top8 = standings.slice(0, 8);
  const labels = races.map(r => r.name);

  const datasets = top8.map(d => {
    let cum = 0;
    const data = races.map(r => {
      const res = r.results.find(p => p.driver === d.name);
      if (res) cum += res.pts;
      return cum;
    });
    return {
      label: d.name.split(' ').pop(),
      data,
      borderColor: TEAM_COLORS[d.team] || '#888',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
    };
  });

  chartInstances['progression'] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#888', font: { family: 'DM Mono', size: 10 }, boxWidth: 12, padding: 8 } }
      },
      scales: SCALE_STYLE,
    }
  });
}

function renderBarChart() {
  destroyChart('bar');
  const ctx = document.getElementById('chart-bar');
  chartInstances['bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: standings.map(d => d.name.split(' ').pop()),
      datasets: [{
        data: standings.map(d => d.pts),
        backgroundColor: standings.map(d => TEAM_COLORS[d.team] || '#888'),
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: SCALE_STYLE,
    }
  });
}

function renderTeamChart() {
  destroyChart('teams');
  const ctx = document.getElementById('chart-teams');
  const teams = calcTeamStandings();
  chartInstances['teams'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: teams.map(t => t.team),
      datasets: [{
        data: teams.map(t => t.pts),
        backgroundColor: teams.map(t => t.color),
        borderColor: '#111',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#888', font: { family: 'DM Mono', size: 10 }, boxWidth: 12, padding: 8 } }
      }
    }
  });
}

/* ── COMPARE PAGE ────────────────────────────────────────── */
function renderCompare() {
  const selA = document.getElementById('compare-a');
  const selB = document.getElementById('compare-b');
  const opts = drivers.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  selB.selectedIndex = Math.min(1, drivers.length - 1);
  selA.onchange = updateCompare;
  selB.onchange = updateCompare;
  updateCompare();
}

function updateCompare() {
  const nameA = document.getElementById('compare-a').value;
  const nameB = document.getElementById('compare-b').value;
  const dA = standings.find(d => d.name === nameA) || drivers.find(d => d.name === nameA) || {};
  const dB = standings.find(d => d.name === nameB) || drivers.find(d => d.name === nameB) || {};

  const racesA = races.map(r => ({ name: r.name, sprint: r.sprint, ...( r.results.find(p => p.driver === nameA) || { pts: 0, pos: null }) }));
  const racesB = races.map(r => ({ name: r.name, sprint: r.sprint, ...( r.results.find(p => p.driver === nameB) || { pts: 0, pos: null }) }));

  const winsA = racesA.filter((a, i) => a.pts > racesB[i].pts).length;
  const winsB = racesB.filter((b, i) => b.pts > racesA[i].pts).length;
  const bestA = Math.max(...racesA.map(r => r.pos || 0));
  const bestB = Math.max(...racesB.map(r => r.pos || 0));

  function card(driver, wins, best, otherPts) {
    const isAhead = (driver.pts || 0) >= otherPts;
    const pos = standings.findIndex(s => s.name === driver.name) + 1;
    const color = TEAM_COLORS[driver.team] || '#888';
    return `
      <div class="compare-driver-card" style="border-top: 3px solid ${color}">
        <div class="cdc-name">${driver.name || '—'}</div>
        <div class="cdc-team">
          <span class="team-dot" style="background:${color}"></span>
          ${driver.team || ''}
        </div>
        <div class="cdc-stat">
          <span class="cdc-stat-label">Total points</span>
          <span class="cdc-stat-val ${isAhead ? 'highlight' : ''}">${driver.pts || 0}</span>
        </div>
        <div class="cdc-stat">
          <span class="cdc-stat-label">Championship pos</span>
          <span class="cdc-stat-val">${pos || '—'}</span>
        </div>
        <div class="cdc-stat">
          <span class="cdc-stat-label">Head-to-head wins</span>
          <span class="cdc-stat-val ${wins > (races.length - wins) ? 'highlight' : ''}">${wins}</span>
        </div>
        <div class="cdc-stat">
          <span class="cdc-stat-label">Best finish position</span>
          <span class="cdc-stat-val">${best > 0 ? best : '—'}</span>
        </div>
      </div>
    `;
  }

  const tableRows = races.map((r, i) => {
    const pA = racesA[i].pts;
    const pB = racesB[i].pts;
    return `
      <div class="crt-row">
        <div class="crt-race">${r.name}${r.sprint ? ' <span style="font-size:9px;color:var(--red)">S</span>' : ''}</div>
        <div class="crt-pts ${pA > pB ? 'win' : ''}">${pA}</div>
        <div class="crt-pts ${pB > pA ? 'win' : ''}">${pB}</div>
      </div>
    `;
  }).join('');

  document.getElementById('compare-output').innerHTML = `
    ${card(dA, winsA, bestA, dB.pts || 0)}
    ${card(dB, winsB, bestB, dA.pts || 0)}
    <div class="compare-race-table">
      <div class="crt-header">
        <div>Race</div>
        <div style="text-align:right">${nameA.split(' ').pop()}</div>
        <div style="text-align:right">${nameB.split(' ').pop()}</div>
      </div>
      ${tableRows || '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;font-family:DM Mono">No race data yet</div>'}
    </div>
  `;
}

/* ── MODAL ───────────────────────────────────────────────── */
function openModal(index) {
  const r = races[index];
  if (!r) return;
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="page-label" style="margin-bottom:4px">${r.sprint ? 'SPRINT RACE' : 'GRAND PRIX'}</div>
    <div class="modal-race-name">${r.name}</div>
    <div class="modal-meta">${r.results.length} drivers classified</div>
    <table class="modal-table">
      <thead>
        <tr><th>Pos</th><th>Driver</th><th>Team</th><th>Pts</th></tr>
      </thead>
      <tbody>
        ${r.results.map(p => {
          const team = drivers.find(d => d.name === p.driver)?.team || '';
          return `
            <tr>
              <td class="modal-pos">${p.pos}</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <span class="team-dot" style="background:${TEAM_COLORS[team]||'#888'}"></span>
                  ${p.driver}
                </div>
              </td>
              <td style="font-family:DM Mono;font-size:11px;color:var(--text2)">${team}</td>
              <td class="modal-pts">${p.pts > 0 ? '+'+p.pts : '0'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── INIT ────────────────────────────────────────────────── */
fetchData();