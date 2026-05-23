/* dayModal.js — Day detail modal: opened from week grid or calendar tap */

import { getAll } from '../habits.js';
import { getLogsForDate } from '../db.js';
import { logCompletion, logPartial } from '../logging.js';
import { toDateString } from '../utils.js';
import { hexToRgba } from './habitModal.js';

let _backdrop = null;

const TODAY = () => toDateString();

function dateFromString(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  const msA = dateFromString(a).getTime();
  const msB = dateFromString(b).getTime();
  return Math.round((msB - msA) / 86400000);
}

function friendlyDateLong(dateStr) {
  return dateFromString(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function isDue(habit, dateStr) {
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dateFromString(dateStr).getDay()];
  const created = toDateString(new Date(habit.createdAt));
  if (created > dateStr) return false;
  if (habit.type === 'daily') return true;
  if (habit.type === 'setDays') return habit.days.includes(dayName);
  return false;
}

// ── Open ──────────────────────────────────────────────────────────────────────

export async function open(dateStr) {
  const today = TODAY();
  if (dateStr > today) return; // future — no modal

  const logs   = await getLogsForDate(dateStr);
  const logMap = Object.fromEntries(logs.map(l => [l.habitId, l]));
  const habits = getAll().filter(h => isDue(h, dateStr));

  const isToday    = dateStr === today;
  const daysAgo    = daysBetween(dateStr, today);
  const canLateLog = !isToday && daysAgo <= 7;

  const doneCount = habits.filter(h => logMap[h.id]?.completed).length;
  const summary   = habits.length === 0
    ? 'No habits scheduled'
    : doneCount === habits.length
      ? 'Perfect day ✓'
      : doneCount === 0
        ? 'No habits logged'
        : `${doneCount} of ${habits.length} habits completed`;

  if (_backdrop) _backdrop.remove();

  _backdrop = document.createElement('div');
  _backdrop.className = 'modal-backdrop is-open';

  _backdrop.innerHTML = `
    <div class="modal-sheet day-modal" id="day-modal-sheet">
      <div class="modal-drag-handle"></div>
      <div class="day-modal__header">
        <div class="day-modal__title">${friendlyDateLong(dateStr)}</div>
        <div class="day-modal__summary">${summary}</div>
        <button class="day-modal__close" aria-label="Close">✕</button>
      </div>
      <div class="day-modal__list" id="day-modal-list">
        ${habits.length === 0
          ? `<div class="day-modal__empty">No habits were scheduled for this day.</div>`
          : habits.map(h => renderHabitRow(h, logMap[h.id] ?? null, canLateLog, isToday)).join('')
        }
      </div>
      ${isToday
        ? `<div class="day-modal__note">Log today's habits from the main view.</div>`
        : !canLateLog && habits.length > 0
          ? `<div class="day-modal__note">Late logging is available for the last 7 days.</div>`
          : ''
      }
    </div>
  `;

  document.body.appendChild(_backdrop);
  setupListeners(dateStr, canLateLog, habits, logMap);

  _backdrop.addEventListener('click', e => {
    if (e.target === _backdrop) close();
  });
  _backdrop.querySelector('.day-modal__close').addEventListener('click', close);
  setupDragDismiss(_backdrop.querySelector('#day-modal-sheet'));
}

export function close() {
  if (_backdrop) {
    _backdrop.remove();
    _backdrop = null;
  }
}

// ── Row renderer ──────────────────────────────────────────────────────────────

function renderHabitRow(habit, log, canLateLog, isToday) {
  const badgeBg = hexToRgba(habit.colour, 0.2);
  const catLabel = habit.category.charAt(0).toUpperCase() + habit.category.slice(1);

  let statusHtml = '';
  let lateLogHtml = '';

  if (log?.completed) {
    const backdated = log.isBackdated
      ? `<span class="day-row__backdated" title="Logged late">🕐</span>`
      : '';
    const valueLabel = (habit.format === 'numeric' && log.value != null)
      ? `<span class="day-row__value">${log.value}${habit.unit ? ' ' + habit.unit : ''} / ${habit.target}${habit.unit ? ' ' + habit.unit : ''}</span>`
      : '';
    statusHtml = `<span class="day-row__status day-row__status--done" style="color:${habit.colour}">✓</span>${backdated}${valueLabel}`;
  } else if (log?.frozen) {
    statusHtml = `<span class="day-row__status day-row__status--frozen">❄️</span>`;
  } else {
    statusHtml = `<span class="day-row__status day-row__status--missed">○</span>`;
    if (canLateLog && !isToday) {
      lateLogHtml = habit.format === 'numeric'
        ? `<button class="btn btn--secondary day-row__late-btn" data-id="${habit.id}" data-format="numeric">Log late</button>`
        : `<button class="btn btn--secondary day-row__late-btn" data-id="${habit.id}" data-format="yesno">Log late</button>`;
    }
  }

  return `
    <div class="day-row" data-id="${habit.id}">
      <div class="day-row__icon" style="background:${badgeBg}">${habit.icon}</div>
      <div class="day-row__body">
        <span class="day-row__name">${habit.name}</span>
        <div class="day-row__meta">
          <span class="pill">${catLabel}</span>
        </div>
        <div class="day-row__numeric-input" id="numeric-input-${habit.id}" style="display:none">
          <input type="number" class="day-row__num-field" min="0" step="0.1"
            placeholder="0" id="num-field-${habit.id}"/>
          <span class="day-row__num-unit">${habit.unit || ''}</span>
          <button class="btn btn--primary day-row__num-confirm" data-id="${habit.id}">Done</button>
        </div>
      </div>
      <div class="day-row__right">
        ${statusHtml}
        ${lateLogHtml}
      </div>
    </div>
  `;
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function setupListeners(dateStr, canLateLog, habits, logMap) {
  if (!canLateLog) return;

  document.querySelectorAll('.day-row__late-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id     = parseInt(btn.dataset.id);
      const format = btn.dataset.format;
      const habit  = habits.find(h => h.id === id);
      if (!habit) return;

      if (format === 'numeric') {
        // Show inline input
        const wrap = document.getElementById(`numeric-input-${id}`);
        if (wrap) {
          wrap.style.display = 'flex';
          wrap.querySelector('.day-row__num-field')?.focus();
        }
        btn.style.display = 'none';
      } else {
        await logCompletion({ habitId: id, date: dateStr, isBackdated: true });
        refreshRow(id, dateStr, habit, true);
        btn.closest('.day-row__right').innerHTML =
          `<span class="day-row__status day-row__status--done" style="color:${habit.colour}">✓</span>`
          + `<span class="day-row__backdated" title="Logged late">🕐</span>`;
      }
    });
  });

  document.querySelectorAll('.day-row__num-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = parseInt(btn.dataset.id);
      const habit = habits.find(h => h.id === id);
      const input = document.getElementById(`num-field-${id}`);
      const val   = parseFloat(input?.value) || 0;
      if (!habit) return;

      if (val >= (habit.target ?? 1)) {
        await logCompletion({ habitId: id, date: dateStr, value: val, isBackdated: true });
      } else {
        await logPartial({ habitId: id, date: dateStr, value: val });
      }

      const row = document.querySelector(`.day-row[data-id="${id}"] .day-row__right`);
      if (row) {
        row.innerHTML = `<span class="day-row__status day-row__status--done" style="color:${habit.colour}">✓</span>`
          + `<span class="day-row__backdated" title="Logged late">🕐</span>`
          + `<span class="day-row__value">${val}${habit.unit ? ' ' + habit.unit : ''} / ${habit.target}${habit.unit ? ' ' + habit.unit : ''}</span>`;
      }
    });
  });
}

function refreshRow(id, dateStr, habit, completed) {
  // Grid/calendar cells will update via logsUpdated event — no manual DOM needed here
}

// ── Drag dismiss ──────────────────────────────────────────────────────────────

function setupDragDismiss(sheet) {
  if (!sheet) return;
  let startY = 0, dragging = false;

  sheet.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    dragging = false;
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    if (dy > 10 && sheet.scrollTop <= 0) {
      dragging = true;
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
      sheet.style.transition = 'none';
      sheet.style.overflow = 'hidden';
    }
  }, { passive: true });

  sheet.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transition = '';
    sheet.style.overflow   = '';
    sheet.style.transform  = '';
    if (dragging && dy > 80) close();
    dragging = false;
  });
}

export function initialise() {}
