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
    document.querySelectorAll('.checkin-opt').forEach(b => b.classList.remove('selected'));
    document.getElementById('checkin-note').value = '';
    document.getElementById('checkin-confirm').disabled = true;

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
      const note = document.getElementById('checkin-note').value.trim();
      if (note) answers.coach_note = note;
      return answers;
    }

    function checkComplete() {
      // Only groups with .checkin-options that are visible must be answered
      const visibleGroups = [...document.querySelectorAll('.checkin-group')]
        .filter(g => g.style.display !== 'none' && g.querySelector('.checkin-options'));
      const allDone = visibleGroups.every(g => g.querySelector('.checkin-opt.selected'));
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
  if (!answers) return;

  hide('state-plan');
  hide('state-no-key');
  show('state-loading');

  try {
    const res = await fetch('/api/coach/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkin: answers }),
    });
    if (res.status === 503) { hide('state-loading'); show('state-no-key'); return; }
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.error || `Error del servidor (${res.status})`);
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

  // Always visible for testing; restrict to daysLeft <= 0 in production
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

  const SCHEME_LABEL = {
    rectas:               'Series rectas',
    piramide_asc:         'Pirámide ascendente',
    piramide_desc:        'Pirámide descendente',
    calentamiento_trabajo:'Calentamiento + trabajo',
  };

  document.getElementById('plan-days').innerHTML = (wp.days || []).map((d, dayIdx) => {
    const mins = d.estimated_minutes;
    const timeChip = mins
      ? `<span style="background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent);border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">⏱ ~${mins} min</span>`
      : '';

    const exerciseRows = (d.exercises || []).map(ex => {
      const ww  = ex.weekly_weights || {};
      const sw1 = ex.session_weights_week1 || [];

      // Weekly progression row (renamed Sem 1-4 to avoid confusion with sets)
      const isDeload = (() => {
        const w3 = parseFloat(ww['week3']);
        const w4 = parseFloat(ww['week4']);
        return !isNaN(w3) && !isNaN(w4) && w4 < w3;
      })();
      const weeklyRow = Object.keys(ww).length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;">
          <span style="font-size:.7rem;color:#555;align-self:center;margin-right:2px;">progresión:</span>
          ${['week1','week2','week3','week4'].map((k,i) => ww[k] ? `
            <span style="font-size:.75rem;padding:2px 8px;border-radius:4px;background:var(--bg);border:1px solid var(--border-mid);color:${i===3?'#888':'#ccc'};">
              Sem${i+1} <strong style="color:${i===3&&isDeload?'#666':'var(--accent)'};">${ww[k]}</strong>${i===3&&isDeload?' ↓':''}
            </span>` : '').join('')}
        </div>` : '';

      // Per-set weights for week 1
      const setsRow = sw1.length ? `
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;align-items:center;">
          <span style="font-size:.7rem;color:#555;margin-right:2px;">esta sem:</span>
          ${sw1.map((w, i) => `
            <span style="font-size:.75rem;padding:2px 7px;border-radius:4px;background:var(--bg-raised);border:1px solid var(--border);color:#ccc;">
              Set${i+1} <strong style="color:var(--text);">${w}</strong>
            </span>`).join('')}
        </div>` : '';

      // Alternative exercise (shown on the right, below sets×reps)
      const altInline = ex.alternative
        ? `<div style="text-align:right;margin-top:3px;">
            <span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:700;">Alternativa:</span>
            <span style="font-size:.76rem;color:#888;margin-left:4px;">${ex.alternative}</span>
          </div>`
        : '';

      // Set scheme badge + note
      const schemeLabel = SCHEME_LABEL[ex.set_scheme] || ex.set_scheme || '';
      const schemeBadge = schemeLabel
        ? `<span style="font-size:.7rem;padding:1px 7px;border-radius:10px;background:var(--bg-raised);border:1px solid var(--border-mid);color:#666;margin-left:6px;">${schemeLabel}</span>`
        : '';
      const schemeNote = ex.set_scheme_note
        ? `<div style="color:#555;font-size:.76rem;margin-top:4px;line-height:1.4;font-style:italic;">${ex.set_scheme_note}</div>`
        : '';

      // Progression rationale
      const progressionNote = ex.progression_note
        ? `<div style="display:flex;align-items:flex-start;gap:5px;margin-top:5px;padding:5px 8px;background:rgba(229,48,58,.06);border-left:2px solid rgba(229,48,58,.35);border-radius:0 4px 4px 0;">
            <span style="font-size:.68rem;color:var(--accent);font-weight:700;white-space:nowrap;padding-top:1px;">📈</span>
            <span style="font-size:.74rem;color:#777;line-height:1.45;">${ex.progression_note}</span>
          </div>`
        : '';

      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">
            <div style="display:flex;align-items:center;flex-wrap:wrap;">
              <span style="color:var(--text);font-size:.88rem;font-weight:600;">${ex.name}</span>
              ${schemeBadge}
            </div>
            <div style="text-align:right;">
              <div style="color:#888;font-size:.82rem;white-space:nowrap;">${ex.sets}×${ex.reps}${ex.notes ? ' · <em style=color:#666>' + ex.notes + '</em>' : ''}</div>
              ${altInline}
            </div>
          </div>
          ${schemeNote}
          ${setsRow}
          ${weeklyRow}
          ${progressionNote}
        </div>`;
    }).join('');

    return `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;">
      <div style="background:var(--bg-raised);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;font-size:.95rem;">${d.day}</span>
          <span style="color:#888;font-size:.82rem;">${d.focus}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${timeChip}
          <a href="/sessions?plandia=${dayIdx}&playfocus=${encodeURIComponent(d.focus)}"
             style="font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:4px;background:var(--accent);color:#000;text-decoration:none;white-space:nowrap;transition:opacity 150ms;"
             onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
            ▶ Iniciar
          </a>
        </div>
      </div>
      ${exerciseRows.length
        ? `<div style="padding:4px 14px 10px;">${exerciseRows}</div>`
        : `<div style="padding:10px 14px;color:#555;font-size:.85rem;">Descanso activo</div>`}
    </div>`;
  }).join('');

  const prog = plan.progression || {};
  document.getElementById('progression-weeks').innerHTML =
    ['week1','week2','week3','week4'].map((k,i) => `
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <span style="min-width:72px;color:var(--accent);font-size:.8rem;font-weight:700;padding-top:2px;">Semana ${i+1}</span>
        <span style="color:#ccc;font-size:.88rem;line-height:1.5;">${prog[k] || ''}</span>
      </div>`).join('');

  hide('generate-block');
  show('state-plan');
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load() {
  try {
    const planRes = await fetch('/api/coach/plan');

    if (planRes.status === 503) { show('state-no-key'); return; }

    const data = await planRes.json();

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
