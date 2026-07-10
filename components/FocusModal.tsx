'use client';

import { useState, useEffect } from 'react';
import { HabitItem } from '@/types';
import DayCell from './DayCell';
import styles from './FocusModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  habits: HabitItem[];
  getCellState: (habitId: string, dayIndex: number) => string;
  onCycleCell: (habitId: string, dayIndex: number) => void;
  dayIndex: number;
}

export default function FocusModal({ open, onClose, habits, getCellState, onCycleCell, dayIndex }: Props) {
  const [activeHabitIds, setActiveHabitIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      const ids = habits
        .filter(h => h.type === 'habit' && getCellState(h.id, dayIndex) === 'planned')
        .map(h => h.id);
      setActiveHabitIds(ids);
    } else {
      setActiveHabitIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayIndex]);

  if (!open) return null;

  // Filter habits that were 'planned' when the modal opened
  const plannedHabits = habits.filter(h => activeHabitIds.includes(h.id));

  // Helper to build full hierarchical name and path of a group
  const getGroupPath = (gId: string): string => {
    const group = habits.find(x => x.id === gId);
    if (!group) return '';
    if (!group.groupId) return group.name;
    const parentPath = getGroupPath(group.groupId);
    return parentPath ? `${parentPath} / ${group.name}` : group.name;
  };

  // Generate the exact flattened visual sequence of groups and non-group items as they appear in the accordion
  const visualSequence: { type: 'group' | 'no-group', id: string, name: string, color?: string, backColor?: string }[] = [];
  
  const traverse = (parentId: string | null) => {
    const children = habits.filter(h => h.groupId === parentId);
    children.forEach(child => {
      if (child.type === 'group') {
        visualSequence.push({
          type: 'group',
          id: child.id,
          name: getGroupPath(child.id),
          color: child.color,
          backColor: child.backColor
        });
        traverse(child.id);
      }
    });
  };
  traverse(null);

  const groupedHabits: Record<string, HabitItem[]> = {};
  const noGroupHabits: HabitItem[] = [];

  plannedHabits.forEach(h => {
    if (h.groupId) {
      if (!groupedHabits[h.groupId]) groupedHabits[h.groupId] = [];
      groupedHabits[h.groupId].push(h);
    } else {
      noGroupHabits.push(h);
    }
  });

  // Filter visualSequence groups to only those containing planned items
  const activeOrderedGroups = visualSequence.filter(entry => 
    entry.type === 'group' && groupedHabits[entry.id] && groupedHabits[entry.id].length > 0
  );

  const renderHabitRow = (habit: HabitItem) => (
    <div key={habit.id} className={styles.itemRow}>
      <div className={styles.colorIndicator} style={{ backgroundColor: habit.color }} />
      <div className={styles.itemDetails}>
        <div className={styles.itemName}>{habit.name}</div>
        {habit.notes && <div className={styles.notes}>{habit.notes}</div>}
      </div>
      <DayCell
        state={getCellState(habit.id, dayIndex) as any}
        onClick={() => onCycleCell(habit.id, dayIndex)}
        isToday={true}
        large={true}
      />
    </div>
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            Bugünün Planı
          </h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.content}>
          {plannedHabits.length === 0 ? (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p>Harika! Bugün için planlanan tüm görevleri tamamladınız veya henüz plan yapmadınız.</p>
            </div>
          ) : (
            <div className={styles.groupedList}>
              {activeOrderedGroups.map(group => {
                const items = groupedHabits[group.id];
                const displayName = getGroupPath(group.id);
                const headerStyle: React.CSSProperties = {
                  color: group.color,
                  borderLeft: `4px solid ${group.color}`,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  background: group.backColor || 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center'
                };
                return (
                  <div key={group.id} className={styles.groupContainer}>
                    <div style={headerStyle}>
                      {displayName}
                    </div>
                    {items.map(renderHabitRow)}
                  </div>
                );
              })}
              
              {noGroupHabits.length > 0 && (
                <div className={styles.groupContainer}>
                  {activeOrderedGroups.length > 0 && (
                    <div className={styles.groupHeader}>Diğer Görevler</div>
                  )}
                  {noGroupHabits.map(renderHabitRow)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
