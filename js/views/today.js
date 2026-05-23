/* today.js — Renders today's habit cards, completion, numeric sheet, missed banner. */

import { getAll } from '../habits.js';
import { logCompletion, logPartial, removeLog, getLogForHabit, getTodayLogs } from '../logging.js';
import { open as openHabitModal, hexToRgba } from '../modals/habitModal.js';
import { toDateString } from '../utils.js';
import { calculateAllStreaks, getCachedStreak, getStreakStatus } from '../streaks.js';
import { showMilestone, showPerfectDayBanner, checkAndShowComeback, maybeShowWeeklyReview } from '../celebrations.js';

const TODAY = toDateString();
const YESTERDAY = toDateString(new Date(Date.now() - 864e5));

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let _missedOpen  = false;
let _rendering   = false; // guard against double-render during completion animation

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function initialise() {
  await calculateAllStreaks();
  await render();
  await maybeShowWeeklyReview();

  document.addEventListener('habitsUpdated', () => { if (!_rendering) render(false); });
  document.addEventListener('logsUpdated',   () => { if (!_rendering) render(false); });
  document.addEventListener('milestoneReached', e => {
    const { habit, milestone } = e.detail;
    showMilestone(milestone, habit);
  });

  scheduleMidnightRefresh();
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render(animate = true) {
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
      html += renderCard(h, log, !!log?.completed, i, animate);
    });
    html += `</div>`;
  }

  section.innerHTML = html;
  attachCardListeners(active, completed, logMap, missed);
}

// ── Card renderer ─────────────────────────────────────────────────────────────

function renderCard(habit, log, isCompleted, index, animate = true) {
  const streak      = getCachedStreak(habit.id);
  const status      = getStreakStatus(streak);
  const badgeBg     = hexToRgba(habit.colour, 0.2);
  const cardTint    = hexToRgba(habit.colour, 0.05);
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

  const flameHtml = streak > 0 ? renderFlame(streak, status) : '';

  return `
    <div class="habit-card ${isCompleted ? 'is-completed' : ''} ${animate ? 'anim-card-entrance' : ''}"
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
          ${flameHtml}
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

function renderFlame(streak, status) {
  const animClass = {
    warm:      '',
    hot:       'anim-breathe',
    blazing:   'anim-flame-pulse',
    legendary: 'anim-flame-flicker',
  }[status] ?? '';

  return `
    <span class="streak-badge streak-badge--${status} ${animClass}" data-streak-badge>
      🔥 <span class="streak-badge__num">${streak}</span>
    </span>
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

  // Write to DB (also refreshes streak cache + dispatches milestoneReached if needed)
  await logCompletion({ habitId: id, date: TODAY });

  _rendering = false;
  updateStreakDisplays();
  checkAndShowComeback(habit);
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
  const habit = getAll().find(h => h.id === id);
  if (!habit) return;

  _rendering = true;

  // Update card in-place — no re-render, no dip
  card.dataset.completed = 'false';
  card.classList.remove('is-completed');

  const checkBtn = card.querySelector('.check-btn');
  if (checkBtn) {
    checkBtn.classList.remove('is-checked');
    checkBtn.textContent = '';
  }

  const iconWrap = card.querySelector('.habit-card__icon-wrap');
  if (iconWrap) {
    iconWrap.innerHTML = `<span class="habit-card__icon">${habit.icon}</span>`;
  }

  await removeLog(id, TODAY);

  _rendering = false;
  updateStreakDisplays();
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

  setupNumericSheetDrag(backdrop.querySelector('.numeric-sheet'), () => backdrop.remove());
}

function setupNumericSheetDrag(sheet, onDismiss) {
  if (!sheet) return;
  let startY = 0, deltaY = 0, dragging = false, dismissing = false;

  const onStart = e => {
    startY    = e.touches ? e.touches[0].clientY : e.clientY;
    deltaY    = 0;
    dragging  = true;
    dismissing = false;
  };

  const onMove = e => {
    if (!dragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    deltaY   = y - startY;

    if (!dismissing) {
      if (sheet.scrollTop <= 0 && deltaY > 0) {
        dismissing = true;
        sheet.style.overflow = 'hidden';
      } else {
        return;
      }
    }

    e.preventDefault();
    sheet.style.transition = 'none';
    sheet.style.transform  = `translateY(${Math.max(0, deltaY)}px)`;
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.overflow   = '';
    sheet.style.transition = '';
    if (dismissing && deltaY > 100) {
      onDismiss();
    } else {
      sheet.style.transform = '';
    }
    dismissing = false;
  };

  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove',  onMove,  { passive: false });
  sheet.addEventListener('touchend',   onEnd);
}

function getStep(unit) {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'l' || u === 'kg' || u === 'km') return 0.1;
  if (u === 'steps') return 100;
  return 1;
}

// ── Streak display update (in-place, no full re-render) ───────────────────────

function updateStreakDisplays() {
  const cards = document.querySelectorAll('#habits-list .habit-card');
  cards.forEach(card => {
    const id     = parseInt(card.dataset.id);
    const streak = getCachedStreak(id);
    const status = getStreakStatus(streak);
    const meta   = card.querySelector('.habit-card__meta');
    if (!meta) return;

    const existing = meta.querySelector('[data-streak-badge]');
    if (streak > 0) {
      const html = renderFlame(streak, status);
      if (existing) {
        existing.outerHTML = html;
      } else {
        // Insert after the pill
        const pill = meta.querySelector('.pill');
        if (pill) pill.insertAdjacentHTML('afterend', html);
        else meta.insertAdjacentHTML('afterbegin', html);
      }
    } else if (existing) {
      existing.remove();
    }
  });

  // Check for perfect day
  const total     = document.querySelectorAll('#habits-list .habit-card').length;
  const remaining = document.querySelectorAll('#habits-list .habit-card:not(.is-completed)').length;
  if (total > 0 && remaining === 0) showPerfectDayBanner();

  updateNudgeText();
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
