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

  // Volume stats per muscle group (last 90 days)
  // First series per exercise is treated as activation (skipped for weight averages)
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const muscleStats = {};
  for (const s of allSessions) {
    if (s.date < cutoff90) continue;
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
    const isRecent = s.date >= cutoff90;
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
  // All exercises done in the last 90 days — no limit, sorted by tonnage
  const recentExerciseStats = Object.entries(exerciseStats)
    .filter(([, s]) => s.recentSets > 0)
    .sort((a, b) => b[1].tonnage - a[1].tonnage);

  // Per-muscle-group exercise breakdown for the last 90 days
  const muscleExerciseMap = {};
  for (const s of allSessions) {
    if (s.date < cutoff90 || !s.exercise) continue;
    const mg = s.muscle_group || 'Sin clasificar';
    if (!muscleExerciseMap[mg]) muscleExerciseMap[mg] = {};
    const sets = s.series.reduce((sum, se) => sum + (se.sets || 1), 0);
    muscleExerciseMap[mg][s.exercise] = (muscleExerciseMap[mg][s.exercise] || 0) + sets;
  }

  // Detailed session listing: last 30 days (kept short to avoid bloating the prompt)
  const recentSessionsFull = allSessions.filter(s => s.date >= cutoff30);

  // Stagnation detection: exercises with no max-weight improvement in 3+ consecutive weeks
  const STAGNATION_WEEKS = 3;
  const stagnantExercises = [];
  const now = Date.now();

  for (const [name] of Object.entries(exerciseStats)) {
    const exSessions = allSessions
      .filter(s => s.exercise === name && s.series.some(sr => sr.weight > 0))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (exSessions.length === 0) continue;

    const weekBuckets = {};
    for (const s of exSessions) {
      const daysAgo = Math.floor((now - new Date(s.date).getTime()) / 86400000);
      if (daysAgo > 56) continue;
      const bucket = Math.floor(daysAgo / 7);
      const sessionMax = Math.max(...s.series.filter(sr => sr.weight > 0).map(sr => sr.weight));
      if (!weekBuckets[bucket] || sessionMax > weekBuckets[bucket]) weekBuckets[bucket] = sessionMax;
    }

    const sortedWeeks = Object.entries(weekBuckets)
      .map(([w, max]) => ({ week: Number(w), max }))
      .sort((a, b) => a.week - b.week); // index 0 = most recent week

    if (sortedWeeks.length < STAGNATION_WEEKS) continue;

    const currentMax = sortedWeeks[0].max;
    const referenceMax = sortedWeeks[STAGNATION_WEEKS - 1].max;

    if (currentMax <= referenceMax) {
      let plateauWeeks = STAGNATION_WEEKS;
      for (let i = STAGNATION_WEEKS; i < sortedWeeks.length; i++) {
        if (sortedWeeks[i].max >= currentMax) plateauWeeks++;
        else break;
      }
      stagnantExercises.push({ name, weeks: plateauWeeks, maxWeight: currentMax });
    }
  }

  // ── Nivel 1 analytics ────────────────────────────────────────────────────────

  // 1. Adherencia: sesiones/semana promedio (últimos 90 días)
  const uniqueTrainingDays = new Set(allSessions.filter(s => s.date >= cutoff90).map(s => s.date));
  const avgSessionsPerWeek = Math.round((uniqueTrainingDays.size / 90) * 7 * 10) / 10;

  // 2. Balance push/pull (últimos 90 días)
  const PUSH_GROUPS = ['Pecho', 'Hombros', 'Tríceps'];
  const PULL_GROUPS = ['Dorsal', 'Espalda media', 'Bíceps', 'Deltoides posterior'];
  let pushSets = 0, pullSets = 0;
  for (const [mg, s] of Object.entries(muscleStats)) {
    if (PUSH_GROUPS.includes(mg)) pushSets += s.totalSets;
    if (PULL_GROUPS.includes(mg)) pullSets += s.totalSets;
  }
  const pushPullRatio = pullSets > 0 ? Math.round((pushSets / pullSets) * 100) / 100 : null;
  let pushPullNote;
  if (pushPullRatio === null) pushPullNote = 'Sin datos suficientes';
  else if (pushPullRatio > 1.3) pushPullNote = `Desequilibrado hacia PUSH (${pushSets} series empuje vs ${pullSets} tracción — ratio ${pushPullRatio}:1). Priorizar tirón.`;
  else if (pushPullRatio < 0.7) pushPullNote = `Desequilibrado hacia PULL (${pullSets} series tracción vs ${pushSets} empuje — ratio ${pushPullRatio}:1). Priorizar empuje.`;
  else pushPullNote = `Equilibrado (${pushSets} empuje / ${pullSets} tracción — ratio ${pushPullRatio}:1)`;

  // 3. Estado de volumen MEV/MRV por grupo muscular (últimos 90 días)
  const MAIN_GROUPS = ['Pecho', 'Dorsal', 'Hombros', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquiosurales', 'Glúteos'];
  const MEV_MRV = {
    'Pecho':         { mev: 8,  mrv: 20 },
    'Dorsal':        { mev: 8,  mrv: 22 },
    'Hombros':       { mev: 6,  mrv: 20 },
    'Bíceps':        { mev: 6,  mrv: 18 },
    'Tríceps':       { mev: 6,  mrv: 18 },
    'Cuádriceps':    { mev: 8,  mrv: 20 },
    'Isquiosurales': { mev: 6,  mrv: 20 },
    'Glúteos':       { mev: 4,  mrv: 16 },
  };
  const volumeStatus = MAIN_GROUPS.map(mg => {
    const setsTotal = muscleStats[mg]?.totalSets ?? 0;
    const spw = Math.round((setsTotal / 90) * 7 * 10) / 10;
    const ref = MEV_MRV[mg] || { mev: 6, mrv: 18 };
    const status = spw < ref.mev ? 'BAJO_MEV' : spw >= ref.mrv * 0.85 ? 'CERCA_MRV' : 'OK';
    return { group: mg, setsPerWeek: spw, mev: ref.mev, mrv: ref.mrv, status };
  });

  // 4. Variedad de ejercicios por grupo muscular (últimos 90 días)
  const exerciseVariety = {};
  for (const [mg, exMap] of Object.entries(muscleExerciseMap)) {
    exerciseVariety[mg] = Object.keys(exMap).length;
  }
  const lowVarietyGroups = MAIN_GROUPS
    .filter(mg => exerciseVariety[mg] !== undefined && exerciseVariety[mg] <= 2)
    .map(mg => ({ group: mg, count: exerciseVariety[mg] }));

  return {
    profile, recentSessionsFull, muscleStats, recentExerciseStats, muscleExerciseMap, weights,
    stagnantExercises, avgSessionsPerWeek, pushPullNote, volumeStatus, lowVarietyGroups, allSessions,
  };
}

// ── Adherencia real vs planificado ────────────────────────────────────────────
// Compara las series realmente registradas contra las que el plan prescribía,
// desde que se generó (generatedAt) hasta hoy. Asume que cada "Día N" del plan
// es una plantilla de microciclo que se repite una vez por semana durante las
// 4 semanas del plan (igual que asume el indicador de semana en public/coach.js).
// Se agrega por GRUPO MUSCULAR (no por ejercicio exacto): si el usuario sustituye
// un ejercicio por su alternativa (u otro ejercicio del mismo grupo), el volumen
// sigue contando como cumplido. La lista de "nunca registrados" sí es por
// ejercicio exacto, para detectar ejercicios concretos que nunca se llegaron a hacer.

async function computeAdherence(plan, allSessions, generatedAt) {
  const genTime = new Date(generatedAt).getTime();
  const now = Date.now();

  const weeksElapsed = Math.min(4, Math.max(0, Math.ceil((now - genTime) / 86400000 / 7)));

  // Catálogo de ejercicios → grupo muscular (fuente de verdad, incluye ejercicios aún no logueados)
  const exerciseRows = await dbAll('SELECT name, muscle_group FROM exercises');
  const muscleGroupByName = {};
  for (const row of exerciseRows) {
    muscleGroupByName[row.name.toLowerCase()] = row.muscle_group || 'Sin clasificar';
  }

  // Series planificadas por semana, por grupo muscular (suma de "sets" de todos los ejercicios del grupo)
  const plannedSetsPerGroup = {};
  const plannedExercises = [];
  const seenExerciseNames = new Set();
  for (const day of (plan.weekly_plan?.days || [])) {
    for (const ex of (day.exercises || [])) {
      if (!ex.name) continue;
      const key = ex.name.toLowerCase();
      const group = muscleGroupByName[key] || 'Sin clasificar';
      plannedSetsPerGroup[group] = (plannedSetsPerGroup[group] || 0) + (ex.sets || 0);
      if (!seenExerciseNames.has(key)) {
        seenExerciseNames.add(key);
        plannedExercises.push(ex.name);
      }
    }
  }

  // Series logueadas por grupo muscular (cualquier ejercicio de ese grupo cuenta) y por ejercicio exacto
  const completedByGroup = {};
  const completedSetsByExerciseName = {};
  for (const s of allSessions) {
    if (!s.exercise) continue;
    const sessionTime = new Date(s.date).getTime();
    if (sessionTime < genTime) continue;
    const week = Math.floor((sessionTime - genTime) / 86400000 / 7);
    if (week < 0 || week > 3) continue;
    const sets = s.series.reduce((sum, se) => sum + (se.sets || 1), 0);
    const group = s.muscle_group || 'Sin clasificar';

    completedByGroup[group] = completedByGroup[group] || {};
    completedByGroup[group][week] = (completedByGroup[group][week] || 0) + sets;

    const exKey = s.exercise.toLowerCase();
    completedSetsByExerciseName[exKey] = (completedSetsByExerciseName[exKey] || 0) + sets;
  }

  const perMuscleGroup = [];
  let overallSetsCompleted = 0;
  let overallSetsPlanned = 0;

  for (const [group, setsPerWeek] of Object.entries(plannedSetsPerGroup)) {
    const completedSets = [];
    let totalCompletedSoFar = 0;
    for (let w = 0; w < weeksElapsed; w++) {
      const sets = completedByGroup[group]?.[w] || 0;
      completedSets.push(sets);
      totalCompletedSoFar += sets;
    }
    const totalPlannedSoFar = setsPerWeek * weeksElapsed;
    const adherencePct = totalPlannedSoFar > 0
      ? Math.round((totalCompletedSoFar / totalPlannedSoFar) * 100)
      : 0;

    const status = adherencePct > 100 ? 'over' : adherencePct >= 85 ? 'on_track' : 'behind';

    perMuscleGroup.push({ group, plannedSetsPerWeek: setsPerWeek, completedSets, totalPlannedSoFar, totalCompletedSoFar, adherencePct, status });
    overallSetsCompleted += totalCompletedSoFar;
    overallSetsPlanned += totalPlannedSoFar;
  }

  const neverLogged = weeksElapsed >= 1
    ? plannedExercises.filter(name => !completedSetsByExerciseName[name.toLowerCase()])
    : [];

  const overallAdherencePct = overallSetsPlanned > 0
    ? Math.round((overallSetsCompleted / overallSetsPlanned) * 100)
    : 0;

  return { weeksElapsed, perMuscleGroup, neverLogged, overallAdherencePct, overallSetsCompleted, overallSetsPlanned };
}

// Cumplimiento acumulado de los últimos N ciclos de plan (por defecto 3, ~3 meses).
// Reutiliza la misma agregación por grupo muscular que computeAdherence, pero sumando
// varios ciclos: cada ciclo tiene su propia ventana (desde que se generó ese plan hasta
// que se generó el siguiente, o hasta hoy/28 días si es el plan activo).
const GENERAL_ADHERENCE_CYCLES = 3;

async function computeGeneralAdherence(allSessions) {
  const plans = await dbAll(
    'SELECT * FROM coach_plans ORDER BY generated_at DESC LIMIT ?',
    [GENERAL_ADHERENCE_CYCLES]
  );
  if (plans.length === 0) return null;

  const exerciseRows = await dbAll('SELECT name, muscle_group FROM exercises');
  const muscleGroupByName = {};
  for (const row of exerciseRows) {
    muscleGroupByName[row.name.toLowerCase()] = row.muscle_group || 'Sin clasificar';
  }

  const sorted = [...plans].sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at));
  const now = Date.now();

  const perGroupTotals = {};
  const plannedExercises = new Map(); // lowercase -> nombre original
  const oldestGenTime = new Date(sorted[0].generated_at).getTime();

  for (let i = 0; i < sorted.length; i++) {
    const planRow = sorted[i];
    const plan = JSON.parse(planRow.plan_json);
    const genTime = new Date(planRow.generated_at).getTime();
    const nextGenTime = i + 1 < sorted.length ? new Date(sorted[i + 1].generated_at).getTime() : now;
    const cycleEnd = Math.min(nextGenTime, genTime + PLAN_DAYS * 86400000);
    const weeksElapsedThisCycle = Math.min(4, Math.max(0, Math.ceil((cycleEnd - genTime) / 86400000 / 7)));
    if (weeksElapsedThisCycle < 1) continue;

    const plannedPerGroupThisCycle = {};
    for (const day of (plan.weekly_plan?.days || [])) {
      for (const ex of (day.exercises || [])) {
        if (!ex.name) continue;
        const key = ex.name.toLowerCase();
        const group = muscleGroupByName[key] || 'Sin clasificar';
        plannedPerGroupThisCycle[group] = (plannedPerGroupThisCycle[group] || 0) + (ex.sets || 0);
        if (!plannedExercises.has(key)) plannedExercises.set(key, ex.name);
      }
    }

    const completedPerGroupThisCycle = {};
    for (const s of allSessions) {
      if (!s.exercise) continue;
      const t = new Date(s.date).getTime();
      if (t < genTime || t >= cycleEnd) continue;
      const sets = s.series.reduce((sum, se) => sum + (se.sets || 1), 0);
      const group = s.muscle_group || 'Sin clasificar';
      completedPerGroupThisCycle[group] = (completedPerGroupThisCycle[group] || 0) + sets;
    }

    for (const [group, setsPerWeek] of Object.entries(plannedPerGroupThisCycle)) {
      perGroupTotals[group] = perGroupTotals[group] || { planned: 0, completed: 0 };
      perGroupTotals[group].planned += setsPerWeek * weeksElapsedThisCycle;
      perGroupTotals[group].completed += completedPerGroupThisCycle[group] || 0;
    }
  }

  // "Nunca registrado" en todo el rango combinado: ¿se ha logueado ese ejercicio alguna vez
  // desde el ciclo más antiguo considerado hasta hoy, sea cual sea el ciclo en el que estaba planificado?
  const everCompletedExerciseNames = new Set();
  for (const s of allSessions) {
    if (!s.exercise) continue;
    const t = new Date(s.date).getTime();
    if (t < oldestGenTime || t > now) continue;
    everCompletedExerciseNames.add(s.exercise.toLowerCase());
  }
  const neverLogged = [...plannedExercises.entries()]
    .filter(([key]) => !everCompletedExerciseNames.has(key))
    .map(([, name]) => name);

  const perMuscleGroup = Object.entries(perGroupTotals).map(([group, { planned, completed }]) => {
    const adherencePct = planned > 0 ? Math.round((completed / planned) * 100) : 0;
    const status = adherencePct > 100 ? 'over' : adherencePct >= 85 ? 'on_track' : 'behind';
    return { group, totalPlanned: planned, totalCompleted: completed, adherencePct, status };
  });

  const overallSetsPlanned = perMuscleGroup.reduce((sum, g) => sum + g.totalPlanned, 0);
  const overallSetsCompleted = perMuscleGroup.reduce((sum, g) => sum + g.totalCompleted, 0);
  const overallAdherencePct = overallSetsPlanned > 0
    ? Math.round((overallSetsCompleted / overallSetsPlanned) * 100)
    : 0;

  return {
    cyclesConsidered: sorted.length,
    perMuscleGroup, neverLogged,
    overallAdherencePct, overallSetsCompleted, overallSetsPlanned,
  };
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

function buildPrompt(ctx, checkin, adherence = null) {
  const { profile, recentSessionsFull, muscleStats, recentExerciseStats, muscleExerciseMap, weights,
          stagnantExercises, avgSessionsPerWeek, pushPullNote, volumeStatus, lowVarietyGroups } = ctx;
  const today = new Date().toISOString().slice(0, 10);

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
  // null (legacy rows) y 0 (peso corporal explícito) representan lo mismo: sin carga externa.
  const fmtSerieWeight = w => (w === null || w === undefined || w === 0) ? 'PC' : `${w}kg`;

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
    : '  Sin entrenos en los últimos 90 días.';

  const weightTrend = weights.length >= 2
    ? `Peso inicial: ${weights[weights.length - 1].weight_kg} kg (${weights[weights.length - 1].date}) → Último: ${weights[0].weight_kg} kg (${weights[0].date})`
    : 'Sin datos de peso registrados.';

  const recentSessions = recentSessionsFull
    .map(s =>
      `  ${s.date} | ${s.exercise} (${s.muscle_group}) | ${s.series.map(se => `${se.sets}x${se.reps}@${fmtSerieWeight(se.weight)}`).join(', ') || 'sin series'}`
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
      repsStr = ` | reps últimos 3 meses: ${minR}-${maxR} (media ${avgR})`;
    }
    return `  ${name}: ${s.totalSets} series totales${weightStr}${repsStr} | último ${s.lastDate}`;
  }).join('\n');

  const adherenceText = (adherence && adherence.weeksElapsed >= 1) ? `
=== CUMPLIMIENTO DEL PLAN ANTERIOR (semanas transcurridas: ${adherence.weeksElapsed}/4, por grupo muscular — cuenta cualquier ejercicio del grupo, incluidas alternativas) ===
- Cumplimiento global: ${adherence.overallAdherencePct}% (${adherence.overallSetsCompleted}/${adherence.overallSetsPlanned} series)
${adherence.perMuscleGroup.map(g => `  - ${g.group}: ${g.adherencePct}% (${g.totalCompletedSoFar}/${g.totalPlannedSoFar} series) → ${g.status}`).join('\n')}
${adherence.neverLogged.length > 0 ? `- EJERCICIOS CONCRETOS NUNCA REGISTRADOS (con ese nombre exacto): ${adherence.neverLogged.join(', ')}.` : ''}
` : '';

  return `Eres un entrenador personal experto en biomecánica e hipertrofia, siempre basado en evidencia científica. Analiza el historial de entrenamiento real del usuario y genera un plan de 4 semanas adaptado a su objetivo.

HOY: ${today}

=== PERFIL DEL USUARIO ===
${profileText}

=== PREFERENCIAS Y DISPONIBILIDAD (respuestas del usuario) ===
${checkinText || '  No especificadas.'}

=== TENDENCIA DE PESO (últimas mediciones) ===
${weightTrend}

=== VOLUMEN POR GRUPO MUSCULAR (últimos 90 días) ===
${muscleText}

=== ANÁLISIS DE PATRONES DE ENTRENAMIENTO ===
- Frecuencia media: ${avgSessionsPerWeek} sesiones/semana (últimos 90 días)
- Balance push/pull: ${pushPullNote}
- Estado de volumen por grupo muscular (MEV = mínimo efectivo | MRV = máximo recuperable, series/semana):
${volumeStatus.map(v => `  ${v.group}: ${v.setsPerWeek} series/sem [MEV ${v.mev} | MRV ${v.mrv}] → ${v.status}`).join('\n')}${lowVarietyGroups.length > 0 ? `
- Baja variedad de ejercicios en: ${lowVarietyGroups.map(g => `${g.group} (solo ${g.count} ejercicio${g.count === 1 ? '' : 's'})`).join(', ')} — introducir variantes si procede` : ''}

=== EJERCICIOS PRINCIPALES (por volumen acumulado; con reps reales de los últimos 90 días) ===
NOTA: medias de peso y reps calculadas sobre series de trabajo. La primera serie por ejercicio (activación/calentamiento) está excluida de estas medias pero sí cuenta en el volumen total.
${exerciseLines || '  Ninguno registrado.'}
${stagnantExercises.length > 0 ? `
=== EJERCICIOS ESTANCADOS (sin mejora de peso máximo en 3+ semanas) ===
${stagnantExercises.map(ex => `  - ${ex.name}: máx ${ex.maxWeight}kg sin progresar desde hace ${ex.weeks} semanas`).join('\n')}

Para cada uno de estos ejercicios aplica la herramienta de progresión adecuada de la jerarquía definida en INSTRUCCIONES (Herramientas 4, 5 o 6 según adherencia y semanas de estancamiento). Señala la intervención elegida en las notas del día.` : ''}
${adherenceText}
=== SESIONES RECIENTES (últimos 30 días) ===
${recentSessions || '  Sin sesiones registradas aún.'}

=== INSTRUCCIONES ===
Genera una respuesta JSON con exactamente esta estructura (sin texto fuera del JSON).

REGLAS IMPORTANTES:
- day: usa siempre nombres genéricos "Día 1", "Día 2", "Día 3"… (nunca días de la semana como Lunes, Martes, etc.), ya que el usuario puede entrenar cualquier día.
- estimated_minutes: calcula el tiempo real de sesión sumando (sets_totales × 1.5 min de ejecución) + (sets_totales × 2.5 min de descanso) + 12 min de overhead (calentamiento, buscar máquinas, transiciones). Redondea a múltiplos de 5.
- JERARQUÍA DE PROGRESIÓN — Aplica las herramientas en orden de prioridad para cada ejercicio:
    HERRAMIENTA 1 — Subir reps (progresión primaria):
      Si media de reps < máximo del rango → mantén el peso; asigna reps objetivo más altas este mes.
      Objetivo: dominar el peso actual antes de subir. El weekly_weight permanece igual semanas 1-4.
    HERRAMIENTA 2 — Subir peso (cuando se domina el rango):
      Si media de reps ≥ máximo del rango - 0.5 → sube el peso de semana 1:
        +2.5-5 kg en compuestos (press, sentadilla, peso muerto, remo…)
        +1.25-2.5 kg en aislamientos (curl, extensión, lateral…)
      Semanas 2-4: aplica subida progresiva solo si semana 1 parte de un peso ya consolidado.
    HERRAMIENTA 3 — Añadir series (cuando el grupo está BAJO_MEV):
      Si el estado de volumen del grupo muscular del ejercicio es BAJO_MEV → añade 1-2 series extra
      al ejercicio hasta alcanzar el MEV mínimo. Prioriza esto antes de subir peso.
    HERRAMIENTA 4 — Deload de reps (reduce reps, mantiene peso):
      Condición: ejercicio en lista de estancados Y adherencia ≥ 3 sesiones/semana.
      Acción: baja el rango de reps 2-3 puntos al mismo peso (ej: 8-10 → 5-7) para generar nuevo
      estímulo de fuerza. Semanas 3-4 recuperan el rango original. Señala en las notas del día.
    HERRAMIENTA 5 — Semana de deload completa:
      Condición: ejercicio estancado Y adherencia < 2.5 sesiones/semana (fatiga acumulada probable).
      Acción: semana 1 = 60% del peso habitual, mismas series, sin fallo. Semanas 2-4 regresan
      progresivamente al peso de trabajo. Señala en las notas del día.
    HERRAMIENTA 6 — Periodización ondulatoria:
      Condición: ejercicio estancado 4+ semanas Y adherencia 2.5-3.5 sesiones/semana.
      Acción: alterna estímulos semanales:
        Sem 1 = 5-7 reps al ~90% del peso habitual (fuerza)
        Sem 2 = 10-12 reps al ~75% (hipertrofia)
        Sem 3 = 13-15 reps al ~65% (resistencia muscular)
        Sem 4 = 8-10 reps al ~80% (consolidación)
    SIN DATOS DE REPS: usa el último peso registrado, o peso conservador si el ejercicio es nuevo.
    SEMANA 4: continúa la progresión normalmente SALVO activación de Herramienta 5 (sem 1 ya es el deload).
- CUMPLIMIENTO DEL PLAN ANTERIOR (si aparece la sección correspondiente más arriba, por grupo muscular):
    Si el cumplimiento global fue < 60% → prioriza CONSISTENCIA sobre progresión: reduce el número de
    ejercicios/series del nuevo plan, sustituye los ejercicios marcados como "NUNCA REGISTRADOS" por
    alternativas más simples o accesibles, y no apliques Herramienta 2 (subir peso) salvo en grupos
    musculares con estado "on_track" o "over".
    Si el cumplimiento global fue ≥ 85% → progresa con normalidad según las herramientas 1-3.
    Grupos con estado "over" (por encima de lo planificado) → no añadas más volumen ahí aunque el
    estado MEV/MRV lo sugiera; ya se está entrenando por encima de lo prescrito.
    Si hay contradicción entre esta sección y la respuesta del check-in "¿cómo fue el plan anterior?",
    señálalo en analysis.gaps sin acusar al usuario, con tacto.
- Para ejercicios de peso corporal usa "PC". Incluye siempre la unidad (kg).
- set_scheme: elige el esquema adecuado para cada ejercicio según su posición en la sesión y el objetivo:
    "rectas" → todos los sets al mismo peso (ejercicios de aislamiento, accesorios)
    "piramide_asc" → peso creciente set a set, últimos 2 sets son los de trabajo (ejercicios compuestos principales)
    "piramide_desc" → primer set al peso máximo, va bajando (fuerza/potencia)
    "calentamiento_trabajo" → 1-2 sets ligeros de activación + sets de trabajo al peso objetivo
- set_scheme_note: frase corta (1 línea) con la regla de ejecución y progresión. Ejemplo: "Rango 8-10: cuando completes todas las series en 10 reps, sube 2.5kg el mes siguiente."
- peso de activación: para ejercicios con esquema "calentamiento_trabajo", la serie de activación se carga siempre al 65-70% del peso de trabajo actual. Este porcentaje es fijo y escala automáticamente: si el peso de trabajo sube de 60 kg a 65 kg, la activación pasa de ~40 kg a ~43 kg sin necesidad de recalcular. Indica este porcentaje en el set_scheme_note y en progression_note para que el usuario lo tenga claro.
- session_weights_week1: array con el peso exacto de cada set en la semana 1 (longitud = sets). Para "rectas" todos iguales. Para pirámide, mostrar la progresión real. Para "calentamiento_trabajo": el primer elemento es el peso de activación (~65-70% del peso de trabajo), los demás son el peso de trabajo. Usa siempre la unidad (kg o "PC").
- progression_note: 1-2 frases explicando la lógica de peso para este ejercicio. Cuando haya activación, exprésala como porcentaje del peso de trabajo (no como valor fijo) para que escale automáticamente al subir de peso. Ejemplo: "Media 9.8 reps a 60 kg en series de trabajo → ya domina el peso. Subimos a 62.5 kg de trabajo; activación siempre al ~65% (~40 kg). Cuando completes todas las series de trabajo a 10 reps, sube a 65 kg el mes que viene."
- alternative: nombre de UN ejercicio alternativo que trabaje el mismo músculo y se pueda hacer con equipamiento diferente (por si la máquina no está libre). IMPORTANTE: el alternativo NO puede ser otro ejercicio que ya esté en el mismo día, y dentro del mismo día dos ejercicios no pueden ser alternativas mutuas entre sí. Sí se permite que el alternativo aparezca en otro día del plan. Ejemplo: si el principal es "Press banca", el alternativo podría ser "Press mancuernas inclinado". Una sola frase corta, sin más detalles.

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
          const sr = s.series.map(se => `${se.sets}x${se.reps}@${(se.weight === null || se.weight === undefined || se.weight === 0) ? 'PC' : se.weight + 'kg'}`).join(', ');
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
7. El campo "alternative" de cada ejercicio NO puede ser otro ejercicio que ya aparezca en este mismo entreno, y dos ejercicios dentro del mismo entreno no pueden ser alternativas mutuas entre sí.

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
  const ctx = await buildContext();

  let adherence = null;
  const prevPlan = await getLatestPlan();
  if (prevPlan) {
    adherence = await computeAdherence(JSON.parse(prevPlan.plan_json), ctx.allSessions, prevPlan.generated_at);
  }

  const prompt = buildPrompt(ctx, checkin, adherence);
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

module.exports = { getLatestPlan, generatePlan, generateWeeklyWeights, getLatestWeeklyWeights, generateExtraWorkout, getLatestExtraWorkout, deleteExtraWorkout, buildContext, computeAdherence, computeGeneralAdherence };
