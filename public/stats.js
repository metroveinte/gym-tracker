// stats.js - Estadísticas básicas
async function loadStats() {
  try {
    const sessions = await fetch('/api/sessions').then(r => r.json());
    const totalSessions = sessions.length;
    const uniqueExercises = new Set(sessions.map(s => s.exercise)).size;
    const totalSeries = sessions.reduce((sum, s) => sum + (s.series ? s.series.length : 0), 0);

    document.getElementById('total-sessions').textContent = totalSessions;
    document.getElementById('unique-exercises').textContent = uniqueExercises;
    
    // Mostrar estadísticas adicionales si existen en el DOM
    if (document.getElementById('total-series')) {
      document.getElementById('total-series').textContent = totalSeries;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

loadStats();