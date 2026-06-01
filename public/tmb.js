const ACTIVITY_LABELS = {
  '1.2':   'Sedentario — sin ejercicio o muy poco',
  '1.375': 'Ligeramente activo — ejercicio 1-3 días/semana',
  '1.55':  'Moderadamente activo — ejercicio 3-5 días/semana',
  '1.725': 'Muy activo — ejercicio intenso 6-7 días/semana',
  '1.9':   'Extremadamente activo — trabajo físico muy duro o 2 entrenos/día'
};

function openTmbModal() {
  document.getElementById('tmb-modal-overlay').classList.remove('hidden');
  document.getElementById('tmb-modal').classList.remove('hidden');
}

function closeTmbModal() {
  document.getElementById('tmb-modal-overlay').classList.add('hidden');
  document.getElementById('tmb-modal').classList.add('hidden');
}

function displayProfile(profile) {
  document.getElementById('tmb-empty').classList.add('hidden');
  document.getElementById('tmb-result').classList.remove('hidden');
  document.getElementById('result-bmr').textContent = Math.round(profile.bmr) + ' kcal';
  document.getElementById('result-tdee').textContent = Math.round(profile.tdee) + ' kcal';
  document.getElementById('data-gender').textContent = profile.gender === 'male' ? 'Hombre' : 'Mujer';
  document.getElementById('data-age').textContent = profile.age + ' años';
  document.getElementById('data-height').textContent = profile.height_cm + ' cm';
  document.getElementById('data-weight').textContent = profile.weight_kg + ' kg';
  document.getElementById('data-activity').textContent = ACTIVITY_LABELS[String(profile.activity_factor)] || profile.activity_factor;
}

async function loadProfile() {
  try {
    const res = await fetch('/api/tdee');
    if (!res.ok) throw new Error();
    const profile = await res.json();
    if (profile) {
      displayProfile(profile);
    }
  } catch (e) {
    // No profile saved yet — keep empty state
  }
}

document.getElementById('calc-btn-empty').addEventListener('click', openTmbModal);
document.getElementById('recalc-btn').addEventListener('click', openTmbModal);
document.getElementById('tmb-modal-close').addEventListener('click', closeTmbModal);
document.getElementById('tmb-modal-cancel').addEventListener('click', closeTmbModal);
document.getElementById('tmb-modal-overlay').addEventListener('click', (e) => { if (e.target === document.getElementById('tmb-modal-overlay')) closeTmbModal(); });

document.getElementById('tmb-modal-save').addEventListener('click', async () => {
  const gender = document.getElementById('tmb-gender').value;
  const age = parseInt(document.getElementById('tmb-age').value, 10);
  const height_cm = parseFloat(document.getElementById('tmb-height').value);
  const weight_kg = parseFloat(document.getElementById('tmb-weight').value);
  const activity_factor = parseFloat(document.getElementById('tmb-activity').value);

  if (!age || !height_cm || !weight_kg || isNaN(age) || isNaN(height_cm) || isNaN(weight_kg)) {
    await showAlert('Datos incompletos', '<p style="color:#ccc;">Por favor, rellena todos los campos correctamente.</p>');
    return;
  }

  // Mifflin-St. Jeor
  const bmr = gender === 'male'
    ? (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
    : (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
  const tdee = bmr * activity_factor;

  try {
    const res = await fetch('/api/tdee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender, age, height_cm, weight_kg, activity_factor, bmr, tdee })
    });
    if (!res.ok) throw new Error('Error al guardar');
    closeTmbModal();
    displayProfile({ gender, age, height_cm, weight_kg, activity_factor, bmr, tdee });
  } catch (e) {
    await showAlert('Error', '<p style="color:#ccc;">No se pudo guardar el cálculo. Inténtalo de nuevo.</p>');
  }
});

loadProfile();
