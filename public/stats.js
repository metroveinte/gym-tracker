// stats.js - Estadísticas básicas y tabla histórica
async function loadStats() {
  try {
    const sessions = await fetch('/api/sessions').then(r => r.json());
    const totalSessions = sessions.length;
    const uniqueExercises = new Set(sessions.map(s => s.exercise)).size;
    const totalSeries = sessions.reduce((sum, s) => sum + (s.series ? s.series.length : 0), 0);

    document.getElementById('total-sessions').textContent = totalSessions;
    document.getElementById('unique-exercises').textContent = uniqueExercises;
    document.getElementById('total-series').textContent = totalSeries;

    renderHistory(sessions);
  } catch (error) {
    console.error('Error loading stats:', error);
  }
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
    const sessions = await fetch('/api/sessions').then(r => r.json());
    downloadCsv(sessions);
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
});

loadStats();