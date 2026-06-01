let weightEntries = [];
let weightChart = null;

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderChart() {
  const sorted = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const ctx = document.getElementById('weightChart').getContext('2d');
  if (weightChart) weightChart.destroy();
  if (sorted.length === 0) return;

  weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sorted.map(e => formatDate(e.date)),
      datasets: [{
        label: 'Peso (kg)',
        data: sorted.map(e => e.weight_kg),
        borderColor: '#ff0000',
        backgroundColor: 'rgba(255,0,0,0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#ff0000',
        pointRadius: 4,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} kg` } }
      },
      scales: {
        x: { ticks: { color: '#aaaaaa' }, grid: { color: '#333333' } },
        y: { ticks: { color: '#aaaaaa', callback: v => v + ' kg' }, grid: { color: '#333333' } }
      }
    }
  });
}

function renderTable() {
  const body = document.getElementById('weight-body');
  const noRecords = document.getElementById('no-weight-records');
  const sorted = [...weightEntries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  if (sorted.length === 0) {
    body.innerHTML = '';
    noRecords.style.display = 'block';
    return;
  }
  noRecords.style.display = 'none';

  const chronological = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const changeMap = new Map();
  for (let i = 0; i < chronological.length; i++) {
    if (i === 0) { changeMap.set(chronological[i].id, null); continue; }
    const diff = parseFloat((chronological[i].weight_kg - chronological[i - 1].weight_kg).toFixed(2));
    changeMap.set(chronological[i].id, diff);
  }

  body.innerHTML = sorted.map(entry => {
    const change = changeMap.get(entry.id);
    let changeHtml = '<span style="color:#555;">—</span>';
    if (change !== null && change !== undefined) {
      const sign = change > 0 ? '+' : '';
      const color = change > 0 ? '#e74c3c' : change < 0 ? '#27ae60' : '#888';
      changeHtml = `<span style="color:${color}; font-weight:700;">${sign}${change} kg</span>`;
    }
    const comments = entry.comments
      ? `<span style="color:#ccc;">${escapeHtml(entry.comments)}</span>`
      : '<span style="color:#555;">—</span>';
    return `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td style="text-align:center; font-weight:700;">${entry.weight_kg} kg</td>
        <td style="text-align:center;">${changeHtml}</td>
        <td>${comments}</td>
        <td><button class="btn-delete-weight" data-id="${entry.id}"
          style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:1.1rem; padding:4px 8px; width:auto;">🗑</button></td>
      </tr>`;
  }).join('');

  document.querySelectorAll('.btn-delete-weight').forEach(btn => {
    btn.addEventListener('click', () => deleteWeight(parseInt(btn.dataset.id, 10)));
  });
}

async function deleteWeight(id) {
  const ok = await showConfirm({
    title: 'Eliminar registro',
    body: '<p style="color:#ccc;">¿Eliminar este registro de peso? Esta acción no se puede deshacer.</p>',
    okText: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    const res = await fetch(`/api/weight/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    weightEntries = weightEntries.filter(e => e.id !== id);
    renderChart();
    renderTable();
  } catch (e) {
    await showAlert('Error', '<p style="color:#ccc;">No se pudo eliminar el registro.</p>');
  }
}

async function loadWeight() {
  try {
    const res = await fetch('/api/weight');
    if (!res.ok) throw new Error();
    weightEntries = await res.json();
    renderChart();
    renderTable();
  } catch (e) {
    await showAlert('Error', '<p style="color:#ccc;">No se pudieron cargar los registros.</p>');
  }
}

function openWeightModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('weight-date').value = today;
  document.getElementById('weight-value').value = '';
  document.getElementById('weight-comments').value = '';
  document.getElementById('weight-modal-overlay').classList.remove('hidden');
  document.getElementById('weight-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('weight-value').focus(), 80);
}

function closeWeightModal() {
  document.getElementById('weight-modal-overlay').classList.add('hidden');
  document.getElementById('weight-modal').classList.add('hidden');
}

document.getElementById('add-weight-btn').addEventListener('click', openWeightModal);
document.getElementById('weight-modal-close').addEventListener('click', closeWeightModal);
document.getElementById('weight-modal-cancel').addEventListener('click', closeWeightModal);
document.getElementById('weight-modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('weight-modal-overlay')) closeWeightModal();
});

document.getElementById('weight-modal-save').addEventListener('click', async () => {
  const date = document.getElementById('weight-date').value;
  const weight_kg = parseFloat(document.getElementById('weight-value').value);
  const comments = document.getElementById('weight-comments').value.trim();

  if (!date || isNaN(weight_kg) || weight_kg <= 0) {
    await showAlert('Datos incompletos', '<p style="color:#ccc;">Por favor, introduce una fecha y un peso válido.</p>');
    return;
  }

  try {
    const res = await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, weight_kg, comments })
    });
    if (!res.ok) throw new Error();
    const entry = await res.json();
    weightEntries.push(entry);
    closeWeightModal();
    renderChart();
    renderTable();
  } catch (e) {
    await showAlert('Error', '<p style="color:#ccc;">No se pudo guardar el registro.</p>');
  }
});

loadWeight();
