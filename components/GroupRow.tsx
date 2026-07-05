'use client';

import { HabitItem } from '@/types';
import styles from './GroupRow.module.css';

interface Props {
  group: HabitItem;
  isCollapsed: boolean;
  childCount: number;
  completedCount: number;
  onToggle: () => void;
  onEdit: () => void;
  onAddChild?: () => void;
  dragHandleProps?: any;
  isEditMode?: boolean;
  depth?: number;
  isFixed?: boolean;
}

export default function GroupRow({ group, isCollapsed, childCount, completedCount, onToggle, onEdit, onAddChild, dragHandleProps, isEditMode, depth = 0, isFixed }: Props) {
  const badgeClass = childCount === 0
    ? styles.badge
    : completedCount === childCount
      ? `${styles.badge} ${styles.badgeDone}`
      : `${styles.badge} ${styles.badgePlanned}`;

  const rowStyle: React.CSSProperties = {
    '--group-color': group.color,
    marginLeft: `${depth * 8}px`,
    width: `calc(100% - ${depth * 8}px)`,
    ...(group.backColor ? { backgroundColor: group.backColor } : {})
  } as React.CSSProperties;

  return (
    <div className={styles.groupRow} style={rowStyle}>
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
      <div className={styles.colorBar} style={{ background: group.color }} />
      <button className={styles.toggleBtn} onClick={onToggle} title={isCollapsed ? 'Genişlet' : 'Daralt'}>
        <svg
          className={`${styles.chevron} ${isCollapsed ? styles.collapsed : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className={styles.groupName} style={{ color: group.color }}>{group.name}</span>
        {isFixed && (
          <span className={styles.fixedBadge} title="Sabit liste">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
          </span>
        )}
        <span className={badgeClass}>
          {completedCount}/{childCount}
        </span>
      </button>
      <button className={styles.addBtn} onClick={onAddChild} title="İçine Ekle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button className={styles.editBtn} onClick={onEdit} title="Detay / Düzenle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  );
}
