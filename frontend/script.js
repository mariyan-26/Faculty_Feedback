// ── CONFIG ────────────────────────────────────────────────────
//const API = 'https://kskwhahrj3xan44mglllrcal3i0caklx.lambda-url.ap-south-1.on.aws/api';
//const API = 'http://localhost:8000/api';

//const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/*const photoBase = isLocal
  ? 'http://127.0.0.1:5500/assets/faculty_photos/'
  : 'https://faculty-feedback-797259924730-ap-south-1-an.s3.ap-south-1.amazonaws.com/assets/faculty_photos/';*/

// ── CONFIG ────────────────────────────────────────────────────

const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

// API auto-switch
const API = isLocal
  ? 'http://localhost:8000/api'
  : 'https://kskwhahrj3xan44mglllrcal3i0caklx.lambda-url.ap-south-1.on.aws/api';

// Photo base (already correct)
const photoBase = isLocal
  ? 'http://127.0.0.1:5500/assets/faculty_photos/'
  : 'https://feedback.kristujayanti.edu.in/assets/faculty_photos/';

// ── STATE ─────────────────────────────────────────────────────
let SESSION = null;
let FILTERS = {};          // available options from backend
let F = {};                // active filter values
let selectedBatch = '';
let selectedFac = '';
let selectedPro = '';
let suggPage = 1;
let suggTotal = 0;
const LIMIT = 10;
let charts = {};

let instSuggPage = 1;
let instSuggTotal = 0;

let rankSearch = '';
let rankCount = 10;
let rankExclusive = false;
let rankCat = 'unsat';
let rankPage = 1;
let lastTotalFaculty = 0;

const COLORS = {
  'Very Good': '#4f8ef7', 'Good': '#3dd9c4',
  'Satisfactory': '#f7d44f', 'Unsatisfactory': '#f75f5f',
};
const RATINGS = ['Very Good', 'Good', 'Satisfactory', 'Unsatisfactory'];

const rankCardDept = { vg: '', good: '', sat: '', unsat: '' };

let globalTotalFaculty = 0;

//const displayTotal = globalTotalFaculty || r.vg_rank || r.good_rank || r.sat_rank || r.unsat_rank || totalFaculty;

const getVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
Chart.defaults.color = getVar('--muted');
Chart.defaults.scale.grid.color = getVar('--grid-color');

// ── LOGIN ─────────────────────────────────────────────────────

document.getElementById('themeBtn').textContent = theme === 'light' ? '🌙' : '🌞';

function togglePassword() {
  const p = document.getElementById('lp');
  const eye = document.getElementById('eyeIcon');
  if (p.type === 'password') {
    p.type = 'text';
    eye.textContent = '👁️‍🗨️';
    eye.title = "Hide Password";
  } else {
    p.type = 'password';
    eye.textContent = '👁️';
    eye.title = "Show Password";
  }
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.getElementById('themeBtn').textContent = theme === 'light' ? '🌙' : '🌞';
  Chart.defaults.color = getVar('--muted');
  Chart.defaults.scale.grid.color = getVar('--grid-color');
  renderAll();
  const instVisible = document.getElementById('section-institution').style.display !== 'none';
  if (instVisible) loadInstitutionalData();
}


async function doLogin() {
  const u = document.getElementById('lu').value.trim();
  const p = document.getElementById('lp').value.trim();
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, passcode: p }),
    });
    if (!res.ok) { document.getElementById('lerr').textContent = 'Invalid credentials'; return; }
    SESSION = await res.json();
    localStorage.setItem('faculty_session', JSON.stringify(SESSION));
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('rbadge').textContent = (SESSION.label || '').toUpperCase();
    document.getElementById('tuser').textContent = SESSION.username;
    if (SESSION.role === 'hod') {
      document.getElementById('hodnote').style.display = 'block';
      document.getElementById('hodnote').textContent = '🔒 Viewing data scoped to your department only.';
      document.getElementById('fSch').disabled = true;
      document.getElementById('fDep').disabled = true;
    } else if (SESSION.role === 'dean') {
      document.getElementById('fSch').disabled = true;
    }

    document.querySelector('.upload-lbl').style.display = SESSION.upload ? 'flex' : 'none';

    // ── Reset all state from any previous session ─────────────
    selectedFac = ''; selectedBatch = ''; selectedPro = '';
    F = {};
    suggPage = 1;
    instSuggPage = 1;
    ['fYr', 'fRat'].forEach(id => document.getElementById(id).value = '');
    ['fac_si', 'pro_si', 'bsi'].forEach(id => document.getElementById(id).value = '');
    Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
    if (window.charts) {
      Object.keys(window.charts).forEach(k => { if (window.charts[k]) { window.charts[k].destroy(); delete window.charts[k]; } });
    }
    document.getElementById('section-faculty').style.display = 'block';
    document.getElementById('section-institution').style.display = 'none';
    document.getElementById('tab-fac').classList.add('active');
    document.getElementById('tab-inst').classList.remove('active');
    localStorage.removeItem('active_tab');
    // ─────────────────────────────────────────────────────────

    await loadFilters();
    renderAll();
  } catch (e) {
    document.getElementById('lerr').textContent = 'Cannot connect to server. Is the backend running?';
  }
}

function logout() {
  // ── Clear all JS state ─────────────────────────────────────
  SESSION = null;
  F = {};
  selectedBatch = '';
  selectedFac = '';
  selectedPro = '';
  FILTERS = {};
  suggPage = 1;
  instSuggPage = 1;

  // ── Clear localStorage ─────────────────────────────────────
  localStorage.removeItem('faculty_session');
  localStorage.removeItem('active_tab');

  // ── Clear all cookies ──────────────────────────────────────
  document.cookie.split(';').forEach(c => {
    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
  });

  // ── Clear browser cache ────────────────────────────────────
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }

  // ── Destroy all charts so next login starts fresh ──────────
  Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
  if (window.charts) {
    Object.keys(window.charts).forEach(k => { if (window.charts[k]) { window.charts[k].destroy(); delete window.charts[k]; } });
  }

  // ── Reset all filter dropdowns ─────────────────────────────
  ['fSch', 'fDep', 'fYr', 'fRat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.disabled = false; }
  });
  ['fac_si', 'pro_si', 'bsi'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // ── Reset institutional filters ────────────────────────────
  ['inst-school-filter', 'inst-dept-filter', 'inst-batch-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // ── Reset UI to login screen ───────────────────────────────
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('lu').value = '';
  document.getElementById('lp').value = '';
  document.getElementById('lerr').textContent = '';
  document.getElementById('hodnote').style.display = 'none';

  // ── Reset tabs back to Faculty tab ─────────────────────────
  document.getElementById('section-faculty').style.display = 'block';
  document.getElementById('section-institution').style.display = 'none';
  document.getElementById('tab-fac').classList.add('active');
  document.getElementById('tab-inst').classList.remove('active');
}

// Auto-login if session exists
document.addEventListener('DOMContentLoaded', async () => {
  const saved = localStorage.getItem('faculty_session');
  if (saved) {
    try {
      SESSION = JSON.parse(saved);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.getElementById('rbadge').textContent = (SESSION.label || '').toUpperCase();
      document.getElementById('tuser').textContent = SESSION.username;
      if (SESSION.role === 'hod') {
        document.getElementById('hodnote').style.display = 'block';
        document.getElementById('hodnote').textContent = '🔒 Viewing data scoped to your department only.';
        document.getElementById('fSch').disabled = true;
        document.getElementById('fDep').disabled = true;
      } else if (SESSION.role === 'dean') {
        document.getElementById('fSch').disabled = true;
      }
      document.querySelector('.upload-lbl').style.display = SESSION.upload ? 'flex' : 'none';

      // ── Reset state on auto-login ─────────────────────────
      selectedFac = ''; selectedBatch = ''; selectedPro = '';
      F = {};
      suggPage = 1;
      instSuggPage = 1;
      ['fYr', 'fRat'].forEach(id => document.getElementById(id).value = '');
      ['fac_si', 'pro_si', 'bsi'].forEach(id => document.getElementById(id).value = '');
      Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
      // ─────────────────────────────────────────────────────

      await loadFilters();
      renderAll();
      const savedTab = localStorage.getItem('active_tab') || 'faculty';
      switchTab(savedTab);
    } catch (e) {
      localStorage.removeItem('faculty_session');
    }
  }
});

// ── FILTERS ───────────────────────────────────────────────────
async function loadFilters() {
  const params = new URLSearchParams({ role: SESSION.role });
  if (SESSION.dept) params.set('dept', SESSION.dept);
  if (SESSION.school) params.set('school', SESSION.school);
  const res = await fetch(`${API}/filters?${params}`);
  FILTERS = await res.json();
  FILTERS.valid_batches = FILTERS.batches;
  populateFilterUI();
}

function populateFilterUI() {
  // Schools
  const sEl = document.getElementById('fSch');
  sEl.innerHTML = '<option value="">All Schools</option>';
  FILTERS.schools.forEach(s => sEl.innerHTML += `<option value="${esc(s)}">${s.replace('SCHOOL OF ', '')}</option>`);

  // Depts
  fillDepts();

  // Years
  const yEl = document.getElementById('fYr');
  yEl.innerHTML = '<option value="">All Years</option>';
  FILTERS.years.forEach(y => yEl.innerHTML += `<option value="${esc(y)}">${y}</option>`);

  // Build searchable dropdowns
  renderFDD('');
  renderPDD('');
  renderBDD('');

  // HOD lock
  if (SESSION.role === 'hod' && SESSION.dept) {
    document.getElementById('fDep').value = SESSION.dept;
    F.dept = SESSION.dept;
    renderFDD('');
  } else if (SESSION.role === 'dean' && SESSION.school) {
    document.getElementById('fSch').value = SESSION.school;
    F.school = SESSION.school;
    fillDepts();
    renderFDD('');
  }
}

function fillDepts() {
  const school = document.getElementById('fSch').value;
  const dEl = document.getElementById('fDep');
  const previousDept = dEl.value;                  // ← ADD: save before rebuild
  dEl.innerHTML = '<option value="">All Departments</option>';
  dEl.disabled = !school;
  let depts = FILTERS.departments || [];
  if (school) depts = depts.filter(d => FILTERS.faculty.some(f => f.faculty_dept === d && f.faculty_school === school));
  depts.forEach(d => dEl.innerHTML += `<option value="${esc(d)}">${d.replace('DEPARTMENT OF ', '')}</option>`);
  if (SESSION?.role === 'hod' && SESSION.dept) dEl.value = SESSION.dept;       // ← keep for HOD
  else if (previousDept) dEl.value = previousDept; // ← ADD: restore for dean/admin
}

// Searchable Faculty
function renderFDD(search) {
  const dd = document.getElementById('fdd');
  let facs = FILTERS.valid_faculty || FILTERS.faculty || [];
  if (search) facs = facs.filter(x => (x.faculty_name || '').toLowerCase().includes(search.toLowerCase()));
  if (!facs.length) { dd.innerHTML = '<div class="nomatch">No faculty found</div>'; return; }
  let html = `<div class="bdi ao${!selectedFac ? ' sel' : ''}" onclick="selFac('')">All Faculty</div>`;
  facs.forEach(f => {
    const s = selectedFac === f.faculty_name ? ' sel' : '';
    const safe = (f.faculty_name || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    html += `<div class="bdi${s}" onclick="selFac('${safe.replace(/'/g, "\\'")}')"> ${f.faculty_name}</div>`;
  });
  dd.innerHTML = html;
}
async function selFac(val) { selectedFac = val; document.getElementById('fac_si').value = val; closeFDD(); await updateDependentDropdowns(); applyFilters(); }
function openFDD() { document.getElementById('fdd').classList.add('open'); renderFDD(document.getElementById('fac_si').value); }
function closeFDD() { document.getElementById('fdd').classList.remove('open'); }
function filterFDD(v) { document.getElementById('fdd').classList.add('open'); renderFDD(v); }

// Searchable Programme
function renderPDD(search) {
  const dd = document.getElementById('pdd');
  let pros = FILTERS.valid_programmes || FILTERS.programmes || [];
  if (search) pros = pros.filter(x => (x || '').toLowerCase().includes(search.toLowerCase()));
  if (!pros.length) { dd.innerHTML = '<div class="nomatch">No programmes found</div>'; return; }
  let html = `<div class="bdi ao${!selectedPro ? ' sel' : ''}" onclick="selPro('')">All Programmes</div>`;
  pros.forEach(p => {
    const s = selectedPro === p ? ' sel' : '';
    const safe = (p || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    html += `<div class="bdi${s}" onclick="selPro('${safe.replace(/'/g, "\\'")}')"> ${p}</div>`;
  });
  dd.innerHTML = html;
}
async function selPro(val) { selectedPro = val; document.getElementById('pro_si').value = val; closePDD(); await updateDependentDropdowns(); applyFilters(); }
function openPDD() { document.getElementById('pdd').classList.add('open'); renderPDD(document.getElementById('pro_si').value); }
function closePDD() { document.getElementById('pdd').classList.remove('open'); }
function filterPDD(v) { document.getElementById('pdd').classList.add('open'); renderPDD(v); }

function getAvailBatches(search = '') {
  let b = FILTERS.valid_batches || FILTERS.batches || [];
  if (search) b = b.filter(x => (x.student_batch || '').toLowerCase().includes(search.toLowerCase()));
  return b;
}

function renderBDD(search) {
  const dd = document.getElementById('bdd');
  const batches = getAvailBatches(search);
  if (!batches.length) { dd.innerHTML = '<div class="nomatch">No batches found</div>'; return; }
  const byYear = {};
  batches.forEach(b => { (byYear[b.batch_year || 'Unknown'] = byYear[b.batch_year || 'Unknown'] || []).push(b); });
  let html = `<div class="bdi ao${!selectedBatch ? ' sel' : ''}" onclick="selBatch('')">All Batches</div>`;
  Object.keys(byYear).sort().forEach(yr => {
    html += `<div class="bdg">${yr}</div>`;
    byYear[yr].forEach(b => {
      const s = selectedBatch === b.student_batch ? ' sel' : '';
      const safe = (b.student_batch || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      html += `<div class="bdi${s}" onclick="selBatch('${safe.replace(/'/g, "\\'")}')"> ${b.student_batch}</div>`;
    });
  });
  dd.innerHTML = html;
}

function selBatch(val) { selectedBatch = val; document.getElementById('bsi').value = val; closeBDD(); applyFilters(); }
function openBDD() { document.getElementById('bdd').classList.add('open'); renderBDD(document.getElementById('bsi').value); }
function closeBDD() { document.getElementById('bdd').classList.remove('open'); }
function filterBDD(v) { document.getElementById('bdd').classList.add('open'); renderBDD(v); }

document.addEventListener('click', e => {
  if (!document.getElementById('bsw').contains(e.target)) closeBDD();
  if (!document.getElementById('fsw').contains(e.target)) closeFDD();
  if (!document.getElementById('psw').contains(e.target)) closePDD();
});

async function updateDependentDropdowns() {
  const f = getF();
  const p = new URLSearchParams();
  if (f.school) p.set('school', f.school);
  if (f.dept) p.set('dept', f.dept);
  if (f.faculty) p.set('faculty', f.faculty);
  if (f.year) p.set('year', f.year);
  if (f.programme) p.set('programme', f.programme);
  p.set('role', f.role);
  try {
    const res = await fetch(`${API}/filters?${p}`);
    const data = await res.json();
    FILTERS.valid_batches = data.batches || [];
    FILTERS.valid_faculty = data.faculty || [];
    FILTERS.valid_programmes = data.programmes || [];

    const yEl = document.getElementById('fYr');
    const currYear = yEl.value;
    yEl.innerHTML = '<option value="">All Years</option>';
    (data.years || []).forEach(y => yEl.innerHTML += `<option value="${esc(y)}">${y}</option>`);
    if (currYear && (data.years || []).includes(currYear)) yEl.value = currYear;

    renderBDD(document.getElementById('bsi').value);
    renderFDD(document.getElementById('fac_si').value);
    renderPDD(document.getElementById('pro_si').value);
  } catch (e) { console.warn(e); }
}

async function onSchChange() {
  selectedFac = ''; document.getElementById('fac_si').value = '';
  selectedPro = ''; document.getElementById('pro_si').value = '';
  selectedBatch = ''; document.getElementById('bsi').value = '';
  fillDepts(); await updateDependentDropdowns(); applyFilters();
}
async function onDepChange() {
  selectedFac = ''; document.getElementById('fac_si').value = '';
  selectedPro = ''; document.getElementById('pro_si').value = '';
  selectedBatch = ''; document.getElementById('bsi').value = '';
  await updateDependentDropdowns(); applyFilters();
}
async function onYrChange() {
  selectedBatch = ''; document.getElementById('bsi').value = '';
  await updateDependentDropdowns(); applyFilters();
}

function getF() {
  return {
    role: SESSION?.role || 'admin',
    dept: SESSION?.role === 'hod' ? SESSION.dept : (document.getElementById('fDep').value || ''),
    school: SESSION?.role === 'dean' ? SESSION.school : (document.getElementById('fSch').value || ''),
    faculty: selectedFac || '',
    year: document.getElementById('fYr').value || '',
    programme: selectedPro || '',
    batch: selectedBatch || '',
    rating: document.getElementById('fRat').value || '',
  };
}

function applyFilters() { renderAll(); }

async function resetFilters() {
  selectedBatch = ''; selectedFac = ''; selectedPro = '';
  ['fYr', 'fRat'].forEach(id => document.getElementById(id).value = '');

  if (SESSION?.role !== 'dean') {
    document.getElementById('fSch').value = '';
  }

  document.getElementById('fDep').value = (SESSION?.role === 'hod' && SESSION.dept) ? SESSION.dept : '';
  document.getElementById('bsi').value = '';
  document.getElementById('fac_si').value = '';
  document.getElementById('pro_si').value = '';
  closeBDD(); closeFDD(); closePDD();
  fillDepts();
  await updateDependentDropdowns();
  applyFilters();
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  loadSummary();
  loadDonut();
  loadBatchChart();
  loadTrend();
  loadSubject();
  loadQuestions();
  loadSuggestions(true);
  loadFacultyCard();
}

// ── API HELPERS ───────────────────────────────────────────────
function buildQS(extras = {}) {
  const f = getF();
  const p = new URLSearchParams();
  Object.entries({ ...f, ...extras }).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

function buildRankQS() {
  const f = getF();

  const sortMap = {
    vg: 'very_good',
    good: 'good',
    sat: 'satisfactory',
    unsat: 'unsatisfactory',
    all: 'all',
  };

  const params = new URLSearchParams({
    role: f.role || 'admin',
    limit: rankCount,
    offset: (rankPage - 1) * rankCount,
    sort_by: sortMap[rankCat] || 'unsatisfactory',
  });

  if (rankSearch) params.set('search', rankSearch);
  if (rankExclusive) params.set('exclusive', 'true');
  if (f.dept) params.set('dept', f.dept);
  if (f.school) params.set('school', f.school);
  if (f.year) params.set('year', f.year);
  if (f.programme) params.set('programme', f.programme);
  if (f.batch) params.set('batch', f.batch);

  // Per-card dept filter (only applies in single-cat mode)
  if (rankCat !== 'all' && rankCardDept[rankCat]) {
    params.set('dept', rankCardDept[rankCat]);
  }

  return params.toString();
}

async function loadRankings() {
  buildRankGrid();
  await initGlobalTotal();

  try {
    if (!globalTotalFaculty) {
      const initQS = buildRankQS();  
      const baseParams = new URLSearchParams(initQS);
      baseParams.delete('search');
      const initRes = await fetch(`${API}/faculty-rankings?${baseParams}`);
      const initData = await initRes.json();
      globalTotalFaculty = initData.total_faculty || 0;
    }
    const qs = buildRankQS();
    const res = await fetch(`${API}/faculty-rankings?${qs}`);
    const data = await res.json();

    const totalFaculty = data.total_faculty || 0;
    lastTotalFaculty = totalFaculty;

    if (!rankSearch) globalTotalFaculty = totalFaculty;

    renderPagination(totalFaculty);

    const catMap = {
      vg: { rows: data.very_good, pctKey: 'very_good_pct', color: '#4f8ef7', label: 'Very Good' },
      good: { rows: data.good, pctKey: 'good_pct', color: '#3dd9c4', label: 'Good' },
      sat: { rows: data.satisfactory, pctKey: 'satisfactory_pct', color: '#f7c94f', label: 'Satisfactory' },
      unsat: { rows: data.unsatisfactory, pctKey: 'unsatisfactory_pct', color: '#f75f5f', label: 'Unsatisfactory' },
    };

    const catsToRender = rankCat === 'all'
      ? ['vg', 'good', 'sat', 'unsat']
      : [rankCat];

    catsToRender.forEach(cat => {
      //renderRankCard(cat, catMap[cat], totalFaculty);
      renderRankCard(cat, catMap[cat], globalTotalFaculty);
    });

  } catch (e) {
    console.warn('rankings error', e);
  }
}

function setLoading(cardId, show) {
  const card = document.getElementById(cardId);
  const existing = card.querySelector('.loading-overlay');
  if (show && !existing) {
    const d = document.createElement('div');
    d.className = 'loading-overlay';
    d.innerHTML = '<div class="spinner"></div> Loading…';
    card.appendChild(d);
  } else if (!show && existing) {
    existing.remove();
  }
}

// ── SUMMARY / KPIS ────────────────────────────────────────────
async function loadSummary() {
  try {
    const res = await fetch(`${API}/summary?${buildQS()}`);
    const d = await res.json();
    const total = d.total_ratings || 0;

    document.getElementById('kVG').textContent = `Very Good`;
    document.getElementById('klVG').textContent = `${(d.very_good || 0).toLocaleString()} / ${total.toLocaleString()} (${(d.very_good_pct || 0)}%)`;
    document.getElementById('kbVG').style.width = (d.very_good_pct || 0) + '%';

    document.getElementById('kG').textContent = `Good`;
    document.getElementById('klG').textContent = `${(d.good || 0).toLocaleString()} / ${total.toLocaleString()} (${(d.good_pct || 0)}%)`;
    document.getElementById('kbG').style.width = (d.good_pct || 0) + '%';

    document.getElementById('kS').textContent = `Satisfactory`;
    document.getElementById('klS').textContent = `${(d.satisfactory || 0).toLocaleString()} / ${total.toLocaleString()} (${(d.satisfactory_pct || 0)}%)`;
    document.getElementById('kbS').style.width = (d.satisfactory_pct || 0) + '%';

    document.getElementById('kU').textContent = `Unsatisfactory`;
    document.getElementById('klU').textContent = `${(d.unsatisfactory || 0).toLocaleString()} / ${total.toLocaleString()} (${(d.unsatisfactory_pct || 0)}%)`;
    document.getElementById('kbU').style.width = (d.unsatisfactory_pct || 0) + '%';
  } catch (e) { console.warn('summary error', e); }
}

// ── FACULTY CARD ──────────────────────────────────────────────
async function loadFacultyCard() {
  const facV = selectedFac;
  const depV = document.getElementById('fDep').value;
  const schV = document.getElementById('fSch').value;

  if (!facV) {
    document.getElementById('facAv').textContent = '✦';
    document.getElementById('facName').textContent = 'All Faculty';
    const displaySchool = schV || SESSION?.school || 'All Schools';
    const displayDept = depV || SESSION?.dept || 'All Departments';

    if (displaySchool === 'All Schools' && displayDept === 'All Departments') {
      document.getElementById('facDept').textContent = 'Institution Overview';
    } else {
      document.getElementById('facDept').textContent = displayDept === 'All Departments' ? displaySchool : `${displayDept} · ${displaySchool}`;
    }
    document.getElementById('facTags').innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`${API}/faculty-info?faculty=${encodeURIComponent(facV)}`);
    const data = await res.json();
    if (!data.length) return;

    const f = data[0];
    const container = document.getElementById('facAv');
    const initials = (f.faculty_name || '').split(' ').map(w => w[0]).join('').substring(0, 2);

    if (f.faculty_code) {
      const code = f.faculty_code;
      const safeInitials = (initials || '✦').replace(/'/g, "\\'");
      container.textContent = '';
      const img = document.createElement('img');
      img.src = `${photoBase}${code}.JPG`;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;cursor:pointer';
      img.onclick = () => openImgModal(img.src);
      img.onerror = () => {
        if (!img.dataset.retry) {
          img.dataset.retry = '1';
          img.src = `${photoBase}${code}.jpg`;
        } else {
          img.style.display = 'none';
          container.textContent = safeInitials || '✦';
        }
      };
      container.appendChild(img);
    }

    document.getElementById('facName').textContent = f.faculty_name || '—';
    document.getElementById('facDept').textContent = `${f.faculty_dept || ''} · ${f.faculty_school || ''}`;
    const subjs = f.subjects || [];
    document.getElementById('facTags').innerHTML = subjs.map(s => `<span class="ftag">${s}</span>`).join('');
  } catch (e) { console.warn('faculty info error', e); }
}

// ── DONUT CHART ───────────────────────────────────────────────
async function loadDonut() {
  setLoading('cardDonut', true);
  try {
    const res = await fetch(`${API}/rating-distribution?${buildQS()}`);
    const rows = await res.json();
    const labels = rows.map(r => r.rating);
    const data = rows.map(r => r.count);
    const colors = labels.map(l => COLORS[l]);

    dc('donut');
    charts.donut = new Chart(document.getElementById('cDonut').getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: getVar('--s1'), borderWidth: 3, hoverOffset: 8 }] },
      options: {
        cutout: '68%',
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getVar('--s3'), borderColor: getVar('--border2'), borderWidth: 1, titleColor: getVar('--text'), bodyColor: getVar('--muted'),
            callbacks: { label: c => ` ${c.label}: ${c.raw.toLocaleString()} responses` }
          }
        }
      },
    });

    // Legend
    const total = data.reduce((a, b) => a + b, 0);
    document.getElementById('dlegend').innerHTML = labels.map((l, i) =>
      `<div class="dleg"><div class="dlegd" style="background:${colors[i]}"></div>
 <span class="dcount">${Number(data[i]).toLocaleString()}</span>&nbsp;<span style="color:var(--muted)">${l}</span>
 <span style="color:var(--muted2);font-size:10px;">&nbsp;(${total ? ((data[i] / total) * 100).toFixed(1) : 0}%)</span></div>`
    ).join('');
  } catch (e) { console.warn('donut error', e); }
  setLoading('cardDonut', false);
}

// ── BATCH STACKED BAR ─────────────────────────────────────────
async function loadBatchChart() {
  setLoading('cardBatch', true);
  try {
    const res = await fetch(`${API}/batch-ratings?${buildQS()}`);
    const rows = await res.json();
    const labels = rows.map(r => r.batch);

    dc('batch');
    charts.batch = new Chart(document.getElementById('cBatch').getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: RATINGS.map(r => ({
          label: r, data: rows.map(d => d[r] || 0),
          backgroundColor: COLORS[r], borderRadius: 2, borderSkipped: false,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: getVar('--muted'), boxWidth: 9, font: { size: 10 }, padding: 10 } },
          tooltip: {
            backgroundColor: getVar('--s3'), borderColor: getVar('--border2'), borderWidth: 1, titleColor: getVar('--text'), bodyColor: getVar('--muted'),
            callbacks: { title: c => rows[c[0].dataIndex]?.batch || '' }
          }
        },
        scales: {
          x: { stacked: true, grid: { color: getVar('--grid-color') }, ticks: { color: getVar('--muted'), font: { size: 10 }, maxRotation: 35, autoSkip: true, maxTicksLimit: 18 } },
          y: { stacked: true, grid: { color: getVar('--grid-color') }, ticks: { color: getVar('--muted'), font: { size: 10 } } }
        }
      }
    });
  } catch (e) { console.warn('batch chart error', e); }
  setLoading('cardBatch', false);
}

const valPlugin = {
  id: 'valPlugin',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((bar, index) => {
        const val = dataset.data[index];
        ctx.fillStyle = getVar('--text');
        ctx.font = '600 11px Sora, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(Number(val).toFixed(2) + '/4', bar.x + 6, bar.y + 1);
      });
    });
  }
};

// ── SCORE TREND — horizontal bar, readable ────────────────────
async function loadTrend() {
  setLoading('cardTrend', true);
  try {
    const res = await fetch(`${API}/score-trend?${buildQS({ top: 15 })}`);
    const rows = await res.json();

    // Sort ascending so highest score is at top visually
    rows.sort((a, b) => a.avg_score - b.avg_score);
    const labels = rows.map(r => r.short || r.batch);
    const data = rows.map(r => r.avg_score);
    const bgs = data.map(v =>
      v >= 3.5 ? '#4f8ef7' : v >= 3 ? '#3dd9c4' : v >= 2.5 ? '#f7d44f' : '#f75f5f'
    );

    dc('trend');
    // Compute canvas height based on row count: 28px per bar + padding
    const trendH = Math.max(200, rows.length * 32 + 40);
    const trendWrap = document.getElementById('wrapTrend');
    trendWrap.style.height = trendH + 'px';

    charts.trend = new Chart(document.getElementById('cTrend').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Avg Score', data, backgroundColor: bgs, borderRadius: 4, barThickness: 20 }] },
      plugins: [valPlugin],
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 55 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getVar('--s3'), borderColor: getVar('--border2'), borderWidth: 1, titleColor: getVar('--text'), bodyColor: getVar('--muted'),
            callbacks: {
              title: c => rows[c[0].dataIndex]?.batch || '',
              label: c => ` Avg: ${c.raw.toFixed(3)} / 4.000   (${rows[c[0].dataIndex]?.response_count?.toLocaleString()} responses)`,
            }
          }
        },
        scales: {
          x: {
            min: 1, max: 4, grid: { color: getVar('--grid-color') }, ticks: {
              color: getVar('--muted'), font: { size: 10 },
              callback: v => ({ 1: 'Unsat.', 2: 'Satisf.', 3: 'Good', 4: 'V.Good' }[v] || v)
            }
          },
          y: { grid: { display: false }, ticks: { color: getVar('--text'), font: { size: 11 } } }
        }
      }
    });
  } catch (e) { console.warn('trend error', e); }
  setLoading('cardTrend', false);
}

// ── SUBJECT PERFORMANCE ───────────────────────────────────────
async function loadSubject() {
  setLoading('cardSubj', true);
  try {
    const res = await fetch(`${API}/subject-performance?${buildQS({ top: 20 })}`);
    const rows = await res.json();
    rows.sort((a, b) => a.avg_score - b.avg_score);
    const labels = rows.map(r => r.subject);
    const data = rows.map(r => r.avg_score);
    const bgs = data.map(v => v >= 3.5 ? '#4f8ef7' : v >= 3 ? '#3dd9c4' : v >= 2.5 ? '#f7d44f' : '#f75f5f');

    dc('subj');
    // Compute height from row count: 28px per bar + padding
    const subjH = Math.max(200, rows.length * 32 + 40);
    const subjWrap = document.getElementById('wrapSubj');
    subjWrap.style.height = subjH + 'px';

    charts.subj = new Chart(document.getElementById('cSubj').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Avg Score', data, backgroundColor: bgs, borderRadius: 4, barThickness: 20 }] },
      plugins: [valPlugin],
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 55 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getVar('--s3'), borderColor: getVar('--border2'), borderWidth: 1, titleColor: getVar('--text'), bodyColor: getVar('--muted'),
            callbacks: {
              label: c => ` Avg: ${c.raw.toFixed(3)} / 4.000  (${rows[c[0].dataIndex]?.response_count?.toLocaleString()} responses)`,
            }
          }
        },
        scales: {
          x: {
            min: 1, max: 4, grid: { color: getVar('--grid-color') }, ticks: {
              color: getVar('--muted'), font: { size: 10 },
              callback: v => ({ 1: 'Unsat.', 2: 'Satisf.', 3: 'Good', 4: 'V.Good' }[v] || v)
            }
          },
          y: { grid: { display: false }, ticks: { color: getVar('--text'), font: { size: 11 } } }
        }
      }
    });
  } catch (e) { console.warn('subject error', e); }
  setLoading('cardSubj', false);
}

// ── QUESTION BREAKDOWN ────────────────────────────────────────
async function loadQuestions() {
  setLoading('cardQ', true);
  try {
    const res = await fetch(`${API}/question-breakdown?${buildQS()}`);
    const rows = await res.json();
    const list = document.getElementById('qlist');
    list.innerHTML = rows.map(d => {
      const tot = d.total || 1;
      const pcts = RATINGS.map(r => ((d[r] || 0) / tot * 100).toFixed(1));

      const segments = RATINGS.map((r, i) => `
  <div class="qseg" style="width:${pcts[i]}%;background:${COLORS[r]};border-radius:${i === 0 ? '4px 0 0 4px' : i === RATINGS.length - 1 ? '0 4px 4px 0' : '0'};">
    <div class="qtt" style="${pcts[i] == 0 ? 'display:none;' : ''}">
      <div style="font-weight:600;font-size:11px;margin-bottom:6px;">${d.question}</div>
      <div class="ttr">
        <div class="ttd" style="background:${COLORS[r]}"></div>
        <span class="ttl">${r}</span>
        <span class="ttv">${(d[r] || 0).toLocaleString()}</span>
        <span class="ttp">&nbsp;(${pcts[i]}%)</span>
      </div>
    </div>
  </div>
`).join('');

      return `
  <div class="qi">
    <div class="qh"><div class="qn">${d.question}</div><div class="qsc">${d.avg_score}/4</div></div>
    <div class="qtrack">
      ${segments}
    </div>
  </div>`;
    }).join('');
  } catch (e) { console.warn('questions error', e); }
  setLoading('cardQ', false);
}

// ── SUGGESTIONS ───────────────────────────────────────────────
async function loadSuggestions(reset = false) {
  if (reset) {
    suggPage = 1;
    document.getElementById('slist').innerHTML = '';
    // Populate the batch filter dropdown with batches matching current filters
    populateSuggBatchFilter();
  }

  setLoading('cardSugg', true);
  const suggBatch = document.getElementById('suggBatchSel').value;
  const offset = (suggPage - 1) * LIMIT;
  const qs = buildQS({ limit: LIMIT, offset: offset });
  // Overlay batch filter on top of main batch filter if selected
  const finalQS = suggBatch ? qs + `&batch=${encodeURIComponent(suggBatch)}` : qs;

  try {
    const res = await fetch(`${API}/suggestions?${finalQS}`);
    const d = await res.json();
    suggTotal = d.total || 0;
    document.getElementById('suggCount').innerHTML =
      `<strong>${suggTotal.toLocaleString()}</strong> meaningful suggestions`;

    const list = document.getElementById('slist');
    list.innerHTML = ''; // Always clear for pagination

    if (!d.items?.length) {
      if (reset) list.innerHTML = '<div class="nodata">No suggestions for current selection</div>';
      document.getElementById('suggPagination').style.display = 'none';
    } else {
      d.items.forEach(s => {
        const short = (s.student_batch || '').replace(/^\d{4}\s+/, '');
        const card = document.createElement('div');
        card.className = 'scard';
        card.innerHTML = `${s.answer_text}
    <div class="smeta">
      <span class="stag">📚 ${short}</span>
      <span class="stag">👤 ${s.faculty_name}</span>
      ${s.subject ? `<span class="stag">📖 ${s.subject}</span>` : ''}
    </div>`;
        list.appendChild(card);
      });

      const totalPages = Math.ceil(suggTotal / LIMIT) || 1;
      document.getElementById('suggPagination').style.display = 'flex';
      document.getElementById('suggPageInfo').textContent = `Page ${suggPage} of ${totalPages}`;
      document.getElementById('suggPrevBtn').disabled = suggPage <= 1;
      document.getElementById('suggNextBtn').disabled = suggPage >= totalPages;
    }
  } catch (e) { console.warn('suggestions error', e); }
  setLoading('cardSugg', false);
}

async function populateSuggBatchFilter() {
  // Fill the suggestion batch dropdown based on available batches in current filter
  const sel = document.getElementById('suggBatchSel');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Batches</option>';
  const avail = getAvailBatches('');
  avail.forEach(b => {
    const short = (b.student_batch || '').replace(/^\d{4}\s+/, '');
    sel.innerHTML += `<option value="${esc(b.student_batch)}">${b.batch_year ? b.batch_year + ' — ' : ''}${short}</option>`;
  });
  // Restore selection if still valid
  if (avail.some(b => b.student_batch === current)) sel.value = current;
}

function changeSuggPage(dir) {
  suggPage += dir;
  loadSuggestions(false);
}

// ── CHART DESTROY HELPER ──────────────────────────────────────
function dc(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ── UTIL ──────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ── CSV UPLOAD ────────────────────────────────────────────────
async function uploadCSV(input) {
  if (!input.files.length) return;
  const bar = document.getElementById('upbar');
  bar.classList.add('show');
  document.getElementById('upfill').style.width = '15%';
  document.getElementById('upstatus').textContent = 'Uploading…';

  const form = new FormData();
  form.append('file', input.files[0]);

  try {
    document.getElementById('upfill').style.width = '50%';
    document.getElementById('upstatus').textContent = 'Processing on server…';
    const res = await fetch(`${API}/upload-csv`, { method: 'POST', body: form });
    const d = await res.json();
    document.getElementById('upfill').style.width = '100%';
    if (d.status === 'ok') {
      document.getElementById('upstatus').textContent = `✓ ${d.message}`;
      await loadFilters();
      renderAll();
    } else {
      document.getElementById('upstatus').textContent = `⚠ ${d.message}`;
    }
  } catch (e) {
    document.getElementById('upstatus').textContent = '⚠ Upload failed: ' + e.message;
  }
  setTimeout(() => bar.classList.remove('show'), 5000);
  input.value = '';
}

function resetInstFilters() {
  // Clear all 3 dropdowns
  ['inst-school-filter', 'inst-dept-filter', 'inst-batch-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // If Dean — lock school back to their scoped school
  if (SESSION?.role === 'dean' && SESSION?.school) {
    const schoolEl = document.getElementById('inst-school-filter');
    if (schoolEl) schoolEl.value = SESSION.school;
  }

  // Reload institutional data with reset filters
  loadInstitutionalData();
}

function switchTab(type) {
  // Show/Hide sections
  document.getElementById('section-faculty').style.display = (type === 'faculty') ? 'block' : 'none';
  document.getElementById('section-institution').style.display = (type === 'institution') ? 'block' : 'none';
  document.getElementById('section-rankings').style.display = (type === 'rankings') ? 'block' : 'none';


  // Toggle Button UI
  document.getElementById('tab-fac').classList.toggle('active', type === 'faculty');
  document.getElementById('tab-inst').classList.toggle('active', type === 'institution');
  document.getElementById('tab-rank').classList.toggle('active', type === 'rankings');


  localStorage.setItem('active_tab', type);

  if (type === 'institution') loadInstitutionalData();
  if (type === 'rankings') { buildRankGrid(); loadRankings(); }
}
// renderInstitutionalChart is defined below — this duplicate removed

async function loadInstitutionalData() {
  const role = SESSION?.role || 'admin';
  const uSchool = SESSION?.school || '';

  const schoolVal = document.getElementById('inst-school-filter')?.value || '';
  const deptVal = document.getElementById('inst-dept-filter')?.value || '';
  const batchVal = document.getElementById('inst-batch-filter')?.value || '';

  const params = new URLSearchParams({
    role: role,
    school: schoolVal || uSchool,
    dept: deptVal,
    batch: batchVal
  });

  try {
    // --- 1. Fetch Ratings Stats & Render Bar Chart ---
    const statsRes = await fetch(`${API}/institutional-stats?${params}`);
    if (!statsRes.ok) throw new Error("Stats fetch failed");
    const stats = await statsRes.json();
    renderInstitutionalChart(stats);

    // Update Average Score Header
    const avgDisplay = document.getElementById('inst-avg-score');
    try {
      const avgRes = await fetch(`${API}/institutional-avg?${params}`);
      const avgData = await avgRes.json();
      avgDisplay.innerText = avgData.avg !== null ? parseFloat(avgData.avg).toFixed(2) : '0.00';
    } catch (e) {
      avgDisplay.innerText = '0.00';
    }

    // --- 2. Fetch Sentiment Distribution (NOW USING SURVEY LABELS) ---
    const distRes = await fetch(`${API}/institutional-distribution?${params}`);
    if (!distRes.ok) throw new Error("Distribution fetch failed");
    const distData = await distRes.json();

    // Pass data to the updated renderer
    renderInstDistribution(distData);

    /** * FIX: Calculate Total Responses from the survey distribution.
     * Mapping: strongly_agree, agree, neutral, disagree
     */
    const totalParticipants = (distData.strongly_agree || 0) +
      (distData.agree || 0) +
      (distData.neutral || 0) +
      (distData.disagree || 0);

    const totalRespEl = document.getElementById('inst-total-responses');
    if (totalRespEl) {
      totalRespEl.innerText = totalParticipants.toLocaleString();
      totalRespEl.style.color = 'var(--accent)'; // Visible in both themes
    }

    // --- 3. Load Text Suggestions ---
    await loadInstSuggestions(true);

    // --- 4. Refresh Filter Dropdowns ---
    const filterRes = await fetch(`${API}/institutional-filters?${params}`);
    if (filterRes.ok) {
      const filters = await filterRes.json();
      updateDropdown('inst-school-filter', filters.schools, schoolVal);
      updateDropdown('inst-dept-filter', filters.departments, deptVal);
      updateDropdown('inst-batch-filter', filters.batches, batchVal);
    }

  } catch (e) {
    console.error("Error loading institutional view:", e);
  }
}

async function loadInstSuggestions(reset = false) {
  if (reset) instSuggPage = 1;

  const schoolVal = document.getElementById('inst-school-filter')?.value || '';
  const deptVal = document.getElementById('inst-dept-filter')?.value || '';
  const batchVal = document.getElementById('inst-batch-filter')?.value || '';
  const role = SESSION?.role || 'admin';
  const uSchool = SESSION?.school || '';

  const params = new URLSearchParams({
    role, school: schoolVal || uSchool,
    dept: deptVal, batch: batchVal,
    limit: 5,
    offset: (instSuggPage - 1) * 5
  });

  try {
    const res = await fetch(`${API}/institutional-suggestions?${params}`);
    if (!res.ok) throw new Error('Suggestions fetch failed');
    const data = await res.json();

    instSuggTotal = data.total || 0;
    const suggestionsList = Array.isArray(data) ? (data[0]?.items || []) : (data.items || []);

    // Count badge
    const countEl = document.getElementById('inst-sugg-count');
    if (countEl) countEl.innerHTML = `<strong>${instSuggTotal.toLocaleString()}</strong> suggestions`;

    // Render items
    let html = '';
    if (suggestionsList.length === 0) {
      html = `<div style="text-align:center; padding:50px 20px; color:var(--muted); font-size:0.9em; opacity:0.7;">
                No long-form suggestions found for this selection.
              </div>`;
    } else {
      suggestionsList.forEach(s => {
        html += `
          <div class="suggestion-item" style="padding:15px; border-bottom:1px solid var(--s3);">
            <div style="font-size:0.75em; color:var(--accent); font-weight:bold; margin-bottom:4px;">
              ${esc(s.faculty_dept || 'Department')}
            </div>
            <div style="color:var(--text); line-height:1.5;">"${esc(s.answer_text)}"</div>
            <div style="font-size:0.7em; color:var(--muted); margin-top:6px;">Batch: ${esc(s.student_batch)}</div>
          </div>`;
      });
    }
    document.getElementById('inst-suggestions-content').innerHTML = html;

    // Pagination controls
    const totalPages = Math.ceil(instSuggTotal / 5) || 1;
    const pag = document.getElementById('inst-sugg-pagination');
    pag.style.display = instSuggTotal > 5 ? 'flex' : 'none';
    document.getElementById('inst-sugg-page-info').textContent = `Page ${instSuggPage} of ${totalPages}`;
    document.getElementById('inst-sugg-prev').disabled = instSuggPage <= 1;
    document.getElementById('inst-sugg-next').disabled = instSuggPage >= totalPages;

  } catch (e) { console.warn('inst suggestions error', e); }
}

function changeInstSuggPage(dir) {
  instSuggPage += dir;
  loadInstSuggestions(false);
}

function renderInstDistribution(data) {
  // A. Render Donut Chart with Survey Labels
  const ctx = document.getElementById('instDonutChart').getContext('2d');
  if (window.charts && window.charts['instDonut']) { window.charts['instDonut'].destroy(); delete window.charts['instDonut']; }
  if (charts && charts['instDonut']) { charts['instDonut'].destroy(); delete charts['instDonut']; }
  // Map backend keys to human-readable labels and impactful colors
  const surveyLabels = ['Strongly Agree', 'Agree', 'Neutral', 'Disagree'];
  const surveyCounts = [
    data.strongly_agree || 0,
    data.agree || 0,
    data.neutral || 0,
    data.disagree || 0
  ];

  window.charts = window.charts || {};
  charts['instDonut'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: surveyLabels,
      datasets: [{
        data: surveyCounts,
        backgroundColor: ['#00b894', '#0984e3', '#fdcb6e', '#d63031'], // Green, Blue, Yellow, Red
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      cutout: '75%',
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getVar('--muted'), padding: 15, font: { size: 10 }, boxWidth: 10 }
        }
      }
    }
  });

  // B. Render Progress Bars with Percentage Calculation
  const total = surveyCounts.reduce((a, b) => a + b, 0) || 1;
  const ratings = [
    { label: 'Strongly Agree', count: data.strongly_agree || 0, color: '#00b894' },
    { label: 'Agree', count: data.agree || 0, color: '#0984e3' },
    { label: 'Neutral', count: data.neutral || 0, color: '#fdcb6e' },
    { label: 'Disagree', count: data.disagree || 0, color: '#d63031' }
  ];

  let html = '';
  ratings.forEach(r => {
    const pct = ((r.count / total) * 100).toFixed(1);
    html += `
      <div style="margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; font-size:0.75em; margin-bottom:6px;">
              <span style="color:var(--text); font-weight:600;">${r.label}</span>
              <span style="color:var(--text-dim);">${r.count} (${pct}%)</span>
          </div>
          <div style="height:8px; background:var(--s3); border-radius:10px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${r.color}; border-radius:10px; transition: width 0.5s ease-in-out;"></div>
          </div>
      </div>`;
  });
  document.getElementById('inst-rating-distribution').innerHTML = html;
}

function updateDropdown(id, list, currentVal) {
  const el = document.getElementById(id);
  if (!el) return;
  const label = id.split('-')[1].toUpperCase();
  let html = `<option value="">All ${label}S</option>`;
  list.forEach(item => {
    const selected = (item === currentVal) ? 'selected' : '';
    html += `<option value="${esc(item)}" ${selected}>${esc(item)}</option>`;
  });
  el.innerHTML = html;
}

// Function to show/hide the questions reference based on backend mapping
// Function to show/hide the questions reference
function toggleInstQuestions() {
  const overlay = document.getElementById('inst-questions-overlay');
  const listContainer = document.getElementById('inst-questions-list');

  const questionMapping = {
    "Curriculum Relevance": "1. The curriculum of my programme is current and relevant.",
    "Conceptual Foundation": "2. The courses provide a strong conceptual foundation.",
    "Mentoring & Guidance": "3. The department provides adequate academic guidance and mentoring.",
    "Enrichment Activities": "4. The department organises academic enrichment activities - Conferences, workshops, guest lectures, etc.",
    "Infrastructure": "5. Infrastructure and facilities in the department are adequate for learning.",
    "Admin Support": "6. The institution provides effective academic and administrative support services.",
    "Campus Environment": "7. The campus environment is safe, inclusive and conducive to learning.",
    "Holistic Development": "8. The University promotes holistic development through cultural, sports, and extracurricular activities."
  };

  if (overlay.style.display === 'none' || overlay.style.display === '') {
    let html = '';
    Object.entries(questionMapping).forEach(([label, question]) => {
      html += `
          <div style="margin-bottom: 15px; border-bottom: 1px solid var(--s3); padding-bottom: 8px;">
              <div style="color: var(--accent) !important; font-weight: 600; font-size: 0.85em; margin-bottom: 3px;">
                  ${label}
              </div>
              <div style="color: var(--text) !important; line-height: 1.4; font-size: 0.95em;">
                  ${question}
              </div>
          </div>`;
    });
    listContainer.innerHTML = html;
    overlay.style.display = 'block';
  } else {
    overlay.style.display = 'none';
  }
}

async function renderInstitutionalChart(data) {
  const ctx = document.getElementById('instChart').getContext('2d');
  window.charts = window.charts || {};
  if (charts['instChart']) { charts['instChart'].destroy(); delete charts['instChart']; }
  if (window.charts?.['instChart']) { window.charts['instChart'].destroy(); delete window.charts['instChart']; }

  // Use getVar() so Chart.js receives actual computed hex values, not CSS var strings
  // (Chart.js cannot resolve CSS custom properties on its own)

  const barLabelsPlugin = {
    id: 'barLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      ctx.save();
      ctx.font = "bold 12px Sora, sans-serif";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'light' ? '#0f172a' : '#dce8ff';
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        const val = data.datasets[0].data[index];
        ctx.fillText(val + ' / 5', bar.x + 10, bar.y);
      });
      ctx.restore();
    }
  };

  charts['instChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.value),
        backgroundColor: '#4f8ef7',
        borderRadius: 5,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 55 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true }
      },
      scales: {
        x: {
          min: 0,
          max: 5,
          grid: { display: false },
          ticks: { color: getVar('--muted') }
        },
        y: {
          grid: { display: false },
          ticks: { color: document.documentElement.getAttribute('data-theme') === 'light' ? '#0f172a' : '#dce8ff', font: { family: 'Sora', size: 11 } }
        }
      }
    },
    plugins: [barLabelsPlugin]
  });
}

// ── FACULTY RANKINGS ──────────────────────────────────────────

async function loadRankings() {
  buildRankGrid();

  try {
    const qs = buildRankQS();
    const res = await fetch(`${API}/faculty-rankings?${qs}`);
    const data = await res.json();

    const totalFaculty = data.total_faculty || 0;
    lastTotalFaculty = totalFaculty;
    renderPagination(totalFaculty);

    const catMap = {
      vg: { pctKey: 'very_good_pct', color: '#4f8ef7', label: 'Very Good' },
      good: { pctKey: 'good_pct', color: '#3dd9c4', label: 'Good' },
      sat: { pctKey: 'satisfactory_pct', color: '#f7c94f', label: 'Satisfactory' },
      unsat: { pctKey: 'unsatisfactory_pct', color: '#f75f5f', label: 'Unsatisfactory' },
    };

    if (rankCat === 'all') {
      // Backend returns { very_good: [], good: [], satisfactory: [], unsatisfactory: [] }
      catMap.vg.rows = data.very_good || [];
      catMap.good.rows = data.good || [];
      catMap.sat.rows = data.satisfactory || [];
      catMap.unsat.rows = data.unsatisfactory || [];

      ['vg', 'good', 'sat', 'unsat'].forEach(cat => {
        renderRankCard(cat, catMap[cat], totalFaculty);
      });

    } else {
      // Backend returns { data: [...] } for single category
      catMap[rankCat].rows = data.data || [];
      renderRankCard(rankCat, catMap[rankCat], totalFaculty);
    }

  } catch (e) {
    console.warn('rankings error', e);
  }
}

function renderRankCard(catKey, catData, totalFaculty) {
  const container = document.getElementById(`rank-card-${catKey}`);
  if (!container) return;

  const rows = catData.rows || [];
  const { pctKey, color, label } = catData;

  const badge = container.querySelector('.rank-count-badge');
  if (badge) badge.textContent = rankCount >= 50 ? 'All' : `Top ${rankCount}`;

  const listEl = container.querySelector('.rank-list');

  if (!rows.length) {
    listEl.innerHTML = '<div class="rank-empty">No data for current filters</div>';
    return;
  }

  listEl.innerHTML = rows.map((r) => {

    const displayTotal = Math.max(
      r.vg_rank || 0,
      r.good_rank || 0,
      r.sat_rank || 0,
      r.unsat_rank || 0,
      totalFaculty
    );

    const rankKey = {
      'Very Good':      'vg_rank',
      'Good':           'good_rank',
      'Satisfactory':   'sat_rank',
      'Unsatisfactory': 'unsat_rank',
    }[label];

    const countKey = {
      'Very Good':      'very_good',
      'Good':           'good',
      'Satisfactory':   'satisfactory',
      'Unsatisfactory': 'unsatisfactory',
    }[label] || 'very_good';

    const initials = (r.faculty_name || '')
      .split(' ')
      .filter(w => /^[A-Z]/.test(w))
      .map(w => w[0])
      .join('')
      .slice(0, 2);

    const isSearched = rankSearch &&
      r.faculty_name.toLowerCase().includes(rankSearch.toLowerCase());

    // ✅ serialize r inside the map where r is defined
    const rJson = encodeURIComponent(JSON.stringify(r));

    return `
    <div class="rank-row-item ${isSearched ? 'rank-searched' : ''}"
         style="cursor:pointer"
         onclick="openRankSummaryModal(JSON.parse(decodeURIComponent('${rJson}')), ${displayTotal})">

      <div class="rank-num-block">
        <span class="rank-cat-num" style="color:${color}">#${r[rankKey]}</span>
        <span class="rank-global-num">${r[rankKey]} of ${displayTotal}</span>
        ${isSearched ? `<span class="rank-of-total">of ${displayTotal}</span>` : ''}
      </div>

      <div class="rank-av-wrap">
        <img
          src="${photoBase}${r.faculty_code}.JPG"
          class="rank-photo"
          style="${r.faculty_code ? '' : 'display:none'}; cursor:pointer"
          onclick="event.stopPropagation(); openImgModal(this.src)"
          onerror="
            if (!this.dataset.retry) {
              this.dataset.retry = '1';
              this.src='${photoBase}${r.faculty_code}.jpg';
            } else {
              this.style.display='none';
              this.nextElementSibling.style.display='flex';
            }
          "
        />
        <div class="rank-av" style="background:${color}22;color:${color};${r.faculty_code ? 'display:none' : ''}">
          ${initials}
        </div>
      </div>

      <div class="rank-info">
        <div class="rank-name">${esc(r.faculty_name)}</div>
        <div class="rank-meta">${esc(r.faculty_dept || '')} · ${esc(r.faculty_school || '')}</div>
      </div>

      <div class="rank-right">
        <span class="rank-badge-pill" style="background:${color}22;color:${color}">
          ${r[pctKey]}% ${label} (${Number(r[countKey] || 0).toLocaleString()} of ${Number(r.total).toLocaleString()})
        </span>

        <span class="rank-stat-line">
          ⭐ ${r.avg_score}/4 · ${Number(r.total).toLocaleString()} total
        </span>

        <button class="rank-view-sugg-btn"
          onclick="event.stopPropagation(); openRankModal(
            '${encodeURIComponent(r.faculty_name)}',
            '${color}',
            '${encodeURIComponent(r.faculty_dept || '')}',
            '${encodeURIComponent(r.faculty_school || '')}',
            ${r.avg_score}, ${r.total}, ${r[rankKey]}, ${r[pctKey]},
            '${label}', ${displayTotal},
            '${r.faculty_code || ''}'
          )">
          View suggestions
        </button>
      </div>

    </div>`;
  }).join('');
}

async function initGlobalTotal() {
  if (globalTotalFaculty) return; // already set, skip
  try {
    const f = getF();
    const params = new URLSearchParams({
      role:    f.role || 'admin',
      limit:   1,
      offset:  0,
      sort_by: 'unsatisfactory',
    });
    if (f.dept)   params.set('dept',   f.dept);
    if (f.school) params.set('school', f.school);
    const res  = await fetch(`${API}/faculty-rankings?${params}`);
    const data = await res.json();
    globalTotalFaculty = data.total_faculty || 0;
  } catch(e) {
    console.warn('globalTotal error', e);
  }
}

function buildRankGrid() {
  const grid = document.getElementById('rankGrid');
  grid.innerHTML = '';

  const catDefs = [
    { key: 'unsat', color: '#f75f5f', title: 'Top by Unsatisfactory %' },
    { key: 'sat', color: '#f7c94f', title: 'Top by Satisfactory %' },
    { key: 'good', color: '#3dd9c4', title: 'Top by Good %' },
    { key: 'vg', color: '#4f8ef7', title: 'Top by Very Good %' },
  ];

  const toShow = rankCat === 'all' ? catDefs : [catDefs.find(c => c.key === rankCat)];

  toShow.forEach(cat => {
    const depts = (FILTERS.departments || []);
    const deptOptions = depts.map(d =>
      `<option value="${d}">${d.replace('DEPARTMENT OF ', '')}</option>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.id = `rank-card-${cat.key}`;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border2);flex-wrap:wrap">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block;flex-shrink:0"></span>
        <span style="font-size:13px;font-weight:600;color:var(--text)">${cat.title}</span>
        <select
          id="rank-dept-${cat.key}"
          onchange="onRankDeptChange('${cat.key}', this.value)"
          style="
            margin-left:8px;
            font-size:11px;
            padding:3px 8px;
            border-radius:8px;
            border:1px solid var(--border2);
            background:var(--card);
            color:var(--text);
            cursor:pointer;
            max-width:220px;
          "
        >
          <option value="">All Departments</option>
          ${deptOptions}
        </select>
        <span class="rank-count-badge" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:8px;background:${cat.color}22;color:${cat.color};font-weight:600">
          Top ${rankCount}
        </span>
      </div>
      <div class="rank-list">
        <div class="rank-skeleton"></div>
        <div class="rank-skeleton"></div>
      </div>`;
    grid.appendChild(card);

    // Restore previously selected dept for this card if any
    if (rankCardDept[cat.key]) {
      const sel = card.querySelector(`#rank-dept-${cat.key}`);
      if (sel) sel.value = rankCardDept[cat.key];
    }
  });
}

function onRankDeptChange(catKey, dept) {
  rankCardDept[catKey] = dept;
  rankPage = 1;
  loadRankings();
}

// ── MODAL ─────────────────────────────────────────────────────
let _modalFaculty = '';
let _modalOffset = 0;
let _modalTotal = 0;

function openRankModal(
  encodedFaculty,
  color,
  encodedDept,
  encodedSchool,
  avg,
  total,
  globalRank,
  pct,
  label,
  totalFaculty,
  facultyCode
) {
  _modalFaculty = encodedFaculty;
  _modalOffset = 0;
  _modalTotal = 0;

  const faculty = decodeURIComponent(encodedFaculty);
  const dept = decodeURIComponent(encodedDept);
  const school = decodeURIComponent(encodedSchool);

  const container = document.getElementById('rankModalInitials');

  const initials = faculty
    .split(' ')
    .filter(w => /^[A-Z]/.test(w))
    .map(w => w[0])
    .join('')
    .slice(0, 2);

  // 🔥 Reset container
  container.innerHTML = '';
  container.onclick = null;
  container.style.cursor = 'default';

  const decodedCode = decodeURIComponent(facultyCode || '');

  if (decodedCode) {
    // 🔹 Loader
    const loader = document.createElement('div');
    loader.className = 'img-loader';
    container.appendChild(loader);

    // 🔹 Image
    const img = document.createElement('img');
    img.src = `${photoBase}${decodedCode}.JPG`;
    img.alt = faculty;
    img.className = 'modal-photo';
    img.style.display = 'none';

    // 🔹 Timeout (3 sec fallback)
    const timeout = setTimeout(() => {
      img.onerror();
    }, 3000);

    // ✅ On Load
    img.onload = () => {
      clearTimeout(timeout);
      loader.remove();
      img.style.display = 'block';
    };

    // ❌ On Error → fallback + retry
    img.onerror = () => {
      clearTimeout(timeout);
      loader.remove();

      container.innerHTML = `<span class="initials">${initials}</span>`;

      // 🔁 Retry on click
      container.style.cursor = 'pointer';
      container.onclick = () => {
        container.onclick = null;
        openRankModal(
          encodedFaculty,
          color,
          encodedDept,
          encodedSchool,
          avg,
          total,
          globalRank,
          pct,
          label,
          totalFaculty,
          facultyCode
        );
      };
    };

    container.appendChild(img);

  } else {
    container.innerHTML = `<span class="initials">${initials}</span>`;
  }

  // 🎨 Styling
  container.style.background = color + '22';
  container.style.color = color;

  // ── TEXT INFO ─────────────────────────────────
  document.getElementById('rankModalName').textContent = faculty;
  document.getElementById('rankModalDept').textContent = `${dept} · ${school}`;

  document.getElementById('rankModalMeta').innerHTML = `
    <span>⭐ ${avg}/4</span>
    <span>${Number(total).toLocaleString()} total responses</span>
    <span style="background:${color}22;color:${color};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:500">
      Rank ${globalRank} of ${totalFaculty} · ${pct}% ${label}
    </span>
  `;

  // ── RESET MODAL CONTENT ───────────────────────
  document.getElementById('rankModalSuggList').innerHTML =
    '<div style="color:var(--muted);font-size:13px;padding:10px 0">Loading…</div>';

  document.getElementById('rankModalCount').textContent = '';
  document.getElementById('rankModalLoadMore').style.display = 'none';

  document.getElementById('rankModal').style.display = 'flex';

  // ── FETCH SUGGESTIONS ─────────────────────────
  fetchModalSugg(true);
}

async function fetchModalSugg(initial) {
  const f = getF();
  const p = new URLSearchParams({
    faculty: decodeURIComponent(_modalFaculty),
    role: f.role,
    limit: 5,
    offset: _modalOffset,
  });
  if (f.dept) p.set('dept', f.dept);
  if (f.school) p.set('school', f.school);
  if (f.year) p.set('year', f.year);
  if (f.programme) p.set('programme', f.programme);
  if (f.batch) p.set('batch', f.batch);

  try {
    const res = await fetch(`${API}/ranking-suggestions?${p}`);
    const data = await res.json();
    _modalTotal = data.total || 0;
    const items = data.items || [];

    const list = document.getElementById('rankModalSuggList');
    if (initial) list.innerHTML = '';

    document.getElementById('rankModalCount').textContent =
      `${_modalTotal.toLocaleString()} student suggestion${_modalTotal !== 1 ? 's' : ''}`;

    if (!items.length && initial) {
      list.innerHTML =
        '<div style="color:var(--muted);font-size:13px;padding:10px 0">No suggestions found for this faculty.</div>';
      return;
    }

    items.forEach(s => {
      const div = document.createElement('div');
      div.className = 'rank-modal-sugg';
      div.innerHTML = `
        <div class="rank-modal-sugg-text">"${esc(s.answer_text)}"</div>
        <div class="rank-modal-sugg-meta">
          ${s.subject ? `<span>📖 ${esc(s.subject)}</span>` : ''}
          ${s.student_batch ? `<span>📚 ${esc(s.student_batch)}</span>` : ''}
        </div>`;
      list.appendChild(div);
    });

    _modalOffset += items.length;
    const remaining = _modalTotal - _modalOffset;
    const btn = document.getElementById('rankModalLoadMore');
    btn.style.display = remaining > 0 ? 'block' : 'none';
    btn.textContent = `Load more (${remaining} remaining)`;

  } catch (e) {
    document.getElementById('rankModalSuggList').innerHTML =
      '<div style="color:var(--muted);font-size:13px">Failed to load suggestions.</div>';
  }
}

function closeRankModal() {
  document.getElementById('rankModal').style.display = 'none';
}

// ── RANKINGS CONTROLS ─────────────────────────────────────────

function setRankCat(cat, el) {
  rankCat = cat;
  rankPage = 1; //FIX
  document.querySelectorAll('.rank-cat-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  el.classList.add('active');
  console.log("Selected category:", rankCat);
  loadRankings();

}

function onRankSearch(val) {
  rankSearch = val;
  rankPage = 1;
  clearTimeout(window._rankSearchTimer);
  window._rankSearchTimer = setTimeout(loadRankings, 350);
}

function onRankCountSlider(val) {
  rankCount = parseInt(val);
  rankPage = 1;
  document.getElementById('rankCountVal').textContent = `${val} per page`; // ✅ FIX
  document.querySelectorAll('.rank-pill').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.val) === rankCount);
  });
  loadRankings();
}

function setRankCount(val, btn) {
  rankCount = val;
  rankPage = 1;
  document.getElementById('rankCountSlider').value = val > 50 ? 50 : val;
  document.getElementById('rankCountVal').textContent = `${val} per page`; // ✅ FIX
  document.querySelectorAll('.rank-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  loadRankings();
}

function toggleRankExclusive() {
  rankExclusive = !rankExclusive;
  const track = document.getElementById('rankExcToggle');
  track.classList.toggle('on', rankExclusive);
  document.getElementById('rankExcLabel').textContent =
    `Exclusive: ${rankExclusive ? 'ON' : 'OFF'}`;
  loadRankings();
}

function renderPagination(totalFaculty) {
  const totalPages = Math.ceil(totalFaculty / rankCount);
  const container = document.getElementById('rankPagination');

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  if (rankPage > totalPages) rankPage = totalPages;

  let html = '';

  // Prev button
  html += `
    <button class="rank-page-btn"
      onclick="changePage(${rankPage - 1})"
      ${rankPage === 1 ? 'disabled' : ''}>
      ‹
    </button>
  `;

  const pages = [];

  // Always show first
  pages.push(1);

  // Window around current page
  for (let i = rankPage - 2; i <= rankPage + 2; i++) {
    if (i > 1 && i < totalPages) pages.push(i);
  }

  // Always show last
  if (totalPages > 1) pages.push(totalPages);

  // Remove duplicates + sort
  const uniquePages = [...new Set(pages)].sort((a, b) => a - b);

  let prev = 0;

  uniquePages.forEach(p => {
    if (p - prev > 1) {
      html += `<span class="rank-page-ellipsis">…</span>`;
    }

    html += `
      <button class="rank-page-btn ${p === rankPage ? 'active' : ''}"
        onclick="changePage(${p})">
        ${p}
      </button>
    `;

    prev = p;
  });

  // Next button
  html += `
    <button class="rank-page-btn"
      onclick="changePage(${rankPage + 1})"
      ${rankPage === totalPages ? 'disabled' : ''}>
      ›
    </button>
  `;

  container.innerHTML = html;
}

function changePage(page) {
  console.log("Changing to page:", page); // 👈 ADD
  const totalPages = Math.ceil(lastTotalFaculty / rankCount);
  if (page < 1 || page > totalPages) return;
  rankPage = page;
  loadRankings();
}

function openImgModal(src) {
  const modal = document.getElementById('imgModal');
  const img = document.getElementById('imgModalSrc');
  img.src = src;
  modal.style.display = 'flex';
}

function closeImgModal(e) {
  const modal = document.getElementById('imgModal');
  if (!e || e.target.id === 'imgModal' || e.target.classList.contains('img-close')) {
    modal.style.display = 'none';
  }
}

function openRankSummaryModal(r, totalFaculty) {
  // ── Avatar ─────────────────────────────────────────────────

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const modalInner = document.querySelector('#rankSummaryModal > div');
  modalInner.style.background = isDark ? '#1e1e2e' : '#ffffff';

  const avEl = document.getElementById('rsm-av');
  const initials = (r.faculty_name || '')
    .split(' ')
    .filter(w => /^[A-Z]/.test(w))
    .map(w => w[0])
    .join('')
    .slice(0, 2);

  if (r.faculty_code) {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    img.src = `${photoBase}${r.faculty_code}.JPG`;
    img.onerror = () => {
      if (!img.dataset.retry) {
        img.dataset.retry = '1';
        img.src = `${photoBase}${r.faculty_code}.jpg`;
      } else {
        img.style.display = 'none';
        avEl.textContent = initials;
      }
    };
    avEl.textContent = '';
    avEl.appendChild(img);
  } else {
    avEl.textContent = initials || '✦';
  }

  // ── Name / Dept ────────────────────────────────────────────
  document.getElementById('rsm-name').textContent = r.faculty_name || '—';
  document.getElementById('rsm-dept').textContent =
    `${r.faculty_dept || ''} · ${r.faculty_school || ''}`;

  // ── Category tiles ─────────────────────────────────────────  ← REPLACE FROM HERE
  const tiles = [
    { id: 'rsm-vg',    color: '#4f8ef7', bg: '#e8f0fe', label: 'Very Good',      pct: r.very_good_pct,      rank: r.vg_rank,    count: r.very_good      },
    { id: 'rsm-good',  color: '#1a7a6e', bg: '#e0f7f4', label: 'Good',           pct: r.good_pct,           rank: r.good_rank,  count: r.good           },
    { id: 'rsm-sat',   color: '#a07800', bg: '#fef8e0', label: 'Satisfactory',   pct: r.satisfactory_pct,   rank: r.sat_rank,   count: r.satisfactory   },
    { id: 'rsm-unsat', color: '#c0392b', bg: '#fde8e8', label: 'Unsatisfactory', pct: r.unsatisfactory_pct, rank: r.unsat_rank, count: r.unsatisfactory },
  ];

  tiles.forEach(t => {
    const el = document.getElementById(t.id);
    el.style.background = t.bg;
    el.style.color = t.color;
    el.innerHTML = `
      <span class="rsm-pct">${t.pct}%</span>
      <span class="rsm-label">${t.label}</span>
      <span class="rsm-rank">Rank #${t.rank} of ${totalFaculty}</span>
      <span class="rsm-count">${Number(t.count || 0).toLocaleString()} responses</span>
    `;
  });                                                             // ← TO HERE

  // ── Meta ───────────────────────────────────────────────────
  document.getElementById('rsm-avg').textContent = r.avg_score;
  document.getElementById('rsm-total').textContent = Number(r.total).toLocaleString();

  document.getElementById('rankSummaryModal').style.display = 'flex';
}

function closeRankSummaryModal(e) {
  if (!e || e.target.id === 'rankSummaryModal') {
    document.getElementById('rankSummaryModal').style.display = 'none';
  }
}