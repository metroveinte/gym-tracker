let allSessions = [];
let currentFilter = 'all';
let sessionsChart = null;
let progressChart = null;
let topExercisesChart = null;

async function loadStats() {
  try {
    allSessions = await fetch('/api/sessions').then(r => r.json());
    setupFilterButtons();
    loadExerciseSelect();
    updateStats();
  } catch (error) {
    console.error('Error loading stats:', error);
  }
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

function setupFilterButtons() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      updateStats();
    });
  });

  const monthSelect = document.getElementById('month-select');
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

  sortedMonths.forEach(m => {
    const option = document.createElement('option');
    option.value = `month-${m.year}-${m.month}`;
    option.textContent = m.label.charAt(0).toUpperCase() + m.label.slice(1);
    monthSelect.appendChild(option);
  });

  monthSelect.addEventListener('change', () => {
    if (monthSelect.value) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      currentFilter = monthSelect.value;
      updateStats();
    }
  });
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
  const totalVolume = calculateVolume(filtered);
  const streakDays = calculateStreak(filtered);
  const topExercise = findTopExercise(filtered);

  document.getElementById('total-sessions').textContent = totalSessions;
  document.getElementById('unique-exercises').textContent = uniqueExercises;
  document.getElementById('total-series').textContent = totalSeries;
  document.getElementById('total-volume').textContent = totalVolume.toFixed(1);
  document.getElementById('streak-days').textContent = streakDays;
  document.getElementById('top-exercise').textContent = topExercise || '-';

  renderHistory(filtered);
  renderSessionsChart(filtered);
  renderProgressChart(filtered);
  renderTopExercisesChart(filtered);
}

function calculateVolume(sessions) {
  return sessions.reduce((total, session) => {
    if (!session.series) return total;
    return total + session.series.reduce((sum, serie) => {
      const weight = serie.weight || 0;
      const reps = serie.reps || 0;
      return sum + (weight * reps);
    }, 0);
  }, 0);
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

function findTopExercise(sessions) {
  const exerciseCounts = new Map();

  sessions.forEach(session => {
    const count = exerciseCounts.get(session.exercise) || 0;
    exerciseCounts.set(session.exercise, count + 1);
  });

  if (exerciseCounts.size === 0) return null;

  let topExercise = null;
  let maxCount = 0;

  for (const [exercise, count] of exerciseCounts) {
    if (count > maxCount) {
      maxCount = count;
      topExercise = exercise;
    }
  }

  return topExercise;
}

function renderHistory(sessions) {
  const body = document.getElementById('sessions-body');
  const noRecords = document.getElementById('no-records');

  if (!sessions || sessions.length === 0) {
    body.innerHTML = '';
    noRecords.style.display = 'block';
    return;
  }

  noRecords.style.display = 'none';
  body.innerHTML = sessions.map(session => {
    const seriesCount = session.series ? session.series.length : 0;
    const reps = session.series ? session.series.map(s => s.reps).join(', ') : '-';
    const weights = session.series ? session.series.map(s => formatValue(s.weight)).join(', ') : '-';

    return `
      <tr>
        <td>${escapeHtml(session.date)}</td>
        <td>${escapeHtml(session.exercise)}</td>
        <td>${escapeHtml(seriesCount)}</td>
        <td>${escapeHtml(reps)}</td>
        <td>${escapeHtml(weights)}</td>
        <td>${escapeHtml(formatValue(session.notes))}</td>
      </tr>
    `;
  }).join('');
}

function renderSessionsChart(sessions) {
  const ctx = document.getElementById('sessionsChart').getContext('2d');

  const weeksMap = new Map();
  sessions.forEach(session => {
    const date = new Date(session.date);
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekKey = weekStart.toISOString().split('T')[0];

    weeksMap.set(weekKey, (weeksMap.get(weekKey) || 0) + 1);
  });

  const sortedWeeks = Array.from(weeksMap.keys()).sort();
  const labels = sortedWeeks.map(week => {
    const date = new Date(week);
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
  });
  const data = sortedWeeks.map(week => weeksMap.get(week));

  if (sessionsChart) {
    sessionsChart.destroy();
  }

  sessionsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Sesiones',
          data: data,
          backgroundColor: '#ff0000',
          borderColor: '#cc0000',
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

  const csvContent = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
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

loadStats();
