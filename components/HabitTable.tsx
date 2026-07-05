'use client';

import { useHabits } from '@/hooks/useHabits';
import { getWeekDates, formatWeekLabel, saveState } from '@/lib/storage';
import { HabitItem } from '@/types';
import { useState, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import HabitRow from './HabitRow';
import GroupRow from './GroupRow';
import MetricRow from './MetricRow';
import WeekNavigation from './WeekNavigation';
import EditModal from './EditModal';
import BackupModal from './BackupModal';
import FocusModal from './FocusModal';
import { DAY_LABELS } from '@/types';
import styles from './HabitTable.module.css';

export default function HabitTable() {
  const habitsHook = useHabits();
  const {
    state, sortedHabits, currentWeek, isCurrentWeek,
    cycleCell, updateCell, getCellState, toggleGroup, isCollapsed,
    addHabit, updateHabit, deleteHabit, reorderHabits, goToPrevWeek, goToNextWeek, goToCurrentWeek
  } = habitsHook;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<HabitItem> | undefined>(undefined);
  const [isEditMode, setIsEditMode] = useState(false);

  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [focusModalOpen, setFocusModalOpen] = useState(false);

  const days = useMemo(() => getWeekDates(currentWeek), [currentWeek]);
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayIndex = days.findIndex(d => d.getTime() === today.getTime());

  useEffect(() => {
    if (todayIndex !== -1) {
      setSelectedDayIndex(todayIndex);
    } else {
      setSelectedDayIndex(0);
    }
  }, [todayIndex, currentWeek]);

  if (!state) return <div className={styles.loading}>Yükleniyor...</div>;

  const groups = sortedHabits.filter(h => h.type === 'group');
  const topLevelItems = sortedHabits.filter(h => !h.groupId);

  const openAddModal = (groupId?: string) => {
    setEditItem(groupId ? { groupId } : undefined);
    setEditModalOpen(true);
  };

  const openEditModal = (item: HabitItem) => {
    setEditItem(item);
    setEditModalOpen(true);
  };

  const handleSave = (data: Omit<HabitItem, 'id' | 'order'>) => {
    if (editItem?.id) {
      updateHabit(editItem.id, data);
    } else {
      addHabit(data);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    
    // type is the groupId or 'top-level'
    const groupId = type === 'top-level' ? null : type;
    reorderHabits(source.index, destination.index, groupId);
  };

  const activeDayIndexForBadge = todayIndex !== -1 ? todayIndex : selectedDayIndex;

  const getGroupStats = (groupId: string, dayIndex: number) => {
    let planned = 0;
    let completed = 0;
    const countStats = (parentId: string) => {
      const children = sortedHabits.filter(h => h.groupId === parentId);
      for (const child of children) {
        if (child.type === 'habit') {
          const st = getCellState(child.id, dayIndex);
          if (st === 'done' || st === 'planned') planned++;
          if (st === 'done') completed++;
        } else if (child.type === 'group') {
          countStats(child.id);
        }
      }
    };
    countStats(groupId);
    return { planned, completed };
  };

  // A truly recursive component to handle infinite depth
  const isItemFixed = (item: HabitItem): boolean => {
    if (item.isFixed) return true;
    if (item.groupId) {
      const parent = sortedHabits.find(h => h.id === item.groupId);
      if (parent?.isFixed) return true;
    }
    return false;
  };

  const RenderNodeWithDrag = ({ item, depth, groupColor, dragHandleProps }: { item: HabitItem, depth: number, groupColor?: string, dragHandleProps?: any }) => {
    if (item.type === 'habit') {
      return (
        <HabitRow
          habit={item}
          days={days}
          getCellState={getCellState}
          onCycleCell={cycleCell}
          onEdit={() => openEditModal(item)}
          todayIndex={todayIndex}
          dragHandleProps={dragHandleProps}
          isEditMode={isEditMode}
          depth={depth}
          groupColor={groupColor}
          selectedDayIndex={viewMode === 'daily' ? selectedDayIndex : undefined}
          isFixed={isItemFixed(item)}
        />
      );
    }

    if (item.type === 'metric') {
      return (
        <MetricRow
          habit={item}
          days={days}
          getCellState={getCellState}
          onUpdateCell={updateCell}
          onEdit={() => openEditModal(item)}
          todayIndex={todayIndex}
          dragHandleProps={dragHandleProps}
          isEditMode={isEditMode}
          depth={depth}
          groupColor={groupColor}
          selectedDayIndex={viewMode === 'daily' ? selectedDayIndex : undefined}
        />
      );
    }

    if (item.type === 'group') {
      const stats = getGroupStats(item.id, activeDayIndexForBadge);
      const children = sortedHabits.filter(h => h.groupId === item.id);
      
      return (
        <div className={styles.groupSection} style={{ width: '100%' }}>
          <GroupRow
            group={item}
            isCollapsed={isCollapsed(item.id)}
            childCount={stats.planned}
            completedCount={stats.completed}
            onToggle={() => toggleGroup(item.id)}
            onEdit={() => openEditModal(item)}
            onAddChild={() => openAddModal(item.id)}
            dragHandleProps={dragHandleProps}
            isEditMode={isEditMode}
            depth={depth}
            isFixed={item.isFixed}
          />
          
          {!isCollapsed(item.id) && (
            <Droppable droppableId={`group-${item.id}`} type={item.id}>
              {(providedGroup) => (
                <div 
                  className={styles.groupChildren} 
                  ref={providedGroup.innerRef} 
                  {...providedGroup.droppableProps}
                >
                  {children.map((child, childIdx) => (
                    <Draggable key={child.id} draggableId={child.id} index={childIdx}>
                      {(providedChild, snapshotChild) => (
                        <div
                          ref={providedChild.innerRef}
                          {...providedChild.draggableProps}
                          className={snapshotChild.isDragging ? styles.dragging : ''}
                        >
                          <RenderNodeWithDrag 
                            item={child} 
                            depth={depth + 1} 
                            groupColor={item.color} 
                            dragHandleProps={providedChild.dragHandleProps} 
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {providedGroup.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Alışkanlıklar</h1>
          <p className={styles.subtitle}>Haftanı planla ve takip et</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={`${styles.toggleEditBtn} ${isEditMode ? styles.editActive : ''}`} 
            onClick={() => setIsEditMode(!isEditMode)}
          >
            {isEditMode ? 'Bitti' : 'Düzenle'}
          </button>
          
          <button 
            className={styles.backupHeaderBtn} 
            onClick={() => setFocusModalOpen(true)}
            title="Bugünün Planı"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          </button>
          
          <button 
            className={styles.backupHeaderBtn} 
            onClick={() => setBackupModalOpen(true)}
            title="Bulut Yedekleme"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.3-2-1.9-3.6-3.9-3.9C17 4 13.6 1.8 9.7 3 6.6 4 4.3 6.8 4 10c-2 .4-3.5 2-3.8 4-.3 1.8.4 3.5 1.8 4.5.6.4 1.2.5 2 .5h14c1.7 0 3-1.3 3.2-3z" />
            </svg>
          </button>

          <button className={styles.addBtn} onClick={() => openAddModal()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Segmented control for View Mode */}
      <div className={styles.viewModeToggle}>
        <button 
          className={`${styles.toggleTab} ${viewMode === 'daily' ? styles.activeTab : ''}`}
          onClick={() => setViewMode('daily')}
        >
          Günlük
        </button>
        <button 
          className={`${styles.toggleTab} ${viewMode === 'weekly' ? styles.activeTab : ''}`}
          onClick={() => setViewMode('weekly')}
        >
          Haftalık
        </button>
      </div>

      <WeekNavigation
        currentWeek={currentWeek}
        isCurrentWeek={isCurrentWeek}
        onPrev={goToPrevWeek}
        onNext={goToNextWeek}
        onToday={goToCurrentWeek}
      />

      {/* Horizontal Day Selector in Daily View */}
      {viewMode === 'daily' && (
        <div className={styles.daySelectorBar}>
          {days.map((d, i) => {
            const isToday = i === todayIndex;
            const isSelected = i === selectedDayIndex;
            return (
              <button
                key={i}
                className={`${styles.daySelectorTab} ${isSelected ? styles.selectedDayTab : ''} ${isToday ? styles.todayDayTab : ''}`}
                onClick={() => setSelectedDayIndex(i)}
              >
                <span className={styles.daySelectLetter}>{DAY_LABELS[i]}</span>
                <span className={styles.daySelectNumber}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.tableWrapper}>
        {viewMode === 'weekly' && (
          <div className={styles.tableHeader}>
            <div className={styles.nameHeader}>Görev</div>
            <div className={styles.daysHeader}>
              {days.map((d, i) => (
                <div key={i} className={`${styles.dayLabel} ${i === todayIndex ? styles.todayLabel : ''}`}>
                  <span className={styles.dayLetter}>{DAY_LABELS[i]}</span>
                  <span className={styles.dayNumber}>{d.getDate()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="top-level" type="top-level">
            {(provided) => (
              <div className={styles.tableBody} ref={provided.innerRef} {...provided.droppableProps}>
                
                {topLevelItems.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={snapshot.isDragging ? styles.dragging : ''}
                      >
                        <RenderNodeWithDrag 
                           item={item} 
                           depth={0} 
                           dragHandleProps={provided.dragHandleProps} 
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                
                {sortedHabits.length === 0 && (
                  <div className={styles.emptyState}>
                    <p>Henüz alışkanlık eklenmemiş.</p>
                    <button onClick={() => openAddModal()}>İlk alışkanlığını ekle</button>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <EditModal
        open={editModalOpen}
        initial={editItem}
        groups={groups}
        onSave={handleSave}
        onDelete={editItem?.id ? () => deleteHabit(editItem.id!) : undefined}
        onClose={() => setEditModalOpen(false)}
      />

      <BackupModal
        open={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        currentState={state}
        onRestore={(restoredState) => {
          saveState(restoredState);
          window.location.reload();
        }}
      />

      <FocusModal
        open={focusModalOpen}
        onClose={() => setFocusModalOpen(false)}
        habits={sortedHabits}
        getCellState={getCellState}
        onCycleCell={cycleCell}
        dayIndex={activeDayIndexForBadge}
      />
    </div>
  );
}
