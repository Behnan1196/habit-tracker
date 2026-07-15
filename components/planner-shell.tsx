'use client';

import type { User } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PlanStatus } from '@/types/domain';
import { ItemEditorModal, type EditableGroup, type EditableItem } from './item-editor-modal';
import { AppMenu, type CalendarView } from './app-menu';
import styles from './planner-shell.module.css';

type GroupRow = { id: string; parent_id: string | null; name: string; color: string | null; background_color: string | null; position: number };
type ItemRow = EditableItem & { position: number };
type SlotRow = { id: string; name: string; start_time: string | null; end_time: string | null; color: string | null; position: number; is_active: boolean };
type AssignmentRow = { id: string; item_id: string; time_slot_id: string; plan_date: string; status: PlanStatus };
type PersistentRow = { item_id: string; status: PlanStatus };
type MetricRow = { id: string; item_id: string; entry_date: string; value: number; note: string | null };

const palette = ['#395f47', '#638169', '#667e99', '#8d76a4', '#ad765e', '#b18a4f'];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function mondayOf(date: Date) {
  const result = new Date(date); result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date); result.setDate(result.getDate() + amount); return result;
}

function shortTime(value: string | null) { return value?.slice(0, 5) ?? '—'; }

function readableText(background: string) {
  const value = background.replace('#', '');
  const [red, green, blue] = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => Number.parseInt(part, 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#18201a' : '#ffffff';
}

export function PlannerShell({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()));
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [view, setView] = useState<CalendarView>('daily');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [persistent, setPersistent] = useState<PersistentRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [planTarget, setPlanTarget] = useState<{ item: ItemRow; date: string } | null>(null);
  const [metricTarget, setMetricTarget] = useState<{ item: ItemRow; date: string; entry?: MetricRow } | null>(null);
  const [editor, setEditor] = useState<{ item?: ItemRow; group?: GroupRow; groupId: string | null; initialKind?: 'group' } | null>(null);
  const [focusSnapshot, setFocusSnapshot] = useState<AssignmentRow[] | null>(null);
  const [slotManagerOpen, setSlotManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleDates = view === 'daily' ? [parseDate(selectedDate)] : weekDates;
  const weekEnd = isoDate(weekDates[6]);
  const weekStartKey = isoDate(weekStart);

  const loadData = useCallback(async () => {
    const [groupResult, itemResult, slotResult, assignmentResult, persistentResult, metricResult] = await Promise.all([
      supabase.from('m_groups').select('id,parent_id,name,color,background_color,position').order('position'),
      supabase.from('m_items').select('id,group_id,kind,name,description,color,metric_unit,position').eq('is_active', true).order('position'),
      supabase.from('m_time_slots').select('id,name,start_time,end_time,color,position,is_active').order('position'),
      supabase.from('m_daily_assignments').select('id,item_id,time_slot_id,plan_date,status').gte('plan_date', weekStartKey).lte('plan_date', weekEnd).neq('status', 'cancelled'),
      supabase.from('m_persistent_states').select('item_id,status').neq('status', 'cancelled'),
      supabase.from('m_metric_entries').select('id,item_id,entry_date,value,note').gte('entry_date', weekStartKey).lte('entry_date', weekEnd),
    ]);
    const results = [groupResult, itemResult, slotResult, assignmentResult, persistentResult, metricResult];
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setGroups((groupResult.data ?? []) as GroupRow[]); setItems((itemResult.data ?? []) as ItemRow[]);
      setSlots((slotResult.data ?? []) as SlotRow[]); setAssignments((assignmentResult.data ?? []) as AssignmentRow[]);
      setPersistent((persistentResult.data ?? []) as PersistentRow[]); setMetrics((metricResult.data ?? []) as MetricRow[]);
    }
    setLoading(false);
  }, [supabase, weekEnd, weekStartKey]);

  useEffect(() => {
    void supabase.from('m_profiles').upsert({ id: user.id, display_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null }, { onConflict: 'id' });
    queueMicrotask(() => void loadData());
  }, [loadData, supabase, user]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'weekly') queueMicrotask(() => setView('weekly'));
  }, []);

  function changeView(nextView: CalendarView) {
    setView(nextView);
    const url = nextView === 'weekly' ? '/?view=weekly' : '/';
    window.history.replaceState(null, '', url);
  }

  function movePeriod(amount: -1 | 1) {
    if (view === 'daily') {
      const next = addDays(parseDate(selectedDate), amount);
      setSelectedDate(isoDate(next));
      setWeekStart(mondayOf(next));
      return;
    }
    const next = addDays(weekStart, amount * 7);
    setWeekStart(next);
    setSelectedDate(isoDate(next));
  }

  const selectedPlanned = assignments.filter((entry) => entry.plan_date === selectedDate && entry.status === 'planned');
  const activeSlots = slots.filter((slot) => slot.is_active);

  async function addGroup(parentId: string | null = null) {
    setEditor({ groupId: parentId, initialKind: 'group' });
  }

  async function editGroup(group: GroupRow) {
    setEditor({ group, groupId: group.parent_id, initialKind: 'group' });
  }

  async function deleteGroup(group: GroupRow) {
    if (!window.confirm(`“${group.name}” grubu ve altındaki kayıtlar silinsin mi?`)) return false;
    const { error: deleteError } = await supabase.from('m_groups').delete().eq('id', group.id);
    if (deleteError) { setError(deleteError.message); return false; }
    await loadData(); return true;
  }

  async function saveItem(draft: Omit<EditableItem, 'id'>) {
    if (editor?.group) {
      const oldGroup = editor.group;
      const childItemIds = items.filter((item) => item.group_id === oldGroup.id).map((item) => item.id);
      const childGroupIds = groups.filter((group) => group.parent_id === oldGroup.id).map((group) => group.id);
      const created = await supabase.from('m_items').insert({ ...draft, user_id: user.id, position: items.length }).select('id').single();
      if (created.error) return setError(created.error.message);

      const movedItems = childItemIds.length ? await supabase.from('m_items').update({ group_id: draft.group_id }).in('id', childItemIds) : { error: null };
      if (movedItems.error) {
        await supabase.from('m_items').delete().eq('id', created.data.id);
        return setError(movedItems.error.message);
      }
      const movedGroups = childGroupIds.length ? await supabase.from('m_groups').update({ parent_id: draft.group_id }).in('id', childGroupIds) : { error: null };
      if (movedGroups.error) {
        if (childItemIds.length) await supabase.from('m_items').update({ group_id: oldGroup.id }).in('id', childItemIds);
        await supabase.from('m_items').delete().eq('id', created.data.id);
        return setError(movedGroups.error.message);
      }
      const removed = await supabase.from('m_groups').delete().eq('id', oldGroup.id);
      if (removed.error) {
        if (childGroupIds.length) await supabase.from('m_groups').update({ parent_id: oldGroup.id }).in('id', childGroupIds);
        if (childItemIds.length) await supabase.from('m_items').update({ group_id: oldGroup.id }).in('id', childItemIds);
        await supabase.from('m_items').delete().eq('id', created.data.id);
        return setError(removed.error.message);
      }
      setEditor(null); await loadData(); return;
    }
    const result = editor?.item ? await supabase.from('m_items').update(draft).eq('id', editor.item.id) : await supabase.from('m_items').insert({ ...draft, user_id: user.id, position: items.length });
    if (result.error) setError(result.error.message); else { setEditor(null); await loadData(); }
  }

  async function saveGroup(draft: Omit<EditableGroup, 'id'>) {
    if (editor?.item) {
      const oldItem = editor.item;
      const created = await supabase.from('m_groups').insert({ ...draft, user_id: user.id, position: groups.length }).select('id').single();
      if (created.error) return setError(created.error.message);
      const removed = await supabase.from('m_items').delete().eq('id', oldItem.id);
      if (removed.error) {
        await supabase.from('m_groups').delete().eq('id', created.data.id);
        return setError(removed.error.message);
      }
      setEditor(null); await loadData(); return;
    }
    const result = editor?.group ? await supabase.from('m_groups').update(draft).eq('id', editor.group.id) : await supabase.from('m_groups').insert({ ...draft, user_id: user.id, position: groups.length });
    if (result.error) setError(result.error.message); else { setEditor(null); await loadData(); }
  }

  async function deleteItem(item: ItemRow) {
    if (!window.confirm(`“${item.name}” silinsin mi?`)) return false;
    const { error: deleteError } = await supabase.from('m_items').delete().eq('id', item.id);
    if (deleteError) { setError(deleteError.message); return false; }
    await loadData(); return true;
  }

  async function saveSlot(draft: { id?: string; name: string; start_time: string | null; end_time: string | null; color: string }) {
    const values = { name: draft.name, start_time: draft.start_time, end_time: draft.end_time, color: draft.color, is_active: true };
    const result = draft.id ? await supabase.from('m_time_slots').update(values).eq('id', draft.id) : await supabase.from('m_time_slots').insert({ ...values, user_id: user.id, position: slots.length });
    if (result.error) { setError(result.error.message); return false; }
    await loadData(); return true;
  }

  async function archiveSlot(slot: SlotRow) {
    if (!window.confirm(`“${slot.name}” zaman dilimi kaldırılsın mı? Geçmiş planlarda korunacak.`)) return false;
    const result = await supabase.from('m_time_slots').update({ is_active: false }).eq('id', slot.id);
    if (result.error) { setError(result.error.message); return false; }
    await loadData(); return true;
  }

  async function toggleSlot(slotId: string) {
    if (!planTarget) return;
    const existing = assignments.find((entry) => entry.item_id === planTarget.item.id && entry.time_slot_id === slotId && entry.plan_date === planTarget.date);
    if (existing?.status === 'planned') {
      const { error: updateError } = await supabase.from('m_daily_assignments').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), completed_at: null }).eq('id', existing.id);
      if (updateError) return setError(updateError.message);
    } else {
      const { error: upsertError } = await supabase.from('m_daily_assignments').upsert({ user_id: user.id, item_id: planTarget.item.id, time_slot_id: slotId, plan_date: planTarget.date, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null }, { onConflict: 'user_id,item_id,time_slot_id,plan_date' });
      if (upsertError) return setError(upsertError.message);
    }
    await loadData();
  }

  async function completeAssignment(id: string) {
    const { error: updateError } = await supabase.from('m_daily_assignments').update({ status: 'done', completed_at: new Date().toISOString(), cancelled_at: null }).eq('id', id);
    if (updateError) return setError(updateError.message);
    setFocusSnapshot((current) => current?.map((entry) => entry.id === id ? { ...entry, status: 'done' } : entry) ?? null);
    setAssignments((current) => current.map((entry) => entry.id === id ? { ...entry, status: 'done' } : entry));
  }

  async function cyclePersistent(item: ItemRow) {
    const current = persistent.find((state) => state.item_id === item.id)?.status;
    const now = new Date().toISOString();
    const result = !current
      ? await supabase.from('m_persistent_states').upsert({ item_id: item.id, user_id: user.id, status: 'planned', planned_at: now, completed_at: null, cancelled_at: null })
      : current === 'planned'
        ? await supabase.from('m_persistent_states').update({ status: 'done', completed_at: now, cancelled_at: null }).eq('item_id', item.id)
        : await supabase.from('m_persistent_states').update({ status: 'cancelled', cancelled_at: now, completed_at: null }).eq('item_id', item.id);
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function saveMetric(value: number, note: string) {
    if (!metricTarget) return;
    const { error: upsertError } = await supabase.from('m_metric_entries').upsert({ user_id: user.id, item_id: metricTarget.item.id, entry_date: metricTarget.date, value, note: note.trim() || null }, { onConflict: 'user_id,item_id,entry_date' });
    if (upsertError) setError(upsertError.message); else { setMetricTarget(null); await loadData(); }
  }

  async function moveItem(itemId: string, groupId: string | null) {
    if (!itemId) return;
    const { error: updateError } = await supabase.from('m_items').update({ group_id: groupId }).eq('id', itemId);
    if (updateError) setError(updateError.message); else await loadData();
  }

  function renderItem(item: ItemRow) {
    const persistentStatus = persistent.find((state) => state.item_id === item.id)?.status;
    return <div className={`${styles.calendarRow} ${item.kind === 'persistent' ? styles.persistentRow : ''}`} key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/item-id', item.id)}>
      <div className={styles.itemIdentity}><span className={styles.drag}>⠿</span><i style={{ background: item.color ?? palette[0] }} /><button onClick={() => setEditor({ item, groupId: item.group_id })}><strong>{item.name}</strong><small>{item.kind === 'daily' ? 'Günlük' : item.kind === 'metric' ? `Metrik · ${item.metric_unit ?? 'değer'}` : 'Sürekli'}</small></button></div>
      {item.kind === 'persistent' ? <button className={`${styles.persistentCell} ${persistentStatus === 'done' ? styles.cellDone : persistentStatus === 'planned' ? styles.cellPlanned : ''}`} onClick={() => void cyclePersistent(item)}><span>{persistentStatus === 'done' ? '✓ Yapıldı' : persistentStatus === 'planned' ? 'Planlandı' : 'Boş'}</span><small>Tarihten bağımsız</small></button> : visibleDates.map((date) => {
        const key = isoDate(date);
        if (item.kind === 'metric') {
          const entry = metrics.find((metric) => metric.item_id === item.id && metric.entry_date === key);
          return <button key={key} className={`${styles.calendarCell} ${selectedDate === key ? styles.selectedCell : ''}`} onClick={() => { setSelectedDate(key); setMetricTarget({ item, date: key, entry }); }}><strong>{entry?.value ?? '—'}</strong>{entry && <small>{item.metric_unit}</small>}</button>;
        }
        const dayAssignments = assignments.filter((entry) => entry.item_id === item.id && entry.plan_date === key);
        const planned = dayAssignments.filter((entry) => entry.status === 'planned').length; const done = dayAssignments.filter((entry) => entry.status === 'done').length;
        return <button key={key} className={`${styles.calendarCell} ${done && !planned ? styles.cellDone : planned ? styles.cellPlanned : ''} ${selectedDate === key ? styles.selectedCell : ''}`} onClick={() => { setSelectedDate(key); setPlanTarget({ item, date: key }); }}><strong>{done ? '✓' : planned ? '●' : '＋'}</strong>{dayAssignments.length > 1 && <small>{dayAssignments.length}</small>}</button>;
      })}
    </div>;
  }

  function renderGroup(group: GroupRow, depth = 0): React.ReactNode {
    const groupItems = items.filter((item) => item.group_id === group.id); const children = groups.filter((candidate) => candidate.parent_id === group.id);
    return <section className={styles.calendarGroup} key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData('text/item-id'), group.id)}>
      <header style={{ paddingLeft: 10 + Math.min(depth * 12, 36), background: group.background_color ?? '#f4f5f1', color: readableText(group.background_color ?? '#f4f5f1') }}><i style={{ background: group.color ?? palette[0] }} /><button className={styles.groupTitle} onClick={() => void editGroup(group)}>{group.name}</button><small>{groupItems.length}</small><div><button aria-label={`${group.name} grubuna ekle`} title="Gruba ekle" onClick={() => setEditor({ groupId: group.id })}>＋</button></div></header>
      {groupItems.map(renderItem)}{children.map((child) => renderGroup(child, depth + 1))}
    </section>;
  }

  function openFocus() { setFocusSnapshot(selectedPlanned.map((entry) => ({ ...entry }))); }
  const focusTitle = selectedDate === isoDate(new Date()) ? 'Bugünün Planı' : `${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(parseDate(selectedDate))} Planı`;
  const focusSlots = slots.map((slot) => ({ ...slot, entries: (focusSnapshot ?? []).filter((entry) => entry.time_slot_id === slot.id) })).filter((slot) => slot.entries.length);

  if (loading) return <div className={styles.loading}>Planın yükleniyor…</div>;

  return <div className={styles.app}>
    <main className={styles.mainWide}>
      {error && <button className={styles.errorBanner} onClick={() => setError('')}>{error} ×</button>}
      <div className={styles.stickyTop}><header className={styles.header}><div><p>Ritmini bul</p><h1>Momentum</h1></div><div className={styles.headerActions}><button className={styles.focusButton} onClick={openFocus}><span className={styles.focusDot} /> {focusTitle} <b>{selectedPlanned.length}</b></button><AppMenu user={user} active="calendar" view={view} onViewChange={changeView} onAddGroup={() => void addGroup()} onManageSlots={() => setSlotManagerOpen(true)} /></div></header>
      <section className={styles.weekNav}><button aria-label={view === 'daily' ? 'Önceki gün' : 'Önceki hafta'} onClick={() => movePeriod(-1)}>‹</button><div><strong>{view === 'daily' ? new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(selectedDate)) : <>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(weekStart)} – {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(weekDates[6])}</>}</strong><button onClick={() => { const today = new Date(); setWeekStart(mondayOf(today)); setSelectedDate(isoDate(today)); }}>Bugün</button></div><button aria-label={view === 'daily' ? 'Sonraki gün' : 'Sonraki hafta'} onClick={() => movePeriod(1)}>›</button></section></div>
      <section className={`${styles.calendarBoard} ${view === 'daily' ? styles.dailyView : ''}`}>
        <div className={styles.calendarScroller}>
          <div className={styles.calendarHead}><div><button className={styles.headerAdd} aria-label="Grup veya item ekle" title="Grup veya item ekle" onClick={() => setEditor({ groupId: null })}>＋</button></div>{visibleDates.map((date) => { const key = isoDate(date); return <button key={key} className={selectedDate === key ? styles.selectedDay : ''} onClick={() => setSelectedDate(key)}><span>{new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date)}</span><strong>{date.getDate()}</strong></button>; })}</div>
          <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData('text/item-id'), null)}>{groups.filter((group) => group.parent_id === null).map((group) => renderGroup(group))}{items.filter((item) => item.group_id === null).map(renderItem)}{!groups.length && !items.length && <div className={styles.empty}>İlk grubunu veya item’ını ekleyerek başla.</div>}</div>
        </div>
      </section>
    </main>
    {planTarget && <div className={styles.overlay} onMouseDown={() => setPlanTarget(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(planTarget.date))}</span><button onClick={() => setPlanTarget(null)}>×</button></div><h2>{planTarget.item.name}</h2><p>Bir veya birden fazla zaman dilimi seçebilirsin.</p><div className={styles.slotPicker}>{activeSlots.map((slot) => { const chosen = assignments.some((entry) => entry.item_id === planTarget.item.id && entry.time_slot_id === slot.id && entry.plan_date === planTarget.date && entry.status === 'planned'); return <button key={slot.id} className={chosen ? styles.chosen : ''} onClick={() => void toggleSlot(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{chosen ? '✓' : ''}</b></button>; })}</div><button className={styles.primary} onClick={() => setPlanTarget(null)}>Tamam</button></section></div>}
    {slotManagerOpen && <TimeSlotManager slots={activeSlots} onClose={() => setSlotManagerOpen(false)} onSave={saveSlot} onDelete={archiveSlot} />}
    {metricTarget && <MetricEntryModal target={metricTarget} onClose={() => setMetricTarget(null)} onSave={saveMetric} />}
    {focusSnapshot && <div className={styles.overlay} onMouseDown={() => setFocusSnapshot(null)}><section className={`${styles.dialog} ${styles.focusDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(selectedDate))}</span><button onClick={() => setFocusSnapshot(null)}>×</button></div><h2>{focusTitle}</h2><p>{focusSnapshot.filter((entry) => entry.status === 'planned').length} item seni bekliyor.</p>{focusSlots.map((slot) => <div className={styles.focusSlot} key={slot.id}><header><i style={{ background: slot.color ?? palette[0] }} /><strong>{slot.name}</strong><span>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</span></header>{slot.entries.map((entry) => { const item = items.find((candidate) => candidate.id === entry.item_id); return <button key={entry.id} className={entry.status === 'done' ? styles.focusDone : ''} onClick={() => entry.status === 'planned' && void completeAssignment(entry.id)}><span className={styles.roundCheck}>{entry.status === 'done' ? '✓' : ''}</span><span><strong>{item?.name}</strong><small>{groups.find((group) => group.id === item?.group_id)?.name ?? 'Grupsuz'}</small></span><em>{entry.status === 'done' ? 'Yapıldı' : 'Planlandı'}</em></button>; })}</div>)}{!focusSlots.length && <div className={styles.empty}>Bu gün için planlanmış item yok.</div>}</section></div>}
    {editor && <ItemEditorModal key={editor.item?.id ?? editor.group?.id ?? `new-${editor.initialKind ?? 'item'}-${editor.groupId ?? 'root'}`} item={editor.item} group={editor.group} initialKind={editor.initialKind} initialGroupId={editor.groupId} groups={groups} onClose={() => setEditor(null)} onSave={saveItem} onSaveGroup={saveGroup} onDelete={editor.item ? async () => { if (await deleteItem(editor.item!)) setEditor(null); } : editor.group ? async () => { if (await deleteGroup(editor.group!)) setEditor(null); } : undefined} />}
  </div>;
}

function TimeSlotManager({ slots, onClose, onSave, onDelete }: {
  slots: SlotRow[];
  onClose: () => void;
  onSave: (draft: { id?: string; name: string; start_time: string | null; end_time: string | null; color: string }) => Promise<boolean>;
  onDelete: (slot: SlotRow) => Promise<boolean>;
}) {
  const emptyDraft = { name: '', start_time: '09:00', end_time: '12:00', color: palette[0] };
  const [draft, setDraft] = useState<{ id?: string; name: string; start_time: string; end_time: string; color: string }>(emptyDraft);
  const [busy, setBusy] = useState(false);
  function edit(slot: SlotRow) { setDraft({ id: slot.id, name: slot.name, start_time: shortTime(slot.start_time) === '—' ? '' : shortTime(slot.start_time), end_time: shortTime(slot.end_time) === '—' ? '' : shortTime(slot.end_time), color: slot.color ?? palette[0] }); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft.name.trim()) return; setBusy(true);
    const saved = await onSave({ ...draft, name: draft.name.trim(), start_time: draft.start_time || null, end_time: draft.end_time || null });
    if (saved) setDraft(emptyDraft); setBusy(false);
  }
  return <div className={styles.overlay} onMouseDown={onClose}><section className={`${styles.dialog} ${styles.slotManager}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Plan ayarları</span><button onClick={onClose}>×</button></div><h2>Zaman dilimleri</h2><p>Günün bölümlerini ekle, saatlerini ve renklerini düzenle.</p><div className={styles.slotManagerList}>{slots.map((slot) => <button key={slot.id} className={draft.id === slot.id ? styles.slotEditing : ''} onClick={() => edit(slot)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><em>Değiştir</em></button>)}</div><form className={styles.slotForm} onSubmit={submit}><label>Ad<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Örn. Sabah rutini" /></label><div><label>Başlangıç<input type="time" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} /></label><label>Bitiş<input type="time" value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} /></label></div><div className={styles.slotColors}>{palette.map((color) => <button type="button" key={color} aria-label={`Renk ${color}`} className={draft.color === color ? styles.slotColorActive : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}</div><div className={styles.slotFormActions}>{draft.id && <button type="button" className={styles.slotDelete} disabled={busy} onClick={async () => { const slot = slots.find((entry) => entry.id === draft.id); if (slot && await onDelete(slot)) setDraft(emptyDraft); }}>Sil</button>}<span /><button type="button" disabled={busy} onClick={() => setDraft(emptyDraft)}>{draft.id ? 'Yeni ekle' : 'Temizle'}</button><button className={styles.primary} disabled={busy || !draft.name.trim()}>{busy ? 'Kaydediliyor…' : draft.id ? 'Güncelle' : 'Ekle'}</button></div></form></section></div>;
}

function MetricEntryModal({ target, onClose, onSave }: { target: { item: ItemRow; date: string; entry?: MetricRow }; onClose: () => void; onSave: (value: number, note: string) => Promise<void> }) {
  const [value, setValue] = useState(target.entry?.value?.toString() ?? ''); const [note, setNote] = useState(target.entry?.note ?? ''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); await onSave(Number(value), note); setBusy(false); }
  return <div className={styles.overlay} onMouseDown={onClose}><form className={styles.metricDialog} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(target.date))}</span><button type="button" onClick={onClose}>×</button></div><h2>{target.item.name}</h2><label>Değer<div><input type="number" step="any" required value={value} onChange={(event) => setValue(event.target.value)} autoFocus /><span>{target.item.metric_unit}</span></div></label><label>Not<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="İsteğe bağlı" /></label><button className={styles.primary} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></form></div>;
}
