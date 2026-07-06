let allSessions = [];
let weightLog = [];
let currentFilter = 'all';
let progressChart = null;
let topExercisesChart = null;
let muscleGroupChart = null;
let currentHistoryPage = 0;
let currentFilteredSessions = [];
const HISTORY_PAGE_SIZE = 15;

function toggleCollapse(bodyId, chevronId) {
  const body    = document.getElementById(bodyId);
  const chevron = document.getElementById(chevronId);
  if (!body) return;
  const collapsed = body.classList.contains('is-collapsed') || body.style.maxHeight === '0px' || body.style.maxHeight === '0';
  if (collapsed) {
    body.classList.remove('is-collapsed');
    body.classList.remove('is-open');
    body.style.overflow  = 'hidden';
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity   = '1';
    chevron?.classList.remove('is-collapsed');
    const done = () => {
      body.style.maxHeight = 'none';
      body.classList.add('is-open');
    };
    const timer = setTimeout(done, 350);
    body.addEventListener('transitionend', () => { clearTimeout(timer); done(); }, { once: true });
  } else {
    body.classList.remove('is-open');
    body.style.overflow  = 'hidden';
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight; // force reflow
    body.style.maxHeight = '0';
    body.style.opacity   = '0';
    body.classList.add('is-collapsed');
    chevron?.classList.add('is-collapsed');
  }
}

function updateButtonMode() {
  const isMobile = window.innerWidth <= 768;
  document.getElementById('edit-selected-btn').textContent   = isMobile ? '✎'  : '✎ Editar';
  document.getElementById('delete-selected-btn').textContent = isMobile ? '🗑' : '🗑 Borrar';
  document.getElementById('delete-all-btn').textContent      = isMobile ? '⚠'  : '⚠ Limpiar';
}
updateButtonMode();
window.addEventListener('resize', updateButtonMode);

const MUSCLE_COLORS = {
  'Pecho':               '#c0392b',
  'Dorsal':              '#2471a3',
  'Espalda media':       '#1a5276',
  'Lumbar':              '#0d3349',
  'Hombros':             '#7d3c98',
  'Deltoides posterior': '#5b2c6f',
  'Bíceps':              '#1e8449',
  'Tríceps':             '#148f77',
  'Cuádriceps':          '#ca6f1e',
  'Isquiosurales':       '#a04000',
  'Glúteos':             '#d35400',
  'Gemelos':             '#784212',
  'Core':                '#616a6b',
  // legacy fallbacks
  'Espalda':             '#2471a3',
  'Piernas':             '#ca6f1e',
};

function muscleGroupColor(mg) {
  return MUSCLE_COLORS[mg] || '#555555';
}

const EXERCISE_MUSCLE_MAP = {
  'Press de banca':'Pecho','Press de banca con mancuernas':'Pecho','Press inclinado con barra':'Pecho',
  'Press inclinado con mancuernas':'Pecho','Press declinado':'Pecho','Fondos en paralelas':'Pecho',
  'Aperturas con mancuernas':'Pecho','Aperturas en máquina (pec deck)':'Pecho','Cruce de poleas':'Pecho','Press en máquina':'Pecho',
  'Dominadas':'Dorsal','Jalón al pecho':'Dorsal','Jalón en polea agarre neutro':'Dorsal',
  'Remo con barra':'Dorsal','Remo con mancuerna':'Dorsal','Remo en máquina':'Dorsal',
  'Remo sentado en polea':'Dorsal','Remo sentado en máquina':'Dorsal','Remo en polea baja':'Dorsal',
  'Face pulls':'Espalda media','Remo al cuello':'Espalda media',
  'Peso muerto':'Lumbar','Hiperextensiones':'Lumbar','Buenos días':'Lumbar',
  'Press militar':'Hombros','Press arnold':'Hombros','Press con mancuernas':'Hombros',
  'Elevaciones laterales':'Hombros','Elevaciones frontales':'Hombros',
  'Pájaros':'Deltoides posterior','Pájaros en máquina':'Deltoides posterior','Remo al mentón':'Deltoides posterior',
  'Press francés':'Tríceps','Extensión de tríceps en polea':'Tríceps','Extensión de tríceps con cuerda':'Tríceps',
  'Fondos para tríceps':'Tríceps','Extensión por encima de la cabeza':'Tríceps','Press cerrado':'Tríceps',
  'Curl con barra':'Bíceps','Curl con barra EZ':'Bíceps','Curl con mancuernas':'Bíceps',
  'Curl martillo':'Bíceps','Curl en banco inclinado':'Bíceps','Curl en polea':'Bíceps',
  'Curl en máquina':'Bíceps','Curl concentrado':'Bíceps',
  'Sentadilla':'Cuádriceps','Sentadilla hack':'Cuádriceps','Sentadilla goblet':'Cuádriceps',
  'Prensa de piernas':'Cuádriceps','Extensión de cuádriceps':'Cuádriceps',
  'Zancadas':'Cuádriceps','Zancadas con mancuernas':'Cuádriceps','Step-up':'Cuádriceps',
  'Peso muerto rumano':'Isquiosurales','Curl femoral':'Isquiosurales','Curl femoral tumbado':'Isquiosurales',
  'Curl femoral sentado':'Isquiosurales','Curl femoral de pie':'Isquiosurales',
  'Peso muerto sumo':'Isquiosurales','Nordics':'Isquiosurales',
  'Hip thrust':'Glúteos','Hip thrust con barra':'Glúteos','Patada de glúteo en polea':'Glúteos',
  'Abducción de cadera en máquina':'Glúteos','Puente de glúteo':'Glúteos',
  'Elevación de gemelos':'Gemelos','Elevación de gemelos de pie':'Gemelos',
  'Elevación de gemelos sentado':'Gemelos','Elevación de gemelos en prensa':'Gemelos',
  'Crunch abdominal':'Core','Crunch en polea':'Core','Elevaciones de piernas':'Core',
  'Plancha':'Core','Rueda abdominal':'Core','Sit-up':'Core','Russian twist':'Core','Dragon flag':'Core',
};

let exercisesMuscleData = {};

const MUSCLE_GROUPS = [
  'Pecho','Dorsal','Espalda media','Lumbar',
  'Hombros','Deltoides posterior',
  'Bíceps','Tríceps',
  'Cuádriceps','Isquiosurales','Glúteos','Gemelos',
  'Core',
];

async function loadStats() {
  try {
    allSessions = await fetch('/api/sessions').then(r => r.json());
    const exercisesRes = await fetch('/api/exercises').then(r => r.json());
    weightLog = await fetch('/api/weight').then(r => r.json()).catch(() => []);

    exercisesRes.forEach(ex => {
      if (typeof ex === 'object' && ex.name && ex.muscle_group) {
        exercisesMuscleData[ex.name] = ex.muscle_group;
      }
    });

    setupSelectors();
    loadExerciseSelect();
    updateStats();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
  loadAdherence();
}

function getMuscleGroup(exerciseName) {
  return exercisesMuscleData[exerciseName] || EXERCISE_MUSCLE_MAP[exerciseName] || null;
}

function getFilteredSessions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return allSessions.filter(session => {
    const sessionDate = new Date(session.date);
    sessionDate.setHours(0, 0, 0, 0);

    if (currentFilter === 'all') return true;

    if (currentFilter === 'current-week') {
      const monday = new Date(today);
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      return sessionDate >= monday && sessionDate <= today;
    }

    if (currentFilter === 'last-week') {
      const lastMonday = new Date(today);
      lastMonday.setDate(lastMonday.getDate() - today.getDay() - 6);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastSunday.getDate() + 6);
      return sessionDate >= lastMonday && sessionDate <= lastSunday;
    }

    if (currentFilter === 'last-month') {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return sessionDate >= thirtyDaysAgo && sessionDate <= today;
    }

    if (currentFilter.startsWith('month-')) {
      const [year, month] = currentFilter.substring(6).split('-');
      return (
        sessionDate.getFullYear() === parseInt(year) &&
        sessionDate.getMonth() === parseInt(month)
      );
    }

    return true;
  });
}

// ── Recap motivacional mes a mes ─────────────────────────────────────────────

function computeMonthlyRecap(sessions, weights) {
  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth();
  let prevY = curY, prevM = curM - 1;
  if (prevM < 0) { prevM = 11; prevY = curY - 1; }

  const inMonth = (dateStr, y, m) => {
    const d = new Date(dateStr);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  const daysThisMonth = new Set(sessions.filter(s => inMonth(s.date, curY, curM)).map(s => s.date)).size;
  const daysLastMonth = new Set(sessions.filter(s => inMonth(s.date, prevY, prevM)).map(s => s.date)).size;

  const thisMonthWeights = weights.filter(w => inMonth(w.date, curY, curM)).sort((a, b) => a.date.localeCompare(b.date));
  const lastMonthWeights = weights.filter(w => inMonth(w.date, prevY, prevM)).sort((a, b) => a.date.localeCompare(b.date));

  let weightDelta = null;
  if (thisMonthWeights.length) {
    const latestThis = thisMonthWeights[thisMonthWeights.length - 1].weight_kg;
    let baseline = null;
    if (lastMonthWeights.length) {
      baseline = lastMonthWeights[lastMonthWeights.length - 1].weight_kg;
    } else if (thisMonthWeights.length > 1) {
      baseline = thisMonthWeights[0].weight_kg;
    }
    if (baseline !== null) {
      weightDelta = Math.round((latestThis - baseline) * 10) / 10;
    }
  }

  return { daysThisMonth, daysLastMonth, weightDelta };
}

function renderMonthlyRecap(recap) {
  const el = document.getElementById('monthly-recap');
  if (!el) return;

  const lines = [];

  if (recap.daysLastMonth > 0) {
    const diff = recap.daysThisMonth - recap.daysLastMonth;
    if (diff > 0) {
      lines.push(`💪 Entrenaste <strong>${recap.daysThisMonth} días</strong> este mes (${recap.daysLastMonth} el mes pasado) — ¡vas mejor que el mes pasado!`);
    } else if (diff < 0) {
      lines.push(`💪 Entrenaste <strong>${recap.daysThisMonth} días</strong> este mes (${recap.daysLastMonth} el mes pasado) — un poco menos que el mes pasado, ¡a por el próximo!`);
    } else {
      lines.push(`💪 Entrenaste <strong>${recap.daysThisMonth} días</strong> este mes, igual que el mes pasado.`);
    }
  } else if (recap.daysThisMonth > 0) {
    lines.push(`💪 Entrenaste <strong>${recap.daysThisMonth} días</strong> este mes.`);
  }

  if (recap.weightDelta !== null) {
    const d = recap.weightDelta;
    if (Math.abs(d) < 0.1) {
      lines.push(`⚖️ Tu peso se mantuvo estable este mes.`);
    } else if (d < 0) {
      lines.push(`⚖️ Tu peso bajó <strong>${Math.abs(d)} kg</strong> este mes.`);
    } else {
      lines.push(`⚖️ Tu peso subió <strong>${d} kg</strong> este mes.`);
    }
  }

  if (lines.length === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = '';
  el.innerHTML = lines.map(l => `<p style="margin:4px 0; color:#ccc; font-size:.9rem;">${l}</p>`).join('');
}

// ── Cumplimiento del plan (ciclo actual + histórico por mes) ─────────────────

let adherenceHistoryData = [];

async function loadAdherence() {
  try {
    const res = await fetch('/api/coach/plan');
    const plan = res.ok ? await res.json() : null;
    renderAdherence(plan?.adherence || null);
  } catch (e) {
    renderAdherence(null);
  }

  try {
    const res = await fetch('/api/coach/adherence-history');
    const history = res.ok ? await res.json() : [];
    renderAdherenceHistoryList(history);
  } catch (e) {
    renderAdherenceHistoryList([]);
  }
}

function adherenceStatusColor(status) {
  return status === 'on_track' ? '#4caf50' : status === 'over' ? '#f0b429' : 'var(--accent)';
}
function adherenceStatusLabel(status) {
  return status === 'on_track' ? 'Al día' : status === 'over' ? 'Por encima' : 'Por debajo';
}
function adherenceOverallColor(pct) {
  return pct >= 85 ? '#4caf50' : pct >= 50 ? '#f0b429' : 'var(--accent)';
}

function renderAdherenceGroupRows(groups) {
  return groups.map(g => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
      <span style="color:var(--text); font-size:.85rem; flex:1; min-width:0;">${g.group}</span>
      <span style="color:#888; font-size:.78rem; font-family:'JetBrains Mono',monospace;">${g.totalCompletedSoFar}/${g.totalPlannedSoFar}</span>
      <span style="font-size:.72rem; font-weight:700; padding:2px 9px; border-radius:10px; color:#fff; background:${adherenceStatusColor(g.status)}; white-space:nowrap;">${adherenceStatusLabel(g.status)}</span>
    </div>`).join('');
}

function renderAdherence(adherence) {
  const card = document.getElementById('adherence-card');
  if (!card) return;

  // Card siempre visible, para que las dos cards de cumplimiento mantengan el layout
  // de ~50%/50% en vez de que la otra se estire a 100% cuando esta no tiene datos.
  card.classList.remove('hidden');

  if (!adherence || adherence.weeksElapsed < 1 || adherence.perMuscleGroup.length === 0) {
    const badge = document.getElementById('adherence-overall-badge');
    badge.textContent = '';
    badge.style.background = 'transparent';
    document.getElementById('adherence-note').textContent = 'Aún no hay datos de cumplimiento para el plan actual.';
    document.getElementById('adherence-exercises').innerHTML = '';
    document.getElementById('adherence-never-logged').classList.add('hidden');
    return;
  }

  document.getElementById('adherence-overall-badge').textContent = `${adherence.overallAdherencePct}%`;
  document.getElementById('adherence-overall-badge').style.background = adherenceOverallColor(adherence.overallAdherencePct);
  document.getElementById('adherence-note').textContent =
    `${adherence.overallSetsCompleted} de ${adherence.overallSetsPlanned} series planificadas, semana ${adherence.weeksElapsed} de 4 del plan actual.`;

  document.getElementById('adherence-exercises').innerHTML = renderAdherenceGroupRows(adherence.perMuscleGroup);

  const neverLoggedBlock = document.getElementById('adherence-never-logged');
  if (adherence.neverLogged.length > 0) {
    neverLoggedBlock.classList.remove('hidden');
    document.getElementById('adherence-never-logged-list').textContent = adherence.neverLogged.join(', ');
  } else {
    neverLoggedBlock.classList.add('hidden');
  }
}

function monthLabel(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderAdherenceHistoryList(history) {
  const card = document.getElementById('adherence-history-card');
  const list = document.getElementById('adherence-history-list');
  if (!card || !list) return;

  // Card siempre visible (aunque no haya histórico aún), para que las dos cards de
  // cumplimiento mantengan el layout de ~50%/50% en vez de que una se estire a 100%.
  card.classList.remove('hidden');

  if (!history || history.length === 0) {
    list.innerHTML = `<p style="color:#888; font-size:.85rem; margin:0;">Aún no hay ciclos de plan completados. Aparecerán aquí a medida que regeneres el plan (cada ciclo necesita al menos unos días activo para contar).</p>`;
    return;
  }

  // Un ciclo = una fila, más reciente primero (los ciclos de prueba ya se filtran
  // al guardar el snapshot: solo se registra si el plan anterior llevó ≥3 días activo).
  adherenceHistoryData = [...history].sort((a, b) => new Date(b.planGeneratedAt) - new Date(a.planGeneratedAt));

  list.innerHTML = adherenceHistoryData.map((h, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 10px; background:var(--bg-raised); border:1px solid var(--border); border-radius:6px;">
      <span style="color:var(--text); font-size:.85rem;">${monthLabel(h.planGeneratedAt)}</span>
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:.8rem; font-weight:700; padding:2px 10px; border-radius:14px; color:#fff; background:${adherenceOverallColor(h.overallAdherencePct)};">${h.overallAdherencePct}%</span>
        <button type="button" class="btn-secondary" style="width:auto; margin:0; padding:4px 10px; font-size:.72rem;" onclick="showAdherenceMonthDetail(${idx})">Ver detalle</button>
      </div>
    </div>`).join('');
}

function showAdherenceMonthDetail(idx) {
  const h = adherenceHistoryData[idx];
  if (!h) return;

  const rows = renderAdherenceGroupRows(h.perMuscleGroup);
  const neverLogged = h.neverLogged && h.neverLogged.length > 0
    ? `<div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <p style="color:var(--accent); font-size:0.78rem; font-weight:700; margin-bottom:6px; text-transform:uppercase; letter-spacing:.05em;">Nunca registrados</p>
        <p style="color:#ccc; font-size:.85rem; margin:0;">${h.neverLogged.join(', ')}</p>
      </div>`
    : '';

  const body = `
    <p style="color:#888; font-size:.78rem; margin-bottom:14px;">${h.overallSetsCompleted} de ${h.overallSetsPlanned} series planificadas.</p>
    <div>${rows}</div>
    ${neverLogged}`;

  showAlert(monthLabel(h.planGeneratedAt), body);
}

function setupSelectors() {
  const periodSelect = document.getElementById('period-select');
  const periodSelectHistory = document.getElementById('period-select-history');

  const monthsMap = new Map();
  allSessions.forEach(session => {
    const date = new Date(session.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
      });
    }
  });

  const sortedMonths = Array.from(monthsMap.values())
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const baseOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'current-week', label: 'Semana Actual' },
    { value: 'last-week', label: 'Última Semana' },
    { value: 'last-month', label: 'Último Mes' }
  ];

  const monthOptions = sortedMonths.map(m => ({
    value: `month-${m.year}-${m.month}`,
    label: m.label.charAt(0).toUpperCase() + m.label.slice(1)
  }));

  const allOptions = [...baseOptions, ...monthOptions];

  [periodSelect, periodSelectHistory].forEach(select => {
    select.innerHTML = '';
    allOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    });
  });

  const updateBoth = (value) => {
    currentFilter = value;
    periodSelect.value = value;
    periodSelectHistory.value = value;
    updateStats();
  };

  periodSelect.addEventListener('change', (e) => updateBoth(e.target.value));
  periodSelectHistory.addEventListener('change', (e) => updateBoth(e.target.value));
}

function loadExerciseSelect() {
  const exerciseSelect = document.getElementById('exercise-select');
  const exercises = new Set();

  allSessions.forEach(session => {
    exercises.add(session.exercise);
  });

  const sorted = Array.from(exercises).sort();
  exerciseSelect.innerHTML = '<option value="">Todos los ejercicios</option>';

  sorted.forEach(exercise => {
    const option = document.createElement('option');
    option.value = exercise;
    option.textContent = exercise;
    exerciseSelect.appendChild(option);
  });

  exerciseSelect.addEventListener('change', () => {
    renderProgressChart();
  });
}

function updateStats() {
  const filtered = getFilteredSessions();

  const totalSessions = new Set(filtered.map(s => s.batch_id || `${s.date}-${s.id}`)).size;
  const uniqueExercises = new Set(filtered.map(s => s.exercise)).size;
  const totalSeries = filtered.reduce((sum, s) => sum + (s.series ? s.series.length : 0), 0);
  const streakDays = calculateStreak(filtered);
  const topMuscle = findTopMuscleGroup(filtered);
  const topExercise = findTopExercise(filtered);

  document.getElementById('total-sessions').textContent = totalSessions;
  document.getElementById('unique-exercises').textContent = uniqueExercises;
  document.getElementById('total-series').textContent = totalSeries;
  document.getElementById('streak-days').textContent = streakDays;
  document.getElementById('top-muscle').textContent = topMuscle || '-';
  document.getElementById('top-exercise').textContent = topExercise || '-';

  currentHistoryPage = 0;
  renderHistory(filtered);
  renderProgressChart(filtered);
  renderTopExercisesChart(filtered);
  renderMuscleGroupChart(filtered);
  renderMonthlyRecap(computeMonthlyRecap(allSessions, weightLog));
}

function calculateStreak(sessions) {
  if (sessions.length === 0) return 0;

  // Deduplicate to unique training days
  const uniqueDates = [...new Set(sessions.map(s => s.date))].sort((a, b) => b.localeCompare(a));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Allow streak to start from today OR yesterday (in case user hasn't trained yet today)
  const latestDate = new Date(uniqueDates[0] + 'T00:00:00');
  if (latestDate < yesterday) return 0;

  let streak = 0;
  let expected = latestDate;

  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr + 'T00:00:00');
    if (d.getTime() === expected.getTime()) {
      streak++;
      expected = new Date(d);
      expected.setDate(expected.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function findTopMuscleGroup(sessions) {
  const muscleCounts = new Map();

  sessions.forEach(session => {
    const muscle = getMuscleGroup(session.exercise);
    if (muscle) {
      const count = muscleCounts.get(muscle) || 0;
      muscleCounts.set(muscle, count + 1);
    }
  });

  if (muscleCounts.size === 0) return null;

  let topMuscle = null;
  let maxCount = 0;

  for (const [muscle, count] of muscleCounts) {
    if (count > maxCount) {
      maxCount = count;
      topMuscle = muscle;
    }
  }

  return topMuscle;
}

function findTopExercise(sessions) {
  const counts = {};
  for (const s of sessions) {
    if (s.exercise) counts[s.exercise] = (counts[s.exercise] || 0) + 1;
  }
  if (!Object.keys(counts).length) return null;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function muscleGroupToClass(mg) {
  const map = {
    'Pecho':'pecho','Dorsal':'dorsal','Espalda media':'espalda-media','Lumbar':'lumbar',
    'Hombros':'hombros','Deltoides posterior':'deltoides-post',
    'Bíceps':'biceps','Tríceps':'triceps',
    'Cuádriceps':'cuadriceps','Isquiosurales':'isquios','Glúteos':'gluteos','Gemelos':'gemelos',
    'Core':'core',
    'Espalda':'dorsal','Piernas':'cuadriceps', // legacy
  };
  return map[mg] || 'other';
}

function groupSessionsByDate(sessions) {
  const groups = new Map();

  // Agrupar por batch_id si existe, si no usar date + id
  sessions.forEach(session => {
    const groupKey = session.batch_id || `${session.date}-${session.id}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(session);
  });

  // Ordenar por fecha y batch_id descendente para mantener orden cronológico
  return Array.from(groups.entries())
    .sort((a, b) => {
      const dateA = a[1][0].date;
      const dateB = b[1][0].date;
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      // Si mismo día, ordenar por batch_id o id descendente
      return (b[1][0].batch_id || b[1][0].id).toString().localeCompare((a[1][0].batch_id || a[1][0].id).toString());
    })
    .map(([groupKey, daySessions]) => ({ date: daySessions[0].date, daySessions }));
}

function renderHistory(sessions) {
  currentFilteredSessions = sessions || [];
  const body = document.getElementById('sessions-body');
  const noRecords = document.getElementById('no-records');

  if (!sessions || sessions.length === 0) {
    body.innerHTML = '';
    noRecords.style.display = 'block';
    renderHistoryPagination(0, 0);
    updateSelectionUI();
    return;
  }

  noRecords.style.display = 'none';
  const allGroups = groupSessionsByDate(sessions);
  const totalPages = Math.ceil(allGroups.length / HISTORY_PAGE_SIZE);
  if (currentHistoryPage >= totalPages) currentHistoryPage = totalPages - 1;
  if (currentHistoryPage < 0) currentHistoryPage = 0;
  const start = currentHistoryPage * HISTORY_PAGE_SIZE;
  const groups = allGroups.slice(start, start + HISTORY_PAGE_SIZE);

  body.innerHTML = groups.map(({ date, daySessions }) => {
    const batchId = daySessions[0].batch_id || `${date}-${daySessions[0].id}`;
    const muscleGroups = [...new Set(daySessions.map(s => getMuscleGroup(s.exercise)).filter(Boolean))];
    const exerciseCount = daySessions.length;
    const totalSeries = daySessions.reduce((sum, s) => sum + (s.series ? s.series.length : 0), 0);
    const sessionIds = daySessions.map(s => s.id).join(',');
    const [year, month, day] = date.split('-');
    const displayDate = `${day}/${month}/${year}`;
    const badges = muscleGroups.map(mg =>
      `<span class="muscle-badge muscle-${muscleGroupToClass(mg)}">${escapeHtml(mg)}</span>`
    ).join('');

    return `
      <tr data-date="${escapeHtml(date)}" data-batch-id="${escapeHtml(batchId)}" data-session-ids="${escapeHtml(sessionIds)}">
        <td><input type="checkbox" class="session-checkbox" title="Seleccionar"></td>
        <td>${displayDate}</td>
        <td>${badges}</td>
        <td style="text-align:center;">${exerciseCount}</td>
        <td style="text-align:center;">${totalSeries}</td>
        <td><button class="btn-ver-entreno" data-date="${escapeHtml(date)}" data-batch-id="${escapeHtml(batchId)}">Ver entreno</button></td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.session-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSelectionUI);
  });

  document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
    document.querySelectorAll('.session-checkbox').forEach(cb => { cb.checked = e.target.checked; });
    updateSelectionUI();
  });

  document.querySelectorAll('.btn-ver-entreno').forEach(btn => {
    btn.addEventListener('click', () => openWorkoutModal(btn.dataset.date, btn.dataset.batchId, sessions));
  });

  renderHistoryPagination(currentHistoryPage, Math.ceil(allGroups.length / HISTORY_PAGE_SIZE));
  updateSelectionUI();
}

function renderHistoryPagination(page, totalPages) {
  const container = document.getElementById('history-pagination');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const isFirst = page === 0;
  const isLast  = page >= totalPages - 1;
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;">
      <button onclick="goHistoryPage(${page - 1})" ${isFirst ? 'disabled' : ''}
              style="width:auto;margin:0;padding:5px 16px;font-size:.8rem;text-transform:none;letter-spacing:0;${isFirst ? 'opacity:.35;cursor:not-allowed;' : ''}">
        ← Anterior
      </button>
      <span style="color:#888;font-size:.82rem;min-width:90px;text-align:center;">Página ${page + 1} de ${totalPages}</span>
      <button onclick="goHistoryPage(${page + 1})" ${isLast ? 'disabled' : ''}
              style="width:auto;margin:0;padding:5px 16px;font-size:.8rem;text-transform:none;letter-spacing:0;${isLast ? 'opacity:.35;cursor:not-allowed;' : ''}">
        Siguiente →
      </button>
    </div>`;
}

function goHistoryPage(page) {
  currentHistoryPage = page;
  renderHistory(currentFilteredSessions);
  document.getElementById('history-pagination')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openWorkoutModal(date, batchId, sessions) {
  const daySessions = sessions.filter(s => s.date === date && (s.batch_id || `${s.date}-${s.id}`) === batchId);
  const [year, month, day] = date.split('-');
  document.getElementById('workout-modal-date').textContent = `Entreno ${day}/${month}/${year}`;

  const body = document.getElementById('workout-modal-body');
  body.innerHTML = daySessions.map(session => {
    const seriesRows = session.series && session.series.length > 0
      ? session.series.map((s, i) => `
          <tr>
            <td style="color:#aaa; font-size:0.85rem;">Serie ${i + 1}</td>
            <td>${s.reps} reps</td>
            <td>${formatWeight(s.weight)}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="color:#666;">Sin series registradas</td></tr>';

    const muscle = getMuscleGroup(session.exercise);
    const badge = muscle ? `<span class="muscle-badge muscle-${muscleGroupToClass(muscle)}" style="font-size:0.75rem;">${escapeHtml(muscle)}</span>` : '';
    const notes = session.notes ? `<p style="color:#aaa; font-size:0.82rem; margin:4px 0 8px;">${escapeHtml(session.notes)}</p>` : '';

    return `
      <div style="margin-bottom:20px; padding-bottom:18px; border-bottom:1px solid #333;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <strong style="color:#fff;">${escapeHtml(session.exercise)}</strong>${badge}
        </div>
        ${notes}
        <table style="width:100%; border-collapse:collapse;">
          <tbody>${seriesRows}</tbody>
        </table>
      </div>`;
  }).join('');

  document.getElementById('workout-modal-overlay').classList.remove('hidden');
  document.getElementById('workout-modal').classList.remove('hidden');
}

function closeWorkoutModal() {
  document.getElementById('workout-modal-overlay').classList.add('hidden');
  document.getElementById('workout-modal').classList.add('hidden');
}

function toggleChartEmptyState(canvasId, isEmpty) {
  const canvas = document.getElementById(canvasId);
  const empty  = document.getElementById(`${canvasId}-empty`);
  if (canvas) canvas.style.display = isEmpty ? 'none' : '';
  if (empty)  empty.style.display  = isEmpty ? '' : 'none';
}

function renderProgressChart(sessions = null) {
  const filtered = sessions || getFilteredSessions();
  const exerciseSelect = document.getElementById('exercise-select');
  const selectedExercise = exerciseSelect.value;

  let exerciseSessions = filtered.filter(s => !selectedExercise || s.exercise === selectedExercise);

  if (exerciseSessions.length === 0) {
    exerciseSessions = filtered;
  }

  toggleChartEmptyState('progressChart', exerciseSessions.length === 0);
  if (exerciseSessions.length === 0) {
    if (progressChart) { progressChart.destroy(); progressChart = null; }
    return;
  }

  exerciseSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

  const data = exerciseSessions.map(session => {
    const maxWeight = session.series && session.series.length > 0
      ? Math.max(...session.series.map(s => s.weight || 0))
      : 0;
    return { date: session.date, weight: maxWeight };
  });

  const ctx = document.getElementById('progressChart').getContext('2d');

  if (progressChart) {
    progressChart.destroy();
  }

  progressChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'Peso máximo (kg)',
          data: data.map(d => d.weight),
          borderColor: '#ff0000',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: '#ffffff' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#ffffff' },
          grid: { color: '#444444' }
        },
        x: {
          ticks: { color: '#ffffff' },
          grid: { color: '#444444' }
        }
      }
    }
  });
}

function renderTopExercisesChart(sessions) {
  const exerciseSeries = new Map();

  sessions.forEach(session => {
    const seriesCount = session.series ? session.series.length : 0;
    exerciseSeries.set(session.exercise, (exerciseSeries.get(session.exercise) || 0) + seriesCount);
  });

  const sorted = Array.from(exerciseSeries.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  toggleChartEmptyState('topExercisesChart', sorted.length === 0);
  if (sorted.length === 0) {
    if (topExercisesChart) { topExercisesChart.destroy(); topExercisesChart = null; }
    return;
  }

  const labels = sorted.map(e => e[0]);
  const data = sorted.map(e => e[1]);
  const backgroundColors = sorted.map(e => muscleGroupColor(getMuscleGroup(e[0])));

  const ctx = document.getElementById('topExercisesChart').getContext('2d');

  if (topExercisesChart) {
    topExercisesChart.destroy();
  }

  topExercisesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: backgroundColors,
          borderColor: '#2a2a2a',
          borderWidth: 1
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.x} series`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#aaaaaa', precision: 0 },
          grid: { color: '#333333' }
        },
        y: {
          ticks: { color: '#ffffff', font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderMuscleGroupChart(sessions) {
  const muscleCounts = new Map();

  sessions.forEach(session => {
    const muscle = getMuscleGroup(session.exercise);
    if (muscle) {
      const seriesCount = session.series ? session.series.length : 0;
      muscleCounts.set(muscle, (muscleCounts.get(muscle) || 0) + seriesCount);
    }
  });

  const total = Array.from(muscleCounts.values()).reduce((a, b) => a + b, 0);

  const sorted = Array.from(muscleCounts.entries())
    .sort((a, b) => b[1] - a[1]);

  toggleChartEmptyState('muscleGroupChart', total === 0);
  if (total === 0) {
    if (muscleGroupChart) { muscleGroupChart.destroy(); muscleGroupChart = null; }
    return;
  }

  const labels = sorted.map(e => `${e[0]} (${((e[1] / total) * 100).toFixed(0)}%)`);
  const data = sorted.map(e => e[1]);
  const backgroundColors = sorted.map(e => muscleGroupColor(e[0]));

  const ctx = document.getElementById('muscleGroupChart').getContext('2d');

  if (muscleGroupChart) {
    muscleGroupChart.destroy();
  }

  muscleGroupChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: backgroundColors,
          borderColor: '#2a2a2a',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#ffffff' }
        }
      }
    }
  });
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function formatWeight(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value === 0) return 'PC';
  return value + ' kg';
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadCsv(sessions) {
  const header = ['Fecha', 'Ejercicio', 'Series', 'Reps', 'Peso', 'Notas'];
  const rows = sessions.flatMap(session => {
    if (!session.series || session.series.length === 0) {
      return [[session.date, session.exercise, '-', '-', '-', session.notes || '']];
    }
    return session.series.map(serie => [
      session.date,
      session.exercise,
      serie.sets || 1,
      serie.reps,
      serie.weight === null || serie.weight === undefined ? '' : serie.weight,
      session.notes || ''
    ]);
  });

  const csvContent = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}`).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'gym-tracker-history.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

document.getElementById('export-button').addEventListener('click', async () => {
  try {
    const filtered = getFilteredSessions();
    downloadCsv(filtered);
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
});

function getSelectedDates() {
  return Array.from(document.querySelectorAll('.session-checkbox:checked'))
    .map(cb => cb.closest('tr').dataset.date);
}

function getSelectedSessionIds() {
  return Array.from(document.querySelectorAll('.session-checkbox:checked'))
    .flatMap(cb => cb.closest('tr').dataset.sessionIds.split(',').map(Number));
}

function updateSelectionUI() {
  const selected = getSelectedDates().length;
  document.getElementById('edit-selected-btn').style.display = selected > 0 ? 'inline-block' : 'none';
  document.getElementById('delete-selected-btn').style.display = selected > 0 ? 'inline-block' : 'none';
}

document.getElementById('edit-selected-btn').addEventListener('click', async () => {
  const rows = Array.from(document.querySelectorAll('.session-checkbox:checked')).map(cb => cb.closest('tr'));
  if (rows.length === 0) return;
  if (rows.length > 1) { await showAlert('Editar entreno', 'Solo puedes editar un entreno a la vez'); return; }

  const row = rows[0];
  const date = row.dataset.date;
  const batchId = row.dataset.batchId;
  const ids = row.dataset.sessionIds.split(',').map(Number);
  const batchSessions = allSessions.filter(s => ids.includes(s.id));
  openEditModal(date, batchId, batchSessions);
});

document.getElementById('delete-selected-btn').addEventListener('click', async () => {
  const ids = getSelectedSessionIds();
  if (ids.length === 0) return;
  const ok = await showConfirm({
    title: 'Borrar sesión',
    body: `<p style="color:#ccc;">Se eliminarán <strong>${ids.length} registro(s)</strong> de ejercicio. Esta acción no se puede deshacer.</p>`,
    okText: 'Borrar',
    danger: true
  });
  if (!ok) return;
  const btn = document.getElementById('delete-selected-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  try {
    for (let i = 0; i < ids.length; i++) {
      btn.textContent = `Borrando ${i + 1}/${ids.length}…`;
      const res = await fetch(`/api/sessions/${ids[i]}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    loadStats();
  } catch (error) {
    showAlert('Error', error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

document.getElementById('workout-modal-close').addEventListener('click', closeWorkoutModal);
document.getElementById('workout-modal-overlay').addEventListener('click', closeWorkoutModal);

document.getElementById('delete-all-btn').addEventListener('click', async () => {
  const first = await showConfirm({
    title: 'Limpiar historial',
    body: `<p style="color:#ccc; line-height:1.6;">Esta acción eliminará <strong>todas las sesiones</strong> registradas.<br><br>Los ejercicios de la biblioteca no se verán afectados.</p>`,
    okText: 'Continuar',
    danger: true
  });
  if (!first) return;

  const second = await showConfirm({
    title: 'Confirmación final',
    body: `<p style="color:#ccc; line-height:1.6;">Todos los registros serán eliminados de forma <strong>permanente</strong>. Esta acción no se puede deshacer.</p>`,
    okText: 'Limpiar todo',
    danger: true
  });
  if (!second) return;

  const btn = document.getElementById('delete-all-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  try {
    for (let i = 0; i < allSessions.length; i++) {
      btn.textContent = `Borrando ${i + 1}/${allSessions.length}…`;
      const res = await fetch(`/api/sessions/${allSessions[i].id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    loadStats();
  } catch (error) {
    showAlert('Error', error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

// ── Edición completa de entreno ──────────────────────────────────────────────

let editingBatchId = null;
let editingExercises = [];
let editExerciseOptions = [];

const editModal        = document.getElementById('edit-modal');
const editModalOverlay = document.getElementById('edit-modal-overlay');
const editExerciseInput    = document.getElementById('edit-exercise-input');
const editExerciseDropdown = document.getElementById('edit-exercise-dropdown');
document.body.appendChild(editExerciseDropdown);

function openEditModal(date, batchId, batchSessions) {
  editingBatchId = batchId;
  editingExercises = batchSessions.map(s => ({
    name: s.exercise,
    series: (s.series || []).map(sr => ({ sets: sr.sets || 1, reps: sr.reps, weight: sr.weight })),
    notes: s.notes || ''
  }));

  document.getElementById('edit-session-date').value = date;
  renderEditExercises();

  fetch('/api/exercises').then(r => r.json()).then(data => {
    editExerciseOptions = data.map(ex => typeof ex === 'object' ? ex.name : ex).filter(Boolean);
  });

  editModal.classList.remove('hidden');
  editModalOverlay.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editModalOverlay.classList.add('hidden');
  editExerciseInput.value = '';
  editExerciseDropdown.classList.add('hidden');
}

function renderEditExercises() {
  const container = document.getElementById('edit-exercises-container');
  if (editingExercises.length === 0) {
    container.innerHTML = '<p style="color:#999; text-align:center; margin-bottom:15px;">No hay ejercicios</p>';
    return;
  }

  container.innerHTML = editingExercises.map((ex, exIdx) => {
    const seriesRows = ex.series.map((s, sIdx) => `
      <tr>
        <td style="color:#aaa; font-size:0.85rem;">Serie ${sIdx + 1}</td>
        <td>${s.reps}</td>
        <td>${formatWeight(s.weight)}</td>
        <td class="row-actions">
          <button type="button" class="icon-btn edit-repeat-serie" data-ex="${exIdx}" data-ser="${sIdx}" title="Repetir serie">🔁</button>
          <button type="button" class="icon-btn icon-btn-danger edit-delete-serie" data-ex="${exIdx}" data-ser="${sIdx}" title="Eliminar serie">🗑</button>
        </td>
      </tr>
    `).join('');

    const emptyRow = ex.series.length === 0
      ? `<tr><td colspan="4" style="color:#666; font-size:0.82rem; text-align:center;">Sin series</td></tr>`
      : '';

    return `
      <div style="margin-bottom:20px; padding:14px; background:#1a1a1a; border-radius:8px; border-left:3px solid #d32f2f;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px;">
            <h4 style="margin:0; color:#fff; font-size:1rem;">${escapeHtml(ex.name)}</h4>
            ${(() => { const mg = getMuscleGroup(ex.name); return mg ? `<span class="muscle-badge muscle-${muscleGroupToClass(mg)}">${escapeHtml(mg)}</span>` : ''; })()}
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="icon-btn edit-rename-exercise" data-ex="${exIdx}" style="font-size:0.8rem; padding:4px 10px;" title="Cambiar ejercicio">⇄ Cambiar</button>
            <button type="button" class="icon-btn edit-add-serie" data-ex="${exIdx}" style="font-size:0.8rem; padding:4px 10px;">+ Serie</button>
            <button type="button" class="icon-btn icon-btn-danger edit-delete-exercise" data-ex="${exIdx}" style="font-size:0.8rem; padding:4px 8px;">🗑</button>
          </div>
        </div>
        <table style="width:100%; margin-bottom:8px; font-size:0.85rem;">
          <thead><tr><th>Serie</th><th>Reps</th><th>Peso</th><th></th></tr></thead>
          <tbody>${seriesRows}${emptyRow}</tbody>
        </table>
        <textarea class="edit-exercise-notes" data-ex="${exIdx}" rows="2" placeholder="Notas (opcional)" style="width:100%; resize:vertical; font-size:0.82rem; color:#ccc; background:#111; border:1px solid #333; border-radius:6px; padding:6px 9px; font-family:'Oswald',sans-serif; box-sizing:border-box;">${escapeHtml(ex.notes)}</textarea>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.edit-rename-exercise').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exIdx = parseInt(btn.dataset.ex);
      const name = await showExerciseSearch('Cambiar ejercicio', editExerciseOptions);
      if (!name) return;
      editingExercises[exIdx].name = name;
      renderEditExercises();
    });
  });

  container.querySelectorAll('.edit-delete-exercise').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exIdx = parseInt(btn.dataset.ex);
      const exercise = editingExercises[exIdx];
      if (exercise.series.length > 0) {
        const confirmed = await showConfirm({
          title: 'Eliminar ejercicio',
          body: `<p style="color:#ccc;">Se eliminará <strong>${escapeHtml(exercise.name)}</strong> y sus ${exercise.series.length} serie${exercise.series.length !== 1 ? 's' : ''} de este entreno. Los cambios no se aplican hasta que pulses Guardar.</p>`,
          okText: 'Eliminar',
          danger: true,
        });
        if (!confirmed) return;
      }
      editingExercises.splice(exIdx, 1);
      renderEditExercises();
    });
  });

  container.querySelectorAll('.edit-repeat-serie').forEach(btn => {
    btn.addEventListener('click', () => {
      const ex = editingExercises[parseInt(btn.dataset.ex)];
      const src = ex.series[parseInt(btn.dataset.ser)];
      ex.series.push({ sets: src.sets, reps: src.reps, weight: src.weight });
      renderEditExercises();
    });
  });

  container.querySelectorAll('.edit-delete-serie').forEach(btn => {
    btn.addEventListener('click', () => {
      editingExercises[parseInt(btn.dataset.ex)].series.splice(parseInt(btn.dataset.ser), 1);
      renderEditExercises();
    });
  });

  container.querySelectorAll('.edit-add-serie').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exIdx = parseInt(btn.dataset.ex);
      const result = await showSerieForm(editingExercises[exIdx].series.length + 1);
      if (!result) return;
      if (isNaN(result.reps) || result.reps <= 0) { showAlert('Error', 'Repeticiones inválidas'); return; }
      editingExercises[exIdx].series.push({ sets: 1, reps: result.reps, weight: result.weight });
      renderEditExercises();
    });
  });

  container.querySelectorAll('.edit-exercise-notes').forEach(ta => {
    ta.addEventListener('input', () => {
      editingExercises[parseInt(ta.dataset.ex)].notes = ta.value;
    });
  });
}

function positionEditDropdown() {
  const rect = editExerciseInput.getBoundingClientRect();
  Object.assign(editExerciseDropdown.style, {
    position: 'fixed',
    top: rect.bottom + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    right: 'auto',
    zIndex: '9999',
    borderTop: '2px solid #ff0000'
  });
}

editExerciseInput.addEventListener('input', () => {
  const query = editExerciseInput.value.trim();
  if (!query) { editExerciseDropdown.classList.add('hidden'); return; }

  const lower = query.toLowerCase();
  const matches = editExerciseOptions.filter(n => n.toLowerCase().includes(lower));
  const exactMatch = editExerciseOptions.some(n => n.toLowerCase() === lower);

  let html = matches.map(n =>
    `<div class="dropdown-item" data-name="${escapeHtml(n)}">${escapeHtml(n)}</div>`
  ).join('');
  if (!exactMatch) {
    const cap = query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    html += `<div class="dropdown-item dropdown-item-new" data-name="${escapeHtml(cap)}">+ Añadir: ${escapeHtml(cap)}</div>`;
  }

  if (html) {
    editExerciseDropdown.innerHTML = html;
    editExerciseDropdown.classList.remove('hidden');
    positionEditDropdown();
    editExerciseDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        const name = item.dataset.name;
        const isNew = item.classList.contains('dropdown-item-new');
        editExerciseDropdown.classList.add('hidden');
        editExerciseInput.value = '';

        if (editingExercises.some(ex => ex.name.toLowerCase() === name.toLowerCase())) {
          await showAlert('Duplicado', `"${name}" ya está en este entreno`);
          return;
        }

        if (isNew) {
          const muscleGroup = await showMuscleGroupSelect(MUSCLE_GROUPS);
          if (!muscleGroup) return;
          try {
            const res = await fetch('/api/exercises', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, muscle_group: muscleGroup }),
            });
            if (!res.ok) throw new Error('Error al guardar el ejercicio');
          } catch (err) {
            showToast('Error al crear el ejercicio: ' + err.message, 'error');
            return;
          }
          editExerciseOptions.push(name);
          exercisesMuscleData[name] = muscleGroup;
        }

        const result = await showSerieForm(1);
        if (!result) return;
        editingExercises.push({ name, series: [{ sets: 1, reps: result.reps, weight: result.weight }], notes: '' });
        renderEditExercises();
        showToast(`"${name}" añadido al entreno`, 'success');
      });
    });
  } else {
    editExerciseDropdown.classList.add('hidden');
  }
});

editExerciseInput.addEventListener('blur', () => {
  setTimeout(() => editExerciseDropdown.classList.add('hidden'), 150);
});

document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
editModalOverlay.addEventListener('click', closeEditModal);

document.getElementById('edit-modal-save').addEventListener('click', async () => {
  const newDate = document.getElementById('edit-session-date').value;
  if (!newDate) { await showAlert('Error', 'Selecciona una fecha'); return; }
  if (editingExercises.length === 0) { await showAlert('Error', 'El entreno debe tener al menos un ejercicio'); return; }

  const withoutSeries = editingExercises.find(ex => ex.series.length === 0);
  if (withoutSeries) { await showAlert('Error', `"${withoutSeries.name}" no tiene series`); return; }

  const saveBtn = document.getElementById('edit-modal-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Guardando...';

  try {
    const ids = allSessions.filter(s => (s.batch_id || `${s.date}-${s.id}`) === editingBatchId).map(s => s.id);
    for (const id of ids) {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    }

    for (const exercise of editingExercises) {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, exercise: exercise.name, notes: exercise.notes || '', batch_id: editingBatchId })
      });
      if (!sessionRes.ok) throw new Error('Error al guardar ejercicio');
      const newSession = await sessionRes.json();

      for (const serie of exercise.series) {
        await fetch(`/api/sessions/${newSession.id}/series`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serie)
        });
      }
    }

    closeEditModal();
    loadStats();
  } catch (err) {
    showAlert('Error', err.message);
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar cambios';
  }
});

loadStats();
