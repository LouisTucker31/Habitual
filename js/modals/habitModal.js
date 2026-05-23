/* habitModal.js — Add/edit habit modal. All fields, validation, save, delete. */

import { add, update, remove } from '../habits.js';
import { CATEGORIES, HABIT_COLOURS } from '../../data/suggestions.js';

const EMOJIS = [
  '🎯','💧','👟','😴','🏋️','📚','🧘','💊','🥗','🍎','🥦','🧃',
  '🏃','🚴','🏊','⚽','🎾','🏀','🤸','🧗','🥊','🏌️','🎿','🚣',
  '🧠','📖','✍️','🎨','🎵','🎸','🎹','🎭','🎬','📝','💡','🔬',
  '💰','💳','📈','🏦','💼','🤝','📊','🎓','🏆','⭐','🌟','✨',
  '🌱','🌿','🍃','🌸','🌺','🌻','🌙','☀️','⚡','🔥','❄️','💎',
  '⏰','🎵','🚿','🛁','☕','🍵','🥛','🫀','🫁','💪','🦷','👁️',
];

let _editingHabit = null;
let _onSave = null;

// ── State ─────────────────────────────────────────────────────────────────────

let _state = {};

function defaultState() {
  return {
    name: '',
    category: 'fitness',
    customCategory: '',
    type: 'daily',
    days: [],
    format: 'yesNo',
    target: '',
    unit: '',
    icon: '🎯',
    colour: HABIT_COLOURS[0],
    reminderEnabled: false,
    reminderTime: '09:00',
  };
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

let _backdrop, _sheet, _form;

// ── Open / close ──────────────────────────────────────────────────────────────

export function open(habitToEdit = null, onSave = null) {
  _editingHabit = habitToEdit;
  _onSave = onSave;
  _state = habitToEdit ? habitToState(habitToEdit) : defaultState();

  if (!_backdrop) buildDOM();
  else syncToDOM();

  _backdrop.classList.add('is-open');
  if (_sheet) _sheet.scrollTop = 0;
  setTimeout(() => {
    const nameInput = _form.querySelector('#hm-name');
    if (nameInput) nameInput.focus();
  }, 350);
}

export function close() {
  if (!_backdrop) return;
  _backdrop.classList.remove('is-open');
}

function habitToState(h) {
  return {
    name: h.name,
    category: h.category,
    customCategory: CATEGORIES.find(c => c.id === h.category) ? '' : h.category,
    type: h.type,
    days: [...(h.days ?? [])],
    format: h.format,
    target: h.target ?? '',
    unit: h.unit ?? '',
    icon: h.icon,
    colour: h.colour,
    reminderEnabled: h.reminder?.enabled ?? false,
    reminderTime: h.reminder?.time ?? '09:00',
  };
}

// ── Build DOM (once) ──────────────────────────────────────────────────────────

function buildDOM() {
  _backdrop = document.createElement('div');
  _backdrop.className = 'modal-backdrop';
  _backdrop.innerHTML = `
    <div class="modal-sheet" id="habit-modal-sheet">
      <div class="modal-drag-handle"></div>
      <div class="modal-header">
        <span class="modal-title" id="hm-title">New Habit</span>
        <button class="modal-close" id="hm-close" aria-label="Close">✕</button>
      </div>
      <form id="hm-form" novalidate>

        <div class="form-group">
          <label class="form-label" for="hm-name">Habit name</label>
          <input class="form-input" id="hm-name" type="text" maxlength="40"
            placeholder="e.g. Drink 3L water" autocomplete="off" />
          <span class="form-error" id="hm-name-error"></span>
        </div>

        <div class="form-group">
          <label class="form-label">Category</label>
          <div class="pill-scroll" id="hm-categories"></div>
          <input class="form-input" id="hm-custom-category" type="text"
            placeholder="Category name" maxlength="24" style="display:none;margin-top:8px"/>
        </div>

        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="segmented" id="hm-type">
            <div class="segmented__option is-active" data-value="daily">Daily</div>
            <div class="segmented__option" data-value="setDays">Set Days</div>
          </div>
          <div class="day-picker" id="hm-days" style="display:none"></div>
          <span class="form-error" id="hm-days-error"></span>
        </div>

        <div class="form-group">
          <label class="form-label">Format</label>
          <div class="segmented" id="hm-format">
            <div class="segmented__option is-active" data-value="yesNo">Yes / No</div>
            <div class="segmented__option" data-value="numeric">Numeric</div>
          </div>
          <div class="numeric-fields" id="hm-numeric" style="display:none">
            <input class="form-input" id="hm-target" type="number" min="0.01"
              placeholder="3" style="flex:1"/>
            <input class="form-input" id="hm-unit" type="text" maxlength="10"
              placeholder="L" style="flex:1"/>
          </div>
          <span class="form-error" id="hm-target-error"></span>
        </div>

        <div class="form-group">
          <label class="form-label">Icon</label>
          <button type="button" class="icon-preview-btn" id="hm-icon-btn"></button>
          <div class="emoji-grid" id="hm-emoji-grid" style="display:none"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Colour</label>
          <div class="colour-row" id="hm-colours"></div>
        </div>

        <div class="form-group">
          <div class="reminder-row">
            <div>
              <div class="form-label">Reminder</div>
              <div class="form-sublabel">Daily notification</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="hm-reminder-toggle"/>
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
            </label>
          </div>
          <div id="hm-reminder-time" style="display:none;margin-top:8px">
            <input class="form-input" type="time" id="hm-time" />
          </div>
        </div>

      </form>

      <div class="modal-footer">
        <button class="btn btn--primary" id="hm-save">Add Habit</button>
        <button class="btn btn--danger-full" id="hm-delete" style="display:none">
          Delete habit
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(_backdrop);
  _form = document.getElementById('hm-form');

  buildCategories();
  buildDayPicker();
  buildEmojiGrid();
  buildColours();
  syncToDOM();
  attachListeners();
}

// ── Sync state → DOM ──────────────────────────────────────────────────────────

function syncToDOM() {
  document.getElementById('hm-title').textContent =
    _editingHabit ? 'Edit Habit' : 'New Habit';
  document.getElementById('hm-save').textContent =
    _editingHabit ? 'Save Changes' : 'Add Habit';
  document.getElementById('hm-delete').style.display =
    _editingHabit ? 'block' : 'none';

  document.getElementById('hm-name').value = _state.name;

  // Category
  _backdrop.querySelectorAll('#hm-categories .pill-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.value === _state.category);
  });
  const isCustom = !CATEGORIES.find(c => c.id === _state.category);
  const customInput = document.getElementById('hm-custom-category');
  customInput.style.display = isCustom ? 'block' : 'none';
  if (isCustom) customInput.value = _state.customCategory;

  // Type
  _backdrop.querySelectorAll('#hm-type .segmented__option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.value === _state.type);
  });
  document.getElementById('hm-days').style.display =
    _state.type === 'setDays' ? 'flex' : 'none';
  _backdrop.querySelectorAll('#hm-days .day-btn').forEach(btn => {
    btn.classList.toggle('is-active', _state.days.includes(btn.dataset.value));
  });

  // Format
  _backdrop.querySelectorAll('#hm-format .segmented__option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.value === _state.format);
  });
  document.getElementById('hm-numeric').style.display =
    _state.format === 'numeric' ? 'flex' : 'none';
  document.getElementById('hm-target').value = _state.target;
  document.getElementById('hm-unit').value   = _state.unit;

  // Icon
  updateIconPreview();

  // Colours
  _backdrop.querySelectorAll('.colour-swatch').forEach(s => {
    s.classList.toggle('is-selected', s.dataset.colour === _state.colour);
  });

  // Reminder
  document.getElementById('hm-reminder-toggle').checked = _state.reminderEnabled;
  document.getElementById('hm-reminder-time').style.display =
    _state.reminderEnabled ? 'block' : 'none';
  document.getElementById('hm-time').value = _state.reminderTime;

  updateSaveBtn();
}

function updateIconPreview() {
  const btn = document.getElementById('hm-icon-btn');
  if (!btn) return;
  btn.textContent = _state.icon;
  btn.style.background = hexToRgba(_state.colour, 0.2);
}

function updateSaveBtn() {
  const btn = document.getElementById('hm-save');
  if (!btn) return;
  const empty = !_state.name.trim();
  btn.disabled = empty;
  btn.style.opacity = empty ? '0.45' : '1';
}

// ── Build sub-components ──────────────────────────────────────────────────────

function buildCategories() {
  const container = document.getElementById('hm-categories');
  container.innerHTML = CATEGORIES.map(c => `
    <button type="button" class="pill-btn" data-value="${c.id}">
      ${c.emoji} ${c.label}
    </button>
  `).join('');
}

function buildDayPicker() {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const container = document.getElementById('hm-days');
  container.innerHTML = days.map(d => `
    <button type="button" class="day-btn" data-value="${d}">${d}</button>
  `).join('');
}

function buildEmojiGrid() {
  const grid = document.getElementById('hm-emoji-grid');
  grid.innerHTML = EMOJIS.map(e => `
    <button type="button" class="emoji-cell" data-emoji="${e}">${e}</button>
  `).join('');
}

function buildColours() {
  const row = document.getElementById('hm-colours');
  row.innerHTML = HABIT_COLOURS.map(c => `
    <button type="button" class="colour-swatch" data-colour="${c}"
      style="background:${c}" aria-label="${c}">
      <span class="colour-tick">✓</span>
    </button>
  `).join('');
}

// ── Listeners ─────────────────────────────────────────────────────────────────

function attachListeners() {
  // Close / backdrop
  document.getElementById('hm-close').addEventListener('click', tryClose);
  _backdrop.addEventListener('click', e => {
    if (e.target === _backdrop) tryClose();
  });

  // Drag to dismiss
  setupDragDismiss();

  // Name
  document.getElementById('hm-name').addEventListener('input', e => {
    _state.name = e.target.value;
    updateSaveBtn();
    clearError('hm-name-error');
  });

  // Categories
  document.getElementById('hm-categories').addEventListener('click', e => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    _state.category = btn.dataset.value;
    const isCustom = btn.dataset.value === 'custom';
    document.getElementById('hm-custom-category').style.display =
      isCustom ? 'block' : 'none';
    _backdrop.querySelectorAll('.pill-btn').forEach(b =>
      b.classList.toggle('is-active', b === btn));
  });

  document.getElementById('hm-custom-category').addEventListener('input', e => {
    _state.customCategory = e.target.value;
  });

  // Type segmented
  document.getElementById('hm-type').addEventListener('click', e => {
    const opt = e.target.closest('.segmented__option');
    if (!opt) return;
    _state.type = opt.dataset.value;
    _backdrop.querySelectorAll('#hm-type .segmented__option').forEach(o =>
      o.classList.toggle('is-active', o === opt));
    document.getElementById('hm-days').style.display =
      _state.type === 'setDays' ? 'flex' : 'none';
    clearError('hm-days-error');
  });

  // Day picker
  document.getElementById('hm-days').addEventListener('click', e => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    const day = btn.dataset.value;
    if (_state.days.includes(day)) {
      _state.days = _state.days.filter(d => d !== day);
    } else {
      _state.days.push(day);
    }
    btn.classList.toggle('is-active', _state.days.includes(day));
    clearError('hm-days-error');
  });

  // Format segmented
  document.getElementById('hm-format').addEventListener('click', e => {
    const opt = e.target.closest('.segmented__option');
    if (!opt) return;
    _state.format = opt.dataset.value;
    _backdrop.querySelectorAll('#hm-format .segmented__option').forEach(o =>
      o.classList.toggle('is-active', o === opt));
    document.getElementById('hm-numeric').style.display =
      _state.format === 'numeric' ? 'flex' : 'none';
    clearError('hm-target-error');
  });

  document.getElementById('hm-target').addEventListener('input', e => {
    _state.target = e.target.value;
    clearError('hm-target-error');
  });
  document.getElementById('hm-unit').addEventListener('input', e => {
    _state.unit = e.target.value;
  });

  // Icon button
  document.getElementById('hm-icon-btn').addEventListener('click', () => {
    const grid = document.getElementById('hm-emoji-grid');
    grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
  });

  // Emoji grid
  document.getElementById('hm-emoji-grid').addEventListener('click', e => {
    const cell = e.target.closest('.emoji-cell');
    if (!cell) return;
    _state.icon = cell.dataset.emoji;
    document.getElementById('hm-emoji-grid').style.display = 'none';
    updateIconPreview();
  });

  // Colours
  document.getElementById('hm-colours').addEventListener('click', e => {
    const swatch = e.target.closest('.colour-swatch');
    if (!swatch) return;
    _state.colour = swatch.dataset.colour;
    _backdrop.querySelectorAll('.colour-swatch').forEach(s =>
      s.classList.toggle('is-selected', s === swatch));
    updateIconPreview();
  });

  // Reminder
  document.getElementById('hm-reminder-toggle').addEventListener('change', e => {
    _state.reminderEnabled = e.target.checked;
    document.getElementById('hm-reminder-time').style.display =
      _state.reminderEnabled ? 'block' : 'none';
  });
  document.getElementById('hm-time').addEventListener('change', e => {
    _state.reminderTime = e.target.value;
  });

  // Save
  document.getElementById('hm-save').addEventListener('click', handleSave);

  // Delete
  document.getElementById('hm-delete').addEventListener('click', handleDelete);

  // Discard bar
}

// ── Drag-to-dismiss ───────────────────────────────────────────────────────────
// Listens on the whole sheet. When content is scrolled to top and user drags
// down, we take over: lock scroll, move the sheet. Content and sheet move
// together as one rigid piece — no independent bounce.

function setupDragDismiss() {
  const sheet = document.getElementById('habit-modal-sheet');

  let startY = 0, deltaY = 0;
  let dragging = false, dismissing = false;

  const onStart = e => {
    startY    = e.touches ? e.touches[0].clientY : e.clientY;
    deltaY    = 0;
    dragging  = true;
    dismissing = false;
  };

  const onMove = e => {
    if (!dragging) return;
    const y  = e.touches ? e.touches[0].clientY : e.clientY;
    deltaY   = y - startY;

    const atTop = sheet.scrollTop <= 0;

    if (!dismissing) {
      // Only enter dismiss mode when dragging down from top
      if (atTop && deltaY > 0) {
        dismissing = true;
        // Freeze the sheet's own scroll so content doesn't move independently
        sheet.style.overflow = 'hidden';
      } else {
        return; // not at top or dragging up — let normal scroll handle it
      }
    }

    // Move the whole sheet — content is locked so they move as one
    e.preventDefault();
    const resistance = deltaY > 0 ? 1 : 0.3;
    sheet.style.transition = 'none';
    sheet.style.transform  = `translateY(${Math.max(0, deltaY * resistance)}px)`;
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;

    // Restore scroll
    sheet.style.overflow   = '';
    sheet.style.transition = '';

    if (dismissing && deltaY > 100) {
      tryClose();
    } else {
      sheet.style.transform = '';
    }

    dismissing = false;
    deltaY = 0;
  };

  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove',  onMove,  { passive: false });
  sheet.addEventListener('touchend',   onEnd);
  sheet.addEventListener('mousedown',  onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onEnd);
}

// ── Save / delete ─────────────────────────────────────────────────────────────

async function handleSave() {
  if (!validate()) return;

  const category = _state.category === 'custom' && _state.customCategory.trim()
    ? _state.customCategory.trim()
    : _state.category;

  const habitData = {
    name:     _state.name.trim(),
    category,
    type:     _state.type,
    days:     _state.days,
    format:   _state.format,
    target:   _state.format === 'numeric' ? parseFloat(_state.target) : null,
    unit:     _state.format === 'numeric' ? _state.unit.trim() : '',
    icon:     _state.icon,
    colour:   _state.colour,
    reminder: { enabled: _state.reminderEnabled, time: _state.reminderTime },
  };

  if (_editingHabit) {
    await update(_editingHabit.id, habitData);
  } else {
    await add(habitData);
  }

  if (_onSave) _onSave();
  close();
}

async function handleDelete() {
  if (!_editingHabit) return;
  const confirmed = window.confirm(
    `Delete "${_editingHabit.name}"? This will remove all its history.`
  );
  if (!confirmed) return;
  await remove(_editingHabit.id);
  close();
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate() {
  let ok = true;

  if (!_state.name.trim()) {
    showError('hm-name-error', 'Please enter a habit name');
    shake(document.getElementById('hm-name'));
    ok = false;
  }

  if (_state.type === 'setDays' && _state.days.length === 0) {
    showError('hm-days-error', 'Pick at least one day');
    ok = false;
  }

  if (_state.format === 'numeric' && !(parseFloat(_state.target) > 0)) {
    showError('hm-target-error', 'Enter a target greater than 0');
    shake(document.getElementById('hm-target'));
    ok = false;
  }

  return ok;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function shake(el) {
  if (!el) return;
  el.classList.remove('anim-shake');
  void el.offsetWidth;
  el.classList.add('anim-shake');
  el.addEventListener('animationend', () => el.classList.remove('anim-shake'), { once: true });
}

// ── Has unsaved changes ───────────────────────────────────────────────────────

function isDirty() {
  const clean = _editingHabit ? habitToState(_editingHabit) : defaultState();
  return JSON.stringify(_state) !== JSON.stringify(clean);
}

function tryClose() {
  if (isDirty() && !window.confirm('Discard changes?')) return;
  close();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function initialise() {}
