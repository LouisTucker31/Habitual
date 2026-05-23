/* app.js — Entry point: initialises DB, registers service worker, renders placeholders */

import { openDB } from './db.js';
import { initialise as initHabits }        from './habits.js';
import { initialise as initLogging }       from './logging.js';
import { initialise as initStreaks }       from './streaks.js';
import { initialise as initToday }         from './views/today.js';
import { initialise as initWeek }          from './views/week.js';
import { initialise as initCalendar }      from './views/calendar.js';
import { initialise as initInsights }      from './views/insights.js';
import { initialise as initSettings }      from './views/settings.js';
import { initialise as initHabitModal }    from './modals/habitModal.js';
import { initialise as initDayModal }      from './modals/dayModal.js';
import { initialise as initNotifications } from './notifications.js';
import { initialise as initOnboarding }    from './onboarding.js';
import { initialise as initCelebrations }  from './celebrations.js';

// ── Date helpers ─────────────────────────────────────────────────────────────

export function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function friendlyDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ── Header ───────────────────────────────────────────────────────────────────

function renderHeader() {
  const el = document.getElementById('section-header');
  el.innerHTML = `
    <div class="header-inner">
      <div class="header-left">
        <span class="app-name">Habitual</span>
        <span class="header-date">${friendlyDate()}</span>
      </div>
      <div class="header-right">
        <div class="score-ring">
          <span class="score-ring__value" id="header-score">—</span>
          <span class="score-ring__label">today</span>
        </div>
        <div class="overall-streak">
          <span class="overall-streak__flame">🔥</span>
          <span class="overall-streak__count" id="header-streak">0</span>
        </div>
        <button class="btn btn--icon" id="btn-settings" aria-label="Settings">⚙️</button>
      </div>
    </div>
  `;
}

// ── Section placeholders ─────────────────────────────────────────────────────

function renderSectionPlaceholders() {
  document.getElementById('section-today').innerHTML = `
    <p class="section-title">Today</p>
    <div class="empty-state">
      <span class="empty-state__icon">🌱</span>
      <span class="empty-state__heading">No habits yet</span>
      <span class="empty-state__body">Tap + to add your first habit and start building your streak.</span>
    </div>
    <button class="btn btn--primary" id="btn-add-habit" style="margin-top: 0;">+ Add habit</button>
  `;

  document.getElementById('section-week').innerHTML = `
    <p class="section-title">This Week</p>
    <div class="empty-state">
      <span class="empty-state__icon">📅</span>
      <span class="empty-state__heading">Nothing to show yet</span>
      <span class="empty-state__body">Your weekly progress will appear here once you have habits.</span>
    </div>
  `;

  document.getElementById('section-calendar').innerHTML = `
    <p class="section-title">History</p>
    <div class="empty-state">
      <span class="empty-state__icon">🗓️</span>
      <span class="empty-state__heading">No history yet</span>
      <span class="empty-state__body">Your completion heatmap will fill in as you log habits each day.</span>
    </div>
  `;

  document.getElementById('section-insights').innerHTML = `
    <p class="section-title">Insights</p>
    <div class="empty-state">
      <span class="empty-state__icon">📊</span>
      <span class="empty-state__heading">Insights coming soon</span>
      <span class="empty-state__body">Log at least a week of habits to unlock your personal stats.</span>
    </div>
  `;
}

// ── Service worker ───────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

// ── Global event delegation ──────────────────────────────────────────────────

function setupGlobalListeners() {
  document.addEventListener('click', event => {
    // Close modal when backdrop is tapped
    if (event.target.classList.contains('modal-backdrop')) {
      event.target.classList.remove('is-open');
    }
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    await openDB();
  } catch (err) {
    console.error('Failed to open database:', err);
    return;
  }

  registerServiceWorker();
  renderHeader();
  renderSectionPlaceholders();
  setupGlobalListeners();

  // Phase 1: all initialisers are no-ops — wiring confirmed, no errors
  initHabits();
  initLogging();
  initStreaks();
  initToday();
  initWeek();
  initCalendar();
  initInsights();
  initSettings();
  initHabitModal();
  initDayModal();
  initNotifications();
  initOnboarding();
  initCelebrations();
}

document.addEventListener('DOMContentLoaded', boot);
