const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const PREDEFINED_EXERCISES = require('./predefined-exercises');

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
      muscle_group TEXT,
      is_predefined INTEGER DEFAULT 0
    )
  `);

  // Migraciones para bases de datos existentes
  db.run(`ALTER TABLE exercises ADD COLUMN muscle_group TEXT`, () => {});
  db.run(`ALTER TABLE exercises ADD COLUMN is_predefined INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE sessions ADD COLUMN batch_id TEXT`, () => {});

  db.run('CREATE INDEX IF NOT EXISTS idx_series_session_id ON series(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date)');

  // Insertar predefinidos y marcar los que ya existían sin la bandera
  const stmt = db.prepare(`INSERT OR IGNORE INTO exercises (name, muscle_group, is_predefined) VALUES (?, ?, 1)`);
  for (const [name, muscleGroup] of Object.entries(PREDEFINED_EXERCISES)) {
    stmt.run(name, muscleGroup);
  }
  stmt.finalize();

  for (const name of Object.keys(PREDEFINED_EXERCISES)) {
    db.run(`UPDATE exercises SET is_predefined = 1 WHERE name = ? COLLATE NOCASE AND is_predefined = 0`, [name]);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tdee_profile (
      id INTEGER PRIMARY KEY,
      gender TEXT NOT NULL,
      age INTEGER NOT NULL,
      height_cm REAL NOT NULL,
      weight_kg REAL NOT NULL,
      activity_factor REAL NOT NULL,
      bmr REAL NOT NULL,
      tdee REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS weight_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      comments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_weight_log_date ON weight_log(date)');

  db.run(`ALTER TABLE tdee_profile ADD COLUMN goal TEXT`, () => {});
  db.run(`ALTER TABLE tdee_profile ADD COLUMN target_calories REAL`, () => {});
});

module.exports = db;
