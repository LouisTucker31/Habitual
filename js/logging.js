/* logging.js — Daily log writes, reads, undo. All DB access via db.js. */

import {
  addLog,
  updateLog,
  deleteLog,
  getLogForHabitOnDate,
  getLogsForDate,
} from './db.js';
import { toDateString } from './utils.js';

function dispatch() {
  document.dispatchEvent(new CustomEvent('logsUpdated'));
}

// ── Read ─────────────────────────────────────────────────────────────────────

export function getLogForHabit(habitId, date) {
  return getLogForHabitOnDate(habitId, date);
}

export function getTodayLogs() {
  return getLogsForDate(toDateString());
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function logCompletion({ habitId, date, value = null, isBackdated = false }) {
  const existing = await getLogForHabitOnDate(habitId, date);
  if (existing) {
    await updateLog(existing.id, { completed: true, value, isBackdated });
  } else {
    await addLog({ habitId, date, completed: true, value, isBackdated });
  }
  dispatch();
}

export async function logPartial({ habitId, date, value }) {
  const existing = await getLogForHabitOnDate(habitId, date);
  if (existing) {
    await updateLog(existing.id, { value, completed: false });
  } else {
    await addLog({ habitId, date, completed: false, value, isBackdated: false });
  }
  dispatch();
}

export async function removeLog(habitId, date) {
  const existing = await getLogForHabitOnDate(habitId, date);
  if (existing) {
    await deleteLog(existing.id);
    dispatch();
  }
}

export function initialise() {}
