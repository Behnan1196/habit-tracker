'use client';

import { HabitItem } from '@/types';
import DayCell from './DayCell';
import { CellState } from '@/types';
import styles from './HabitRow.module.css';

interface Props {
  habit: HabitItem;
  days: Date[];
  getCellState: (habitId: string, dayIndex: number) => CellState;
  onCycleCell: (habitId: string, dayIndex: number) => void;
  onEdit: () => void;
  todayIndex: number;
  dragHandleProps?: any;
  isEditMode?: boolean;
  depth?: number;
  groupColor?: string;
  selectedDayIndex?: number;
  isFixed?: boolean;
}

export default function HabitRow({ habit, days, getCellState, onCycleCell, onEdit, todayIndex, dragHandleProps, isEditMode, depth = 0, groupColor, selectedDayIndex }: Props) {
  // Use group color if it's a child, else habit color
  const effectiveColor = depth > 0 && groupColor ? groupColor : habit.color;

  const rowStyle: React.CSSProperties = {
    marginLeft: `${depth * 8}px`,
    width: `calc(100% - ${depth * 8}px)`,
    ...(habit.backColor ? { backgroundColor: habit.backColor } : {})
  };

  return (
    <div className={`${styles.row} ${depth > 0 ? styles.childRow : ''}`} style={rowStyle}>
      {/* Drag Handle - Always render in DOM but hide visually when not in edit mode */}
      <div 
        className={styles.dragHandle} 
        {...dragHandleProps}
        style={!isEditMode ? {
          width: 0,
          padding: 0,
          margin: 0,
          opacity: 0,
          overflow: 'hidden',
          pointerEvents: 'none'
        } : undefined}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>

      {/* Color accent bar */}
      <div className={styles.colorBar} style={{ background: effectiveColor }} />

      {/* Name */}
      <div className={styles.nameCell}>
        <button className={styles.nameBtn} onClick={onEdit} title="Detay / Düzenle">
          <div className={styles.nameContent}>
            <div className={styles.nameTop}>
              {/* Dot removed as requested to save space */}
              <span className={styles.name}>{habit.name}</span>
            </div>
            {habit.notes && <div className={styles.notes}>{habit.notes}</div>}
          </div>
        </button>
      </div>

      {/* Day cells */}
      <div className={styles.cells}>
        {selectedDayIndex !== undefined ? (
          <DayCell
            state={getCellState(habit.id, selectedDayIndex)}
            onClick={() => onCycleCell(habit.id, selectedDayIndex)}
            isToday={selectedDayIndex === todayIndex}
            large={true}
          />
        ) : (
          days.map((_, i) => (
            <DayCell
              key={i}
              state={getCellState(habit.id, i)}
              onClick={() => onCycleCell(habit.id, i)}
              isToday={i === todayIndex}
            />
          ))
        )}
      </div>
    </div>
  );
}
