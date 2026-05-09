const form = document.getElementById('session-form');
const sessionsBody = document.getElementById('sessions-body');
const exportButton = document.getElementById('export-button');
const messageDiv = document.getElementById('message');
const addSeriesBtn = document.getElementById('add-series-btn');
const seriesContainer = document.getElementById('series-container');

let currentSeries = [];
let currentSessionId = null;

async function fetchSessions() {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) throw new Error('Error al cargar sesiones');
    return await response.json();
  } catch (error) {
    showMessage('Error al cargar sesiones: ' + error.message, 'error');
    return [];
  }
}

function showMessage(text, type = 'error') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');
  setTimeout(() => messageDiv.classList.add('hidden'), 5000);
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

function renderSeriesTable() {
  if (currentSeries.length === 0) {
    seriesContainer.innerHTML = '<p style="color: #999; text-align: center;">Agrega series a continuación</p>';
    return;
  }

  let html = '<table style="width: 100%; margin-bottom: 15px;"><thead><tr><th>Sets</th><th>Reps</th><th>Peso (kg)</th><th>Acción</th></tr></thead><tbody>';
  currentSeries.forEach((serie, idx) => {
    html += `
      <tr>
        <td>${serie.sets}</td>
        <td>${serie.reps}</td>
        <td>${formatValue(serie.weight)}</td>
        <td><button class="delete-serie-btn" data-idx="${idx}" style="padding: 5px 10px; font-size: 0.85rem;">Eliminar</button></td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  seriesContainer.innerHTML = html;

  // Agregar event listeners a los botones de eliminar
  document.querySelectorAll('.delete-serie-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentSeries.splice(idx, 1);
      renderSeriesTable();
    });
  });
}

addSeriesBtn.addEventListener('click', () => {
  const sets = prompt('Series (número):');
  if (!sets) return;
  
  const setsNum = parseInt(sets, 10);
  if (isNaN(setsNum) || setsNum <= 0) {
    showMessage('Series debe ser un número positivo', 'error');
    return;
  }

  const reps = prompt('Repeticiones (número):');
  if (!reps) return;
  
  const repsNum = parseInt(reps, 10);
  if (isNaN(repsNum) || repsNum <= 0) {
    showMessage('Repeticiones debe ser un número positivo', 'error');
    return;
  }

  const weight = prompt('Peso en kg (opcional):');
  let weightNum = null;
  if (weight) {
    weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum < 0) {
      showMessage('Peso debe ser un número positivo o nulo', 'error');
      return;
    }
  }

  currentSeries.push({ sets: setsNum, reps: repsNum, weight: weightNum });
  renderSeriesTable();
});

function renderSessions(sessions) {
  if (sessions.length === 0) {
    sessionsBody.innerHTML = '<tr><td colspan="7">No hay registros todavía.</td></tr>';
    return;
  }
  sessionsBody.innerHTML = sessions
    .map((session) => {
      let sets = '-', reps = '-', weight = '-';
      if (session.series && session.series.length > 0) {
        sets = session.series[0].sets;
        reps = session.series[0].reps;
        weight = formatValue(session.series[0].weight);
      }
      return `
        <tr>
          <td>${session.date}</td>
          <td>${session.exercise}</td>
          <td>${sets}</td>
          <td>${reps}</td>
          <td>${weight}</td>
          <td>${formatValue(session.notes)}</td>
          <td><button class="delete-button" data-id="${session.id}">Eliminar</button></td>
        </tr>`;
    })
    .join('');
}

async function loadSessions() {
  const sessions = await fetchSessions();
  renderSessions(sessions);
}

async function saveSession() {
  const date = document.getElementById('date').value;
  const exercise = document.getElementById('exercise').value.trim();
  const notes = document.getElementById('notes').value.trim();

  if (!date || !exercise) {
    showMessage('Completa fecha y ejercicio antes de guardar.');
    return;
  }

  if (currentSeries.length === 0) {
    showMessage('Agrega al menos una serie antes de guardar.');
    return;
  }

  try {
    // Guardar sesión
    const sessionRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, exercise, notes }),
    });

    if (!sessionRes.ok) {
      const error = await sessionRes.json();
      throw new Error(error.error || 'Error al guardar');
    }

    const session = await sessionRes.json();
    currentSessionId = session.id;

    // Guardar series
    for (const serie of currentSeries) {
      const serieRes = await fetch(`/api/sessions/${session.id}/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serie),
      });

      if (!serieRes.ok) {
        const error = await serieRes.json();
        throw new Error(error.error || 'Error al guardar serie');
      }
    }

    showMessage('Sesión guardada correctamente', 'success');
    form.reset();
    currentSeries = [];
    renderSeriesTable();
    await loadSessions();
  } catch (error) {
    showMessage('Error al guardar sesión: ' + error.message, 'error');
  }
}

async function deleteSession(id) {
  try {
    const response = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al eliminar');
    }
    showMessage('Sesión eliminada correctamente', 'success');
    await loadSessions();
  } catch (error) {
    showMessage('Error al eliminar sesión: ' + error.message, 'error');
  }
}

// Agregar evento al form (cambiar a guardar sesión sin submit por defecto)
form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSession();
});

// Agregar evento para el botón de guardar (lo agregamos dinámicamente)
const saveBtn = document.createElement('button');
saveBtn.type = 'button';
saveBtn.textContent = 'GUARDAR SESIÓN';
saveBtn.style.marginTop = '20px';
saveBtn.className = 'btn-primary';
saveBtn.addEventListener('click', saveSession);
form.appendChild(saveBtn);

sessionsBody.addEventListener('click', async (event) => {
  if (event.target.matches('.delete-button')) {
    const id = event.target.dataset.id;
    if (confirm('¿Eliminar esta sesión?')) {
      await deleteSession(id);
    }
  }
});

exportButton.addEventListener('click', () => {
  window.location.href = '/api/export/csv';
});

// Inicializar
renderSeriesTable();
loadSessions();
