import { AppState, CellState } from '@/types';

const STORAGE_KEY = 'habit-tracker-v1';

export function loadState(): AppState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw) as AppState;
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Get Monday of the week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

export function getWeekDates(weekKey: string): Date[] {
  const [year, month, day] = weekKey.split('-').map(Number);
  const monday = new Date(year, month - 1, day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function addWeeks(weekKey: string, delta: number): string {
  const [year, month, day] = weekKey.split('-').map(Number);
  const d = new Date(year, month - 1, day + delta * 7);
  return getWeekKey(d);
}

export function formatWeekLabel(weekKey: string): string {
  const dates = getWeekDates(weekKey);
  const start = dates[0];
  const end = dates[6];
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${months[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
}

export function nextCellState(current: CellState): CellState {
  if (current === 'empty') return 'planned';
  if (current === 'planned') return 'done';
  return 'empty';
}

function defaultState(): AppState {
  return {
    habits: [
      { id: 'g-sabah', type: 'group', name: 'Sabah Rutini', color: '#6366f1', groupId: null, order: 0 },
      { id: 'h-egzersiz', type: 'habit', name: 'Egzersiz', color: '#818cf8', groupId: 'g-sabah', order: 1 },
      { id: 'h-meditasyon', type: 'habit', name: 'Meditasyon', color: '#818cf8', groupId: 'g-sabah', order: 2 },
      { id: 'g-vitamin', type: 'group', name: 'Vitaminler', color: '#14b8a6', groupId: null, order: 3 },
      { id: 'h-d-vit', type: 'habit', name: 'D Vitamini', color: '#5eead4', groupId: 'g-vitamin', order: 4 },
      { id: 'h-omega', type: 'habit', name: 'Omega-3', color: '#5eead4', groupId: 'g-vitamin', order: 5 },
      { id: 'h-yuruyus', type: 'habit', name: 'Yürüyüş', color: '#22c55e', groupId: null, order: 6 },
      { id: 'h-kitap', type: 'habit', name: 'Kitap Okuma', color: '#f97316', groupId: null, order: 7 },
    ],
    collapsedGroups: [],
    weeklyData: {},
  };
}
