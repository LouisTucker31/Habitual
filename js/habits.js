/* habits.js — In-memory habit store. Single source of truth for the session. */

import {
  getAllHabits,
  addHabit,
  updateHabit,
  deleteHabit,
  reorderHabits,
} from './db.js';

let _habits = [];

function dispatch() {
  document.dispatchEvent(new CustomEvent('habitsUpdated'));
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export async function initialise() {
  _habits = await getAllHabits();
}

// ── Read ─────────────────────────────────────────────────────────────────────

export function getAll() {
  return _habits;
}

export function getById(id) {
  return _habits.find(h => h.id === id) ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function add(habitData) {
  const habit = await addHabit(habitData);
  _habits.push(habit);
  _habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  dispatch();
  return habit;
}

export async function update(id, updates) {
  const habit = await updateHabit(id, updates);
  const idx = _habits.findIndex(h => h.id === id);
  if (idx !== -1) _habits[idx] = habit;
  dispatch();
  return habit;
}

export async function remove(id) {
  await deleteHabit(id);
  _habits = _habits.filter(h => h.id !== id);
  dispatch();
}

export async function reorder(orderedIds) {
  await reorderHabits(orderedIds);
  orderedIds.forEach((id, index) => {
    const h = _habits.find(h => h.id === id);
    if (h) h.order = index;
  });
  _habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  dispatch();
}
