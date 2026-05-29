let allSessions = [];
let currentFilter = 'all';
let progressChart = null;
let topExercisesChart = null;
let muscleGroupChart = null;

const MUSCLE_COLORS = {
  'Pecho':   '#c0392b',
  'Espalda': '#2471a3',
  'Hombros': '#7d3c98',
  'Bíceps':  '#1e8449',
  'Tríceps': '#148f77',
  'Piernas': '#ca6f1e',
  'Glúteos': '#d35400',
  'Core':    '#616a6b'
};

function muscleGroupColor(mg) {
  return MUSCLE_COLORS[mg] || '#555555';
}

const EXERCISE_MUSCLE_MAP = {
  'Press de banca': 'Pecho',
  'Press inclinado con mancuernas': 'Pecho',
  'Fondos en paralelas': 'Pecho',
  'Aperturas con mancuernas': 'Pecho',
  'Cruce de poleas': 'Pecho',
  'Dominadas': 'Espalda',
  'Jalón al pecho': 'Espalda',
  'Remo con barra': 'Espalda',
  'Remo con mancuerna': 'Espalda',
  'Peso muerto': 'Espalda',
  'Press militar': 'Hombros',
  'Elevaciones laterales': 'Hombros',
  'Pájaros': 'Hombros',
  'Face pulls': 'Hombros',
  'Sentadilla': 'Piernas',
  'Prensa de piernas': 'Piernas',
  'Peso muerto rumano': 'Piernas',
  'Zancadas': 'Piernas',
  'Hip thrust': 'Glúteos',
  'Curl femoral': 'Piernas',
  'Extensión de cuádriceps': 'Piernas',
  'Elevación de gemelos': 'Piernas',
  'Curl con barra': 'Bíceps',
  'Curl martillo': 'Bíceps',
  'Curl en banco inclinado': 'Bíceps',
  'Curl en polea': 'Bíceps',
  'Press francés': 'Tríceps',
  'Extensión de tríceps en polea': 'Tríceps',
  'Fondos para tríceps': 'Tríceps',
  'Extensión por encima de la cabeza': 'Tríceps',
  'Crunch abdominal': 'Core',
  'Elevaciones de piernas': 'Core',
  'Plancha': 'Core',
  'Rueda abdominal': 'Core'
};

let exercisesMuscleData = {};

async function loadStats() {
  try {
    allSessions = await fetch('/api/sessions').then(r => r.json());
    const exercisesRes = await fetch('/api/exercises').then(r => r.json());

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

  document.getElementById('total-sessions').textContent = totalSessions;
  document.getElementById('unique-exercises').textContent = uniqueExercises;
  document.getElementById('total-series').textContent = totalSeries;
  document.getElementById('streak-days').textContent = streakDays;
  document.getElementById('top-muscle').textContent = topMuscle || '-';

  renderHistory(filtered);
  renderProgressChart(filtered);
  renderTopExercisesChart(filtered);
  renderMuscleGroupChart(filtered);
}

function calculateStreak(sessions) {
  if (sessions.length === 0) return 0;

  const dates = sessions.map(s => new Date(s.date));
  dates.sort((a, b) => b - a);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let currentDate = new Date(today);

  for (const date of dates) {
    date.setHours(0, 0, 0, 0);
    if (date.getTime() === currentDate.getTime()) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (date.getTime() < currentDate.getTime()) {
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

function muscleGroupToClass(mg) {
  const map = { 'Pecho':'pecho','Espalda':'espalda','Hombros':'hombros','Bíceps':'biceps','Tríceps':'triceps','Piernas':'piernas','Glúteos':'gluteos','Core':'core' };
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
  const body = document.getElementById('sessions-body');
  const noRecords = document.getElementById('no-records');

  if (!sessions || sessions.length === 0) {
    body.innerHTML = '';
    noRecords.style.display = 'block';
    updateSelectionUI();
    return;
  }

  noRecords.style.display = 'none';
  const groups = groupSessionsByDate(sessions);

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
            <td>${s.weight != null ? s.weight + ' kg' : '-'}</td>
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

function renderProgressChart(sessions = null) {
  const filtered = sessions || getFilteredSessions();
  const exerciseSelect = document.getElementById('exercise-select');
  const selectedExercise = exerciseSelect.value;

  let exerciseSessions = filtered.filter(s => !selectedExercise || s.exercise === selectedExercise);

  if (exerciseSessions.length === 0) {
    exerciseSessions = filtered;
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
  const exerciseCounts = new Map();

  sessions.forEach(session => {
    const count = exerciseCounts.get(session.exercise) || 0;
    exerciseCounts.set(session.exercise, count + 1);
  });

  const sorted = Array.from(exerciseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const labels = sorted.map(e => e[0]);
  const data = sorted.map(e => e[1]);
  const backgroundColors = sorted.map(e => muscleGroupColor(getMuscleGroup(e[0])));

  const ctx = document.getElementById('topExercisesChart').getContext('2d');

  if (topExercisesChart) {
    topExercisesChart.destroy();
  }

  topExercisesChart = new Chart(ctx, {
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
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: '#ffffff' }
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
      const count = muscleCounts.get(muscle) || 0;
      muscleCounts.set(muscle, count + 1);
    }
  });

  const total = Array.from(muscleCounts.values()).reduce((a, b) => a + b, 0);

  const sorted = Array.from(muscleCounts.entries())
    .sort((a, b) => b[1] - a[1]);

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
      maintainAspectRatio: true,
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
  try {
    for (const id of ids) {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    loadStats();
  } catch (error) {
    showAlert('Error', error.message);
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

  try {
    for (const session of allSessions) {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    loadStats();
  } catch (error) {
    showAlert('Error', error.message);
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
        <td>${s.weight != null ? s.weight : '-'}</td>
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
          <h4 style="margin:0; color:#fff; font-size:1rem;">${escapeHtml(ex.name)}</h4>
          <div style="display:flex; gap:8px;">
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

  container.querySelectorAll('.edit-delete-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      editingExercises.splice(parseInt(btn.dataset.ex), 1);
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
        editExerciseDropdown.classList.add('hidden');
        editExerciseInput.value = '';

        if (editingExercises.some(ex => ex.name.toLowerCase() === name.toLowerCase())) {
          await showAlert('Duplicado', `"${name}" ya está en este entreno`);
          return;
        }

        const result = await showSerieForm(1);
        if (!result) return;
        editingExercises.push({ name, series: [{ sets: 1, reps: result.reps, weight: result.weight }], notes: '' });
        renderEditExercises();
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
