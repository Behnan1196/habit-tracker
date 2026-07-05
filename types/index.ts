export type CellState = string;

export type HabitType = 'group' | 'habit' | 'metric';

export interface HabitItem {
  id: string;
  type: HabitType;
  name: string;
  color: string;
  backColor?: string;
  groupId: string | null; // null = top level
  order: number;
  notes?: string;
  isFixed?: boolean; // true = persistent across weeks (todo-style)
}

export interface WeeklyData {
  // weekKey -> habitId -> dayIndex (0=Mon..6=Sun) -> state
  [weekKey: string]: {
    [habitId: string]: {
      [dayIndex: number]: CellState;
    };
  };
}

export interface AppState {
  habits: HabitItem[];
  collapsedGroups: string[]; // group ids that are collapsed
  weeklyData: WeeklyData;
}

export const PRESET_COLORS = [
  { label: 'İndigo',   value: '#6366f1' },
  { label: 'Mor',      value: '#a855f7' },
  { label: 'Pembe',    value: '#ec4899' },
  { label: 'Kırmızı', value: '#ef4444' },
  { label: 'Turuncu', value: '#f97316' },
  { label: 'Sarı',    value: '#eab308' },
  { label: 'Yeşil',   value: '#22c55e' },
  { label: 'Teal',    value: '#14b8a6' },
  { label: 'Mavi',    value: '#3b82f6' },
  { label: 'Gri',     value: '#6b7280' },
];

export const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const DAY_LABELS_FULL = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
