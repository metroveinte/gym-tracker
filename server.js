const express = require('express');
const path = require('path');
const db = require('./db');

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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sessions', (req, res) => {
  db.all('SELECT * FROM sessions ORDER BY date DESC, id DESC', [], (err, sessions) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer la base de datos.' });
    }
    
    // Obtener series para cada sesión
    let completed = 0;
    sessions.forEach((session, idx) => {
      db.all('SELECT * FROM series WHERE session_id = ? ORDER BY id ASC', [session.id], (err, series) => {
        if (!err) {
          sessions[idx].series = series || [];
        }
        completed++;
        if (completed === sessions.length) {
          res.json(sessions);
        }
      });
    });
    
    if (sessions.length === 0) {
      res.json([]);
    }
  });
});

app.post('/api/sessions', (req, res) => {
  const { date, exercise, notes } = req.body;
  if (!date || !exercise) {
    return res.status(400).json({ error: 'Fecha y ejercicio son obligatorios.' });
  }
  const stmt = db.prepare(
    'INSERT INTO sessions (date, exercise, notes) VALUES (?, ?, ?)'
  );
  stmt.run(date, exercise, notes || '', function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la sesión.' });
    }
    res.json({ id: this.lastID, date, exercise, notes: notes || '', series: [] });
  });
  stmt.finalize();
});

app.post('/api/sessions/:id/series', (req, res) => {
  const { id } = req.params;
  const { sets, reps, weight } = req.body;
  const idNum = parseInt(id, 10);
  
  if (isNaN(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'ID de sesión inválido.' });
  }
  // 'sets' is optional for individual series (default 1). 'reps' is required.
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
  
  const stmt = db.prepare(
    'INSERT INTO series (session_id, sets, reps, weight) VALUES (?, ?, ?, ?)'
  );
  stmt.run(idNum, setsNum, reps, weight || null, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la serie.' });
    }
    res.json({ id: this.lastID, sets: setsNum, reps, weight: weight || null });
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.listen(PORT, () => {
  console.log(`Gym Tracker running at http://localhost:${PORT}`);
});
