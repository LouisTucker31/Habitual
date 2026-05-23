/* celebrations.js — Milestone overlays, perfect day banner, comeback badge, weekly review. */

import { getAll } from './habits.js';
import { getWeeklyReviewData, getComeback } from './streaks.js';
import { hexToRgba } from './modals/habitModal.js';

// ── Milestone overlay ──────────────────────────────────────────────────────────

const MILESTONE_MESSAGES = {
  3:   { title: '3-day streak!',     sub: 'You\'re building something real.' },
  7:   { title: 'One week!',         sub: 'A full week — that\'s a proper habit.' },
  14:  { title: 'Two weeks!',        sub: 'Two weeks strong. Keep the fire burning.' },
  21:  { title: '21 days!',          sub: 'Science says this is when it sticks.' },
  30:  { title: '30-day streak!',    sub: 'A whole month. Incredible consistency.' },
  60:  { title: '60 days!',          sub: 'Two months. You\'re unstoppable.' },
  100: { title: '100 days!',         sub: 'Triple digits. Legendary territory.' },
  365: { title: 'One full year! 🏆', sub: 'An entire year. You\'ve changed your life.' },
};

export function showMilestone(milestone, habit) {
  const existing = document.getElementById('milestone-overlay');
  if (existing) existing.remove();

  const msg    = MILESTONE_MESSAGES[milestone] ?? { title: `${milestone}-day streak!`, sub: 'Keep going!' };
  const colour = habit?.colour ?? '#34d399';
  const glow   = hexToRgba(colour, 0.25);
  const glow2  = hexToRgba(colour, 0.08);

  const overlay = document.createElement('div');
  overlay.id = 'milestone-overlay';
  overlay.className = 'milestone-overlay anim-celebration-in';
  overlay.style.cssText = `background: radial-gradient(ellipse at 50% 40%, ${glow} 0%, ${glow2} 40%, transparent 70%), rgba(8,13,26,0.96);`;

  overlay.innerHTML = `
    <div class="milestone-inner">
      <div class="milestone-flame anim-flame-pulse" style="color:${colour}">🔥</div>
      <div class="milestone-number anim-celebration-pop" style="color:${colour}">${milestone}</div>
      <div class="milestone-title">${msg.title}</div>
      <div class="milestone-sub">${msg.sub}</div>
      ${habit ? `<div class="milestone-habit-name">${habit.icon} ${habit.name}</div>` : ''}
      <div class="milestone-dismiss">Tap anywhere to continue</div>
    </div>
  `;

  document.body.appendChild(overlay);
  launchConfetti(colour);

  overlay.addEventListener('click', () => dismissMilestone(overlay));
  setTimeout(() => dismissMilestone(overlay), 8000);
}

function dismissMilestone(overlay) {
  if (!overlay.isConnected) return;
  overlay.style.transition = 'opacity 0.4s ease';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 400);
}

// ── CSS confetti ───────────────────────────────────────────────────────────────

function launchConfetti(habitColour) {
  const colours = [habitColour, '#ffffff', '#fbbf24', '#34d399', '#60a5fa'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    el.style.cssText = `
      left:${Math.random() * 100}vw;
      top:-10px;
      background:${colours[Math.floor(Math.random() * colours.length)]};
      width:${4 + Math.random() * 8}px;
      height:${4 + Math.random() * 8}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      animation-delay:${Math.random() * 0.8}s;
      animation-duration:${1.4 + Math.random() * 1.2}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

// ── Perfect day banner ─────────────────────────────────────────────────────────

let _perfectBannerTimer = null;

export function showPerfectDayBanner() {
  if (document.getElementById('perfect-day-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'perfect-day-banner';
  banner.className = 'perfect-day-banner anim-banner-in';
  banner.innerHTML = `<span>🔥 Perfect day! All habits done</span>`;
  document.body.appendChild(banner);

  clearTimeout(_perfectBannerTimer);
  _perfectBannerTimer = setTimeout(() => {
    banner.style.transition = 'opacity 0.5s ease';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 500);
  }, 3000);
}

// ── Comeback badge ─────────────────────────────────────────────────────────────

export async function checkAndShowComeback(habit) {
  const isComeback = await getComeback(habit);
  if (!isComeback) return;

  const card = document.querySelector(`#habits-list .habit-card[data-id="${habit.id}"]`);
  if (!card || card.querySelector('.comeback-badge')) return;

  const badge = document.createElement('span');
  badge.className = 'comeback-badge';
  badge.textContent = 'Comeback';
  card.querySelector('.habit-card__meta')?.appendChild(badge);
}

// ── Weekly review card ─────────────────────────────────────────────────────────

export async function maybeShowWeeklyReview() {
  const now = new Date();
  if (now.getDay() !== 0 || now.getHours() < 17) return;
  if (document.getElementById('weekly-review-card')) return;

  const data = await getWeeklyReviewData();

  const card = document.createElement('div');
  card.id = 'weekly-review-card';
  card.className = 'weekly-review-card';
  card.innerHTML = `
    <div class="weekly-review-card__header">
      <span class="weekly-review-card__title">Weekly review</span>
      <button class="weekly-review-card__close" aria-label="Dismiss">✕</button>
    </div>
    <div class="weekly-review-card__pct ${data.strong ? 'is-strong' : ''}">${data.percentage}%</div>
    <div class="weekly-review-card__label">completion this week</div>
    <div class="weekly-review-card__row">
      ${data.bestStreakHabit ? `
        <div class="weekly-review-card__stat">
          <span class="weekly-review-card__stat-value">🔥 ${data.bestStreak}</span>
          <span class="weekly-review-card__stat-label">${data.bestStreakHabit.name}</span>
        </div>` : ''}
      ${data.bestRateHabit && data.bestRate > 0 ? `
        <div class="weekly-review-card__stat">
          <span class="weekly-review-card__stat-value">⭐ ${data.bestRate}%</span>
          <span class="weekly-review-card__stat-label">${data.bestRateHabit.name}</span>
        </div>` : ''}
    </div>
    <div class="weekly-review-card__message">${weeklyMessage(data.percentage)}</div>
  `;

  card.querySelector('.weekly-review-card__close').addEventListener('click', () => card.remove());

  const section = document.getElementById('section-today');
  if (section) {
    const title = section.querySelector('.section-title');
    if (title) title.after(card);
    else section.prepend(card);
  }
}

function weeklyMessage(pct) {
  if (pct === 100) return 'Flawless week. Absolutely elite.';
  if (pct >= 80)   return 'Strong week. You\'re building real momentum.';
  if (pct >= 60)   return 'Good week. A few more and you\'ll be unstoppable.';
  if (pct >= 40)   return 'Room to grow — this week is a fresh start.';
  return 'Every streak starts with one day. Keep going.';
}

export function initialise() {}
