/* app.js — Entry point: initialises DB, registers service worker, boots all modules */

import { openDB }                          from './db.js';
import { toDateString, friendlyDate }      from './utils.js';
import { initialise as initHabits }        from './habits.js';
import { initialise as initStreaks }       from './streaks.js';
import { initialise as initWeek }          from './views/week.js';
import { initialise as initCalendar }      from './views/calendar.js';
import { initialise as initInsights }      from './views/insights.js';
import { initialise as initSettings }      from './views/settings.js';
import { initialise as initDayModal }      from './modals/dayModal.js';
import { initialise as initNotifications } from './notifications.js';
import { initialise as initOnboarding }    from './onboarding.js';
import { initialise as initCelebrations }  from './celebrations.js';
import { initialise as initToday }         from './views/today.js';
import { open as openHabitModal }          from './modals/habitModal.js';

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
  // Pin the app padding-top to the actual rendered header height
  requestAnimationFrame(() => {
    const h = document.getElementById('section-header').offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
  });
}

// ── Non-live section placeholders ────────────────────────────────────────────

function renderPlaceholderSections() {
  document.getElementById('section-week').innerHTML = `
    <p class="section-title">This Week</p>
    <div class="empty-state">
      <span class="empty-state__icon">📅</span>
      <span class="empty-state__heading">Coming soon</span>
      <span class="empty-state__body">Your weekly grid will appear here.</span>
    </div>
  `;
  document.getElementById('section-calendar').innerHTML = `
    <p class="section-title">History</p>
    <div class="empty-state">
      <span class="empty-state__icon">🗓️</span>
      <span class="empty-state__heading">Coming soon</span>
      <span class="empty-state__body">Your monthly heatmap will fill in here.</span>
    </div>
  `;
  document.getElementById('section-insights').innerHTML = `
    <p class="section-title">Insights</p>
    <div class="empty-state">
      <span class="empty-state__icon">📊</span>
      <span class="empty-state__heading">Coming soon</span>
      <span class="empty-state__body">Stats unlock after a week of logging.</span>
    </div>
  `;
}

// ── Floating add button ───────────────────────────────────────────────────────

function injectFAB() {
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-label', 'Add habit');
  fab.innerHTML = '+';
  fab.addEventListener('click', () => openHabitModal());
  document.body.appendChild(fab);
}

// ── Aurora blob ───────────────────────────────────────────────────────────────

function injectAuroraBlob() {
  const blob = document.createElement('div');
  blob.className = 'aurora-blob-3';
  document.body.appendChild(blob);
}

// ── Global listeners ──────────────────────────────────────────────────────────

function setupGlobalListeners() {
  document.addEventListener('click', event => {
    if (event.target.classList.contains('modal-backdrop')) {
      event.target.classList.remove('is-open');
    }
  });
}

// ── Service worker ────────────────────────────────────────────────────────────

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
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
  injectAuroraBlob();
  renderHeader();
  renderPlaceholderSections();
  setupGlobalListeners();

  // Initialise data layer first, then views
  await initHabits();

  // Views — today is live, rest are still placeholders
  await initToday();

  // Placeholder initialisers (no-ops until their phase)
  initStreaks();
  initWeek();
  initCalendar();
  initInsights();
  initSettings();
  initDayModal();
  initNotifications();
  initOnboarding();
  initCelebrations();

  // FAB always visible
  injectFAB();
}

document.addEventListener('DOMContentLoaded', boot);
