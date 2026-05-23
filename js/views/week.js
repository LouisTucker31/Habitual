/* week.js — Weekly habit grid: habits as rows, Mon–Sun as columns */

import { getAll } from '../habits.js';
import { getLogsForDateRange } from '../db.js';
import { toDateString } from '../utils.js';
import { logCompletion, removeLog } from '../logging.js';

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

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

function mondayOfWeek(dateStr) {
  const d = dateFromString(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

function isDue(habit, dateStr) {
  const dayName = DAY_LABELS[(dateFromString(dateStr).getDay() + 6) % 7]; // Mon=0
  const created = toDateString(new Date(habit.createdAt));
  if (created > dateStr) return false;
  if (habit.type === 'daily') return true;
  if (habit.type === 'setDays') return habit.days.includes(dayName);
  return false;
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function initialise() {
  await render();
  document.addEventListener('habitsUpdated', render);
  document.addEventListener('logsUpdated',   render);
}

async function render() {
  const section = document.getElementById('section-week');
  if (!section) return;

  const today  = toDateString();
  const monday = mondayOfWeek(today);
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const habits = getAll();
  const logs   = await getLogsForDateRange(monday, days[6]);

  // logMap[habitId][date] = log
  const logMap = {};
  for (const log of logs) {
    if (!logMap[log.habitId]) logMap[log.habitId] = {};
    logMap[log.habitId][log.date] = log;
  }

  let html = `<p class="section-title">This Week</p>`;

  if (habits.length === 0) {
    html += `<div class="empty-state">
      <span class="empty-state__icon">📅</span>
      <span class="empty-state__heading">No habits yet</span>
      <span class="empty-state__body">Add your first habit to start tracking your week.</span>
    </div>`;
    section.innerHTML = html;
    return;
  }

  html += `<div class="week-grid">`;

  // Header row
  html += `<div class="week-grid__header-row">
    <div class="week-grid__name-col"></div>`;
  days.forEach((d, i) => {
    const isToday  = d === today;
    const isFuture = d > today;
    const dateNum  = dateFromString(d).getDate();
    html += `
      <div class="week-grid__day-col ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''}"
        data-date="${d}">
        <span class="week-grid__day-label">${DAY_LABELS[i]}</span>
        <span class="week-grid__day-num">${dateNum}</span>
      </div>`;
  });
  html += `</div>`;

  // Habit rows
  habits.forEach(habit => {
    html += `<div class="week-grid__row">
      <div class="week-grid__name-col">
        <span class="week-grid__habit-icon" style="background:${hexToRgba(habit.colour, 0.18)}">${habit.icon}</span>
        <span class="week-grid__habit-name">${habit.name}</span>
      </div>`;

    days.forEach(d => {
      const isToday  = d === today;
      const isFuture = d > today;
      const due      = isDue(habit, d);
      const log      = logMap[habit.id]?.[d] ?? null;

      if (!due) {
        html += `<div class="week-cell week-cell--not-due" data-date="${d}"></div>`;
        return;
      }

      let cellClass = '';
      let cellInner = '';

      if (log?.completed) {
        cellClass = 'week-cell--completed';
      } else if (log?.frozen) {
        cellClass = 'week-cell--frozen';
        cellInner = '❄️';
      } else if (isFuture || isToday) {
        cellClass = 'week-cell--pending';
      } else {
        cellClass = 'week-cell--missed';
      }

      const interactive = !isFuture;
      html += `<div class="week-cell ${cellClass} ${isFuture ? 'week-cell--future' : ''}"
        data-date="${d}"
        data-habit-id="${habit.id}"
        style="${log?.completed ? `--habit-color:${habit.colour}` : ''}"
        ${interactive ? '' : 'aria-disabled="true"'}
      >${cellInner}</div>`;
    });

    html += `</div>`;
  });

  html += `</div>`; // .week-grid

  section.innerHTML = html;
  attachCellListeners(section);
}

// ── Cell tap — toggle completion ──────────────────────────────────────────────

function attachCellListeners(section) {
  section.querySelectorAll('.week-cell[data-habit-id]').forEach(cell => {
    if (cell.classList.contains('week-cell--future')) return;
    if (cell.classList.contains('week-cell--frozen')) return;
    if (cell.classList.contains('week-cell--not-due')) return;

    const habitId = parseInt(cell.dataset.habitId);
    const date    = cell.dataset.date;
    const habit   = getAll().find(h => h.id === habitId);
    if (!habit) return;

    cell.addEventListener('click', async () => {
      if (cell.classList.contains('week-cell--completed')) {
        await removeLog(habitId, date);
      } else {
        await logCompletion({ habitId, date, isBackdated: date !== toDateString() });
      }
      // render() fires automatically via logsUpdated
    });
  });
}

// ── Hex helper (duplicated from habitModal to avoid circular import) ───────────

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

