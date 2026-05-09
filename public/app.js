const form = document.getElementById('session-form');
const sessionsBody = document.getElementById('sessions-body');
const exportButton = document.getElementById('export-button');

async function fetchSessions() {
  const response = await fetch('/api/sessions');
  return response.ok ? response.json() : [];
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
  await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  await loadSessions();
}

async function deleteSession(id) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  await loadSessions();
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
    alert('Completa todos los campos obligatorios antes de guardar.');
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
