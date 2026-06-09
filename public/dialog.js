(function () {
  let _overlay, _modal;

  function _build() {
    _overlay = document.createElement('div');
    _overlay.className = 'modal-overlay hidden';
    _overlay.style.zIndex = '500';

    _modal = document.createElement('div');
    _modal.className = 'modal hidden';
    _modal.style.cssText = 'max-width:440px; z-index:501;';
    _modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="_dlg_title" style="font-size:1.2rem;"></h2>
          <button type="button" class="modal-close" id="_dlg_close">&times;</button>
        </div>
        <div class="modal-body" id="_dlg_body" style="padding:20px 25px;"></div>
        <div class="modal-footer" id="_dlg_footer">
          <button type="button" id="_dlg_cancel" class="btn-secondary">Cancelar</button>
          <button type="button" id="_dlg_ok" class="btn-primary">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(_overlay);
    document.body.appendChild(_modal);
  }

  function _els() {
    if (!_overlay) _build();
    return {
      overlay: _overlay,
      modal: _modal,
      title:  document.getElementById('_dlg_title'),
      body:   document.getElementById('_dlg_body'),
      ok:     document.getElementById('_dlg_ok'),
      cancel: document.getElementById('_dlg_cancel'),
      close:  document.getElementById('_dlg_close'),
    };
  }

  function _open(opts) {
    return new Promise(resolve => {
      const e = _els();
      e.title.textContent = opts.title || '';
      e.body.innerHTML = opts.body || '';
      e.ok.textContent = opts.okText || 'Aceptar';
      e.ok.className = opts.danger ? 'btn-restore' : 'btn-primary';

      if (opts.showCancel === false) {
        e.cancel.style.display = 'none';
      } else {
        e.cancel.style.display = '';
        e.cancel.textContent = opts.cancelText || 'Cancelar';
      }

      e.overlay.classList.remove('hidden');
      e.modal.classList.remove('hidden');

      const done = (result) => {
        e.overlay.classList.add('hidden');
        e.modal.classList.add('hidden');
        e.ok.onclick = null;
        e.cancel.onclick = null;
        e.close.onclick = null;
        e.overlay.onclick = null;
        resolve(result);
      };

      e.ok.onclick     = () => done(true);
      e.cancel.onclick = () => done(false);
      e.close.onclick  = () => done(false);
      e.overlay.onclick = (ev) => { if (ev.target === e.overlay) done(false); };
    });
  }

  // Generic confirm: returns Promise<boolean>
  window.showConfirm = (opts) => _open(opts);

  // Simple message with OK only: returns Promise<void>
  window.showAlert = (title, body) =>
    _open({ title, body, okText: 'Aceptar', showCancel: false, danger: false });

  // Input dialog: returns Promise<string|null>
  window.showInput = ({ title, body, inputType = 'text', defaultValue = '', placeholder = '', okText = 'Aceptar' }) => {
    return new Promise(resolve => {
      const e = _els();
      e.title.textContent = title;
      e.body.innerHTML = `
        ${body ? `<p style="color:#ccc; margin-bottom:14px;">${body}</p>` : ''}
        <input type="${inputType}" id="_dlg_input" value="${defaultValue}" placeholder="${placeholder}" style="width:100%; margin:0;" />
      `;
      e.ok.textContent = okText;
      e.ok.className = 'btn-primary';
      e.cancel.style.display = '';
      e.cancel.textContent = 'Cancelar';

      e.overlay.classList.remove('hidden');
      e.modal.classList.remove('hidden');

      const inp = document.getElementById('_dlg_input');
      inp.focus();

      const done = (confirmed) => {
        e.overlay.classList.add('hidden');
        e.modal.classList.add('hidden');
        e.ok.onclick = null;
        e.cancel.onclick = null;
        e.close.onclick = null;
        e.overlay.onclick = null;
        inp.onkeydown = null;
        resolve(confirmed ? inp.value : null);
      };

      e.ok.onclick     = () => done(true);
      e.cancel.onclick = () => done(false);
      e.close.onclick  = () => done(false);
      e.overlay.onclick = (ev) => { if (ev.target === e.overlay) done(false); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); };
    });
  };

  // Serie form: reps + weight in one modal. Returns Promise<{reps, weight}|null>
  window.showSerieForm = (serieNumber) => {
    return new Promise(resolve => {
      const e = _els();
      e.title.textContent = `Serie ${serieNumber}`;
      e.body.innerHTML = `
        <label style="display:block; margin-bottom:15px;">
          Repeticiones
          <input type="number" id="_dlg_reps" min="1" placeholder="Ej: 10" style="width:100%; margin-top:6px;" />
        </label>
        <label style="display:block;">
          Peso en kg <span style="font-weight:400; color:#999;">(Opcional)</span>
          <input type="number" id="_dlg_weight" min="0" step="0.5" placeholder="Ej: 20" style="width:100%; margin-top:6px;" />
        </label>
      `;
      e.ok.textContent = 'Agregar serie';
      e.ok.className = 'btn-primary';
      e.cancel.style.display = '';
      e.cancel.textContent = 'Cancelar';

      e.overlay.classList.remove('hidden');
      e.modal.classList.remove('hidden');
      document.getElementById('_dlg_reps').focus();

      const done = (confirmed) => {
        e.overlay.classList.add('hidden');
        e.modal.classList.add('hidden');
        e.ok.onclick = null;
        e.cancel.onclick = null;
        e.close.onclick = null;
        e.overlay.onclick = null;
        if (!confirmed) { resolve(null); return; }
        const reps = parseInt(document.getElementById('_dlg_reps').value, 10);
        const wVal = document.getElementById('_dlg_weight').value;
        const weight = wVal !== '' ? parseFloat(wVal) : null;
        resolve({ reps, weight });
      };

      e.ok.onclick     = () => done(true);
      e.cancel.onclick = () => done(false);
      e.close.onclick  = () => done(false);
      e.overlay.onclick = (ev) => { if (ev.target === e.overlay) done(false); };
    });
  };

  // Exercise search: empty input + live-filter list. Returns Promise<string|null>
  window.showExerciseSearch = (title, exerciseList) => {
    return new Promise(resolve => {
      const e = _els();
      e.title.textContent = title || 'Cambiar ejercicio';
      e.body.innerHTML = `
        <input type="text" id="_dlg_ex_search" autocomplete="off"
          placeholder="Buscar ejercicio…" style="width:100%; margin:0 0 10px;" />
        <div id="_dlg_ex_results" style="max-height:220px; overflow-y:auto; border:1px solid #333; border-radius:6px;"></div>
      `;
      e.ok.style.display = 'none';
      e.cancel.style.display = '';
      e.cancel.textContent = 'Cancelar';

      e.overlay.classList.remove('hidden');
      e.modal.classList.remove('hidden');

      const searchInput = document.getElementById('_dlg_ex_search');
      const resultsDiv  = document.getElementById('_dlg_ex_results');
      searchInput.focus();

      function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function renderResults(query) {
        const lower = query.toLowerCase();
        const matches = query
          ? exerciseList.filter(n => n.toLowerCase().includes(lower))
          : exerciseList;
        const items = matches.slice(0, 25);
        resultsDiv.innerHTML = items.length
          ? items.map(n =>
              `<div class="dropdown-item" data-name="${esc(n)}"
                style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #1e1e1e; font-size:.9rem;">
                ${esc(n)}
              </div>`).join('')
          : `<div style="padding:10px 14px; color:#555; font-size:.85rem;">Sin resultados</div>`;
        resultsDiv.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', () => done(item.dataset.name));
        });
      }

      searchInput.addEventListener('input', () => renderResults(searchInput.value.trim()));
      renderResults('');

      const done = (name) => {
        e.overlay.classList.add('hidden');
        e.modal.classList.add('hidden');
        e.ok.style.display = '';
        e.ok.onclick     = null;
        e.cancel.onclick = null;
        e.close.onclick  = null;
        e.overlay.onclick = null;
        resolve(name || null);
      };

      e.cancel.onclick  = () => done(null);
      e.close.onclick   = () => done(null);
      e.overlay.onclick = (ev) => { if (ev.target === e.overlay) done(null); };
    });
  };

  // Muscle group selector. Returns Promise<string|null>
  window.showMuscleGroupSelect = (groups) => {
    return new Promise(resolve => {
      const e = _els();
      e.title.textContent = 'Grupo muscular';
      e.body.innerHTML = `
        <p style="color:#999; margin-bottom:12px; font-size:.88rem;">Ejercicio nuevo — selecciona su grupo muscular:</p>
        <select id="_dlg_muscle" style="width:100%; padding:10px; border:2px solid #444; background:#1a1a1a; color:#fff; border-radius:8px; font-family:'Oswald',sans-serif; cursor:pointer;">
          <option value="">Seleccionar...</option>
          ${groups.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>`;
      e.ok.textContent = 'Confirmar';
      e.ok.className = 'btn-primary';
      e.cancel.style.display = '';
      e.cancel.textContent = 'Cancelar';
      e.overlay.classList.remove('hidden');
      e.modal.classList.remove('hidden');
      document.getElementById('_dlg_muscle').focus();

      const done = (confirmed) => {
        e.overlay.classList.add('hidden');
        e.modal.classList.add('hidden');
        e.ok.onclick = null; e.cancel.onclick = null;
        e.close.onclick = null; e.overlay.onclick = null;
        if (!confirmed) { resolve(null); return; }
        resolve(document.getElementById('_dlg_muscle').value || null);
      };

      e.ok.onclick = () => { if (!document.getElementById('_dlg_muscle').value) return; done(true); };
      e.cancel.onclick = () => done(false);
      e.close.onclick  = () => done(false);
      e.overlay.onclick = (ev) => { if (ev.target === e.overlay) done(false); };
    });
  };
})();
