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

const PREDEFINED_EXERCISES = Object.keys(EXERCISE_MUSCLE_MAP);
const MUSCLE_GROUPS = [
  'Pecho','Dorsal','Espalda media','Lumbar',
  'Hombros','Deltoides posterior',
  'Bíceps','Tríceps',
  'Cuádriceps','Isquiosurales','Glúteos','Gemelos',
  'Core',
];

let currentExercises = [];
let availableExercises = [...PREDEFINED_EXERCISES];
let exercisesFromAPI = {}; // {name: {muscle_group, is_predefined}}
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

function showMuscleGroupBadge(muscleGroup) {
  let badgeContainer = document.getElementById('exercise-muscle-badge');
  if (!badgeContainer) {
    badgeContainer = document.createElement('div');
    badgeContainer.id = 'exercise-muscle-badge';
    badgeContainer.style.marginTop = '8px';
    exerciseInput.parentNode.appendChild(badgeContainer);
  }
  if (muscleGroup) {
    badgeContainer.innerHTML = `<span class="muscle-badge muscle-${muscleGroupToClass(muscleGroup)}">${escapeHtml(muscleGroup)}</span>`;
    badgeContainer.style.display = 'block';
  } else {
    badgeContainer.style.display = 'none';
  }
}

function hideMuscleGroupBadge() {
  const badgeContainer = document.getElementById('exercise-muscle-badge');
  if (badgeContainer) badgeContainer.style.display = 'none';
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
  const existingMg = document.getElementById('new-muscle-group-select');
  if (existingMg) existingMg.remove();
  hideMuscleGroupBadge();
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
  const existingMg = document.getElementById('new-muscle-group-select');
  if (existingMg) existingMg.remove();
  hideMuscleGroupBadge();
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

  // Determine if exercise needs a muscle group: either doesn't exist in API or has no muscle group assigned
  const apiData = exercisesFromAPI[exerciseNameTrimmed];
  isNewExercise = !apiData || !apiData.muscle_group;

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
    selectedMuscleGroup = apiData.muscle_group || null;
    if (document.getElementById('new-muscle-group-select')) {
      document.getElementById('new-muscle-group-select').remove();
    }
    // Show muscle group badge for exercises that already have one
    showMuscleGroupBadge(apiData.muscle_group);
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

    exercisesFromAPI = {}; // Reiniciar el registro
    data.forEach(item => {
      let exerciseName = '';
      let muscleGroup = '';
      let isPredefined = 0;

      // Extraer nombre del ejercicio (puede ser string o objeto)
      if (typeof item === 'string') {
        exerciseName = item;
      } else if (typeof item === 'object' && item.name) {
        exerciseName = item.name;
        muscleGroup = item.muscle_group || '';
        isPredefined = item.is_predefined || 0;
      }

      // Solo agregar si es un nombre válido y no está ya en la lista
      if (exerciseName && exerciseName.trim()) {
        const trimmed = exerciseName.trim();
        exercisesFromAPI[trimmed] = { muscle_group: muscleGroup, is_predefined: isPredefined };

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
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <h4 style="margin: 0; color: #fff;">${escapeHtml(exercise.name)}</h4>
            ${exercise.plannedWeight ? `<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(229,48,58,.15);border:1px solid rgba(229,48,58,.4);color:var(--accent);">🎯 ${escapeHtml(exercise.plannedWeight)}</span>` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="add-serie-to-exercise" data-idx="${exIdx}" style="font-size:0.8rem; padding:4px 10px;">+ Serie</button>
            <button class="delete-exercise-btn" data-idx="${exIdx}" style="font-size:0.8rem; padding:4px 8px;" title="Eliminar ejercicio">🗑</button>
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
            <button type="button" class="icon-btn repeat-serie-btn" data-ex="${exIdx}" data-ser="${serieIdx}" title="Repetir serie">🔁</button>
            <button type="button" class="icon-btn icon-btn-danger delete-serie-btn" data-ex="${exIdx}" data-ser="${serieIdx}" title="Eliminar serie">🗑</button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <label style="display:block; margin-top:8px;">
          <textarea class="exercise-notes" data-idx="${exIdx}" rows="2" placeholder="Notas del ejercicio (opcional)" style="width:100%; resize:vertical; font-size:0.85rem; color:#ccc; background:#111; border:1px solid #333; border-radius:6px; padding:7px 10px; font-family:'Oswald',sans-serif; box-sizing:border-box;">${escapeHtml(exercise.notes || '')}</textarea>
        </label>
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

  document.querySelectorAll('.exercise-notes').forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentExercises[idx].notes = e.target.value;
    });
  });
}

async function addSerieToExercise(exerciseIdx) {
  const exercise = currentExercises[exerciseIdx];
  const result = await showSerieForm(exercise.series.length + 1);
  if (!result) return;

  const { reps, weight } = result;
  if (isNaN(reps) || reps <= 0) {
    showMessage('Repeticiones debe ser un número positivo', 'error');
    return;
  }
  if (weight !== null && (isNaN(weight) || weight < 0)) {
    showMessage('Peso debe ser un número positivo o nulo', 'error');
    return;
  }

  exercise.series.push({ sets: 1, reps, weight });
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
  const addedName = selectedExerciseForModal;
  currentExercises.push({
    name: addedName,
    series: [{ sets: 1, reps, weight }],
    notes: ''
  });

  renderExercises();
  closeModal();
  showMessage(`Ejercicio "${addedName}" agregado. Puedes agregar más series si es necesario.`, 'success');
});

exerciseInput.addEventListener('input', (e) => {
  // Reset selection state whenever user modifies the input
  selectedExerciseForModal = null;
  selectedMuscleGroup = null;
  isNewExercise = false;
  firstSerieForm.classList.add('hidden');
  firstRepsInput.value = '';
  firstWeightInput.value = '';
  modalConfirmBtn.disabled = true;
  const existingMg = document.getElementById('new-muscle-group-select');
  if (existingMg) existingMg.remove();
  hideMuscleGroupBadge();
  filterExercises(e.target.value);
});

firstRepsInput.addEventListener('input', updateModalConfirmButton);
firstWeightInput.addEventListener('input', updateModalConfirmButton);

async function saveSession() {
  const date = document.getElementById('date').value;

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

  const summary = currentExercises.map(ex =>
    `<li>${escapeHtml(ex.name)} — ${ex.series.length} serie${ex.series.length !== 1 ? 's' : ''}</li>`
  ).join('');
  const confirmed = await showConfirm({
    title: 'Confirmar sesión',
    body: `<p style="color:#ccc; margin-bottom:10px;">Fecha: <strong>${date}</strong></p><ul style="color:#ccc; padding-left:18px; margin:0;">${summary}</ul>`,
    okText: 'Guardar'
  });
  if (!confirmed) {
    showMessage('Guardado cancelado', 'error');
    return;
  }

  try {
    // Generar batch_id único para esta sesión guardada
    const batchId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Guardar una sesión por cada ejercicio
    for (const exercise of currentExercises) {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, exercise: exercise.name, notes: exercise.notes || '', batch_id: batchId }),
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

// ── Gestión de ejercicios ───────────────────────────────────────────────────

const manageModalOverlay = document.getElementById('manage-modal-overlay');
const manageModal        = document.getElementById('manage-modal');
const manageCloseBtn     = document.getElementById('manage-modal-close-btn');
const manageFilterGroup  = document.getElementById('manage-filter-group');
const manageSearch       = document.getElementById('manage-search');
const manageList         = document.getElementById('manage-exercises-list');

let allExercisesData = []; // [{name, muscle_group}]

function openManageModal() {
  manageModal.classList.remove('hidden');
  manageModalOverlay.classList.remove('hidden');
  manageSearch.value = '';
  manageFilterGroup.value = '';
  hideManageAddRow();
  loadAndRenderManageList();
}

function closeManageModal() {
  manageModal.classList.add('hidden');
  manageModalOverlay.classList.add('hidden');
}

async function loadAndRenderManageList() {
  try {
    const data = await fetch('/api/exercises').then(r => r.json());

    allExercisesData = data.map(ex => ({
      name: typeof ex === 'object' ? ex.name : ex,
      muscle_group: typeof ex === 'object' ? (ex.muscle_group || '') : '',
      is_predefined: typeof ex === 'object' ? (ex.is_predefined || 0) : 0
    })).filter(ex => ex.name);

    // Rellenar filtro de grupos musculares
    const groups = new Set(allExercisesData.map(ex => ex.muscle_group).filter(Boolean));
    const hasCustomExercises = allExercisesData.some(ex => !ex.is_predefined);
    const currentFilter = manageFilterGroup.value;
    manageFilterGroup.innerHTML = '<option value="">Todos los grupos</option>';
    // Mostrar "Sin grupo" si hay custom exercises (que pueden no tener grupo)
    if (hasCustomExercises) {
      const opt = document.createElement('option');
      opt.value = 'no-group';
      opt.textContent = 'Sin grupo';
      manageFilterGroup.appendChild(opt);
    }
    [...MUSCLE_GROUPS, ...Array.from(groups).filter(g => !MUSCLE_GROUPS.includes(g))].forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      manageFilterGroup.appendChild(opt);
    });
    manageFilterGroup.value = currentFilter;

    renderManageList();
  } catch (err) {
    console.error('Error cargando ejercicios para gestión:', err);
  }
}

function renderManageList() {
  const filterGroup = manageFilterGroup.value;
  const search = manageSearch.value.toLowerCase().trim();

  const filtered = allExercisesData.filter(ex => {
    let matchGroup;
    if (!filterGroup) {
      matchGroup = true;
    } else if (filterGroup === 'no-group') {
      matchGroup = !ex.muscle_group;
    } else {
      matchGroup = ex.muscle_group === filterGroup;
    }
    const matchSearch = !search || ex.name.toLowerCase().includes(search);
    return matchGroup && matchSearch;
  });

  if (filtered.length === 0) {
    manageList.innerHTML = '<p style="color:#999; text-align:center; padding:20px 0;">No hay ejercicios que coincidan.</p>';
    return;
  }

  manageList.innerHTML = filtered.map(ex => `
    <div class="manage-exercise-row">
      <input type="text" class="manage-exercise-name-input" value="${escapeHtml(ex.name)}" data-original="${escapeHtml(ex.name)}" />
      <select class="manage-exercise-select">
        ${MUSCLE_GROUPS.map(g => `<option value="${g}" ${ex.muscle_group === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
      <button class="manage-save-btn" title="Guardar cambios">Guardar</button>
      <button class="manage-delete-btn" title="Eliminar ejercicio">🗑</button>
    </div>
  `).join('');

  manageList.querySelectorAll('.manage-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.manage-exercise-row');
      const nameInput = row.querySelector('.manage-exercise-name-input');
      const select = row.querySelector('.manage-exercise-select');
      const originalName = nameInput.dataset.original;
      const newName = nameInput.value.trim();
      const muscleGroup = select.value;

      if (!newName) {
        await showAlert('Error', 'El nombre no puede estar vacío');
        return;
      }

      if (!muscleGroup) {
        await showAlert('Error', 'Todos los ejercicios deben tener un grupo muscular asignado');
        return;
      }

      btn.textContent = '...';
      btn.disabled = true;

      try {
        const body = { muscle_group: muscleGroup };
        if (newName !== originalName) body.new_name = newName;

        const res = await fetch(`/api/exercises/${encodeURIComponent(originalName)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error en servidor');
        }

        // Actualizar datos locales
        const exIdx = allExercisesData.findIndex(e => e.name === originalName);
        if (exIdx !== -1) {
          allExercisesData[exIdx].name = newName;
          allExercisesData[exIdx].muscle_group = muscleGroup;
        }
        if (newName !== originalName) {
          EXERCISE_MUSCLE_MAP[newName] = muscleGroup;
          delete EXERCISE_MUSCLE_MAP[originalName];
        } else {
          EXERCISE_MUSCLE_MAP[newName] = muscleGroup;
        }

        // Actualizar el data-original en el input para reflejar el nuevo nombre
        nameInput.dataset.original = newName;

        btn.textContent = '✓';
        btn.style.background = '#007700';
        setTimeout(() => {
          btn.textContent = 'Guardar';
          btn.style.background = '';
          btn.disabled = false;
        }, 1500);
      } catch (err) {
        console.error('Error al guardar ejercicio:', err);
        btn.textContent = 'Error';
        btn.style.background = '#770000';
        setTimeout(() => {
          btn.textContent = 'Guardar';
          btn.style.background = '';
          btn.disabled = false;
        }, 1500);
      }
    });
  });

  manageList.querySelectorAll('.manage-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.manage-exercise-row');
      const nameInput = row.querySelector('.manage-exercise-name-input');
      const name = nameInput.dataset.original;

      const ok = await showConfirm({
        title: 'Eliminar ejercicio',
        body: `¿Eliminar <strong>${escapeHtml(name)}</strong>?<br><br><span style="color:#aaa; font-size:0.9rem;">Los registros de sesiones que lo usan no se verán afectados.</span>`,
        okText: 'Eliminar',
        danger: true
      });
      if (!ok) return;

      btn.textContent = '...';
      btn.disabled = true;

      try {
        const res = await fetch(`/api/exercises/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Error en servidor');
        }

        allExercisesData = allExercisesData.filter(e => e.name !== name);
        availableExercises = availableExercises.filter(e => e !== name);
        delete EXERCISE_MUSCLE_MAP[name];

        row.remove();
        manageSearch.value = '';
        renderManageList();
      } catch (err) {
        console.error('Error al eliminar ejercicio:', err);
        btn.textContent = '🗑';
        btn.disabled = false;
        showAlert('Error', 'Error al eliminar el ejercicio: ' + err.message);
      }
    });
  });
}

document.getElementById('manage-exercises-btn').addEventListener('click', openManageModal);
manageCloseBtn.addEventListener('click', closeManageModal);
manageModalOverlay.addEventListener('click', closeManageModal);
manageFilterGroup.addEventListener('change', renderManageList);

// ── Autocomplete de búsqueda/añadir en el gestor ────────────────────────────

const manageAddDropdown = document.getElementById('manage-add-dropdown');
document.body.appendChild(manageAddDropdown); // Move outside modal to avoid overflow clipping
let pendingAddName = '';

function positionManageDropdown() {
  const rect = manageSearch.getBoundingClientRect();
  Object.assign(manageAddDropdown.style, {
    position: 'fixed',
    top: rect.bottom + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    right: 'auto',
    zIndex: '9999',
    borderTop: '2px solid #ff0000'
  });
}

function hideManageAddRow() {
  document.getElementById('manage-add-group-row').style.display = 'none';
  pendingAddName = '';
}

function showManageAddRow(name) {
  pendingAddName = name;
  document.getElementById('manage-add-name-label').textContent = `Añadir: "${name}"`;
  const groupSelect = document.getElementById('manage-add-group-select');
  groupSelect.innerHTML = '<option value="">Grupo muscular...</option>';
  MUSCLE_GROUPS.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    groupSelect.appendChild(opt);
  });
  document.getElementById('manage-add-group-row').style.display = 'flex';
  groupSelect.focus();
}

manageSearch.addEventListener('input', () => {
  renderManageList();
  const query = manageSearch.value.trim();
  if (!query) { manageAddDropdown.classList.add('hidden'); return; }

  const matches = allExercisesData.filter(ex =>
    ex.name.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = allExercisesData.some(ex => ex.name.toLowerCase() === query.toLowerCase());

  let html = matches.map(ex =>
    `<div class="dropdown-item" data-name="${escapeHtml(ex.name)}">${escapeHtml(ex.name)}</div>`
  ).join('');

  if (!exactMatch) {
    const capitalized = query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    html += `<div class="dropdown-item dropdown-item-new" data-name="${escapeHtml(capitalized)}">+ Añadir nuevo: ${escapeHtml(capitalized)}</div>`;
  }

  if (html) {
    manageAddDropdown.innerHTML = html;
    manageAddDropdown.classList.remove('hidden');
    positionManageDropdown();
    manageAddDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        manageAddDropdown.classList.add('hidden');
        if (item.classList.contains('dropdown-item-new')) {
          manageSearch.value = '';
          renderManageList();
          showManageAddRow(item.dataset.name);
        } else {
          manageSearch.value = item.dataset.name;
          renderManageList();
        }
      });
    });
  } else {
    manageAddDropdown.classList.add('hidden');
  }
});

manageSearch.addEventListener('blur', () => {
  setTimeout(() => manageAddDropdown.classList.add('hidden'), 150);
});

document.getElementById('manage-add-confirm-btn').addEventListener('click', async () => {
  const muscleGroup = document.getElementById('manage-add-group-select').value;
  if (!muscleGroup) { await showAlert('Error', 'Selecciona un grupo muscular'); return; }

  const btn = document.getElementById('manage-add-confirm-btn');
  btn.disabled = true; btn.textContent = '...';

  try {
    const res = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pendingAddName, muscle_group: muscleGroup })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error en servidor');
    }
    EXERCISE_MUSCLE_MAP[pendingAddName] = muscleGroup;
    if (!availableExercises.some(e => e.toLowerCase() === pendingAddName.toLowerCase())) {
      availableExercises.push(pendingAddName);
    }
    hideManageAddRow();
    await loadAndRenderManageList();
  } catch (err) {
    showAlert('Error', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
});

document.getElementById('manage-add-cancel-btn').addEventListener('click', hideManageAddRow);

document.getElementById('repair-db-btn').addEventListener('click', async () => {
  const ok = await showConfirm({
    title: 'Reparar Base de Datos',
    body: `<p style="color:#ccc; line-height:1.6;">Restaurará el nombre y grupo muscular de los <strong>${PREDEFINED_EXERCISES.length} ejercicios predefinidos</strong> a su estado original.<br><br>Los ejercicios personalizados y los registros de sesiones <strong>no se verán afectados</strong>.</p>`,
    okText: 'Reparar'
  });
  if (!ok) return;

  try {
    const res = await fetch('/api/exercises/repair', { method: 'POST' });
    if (!res.ok) throw new Error('Error en servidor');
    availableExercises = [...PREDEFINED_EXERCISES];
    await loadExerciseOptions();
    await loadAndRenderManageList();
    showAlert('Reparación completada', 'Los ejercicios predefinidos han sido restaurados correctamente.');
  } catch (err) {
    showAlert('Error', 'Error al reparar: ' + err.message);
  }
});

document.getElementById('restore-db-btn').addEventListener('click', async () => {
  const first = await showConfirm({
    title: 'Restaurar Base de Datos',
    body: `<p style="color:#ccc; line-height:1.6;">Esta acción eliminará <strong>todos los ejercicios</strong>, incluidos los personalizados, y restaurará únicamente los ${PREDEFINED_EXERCISES.length} predefinidos.<br><br>Los registros de sesiones no se verán afectados.</p>`,
    okText: 'Continuar',
    danger: true
  });
  if (!first) return;

  const second = await showConfirm({
    title: 'Confirmación final',
    body: `<p style="color:#ccc; line-height:1.6;">Los ejercicios personalizados serán eliminados de forma <strong>permanente</strong>. Esta acción no se puede deshacer.</p>`,
    okText: 'Restaurar todo',
    danger: true
  });
  if (!second) return;

  try {
    const res = await fetch('/api/exercises/restore', { method: 'POST' });
    if (!res.ok) throw new Error('Error en servidor');
    availableExercises = [...PREDEFINED_EXERCISES];
    await loadExerciseOptions();
    await loadAndRenderManageList();
    showAlert('Restauración completada', `La base de datos ha sido restaurada a los ${PREDEFINED_EXERCISES.length} ejercicios predefinidos.`);
  } catch (err) {
    showAlert('Error', 'Error al restaurar: ' + err.message);
  }
});

// Inicializar
loadExerciseOptions().then(async () => {
  const params  = new URLSearchParams(window.location.search);
  const prefill = params.get('ejercicio');
  const plandia = params.get('plandia');

  if (prefill) {
    openModal();
    selectExerciseInModal(decodeURIComponent(prefill));
    return;
  }

  if (plandia !== null) {
    try {
      const res  = await fetch('/api/coach/plan');
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.plan_json) return;

      const days = data.plan_json.weekly_plan?.days || [];
      const day  = days[parseInt(plandia)];
      if (!day) return;

      // Semana actual del plan (1-4)
      const generated   = new Date(data.generated_at);
      const daysPassed  = Math.floor((Date.now() - generated) / 86400000);
      const currentWeek = Math.min(4, Math.max(1, Math.floor(daysPassed / 7) + 1));
      const weekKey     = `week${currentWeek}`;

      // Pre-cargar ejercicios con peso guía
      for (const ex of (day.exercises || [])) {
        const raw = ex.weekly_weights?.[weekKey] || null;
        const plannedWeight = raw && !/^PC$/i.test(raw.trim()) ? raw : null;
        currentExercises.push({ name: ex.name, series: [], notes: '', plannedWeight });
      }

      // Mostrar banner contextual
      const banner = document.getElementById('plan-banner');
      const focus  = decodeURIComponent(params.get('playfocus') || '');
      document.getElementById('plan-banner-text').textContent =
        `Plan activo · ${day.day}${focus ? ' · ' + focus : ''} · Semana ${currentWeek} de 4`;
      banner.classList.remove('hidden');

      renderExercises();

      // Poner fecha de hoy
      const dateInput = document.getElementById('date');
      if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
      }
    } catch (e) {
      console.error('Error cargando plan:', e);
    }
  }
});
renderExercises();
