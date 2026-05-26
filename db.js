const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'gym-tracker.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('No se pudo abrir la base de datos:', err.message);
    throw new Error('Error al conectar con la base de datos');
  }
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      exercise TEXT NOT NULL,
      notes TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      sets INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      weight REAL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      muscle_group TEXT
    )
  `);

  // Migración: añadir muscle_group si la tabla ya existía sin esa columna
  db.run(`ALTER TABLE exercises ADD COLUMN muscle_group TEXT`, () => {});

  db.run('CREATE INDEX IF NOT EXISTS idx_series_session_id ON series(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)');

  db.run(`
    INSERT OR IGNORE INTO exercises (name)
    SELECT DISTINCT exercise FROM sessions WHERE exercise IS NOT NULL
  `);
});

module.exports = db;
