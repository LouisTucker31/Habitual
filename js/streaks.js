/* streaks.js — Streak engine. All values derived from logs, never stored. */

import { getLogsForHabit, getLogsForDateRange, addLog } from './db.js';
import { getAll } from './habits.js';
import { toDateString } from './utils.js';

const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 365];

// In-memory cache: habitId -> streak number
let _streakCache = {};

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateFromString(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = dateFromString(dateStr);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function dayName(dateStr) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[dateFromString(dateStr).getDay()];
}

function mondayOf(dateStr) {
  const d = dateFromString(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

function isDue(habit, dateStr) {
  if (habit.type === 'daily') return true;
  if (habit.type === 'setDays') return habit.days.includes(dayName(dateStr));
  return false;
}

// ── Log map builder ───────────────────────────────────────────────────────────

async function buildLogMap(habitId) {
  const logs = await getLogsForHabit(habitId);
  const map = {};
  for (const log of logs) {
    map[log.date] = log;
  }
  return map;
}

// ── Current streak ────────────────────────────────────────────────────────────

export async function getCurrentStreak(habit) {
  const today     = toDateString();
  const logMap    = await buildLogMap(habit.id);
  const todayLog  = logMap[today];

  let streak = todayLog?.completed ? 1 : 0;

  // Walk back from yesterday
  let cursor = addDays(today, -1);
  const freezesUsed = {}; // weekMonday -> boolean

  for (let i = 0; i < 730; i++) {
    if (!isDue(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    const log = logMap[cursor];

    if (log?.completed) {
      streak++;
    } else if (log?.frozen) {
      // Freeze already applied for this day — treat as protected miss
      streak++;
    } else {
      // Miss — only a freeze can save it, and only if streak > 0 already
      if (streak === 0) break;
      const week = mondayOf(cursor);
      if (!freezesUsed[week]) {
        freezesUsed[week] = true;
        streak++; // freeze covers it
      } else {
        break; // streak broken
      }
    }

    cursor = addDays(cursor, -1);
  }

  return streak;
}

// ── Best ever streak ──────────────────────────────────────────────────────────

export async function getBestStreak(habit) {
  const logs   = await getLogsForHabit(habit.id);
  if (!logs.length) return 0;

  const dates  = [...new Set(logs.map(l => l.date))].sort();
  const logMap = {};
  for (const log of logs) logMap[log.date] = log;

  let best = 0, current = 0;
  const freezesUsed = {};

  for (const date of dates) {
    if (!isDue(habit, date)) continue;
    const log  = logMap[date];
    const week = mondayOf(date);

    if (log?.completed || log?.frozen) {
      current++;
    } else if (!freezesUsed[week]) {
      freezesUsed[week] = true;
      current++;
    } else {
      best = Math.max(best, current);
      current = 0;
      Object.keys(freezesUsed).forEach(k => delete freezesUsed[k]);
    }
  }

  return Math.max(best, current);
}

// ── Streak status ─────────────────────────────────────────────────────────────

export function getStreakStatus(streak) {
  if (streak === 0)   return 'cold';
  if (streak < 7)     return 'warm';
  if (streak < 30)    return 'hot';
  if (streak < 100)   return 'blazing';
  return 'legendary';
}

// ── At risk ───────────────────────────────────────────────────────────────────

export async function isStreakAtRisk(habit) {
  const today  = toDateString();
  const logMap = await buildLogMap(habit.id);
  if (logMap[today]?.completed) return false;

  const streak = await getCurrentStreak(habit);
  if (streak === 0) return false;

  const week = mondayOf(today);
  const { available } = await getFreezeStatus(habit, week);
  return !available;
}

// ── Freeze status ─────────────────────────────────────────────────────────────

export async function getFreezeStatus(habit, weekMonday) {
  const weekEnd = addDays(weekMonday, 6);
  const logs    = await getLogsForDateRange(weekMonday, weekEnd);
  const habitLogs = logs.filter(l => l.habitId === habit.id);
  const used    = habitLogs.some(l => l.frozen === true);
  return { available: !used, used };
}

// ── Apply freeze ──────────────────────────────────────────────────────────────

export async function applyFreeze(habitId, date) {
  await addLog({ habitId, date, completed: false, frozen: true, isBackdated: true });
}

// ── Calculate all streaks (cached) ────────────────────────────────────────────

export async function calculateAllStreaks() {
  const habits = getAll();
  const entries = await Promise.all(
    habits.map(async h => [h.id, await getCurrentStreak(h)])
  );
  _streakCache = Object.fromEntries(entries);
  return _streakCache;
}

export function getCachedStreak(habitId) {
  return _streakCache[habitId] ?? 0;
}

export function initialise() {}

// ── Milestone detection ───────────────────────────────────────────────────────

export function getMilestoneIfReached(streak) {
  if (MILESTONES.includes(streak)) return streak;
  return null;
}

// ── Overall app streak ────────────────────────────────────────────────────────

export async function getOverallAppStreak(threshold = 0.8) {
  const habits  = getAll();
  const today   = toDateString();
  let streak    = 0;
  let cursor    = addDays(today, -1);

  // Include today if all due habits completed
  const todayDue = habits.filter(h => isDue(h, today));
  if (todayDue.length > 0) {
    const todayLogs = await Promise.all(
      todayDue.map(h => buildLogMap(h.id).then(m => m[today]))
    );
    const todayPct = todayLogs.filter(l => l?.completed).length / todayDue.length;
    if (todayPct >= threshold) streak = 1;
  }

  for (let i = 0; i < 365; i++) {
    const due = habits.filter(h => isDue(h, cursor));
    if (due.length === 0) { cursor = addDays(cursor, -1); continue; }

    const logMaps = await Promise.all(due.map(h => buildLogMap(h.id)));
    const completed = logMaps.filter(m => m[cursor]?.completed).length;
    const pct = completed / due.length;

    if (pct >= threshold) {
      streak++;
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }

  return streak;
}

// ── Comeback detection ────────────────────────────────────────────────────────

export async function getComeback(habit) {
  const current = await getCurrentStreak(habit);
  if (current < 7) return false;

  const best = await getBestStreak(habit);
  // Comeback: current streak rebuilt but hasn't exceeded best yet
  return current < best;
}

// ── Weekly review data ────────────────────────────────────────────────────────

export async function getWeeklyReviewData() {
  const today  = toDateString();
  const monday = mondayOf(today);
  const habits = getAll();

  let totalDue = 0, totalDone = 0;
  let bestStreakVal = 0, bestStreakHabit = null;
  let bestRateVal = 0, bestRateHabit = null;

  for (const h of habits) {
    const logMap = await buildLogMap(h.id);
    let due = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > today) break;
      if (!isDue(h, d)) continue;
      due++;
      if (logMap[d]?.completed) done++;
    }
    totalDue  += due;
    totalDone += done;

    const rate = due > 0 ? done / due : 0;
    if (rate > bestRateVal) { bestRateVal = rate; bestRateHabit = h; }

    const streak = await getCurrentStreak(h);
    if (streak > bestStreakVal) { bestStreakVal = streak; bestStreakHabit = h; }
  }

  const pct = totalDue > 0 ? Math.round((totalDone / totalDue) * 100) : 0;

  return {
    percentage:      pct,
    bestStreak:      bestStreakVal,
    bestStreakHabit,
    bestRateHabit,
    bestRate:        Math.round(bestRateVal * 100),
    strong:          pct >= 70,
  };
}
