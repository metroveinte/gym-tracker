const PROTEIN_PER_KG = {
  deficit: 2.2,
  recomp:  2.0,
  gain:    1.8,
  bulk:    1.6,
};

const GOAL_LABELS = {
  deficit: 'Pérdida de grasa',
  recomp:  'Recomposición corporal',
  gain:    'Ganancia muscular',
  bulk:    'Volumen muscular',
};

function calcMacros(profile) {
  const { weight_kg, goal, target_calories } = profile;
  const protKg = PROTEIN_PER_KG[goal] || 2.0;

  const protein_g    = Math.round(weight_kg * protKg);
  const protein_kcal = protein_g * 4;
  const fat_kcal     = Math.round(target_calories * 0.25);
  const fat_g        = Math.round(fat_kcal / 9);
  const carbs_kcal   = Math.max(0, Math.round(target_calories - protein_kcal - fat_kcal));
  const carbs_g      = Math.round(carbs_kcal / 4);

  const total = protein_kcal + fat_kcal + carbs_kcal;
  const pPct  = Math.round((protein_kcal / total) * 100);
  const fPct  = Math.round((fat_kcal / total) * 100);
  const cPct  = 100 - pPct - fPct;

  return { protein_g, protein_kcal, fat_g, fat_kcal, carbs_g, carbs_kcal, pPct, fPct, cPct, protKg };
}

function macroRow(label, grams, kcal, pct, color) {
  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px;">
        <span style="color:#aaa; font-size:.88rem; text-transform:uppercase; letter-spacing:.04em;">${label}</span>
        <div style="display:flex; align-items:baseline; gap:10px;">
          <span style="color:#fff; font-size:1.25rem; font-weight:700; font-family:'Oswald',sans-serif; line-height:1;">${grams}g</span>
          <span style="color:#555; font-size:.75rem;">${kcal} kcal &middot; ${pct}%</span>
        </div>
      </div>
      <div style="background:var(--bg-raised); border-radius:4px; height:5px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition:width 700ms cubic-bezier(.23,1,.32,1);"></div>
      </div>
    </div>`;
}

async function loadMacros() {
  const card = document.getElementById('macros-card');
  try {
    const res     = await fetch('/api/tdee');
    const profile = await res.json();

    if (!profile) {
      card.innerHTML = `
        <div style="text-align:center; padding:24px 16px;">
          <div style="font-size:2rem; margin-bottom:12px;">📊</div>
          <p style="color:#666; margin:0;">Configura tu <a href="/tmb" style="color:var(--accent);">perfil TMB</a> para ver tu objetivo de macros.</p>
        </div>`;
      return;
    }

    const m = calcMacros(profile);
    const goalLabel = GOAL_LABELS[profile.goal] || profile.goal || 'No especificado';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
        <h2 style="margin:0;">Objetivo macro diario</h2>
        <div style="text-align:right;">
          <div style="color:#fff; font-size:1.05rem; font-family:'Oswald',sans-serif;">${Math.round(profile.target_calories)} kcal/día</div>
          <div style="color:#555; font-size:.75rem;">${goalLabel}</div>
        </div>
      </div>

      <!-- Barra apilada -->
      <div style="display:flex; border-radius:6px; overflow:hidden; height:8px; margin-bottom:24px; gap:2px;">
        <div style="width:${m.pPct}%; background:#e57373; transition:width 700ms cubic-bezier(.23,1,.32,1);"></div>
        <div style="width:${m.cPct}%; background:#ffd54f; transition:width 700ms cubic-bezier(.23,1,.32,1);"></div>
        <div style="width:${m.fPct}%; background:#81c784; transition:width 700ms cubic-bezier(.23,1,.32,1);"></div>
      </div>

      <!-- Filas de macros -->
      <div style="display:flex; flex-direction:column; gap:18px;">
        ${macroRow('Proteína', m.protein_g, m.protein_kcal, m.pPct, '#e57373')}
        ${macroRow('Carbohidratos', m.carbs_g, m.carbs_kcal, m.cPct, '#ffd54f')}
        ${macroRow('Grasas', m.fat_g, m.fat_kcal, m.fPct, '#81c784')}
      </div>

      <p style="color:#3a3a3a; font-size:.72rem; margin-top:20px; margin-bottom:0; line-height:1.6;">
        Proteína a ${m.protKg}g/kg · Grasas al 25% de kcal objetivo · Carbos: calorías restantes ·
        <a href="/tmb" style="color:#4a4a4a;">Actualizar perfil</a>
      </p>`;
  } catch (e) {
    card.innerHTML = `<p style="color:#555; text-align:center;">Error al cargar el perfil.</p>`;
  }
}

loadMacros();
