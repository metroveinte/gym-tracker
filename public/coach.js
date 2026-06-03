const PLAN_DAYS = 28;

function hide(id) { document.getElementById(id).classList.add('hidden'); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }

function fmt(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── Check-in modal ────────────────────────────────────────────────────────────

function openCheckin(isRegeneration) {
  return new Promise((resolve) => {
    // Reset selections
    document.querySelectorAll('.checkin-opt').forEach(b => b.classList.remove('selected'));
    document.getElementById('checkin-confirm').disabled = true;

    // Show/hide previous plan question
    document.getElementById('checkin-prev-plan').style.display = isRegeneration ? '' : 'none';
    document.getElementById('checkin-title').textContent = isRegeneration
      ? 'Revisión antes de regenerar'
      : 'Antes de generar tu plan';

    document.getElementById('checkin-overlay').classList.remove('hidden');
    document.getElementById('checkin-modal').classList.remove('hidden');

    function closeModal(answers) {
      document.getElementById('checkin-overlay').classList.add('hidden');
      document.getElementById('checkin-modal').classList.add('hidden');
      cleanup();
      resolve(answers);
    }

    function collectAnswers() {
      const answers = {};
      document.querySelectorAll('.checkin-options').forEach(group => {
        const key = group.dataset.key;
        const sel = group.querySelector('.checkin-opt.selected');
        if (sel) answers[key] = sel.dataset.value;
      });
      return answers;
    }

    function checkComplete() {
      // All visible groups must have a selection
      const groups = [...document.querySelectorAll('.checkin-group')]
        .filter(g => g.style.display !== 'none');
      const allDone = groups.every(g => g.querySelector('.checkin-opt.selected'));
      document.getElementById('checkin-confirm').disabled = !allDone;
    }

    function onOptClick(e) {
      const btn = e.target.closest('.checkin-opt');
      if (!btn) return;
      const group = btn.closest('.checkin-options');
      group.querySelectorAll('.checkin-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      checkComplete();
    }

    function onConfirm() { closeModal(collectAnswers()); }
    function onCancel()  { closeModal(null); }
    function onOverlay(e) {
      if (e.target === document.getElementById('checkin-overlay')) closeModal(null);
    }

    document.getElementById('checkin-modal').addEventListener('click', onOptClick);
    document.getElementById('checkin-confirm').addEventListener('click', onConfirm);
    document.getElementById('checkin-cancel').addEventListener('click', onCancel);
    document.getElementById('checkin-close').addEventListener('click', onCancel);
    document.getElementById('checkin-overlay').addEventListener('click', onOverlay);

    function cleanup() {
      document.getElementById('checkin-modal').removeEventListener('click', onOptClick);
      document.getElementById('checkin-confirm').removeEventListener('click', onConfirm);
      document.getElementById('checkin-cancel').removeEventListener('click', onCancel);
      document.getElementById('checkin-close').removeEventListener('click', onCancel);
      document.getElementById('checkin-overlay').removeEventListener('click', onOverlay);
    }
  });
}

// ── Generate ──────────────────────────────────────────────────────────────────

async function generate(isRegeneration = false) {
  const answers = await openCheckin(isRegeneration);
  if (!answers) return; // user cancelled

  hide('state-plan');
  hide('state-no-key');
  show('state-loading');

  try {
    const res  = await fetch('/api/coach/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkin: answers }),
    });
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

// ── Render ────────────────────────────────────────────────────────────────────

function renderPlan(plan, generatedAt, validUntil) {
  const genDate   = generatedAt ? fmt(generatedAt.slice(0, 10)) : '—';
  const validDate = validUntil  ? fmt(validUntil) : '—';
  document.getElementById('plan-meta').textContent =
    `Generado el ${genDate} · Válido hasta ${validDate}`;

  const today    = new Date();
  const genTime  = new Date(generatedAt);
  const validEnd = new Date(validUntil + 'T00:00:00');
  const elapsed  = (today - genTime) / 86400000;
  const pct      = Math.max(0, Math.min(100, (elapsed / PLAN_DAYS) * 100));
  const daysLeft = Math.max(0, Math.round((validEnd - today) / 86400000));
  document.getElementById('plan-progress-bar').style.width = pct + '%';
  document.getElementById('plan-days-left').textContent    =
    daysLeft > 0 ? `${daysLeft} días restantes` : 'Plan vencido';

  // Always visible for now (testing); restrict to daysLeft <= 0 in production
  document.getElementById('regenerate-btn').style.display = '';

  const a = plan.analysis || {};
  document.getElementById('analysis-summary').textContent = a.summary || '';

  document.getElementById('analysis-strengths').innerHTML = (a.strengths || []).map(s =>
    `<li style="color:#ccc;font-size:.88rem;margin-bottom:6px;padding-left:14px;position:relative;">
      <span style="position:absolute;left:0;color:#4caf50;">✓</span>${s}</li>`).join('');

  document.getElementById('analysis-gaps').innerHTML = (a.gaps || []).map(g =>
    `<li style="color:#ccc;font-size:.88rem;margin-bottom:6px;padding-left:14px;position:relative;">
      <span style="position:absolute;left:0;color:#e5303a;">!</span>${g}</li>`).join('');

  const imbalances = a.imbalances || [];
  if (imbalances.length) {
    show('imbalances-block');
    document.getElementById('analysis-imbalances').innerHTML = imbalances.map(i =>
      `<li style="color:#ccc;font-size:.88rem;margin-bottom:6px;padding-left:14px;position:relative;">
        <span style="position:absolute;left:0;color:#f0b429;">⚠</span>${i}</li>`).join('');
  }

  const wp = plan.weekly_plan || {};
  document.getElementById('plan-structure').textContent = wp.structure || '';
  document.getElementById('plan-rationale').textContent = wp.rationale || '';

  document.getElementById('plan-days').innerHTML = (wp.days || []).map(d => `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;">
      <div style="background:var(--bg-raised);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;font-size:.95rem;">${d.day}</span>
        <span style="color:#888;font-size:.82rem;">${d.focus}</span>
      </div>
      ${(d.exercises || []).length ? `
      <div style="padding:10px 14px;">
        ${(d.exercises || []).map(ex => `
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--border);">
            <span style="color:var(--text);font-size:.88rem;">${ex.name}</span>
            <span style="color:#888;font-size:.82rem;white-space:nowrap;margin-left:10px;">${ex.sets}×${ex.reps}${ex.notes ? ' · ' + ex.notes : ''}</span>
          </div>`).join('')}
      </div>` : `<div style="padding:10px 14px;color:#555;font-size:.85rem;">Descanso activo</div>`}
    </div>`).join('');

  const prog = plan.progression || {};
  document.getElementById('progression-weeks').innerHTML =
    ['week1','week2','week3','week4'].map((k,i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <span style="min-width:72px;color:var(--accent);font-size:.8rem;font-weight:700;padding-top:2px;">Semana ${i+1}</span>
        <span style="color:#ccc;font-size:.88rem;line-height:1.5;">${prog[k] || ''}</span>
      </div>`).join('');

  if (plan.nutrition_notes) {
    document.getElementById('nutrition-notes').textContent = plan.nutrition_notes;
    show('nutrition-block');
  } else {
    hide('nutrition-block');
  }

  hide('generate-block');
  show('state-plan');
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const res  = await fetch('/api/coach/plan');
    if (res.status === 503) { show('state-no-key'); return; }
    const data = await res.json();

    if (!data) {
      show('state-plan');
      show('generate-block');
      return;
    }

    renderPlan(data.plan_json, data.generated_at, data.valid_until);
  } catch (e) {
    show('state-no-data');
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

document.getElementById('generate-btn')?.addEventListener('click', () => generate(false));
document.getElementById('pdf-btn')?.addEventListener('click', () => window.print());
document.getElementById('regenerate-btn')?.addEventListener('click', () => generate(true));

load();
