// Capa de acceso a IndexedDB para la app de entrenamientos.
const DB_NAME = 'gym-tracker-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('exercises')) {
        const exercises = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        exercises.createIndex('name', 'name', { unique: true });
      }

      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('date', 'date');
        entries.createIndex('exerciseId', 'exerciseId');
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async addExercise(name) {
    const store = await tx('exercises', 'readwrite');
    const id = await wrap(store.add({ name, createdAt: Date.now() }));
    return { id, name };
  },

  async getExercises() {
    const store = await tx('exercises');
    const all = await wrap(store.getAll());
    return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  },

  async deleteExercise(id) {
    const store = await tx('exercises', 'readwrite');
    await wrap(store.delete(id));
  },

  async addEntry(entry) {
    const store = await tx('entries', 'readwrite');
    const id = await wrap(store.add({ ...entry, createdAt: Date.now() }));
    return { ...entry, id };
  },

  async updateEntry(entry) {
    const store = await tx('entries', 'readwrite');
    await wrap(store.put(entry));
    return entry;
  },

  async deleteEntry(id) {
    const store = await tx('entries', 'readwrite');
    await wrap(store.delete(id));
  },

  async getEntries() {
    const store = await tx('entries');
    const all = await wrap(store.getAll());
    return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  },

  async getEntriesByExercise(exerciseId) {
    const store = await tx('entries');
    const idx = store.index('exerciseId');
    const all = await wrap(idx.getAll(exerciseId));
    return all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  },

  async exportAll() {
    const [exercises, entries] = await Promise.all([this.getExercises(), this.getEntries()]);
    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      exercises,
      entries,
    };
  },

  async importAll(data, { replace = false } = {}) {
    if (!data || !Array.isArray(data.exercises) || !Array.isArray(data.entries)) {
      throw new Error('Formato de archivo inválido');
    }

    if (replace) {
      await Promise.all([this.clearStore('exercises'), this.clearStore('entries')]);
    }

    const exerciseIdMap = new Map();
    const existing = await this.getExercises();
    const existingByName = new Map(existing.map((e) => [e.name, e.id]));

    for (const ex of data.exercises) {
      if (existingByName.has(ex.name)) {
        exerciseIdMap.set(ex.id, existingByName.get(ex.name));
      } else {
        const created = await this.addExercise(ex.name);
        exerciseIdMap.set(ex.id, created.id);
        existingByName.set(ex.name, created.id);
      }
    }

    for (const entry of data.entries) {
      const newExerciseId = exerciseIdMap.get(entry.exerciseId) ?? entry.exerciseId;
      const { id, ...rest } = entry;
      await this.addEntry({ ...rest, exerciseId: newExerciseId });
    }
  },

  async clearStore(storeName) {
    const store = await tx(storeName, 'readwrite');
    await wrap(store.clear());
  },

  async clearAll() {
    await Promise.all([this.clearStore('exercises'), this.clearStore('entries')]);
  },
};
