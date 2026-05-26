const form = document.getElementById('session-form');
const messageDiv = document.getElementById('message');
const exerciseInput = document.getElementById('exercise-input');
const exerciseDropdown = document.getElementById('exercise-dropdown');
const addExerciseBtn = document.getElementById('add-exercise-btn');
const saveSessionBtn = document.getElementById('save-session-btn');
const exercisesContainer = document.getElementById('exercises-container');

// Modal elements
const modal = document.getElementById('exercise-modal');
const modalOverlay = document.getElementById('modal-overlay');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const firstSerieForm = document.getElementById('first-serie-form');
const firstRepsInput = document.getElementById('first-reps');
const firstWeightInput = document.getElementById('first-weight');

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

const PREDEFINED_EXERCISES = Object.keys(EXERCISE_MUSCLE_MAP);
const MUSCLE_GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Piernas', 'Glúteos', 'Core'];

let currentExercises = [];
let availableExercises = [...PREDEFINED_EXERCISES];
let selectedExerciseForModal = null;
let selectedMuscleGroup = null;
let isNewExercise = false;

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

function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

function openModal() {
  modal.classList.remove('hidden');
  modalOverlay.classList.remove('hidden');
  exerciseInput.value = '';
  exerciseInput.focus();
  exerciseDropdown.classList.add('hidden');
  firstSerieForm.classList.add('hidden');
  selectedExerciseForModal = null;
  selectedMuscleGroup = null;
  isNewExercise = false;
  firstRepsInput.value = '';
  firstWeightInput.value = '';
  modalConfirmBtn.disabled = true;
}

function closeModal() {
  modal.classList.add('hidden');
  modalOverlay.classList.add('hidden');
  exerciseInput.value = '';
  exerciseDropdown.classList.add('hidden');
  firstSerieForm.classList.add('hidden');
  selectedExerciseForModal = null;
  selectedMuscleGroup = null;
  isNewExercise = false;
  firstRepsInput.value = '';
  firstWeightInput.value = '';
  modalConfirmBtn.disabled = true;
}

function updateModalConfirmButton() {
  if (selectedExerciseForModal && firstRepsInput.value) {
    if (isNewExercise && !selectedMuscleGroup) {
      modalConfirmBtn.disabled = true;
    } else {
      modalConfirmBtn.disabled = false;
    }
  } else {
    modalConfirmBtn.disabled = true;
  }
}

function filterExercises(query) {
  const normalized = query.toLowerCase().trim();
  if (!normalized) {
    exerciseDropdown.classList.add('hidden');
    return;
  }

  // Asegurar que availableExercises contiene strings, no objetos
  const cleanExercises = availableExercises.map(ex => {
    if (typeof ex === 'object' && ex.name) return ex.name;
    return String(ex || '');
  }).filter(ex => ex.trim());

  const filtered = cleanExercises.filter(ex =>
    ex.toLowerCase().includes(normalized)
  );

  let html = '';
  filtered.forEach(ex => {
    html += `<div class="dropdown-item" data-exercise="${escapeHtml(ex)}">${escapeHtml(ex)}</div>`;
  });

  const exactMatch = cleanExercises.some(ex => ex.toLowerCase() === normalized);
  if (!exactMatch && normalized.length > 0) {
    const capitalizedInput = query.trim().split(' ').map(word => capitalizeFirstLetter(word)).join(' ');
    html += `<div class="dropdown-item dropdown-item-new" data-exercise="${escapeHtml(capitalizedInput)}">+ Agregar nuevo: ${escapeHtml(capitalizedInput)}</div>`;
  }

  if (html) {
    exerciseDropdown.innerHTML = html;
    exerciseDropdown.classList.remove('hidden');

    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const exercise = e.currentTarget.dataset.exercise;
        selectExerciseInModal(exercise);
      });
    });
  } else {
    exerciseDropdown.classList.add('hidden');
  }
}

function selectExerciseInModal(exerciseName) {
  const exerciseNameTrimmed = exerciseName.trim();
  if (!exerciseNameTrimmed) {
    showMessage('Ingresa un nombre de ejercicio válido.', 'error');
    return;
  }

  // Check if already added
  const alreadyAdded = currentExercises.some(ex => ex.name.toLowerCase() === exerciseNameTrimmed.toLowerCase());
  if (alreadyAdded) {
    showMessage('Ese ejercicio ya está en la sesión.', 'error');
    return;
  }

  // Determine if it's a new exercise
  isNewExercise = !EXERCISE_MUSCLE_MAP[exerciseNameTrimmed];

  if (isNewExercise) {
    // Pedir grupo muscular para nuevo ejercicio
    const muscleSelect = document.createElement('div');
    muscleSelect.id = 'new-muscle-group-select';
    muscleSelect.style.marginBottom = '15px';
    muscleSelect.innerHTML = `
      <label for="muscle-group-select" style="display:block; margin-bottom:8px; color:#fff; font-weight:600;">Grupo muscular del nuevo ejercicio:</label>
      <select id="muscle-group-select" style="width:100%; padding:10px; border:2px solid #444; background:#1a1a1a; color:#fff; border-radius:8px; font-family:'Oswald', sans-serif; cursor:pointer;">
        <option value="">Seleccionar...</option>
        ${MUSCLE_GROUPS.map(mg => `<option value="${mg}">${mg}</option>`).join('')}
      </select>
    `;

    // Insert before firstSerieForm
    if (document.getElementById('new-muscle-group-select')) {
      document.getElementById('new-muscle-group-select').remove();
    }
    firstSerieForm.parentNode.insertBefore(muscleSelect, firstSerieForm);

    const selectElem = document.getElementById('muscle-group-select');
    selectElem.addEventListener('change', (e) => {
      selectedMuscleGroup = e.target.value;
      updateModalConfirmButton();
    });
    selectElem.focus();
  } else {
    selectedMuscleGroup = EXERCISE_MUSCLE_MAP[exerciseNameTrimmed] || null;
    if (document.getElementById('new-muscle-group-select')) {
      document.getElementById('new-muscle-group-select').remove();
    }
  }

  // Add to available exercises if new
  if (!availableExercises.includes(exerciseNameTrimmed) && !availableExercises.some(ex => ex.toLowerCase() === exerciseNameTrimmed.toLowerCase())) {
    availableExercises.push(exerciseNameTrimmed);
  }

  selectedExerciseForModal = exerciseNameTrimmed;
  exerciseInput.value = exerciseNameTrimmed;
  exerciseDropdown.classList.add('hidden');
  firstSerieForm.classList.remove('hidden');
  updateModalConfirmButton();
}

async function loadExerciseOptions() {
  try {
    const response = await fetch('/api/exercises');
    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error('API devolvió datos inválidos:', data);
      return;
    }

    data.forEach(item => {
      let exerciseName = '';
      let muscleGroup = '';

      // Extraer nombre del ejercicio (puede ser string o objeto)
      if (typeof item === 'string') {
        exerciseName = item;
      } else if (typeof item === 'object' && item.name) {
        exerciseName = item.name;
        muscleGroup = item.muscle_group || '';
      }

      // Solo agregar si es un nombre válido y no está ya en la lista
      if (exerciseName && exerciseName.trim()) {
        const trimmed = exerciseName.trim();
        const exists = availableExercises.some(e => e && e.toLowerCase() === trimmed.toLowerCase());

        if (!exists) {
          availableExercises.push(trimmed);
        }

        // Actualizar mapa de grupos musculares si existe
        if (muscleGroup) {
          EXERCISE_MUSCLE_MAP[trimmed] = muscleGroup;
        }
      }
    });
  } catch (error) {
    console.error('Error cargando ejercicios:', error);
  }
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

// Modal event listeners
addExerciseBtn.addEventListener('click', () => {
  openModal();
});

modalCloseBtn.addEventListener('click', closeModal);
modalCancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

modalConfirmBtn.addEventListener('click', async () => {
  if (!selectedExerciseForModal) {
    showMessage('Selecciona un ejercicio.', 'error');
    return;
  }

  if (isNewExercise && !selectedMuscleGroup) {
    showMessage('Selecciona un grupo muscular para el nuevo ejercicio.', 'error');
    return;
  }

  const reps = parseInt(firstRepsInput.value, 10);
  if (isNaN(reps) || reps <= 0) {
    showMessage('Repeticiones debe ser un número positivo', 'error');
    return;
  }

  let weight = null;
  if (firstWeightInput.value) {
    weight = parseFloat(firstWeightInput.value);
    if (isNaN(weight) || weight < 0) {
      showMessage('Peso debe ser un número positivo', 'error');
      return;
    }
  }

  // Si es un nuevo ejercicio, guardarlo en la BD con el grupo muscular
  if (isNewExercise) {
    try {
      const exerciseRes = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedExerciseForModal, muscle_group: selectedMuscleGroup })
      });

      if (!exerciseRes.ok) {
        throw new Error('Error al guardar el ejercicio');
      }

      // Actualizar el mapeo local
      EXERCISE_MUSCLE_MAP[selectedExerciseForModal] = selectedMuscleGroup;
    } catch (error) {
      showMessage('Error al guardar ejercicio: ' + error.message, 'error');
      return;
    }
  }

  // Add exercise with first serie
  currentExercises.push({
    name: selectedExerciseForModal,
    series: [{ sets: 1, reps, weight }]
  });

  renderExercises();
  closeModal();
  showMessage(`Ejercicio "${selectedExerciseForModal}" agregado. Puedes agregar más series si es necesario.`, 'success');
});

exerciseInput.addEventListener('input', (e) => {
  filterExercises(e.target.value);
});

firstRepsInput.addEventListener('input', updateModalConfirmButton);
firstWeightInput.addEventListener('input', updateModalConfirmButton);

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

// Agregar evento para el botón de guardar
saveSessionBtn.addEventListener('click', saveSession);

// Inicializar
loadExerciseOptions();
renderExercises();
