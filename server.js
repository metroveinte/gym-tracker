require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const PREDEFINED_EXERCISES = require('./predefined-exercises');
const coach = require('./coach');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

// Prevenir caching agresivo de archivos estáticos para desarrollo
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.get('/version', (req, res) => {
  res.send('v1.0.0');
});

app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/sessions', (req, res) => {
  const sql = `
    SELECT
      s.id          AS session_id,
      s.date        AS date,
      s.exercise    AS exercise,
      s.notes       AS notes,
      s.batch_id    AS batch_id,
      se.id         AS serie_id,
      se.sets       AS sets,
      se.reps       AS reps,
      se.weight     AS weight
    FROM sessions s
    LEFT JOIN series se ON se.session_id = s.id
    ORDER BY s.batch_id DESC, s.date DESC, s.id DESC, se.id ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer la base de datos.' });
    }
    const byId = new Map();
    for (const row of rows) {
      let session = byId.get(row.session_id);
      if (!session) {
        session = {
          id: row.session_id,
          date: row.date,
          exercise: row.exercise,
          notes: row.notes,
          batch_id: row.batch_id,
          series: []
        };
        byId.set(row.session_id, session);
      }
      if (row.serie_id !== null) {
        session.series.push({
          id: row.serie_id,
          sets: row.sets,
          reps: row.reps,
          weight: row.weight
        });
      }
    }
    res.json(Array.from(byId.values()));
  });
});

app.post('/api/sessions', (req, res) => {
  const { date, exercise, notes, batch_id } = req.body;
  if (!date || !exercise) {
    return res.status(400).json({ error: 'Fecha y ejercicio son obligatorios.' });
  }

  const stmt = db.prepare('INSERT INTO sessions (date, exercise, notes, batch_id) VALUES (?, ?, ?, ?)');
  stmt.run(date, exercise, notes || '', batch_id || null, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la sesión.' });
    }
    res.json({ id: this.lastID, date, exercise, notes: notes || '', batch_id: batch_id || null, series: [] });
  });
  stmt.finalize();
});

app.get('/api/exercises', (req, res) => {
  db.all('SELECT name, muscle_group, is_predefined FROM exercises ORDER BY name COLLATE NOCASE ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al cargar ejercicios.' });
    }
    res.json(rows);
  });
});

app.post('/api/exercises', (req, res) => {
  const { name, muscle_group } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nombre de ejercicio inválido.' });
  }
  if (!muscle_group || !muscle_group.trim()) {
    return res.status(400).json({ error: 'Grupo muscular es obligatorio.' });
  }

  const trimmedName = name.trim();
  const trimmedGroup = muscle_group.trim();
  db.run('INSERT OR IGNORE INTO exercises (name, muscle_group, is_predefined) VALUES (?, ?, 0)', [trimmedName, trimmedGroup], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar el ejercicio.' });
    }
    res.json({ name: trimmedName, muscle_group: trimmedGroup, is_predefined: 0 });
  });
});

// Estos endpoints deben ir ANTES de /:name para evitar conflictos de rutas
app.post('/api/exercises/restore', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM exercises', [], (err) => {
      if (err) return res.status(500).json({ error: 'Error al restaurar ejercicios.' });

      const stmt = db.prepare('INSERT INTO exercises (name, muscle_group, is_predefined) VALUES (?, ?, 1)');
      for (const [name, muscleGroup] of Object.entries(PREDEFINED_EXERCISES)) {
        stmt.run(name, muscleGroup);
      }
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: 'Error al insertar ejercicios predefinidos.' });
        res.json({ success: true, count: Object.keys(PREDEFINED_EXERCISES).length });
      });
    });
  });
});

app.post('/api/exercises/repair', (req, res) => {
  db.serialize(() => {
    const stmt = db.prepare('INSERT OR IGNORE INTO exercises (name, muscle_group, is_predefined) VALUES (?, ?, 1)');
    for (const [name, muscleGroup] of Object.entries(PREDEFINED_EXERCISES)) {
      stmt.run(name, muscleGroup);
    }
    stmt.finalize();

    const upd = db.prepare('UPDATE exercises SET muscle_group = ?, is_predefined = 1 WHERE name = ? COLLATE NOCASE');
    for (const [name, muscleGroup] of Object.entries(PREDEFINED_EXERCISES)) {
      upd.run(muscleGroup, name);
    }
    upd.finalize((err) => {
      if (err) return res.status(500).json({ error: 'Error al reparar ejercicios.' });
      res.json({ success: true, count: Object.keys(PREDEFINED_EXERCISES).length });
    });
  });
});

app.patch('/api/exercises/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { muscle_group, new_name } = req.body;

  if (!muscle_group || !muscle_group.trim()) {
    return res.status(400).json({ error: 'Grupo muscular es obligatorio.' });
  }

  const trimmedGroup = muscle_group.trim();

  if (new_name && new_name.trim()) {
    const trimmedNewName = new_name.trim();
    db.run(
      'UPDATE exercises SET name = ?, muscle_group = ? WHERE name = ? COLLATE NOCASE',
      [trimmedNewName, trimmedGroup, name],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar el ejercicio.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
        res.json({ name: trimmedNewName, muscle_group: trimmedGroup });
      }
    );
  } else {
    db.run(
      'UPDATE exercises SET muscle_group = ? WHERE name = ? COLLATE NOCASE',
      [trimmedGroup, name],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar el ejercicio.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
        res.json({ name, muscle_group: trimmedGroup });
      }
    );
  }
});

app.delete('/api/exercises/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  db.run(
    'DELETE FROM exercises WHERE name = ? COLLATE NOCASE',
    [name],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar el ejercicio.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Ejercicio no encontrado.' });
      res.json({ success: true, name });
    }
  );
});

app.post('/api/sessions/:id/series', (req, res) => {
  const { id } = req.params;
  const { sets, reps, weight } = req.body;
  const idNum = parseInt(id, 10);

  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de sesión inválido.' });
  }
  if (reps === undefined) {
    return res.status(400).json({ error: 'Repeticiones son obligatorias.' });
  }
  const setsNum = (sets !== undefined) ? sets : 1;
  if (typeof setsNum !== 'number' || setsNum <= 0 || typeof reps !== 'number' || reps <= 0) {
    return res.status(400).json({ error: 'Series y repeticiones deben ser números positivos.' });
  }
  if (weight !== undefined && (typeof weight !== 'number' || weight < 0)) {
    return res.status(400).json({ error: 'Peso debe ser un número positivo o nulo.' });
  }

  const weightValue = (weight === undefined || weight === null) ? null : weight;
  const stmt = db.prepare('INSERT INTO series (session_id, sets, reps, weight) VALUES (?, ?, ?, ?)');
  stmt.run(idNum, setsNum, reps, weightValue, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la serie.' });
    }
    res.json({ id: this.lastID, sets: setsNum, reps, weight: weightValue });
  });
  stmt.finalize();
});

app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const idNum = parseInt(id, 10);
  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID inválido.' });
  }
  db.run('DELETE FROM sessions WHERE id = ?', [idNum], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar la sesión.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }
    res.json({ success: true });
  });
});

app.get('/api/export/csv', (req, res) => {
  db.all('SELECT * FROM sessions ORDER BY date DESC, id DESC', [], (err, sessions) => {
    if (err) {
      return res.status(500).send('Error al generar CSV.');
    }

    const header = ['Fecha', 'Ejercicio', 'Series', 'Reps', 'Peso', 'Notas'];
    const csvRows = [header.join(',')];

    let completed = 0;
    sessions.forEach((session) => {
      db.all('SELECT * FROM series WHERE session_id = ? ORDER BY id ASC', [session.id], (err, series) => {
        if (series && series.length > 0) {
          series.forEach((s) => {
            const values = [
              `"${session.date}"`,
              `"${session.exercise.replace(/"/g, '""')}"`,
              s.sets,
              s.reps,
              s.weight === null ? '' : s.weight,
              `"${(session.notes || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(values.join(','));
          });
        } else {
          const values = [
            `"${session.date}"`,
            `"${session.exercise.replace(/"/g, '""')}"`,
            '-',
            '-',
            '-',
            `"${(session.notes || '').replace(/"/g, '""')}"`
          ];
          csvRows.push(values.join(','));
        }

        completed++;
        if (completed === sessions.length) {
          const csv = csvRows.join('\r\n');
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="gym-sessions.csv"');
          res.send(csv);
        }
      });
    });

    if (sessions.length === 0) {
      const csv = header.join(',');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="gym-sessions.csv"');
      res.send(csv);
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/sessions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sessions.html'));
});

app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

app.get('/nutrition', (req, res) => res.sendFile(path.join(__dirname, 'public', 'nutrition.html')));
app.get('/tmb', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tmb.html')));
app.get('/weight-log', (req, res) => res.sendFile(path.join(__dirname, 'public', 'weight.html')));

// TDEE profile (single row, id=1)
app.get('/api/tdee', (req, res) => {
  db.get('SELECT * FROM tdee_profile WHERE id = 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al leer el perfil.' });
    res.json(row || null);
  });
});

app.post('/api/tdee', (req, res) => {
  const { gender, age, height_cm, weight_kg, activity_factor, bmr, tdee, goal, target_calories } = req.body;
  if (!gender || !age || !height_cm || !weight_kg || !activity_factor || !bmr || !tdee) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  db.run(
    `INSERT INTO tdee_profile (id, gender, age, height_cm, weight_kg, activity_factor, bmr, tdee, goal, target_calories, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       gender = excluded.gender, age = excluded.age, height_cm = excluded.height_cm,
       weight_kg = excluded.weight_kg, activity_factor = excluded.activity_factor,
       bmr = excluded.bmr, tdee = excluded.tdee, goal = excluded.goal,
       target_calories = excluded.target_calories, updated_at = CURRENT_TIMESTAMP`,
    [gender, age, height_cm, weight_kg, activity_factor, bmr, tdee, goal || null, target_calories || null],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al guardar el perfil.' });
      res.json({ success: true, tdee });
    }
  );
});

// Weight log
app.get('/api/weight', (req, res) => {
  db.all('SELECT * FROM weight_log ORDER BY date ASC, id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al leer el registro de pesos.' });
    res.json(rows);
  });
});

app.post('/api/weight', (req, res) => {
  const { date, weight_kg, comments } = req.body;
  if (!date || weight_kg === undefined || weight_kg === null) {
    return res.status(400).json({ error: 'Fecha y peso son obligatorios.' });
  }
  db.run(
    'INSERT INTO weight_log (date, weight_kg, comments) VALUES (?, ?, ?)',
    [date, parseFloat(weight_kg), comments || ''],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al guardar el peso.' });
      res.json({ id: this.lastID, date, weight_kg: parseFloat(weight_kg), comments: comments || '' });
    }
  );
});

app.delete('/api/weight/:id', (req, res) => {
  const idNum = parseInt(req.params.id, 10);
  if (isNaN(idNum) || idNum <= 0) return res.status(400).json({ error: 'ID inválido.' });
  db.run('DELETE FROM weight_log WHERE id = ?', [idNum], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar el registro.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    res.json({ success: true });
  });
});

// Coach endpoints
app.get('/api/coach/plan', async (req, res) => {
  try {
    const plan = await coach.getLatestPlan();
    if (!plan) return res.json(null);
    res.json({ ...plan, plan_json: JSON.parse(plan.plan_json) });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar el plan.' });
  }
});

app.post('/api/coach/generate', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'API key no configurada. Añade ANTHROPIC_API_KEY al entorno.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    const plan = await coach.generatePlan(req.body?.checkin || null);
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ plan })}\n\n`);
  } catch (e) {
    clearInterval(heartbeat);
    console.error('Coach error:', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.get('/api/coach/weekly-weights', async (req, res) => {
  try {
    const row = await coach.getLatestWeeklyWeights();
    if (!row) return res.json(null);
    res.json({ ...row, weights_json: JSON.parse(row.weights_json) });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar pesos semanales.' });
  }
});

app.post('/api/coach/weekly-weights', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'API key no configurada.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    const result = await coach.generateWeeklyWeights();
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify(result)}\n\n`);
  } catch (e) {
    clearInterval(heartbeat);
    console.error('Weekly weights error:', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.get('/api/coach/extra-workout', async (req, res) => {
  try {
    const row = await coach.getLatestExtraWorkout();
    if (!row) return res.json(null);
    res.json({ ...row, workout_json: JSON.parse(row.workout_json) });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar el entreno adicional.' });
  }
});

app.delete('/api/coach/extra-workout', async (req, res) => {
  try {
    await coach.deleteExtraWorkout();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar el entreno adicional.' });
  }
});

app.post('/api/coach/extra-workout', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'API key no configurada.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  try {
    const workout = await coach.generateExtraWorkout();
    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ workout })}\n\n`);
  } catch (e) {
    clearInterval(heartbeat);
    console.error('Extra workout error:', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.get('/coach', (req, res) => res.sendFile(path.join(__dirname, 'public', 'coach.html')));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Global error handler — ensures errors always return JSON, never HTML
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Gym Tracker running at http://localhost:${PORT}`);
});
