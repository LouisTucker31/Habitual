/* db.js — All IndexedDB logic. Nothing else in the app touches IndexedDB directly. */

const DB_NAME = 'habitual';
const DB_VERSION = 1;

let _db = null;

// ── Open / upgrade ──────────────────────────────────────────────────────────

export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('habits')) {
        const habitsStore = db.createObjectStore('habits', {
          keyPath: 'id',
          autoIncrement: true,
        });
        habitsStore.createIndex('order', 'order', { unique: false });
      }

      if (!db.objectStoreNames.contains('logs')) {
        const logsStore = db.createObjectStore('logs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        logsStore.createIndex('habitId', 'habitId', { unique: false });
        logsStore.createIndex('date', 'date', { unique: false });
        logsStore.createIndex('habitId_date', ['habitId', 'date'], { unique: false });
      }
    };

    request.onsuccess = event => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = event => {
      reject(event.target.error);
    };
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getStore(storeName, mode = 'readonly') {
  const tx = _db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

function getAll(storeName) {
  return promisifyRequest(getStore(storeName).getAll());
}

function getById(storeName, id) {
  return promisifyRequest(getStore(storeName).get(id));
}

function add(storeName, record) {
  return promisifyRequest(getStore(storeName, 'readwrite').add(record));
}

function put(storeName, record) {
  return promisifyRequest(getStore(storeName, 'readwrite').put(record));
}

function remove(storeName, id) {
  return promisifyRequest(getStore(storeName, 'readwrite').delete(id));
}

// ── Habits ───────────────────────────────────────────────────────────────────

export async function getAllHabits() {
  const habits = await getAll('habits');
  return habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getHabitById(id) {
  return getById('habits', id);
}

export async function addHabit(habitData) {
  const existing = await getAllHabits();
  const maxOrder = existing.reduce((max, h) => Math.max(max, h.order ?? 0), -1);
  const habit = {
    name:      habitData.name,
    category:  habitData.category  ?? 'general',
    type:      habitData.type      ?? 'daily',
    days:      habitData.days      ?? [],
    format:    habitData.format    ?? 'yesNo',
    target:    habitData.target    ?? null,
    unit:      habitData.unit      ?? '',
    icon:      habitData.icon      ?? '⭐',
    colour:    habitData.colour    ?? '#3b82f6',
    reminder:  habitData.reminder  ?? { enabled: false, time: '09:00' },
    createdAt: Date.now(),
    order:     maxOrder + 1,
  };
  const id = await add('habits', habit);
  return { ...habit, id };
}

export async function updateHabit(id, updates) {
  const existing = await getHabitById(id);
  if (!existing) throw new Error(`Habit ${id} not found`);
  const updated = { ...existing, ...updates, id };
  await put('habits', updated);
  return updated;
}

export function deleteHabit(id) {
  return remove('habits', id);
}

export async function reorderHabits(orderedIds) {
  const tx = _db.transaction('habits', 'readwrite');
  const store = tx.objectStore('habits');
  const updates = orderedIds.map((id, index) =>
    new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const habit = req.result;
        if (habit) {
          habit.order = index;
          const putReq = store.put(habit);
          putReq.onsuccess = resolve;
          putReq.onerror = reject;
        } else {
          resolve();
        }
      };
      req.onerror = reject;
    })
  );
  await Promise.all(updates);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// ── Logs ─────────────────────────────────────────────────────────────────────

export function getLogsForDate(date) {
  return new Promise((resolve, reject) => {
    const store = getStore('logs');
    const index = store.index('date');
    const request = index.getAll(IDBKeyRange.only(date));
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

export function getLogsForHabit(habitId) {
  return new Promise((resolve, reject) => {
    const store = getStore('logs');
    const index = store.index('habitId');
    const request = index.getAll(IDBKeyRange.only(habitId));
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

export function getLogsForDateRange(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const store = getStore('logs');
    const index = store.index('date');
    const range = IDBKeyRange.bound(startDate, endDate);
    const request = index.getAll(range);
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

export function getLogForHabitOnDate(habitId, date) {
  return new Promise((resolve, reject) => {
    const store = getStore('logs');
    const index = store.index('habitId_date');
    const request = index.getAll(IDBKeyRange.only([habitId, date]));
    request.onsuccess = () => resolve(request.result[0] ?? null);
    request.onerror  = () => reject(request.error);
  });
}

export function addLog(logData) {
  const log = {
    habitId:     logData.habitId,
    date:        logData.date,
    completed:   logData.completed   ?? true,
    value:       logData.value       ?? null,
    loggedAt:    Date.now(),
    isBackdated: logData.isBackdated ?? false,
    note:        logData.note        ?? '',
  };
  return add('logs', log);
}

export async function updateLog(id, updates) {
  const existing = await getById('logs', id);
  if (!existing) throw new Error(`Log ${id} not found`);
  const updated = { ...existing, ...updates, id };
  await put('logs', updated);
  return updated;
}

export function deleteLog(id) {
  return remove('logs', id);
}

// ── Nuke everything ──────────────────────────────────────────────────────────

export async function clearAllData() {
  const tx = _db.transaction(['habits', 'logs'], 'readwrite');
  tx.objectStore('habits').clear();
  tx.objectStore('logs').clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}
