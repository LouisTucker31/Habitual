/* insights.js — Insights & Stats section */

import { getAll }              from '../habits.js';
import { getLogsForDateRange } from '../db.js';
import { toDateString }        from '../utils.js';
import { getCurrentStreak, getBestStreak } from '../streaks.js';
import { open as openHabitModal }          from '../modals/habitModal.js';

const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let _window       = 30;
let _expanded     = null;
let _barAnimDone  = false;
let _ringAnimDone = false;
let _observer     = null;

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function initialise() {
  await render();
  document.addEventListener('habitsUpdated', render);
  document.addEventListener('logsUpdated',   render);
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render() {
  const section = document.getElementById('section-insights');
  if (!section) return;

  const habits = getAll();
  const today  = toDateString();

  const earliestLog  = await getEarliestLogDate();
  const daysSinceFirst = earliestLog ? daysBetween(earliestLog, today) + 1 : 0;

  if (!earliestLog) {
    section.innerHTML = `
      <p class="section-title">Insights</p>
      <div class="insights-empty">
        <div class="insights-empty__icon">📊</div>
        <div class="insights-empty__heading">Your insights will appear here</div>
        <div class="insights-empty__body">Come back after a few days of logging to see your stats.</div>
      </div>`;
    return;
  }

  const windows    = [7, 30, 90];
  const startDates = {};
  for (const w of windows) startDates[w] = addDays(today, -(w - 1));

  const allLogs = await getLogsForDateRange(startDates[90], today);
  const logMap  = {};
  for (const log of allLogs) {
    if (!logMap[log.date]) logMap[log.date] = {};
    logMap[log.date][log.habitId] = log;
  }

  const windowStats = {};
  for (const w of windows) {
    windowStats[w] = calcWindowStats(habits, logMap, startDates[w], today, daysSinceFirst);
  }

  const ws         = windowStats[_window];
  const streakData = await calcStreakData(habits);
  const momentum   = calcMomentum(habits, logMap, today);
  const consistency = calcConsistency(habits, logMap, startDates[_window], today);
  const attention  = calcAttention(habits, logMap, today);
  const dataNote = daysSinceFirst < _window
    ? `<span class="insights-data-note">Based on ${daysSinceFirst} day${daysSinceFirst !== 1 ? 's' : ''} of data</span>`
    : '';

  const score        = Math.round(ws.pct);
  const circumference = 2 * Math.PI * 52;
  const dash         = (score / 100) * circumference;

  let html = `<p class="section-title">Insights</p>`;

  html += `
    <div class="insights-score-block" id="insights-score-block">
      <div class="insights-ring-wrap">
        <svg class="insights-ring" viewBox="0 0 120 120" width="120" height="120">
          <circle class="insights-ring__track" cx="60" cy="60" r="52"/>
          <circle class="insights-ring__fill" cx="60" cy="60" r="52"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference}"
            data-dash="${dash}"
            id="ring-fill"/>
        </svg>
        <div class="insights-ring__centre">
          <span class="insights-score-num" id="insights-score-num" data-score="${score}">0%</span>
        </div>
      </div>
      <div class="insights-score-message">${scoreMessage(score)}</div>
      ${dataNote}
      <div class="insights-window-toggle">
        ${windows.map(w => `
          <button class="insights-toggle-btn ${w === _window ? 'is-active' : ''}" data-window="${w}">${w}d</button>
        `).join('')}
      </div>
    </div>`;

  html += renderMomentum(momentum);

  html += `<div class="insights-sub-label">HABITS</div>`;
  html += `<div class="insights-habits" id="insights-habits">`;
  html += renderHabitCards(ws.habitStats, streakData, habits.length);
  html += `</div>`;

  html += renderConsistency(consistency);
  if (attention.length > 0) html += renderAttention(attention);

  section.innerHTML = html;
  attachListeners(section, windowStats, streakData, habits);
  setupAnimations(section, score);
}

// ── Window stats ──────────────────────────────────────────────────────────────

function calcWindowStats(habits, logMap, startDate, today, daysSinceFirst) {
  let totalPossible = 0, totalDone = 0;
  const habitStats = [];

  for (const habit of habits) {
    let possible = 0, done = 0;
    let cursor = startDate;
    while (cursor <= today) {
      if (isDue(habit, cursor)) {
        possible++;
        if (logMap[cursor]?.[habit.id]?.completed) done++;
      }
      cursor = addDays(cursor, 1);
    }
    totalPossible += possible;
    totalDone     += done;
    habitStats.push({ habit, possible, done, pct: possible > 0 ? Math.round((done / possible) * 100) : 0 });
  }

  habitStats.sort((a, b) => b.pct - a.pct);
  return { pct: totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0, habitStats };
}

// ── Habit cards ───────────────────────────────────────────────────────────────

function renderHabitCards(habitStats, streakData, totalHabits) {
  const SHOW_DEFAULT = 8;
  const showAll = totalHabits <= SHOW_DEFAULT;
  let html = '';

  habitStats.forEach((hs, i) => {
    const isTop  = i === 0 && hs.pct > 0;
    const isLow  = i === habitStats.length - 1 && habitStats.length > 1 && hs.pct < habitStats[0].pct;
    const streak = streakData.current[hs.habit.id] ?? 0;
    const best   = streakData.best[hs.habit.id]    ?? 0;
    const hidden = !showAll && i >= SHOW_DEFAULT;
    const isOpen = _expanded === hs.habit.id;

    html += `
      <div class="insights-habit-row ${isTop ? 'is-top' : ''} ${isLow ? 'is-low' : ''} ${hidden ? 'is-hidden' : ''}"
        data-habit-id="${hs.habit.id}">
        <div class="insights-habit-row__main">
          <span class="insights-habit-row__icon"
            style="background:${hexToRgba(hs.habit.colour, 0.2)}">${hs.habit.icon}</span>
          <div class="insights-habit-row__info">
            <span class="insights-habit-row__name">${hs.habit.name}</span>
            <div class="insights-habit-row__bar-wrap">
              <div class="insights-habit-row__bar" style="width:${hs.pct}%;background:${hs.habit.colour}"></div>
            </div>
          </div>
          <div class="insights-habit-row__stats">
            <span class="insights-habit-row__pct">${hs.pct}%</span>
            ${streak > 0 ? `<span class="insights-habit-row__streak">🔥${streak}</span>` : ''}
          </div>
          <span class="insights-habit-row__chevron">${isOpen ? '⌃' : '⌄'}</span>
        </div>
        <div class="insights-habit-row__detail" style="display:${isOpen ? 'block' : 'none'}">
          ${renderHabitDetail(hs, streak, best)}
        </div>
      </div>`;
  });

  if (!showAll) {
    html += `<button class="insights-show-all-btn" id="insights-show-all">Show all ${totalHabits} habits</button>`;
  }

  return html;
}

function renderHabitDetail(hs, currentStreak, bestStreak) {
  const created   = new Date(hs.habit.createdAt);
  const daysSince = daysBetween(toDateString(created), toDateString()) + 1;

  return `
    <div class="insights-detail">
      <div class="insights-detail__row">
        <span class="insights-detail__label">Completion</span>
        <span class="insights-detail__val">${hs.pct}%</span>
      </div>
      <div class="insights-detail__row">
        <span class="insights-detail__label">Current streak</span>
        <span class="insights-detail__val">${currentStreak > 0 ? `🔥 ${currentStreak}` : '—'}</span>
      </div>
      <div class="insights-detail__row">
        <span class="insights-detail__label">Best streak</span>
        <span class="insights-detail__val">${bestStreak > 0 ? `🔥 ${bestStreak}` : '—'}</span>
      </div>
      <div class="insights-detail__row">
        <span class="insights-detail__label">Started</span>
        <span class="insights-detail__val">${daysSince} day${daysSince !== 1 ? 's' : ''} ago</span>
      </div>
    </div>`;
}

// ── Streaks summary ───────────────────────────────────────────────────────────

async function calcStreakData(habits) {
  const current = {}, best = {};
  for (const h of habits) {
    current[h.id] = await getCurrentStreak(h);
    best[h.id]    = await getBestStreak(h);
  }

  let topCurrentId = null, topCurrentVal = 0;
  let topBestId    = null, topBestVal    = 0;
  for (const h of habits) {
    if (current[h.id] > topCurrentVal) { topCurrentVal = current[h.id]; topCurrentId = h.id; }
    if (best[h.id]    > topBestVal)    { topBestVal    = best[h.id];    topBestId    = h.id; }
  }

  const totalStreakDays = Object.values(current).reduce((a, b) => a + b, 0);
  return { current, best, topCurrentId, topCurrentVal, topBestId, topBestVal, totalStreakDays, habits };
}

function renderStreaksSummary(sd) {
  const habits     = sd.habits;
  const topCurrent = habits.find(h => h.id === sd.topCurrentId);
  const topBest    = habits.find(h => h.id === sd.topBestId);
  if (!topCurrent && !topBest && !sd.totalStreakDays) return '';

  return `
    <div class="insights-sub-label">STREAKS</div>
    <div class="insights-block">
      ${topCurrent && sd.topCurrentVal > 0 ? `
        <div class="insights-stat-row">
          <span class="insights-stat-row__label">Longest current</span>
          <div class="insights-stat-row__val-stack">
            <span class="insights-stat-row__val">🔥 ${sd.topCurrentVal}</span>
            <span class="insights-stat-row__sub">${topCurrent.name}</span>
          </div>
        </div>` : ''}
      ${topBest && sd.topBestVal > 0 ? `
        <div class="insights-stat-row">
          <span class="insights-stat-row__label">Best ever</span>
          <div class="insights-stat-row__val-stack">
            <span class="insights-stat-row__val">🔥 ${sd.topBestVal}</span>
            <span class="insights-stat-row__sub">${topBest.name}</span>
          </div>
        </div>` : ''}
    </div>`;
}

// ── Perfect days ──────────────────────────────────────────────────────────────

function calcPerfectDays(habits, logMap, startDate, today) {
  let count = 0, cursor = startDate;
  while (cursor <= today) {
    if (isDayPerfect(habits, logMap, cursor)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function isDayPerfect(habits, logMap, date) {
  const due = habits.filter(h => isDue(h, date));
  if (due.length === 0) return false;
  return due.every(h => logMap[date]?.[h.id]?.completed);
}

function buildPerfectSparkline(habits, logMap, today) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = addDays(today, -(29 - i));
    return { date: d, perfect: isDayPerfect(habits, logMap, d) };
  });
}

function renderPerfectDays(count, sparkline) {
  const sparks = sparkline.map(s =>
    `<div class="insights-spark__day ${s.perfect ? 'is-perfect' : ''}" title="${s.date}"></div>`
  ).join('');

  const windowLabel = `${count} perfect day${count !== 1 ? 's' : ''} in the selected window`;

  return `
    <div class="insights-sub-label">PERFECT DAYS</div>
    <div class="insights-block">
      <p class="insights-chart__callout" style="margin-top:0">${windowLabel} — each square below is one day over the last 30 days (blue = all habits done)</p>
      <div class="insights-spark">${sparks}</div>
    </div>`;
}

// ── Momentum ──────────────────────────────────────────────────────────────────

function calcMomentum(habits, logMap, today) {
  const recent = calcWindowStats(habits, logMap, addDays(today, -6),  today,               7);
  const prev   = calcWindowStats(habits, logMap, addDays(today, -13), addDays(today, -7),  7);
  const diff   = recent.pct - prev.pct;
  const dir    = Math.abs(diff) < 5 ? 'steady' : diff > 0 ? 'up' : 'down';
  return { recent: recent.pct, prev: prev.pct, diff: Math.abs(diff), dir };
}

function renderMomentum(m) {
  const icons  = { up: '↑', down: '↓', steady: '→' };
  const colors = { up: 'var(--color-success)', down: 'rgba(239,68,68,0.8)', steady: '#f59e0b' };
  const labels = {
    up:     `Up ${m.diff}% vs last week`,
    down:   `Down ${m.diff}% vs last week`,
    steady: 'Steady — consistent with last week',
  };
  return `
    <div class="insights-momentum">
      <span class="insights-momentum__arrow" style="color:${colors[m.dir]}">${icons[m.dir]}</span>
      <span class="insights-momentum__label">${labels[m.dir]}</span>
    </div>`;
}

// ── Day of week chart ─────────────────────────────────────────────────────────

function calcDayOfWeek(habits, logMap, startDate, today) {
  const totals = Array(7).fill(0), possible = Array(7).fill(0);
  let cursor = startDate;
  while (cursor <= today) {
    const idx = (dateFromString(cursor).getDay() + 6) % 7; // Mon=0
    const due = habits.filter(h => isDue(h, cursor));
    if (due.length > 0) {
      possible[idx] += due.length;
      totals[idx]   += due.filter(h => logMap[cursor]?.[h.id]?.completed).length;
    }
    cursor = addDays(cursor, 1);
  }
  return DAY_LABELS.map((label, i) => ({
    label,
    pct: possible[i] > 0 ? Math.round((totals[i] / possible[i]) * 100) : null,
  }));
}

function renderDowChart(dowStats) {
  const valid = dowStats.filter(d => d.pct !== null);
  if (valid.length === 0) return '';

  const maxPct    = Math.max(...valid.map(d => d.pct));
  const minPct    = Math.min(...valid.map(d => d.pct));
  const strongest = valid.find(d => d.pct === maxPct);
  const weakest   = valid.find(d => d.pct === minPct);
  const barH = 72;

  const svgCols = dowStats.map((d, i) => {
    if (d.pct === null) {
      return `<g transform="translate(${i * 36 + 4},0)">
        <rect x="0" y="0" width="28" height="${barH}" rx="4" fill="rgba(255,255,255,0.04)"/>
        <text x="14" y="${barH + 15}" text-anchor="middle" class="insights-chart__label">${d.label[0]}</text>
      </g>`;
    }
    const h    = Math.max(4, Math.round((d.pct / 100) * barH));
    const isTop = d.pct === maxPct;
    return `<g transform="translate(${i * 36 + 4},0)" style="--bar-delay:${i * 55}ms">
      <rect x="0" y="${barH - h}" width="28" height="${h}" rx="4"
        fill="${isTop ? '#3b82f6' : 'rgba(59,130,246,0.45)'}" class="insights-bar"/>
      <text x="14" y="${barH - h - 5}" text-anchor="middle" class="insights-chart__pct">${d.pct}%</text>
      <text x="14" y="${barH + 15}" text-anchor="middle" class="insights-chart__label">${d.label[0]}</text>
    </g>`;
  }).join('');

  const totalW = 36 * 7 + 8;
  const svgH   = barH + 20;

  let callout = '';
  if (valid.length >= 3) {
    callout = maxPct - minPct < 15
      ? 'Your consistency is even across the week — no single weak day.'
      : `Your strongest day is ${strongest.label} (${maxPct}%). Your weakest is ${weakest.label} (${minPct}%).`;
  }

  return `
    <div class="insights-sub-label">BY DAY OF WEEK</div>
    <div class="insights-block">
      <svg class="insights-chart" viewBox="0 0 ${totalW} ${svgH}" width="100%">
        ${svgCols}
        <line x1="4" y1="${barH}" x2="${totalW - 4}" y2="${barH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </svg>
      ${callout ? `<p class="insights-chart__callout">${callout}</p>` : ''}
    </div>`;
}

// ── Consistency ───────────────────────────────────────────────────────────────

function calcConsistency(habits, logMap, startDate, today) {
  const dailyPcts = [];
  let cursor = startDate;
  while (cursor <= today) {
    const due = habits.filter(h => isDue(h, cursor));
    if (due.length > 0) {
      const done = due.filter(h => logMap[cursor]?.[h.id]?.completed).length;
      dailyPcts.push(done / due.length);
    }
    cursor = addDays(cursor, 1);
  }
  if (dailyPcts.length < 3) return { label: 'Insufficient data', desc: 'Log a few more days to see your consistency score.' };

  const mean    = dailyPcts.reduce((a, b) => a + b, 0) / dailyPcts.length;
  const stdDev  = Math.sqrt(dailyPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyPcts.length);

  if (stdDev < 0.1)  return { label: 'Excellent',    desc: 'Very even day-to-day — you\'re reliably consistent.' };
  if (stdDev < 0.2)  return { label: 'Good',         desc: 'Minor variation — mostly consistent with occasional dips.' };
  if (stdDev < 0.35) return { label: 'Variable',     desc: 'Some big swings between days — try to find a steadier rhythm.' };
  return                    { label: 'Inconsistent', desc: 'High variation day-to-day — consistency will compound your results.' };
}

function renderConsistency(c) {
  const colours = { Excellent: '#34d399', Good: '#60a5fa', Variable: '#f59e0b', Inconsistent: '#ef4444', 'Insufficient data': 'var(--color-text-muted)' };
  return `
    <div class="insights-sub-label">CONSISTENCY</div>
    <div class="insights-block">
      <div class="insights-consistency">
        <span class="insights-consistency__label" style="color:${colours[c.label] ?? 'inherit'}">${c.label}</span>
        <span class="insights-consistency__desc">${c.desc}</span>
      </div>
    </div>`;
}

// ── Needs attention ───────────────────────────────────────────────────────────

function calcAttention(habits, logMap, today) {
  const start30 = addDays(today, -29);
  const start7  = addDays(today, -6);
  const flagged = [];

  for (const habit of habits) {
    let done30 = 0, possible30 = 0, resets = 0, lastDone = null;
    let prevCompleted = false;
    let cursor = start30;

    while (cursor <= today) {
      if (isDue(habit, cursor)) {
        possible30++;
        const completed = !!logMap[cursor]?.[habit.id]?.completed;
        if (completed) { done30++; lastDone = cursor; }
        if (!completed && prevCompleted) resets++;
        prevCompleted = completed;
      }
      cursor = addDays(cursor, 1);
    }

    const notIn7 = !lastDone || lastDone < start7;
    if (notIn7 && possible30 > 0) {
      flagged.push({ habit, reason: 'Not logged in 7 days — is this habit still relevant?' });
    } else if (possible30 >= 7 && done30 / possible30 < 0.6) {
      flagged.push({ habit, reason: `Logged only ${done30} time${done30 !== 1 ? 's' : ''} in the last 30 days` });
    } else if (resets >= 3) {
      flagged.push({ habit, reason: `Streak has reset ${resets} times this month` });
    }
  }
  return flagged;
}

function renderAttention(items) {
  const rows = items.map(({ habit, reason }) => `
    <div class="insights-attention-row">
      <span class="insights-attention-row__icon" style="background:${hexToRgba(habit.colour, 0.18)}">${habit.icon}</span>
      <div class="insights-attention-row__body">
        <span class="insights-attention-row__name">${habit.name}</span>
        <span class="insights-attention-row__reason">${reason}</span>
      </div>
      <button class="insights-attention-row__edit" data-habit-id="${habit.id}">Edit</button>
    </div>`).join('');

  return `
    <div class="insights-sub-label">NEEDS ATTENTION</div>
    <div class="insights-block">${rows}</div>`;
}

// ── Highlights ────────────────────────────────────────────────────────────────

async function calcHighlights(habits, logMap, today, streakData) {
  const highlights = [];
  const todayName  = DAY_NAMES[new Date().getDay()];
  const due        = habits.filter(h => h.type === 'daily' || (h.type === 'setDays' && h.days.includes(todayName)));
  const allDone    = due.length > 0 && due.every(h => logMap[today]?.[h.id]?.completed);
  if (allDone) highlights.push({ text: 'All habits logged today ✓', icon: '✅' });

  for (const h of habits) {
    const s = streakData.current[h.id] ?? 0;
    if ([7, 14, 21, 30, 60, 100].includes(s)) {
      highlights.push({ text: `${s} day streak on ${h.name} 🔥`, icon: h.icon });
    }
  }

  const lastMonday = addDays(mondayOf(today), -7);
  const lastSunday = addDays(lastMonday, 6);
  if (lastSunday <= today) {
    let perfectWeek = true;
    let cursor = lastMonday;
    while (cursor <= lastSunday) {
      const due2 = habits.filter(h => isDue(h, cursor));
      if (due2.length > 0 && !due2.every(h => logMap[cursor]?.[h.id]?.completed)) { perfectWeek = false; break; }
      cursor = addDays(cursor, 1);
    }
    if (perfectWeek) highlights.push({ text: 'Perfect week last week ✓', icon: '⭐' });
  }

  return highlights.slice(0, 6);
}

function renderHighlights(items) {
  const cards = items.map(h => `
    <div class="insights-highlight-card">
      <span class="insights-highlight-card__icon">${h.icon}</span>
      <span class="insights-highlight-card__text">${h.text}</span>
    </div>`).join('');

  return `
    <div class="insights-sub-label">HIGHLIGHTS</div>
    <div class="insights-highlights">${cards}</div>`;
}

// ── Animations ────────────────────────────────────────────────────────────────

function setupAnimations(section, score) {
  if (_observer) _observer.disconnect();
  const scoreBlock = section.querySelector('#insights-score-block');
  if (!scoreBlock) return;

  _observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    if (!_ringAnimDone) { animateRing(); animateCountUp(score); _ringAnimDone = true; }
    if (!_barAnimDone)  {
      section.querySelectorAll('.insights-bar').forEach(bar => bar.classList.add('anim-bar-grow'));
      _barAnimDone = true;
    }
  }, { threshold: 0.3 });

  _observer.observe(scoreBlock);
}

function animateRing() {
  const fill = document.getElementById('ring-fill');
  if (!fill) return;
  const circumference = 2 * Math.PI * 52;
  const targetDash    = parseFloat(fill.dataset.dash);
  requestAnimationFrame(() => {
    fill.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)';
    fill.style.strokeDashoffset = String(circumference - targetDash);
  });
}

function animateCountUp(target) {
  const el = document.getElementById('insights-score-num');
  if (!el) return;
  const dur = 900, start = performance.now();
  function step(now) {
    const t    = Math.min(1, (now - start) / dur);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(ease * target) + '%';
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function attachListeners(section, windowStats, streakData, habits) {
  section.querySelectorAll('.insights-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _window = parseInt(btn.dataset.window);
      _ringAnimDone = false;
      _barAnimDone  = false;
      render();
    });
  });

  section.querySelectorAll('.insights-habit-row__main').forEach(main => {
    main.addEventListener('click', () => {
      const id  = parseInt(main.closest('.insights-habit-row').dataset.habitId);
      _expanded = _expanded === id ? null : id;
      render();
    });
  });

  section.querySelectorAll('.insights-attention-row__edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const habit = habits.find(h => h.id === parseInt(btn.dataset.habitId));
      if (habit) openHabitModal(habit);
    });
  });

  section.querySelector('#insights-show-all')?.addEventListener('click', () => {
    section.querySelectorAll('.insights-habit-row.is-hidden').forEach(r => r.classList.remove('is-hidden'));
    section.querySelector('#insights-show-all')?.remove();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreMessage(pct) {
  if (pct >= 90) return 'Outstanding. You\'re building something real.';
  if (pct >= 75) return 'Strong consistency. A few gaps to close.';
  if (pct >= 60) return 'Good foundation. Room to push further.';
  if (pct >= 40) return 'Inconsistent. Pick your most important habits and focus there.';
  return 'Struggling for consistency. Start with one habit and build from it.';
}

function isDue(habit, dateStr) {
  const dayName = DAY_NAMES[dateFromString(dateStr).getDay()];
  const created = toDateString(new Date(habit.createdAt));
  if (created > dateStr) return false;
  if (habit.type === 'daily') return true;
  if (habit.type === 'setDays') return habit.days.includes(dayName);
  return false;
}

function dateFromString(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = dateFromString(dateStr);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

function daysBetween(a, b) {
  return Math.round((dateFromString(b) - dateFromString(a)) / 86400000);
}

function mondayOf(dateStr) {
  const d = dateFromString(dateStr);
  d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
  return toDateString(d);
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function getEarliestLogDate() {
  const today = toDateString();
  const start = addDays(today, -365);
  const logs  = await getLogsForDateRange(start, today);
  if (!logs.length) return null;
  return logs.map(l => l.date).sort()[0];
}
