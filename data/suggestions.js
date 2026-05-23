/* suggestions.js — Onboarding habit suggestions with defaults per category */

export const SUGGESTIONS = [
  {
    name: 'Drink 3L water',
    icon: '💧',
    category: 'nutrition',
    type: 'daily',
    format: 'numeric',
    target: 3,
    unit: 'L',
    colour: '#38bdf8',
  },
  {
    name: '10,000 steps',
    icon: '👟',
    category: 'fitness',
    type: 'daily',
    format: 'numeric',
    target: 10000,
    unit: 'steps',
    colour: '#34d399',
  },
  {
    name: '8 hours sleep',
    icon: '😴',
    category: 'recovery',
    type: 'daily',
    format: 'numeric',
    target: 8,
    unit: 'hrs',
    colour: '#818cf8',
  },
  {
    name: 'Morning workout',
    icon: '🏋️',
    category: 'fitness',
    type: 'daily',
    format: 'yesNo',
    target: null,
    unit: '',
    colour: '#f97316',
  },
  {
    name: 'Read 20 mins',
    icon: '📚',
    category: 'learning',
    type: 'daily',
    format: 'numeric',
    target: 20,
    unit: 'mins',
    colour: '#a78bfa',
  },
  {
    name: 'No alcohol',
    icon: '🚫',
    category: 'nutrition',
    type: 'daily',
    format: 'yesNo',
    target: null,
    unit: '',
    colour: '#fb7185',
  },
  {
    name: 'Take supplements',
    icon: '💊',
    category: 'nutrition',
    type: 'daily',
    format: 'yesNo',
    target: null,
    unit: '',
    colour: '#4ade80',
  },
  {
    name: 'Meditate 10 mins',
    icon: '🧘',
    category: 'mindset',
    type: 'daily',
    format: 'numeric',
    target: 10,
    unit: 'mins',
    colour: '#2dd4bf',
  },
];

export const CATEGORIES = [
  { id: 'fitness',  label: 'Fitness',   emoji: '🏃' },
  { id: 'mindset',  label: 'Mindset',   emoji: '🧠' },
  { id: 'nutrition',label: 'Nutrition', emoji: '🥗' },
  { id: 'recovery', label: 'Recovery',  emoji: '💤' },
  { id: 'finance',  label: 'Finance',   emoji: '💰' },
  { id: 'learning', label: 'Learning',  emoji: '📚' },
  { id: 'energy',   label: 'Energy',    emoji: '⚡' },
  { id: 'custom',   label: 'Custom',    emoji: '➕' },
];

export const HABIT_COLOURS = [
  '#3b82f6', // electric blue
  '#38bdf8', // sky blue
  '#34d399', // mint green
  '#4ade80', // green
  '#a78bfa', // purple
  '#818cf8', // indigo
  '#2dd4bf', // teal
  '#f97316', // orange
  '#fb7185', // rose
  '#f59e0b', // amber
  '#facc15', // yellow
  '#e879f9', // fuchsia
];
