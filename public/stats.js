let allSessions = [];
let currentFilter = 'all';
let progressChart = null;
let topExercisesChart = null;
let muscleGroupChart = null;

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

  const totalSessions = filtered.length;
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
  sessions.forEach(session => {
    if (!groups.has(session.date)) groups.set(session.date, []);
    groups.get(session.date).push(session);
  });
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, daySessions]) => ({ date, daySessions }));
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
      <tr data-date="${escapeHtml(date)}" data-session-ids="${escapeHtml(sessionIds)}">
        <td><input type="checkbox" class="session-checkbox" title="Seleccionar"></td>
        <td>${displayDate}</td>
        <td>${badges}</td>
        <td style="text-align:center;">${exerciseCount}</td>
        <td style="text-align:center;">${totalSeries}</td>
        <td><button class="btn-ver-entreno" data-date="${escapeHtml(date)}">Ver entreno</button></td>
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
    btn.addEventListener('click', () => openWorkoutModal(btn.dataset.date, sessions));
  });
}

function openWorkoutModal(date, sessions) {
  const daySessions = sessions.filter(s => s.date === date);
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
          backgroundColor: [
            '#ff0000',
            '#ff3333',
            '#ff6666',
            '#ff9999',
            '#ffcccc'
          ],
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

  const ctx = document.getElementById('muscleGroupChart').getContext('2d');

  if (muscleGroupChart) {
    muscleGroupChart.destroy();
  }

  const colors = [
    '#ff0000', '#ff3333', '#ff6666', '#ff9999',
    '#ffcccc', '#cc0000', '#aa0000', '#880000'
  ];

  muscleGroupChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: colors.slice(0, labels.length),
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
  const dates = getSelectedDates();
  if (dates.length === 0) return;
  if (dates.length > 1) { alert('Solo puedes editar una fecha a la vez'); return; }

  const date = dates[0];
  const newDate = prompt('Nueva fecha (YYYY-MM-DD):', date);
  if (!newDate) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { alert('Formato inválido. Usa YYYY-MM-DD'); return; }

  const daySessions = allSessions.filter(s => s.date === date);
  try {
    for (const session of daySessions) {
      const del = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (!del.ok) throw new Error('Error al borrar sesión');

      const create = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, exercise: session.exercise, notes: session.notes || '' })
      });
      if (!create.ok) throw new Error('Error al crear sesión');
      const newSession = await create.json();

      for (const serie of session.series) {
        await fetch(`/api/sessions/${newSession.id}/series`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serie)
        });
      }
    }
    alert('✓ Fecha editada correctamente');
    loadStats();
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

document.getElementById('delete-selected-btn').addEventListener('click', async () => {
  const dates = getSelectedDates();
  if (dates.length === 0) return;
  const ids = getSelectedSessionIds();
  const ok = confirm(`¿Borrar el entreno de ${dates.length} día(s)? Se eliminarán ${ids.length} ejercicio(s).`);
  if (!ok) return;
  try {
    for (const id of ids) {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    alert('✓ Entreno(s) borrado(s)');
    loadStats();
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

document.getElementById('workout-modal-close').addEventListener('click', closeWorkoutModal);
document.getElementById('workout-modal-overlay').addEventListener('click', closeWorkoutModal);

document.getElementById('delete-all-btn').addEventListener('click', async () => {
  const first = confirm(
    '⚠ BORRADO COMPLETO\n\n' +
    'Esta acción eliminará TODAS las sesiones registradas.\n\n' +
    'Los ejercicios no se verán afectados.\n\n' +
    '¿Estás seguro de continuar?'
  );
  if (!first) return;

  const second = confirm(
    '⚠ CONFIRMACIÓN FINAL\n\n' +
    'Todos los registros de sesiones serán eliminados permanentemente. Esta acción no se puede deshacer.\n\n' +
    '¿Confirmar borrado completo?'
  );
  if (!second) return;

  try {
    for (const session of allSessions) {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al borrar');
    }
    alert('✓ Historial completamente limpio');
    loadStats();
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

loadStats();
