const form = document.getElementById('session-form');
const sessionsBody = document.getElementById('sessions-body');
const exportButton = document.getElementById('export-button');
const messageDiv = document.getElementById('message');

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

function renderSessions(sessions) {
  if (sessions.length === 0) {
    sessionsBody.innerHTML = '<tr><td colspan="7">No hay registros todavía.</td></tr>';
    return;
  }
  sessionsBody.innerHTML = sessions
    .map((session) => {
      return `
        <tr>
          <td>${session.date}</td>
          <td>${session.exercise}</td>
          <td>${session.sets}</td>
          <td>${session.reps}</td>
          <td>${formatValue(session.weight)}</td>
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

async function addSession(session) {
  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al guardar');
    }
    showMessage('Sesión guardada correctamente', 'success');
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const session = {
    date: document.getElementById('date').value,
    exercise: document.getElementById('exercise').value.trim(),
    sets: Number(document.getElementById('sets').value),
    reps: Number(document.getElementById('reps').value),
    weight: document.getElementById('weight').value ? Number(document.getElementById('weight').value) : null,
    notes: document.getElementById('notes').value.trim(),
  };

  if (!session.date || !session.exercise || !session.sets || !session.reps) {
    showMessage('Completa todos los campos obligatorios antes de guardar.');
    return;
  }

  await addSession(session);
  form.reset();
  document.getElementById('sets').value = 3;
  document.getElementById('reps').value = 10;
});

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

loadSessions();
