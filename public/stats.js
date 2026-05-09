// stats.js - Estadísticas básicas
async function loadStats() {
  try {
    const sessions = await fetch('/api/sessions').then(r => r.json());
    const totalSessions = sessions.length;
    const uniqueExercises = new Set(sessions.map(s => s.exercise)).size;

    document.getElementById('total-sessions').textContent = totalSessions;
    document.getElementById('unique-exercises').textContent = uniqueExercises;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

loadStats();