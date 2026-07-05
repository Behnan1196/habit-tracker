'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppState, HabitItem, CellState } from '@/types';
import { loadState, saveState, getWeekKey, addWeeks, nextCellState } from '@/lib/storage';

export function useHabits() {
  const [state, setState] = useState<AppState | null>(null);
  const [currentWeek, setCurrentWeek] = useState<string>('');

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setCurrentWeek(getWeekKey(new Date()));
  }, []);

  const update = useCallback((updater: (prev: AppState) => AppState) => {
    setState(prev => {
      if (!prev) return prev;
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  // --- Cell ---
  // Fixed items use a special 'global' key so they persist across weeks
  const getWeekKeyForHabit = useCallback((habitId: string): string => {
    if (!state) return currentWeek;
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return currentWeek;
    // Check if the item itself or its parent group is fixed
    if (habit.isFixed) return 'global';
    if (habit.groupId) {
      const parent = state.habits.find(h => h.id === habit.groupId);
      if (parent?.isFixed) return 'global';
    }
    return currentWeek;
  }, [state, currentWeek]);

  const cycleCell = useCallback((habitId: string, dayIndex: number) => {
    update(prev => {
      const weekKey = getWeekKeyForHabit(habitId);
      const weekData = prev.weeklyData[weekKey] ?? {};
      const habitData = weekData[habitId] ?? {};
      const current = (habitData[dayIndex] as string) ?? 'empty';
      // If it's not a standard cycle value, fall back to empty
      const normalizedCurrent = ['empty', 'planned', 'done'].includes(current) ? (current as 'empty' | 'planned' | 'done') : 'empty';
      const next = nextCellState(normalizedCurrent);
      const newHabitData = { ...habitData };
      if (next === 'empty') {
        delete newHabitData[dayIndex];
      } else {
        newHabitData[dayIndex] = next;
      }
      const newWeekData = { ...weekData, [habitId]: newHabitData };
      return { ...prev, weeklyData: { ...prev.weeklyData, [weekKey]: newWeekData } };
    });
  }, [getWeekKeyForHabit, update]);

  const updateCell = useCallback((habitId: string, dayIndex: number, text: string) => {
    update(prev => {
      const weekKey = getWeekKeyForHabit(habitId);
      const weekData = prev.weeklyData[weekKey] ?? {};
      const habitData = weekData[habitId] ?? {};
      const newHabitData = { ...habitData };
      if (!text.trim()) {
        delete newHabitData[dayIndex];
      } else {
        newHabitData[dayIndex] = text;
      }
      const newWeekData = { ...weekData, [habitId]: newHabitData };
      return { ...prev, weeklyData: { ...prev.weeklyData, [weekKey]: newWeekData } };
    });
  }, [getWeekKeyForHabit, update]);

  const getCellState = useCallback((habitId: string, dayIndex: number): CellState => {
    if (!state) return 'empty';
    const weekKey = getWeekKeyForHabit(habitId);
    return (state.weeklyData[weekKey]?.[habitId]?.[dayIndex] as CellState) ?? 'empty';
  }, [state, getWeekKeyForHabit]);

  // --- Group collapse ---
  const toggleGroup = useCallback((groupId: string) => {
    update(prev => {
      const collapsed = prev.collapsedGroups.includes(groupId)
        ? prev.collapsedGroups.filter(id => id !== groupId)
        : [...prev.collapsedGroups, groupId];
      return { ...prev, collapsedGroups: collapsed };
    });
  }, [update]);

  const isCollapsed = useCallback((groupId: string): boolean => {
    return state?.collapsedGroups.includes(groupId) ?? false;
  }, [state]);

  // --- Habits CRUD ---
  const addHabit = useCallback((item: Omit<HabitItem, 'id' | 'order'>) => {
    update(prev => {
      const id = `h-${Date.now()}`;
      const order = Math.max(...prev.habits.map(h => h.order), -1) + 1;
      return { ...prev, habits: [...prev.habits, { ...item, id, order }] };
    });
  }, [update]);

  const updateHabit = useCallback((id: string, changes: Partial<HabitItem>) => {
    update(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === id ? { ...h, ...changes } : h),
    }));
  }, [update]);

  const deleteHabit = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      habits: prev.habits.filter(h => h.id !== id && h.groupId !== id),
      collapsedGroups: prev.collapsedGroups.filter(gid => gid !== id),
    }));
  }, [update]);

  const reorderHabits = useCallback((sourceIndex: number, destinationIndex: number, groupId: string | null) => {
    update(prev => {
      const habits = [...prev.habits];
      const siblings = habits.filter(h => h.groupId === groupId).sort((a, b) => a.order - b.order);
      
      if (sourceIndex < 0 || sourceIndex >= siblings.length || destinationIndex < 0 || destinationIndex >= siblings.length) {
        return prev;
      }
      
      const [movedItem] = siblings.splice(sourceIndex, 1);
      siblings.splice(destinationIndex, 0, movedItem);
      
      siblings.forEach((item, idx) => {
        const hIndex = habits.findIndex(h => h.id === item.id);
        if (hIndex >= 0) {
          habits[hIndex] = { ...habits[hIndex], order: idx };
        }
      });
      
      return { ...prev, habits };
    });
  }, [update]);

  // --- Week navigation ---
  const goToPrevWeek = useCallback(() => setCurrentWeek(w => addWeeks(w, -1)), []);
  const goToNextWeek = useCallback(() => setCurrentWeek(w => addWeeks(w, 1)), []);
  const goToCurrentWeek = useCallback(() => setCurrentWeek(getWeekKey(new Date())), []);

  const isCurrentWeek = currentWeek === getWeekKey(new Date());

  const sortedHabits = state?.habits.slice().sort((a, b) => a.order - b.order) ?? [];

  return {
    state,
    sortedHabits,
    currentWeek,
    isCurrentWeek,
    cycleCell,
    updateCell,
    getCellState,
    getWeekKeyForHabit,
    toggleGroup,
    isCollapsed,
    addHabit,
    updateHabit,
    deleteHabit,
    reorderHabits,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
