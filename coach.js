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
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const muscleStats = {};
  for (const s of allSessions) {
    if (s.date < cutoff) continue;
    const mg = s.muscle_group;
    if (!muscleStats[mg]) muscleStats[mg] = { sessions: 0, totalSets: 0, weights: [] };
    muscleStats[mg].sessions++;
    for (const serie of s.series) {
      muscleStats[mg].totalSets += (serie.sets || 1);
      if (serie.weight) muscleStats[mg].weights.push(serie.weight);
    }
  }

  // Volume stats per exercise (all time, top 15 by tonnage)
  const exerciseStats = {};
  for (const s of allSessions) {
    const name = s.exercise;
    if (!name) continue;
    if (!exerciseStats[name]) {
      exerciseStats[name] = { totalSets: 0, weights: [], lastDate: s.date, tonnage: 0 };
    }
    for (const serie of s.series) {
      const sets   = serie.sets   || 1;
      const reps   = serie.reps   || 0;
      const weight = serie.weight || 0;
      exerciseStats[name].totalSets += sets;
      if (serie.weight) exerciseStats[name].weights.push(serie.weight);
      exerciseStats[name].tonnage += sets * reps * weight;
    }
    if (s.date > exerciseStats[name].lastDate) exerciseStats[name].lastDate = s.date;
  }
  const topExerciseStats = Object.entries(exerciseStats)
    .sort((a, b) => b[1].tonnage - a[1].tonnage)
    .slice(0, 15);

  return { profile, allSessions: allSessions.slice(0, 60), muscleStats, topExerciseStats, weights };
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
  const { profile, allSessions, muscleStats, topExerciseStats, weights } = ctx;
  const today = new Date().toISOString().slice(0, 10);

  const profileText = profile ? `
- Sexo: ${profile.gender === 'male' ? 'Hombre' : 'Mujer'}
- Edad: ${profile.age} años
- Peso: ${profile.weight_kg} kg / Altura: ${profile.height_cm} cm
- Objetivo: ${GOAL_LABELS[profile.goal] || profile.goal || 'No especificado'}
- TMB: ${Math.round(profile.bmr)} kcal | TDEE: ${Math.round(profile.tdee)} kcal | Objetivo: ${Math.round(profile.target_calories || profile.tdee)} kcal/día
- Factor actividad: ${profile.activity_factor}
`.trim() : 'Perfil no configurado.';

  const avg  = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const max  = arr => arr.length ? Math.max(...arr) : null;

  const muscleText = Object.keys(muscleStats).length
    ? Object.entries(muscleStats).map(([g, s]) => {
        const avgW = avg(s.weights);
        const maxW = max(s.weights);
        const weightStr = avgW ? ` | media ${avgW}kg | máx ${maxW}kg` : '';
        return `  ${g}: ${s.sessions} sesiones | ${s.totalSets} series totales${weightStr}`;
      }).join('\n')
    : '  Sin sesiones en los últimos 30 días.';

  const weightTrend = weights.length >= 2
    ? `Peso inicial: ${weights[weights.length - 1].weight_kg} kg (${weights[weights.length - 1].date}) → Último: ${weights[0].weight_kg} kg (${weights[0].date})`
    : 'Sin datos de peso registrados.';

  const recentSessions = allSessions.slice(0, 20).map(s =>
    `  ${s.date} | ${s.exercise} (${s.muscle_group}) | ${s.series.map(se => `${se.sets}x${se.reps}@${se.weight ?? 'BW'}kg`).join(', ') || 'sin series'}`
  ).join('\n');

  const checkinText = formatCheckin(checkin);

  return `Eres un entrenador personal experto. Analiza el historial de entrenamiento real del usuario y genera un plan de 4 semanas adaptado a su objetivo.

HOY: ${today}

=== PERFIL DEL USUARIO ===
${profileText}

=== PREFERENCIAS Y DISPONIBILIDAD (respuestas del usuario) ===
${checkinText || '  No especificadas.'}

=== TENDENCIA DE PESO (últimas mediciones) ===
${weightTrend}

=== VOLUMEN POR GRUPO MUSCULAR (últimos 30 días) ===
${muscleText}

=== EJERCICIOS PRINCIPALES (por volumen acumulado, todos los tiempos) ===
${topExerciseStats.length
  ? topExerciseStats.map(([name, s]) => {
      const avgW = avg(s.weights);
      const maxW = max(s.weights);
      const weightStr = avgW ? ` | media ${avgW}kg | máx ${maxW}kg` : '';
      return `  ${name}: ${s.totalSets} series${weightStr} | último ${s.lastDate}`;
    }).join('\n')
  : '  Ninguno registrado.'}

=== ÚLTIMAS 20 SESIONES ===
${recentSessions || '  Sin sesiones registradas aún.'}

=== INSTRUCCIONES ===
Genera una respuesta JSON con exactamente esta estructura (sin texto fuera del JSON).

REGLAS IMPORTANTES:
- estimated_minutes: calcula el tiempo real de sesión sumando (sets_totales × 1.5 min de ejecución) + (sets_totales × 2.5 min de descanso) + 12 min de overhead (calentamiento, buscar máquinas, transiciones). Redondea a múltiplos de 5.
- weekly_weights: usa el historial real del usuario para estimar el peso de partida. Si no hay datos, pon un peso conservador. Aplica progresión lineal: +2.5-5 kg/semana en ejercicios compuestos, +1.25-2.5 kg en aislamiento. Semana 4 = continúa la progresión normalmente (NO hagas semana de descarga) salvo que el usuario haya indicado explícitamente que quiere descarga o que le cuesta recuperarse (en ese caso semana 4 = 60% de semana 3). Para ejercicios de peso corporal pon "PC". Incluye siempre la unidad (kg).
- set_scheme: elige el esquema adecuado para cada ejercicio según su posición en la sesión y el objetivo:
    "rectas" → todos los sets al mismo peso (ejercicios de aislamiento, accesorios)
    "piramide_asc" → peso creciente set a set, últimos 2 sets son los de trabajo (ejercicios compuestos principales)
    "piramide_desc" → primer set al peso máximo, va bajando (fuerza/potencia)
    "calentamiento_trabajo" → 1-2 sets ligeros de activación + sets de trabajo al peso objetivo
- set_scheme_note: frase corta (1 línea) explicando qué debe hacer el usuario dentro de la sesión con ese esquema.
- session_weights_week1: array con el peso exacto de cada set en la semana 1 (longitud = sets). Para "rectas" todos iguales. Para pirámide, mostrar la progresión real. Usa siempre la unidad (kg o "PC").
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
        "day": "Lunes",
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
            "set_scheme_note": "Todos los sets al mismo peso. Si completas todas las reps sube 2.5kg la semana siguiente.",
            "session_weights_week1": ["60kg","60kg","60kg","60kg"],
            "weekly_weights": {
              "week1": "60kg",
              "week2": "65kg",
              "week3": "67.5kg",
              "week4": "55kg"
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
      max_tokens: 8192,
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

  await dbRun(
    `INSERT INTO coach_plans (generated_at, valid_until, plan_json, raw_response)
     VALUES (CURRENT_TIMESTAMP, ?, ?, ?)`,
    [validUntil, JSON.stringify(parsed), raw]
  );

  return parsed;
}

module.exports = { getLatestPlan, generatePlan };
