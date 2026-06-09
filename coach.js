const db = require('./db');

const CLAUDE_MODEL  = 'claude-sonnet-4-6';
const CLAUDE_API    = 'https://api.anthropic.com/v1/messages';
const PLAN_WEEKS    = 4;
const PLAN_DAYS     = PLAN_WEEKS * 7;

const GOAL_LABELS = {
  deficit: 'Pérdida de grasa (déficit calórico -20 %)',
  recomp:  'Recomposición corporal (mantenimiento calórico)',
  gain:    'Ganancia muscular (+10% calorías)',
  bulk:    'Volumen muscular (+15% calorías)',
};

// ── DB helpers ────────────────────────────────────────────────────────────────

function dbAll(sql, params = []) {
  return new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));
}

function dbGet(sql, params = []) {
  return new Promise((res, rej) =>
    db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}

function dbRun(sql, params = []) {
  return new Promise((res, rej) =>
    db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildContext() {
  const [profile, sessions, weights] = await Promise.all([
    dbGet('SELECT * FROM tdee_profile WHERE id = 1'),
    dbAll(`
      SELECT s.id, s.date, s.exercise, e.muscle_group,
             se.sets, se.reps, se.weight
      FROM sessions s
      LEFT JOIN exercises e ON e.name = s.exercise COLLATE NOCASE
      LEFT JOIN series se   ON se.session_id = s.id
      ORDER BY s.date DESC, s.id DESC
    `),
    dbAll('SELECT date, weight_kg FROM weight_log ORDER BY date DESC LIMIT 16'),
  ]);

  // Group series by session
  const sessionMap = new Map();
  for (const row of sessions) {
    if (!sessionMap.has(row.id)) {
      sessionMap.set(row.id, {
        date: row.date, exercise: row.exercise,
        muscle_group: row.muscle_group || 'Sin clasificar', series: [],
      });
    }
    if (row.sets) {
      sessionMap.get(row.id).series.push(
        { sets: row.sets, reps: row.reps, weight: row.weight });
    }
  }
  const allSessions = Array.from(sessionMap.values());

  // Volume stats per muscle group (last 30 days)
  // First series per exercise is treated as activation (skipped for weight averages)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const muscleStats = {};
  for (const s of allSessions) {
    if (s.date < cutoff) continue;
    const mg = s.muscle_group;
    if (!muscleStats[mg]) muscleStats[mg] = { sessions: 0, totalSets: 0, weights: [] };
    muscleStats[mg].sessions++;
    for (let i = 0; i < s.series.length; i++) {
      const serie = s.series[i];
      const isActivation = i === 0 && s.series.length > 1;
      muscleStats[mg].totalSets += (serie.sets || 1);
      if (!isActivation && serie.weight) muscleStats[mg].weights.push(serie.weight);
    }
  }

  // Volume stats per exercise (all time, top 15 by tonnage; recent for double-progression)
  // First series per exercise is treated as activation: counted for volume, excluded from quality averages
  const exerciseStats = {};
  for (const s of allSessions) {
    const name = s.exercise;
    if (!name) continue;
    if (!exerciseStats[name]) {
      exerciseStats[name] = {
        totalSets: 0, weights: [], lastDate: s.date, tonnage: 0,
        recentSets: 0, recentWeights: [], recentReps: [],
      };
    }
    const isRecent = s.date >= cutoff;
    for (let i = 0; i < s.series.length; i++) {
      const serie = s.series[i];
      const isActivation = i === 0 && s.series.length > 1;
      const sets   = serie.sets   || 1;
      const reps   = serie.reps   || 0;
      const weight = serie.weight || 0;
      exerciseStats[name].totalSets += sets;
      exerciseStats[name].tonnage += sets * reps * weight;
      if (!isActivation && serie.weight) exerciseStats[name].weights.push(serie.weight);
      if (isRecent) {
        exerciseStats[name].recentSets += sets;
        if (!isActivation) {
          if (serie.weight) exerciseStats[name].recentWeights.push(serie.weight);
          if (serie.reps)   exerciseStats[name].recentReps.push(serie.reps);
        }
      }
    }
    if (s.date > exerciseStats[name].lastDate) exerciseStats[name].lastDate = s.date;
  }
  // All exercises done in the last 30 days — no limit, sorted by tonnage
  const recentExerciseStats = Object.entries(exerciseStats)
    .filter(([, s]) => s.recentSets > 0)
    .sort((a, b) => b[1].tonnage - a[1].tonnage);

  // Per-muscle-group exercise breakdown for the last 30 days
  const muscleExerciseMap = {};
  for (const s of allSessions) {
    if (s.date < cutoff || !s.exercise) continue;
    const mg = s.muscle_group || 'Sin clasificar';
    if (!muscleExerciseMap[mg]) muscleExerciseMap[mg] = {};
    const sets = s.series.reduce((sum, se) => sum + (se.sets || 1), 0);
    muscleExerciseMap[mg][s.exercise] = (muscleExerciseMap[mg][s.exercise] || 0) + sets;
  }

  // All sessions from the last 30 days (no arbitrary cap)
  const recentSessionsFull = allSessions.filter(s => s.date >= cutoff);

  return { profile, recentSessionsFull, muscleStats, recentExerciseStats, muscleExerciseMap, weights };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const CHECKIN_LABELS = {
  training_days:     { '2':'2 días/semana', '3':'3 días/semana', '4':'4 días/semana', '5':'5 días/semana', '6+':'6+ días/semana' },
  session_duration:  { '<45min':'menos de 45 min', '45-60min':'45-60 min', '60-90min':'60-90 min', '>90min':'más de 90 min' },
  prev_plan_feedback:{ 'great':'muy bien, lo completó casi siempre', 'long':'bien pero las sesiones eran largas', 'hard':'regular, le costó seguirlo', 'skipped':'no pudo seguirlo' },
};

function formatCheckin(checkin) {
  if (!checkin) return null;
  const lines = [];
  for (const [key, val] of Object.entries(checkin)) {
    if (key === 'coach_note') {
      lines.push(`- Nota del usuario: "${val}"`);
    } else {
      const label = CHECKIN_LABELS[key]?.[val] ?? val;
      lines.push(`- ${label}`);
    }
  }
  return lines.join('\n');
}

function buildPrompt(ctx, checkin) {
  const { profile, recentSessionsFull, muscleStats, recentExerciseStats, muscleExerciseMap, weights } = ctx;
  const today  = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const profileText = profile ? `
- Sexo: ${profile.gender === 'male' ? 'Hombre' : 'Mujer'}
- Edad: ${profile.age} años
- Peso: ${profile.weight_kg} kg / Altura: ${profile.height_cm} cm
- Objetivo: ${GOAL_LABELS[profile.goal] || profile.goal || 'No especificado'}
- TMB: ${Math.round(profile.bmr)} kcal | TDEE: ${Math.round(profile.tdee)} kcal | Objetivo: ${Math.round(profile.target_calories || profile.tdee)} kcal/día
- Factor actividad: ${profile.activity_factor}
`.trim() : 'Perfil no configurado.';

  const avg    = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgDec = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
  const max    = arr => arr.length ? Math.max(...arr) : null;
  const min    = arr => arr.length ? Math.min(...arr) : null;

  const muscleText = Object.keys(muscleStats).length
    ? Object.entries(muscleStats).map(([g, s]) => {
        const avgW = avg(s.weights);
        const maxW = max(s.weights);
        const weightStr = avgW ? ` | media ${avgW}kg | máx ${maxW}kg` : '';
        const exList = muscleExerciseMap[g]
          ? ' → ' + Object.entries(muscleExerciseMap[g])
              .sort((a, b) => b[1] - a[1])
              .map(([name, sets]) => `${name} (${sets} series)`)
              .join(', ')
          : '';
        return `  ${g}: ${s.sessions} entrenos | ${s.totalSets} series totales${weightStr}${exList}`;
      }).join('\n')
    : '  Sin entrenos en los últimos 30 días.';

  const weightTrend = weights.length >= 2
    ? `Peso inicial: ${weights[weights.length - 1].weight_kg} kg (${weights[weights.length - 1].date}) → Último: ${weights[0].weight_kg} kg (${weights[0].date})`
    : 'Sin datos de peso registrados.';

  const recentSessions = recentSessionsFull
    .map(s =>
      `  ${s.date} | ${s.exercise} (${s.muscle_group}) | ${s.series.map(se => `${se.sets}x${se.reps}@${se.weight ?? 'BW'}kg`).join(', ') || 'sin series'}`
    ).join('\n');

  const checkinText = formatCheckin(checkin);

  const exerciseLines = recentExerciseStats.map(([name, s]) => {
    const avgW = avg(s.weights);
    const maxW = max(s.weights);
    const weightStr = avgW ? ` | peso: media ${avgW}kg/máx ${maxW}kg` : '';
    let repsStr = '';
    if (s.recentReps.length > 0) {
      const avgR = avgDec(s.recentReps);
      const maxR = max(s.recentReps);
      const minR = min(s.recentReps);
      repsStr = ` | reps último mes: ${minR}-${maxR} (media ${avgR})`;
    }
    return `  ${name}: ${s.totalSets} series totales${weightStr}${repsStr} | último ${s.lastDate}`;
  }).join('\n');

  return `Eres un entrenador personal experto en biomecánica e hipertrofia, siempre basado en evidencia científica. Analiza el historial de entrenamiento real del usuario y genera un plan de 4 semanas adaptado a su objetivo.

HOY: ${today}

=== PERFIL DEL USUARIO ===
${profileText}

=== PREFERENCIAS Y DISPONIBILIDAD (respuestas del usuario) ===
${checkinText || '  No especificadas.'}

=== TENDENCIA DE PESO (últimas mediciones) ===
${weightTrend}

=== VOLUMEN POR GRUPO MUSCULAR (últimos 30 días) ===
${muscleText}

=== EJERCICIOS PRINCIPALES (por volumen acumulado; con reps reales del último mes) ===
NOTA: medias de peso y reps calculadas sobre series de trabajo. La primera serie por ejercicio (activación/calentamiento) está excluida de estas medias pero sí cuenta en el volumen total.
${exerciseLines || '  Ninguno registrado.'}

=== ÚLTIMAS 20 SESIONES ===
${recentSessions || '  Sin sesiones registradas aún.'}

=== INSTRUCCIONES ===
Genera una respuesta JSON con exactamente esta estructura (sin texto fuera del JSON).

REGLAS IMPORTANTES:
- day: usa siempre nombres genéricos "Día 1", "Día 2", "Día 3"… (nunca días de la semana como Lunes, Martes, etc.), ya que el usuario puede entrenar cualquier día.
- estimated_minutes: calcula el tiempo real de sesión sumando (sets_totales × 1.5 min de ejecución) + (sets_totales × 2.5 min de descanso) + 12 min de overhead (calentamiento, buscar máquinas, transiciones). Redondea a múltiplos de 5.
- weekly_weights + doble progresión: Aplica el modelo de DOBLE PROGRESIÓN para decidir los pesos:
    1. Analiza las reps reales del último mes por ejercicio (columna "reps último mes"):
       • media de reps ≥ máximo del rango - 0.5: el usuario domina ese peso → SUBE el peso de partida (semana 1) respecto al último registrado: +2.5-5 kg compuestos, +1.25-2.5 kg aislamiento.
       • media de reps < máximo del rango: el usuario aún no llega al techo → MANTÉN el mismo peso; el objetivo este mes es subir reps, no peso.
       • Sin datos de reps recientes: usa el último peso registrado (o peso conservador si ejercicio nuevo).
    2. Semanas 2-4 del plan: solo aplica subida semanal si en semana 1 ya se parte de un peso consolidado. Si el peso se mantiene, semanas 2-4 también mantienen (progreso = reps, no kg).
    3. Semana 4 = continúa la progresión normalmente (NO hagas semana de descarga) salvo que el usuario lo haya pedido explícitamente (en ese caso semana 4 = 60% de semana 3).
    4. Para ejercicios de peso corporal usa "PC". Incluye siempre la unidad (kg).
- set_scheme: elige el esquema adecuado para cada ejercicio según su posición en la sesión y el objetivo:
    "rectas" → todos los sets al mismo peso (ejercicios de aislamiento, accesorios)
    "piramide_asc" → peso creciente set a set, últimos 2 sets son los de trabajo (ejercicios compuestos principales)
    "piramide_desc" → primer set al peso máximo, va bajando (fuerza/potencia)
    "calentamiento_trabajo" → 1-2 sets ligeros de activación + sets de trabajo al peso objetivo
- set_scheme_note: frase corta (1 línea) con la regla de ejecución y progresión. Ejemplo: "Rango 8-10: cuando completes todas las series en 10 reps, sube 2.5kg el mes siguiente."
- peso de activación: para ejercicios con esquema "calentamiento_trabajo", la serie de activación se carga siempre al 65-70% del peso de trabajo actual. Este porcentaje es fijo y escala automáticamente: si el peso de trabajo sube de 60 kg a 65 kg, la activación pasa de ~40 kg a ~43 kg sin necesidad de recalcular. Indica este porcentaje en el set_scheme_note y en progression_note para que el usuario lo tenga claro.
- session_weights_week1: array con el peso exacto de cada set en la semana 1 (longitud = sets). Para "rectas" todos iguales. Para pirámide, mostrar la progresión real. Para "calentamiento_trabajo": el primer elemento es el peso de activación (~65-70% del peso de trabajo), los demás son el peso de trabajo. Usa siempre la unidad (kg o "PC").
- progression_note: 1-2 frases explicando la lógica de peso para este ejercicio. Cuando haya activación, exprésala como porcentaje del peso de trabajo (no como valor fijo) para que escale automáticamente al subir de peso. Ejemplo: "Media 9.8 reps a 60 kg en series de trabajo → ya domina el peso. Subimos a 62.5 kg de trabajo; activación siempre al ~65% (~40 kg). Cuando completes todas las series de trabajo a 10 reps, sube a 65 kg el mes que viene."
- alternative: nombre de UN ejercicio alternativo que trabaje el mismo músculo y se pueda hacer con equipamiento diferente (por si la máquina no está libre). Ejemplo: si el principal es "Press banca", el alternativo podría ser "Press mancuernas inclinado". Una sola frase corta, sin más detalles.

{
  "analysis": {
    "strengths": ["punto fuerte 1", "punto fuerte 2"],
    "gaps": ["carencia 1", "carencia 2"],
    "imbalances": ["desequilibrio 1"],
    "summary": "Párrafo breve (3-4 frases) valorando el historial del usuario."
  },
  "weekly_plan": {
    "structure": "Descripción del split elegido (ej: Push/Pull/Legs 3 días/semana)",
    "rationale": "Por qué este split es adecuado para su objetivo.",
    "days": [
      {
        "day": "Día 1",
        "focus": "Push",
        "estimated_minutes": 65,
        "exercises": [
          {
            "name": "Nombre ejercicio",
            "sets": 4,
            "reps": "8-10",
            "notes": "nota opcional",
            "alternative": "Nombre del ejercicio alternativo",
            "set_scheme": "rectas",
            "set_scheme_note": "Rango 8-10: cuando completes todas las series en 10 reps, sube 2.5kg el mes siguiente.",
            "progression_note": "Media 9.8 reps a 60kg el mes pasado → ya domina el peso. Subimos a 62.5kg. Cuando completes 4×10, sube a 65kg el mes que viene.",
            "session_weights_week1": ["62.5kg","62.5kg","62.5kg","62.5kg"],
            "weekly_weights": {
              "week1": "62.5kg",
              "week2": "62.5kg",
              "week3": "65kg",
              "week4": "65kg"
            }
          }
        ]
      }
    ]
  },
  "progression": {
    "week1": "Descripción semana 1 (adaptación/volumen/etc.)",
    "week2": "Descripción semana 2",
    "week3": "Descripción semana 3",
    "week4": "Descripción semana 4 (descarga o test)"
  },
  "next_review": "${new Date(Date.now() + PLAN_DAYS * 86400000).toISOString().slice(0, 10)}"
}

Usa preferentemente los ejercicios que ya hace el usuario. El plan debe ser realista, sin inventar equipamiento que no se infiere del historial. IMPORTANTE: los nombres de ejercicio en el plan deben coincidir exactamente con los del historial del usuario (misma ortografía, mismo idioma), para que el seguimiento automático pueda cruzarlos. Si propones un ejercicio nuevo que el usuario no ha registrado nunca, puedes nombrarlo libremente.`;
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada.');

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 16000,
      thinking:   { type: 'adaptive' },
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (data.stop_reason === 'max_tokens') {
    throw new Error('La respuesta fue demasiado larga y se cortó. Inténtalo de nuevo.');
  }

  const raw  = data.content?.[0]?.text || '';
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Claude no devolvió JSON válido.');

  try {
    return { parsed: JSON.parse(json), raw };
  } catch (e) {
    throw new Error(`JSON inválido en la respuesta de Claude: ${e.message}`);
  }
}

// ── Week helpers ──────────────────────────────────────────────────────────────

function getWeekMonday(d = new Date()) {
  const day  = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function getWeekSunday(mondayStr) {
  const d = new Date(mondayStr + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ── Weekly weights prompt ─────────────────────────────────────────────────────

async function buildWeeklyPrompt(plan, allSessions) {
  const today = new Date().toISOString().slice(0, 10);

  const planExercises = [];
  for (const day of (plan.weekly_plan?.days || [])) {
    for (const ex of (day.exercises || [])) {
      if (ex.name) planExercises.push({
        name:       ex.name,
        sets:       ex.sets,
        reps:       ex.reps,
        scheme:     ex.set_scheme || 'rectas',
        planWeights: ex.session_weights_week1 || [],
      });
    }
  }

  const sections = planExercises.map(ex => {
    const sessions = allSessions
      .filter(s => s.exercise && s.exercise.toLowerCase() === ex.name.toLowerCase())
      .slice(0, 8);

    const maxW = sessions
      .flatMap(s => s.series.map(se => se.weight))
      .filter(w => w != null && w > 0)
      .reduce((m, w) => Math.max(m, w), 0);

    const histLines = sessions.length
      ? sessions.map(s => {
          const sr = s.series.map(se => `${se.sets}x${se.reps}@${se.weight ?? 'PC'}kg`).join(', ');
          return `  ${s.date}: ${sr}`;
        }).join('\n')
      : '  Sin historial.';

    return `${ex.name} (${ex.sets} series × ${ex.reps} | esquema: ${ex.scheme} | plan: ${ex.planWeights.join(', ') || '—'} | máx histórico: ${maxW ? maxW + 'kg' : 'N/A'}):\n${histLines}`;
  }).join('\n\n');

  return `Eres un entrenador personal experto. Sugiere el peso exacto para CADA SET de cada ejercicio del plan esta semana, basándote en el historial real del usuario.

HOY: ${today}

=== EJERCICIOS DEL PLAN (con historial reciente) ===
${sections}

=== INSTRUCCIONES ===
- Devuelve un array con el peso para cada set (longitud exacta = número de sets del ejercicio)
- Basa los pesos en el historial: si el usuario maneja más peso del plan, sube; si no llega, ajusta
- Respeta el esquema: piramide_asc = pesos crecientes; rectas = todos iguales; calentamiento_trabajo = primer elemento al ~65% del peso de trabajo, resto = peso de trabajo
- Para peso corporal usa "PC"; incluye siempre la unidad (ej: "22.5kg", "45kg")
- RESPONDE SOLO CON JSON, sin texto adicional:

{
  "NombreEjercicio1": ["pesoSet1", "pesoSet2", "pesoSet3", "pesoSet4"],
  "NombreEjercicio2": ["pesoSet1", "pesoSet2"]
}`;
}

async function generateWeeklyWeights() {
  const weekStart = getWeekMonday();

  const existing = await dbGet('SELECT id FROM weekly_weights WHERE week_start = ?', [weekStart]);
  if (existing) throw new Error('Ya tienes pesos generados para esta semana. Se podrán recalcular la semana que viene.');

  const planRow = await getLatestPlan();
  if (!planRow) throw new Error('No hay plan activo. Genera un plan primero.');

  const plan  = JSON.parse(planRow.plan_json);
  const ctx   = await buildContext();
  const prompt = await buildWeeklyPrompt(plan, ctx.recentSessionsFull);
  const { parsed } = await callClaude(prompt);

  const validUntil = getWeekSunday(weekStart);

  await dbRun(
    `INSERT INTO weekly_weights (week_start, generated_at, valid_until, weights_json)
     VALUES (?, CURRENT_TIMESTAMP, ?, ?)`,
    [weekStart, validUntil, JSON.stringify(parsed)]
  );

  return { weekStart, validUntil, weights: parsed };
}

async function getLatestWeeklyWeights() {
  const weekStart = getWeekMonday();
  return dbGet('SELECT * FROM weekly_weights WHERE week_start = ?', [weekStart]);
}

// ── Extra workout ─────────────────────────────────────────────────────────────

function buildExtraWorkoutPrompt(plan, ctx) {
  const { muscleStats, muscleExerciseMap } = ctx;
  const today = new Date().toISOString().slice(0, 10);

  const planDays = (plan.weekly_plan?.days || []).map(d =>
    `  ${d.day} — ${d.focus}: ${(d.exercises || []).map(e => e.name).join(', ')}`
  ).join('\n');

  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const muscleText = Object.entries(muscleStats).map(([g, s]) => {
    const avgW = avg(s.weights);
    const exList = muscleExerciseMap[g]
      ? ' → ' + Object.entries(muscleExerciseMap[g])
          .sort((a, b) => b[1] - a[1])
          .map(([name, sets]) => `${name} (${sets} series)`)
          .join(', ')
      : '';
    return `  ${g}: ${s.sessions} entrenos | ${s.totalSets} series${avgW ? ` | media ${avgW}kg` : ''}${exList}`;
  }).join('\n') || '  Sin datos recientes.';

  return `Eres un entrenador personal experto en biomecánica e hipertrofia, siempre basado en evidencia científica.

El usuario tiene el siguiente plan semanal activo y quiere hacer un entrenamiento adicional no planificado.

HOY: ${today}

=== PLAN SEMANAL ACTIVO ===
${planDays}

=== VOLUMEN POR GRUPO MUSCULAR (últimos 30 días) ===
${muscleText}

=== INSTRUCCIONES ===
Diseña UN ÚNICO entreno complementario que:
1. Trabaje los grupos musculares más retrasados o con menor volumen en el plan actual.
2. No repita los mismos ejercicios principales del plan (solo si son imprescindibles).
3. Sea equilibrado y realista para una sesión extra de gimnasio.
4. Tenga entre 4 y 7 ejercicios.
5. Aplica los mismos criterios de doble progresión y esquemas de sets que en el plan principal.
6. Para estimated_minutes: calcula (sets_totales × 1.5 min de ejecución) + (sets_totales × 2.5 min de descanso) + 12 min de overhead (calentamiento, buscar máquinas, transiciones). Redondea a múltiplos de 5.

Responde SOLO con JSON (sin texto adicional), con exactamente esta estructura:

{
  "day": "Entreno adicional",
  "focus": "descripción corta del enfoque (ej: Piernas + Core)",
  "estimated_minutes": 55,
  "exercises": [
    {
      "name": "Nombre ejercicio",
      "sets": 3,
      "reps": "10-12",
      "notes": "nota opcional",
      "alternative": "ejercicio alternativo",
      "set_scheme": "rectas",
      "set_scheme_note": "Rango 10-12: cuando completes todas las series en 12 reps, sube 2.5kg.",
      "session_weights_week1": ["20kg","20kg","20kg"],
      "progression_note": "Breve explicación del peso elegido."
    }
  ]
}`;
}

async function generateExtraWorkout() {
  const planRow = await getLatestPlan();
  if (!planRow) throw new Error('No hay plan activo. Genera un plan primero.');

  const plan   = JSON.parse(planRow.plan_json);
  const ctx    = await buildContext();
  const prompt = buildExtraWorkoutPrompt(plan, ctx);
  const { parsed } = await callClaude(prompt);

  const weekStart = getWeekMonday();
  await dbRun(
    `INSERT OR REPLACE INTO extra_workouts (week_start, generated_at, workout_json)
     VALUES (?, CURRENT_TIMESTAMP, ?)`,
    [weekStart, JSON.stringify(parsed)]
  );

  return parsed;
}

async function getLatestExtraWorkout() {
  return dbGet(
    `SELECT * FROM extra_workouts WHERE generated_at >= datetime('now', '-2 days') ORDER BY generated_at DESC LIMIT 1`
  );
}

async function deleteExtraWorkout() {
  return dbRun(`DELETE FROM extra_workouts`);
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getLatestPlan() {
  return dbGet(`
    SELECT * FROM coach_plans
    ORDER BY generated_at DESC LIMIT 1
  `);
}

async function generatePlan(checkin = null) {
  const ctx    = await buildContext();
  const prompt = buildPrompt(ctx, checkin);
  const { parsed, raw } = await callClaude(prompt);

  const validUntil = parsed.next_review ||
    new Date(Date.now() + PLAN_DAYS * 86400000).toISOString().slice(0, 10);

  await dbRun('DELETE FROM weekly_weights WHERE week_start = ?', [getWeekMonday()]);
  await dbRun('DELETE FROM extra_workouts WHERE week_start = ?', [getWeekMonday()]);

  await dbRun(
    `INSERT INTO coach_plans (generated_at, valid_until, plan_json, raw_response)
     VALUES (CURRENT_TIMESTAMP, ?, ?, ?)`,
    [validUntil, JSON.stringify(parsed), raw]
  );

  return parsed;
}

module.exports = { getLatestPlan, generatePlan, generateWeeklyWeights, getLatestWeeklyWeights, generateExtraWorkout, getLatestExtraWorkout, deleteExtraWorkout };
