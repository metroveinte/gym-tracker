const PLAN_DAYS = 28;

function hide(id) { document.getElementById(id).classList.add('hidden'); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }

function toggleCollapse(bodyId, chevronId) {
  const body    = document.getElementById(bodyId);
  const chevron = document.getElementById(chevronId);
  if (!body) return;
  const collapsed = body.classList.contains('is-collapsed') || body.style.maxHeight === '0px' || body.style.maxHeight === '0';
  if (collapsed) {
    body.classList.remove('is-collapsed');
    body.classList.remove('is-open');
    body.style.overflow  = 'hidden';
    body.style.maxHeight = body.scrollHeight + 'px';
    body.style.opacity   = '1';
    chevron?.classList.remove('is-collapsed');
    // Set to none after transition — use both transitionend and a timeout fallback for Safari
    const done = () => {
      body.style.maxHeight = 'none';
      body.classList.add('is-open');
    };
    const timer = setTimeout(done, 350);
    body.addEventListener('transitionend', () => { clearTimeout(timer); done(); }, { once: true });
  } else {
    body.classList.remove('is-open');
    body.style.overflow  = 'hidden';
    body.style.maxHeight = body.scrollHeight + 'px';
    body.offsetHeight; // force reflow
    body.style.maxHeight = '0';
    body.style.opacity   = '0';
    body.classList.add('is-collapsed');
    chevron?.classList.add('is-collapsed');
  }
}

function fmt(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function fmtDatetime(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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

async function readSSE(res) {
  const reader  = res.body.getReader();
  const dec     = new TextDecoder();
  let buf = '';
  let result = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { result = JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
  return result;
}

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
    const data = await readSSE(res);
    if (!data) throw new Error('Sin respuesta del servidor.');
    if (data.error) throw new Error(data.error);
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

function renderPlan(plan, generatedAt, validUntil, weeklyWeights = null) {
  // Build case-insensitive lookup for weekly weights
  const weeklyMap = weeklyWeights
    ? Object.fromEntries(Object.entries(weeklyWeights).map(([k, v]) => [k.toLowerCase(), v]))
    : null;
  const genDate   = generatedAt ? fmtDatetime(generatedAt) : '—';
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

  document.getElementById('plan-days').innerHTML = (wp.days || []).map((d, dayIdx) => {
    const mins = d.estimated_minutes;
    const timeChip = mins
      ? `<span style="background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent);border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;font-family:'JetBrains Mono',monospace;">⏱ ~${mins} min</span>`
      : '';

    const exerciseRows = (d.exercises || []).map(ex => {
      const sw1 = ex.session_weights_week1 || [];

      // Per-set weights: weekly suggestion overrides plan weights when available
      const weeklyW    = weeklyMap?.[ex.name.toLowerCase()];
      const setsToShow = (weeklyW && weeklyW.length) ? weeklyW : sw1;
      const isAdj      = !!(weeklyW && weeklyW.length);

      const setsRow = setsToShow.length ? `
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;align-items:center;">
          <span style="font-size:.7rem;color:${isAdj ? '#4caf50' : '#555'};margin-right:2px;">${isAdj ? '✦ ajustado:' : 'esta sem:'}</span>
          ${setsToShow.map((w, i) => `
            <span style="font-size:.75rem;padding:2px 7px;border-radius:4px;background:${isAdj ? 'rgba(76,175,80,0.12)' : 'var(--bg-raised)'};border:1px solid ${isAdj ? 'rgba(76,175,80,0.35)' : 'var(--border)'};color:${isAdj ? '#a5d6a7' : '#ccc'};font-family:'JetBrains Mono',monospace;">
              Set${i+1} <strong style="color:${isAdj ? '#c8e6c9' : 'var(--text)'};">${w}</strong>
            </span>`).join('')}
        </div>` : '';

      // Alternative exercise
      const altInline = ex.alternative
        ? `<div style="text-align:right;margin-top:3px;word-break:break-word;overflow-wrap:break-word;">
            <span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:700;">Alternativa:</span>
            <span style="font-size:.76rem;color:#888;margin-left:4px;">${ex.alternative}</span>
          </div>`
        : '';

      // Scheme execution note
      const schemeNote = ex.set_scheme_note
        ? `<div style="color:#555;font-size:.76rem;margin-top:4px;line-height:1.4;font-style:italic;word-break:break-word;overflow-wrap:break-word;">${ex.set_scheme_note}</div>`
        : '';

      // Coach progression explanation — prominent
      const progressionNote = ex.progression_note
        ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(229,48,58,.08);border-left:3px solid rgba(229,48,58,.5);border-radius:0 6px 6px 0;">
            <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);font-weight:700;margin-bottom:3px;">📈 Análisis del coach</div>
            <div style="font-size:.82rem;color:#bbb;line-height:1.55;word-break:break-word;overflow-wrap:break-word;">${ex.progression_note}</div>
          </div>`
        : '';

      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">
            <span style="color:var(--text);font-size:.88rem;font-weight:600;flex:1;min-width:0;word-break:break-word;">${ex.name}</span>
            <div style="text-align:right;min-width:0;max-width:100%;">
              <div style="color:#888;font-size:.82rem;word-break:break-word;">${ex.sets}×${ex.reps}${ex.notes ? ' · <em style=color:#666>' + ex.notes + '</em>' : ''}</div>
              ${altInline}
            </div>
          </div>
          ${schemeNote}
          ${setsRow}
          ${progressionNote}
        </div>`;
    }).join('');

    return `
    <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;">
      <div class="collapse-header" onclick="toggleCollapse('day-body-${dayIdx}','day-chev-${dayIdx}')"
           style="background:var(--bg-raised);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <svg id="day-chev-${dayIdx}" class="collapse-chevron is-collapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;"><polyline points="6 9 12 15 18 9"/></svg>
          <span style="font-weight:700;font-size:.95rem;">${d.day}</span>
          <span style="color:#888;font-size:.82rem;">${d.focus}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${timeChip}
          <a href="/sessions?plandia=${dayIdx}&playfocus=${encodeURIComponent(d.focus)}"
             onclick="event.stopPropagation()"
             style="font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:4px;background:var(--accent);color:#000;text-decoration:none;white-space:nowrap;transition:opacity 150ms;"
             onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
            ▶ Registrar
          </a>
        </div>
      </div>
      <div id="day-body-${dayIdx}" class="collapse-body" style="max-height:0;opacity:0;">
        ${exerciseRows.length
          ? `<div style="padding:4px 14px 10px;">${exerciseRows}</div>`
          : `<div style="padding:10px 14px;color:#555;font-size:.85rem;">Descanso activo</div>`}
      </div>
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

// ── Extra workout ─────────────────────────────────────────────────────────────

function renderExtraWorkoutDay(workout) {
  const slot = document.getElementById('extra-workout-slot');
  if (!slot || !workout) return;

  const mins = workout.estimated_minutes;
  const timeChip = mins
    ? `<span style="background:rgba(255,193,7,.12);color:#ffc107;border:1px solid rgba(255,193,7,.5);border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;white-space:nowrap;font-family:'JetBrains Mono',monospace;">⏱ ~${mins} min</span>`
    : '';

  const exerciseRows = (workout.exercises || []).map(ex => {
    const sw1 = ex.session_weights_week1 || [];
    const setsRow = sw1.length ? `
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px;align-items:center;">
        <span style="font-size:.7rem;color:#555;margin-right:2px;">esta sem:</span>
        ${sw1.map((w, i) => `
          <span style="font-size:.75rem;padding:2px 7px;border-radius:4px;background:var(--bg-raised);border:1px solid var(--border);color:#ccc;font-family:'JetBrains Mono',monospace;">
            Set${i+1} <strong style="color:var(--text);">${w}</strong>
          </span>`).join('')}
      </div>` : '';

    const altInline = ex.alternative
      ? `<div style="text-align:right;margin-top:3px;word-break:break-word;overflow-wrap:break-word;">
          <span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#ffc107;font-weight:700;">Alternativa:</span>
          <span style="font-size:.76rem;color:#888;margin-left:4px;">${ex.alternative}</span>
        </div>`
      : '';

    const schemeNote = ex.set_scheme_note
      ? `<div style="color:#555;font-size:.76rem;margin-top:4px;line-height:1.4;font-style:italic;word-break:break-word;overflow-wrap:break-word;">${ex.set_scheme_note}</div>`
      : '';

    const progressionNote = ex.progression_note
      ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(255,193,7,.06);border-left:3px solid rgba(255,193,7,.4);border-radius:0 6px 6px 0;">
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:#ffc107;font-weight:700;margin-bottom:3px;">📈 Análisis del coach</div>
          <div style="font-size:.82rem;color:#bbb;line-height:1.55;word-break:break-word;overflow-wrap:break-word;">${ex.progression_note}</div>
        </div>`
      : '';

    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">
          <span style="color:var(--text);font-size:.88rem;font-weight:600;flex:1;min-width:0;word-break:break-word;">${ex.name}</span>
          <div style="text-align:right;min-width:0;max-width:100%;">
            <div style="color:#888;font-size:.82rem;word-break:break-word;">${ex.sets}×${ex.reps}${ex.notes ? ' · <em style=color:#666>' + ex.notes + '</em>' : ''}</div>
            ${altInline}
          </div>
        </div>
        ${schemeNote}
        ${setsRow}
        ${progressionNote}
      </div>`;
  }).join('');

  slot.innerHTML = `
    <div style="border:1px solid rgba(255,193,7,.35);border-radius:var(--r-sm);overflow:hidden;margin-top:4px;">
      <div class="collapse-header" onclick="toggleCollapse('extra-body','extra-chev')"
           style="background:rgba(255,193,7,.07);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:nowrap;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden;">
          <svg id="extra-chev" class="collapse-chevron is-collapsed" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
          <span style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${workout.day || 'Entreno adicional'}</span>
          <span style="color:#ffc107;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${workout.focus || ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:nowrap;">
          ${timeChip}
          <a href="/sessions?plandia=extra&playfocus=${encodeURIComponent(workout.focus || '')}"
             onclick="event.stopPropagation()"
             style="font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:4px;background:rgba(255,193,7,.85);color:#000;text-decoration:none;white-space:nowrap;transition:opacity 150ms;"
             onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
            ▶ Registrar
          </a>
          <button onclick="event.stopPropagation(); handleExtraDelete(this)"
                  style="width:auto;margin-top:0;text-transform:none;font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:4px;background:#e5303a;color:#fff;border:none;cursor:pointer;white-space:nowrap;transition:opacity 150ms;"
                  onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">
            × Eliminar
          </button>
        </div>
      </div>
      <div id="extra-body" class="collapse-body" style="max-height:0;opacity:0;">
        ${exerciseRows.length
          ? `<div style="padding:4px 14px 10px;">${exerciseRows}</div>`
          : `<div style="padding:10px 14px;color:#555;font-size:.85rem;">Sin ejercicios.</div>`}
      </div>
    </div>`;
}

function renderExtraWorkoutBar(hasWorkout) {
  const bar      = document.getElementById('extra-workout-bar');
  const btn      = document.getElementById('extra-workout-btn');
  const done     = document.getElementById('extra-workout-done');
  const regenBtn = document.getElementById('extra-workout-regen-btn');
  if (!bar) return;

  bar.style.display = '';

  if (hasWorkout) {
    btn.style.display        = 'none';
    done.style.display       = '';
    regenBtn.style.display   = '';
    regenBtn.disabled        = true;
    regenBtn.style.opacity   = '0.4';
    regenBtn.style.cursor    = 'not-allowed';
  } else {
    btn.style.display        = '';
    done.style.display       = 'none';
    regenBtn.style.display   = 'none';
    regenBtn.disabled        = false;
    regenBtn.style.opacity   = '';
    regenBtn.style.cursor    = '';
  }
}

// ── Weekly weights bar ────────────────────────────────────────────────────────

function renderWeeklyWeightsBar(ww) {
  const container  = document.getElementById('weekly-weights-bar');
  const btn        = document.getElementById('weekly-weights-btn');
  const doneLabel  = document.getElementById('weekly-weights-done');
  const validWrap  = document.getElementById('weekly-validity-wrap');
  const validLabel = document.getElementById('weekly-validity-label');
  const daysLeftEl = document.getElementById('weekly-days-left');
  const bar        = document.getElementById('weekly-progress-bar');
  if (!container) return;

  container.style.display = '';

  if (!ww) {
    btn.style.display      = '';
    doneLabel.style.display = 'none';
    validWrap.style.display = 'none';
    return;
  }

  btn.style.display       = 'none';
  doneLabel.style.display = '';
  validWrap.style.display = '';

  const monday  = new Date(ww.week_start + 'T00:00:00');
  const sunday  = new Date(ww.valid_until + 'T00:00:00');
  const now     = new Date();
  const elapsed = (now - monday) / 86400000;
  const pct     = Math.max(0, Math.min(100, (elapsed / 7) * 100));
  const left    = Math.max(0, Math.round((sunday - now) / 86400000));

  validLabel.textContent = `${fmt(ww.week_start)} → ${fmt(ww.valid_until)}`;
  daysLeftEl.textContent = left > 0 ? `${left} días restantes` : 'Expiran hoy';
  bar.style.width        = pct + '%';
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

    const [wwRes, ewRes] = await Promise.all([
      fetch('/api/coach/weekly-weights'),
      fetch('/api/coach/extra-workout'),
    ]);
    const ww = wwRes.ok ? await wwRes.json() : null;
    const ew = ewRes.ok ? await ewRes.json() : null;

    renderPlan(data.plan_json, data.generated_at, data.valid_until, ww?.weights_json || null);
    renderWeeklyWeightsBar(ww);
    renderExtraWorkoutBar(!!ew);
    if (ew) {
      renderExtraWorkoutDay(ew.workout_json);
    } else {
      const slot = document.getElementById('extra-workout-slot');
      if (slot) slot.innerHTML = '';
    }
  } catch (e) {
    show('state-no-data');
  }
}

// ── Listeners ─────────────────────────────────────────────────────────────────

document.getElementById('generate-btn')?.addEventListener('click', () => generate(false));
document.getElementById('pdf-btn')?.addEventListener('click', () => window.print());
document.getElementById('regenerate-btn')?.addEventListener('click', () => generate(true));

async function generateExtraWorkout(btn) {
  const origText = btn.textContent;
  btn.textContent = 'Generando…';
  btn.disabled    = true;
  try {
    const res = await fetch('/api/coach/extra-workout', { method: 'POST' });
    if (res.status === 503) {
      await showAlert('Sin API key', '<p style="color:#ccc;">API key no configurada en el servidor.</p>');
      btn.textContent = origText;
      btn.disabled    = false;
      return;
    }
    const data = await readSSE(res);
    if (!data) throw new Error('Sin respuesta del servidor.');
    if (data.error) throw new Error(data.error);
    await load();
  } catch (e) {
    btn.textContent = origText;
    btn.disabled    = false;
    await showAlert('Error al generar', `<p style="color:#ccc;">${e.message}</p>`);
  }
}

document.getElementById('extra-workout-btn')?.addEventListener('click', function () { generateExtraWorkout(this); });
document.getElementById('extra-workout-regen-btn')?.addEventListener('click', function () { generateExtraWorkout(this); });

async function handleExtraDelete(btn) {
  const origText = btn.textContent;
  btn.disabled   = true;
  btn.textContent = 'Eliminando…';
  try {
    await fetch('/api/coach/extra-workout', { method: 'DELETE' });
    await load();
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = origText;
  }
}

document.getElementById('weekly-weights-btn')?.addEventListener('click', async () => {
  const btn      = document.getElementById('weekly-weights-btn');
  const origText = btn.textContent;
  btn.textContent = 'Generando…';
  btn.disabled    = true;
  try {
    const res = await fetch('/api/coach/weekly-weights', { method: 'POST' });
    if (res.status === 503) {
      await showAlert('Sin API key', '<p style="color:#ccc;">API key no configurada en el servidor.</p>');
      btn.textContent = origText;
      btn.disabled    = false;
      return;
    }
    const data = await readSSE(res);
    if (!data) throw new Error('Sin respuesta del servidor.');
    if (data.error) throw new Error(data.error);
    await load();
  } catch (e) {
    btn.textContent = origText;
    btn.disabled    = false;
    await showAlert('Error al generar', `<p style="color:#ccc;">${e.message}</p>`);
  }
});

load();
