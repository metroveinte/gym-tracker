const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/sessions', (req, res) => {
  db.all('SELECT * FROM sessions ORDER BY date DESC, id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer la base de datos.' });
    }
    res.json(rows);
  });
});

app.post('/api/sessions', (req, res) => {
  const { date, exercise, sets, reps, weight, notes } = req.body;
  if (!date || !exercise || sets === undefined || reps === undefined) {
    return res.status(400).json({ error: 'Fecha, ejercicio, series y repeticiones son obligatorios.' });
  }
  if (typeof sets !== 'number' || sets <= 0 || typeof reps !== 'number' || reps <= 0) {
    return res.status(400).json({ error: 'Series y repeticiones deben ser números positivos.' });
  }
  if (weight !== undefined && (typeof weight !== 'number' || weight < 0)) {
    return res.status(400).json({ error: 'Peso debe ser un número positivo o nulo.' });
  }
  const stmt = db.prepare(
    'INSERT INTO sessions (date, exercise, sets, reps, weight, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(date, exercise, sets, reps, weight || null, notes || '', function (err) {
    if (err) {
      return res.status(500).json({ error: 'Error al guardar la sesión.' });
    }
    res.json({ id: this.lastID, date, exercise, sets, reps, weight: weight || null, notes: notes || '' });
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
  db.all('SELECT * FROM sessions ORDER BY date DESC, id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).send('Error al generar CSV.');
    }
    const header = ['id', 'date', 'exercise', 'sets', 'reps', 'weight', 'notes'];
    const csvRows = [header.join(',')];
    rows.forEach((row) => {
      const values = [
        row.id,
        `"${row.date}"`,
        `"${row.exercise.replace(/"/g, '""')}"`,
        row.sets,
        row.reps,
        row.weight === null ? '' : row.weight,
        `"${(row.notes || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(values.join(','));
    });
    const csv = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="gym-sessions.csv"');
    res.send(csv);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gym Tracker running at http://localhost:${PORT}`);
});
