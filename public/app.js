const form = document.getElementById('session-form');
const sessionsBody = document.getElementById('sessions-body');
const exportButton = document.getElementById('export-button');
const messageDiv = document.getElementById('message');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const saveSessionBtn = document.getElementById('save-session-btn');
const exercisesContainer = document.getElementById('exercises-container');

let currentExercises = [];
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

function renderExercises() {
  if (currentExercises.length === 0) {
    exercisesContainer.innerHTML = '<p style="color: #999; text-align: center;">Agrega ejercicios a continuación</p>';
    return;
  }

  let html = '';
  currentExercises.forEach((exercise, exIdx) => {
    html += `
      <div style="margin-bottom: 25px; padding: 15px; background: #1a1a1a; border-radius: 8px; border-left: 3px solid #d32f2f;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h4 style="margin: 0; color: #fff;">${exercise.name}</h4>
          <button class="delete-exercise-btn" data-idx="${exIdx}" style="padding: 5px 10px; font-size: 0.85rem;">Eliminar Ejercicio</button>
        </div>
        
        <table style="width: 100%; margin-bottom: 10px;">
          <thead>
            <tr>
              <th>Serie</th>
              <th>Reps</th>
              <th>Peso (kg)</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    exercise.series.forEach((serie, serieIdx) => {
      html += `
        <tr>
          <td><strong>Serie ${serieIdx + 1}</strong></td>
          <td>${serie.reps}</td>
          <td>${formatValue(serie.weight)}</td>
          <td><button class="delete-serie-btn" data-ex="${exIdx}" data-ser="${serieIdx}" style="padding: 5px 10px; font-size: 0.85rem;">Eliminar</button></td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
        <button class="add-serie-to-exercise" data-idx="${exIdx}" style="padding: 8px 12px; font-size: 0.9rem; margin-top: 10px;">+ Agregar Serie</button>
      </div>
    `;
  });
  
  exercisesContainer.innerHTML = html;

  // Event listeners para eliminar ejercicios
  document.querySelectorAll('.delete-exercise-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(e.target.dataset.idx);
      currentExercises.splice(idx, 1);
      renderExercises();
    });
  });

  // Event listeners para eliminar series
  document.querySelectorAll('.delete-serie-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const exIdx = parseInt(e.target.dataset.ex);
      const serIdx = parseInt(e.target.dataset.ser);
      currentExercises[exIdx].series.splice(serIdx, 1);
      renderExercises();
    });
  });

  // Event listeners para agregar series a cada ejercicio
  document.querySelectorAll('.add-serie-to-exercise').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const exIdx = parseInt(e.target.dataset.idx);
      addSerieToExercise(exIdx);
    });
  });
}

function addSerieToExercise(exerciseIdx) {
  const exercise = currentExercises[exerciseIdx];
  const reps = prompt('Repeticiones de la SERIE ' + (exercise.series.length + 1) + ':');
  if (reps === null) return;

  const repsNum = parseInt(reps, 10);
  if (isNaN(repsNum) || repsNum <= 0) {
    showMessage('Repeticiones debe ser un número positivo', 'error');
    return;
  }

  const weight = prompt('Peso en kg de la SERIE ' + (exercise.series.length + 1) + ' (Opcional):');
  let weightNum = null;
  if (weight) {
    weightNum = parseFloat(weight);
    if (isNaN(weightNum) || weightNum < 0) {
      showMessage('Peso debe ser un número positivo o nulo', 'error');
      return;
    }
  }

  exercise.series.push({ sets: 1, reps: repsNum, weight: weightNum });
  renderExercises();
  showMessage('Serie agregada a ' + exercise.name, 'success');
}

addExerciseBtn.addEventListener('click', () => {
  const exerciseName = prompt('Nombre del ejercicio (ej. Press de banca):');
  if (exerciseName === null || exerciseName.trim() === '') return;

  const trimmedName = exerciseName.trim();
  currentExercises.push({ name: trimmedName, series: [] });
  renderExercises();
  showMessage('Ejercicio "' + trimmedName + '" agregado. Ahora agrega series.', 'success');
});

function renderSessions(sessions) {
  if (sessions.length === 0) {
    sessionsBody.innerHTML = '<tr><td colspan="7">No hay registros todavía.</td></tr>';
    return;
  }
  sessionsBody.innerHTML = sessions
    .map((session) => {
      let seriesCount = '-', reps = '-', weight = '-';
      if (session.series && session.series.length > 0) {
        seriesCount = session.series.length;
        reps = session.series.map(s => s.reps).join(', ');
        weight = session.series.map(s => formatValue(s.weight)).join(', ');
      }
      return `
        <tr>
          <td>${session.date}</td>
          <td>${session.exercise}</td>
          <td>${seriesCount}</td>
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
  const notes = document.getElementById('notes').value.trim();

  if (!date) {
    showMessage('Completa la fecha antes de guardar.');
    return;
  }

  if (currentExercises.length === 0) {
    showMessage('Agrega al menos un ejercicio antes de guardar.');
    return;
  }

  // Validar que todos los ejercicios tengan al menos una serie
  for (const exercise of currentExercises) {
    if (exercise.series.length === 0) {
      showMessage('El ejercicio "' + exercise.name + '" no tiene series. Agrega al menos una.');
      return;
    }
  }

  // Preparar resumen para confirmación
  const summary = currentExercises.map(ex => 
    `${ex.name} (${ex.series.length} serie${ex.series.length > 1 ? 's' : ''})`
  ).join('\n');

  const confirmMessage = `Confirmar registro:\n\nFecha: ${date}\nEjercicios:\n${summary}\n\n¿Todo es correcto?`;
  
  if (!confirm(confirmMessage)) {
    showMessage('Guardado cancelado', 'error');
    return;
  }

  try {
    // Guardar una sesión por cada ejercicio
    for (const exercise of currentExercises) {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exercise: exercise.name, notes }),
      });

      if (!sessionRes.ok) {
        const error = await sessionRes.json();
        throw new Error(error.error || 'Error al guardar');
      }

      const session = await sessionRes.json();
      currentSessionId = session.id;

      // Guardar series para esta sesión
      for (const serie of exercise.series) {
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
    }

    showMessage('Sesión guardada correctamente', 'success');
    form.reset();
    currentExercises = [];
    renderExercises();
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

// Agregar evento al form
form.addEventListener('submit', (e) => {
  e.preventDefault();
});

// Agregar evento para el botón de guardar
saveSessionBtn.addEventListener('click', saveSession);

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
renderExercises();
loadSessions();

