const form = document.getElementById('session-form');
const messageDiv = document.getElementById('message');
const exerciseInput = document.getElementById('exercise-input');
const exerciseDropdown = document.getElementById('exercise-dropdown');
const exerciseSelector = document.querySelector('.exercise-selector');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const saveSessionBtn = document.getElementById('save-session-btn');
const exercisesContainer = document.getElementById('exercises-container');

const PREDEFINED_EXERCISES = [
  'Press de banca',
  'Press inclinado con mancuernas',
  'Fondos en paralelas',
  'Aperturas con mancuernas',
  'Cruce de poleas',
  'Dominadas',
  'Jalón al pecho',
  'Remo con barra',
  'Remo con mancuerna',
  'Peso muerto',
  'Press militar',
  'Elevaciones laterales',
  'Pájaros',
  'Face pulls',
  'Sentadilla',
  'Prensa de piernas',
  'Peso muerto rumano',
  'Zancadas',
  'Hip thrust',
  'Curl femoral',
  'Extensión de cuádriceps',
  'Elevación de gemelos',
  'Curl con barra',
  'Curl martillo',
  'Curl en banco inclinado',
  'Curl en polea',
  'Press francés',
  'Extensión de tríceps en polea',
  'Fondos para tríceps',
  'Extensión por encima de la cabeza',
  'Crunch abdominal',
  'Elevaciones de piernas',
  'Plancha',
  'Rueda abdominal'
];

let currentExercises = [];
let availableExercises = [...PREDEFINED_EXERCISES];

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

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function filterExercises(query) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    exerciseDropdown.classList.add('hidden');
    return;
  }

  const filtered = availableExercises.filter(ex =>
    ex.toLowerCase().includes(normalized)
  );

  let html = '';
  filtered.forEach(ex => {
    html += `<div class="dropdown-item" data-exercise="${escapeHtml(ex)}">${escapeHtml(ex)}</div>`;
  });

  const exactMatch = availableExercises.some(ex => ex.toLowerCase() === normalized);
  if (!exactMatch && normalized.length > 0) {
    html += `<div class="dropdown-item dropdown-item-new" data-exercise="${escapeHtml(normalized)}">+ Agregar nuevo: ${escapeHtml(normalized)}</div>`;
  }

  if (html) {
    exerciseDropdown.innerHTML = html;
    exerciseDropdown.classList.remove('hidden');

    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const exercise = e.currentTarget.dataset.exercise;
        selectExercise(exercise);
      });
    });
  } else {
    exerciseDropdown.classList.add('hidden');
  }
}

function selectExercise(exerciseName) {
  const normalized = exerciseName.trim();
  if (!normalized) {
    showMessage('Ingresa un nombre de ejercicio válido.', 'error');
    return;
  }

  const alreadyAdded = currentExercises.some(ex => ex.name.toLowerCase() === normalized.toLowerCase());
  if (alreadyAdded) {
    showMessage('Ese ejercicio ya está en la sesión.', 'error');
    return;
  }

  if (!availableExercises.includes(normalized) && !availableExercises.some(ex => ex.toLowerCase() === normalized.toLowerCase())) {
    availableExercises.push(normalized);
  }

  currentExercises.push({ name: normalized, series: [] });
  renderExercises();
  exerciseInput.value = '';
  exerciseDropdown.classList.add('hidden');
  exerciseSelector.classList.add('hidden');
  showMessage(`Ejercicio "${normalized}" agregado. Ahora agrega series.`, 'success');
}

async function loadExerciseOptions() {
  try {
    const response = await fetch('/api/exercises');
    const exercises = await response.json();
    exercises.forEach(ex => {
      if (!availableExercises.includes(ex)) {
        availableExercises.push(ex);
      }
    });
  } catch (error) {
    console.error('Error cargando ejercicios:', error);
  }
}

function addExerciseToList(exerciseName) {
  const normalized = exerciseName.trim();
  if (!normalized) {
    showMessage('Ingresa un nombre de ejercicio válido.', 'error');
    return;
  }

  const alreadyAdded = currentExercises.some(ex => ex.name.toLowerCase() === normalized.toLowerCase());
  if (alreadyAdded) {
    showMessage('Ese ejercicio ya está en la sesión.', 'error');
    return;
  }

  currentExercises.push({ name: normalized, series: [] });
  if (!availableExercises.some(ex => ex.toLowerCase() === normalized.toLowerCase())) {
    availableExercises.push(normalized);
    syncExerciseOptions();
  }

  renderExercises();
  exerciseInput.value = '';
  exerciseInput.focus();
  showMessage(`Ejercicio "${normalized}" agregado. Ahora agrega series.`, 'success');
}

function addExerciseFromInput() {
  const exerciseName = exerciseInput.value;
  if (!exerciseName || !exerciseName.trim()) {
    showMessage('Escribe o selecciona un ejercicio antes de agregar.', 'error');
    return;
  }

  addExerciseToList(exerciseName);
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
          <h4 style="margin: 0; color: #fff;">${escapeHtml(exercise.name)}</h4>
          <div style="display: flex; gap: 10px;">
            <button class="add-serie-to-exercise" data-idx="${exIdx}" style="padding: 8px 12px; font-size: 0.9rem;">+ Agregar Serie</button>
            <button class="delete-exercise-btn" data-idx="${exIdx}" style="padding: 5px 10px; font-size: 0.85rem;">Eliminar Ejercicio</button>
          </div>
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
          <td>${escapeHtml(serie.reps)}</td>
          <td>${escapeHtml(formatValue(serie.weight))}</td>
          <td class="row-actions">
            <button type="button" class="icon-btn repeat-serie-btn" data-ex="${exIdx}" data-ser="${serieIdx}" title="Repetir esta serie" aria-label="Repetir esta serie">🔁 Repetir</button>
            <button type="button" class="icon-btn icon-btn-danger delete-serie-btn" data-ex="${exIdx}" data-ser="${serieIdx}" title="Eliminar esta serie" aria-label="Eliminar esta serie">🗑 Eliminar</button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
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

  document.querySelectorAll('.repeat-serie-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const exIdx = parseInt(e.currentTarget.dataset.ex);
      const serIdx = parseInt(e.currentTarget.dataset.ser);
      repeatSerie(exIdx, serIdx);
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

function repeatSerie(exerciseIdx, serieIdx) {
  const exercise = currentExercises[exerciseIdx];
  if (!exercise || !exercise.series[serieIdx]) {
    showMessage('No se encontró la serie para repetir.', 'error');
    return;
  }

  const source = exercise.series[serieIdx];
  exercise.series.push({ sets: source.sets, reps: source.reps, weight: source.weight });
  renderExercises();
  showMessage('Serie repetida en ' + exercise.name, 'success');
}

addExerciseBtn.addEventListener('click', () => {
  exerciseSelector.classList.remove('hidden');
  exerciseInput.focus();
  exerciseInput.value = '';
  exerciseDropdown.classList.add('hidden');
});

exerciseInput.addEventListener('input', (e) => {
  filterExercises(e.target.value);
});

exerciseInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (exerciseInput.value.trim() === '') {
      exerciseSelector.classList.add('hidden');
      exerciseDropdown.classList.add('hidden');
    }
  }, 250);
});

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
  } catch (error) {
    showMessage('Error al guardar sesión: ' + error.message, 'error');
  }
}

// Agregar evento al form
form.addEventListener('submit', (e) => {
  e.preventDefault();
});

// Agregar evento para el botón de guardar
saveSessionBtn.addEventListener('click', saveSession);

// Inicializar
loadExerciseOptions();
renderExercises();

