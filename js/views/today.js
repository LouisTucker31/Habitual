/* today.js — Renders today's habit cards, completion, numeric sheet, missed banner. */

import { getAll } from '../habits.js';
import { logCompletion, logPartial, removeLog, getLogForHabit, getTodayLogs } from '../logging.js';
import { open as openHabitModal, hexToRgba } from '../modals/habitModal.js';
import { toDateString } from '../utils.js';

const TODAY = toDateString();
const YESTERDAY = toDateString(new Date(Date.now() - 864e5));

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let _missedOpen  = false;
let _rendering   = false; // guard against double-render during completion animation

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function initialise() {
  await render();
  document.addEventListener('habitsUpdated', () => { if (!_rendering) render(); });
  document.addEventListener('logsUpdated',   () => { if (!_rendering) render(); });
  scheduleMidnightRefresh();
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render() {
  const section = document.getElementById('section-today');
  if (!section) return;

  const habits = getAll();
  const todayName = DAY_NAMES[new Date().getDay()];

  const due = habits.filter(h =>
    h.type === 'daily' ||
    (h.type === 'setDays' && h.days.includes(todayName))
  );

  const todayLogs = await getTodayLogs();
  const logMap = Object.fromEntries(todayLogs.map(l => [l.habitId, l]));

  const active    = due.filter(h => !logMap[h.id]?.completed);
  const completed = due.filter(h =>  logMap[h.id]?.completed);

  const missed = await getMissedYesterday(habits);

  let html = `<p class="section-title">Today</p>`;

  // Missed banner
  if (missed.length > 0) {
    html += renderMissedBanner(missed, logMap);
  }

  // Empty state
  if (due.length === 0) {
    html += `
      <div class="empty-state">
        <span class="empty-state__icon">✨</span>
        <span class="empty-state__heading">No habits yet</span>
        <span class="empty-state__body">Add your first habit to get started.</span>
      </div>
    `;
  } else {
    // Progress nudge — always shown, updates in place
    const nudgeMsg = active.length === 0
      ? `Perfect day so far 🔥`
      : active.length === due.length
        ? `${due.length} habit${due.length > 1 ? 's' : ''} to go — let's get started`
        : `${active.length} to go — keep it up 💪`;
    html += `<div class="perfect-nudge">${nudgeMsg}</div>`;

    // Single flat list — completed cards show green tick, stay in place
    html += `<div class="habits-list" id="habits-list">`;
    due.forEach((h, i) => {
      const log = logMap[h.id] ?? null;
      html += renderCard(h, log, !!log?.completed, i);
    });
    html += `</div>`;
  }

  section.innerHTML = html;
  attachCardListeners(active, completed, logMap, missed);
}

// ── Card renderer ─────────────────────────────────────────────────────────────

function renderCard(habit, log, isCompleted, index) {
  const streak = 0; // Phase 3 will calculate real streaks
  const flameClass = streakFlameClass(streak);
  const flameEmoji = isCompleted ? '✓' : streakFlameEmoji(streak);
  const badgeBg    = hexToRgba(habit.colour, 0.2);
  const cardTint   = hexToRgba(habit.colour, 0.05);

  const categoryLabel = habit.category.charAt(0).toUpperCase() + habit.category.slice(1);

  let progressStrip = '';
  let progressLabel = '';
  if (habit.format === 'numeric') {
    const val    = log?.value ?? 0;
    const target = habit.target ?? 1;
    const pct    = Math.min(100, Math.round((val / target) * 100));
    progressLabel = `
      <span class="habit-progress-label">
        ${val} / ${target}${habit.unit ? ' ' + habit.unit : ''}
      </span>`;
    progressStrip = `
      <div class="habit-progress-track">
        <div class="habit-progress-fill"
          style="width:${pct}%;background:${habit.colour}"></div>
      </div>`;
  }

  return `
    <div class="habit-card ${isCompleted ? 'is-completed' : ''} anim-card-entrance"
      data-id="${habit.id}"
      data-format="${habit.format}"
      data-completed="${isCompleted}"
      style="--habit-color:${habit.colour};background-color:${cardTint};animation-delay:${index * 40}ms">
      <div class="habit-card__icon-wrap" style="background:${badgeBg}">
        <span class="habit-card__icon">${habit.icon}</span>
        ${isCompleted ? '<span class="habit-card__check">✓</span>' : ''}
      </div>
      <div class="habit-card__body">
        <span class="habit-card__name">${habit.name}</span>
        <div class="habit-card__meta">
          <span class="pill">${categoryLabel}</span>
          ${progressLabel}
        </div>
        ${progressStrip}
      </div>
      <div class="habit-card__action">
        <span class="check-btn ${isCompleted ? 'is-checked' : ''}">
          ${isCompleted ? '✓' : ''}
        </span>
      </div>
    </div>
  `;
}

// ── Missed banner ─────────────────────────────────────────────────────────────

async function getMissedYesterday(habits) {
  const yesterdayName = DAY_NAMES[new Date(Date.now() - 864e5).getDay()];
  // Only consider habits that existed before today
  const dueYesterday = habits.filter(h => {
    const createdToday = toDateString(new Date(h.createdAt)) === TODAY;
    if (createdToday) return false;
    return h.type === 'daily' ||
      (h.type === 'setDays' && h.days.includes(yesterdayName));
  });
  const missed = [];
  for (const h of dueYesterday) {
    const log = await getLogForHabit(h.id, YESTERDAY);
    if (!log?.completed) missed.push(h);
  }
  return missed;
}

function renderMissedBanner(missed) {
  const count = missed.length;
  return `
    <div class="missed-banner" id="missed-banner">
      <span class="missed-banner__text">
        ${count} habit${count > 1 ? 's' : ''} missed yesterday
      </span>
      <span class="missed-banner__arrow">${_missedOpen ? '⌃' : '⌄'}</span>
    </div>
    <div id="missed-list" style="${_missedOpen ? '' : 'display:none'}">
      ${missed.map(h => `
        <div class="missed-item" data-id="${h.id}">
          <span>${h.icon} ${h.name}</span>
          <button class="btn btn--secondary missed-log-btn" data-id="${h.id}">
            Log late
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function attachCardListeners(active, completed, logMap, missed) {
  // All habit cards — body opens edit modal, action button completes/undoes
  document.querySelectorAll('#habits-list .habit-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.habit-card__action')) {
        const isCompleted = card.dataset.completed === 'true';
        if (isCompleted) {
          handleUndo(card);
        } else {
          handleCardTap(card, logMap);
        }
      } else {
        const habit = getAll().find(h => h.id === parseInt(card.dataset.id));
        if (habit) openHabitModal(habit);
      }
    });
  });

  // Missed banner toggle
  const banner = document.getElementById('missed-banner');
  if (banner) {
    banner.addEventListener('click', () => {
      _missedOpen = !_missedOpen;
      const list = document.getElementById('missed-list');
      if (list) list.style.display = _missedOpen ? '' : 'none';
      banner.querySelector('.missed-banner__arrow').textContent =
        _missedOpen ? '⌃' : '⌄';
    });
  }

  // Missed late-log buttons
  document.querySelectorAll('.missed-log-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      await logCompletion({ habitId: id, date: YESTERDAY, isBackdated: true });
      btn.textContent = 'Logged ✓';
      btn.disabled = true;
    });
  });
}

// ── Card tap — complete ───────────────────────────────────────────────────────

async function handleCardTap(card, logMap) {
  const id     = parseInt(card.dataset.id);
  const format = card.dataset.format;
  const habit  = getAll().find(h => h.id === id);
  if (!habit) return;

  if (format === 'numeric') {
    openNumericSheet(habit, logMap[id] ?? null);
    return;
  }

  // Block logsUpdated from triggering a re-render during animation
  _rendering = true;

  // Instantly update card visuals in-place
  card.dataset.completed = 'true';
  card.classList.add('is-completed', 'anim-completion-flash');

  const checkBtn = card.querySelector('.check-btn');
  if (checkBtn) {
    checkBtn.classList.add('is-checked');
    checkBtn.textContent = '✓';
  }

  const iconWrap = card.querySelector('.habit-card__icon-wrap');
  if (iconWrap) {
    iconWrap.innerHTML = `<span class="habit-card__icon">${habit.icon}</span><span class="habit-card__check anim-check-bounce">✓</span>`;
  }

  if (navigator.vibrate) navigator.vibrate(10);

  // Write to DB
  await logCompletion({ habitId: id, date: TODAY });

  // Now allow re-renders and do one clean update of just the nudge text
  _rendering = false;
  updateNudgeText();
}

function updateNudgeText() {
  const nudge = document.querySelector('.perfect-nudge');
  if (!nudge) return;
  const total    = document.querySelectorAll('#habits-list .habit-card').length;
  const remaining = document.querySelectorAll('#habits-list .habit-card:not(.is-completed)').length;
  nudge.textContent = remaining === 0
    ? `Perfect day so far 🔥`
    : remaining === total
      ? `${total} habit${total > 1 ? 's' : ''} to go — let's get started`
      : `${remaining} to go — keep it up 💪`;
}

async function handleUndo(card) {
  const id = parseInt(card.dataset.id);
  await removeLog(id, TODAY);
}

// ── Numeric sheet ─────────────────────────────────────────────────────────────

function openNumericSheet(habit, existingLog) {
  const existing = document.getElementById('numeric-sheet-backdrop');
  if (existing) existing.remove();

  const currentVal = existingLog?.value ?? 0;
  const step = getStep(habit.unit);

  const backdrop = document.createElement('div');
  backdrop.id = 'numeric-sheet-backdrop';
  backdrop.className = 'modal-backdrop is-open';
  backdrop.innerHTML = `
    <div class="modal-sheet numeric-sheet">
      <div class="modal-drag-handle"></div>
      <div class="numeric-sheet-header">
        <span class="numeric-sheet-icon"
          style="background:${hexToRgba(habit.colour, 0.2)}">${habit.icon}</span>
        <span class="numeric-sheet-name">${habit.name}</span>
      </div>
      <div class="numeric-input-row">
        <button class="numeric-adj-btn" id="ns-minus">−</button>
        <div class="numeric-input-wrap">
          <input class="numeric-value-input" id="ns-value" type="number"
            value="${currentVal}" min="0" step="${step}"/>
          <span class="numeric-unit-label">${habit.unit || ''}</span>
        </div>
        <button class="numeric-adj-btn" id="ns-plus">+</button>
      </div>
      <div class="numeric-target-label">
        Target: ${habit.target} ${habit.unit}
      </div>
      <button class="btn btn--primary" id="ns-log">Log</button>
    </div>
  `;

  document.body.appendChild(backdrop);

  const input = document.getElementById('ns-value');

  document.getElementById('ns-minus').addEventListener('click', () => {
    const v = Math.max(0, parseFloat(input.value || 0) - step);
    input.value = +v.toFixed(2);
  });
  document.getElementById('ns-plus').addEventListener('click', () => {
    const v = parseFloat(input.value || 0) + step;
    input.value = +v.toFixed(2);
  });

  document.getElementById('ns-log').addEventListener('click', async () => {
    const val = parseFloat(input.value) || 0;
    if (val >= habit.target) {
      await logCompletion({ habitId: habit.id, date: TODAY, value: val });
    } else {
      await logPartial({ habitId: habit.id, date: TODAY, value: val });
    }
    backdrop.remove();
  });

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.remove();
  });
}

function getStep(unit) {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'l' || u === 'kg' || u === 'km') return 0.1;
  if (u === 'steps') return 100;
  return 1;
}

// ── Streak helpers ────────────────────────────────────────────────────────────

function streakFlameClass(streak) {
  if (streak === 0)   return '';
  if (streak < 7)     return 'streak--warm';
  if (streak < 30)    return 'streak--hot';
  if (streak < 100)   return 'streak--fire anim-breathe';
  return 'streak--inferno anim-flame-pulse';
}

function streakFlameEmoji(streak) {
  return streak === 0 ? '○' : '🔥';
}

// ── Midnight refresh ──────────────────────────────────────────────────────────

function scheduleMidnightRefresh() {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntil  = midnight - now;
  setTimeout(() => {
    render();
    scheduleMidnightRefresh();
  }, msUntil);
}

export { render };
