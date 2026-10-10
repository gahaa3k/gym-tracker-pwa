import { db } from './db.js';
import { drawLineChart } from './chart.js';

const viewRoot = document.getElementById('view-root');
const viewTitle = document.getElementById('view-title');
const bottomNav = document.getElementById('bottom-nav');
const toastEl = document.getElementById('toast');
const offlineBanner = document.getElementById('offline-banner');

const VIEW_TITLES = {
  log: 'Registrar',
  history: 'Historial',
  progress: 'Progreso',
  settings: 'Ajustes',
};

let editingEntry = null; // entry being edited, prefills the log view
let progressState = { exerciseId: null, metric: 'max' };
let historyState = { exerciseFilter: 'all' };

// ---------- Utilidades ----------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - date) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: diffDays > 300 ? 'numeric' : undefined });
}

function formatDateShort(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function setRowTemplate(index, weight = '', reps = '') {
  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <span class="set-index">${index}</span>
    <input type="number" inputmode="decimal" step="0.5" min="0" placeholder="Kg" class="set-weight" value="${escapeHtml(weight)}" />
    <input type="number" inputmode="numeric" step="1" min="0" placeholder="Reps" class="set-reps" value="${escapeHtml(reps)}" />
    <button type="button" class="btn-icon remove-set" aria-label="Eliminar serie">✕</button>
  `;
  return row;
}

function renumberSetRows(container) {
  [...container.querySelectorAll('.set-row')].forEach((row, i) => {
    row.querySelector('.set-index').textContent = i + 1;
  });
}

// ---------- Vista: Registrar ----------

async function renderLogView() {
  const exercises = await db.getExercises();
  const prefill = editingEntry;
  const defaultDate = prefill ? prefill.date : todayISO();

  viewRoot.innerHTML = `
    <div class="card">
      <h2>${prefill ? 'Editar sesión' : 'Nueva sesión'}</h2>
      <div class="row">
        <div class="field">
          <label for="entry-date">Fecha</label>
          <input type="date" id="entry-date" value="${defaultDate}" max="${todayISO()}" />
        </div>
      </div>
      <div class="field">
        <label for="exercise-input">Ejercicio</label>
        <input type="text" id="exercise-input" list="exercise-list" placeholder="Ej: Press banca" value="${escapeHtml(prefill ? prefill.exerciseName : '')}" autocomplete="off" />
        <datalist id="exercise-list">
          ${exercises.map((e) => `<option value="${escapeHtml(e.name)}"></option>`).join('')}
        </datalist>
      </div>
      <div class="field">
        <label>Series</label>
        <div id="sets-container"></div>
        <button type="button" class="btn btn-secondary" id="add-set-btn">+ Añadir serie</button>
      </div>
      <button type="button" class="btn btn-primary" id="save-entry-btn">${prefill ? 'Guardar cambios' : 'Guardar sesión'}</button>
      ${prefill ? '<button type="button" class="btn btn-secondary" id="cancel-edit-btn" style="margin-top:8px">Cancelar edición</button>' : ''}
    </div>
    <div id="today-entries"></div>
  `;

  const setsContainer = document.getElementById('sets-container');
  const initialSets = prefill ? prefill.sets : [{ weight: '', reps: '' }];
  initialSets.forEach((s, i) => setsContainer.appendChild(setRowTemplate(i + 1, s.weight, s.reps)));

  document.getElementById('add-set-btn').addEventListener('click', () => {
    const last = setsContainer.querySelector('.set-row:last-child');
    const lastWeight = last ? last.querySelector('.set-weight').value : '';
    setsContainer.appendChild(setRowTemplate(setsContainer.children.length + 1, lastWeight, ''));
  });

  setsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-set')) {
      const rows = setsContainer.querySelectorAll('.set-row');
      if (rows.length > 1) {
        e.target.closest('.set-row').remove();
        renumberSetRows(setsContainer);
      } else {
        e.target.closest('.set-row').querySelector('.set-weight').value = '';
        e.target.closest('.set-row').querySelector('.set-reps').value = '';
      }
    }
  });

  document.getElementById('save-entry-btn').addEventListener('click', () => saveEntry(exercises));

  if (prefill) {
    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
      editingEntry = null;
      renderLogView();
    });
  }

  renderTodayEntries(defaultDate);
  document.getElementById('entry-date').addEventListener('change', (e) => renderTodayEntries(e.target.value));
}

async function renderTodayEntries(date) {
  const container = document.getElementById('today-entries');
  if (!container) return;
  const [entries, exercises] = await Promise.all([db.getEntries(), db.getExercises()]);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  const dayEntries = entries.filter((e) => e.date === date);

  if (!dayEntries.length) {
    container.innerHTML = `<p class="muted">Sin sesiones registradas este día.</p>`;
    return;
  }

  container.innerHTML = `
    <h2 style="font-size:0.85rem;color:var(--text-muted);margin:0 0 10px 4px;">SESIONES DE ESTE DÍA</h2>
    ${dayEntries.map((entry) => entryItemHtml(entry, nameById.get(entry.exerciseId))).join('')}
  `;

  attachEntryItemEvents(container);
}

function entryItemHtml(entry, exerciseName) {
  const chips = entry.sets
    .map((s) => `<span class="chip">${escapeHtml(s.weight)}kg × ${escapeHtml(s.reps)}</span>`)
    .join('');
  return `
    <div class="entry-item" data-id="${entry.id}">
      <div class="entry-head">
        <strong>${escapeHtml(exerciseName || 'Ejercicio')}</strong>
        <div>
          <button class="btn-icon edit-entry" aria-label="Editar">✏️</button>
          <button class="btn-icon delete-entry" aria-label="Eliminar">🗑️</button>
        </div>
      </div>
      <div class="chips">${chips}</div>
    </div>
  `;
}

function attachEntryItemEvents(container) {
  container.querySelectorAll('.delete-entry').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.target.closest('.entry-item').dataset.id);
      if (confirm('¿Eliminar esta sesión?')) {
        await db.deleteEntry(id);
        showToast('Sesión eliminada');
        navigate(currentView, true);
      }
    });
  });
  container.querySelectorAll('.edit-entry').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.target.closest('.entry-item').dataset.id);
      const entries = await db.getEntries();
      const entry = entries.find((en) => en.id === id);
      const exercises = await db.getExercises();
      const exercise = exercises.find((ex) => ex.id === entry.exerciseId);
      editingEntry = { ...entry, exerciseName: exercise ? exercise.name : '' };
      navigate('log', true);
    });
  });
}

async function saveEntry(exercises) {
  const date = document.getElementById('entry-date').value;
  const exerciseName = document.getElementById('exercise-input').value.trim();

  if (!date) return showToast('Elige una fecha');
  if (!exerciseName) return showToast('Escribe el nombre del ejercicio');

  const sets = [...document.querySelectorAll('#sets-container .set-row')]
    .map((row) => ({
      weight: parseFloat(row.querySelector('.set-weight').value),
      reps: parseInt(row.querySelector('.set-reps').value, 10),
    }))
    .filter((s) => !Number.isNaN(s.weight) && !Number.isNaN(s.reps));

  if (!sets.length) return showToast('Añade al menos una serie con peso y reps');

  let exercise = exercises.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase());
  if (!exercise) {
    exercise = await db.addExercise(exerciseName);
  }

  if (editingEntry) {
    await db.updateEntry({ ...editingEntry, exerciseId: exercise.id, date, sets });
    showToast('Sesión actualizada');
    editingEntry = null;
  } else {
    await db.addEntry({ exerciseId: exercise.id, date, sets });
    showToast('Sesión guardada');
  }

  renderLogView();
}

// ---------- Vista: Historial ----------

async function renderHistoryView() {
  const [entries, exercises] = await Promise.all([db.getEntries(), db.getExercises()]);
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  viewRoot.innerHTML = `
    <div class="field">
      <label for="history-filter">Filtrar por ejercicio</label>
      <select id="history-filter">
        <option value="all">Todos los ejercicios</option>
        ${exercises.map((e) => `<option value="${e.id}" ${String(e.id) === String(historyState.exerciseFilter) ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
      </select>
    </div>
    <div id="history-list"></div>
  `;

  document.getElementById('history-filter').value = historyState.exerciseFilter;
  document.getElementById('history-filter').addEventListener('change', (e) => {
    historyState.exerciseFilter = e.target.value;
    renderHistoryList(entries, nameById);
  });

  renderHistoryList(entries, nameById);
}

function renderHistoryList(entries, nameById) {
  const list = document.getElementById('history-list');
  const filtered =
    historyState.exerciseFilter === 'all'
      ? entries
      : entries.filter((e) => String(e.exerciseId) === String(historyState.exerciseFilter));

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">Sin sesiones registradas todavía.<br/>Ve a "Registrar" para añadir tu primer entrenamiento.</div>`;
    return;
  }

  const groups = new Map();
  filtered.forEach((entry) => {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  });

  list.innerHTML = [...groups.entries()]
    .map(
      ([date, dayEntries]) => `
      <div class="day-group">
        <h3>${formatDateLabel(date)} · ${date.split('-').reverse().join('/')}</h3>
        ${dayEntries.map((entry) => entryItemHtml(entry, nameById.get(entry.exerciseId))).join('')}
      </div>
    `
    )
    .join('');

  attachEntryItemEvents(list);
}

// ---------- Vista: Progreso ----------

async function renderProgressView() {
  const exercises = await db.getExercises();

  if (!exercises.length) {
    viewRoot.innerHTML = `<div class="empty-state">Todavía no hay ejercicios registrados.<br/>Registra una sesión para ver tu progreso aquí.</div>`;
    return;
  }

  if (!progressState.exerciseId || !exercises.some((e) => e.id === progressState.exerciseId)) {
    progressState.exerciseId = exercises[0].id;
  }

  viewRoot.innerHTML = `
    <div class="field">
      <label for="progress-exercise">Ejercicio</label>
      <select id="progress-exercise">
        ${exercises.map((e) => `<option value="${e.id}" ${e.id === progressState.exerciseId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card">
      <div class="segmented" id="metric-toggle">
        <button data-metric="max" class="${progressState.metric === 'max' ? 'active' : ''}">Peso máximo</button>
        <button data-metric="volume" class="${progressState.metric === 'volume' ? 'active' : ''}">Volumen</button>
      </div>
      <canvas class="chart" id="progress-chart"></canvas>
      <div class="stats-grid" id="progress-stats"></div>
    </div>
  `;

  document.getElementById('progress-exercise').addEventListener('change', (e) => {
    progressState.exerciseId = Number(e.target.value);
    renderProgressChart();
  });

  document.getElementById('metric-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    progressState.metric = btn.dataset.metric;
    renderProgressChart();
  });

  renderProgressChart();
}

async function renderProgressChart() {
  const canvas = document.getElementById('progress-chart');
  const statsBox = document.getElementById('progress-stats');
  document.querySelectorAll('#metric-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.metric === progressState.metric));

  const entries = await db.getEntriesByExercise(progressState.exerciseId);

  const points = entries.map((entry) => {
    const maxWeight = Math.max(...entry.sets.map((s) => s.weight));
    const volume = entry.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return {
      value: progressState.metric === 'max' ? maxWeight : volume,
      label: formatDateShort(entry.date),
      date: entry.date,
    };
  });

  drawLineChart(canvas, points, { unit: progressState.metric === 'max' ? 'kg' : 'kg·reps' });

  if (!entries.length) {
    statsBox.innerHTML = '';
    return;
  }

  const allMaxWeights = entries.map((e) => Math.max(...e.sets.map((s) => s.weight)));
  const pr = Math.max(...allMaxWeights);
  const last = entries[entries.length - 1];
  const lastMax = Math.max(...last.sets.map((s) => s.weight));

  statsBox.innerHTML = `
    <div class="stat"><div class="value">${pr}</div><div class="label">PR (kg)</div></div>
    <div class="stat"><div class="value">${lastMax}</div><div class="label">Última (kg)</div></div>
    <div class="stat"><div class="value">${entries.length}</div><div class="label">Sesiones</div></div>
  `;
}

// ---------- Vista: Ajustes ----------

async function renderSettingsView() {
  const [exercises, entries] = await Promise.all([db.getExercises(), db.getEntries()]);

  viewRoot.innerHTML = `
    <div class="card">
      <h2>Tus datos</h2>
      <p class="muted">${exercises.length} ejercicios · ${entries.length} sesiones registradas. Todo se guarda localmente en este dispositivo (IndexedDB).</p>
    </div>
    <div class="card">
      <h2>Exportar</h2>
      <p class="muted">Descarga un archivo JSON con todo tu historial como copia de seguridad.</p>
      <button class="btn btn-secondary" id="export-btn">⬇️ Exportar a JSON</button>
    </div>
    <div class="card">
      <h2>Importar</h2>
      <p class="muted">Selecciona un archivo JSON exportado previamente.</p>
      <input type="file" accept="application/json,.json" id="import-input" style="margin-bottom:10px;width:100%;" />
      <div class="row">
        <button class="btn btn-secondary" id="import-merge-btn">Fusionar</button>
        <button class="btn btn-secondary" id="import-replace-btn">Reemplazar todo</button>
      </div>
    </div>
    <div class="card">
      <h2>Zona de peligro</h2>
      <button class="btn btn-danger" id="clear-all-btn">Borrar todos los datos</button>
    </div>
    <p class="muted" style="text-align:center;">Gym Tracker · funciona sin conexión</p>
  `;

  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-merge-btn').addEventListener('click', () => importData(false));
  document.getElementById('import-replace-btn').addEventListener('click', () => importData(true));
  document.getElementById('clear-all-btn').addEventListener('click', async () => {
    if (confirm('Esto borrará TODOS los ejercicios y sesiones de este dispositivo. ¿Continuar?')) {
      await db.clearAll();
      showToast('Datos borrados');
      renderSettingsView();
    }
  });
}

async function exportData() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gym-tracker-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Archivo exportado');
}

async function importData(replace) {
  const input = document.getElementById('import-input');
  const file = input.files[0];
  if (!file) return showToast('Selecciona un archivo primero');

  if (replace && !confirm('Se eliminarán los datos actuales y se sustituirán por los del archivo. ¿Continuar?')) {
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importAll(data, { replace });
    showToast('Importación completada');
    renderSettingsView();
  } catch (err) {
    showToast('Error al importar: ' + err.message);
  }
}

// ---------- Router ----------

let currentView = 'log';

async function navigate(view, force = false) {
  if (view === currentView && !force) return;
  currentView = view;
  viewTitle.textContent = VIEW_TITLES[view];
  [...bottomNav.children].forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  window.location.hash = view;

  if (view === 'log') await renderLogView();
  else if (view === 'history') await renderHistoryView();
  else if (view === 'progress') await renderProgressView();
  else if (view === 'settings') await renderSettingsView();
}

bottomNav.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  editingEntry = null;
  navigate(btn.dataset.view);
});

window.addEventListener('hashchange', () => {
  const view = window.location.hash.replace('#', '') || 'log';
  if (VIEW_TITLES[view]) navigate(view, true);
});

// ---------- Offline / red ----------

function updateOnlineStatus() {
  offlineBanner.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ---------- Service worker ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW error:', err));
  });
}

// ---------- Inicio ----------

const initialView = window.location.hash.replace('#', '') || 'log';
navigate(VIEW_TITLES[initialView] ? initialView : 'log', true);
