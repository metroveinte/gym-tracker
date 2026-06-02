const PLAN_DAYS = 28;

function hide(id) { document.getElementById(id).classList.add('hidden'); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }

function fmt(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function renderPlan(plan, generatedAt, validUntil) {
  // Meta
  const genDate   = generatedAt ? fmt(generatedAt.slice(0, 10)) : '—';
  const validDate = validUntil  ? fmt(validUntil) : '—';
  document.getElementById('plan-meta').textContent =
    `Generado el ${genDate} · Válido hasta ${validDate}`;

  // Progress bar
  const today    = new Date();
  const genTime  = new Date(generatedAt);
  const validEnd = new Date(validUntil + 'T00:00:00');
  const elapsed  = (today - genTime) / 86400000;
  const pct      = Math.max(0, Math.min(100, (elapsed / PLAN_DAYS) * 100));
  const daysLeft = Math.max(0, Math.round((validEnd - today) / 86400000));
  document.getElementById('plan-progress-bar').style.width = pct + '%';
  document.getElementById('plan-days-left').textContent    =
    daysLeft > 0 ? `${daysLeft} días restantes` : 'Plan vencido';

  // Regenerate button
  if (daysLeft <= 0) {
    document.getElementById('regenerate-btn').style.display = '';
  }

  // Analysis
  const a = plan.analysis || {};
  document.getElementById('analysis-summary').textContent = a.summary || '';

  const ulStrengths = document.getElementById('analysis-strengths');
  ulStrengths.innerHTML = (a.strengths || []).map(s =>
    `<li style="color:#ccc; font-size:0.88rem; margin-bottom:6px; padding-left:14px; position:relative;">
      <span style="position:absolute;left:0;color:#4caf50;">✓</span>${s}
    </li>`).join('');

  const ulGaps = document.getElementById('analysis-gaps');
  ulGaps.innerHTML = (a.gaps || []).map(g =>
    `<li style="color:#ccc; font-size:0.88rem; margin-bottom:6px; padding-left:14px; position:relative;">
      <span style="position:absolute;left:0;color:#e5303a;">!</span>${g}
    </li>`).join('');

  const imbalances = a.imbalances || [];
  if (imbalances.length) {
    show('imbalances-block');
    document.getElementById('analysis-imbalances').innerHTML = imbalances.map(i =>
      `<li style="color:#ccc; font-size:0.88rem; margin-bottom:6px; padding-left:14px; position:relative;">
        <span style="position:absolute;left:0;color:#f0b429;">⚠</span>${i}
      </li>`).join('');
  }

  // Weekly plan
  const wp = plan.weekly_plan || {};
  document.getElementById('plan-structure').textContent = wp.structure || '';
  document.getElementById('plan-rationale').textContent = wp.rationale || '';

  const daysEl = document.getElementById('plan-days');
  daysEl.innerHTML = (wp.days || []).map(d => `
    <div style="border:1px solid var(--border); border-radius:var(--r-sm); overflow:hidden;">
      <div style="background:var(--bg-raised); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:0.95rem;">${d.day}</span>
        <span style="color:#888; font-size:0.82rem;">${d.focus}</span>
      </div>
      ${(d.exercises || []).length ? `
      <div style="padding:10px 14px;">
        ${(d.exercises || []).map(ex => `
          <div style="display:flex; justify-content:space-between; align-items:baseline; padding:5px 0; border-bottom:1px solid var(--border);">
            <span style="color:var(--text); font-size:0.88rem;">${ex.name}</span>
            <span style="color:#888; font-size:0.82rem; white-space:nowrap; margin-left:10px;">${ex.sets}×${ex.reps}${ex.notes ? ' · ' + ex.notes : ''}</span>
          </div>`).join('')}
      </div>` : `<div style="padding:10px 14px; color:#555; font-size:0.85rem;">Descanso activo</div>`}
    </div>`).join('');

  // Progression
  const prog = plan.progression || {};
  const weekLabels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
  document.getElementById('progression-weeks').innerHTML =
    ['week1', 'week2', 'week3', 'week4'].map((k, i) => `
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <span style="min-width:72px; color:var(--accent); font-size:0.8rem; font-weight:700; padding-top:2px;">${weekLabels[i]}</span>
        <span style="color:#ccc; font-size:0.88rem; line-height:1.5;">${prog[k] || ''}</span>
      </div>`).join('');

  // Nutrition
  if (plan.nutrition_notes) {
    document.getElementById('nutrition-notes').textContent = plan.nutrition_notes;
    show('nutrition-block');
  } else {
    hide('nutrition-block');
  }

  // Show state
  hide('generate-block');
  show('state-plan');
}

async function generate() {
  hide('state-plan');
  hide('state-no-key');
  show('state-loading');
  try {
    const res = await fetch('/api/coach/generate', { method: 'POST' });
    const data = await res.json();
    if (res.status === 503) { hide('state-loading'); show('state-no-key'); return; }
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    hide('state-loading');
    await load();
  } catch (e) {
    hide('state-loading');
    await showAlert('Error al generar plan', `<p style="color:#ccc;">${e.message}</p>`);
    show('state-plan');
    show('generate-block');
  }
}

async function load() {
  try {
    const res = await fetch('/api/coach/plan');

    if (res.status === 503) {
      show('state-no-key');
      return;
    }

    const data = await res.json();

    if (!data) {
      // No plan yet — show generate prompt (server will tell us if key is missing on click)
      show('state-plan');
      show('generate-block');
      return;
    }

    renderPlan(data.plan_json, data.generated_at, data.valid_until);

  } catch (e) {
    show('state-no-data');
  }
}

document.getElementById('generate-btn')?.addEventListener('click', generate);
document.getElementById('regenerate-btn')?.addEventListener('click', async () => {
  const ok = await showConfirm({
    title: 'Regenerar plan',
    body: '<p style="color:#ccc;">Se generará un nuevo plan basado en tu historial actual. El plan anterior se reemplazará.</p>',
    okText: 'Regenerar', danger: true,
  });
  if (ok) generate();
});

load();
