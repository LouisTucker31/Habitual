/* calendar.js — Monthly heatmap with navigation */

import { getAll } from '../habits.js';
import { getLogsForDateRange } from '../db.js';
import { toDateString } from '../utils.js';
import { open as openDayModal } from '../modals/dayModal.js';

// Cache: "YYYY-MM" -> { date -> pct }
const _cache = {};

let _year, _month; // currently displayed

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateFromString(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toStr(date) {
  return toDateString(date);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  // Returns 0=Mon … 6=Sun
  const d = new Date(year, month, 1).getDay();
  return (d + 6) % 7;
}

function isDue(habit, dateStr) {
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayName  = dayNames[dateFromString(dateStr).getDay()];
  const created  = toDateString(new Date(habit.createdAt));
  if (created > dateStr) return false;
  if (habit.type === 'daily') return true;
  if (habit.type === 'setDays') return habit.days.includes(dayName);
  return false;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function initialise() {
  const now = new Date();
  _year  = now.getFullYear();
  _month = now.getMonth();
  await render();
  document.addEventListener('habitsUpdated', () => { _cache[monthKey(_year, _month)] = null; render(); });
  document.addEventListener('logsUpdated',   () => { _cache[monthKey(_year, _month)] = null; render(); });
}

function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

// ── Render ────────────────────────────────────────────────────────────────────

async function render() {
  const section = document.getElementById('section-calendar');
  if (!section) return;

  const today    = toDateString();
  const now      = new Date();
  const isCurrentMonth = (_year === now.getFullYear() && _month === now.getMonth());

  const key      = monthKey(_year, _month);
  const pctMap   = _cache[key] ?? await buildPctMap(_year, _month);
  _cache[key]    = pctMap;

  const totalDays  = daysInMonth(_year, _month);
  const startOffset = firstDayOfMonth(_year, _month); // blank cells before 1st
  const monthLabel = new Date(_year, _month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Earliest allowed: 12 months back
  const earliest = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const canGoBack = new Date(_year, _month, 1) > earliest;

  let html = `<p class="section-title">History</p>`;
  html += `<div class="heatmap">`;
  html += `
    <div class="heatmap__month-label">
      <button class="heatmap__nav-btn ${canGoBack ? '' : 'is-disabled'}" id="cal-prev" aria-label="Previous month">‹</button>
      <span class="heatmap__month-name">${monthLabel}</span>
      <button class="heatmap__nav-btn ${isCurrentMonth ? 'is-disabled' : ''}" id="cal-next" aria-label="Next month">›</button>
    </div>
    <div class="heatmap__day-names">
      ${['M','T','W','T','F','S','S'].map(d => `<div class="heatmap__day-name">${d}</div>`).join('')}
    </div>
    <div class="heatmap__grid" id="heatmap-grid">
  `;

  // Blank cells
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="heatmap__day heatmap__day--empty"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${_year}-${String(_month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isFuture  = dateStr > today;
    const isToday   = dateStr === today;
    const pct       = pctMap[dateStr] ?? null;

    let cls = 'heatmap__day--none';
    if (!isFuture && pct !== null) {
      if (pct === 100) cls = 'heatmap__day--perfect';
      else if (pct >= 67) cls = 'heatmap__day--full';
      else if (pct >= 34) cls = 'heatmap__day--partial';
      else if (pct > 0)   cls = 'heatmap__day--low';
      else                cls = 'heatmap__day--none';
    }

    html += `<div class="heatmap__day ${cls} ${isFuture ? 'heatmap__day--future' : ''} ${isToday ? 'heatmap__day--today' : ''}"
      data-date="${dateStr}"
      title="${dateStr}"
    ></div>`;
  }

  html += `</div></div>`; // grid + heatmap

  section.innerHTML = html;

  // Nav buttons
  const prevBtn = section.querySelector('#cal-prev');
  const nextBtn = section.querySelector('#cal-next');

  if (prevBtn && canGoBack) {
    prevBtn.addEventListener('click', () => {
      slideMonth(-1);
    });
  }
  if (nextBtn && !isCurrentMonth) {
    nextBtn.addEventListener('click', () => {
      slideMonth(1);
    });
  }

  // Day taps
  section.querySelectorAll('.heatmap__day[data-date]').forEach(el => {
    const date = el.dataset.date;
    if (!date || date > today) return;
    el.addEventListener('click', () => openDayModal(date));
  });
}

async function slideMonth(dir) {
  _month += dir;
  if (_month < 0)  { _month = 11; _year--; }
  if (_month > 11) { _month = 0;  _year++; }

  const grid = document.getElementById('heatmap-grid');
  if (grid) {
    grid.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
    grid.style.transform  = `translateX(${dir < 0 ? '40px' : '-40px'})`;
    grid.style.opacity    = '0';
  }

  await new Promise(r => setTimeout(r, 220));
  await render();
}

// ── Build completion % map for a month ───────────────────────────────────────

async function buildPctMap(year, month) {
  const habits     = getAll();
  const totalDays  = daysInMonth(year, month);
  const startStr   = `${year}-${String(month + 1).padStart(2,'0')}-01`;
  const endStr     = `${year}-${String(month + 1).padStart(2,'0')}-${String(totalDays).padStart(2,'0')}`;

  const logs    = await getLogsForDateRange(startStr, endStr);
  const logMap  = {};
  for (const log of logs) {
    if (!logMap[log.date]) logMap[log.date] = {};
    logMap[log.date][log.habitId] = log;
  }

  const pctMap = {};
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const due     = habits.filter(h => isDue(h, dateStr));
    if (due.length === 0) { pctMap[dateStr] = null; continue; }
    const done    = due.filter(h => logMap[dateStr]?.[h.id]?.completed).length;
    pctMap[dateStr] = Math.round((done / due.length) * 100);
  }

  return pctMap;
}
