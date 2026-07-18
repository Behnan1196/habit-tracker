'use client';

import type { User } from '@supabase/supabase-js';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ItemKind, PlanStatus } from '@/types/domain';
import { ItemEditorModal, type EditableGroup, type EditableItem, type ReminderDraft } from './item-editor-modal';
import type { CalendarView } from './app-menu';
import { BottomNav } from './bottom-nav';
import { TodoModule, type TodoDraft, type TodoListRow, type TodoTaskRow } from './todo-module';
import { MarkdownContent } from './markdown-content';
import styles from './planner-shell.module.css';

type GroupRow = { id: string; parent_id: string | null; name: string; color: string | null; background_color: string | null; position: number; content_type: 'standard' | 'module'; default_item_kind: ItemKind | null; default_time_slot_id: string | null; module_key: string | null; module_settings: Record<string, unknown>; is_in_plan: boolean };
type ItemRow = EditableItem & { position: number };
type SlotRow = { id: string; name: string; start_time: string | null; end_time: string | null; color: string | null; position: number; is_active: boolean };
type AssignmentRow = { id: string; item_id: string; time_slot_id: string; plan_date: string; status: PlanStatus; actual_duration_minutes: number | null; schedule_id?: string | null; source?: 'daily' | 'persistent' };
type PersistentRow = { item_id: string; status: PlanStatus; time_slot_id: string | null };
type MetricRow = { id: string; item_id: string; entry_date: string; value: number; note: string | null };
type NoteRow = { id: string; group_id: string; title: string; body: string; is_pinned: boolean; created_at: string; updated_at: string };
type ReminderRow = ReminderDraft & { id: string; item_id: string };
type AgendaBlockRow = { id: string; time_slot_id: string; name: string; position: number; agenda_position: number };
type ScheduleRow = { id: string; item_id: string; time_slot_id: string; block_id: string | null; recurrence_type: 'once' | 'daily' | 'weekdays'; weekdays: number[]; start_date: string; end_date: string | null; is_active: boolean; reminder_time: string | null; scheduled_time: string | null; agenda_position: number };
type ScheduleDraft = { id?: string; time_slot_id: string; block_id: string | null; recurrence_type: 'once' | 'daily' | 'weekdays'; weekdays: number[]; start_date: string; reminder_time: string | null; scheduled_time: string | null; agenda_position: number };
type AgendaOrderRow = { key: string; kind: 'activity' | 'todo'; blockId: string | null; scheduledTime: string | null; position: number; schedule?: ScheduleRow; task?: TodoTaskRow };

const palette = ['#395f47', '#638169', '#667e99', '#8d76a4', '#ad765e', '#b18a4f'];
const vapidPublicKey = 'BHTVKlF2QiaWSkc4d6yenfMWXKnryir4Yt9wvuGkQRpSGsIhOPTPcaDpbTPt32Er2bZDo1sLySfhK_dkE4QCE8Y';

function pushKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

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
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [agendaBlocks, setAgendaBlocks] = useState<AgendaBlockRow[]>([]);
  const [scheduleTarget, setScheduleTarget] = useState<ItemRow | null>(null);
  const [preferredSlotId, setPreferredSlotId] = useState<string | null>(null);
  const [preferredBlockId, setPreferredBlockId] = useState<string | null>(null);
  const [agendaAddTarget, setAgendaAddTarget] = useState<{ slot: SlotRow; date: string } | null>(null);
  const [libraryAddTarget, setLibraryAddTarget] = useState<GroupRow | null>(null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(() => new Set());
  const collapsedBlocksLoaded = useRef(false);
  const [collapsedLibraryGroups, setCollapsedLibraryGroups] = useState<Set<string>>(() => new Set());
  const collapsedLibraryGroupsLoaded = useRef(false);
  const [todoLists, setTodoLists] = useState<TodoListRow[]>([]);
  const [todoTasks, setTodoTasks] = useState<TodoTaskRow[]>([]);
  const [activeModule, setActiveModule] = useState<'todo' | 'metrics' | null>(null);
  const todoInboxChecked = useRef(false);
  const [planTarget, setPlanTarget] = useState<{ item: ItemRow; date: string } | null>(null);
  const [persistentTarget, setPersistentTarget] = useState<ItemRow | null>(null);
  const [metricTarget, setMetricTarget] = useState<{ item: ItemRow; date: string; entry?: MetricRow } | null>(null);
  const [editor, setEditor] = useState<{ item?: ItemRow; group?: GroupRow; groupId: string | null; initialKind?: ItemKind | 'group'; initialIsInPlan?: boolean } | null>(null);
  const [focusSnapshot, setFocusSnapshot] = useState<AssignmentRow[] | null>(null);
  const [durationTarget, setDurationTarget] = useState<AssignmentRow | null>(null);
  const [slotManagerOpen, setSlotManagerOpen] = useState(false);
  const [noteEditor, setNoteEditor] = useState<{ groupId: string; note?: NoteRow } | null>(null);
  const [groupPlanTarget, setGroupPlanTarget] = useState<GroupRow | null>(null);
  const [agendaItemTarget, setAgendaItemTarget] = useState<ItemRow | null>(null);
  const [workspace, setWorkspace] = useState<'agenda' | 'library' | 'modules' | 'settings'>('agenda');
  const [agendaMode, setAgendaMode] = useState<'focus' | 'agenda'>('focus');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const visibleDates = view === 'daily' ? [parseDate(selectedDate)] : weekDates;
  const weekEnd = isoDate(weekDates[6]);
  const weekStartKey = isoDate(weekStart);

  const loadData = useCallback(async () => {
    const [groupResult, itemResult, slotResult, assignmentResult, persistentResult, metricResult, noteResult, reminderResult, scheduleResult, blockResult, todoListResult, todoTaskResult] = await Promise.all([
      supabase.from('m_groups').select('id,parent_id,name,color,background_color,position,content_type,default_item_kind,default_time_slot_id,module_key,module_settings,is_in_plan').order('position'),
      supabase.from('m_items').select('id,group_id,kind,name,description,color,metric_unit,metric_period,activity_tag,activity_tags,estimated_minutes,is_in_plan,position').eq('is_active', true).order('position'),
      supabase.from('m_time_slots').select('id,name,start_time,end_time,color,position,is_active').order('position'),
      supabase.from('m_daily_assignments').select('id,item_id,time_slot_id,plan_date,status,actual_duration_minutes,schedule_id').gte('plan_date', weekStartKey).lte('plan_date', weekEnd),
      supabase.from('m_persistent_states').select('item_id,status,time_slot_id').neq('status', 'cancelled'),
      supabase.from('m_metric_entries').select('id,item_id,entry_date,value,note').gte('entry_date', weekStartKey).lte('entry_date', weekEnd),
      supabase.from('m_notes').select('id,group_id,title,body,is_pinned,created_at,updated_at').order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }),
      supabase.from('m_reminders').select('id,item_id,reminder_time,weekdays,is_enabled').order('reminder_time'),
      supabase.from('m_agenda_schedules').select('id,item_id,time_slot_id,block_id,recurrence_type,weekdays,start_date,end_date,is_active,reminder_time,scheduled_time,agenda_position').order('created_at'),
      supabase.from('m_agenda_blocks').select('id,time_slot_id,name,position,agenda_position').order('agenda_position'),
      supabase.from('m_todo_lists').select('id,name,color,position').order('position'),
      supabase.from('m_todo_tasks').select('id,list_id,title,description,status,priority,agenda_date,time_slot_id,reminder_time,scheduled_time,agenda_position,position').order('position'),
    ]);
    const results = [groupResult, itemResult, slotResult, assignmentResult, persistentResult, metricResult, noteResult, reminderResult, scheduleResult, blockResult, todoListResult, todoTaskResult];
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setGroups((groupResult.data ?? []) as GroupRow[]); setItems((itemResult.data ?? []) as ItemRow[]);
      setSlots((slotResult.data ?? []) as SlotRow[]); setAssignments((assignmentResult.data ?? []) as AssignmentRow[]);
      setPersistent((persistentResult.data ?? []) as PersistentRow[]); setMetrics((metricResult.data ?? []) as MetricRow[]);
      setNotes((noteResult.data ?? []) as NoteRow[]);
      setReminders((reminderResult.data ?? []) as ReminderRow[]);
      setSchedules((scheduleResult.data ?? []) as ScheduleRow[]);
      setAgendaBlocks((blockResult.data ?? []) as AgendaBlockRow[]);
      setTodoLists((todoListResult.data ?? []) as TodoListRow[]);
      setTodoTasks((todoTaskResult.data ?? []) as TodoTaskRow[]);
    }
    setLoading(false);
  }, [supabase, weekEnd, weekStartKey]);

  useEffect(() => {
    const activeSchedules = schedules.filter((schedule) => schedule.is_active);
    if (!activeSchedules.length) return;
    const dates = weekDates.map((date) => ({ date, key: isoDate(date) }));
    const existing = new Set(assignments.map((entry) => `${entry.item_id}:${entry.time_slot_id}:${entry.plan_date}`));
    const candidates = activeSchedules.flatMap((schedule) => dates.filter(({ date, key }) => {
      if (key < schedule.start_date || (schedule.end_date && key > schedule.end_date)) return false;
      if (schedule.recurrence_type === 'once') return key === schedule.start_date;
      if (schedule.recurrence_type === 'weekdays') return schedule.weekdays.includes(date.getDay());
      return true;
    }).map(({ key }) => ({ user_id: user.id, item_id: schedule.item_id, time_slot_id: schedule.time_slot_id, schedule_id: schedule.id, plan_date: key, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null })).filter((row) => !existing.has(`${row.item_id}:${row.time_slot_id}:${row.plan_date}`)));
    const rows = Array.from(new Map(candidates.map((row) => [`${row.item_id}:${row.time_slot_id}:${row.plan_date}`, row])).values());
    if (rows.length) void supabase.from('m_daily_assignments').upsert(rows, { onConflict: 'user_id,item_id,time_slot_id,plan_date' }).then(({ error: materializeError }) => materializeError ? setError(materializeError.message) : loadData());
  }, [assignments, loadData, schedules, supabase, user.id, weekDates]);

  useEffect(() => {
    if (loading || todoInboxChecked.current) return;
    todoInboxChecked.current = true;
    if (!todoLists.length) void supabase.from('m_todo_lists').insert({ user_id: user.id, name: 'Gelen Kutusu', color: palette[0], position: 0 }).then(({ error: inboxError }) => inboxError ? setError(inboxError.message) : loadData());
  }, [loadData, loading, supabase, todoLists.length, user.id]);

  useEffect(() => {
    void supabase.from('m_profiles').upsert({ id: user.id, display_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null }, { onConflict: 'id' });
    queueMicrotask(() => void loadData());
  }, [loadData, supabase, user]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get('view') === 'weekly') queueMicrotask(() => setView('weekly'));
    const surface = parameters.get('surface');
    if (surface === 'library' || surface === 'modules' || surface === 'settings') queueMicrotask(() => setWorkspace(surface));
    if ('Notification' in window) queueMicrotask(() => setNotificationPermission(Notification.permission));
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(`momentum-collapsed-blocks:${user.id}`);
    queueMicrotask(() => { if (stored) { try { setCollapsedBlocks(new Set(JSON.parse(stored) as string[])); } catch { /* Ignore invalid legacy state. */ } } collapsedBlocksLoaded.current = true; });
  }, [user.id]);

  useEffect(() => {
    if (collapsedBlocksLoaded.current) window.localStorage.setItem(`momentum-collapsed-blocks:${user.id}`, JSON.stringify([...collapsedBlocks]));
  }, [collapsedBlocks, user.id]);

  useEffect(() => {
    const stored = window.localStorage.getItem(`momentum-collapsed-library-groups:${user.id}`);
    queueMicrotask(() => { if (stored) { try { setCollapsedLibraryGroups(new Set(JSON.parse(stored) as string[])); } catch { /* Ignore invalid legacy state. */ } } collapsedLibraryGroupsLoaded.current = true; });
  }, [user.id]);

  useEffect(() => {
    if (collapsedLibraryGroupsLoaded.current) window.localStorage.setItem(`momentum-collapsed-library-groups:${user.id}`, JSON.stringify([...collapsedLibraryGroups]));
  }, [collapsedLibraryGroups, user.id]);

  async function enableNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { setNotificationPermission('unsupported'); return; }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKey(vapidPublicKey) });
    const json = subscription.toJSON();
    const result = await supabase.from('m_push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    }, { onConflict: 'endpoint' });
    if (result.error) setError(result.error.message);
  }

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
  const fixedPlanned = persistent.filter((entry) => entry.status === 'planned' && entry.time_slot_id);
  const focusPlannedCount = selectedPlanned.length + fixedPlanned.length + todoTasks.filter((task) => task.agenda_date === selectedDate && task.status === 'pending').length;
  const activeSlots = slots.filter((slot) => slot.is_active);

  function defaultKindForGroup(groupId: string | null): ItemKind {
    let current = groupId ? groups.find((group) => group.id === groupId) : undefined;
    while (current) {
      if (current.content_type === 'standard' && current.default_item_kind) return current.default_item_kind;
      current = current.parent_id ? groups.find((group) => group.id === current!.parent_id) : undefined;
    }
    return 'daily';
  }

  function defaultSlotForGroup(groupId: string | null): SlotRow | undefined {
    let current = groupId ? groups.find((group) => group.id === groupId) : undefined;
    while (current) {
      if (current.default_time_slot_id) return activeSlots.find((slot) => slot.id === current!.default_time_slot_id);
      current = current.parent_id ? groups.find((group) => group.id === current!.parent_id) : undefined;
    }
    return activeSlots[0];
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

  async function replaceReminders(itemId: string, drafts: ReminderDraft[]) {
    const removed = await supabase.from('m_reminders').delete().eq('item_id', itemId);
    if (removed.error) return removed.error;
    const uniqueDrafts = Array.from(new Map(drafts.filter((draft) => draft.reminder_time && draft.weekdays.length).map((draft) => [draft.reminder_time, draft])).values());
    if (!uniqueDrafts.length) return null;
    const inserted = await supabase.from('m_reminders').insert(uniqueDrafts.map((draft) => ({ ...draft, reminder_time: draft.reminder_time, item_id: itemId, user_id: user.id })));
    return inserted.error;
  }

  async function saveItem(draft: Omit<EditableItem, 'id'>, reminderDrafts: ReminderDraft[]) {
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
      const reminderError = await replaceReminders(created.data.id, reminderDrafts);
      if (reminderError) return setError(reminderError.message);
      setEditor(null); await loadData(); return;
    }
    const result = editor?.item ? await supabase.from('m_items').update(draft).eq('id', editor.item.id).select('id').single() : await supabase.from('m_items').insert({ ...draft, user_id: user.id, position: items.length }).select('id').single();
    if (result.error) setError(result.error.message); else {
      const reminderError = await replaceReminders(result.data.id, reminderDrafts);
      if (reminderError) setError(reminderError.message); else { setEditor(null); await loadData(); }
    }
  }

  async function saveGroup(draft: Omit<EditableGroup, 'id'>) {
    if (editor?.group && editor.group.content_type === 'standard' && draft.content_type === 'module') {
      const hasContents = items.some((item) => item.group_id === editor.group!.id) || groups.some((group) => group.parent_id === editor.group!.id);
      if (hasContents) { const message = 'Notlar modülüne dönüştürmek için grubun item ve alt gruplarını önce taşımalısın.'; window.alert(message); setError(message); return; }
    }
    if (editor?.group && editor.group.content_type === 'module' && draft.content_type === 'standard' && notes.some((note) => note.group_id === editor.group!.id)) {
      const message = 'Standart gruba dönüştürmeden önce bu modüldeki notları silmelisin.'; window.alert(message); setError(message); return;
    }
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

  async function saveNote(draft: { title: string; body: string; is_pinned: boolean }) {
    if (!noteEditor) return false;
    const values = { ...draft, group_id: noteEditor.groupId };
    const result = noteEditor.note
      ? await supabase.from('m_notes').update(values).eq('id', noteEditor.note.id)
      : await supabase.from('m_notes').insert({ ...values, user_id: user.id });
    if (result.error) { setError(result.error.message); return false; }
    setNoteEditor(null); await loadData(); return true;
  }

  async function deleteNote(note: NoteRow) {
    if (!window.confirm(`“${note.title}” notu silinsin mi?`)) return false;
    const result = await supabase.from('m_notes').delete().eq('id', note.id);
    if (result.error) { setError(result.error.message); return false; }
    setNoteEditor(null); await loadData(); return true;
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

  async function completeAssignment(entry: AssignmentRow, actualMinutes?: number) {
    const table = entry.source === 'persistent' ? 'm_persistent_states' : 'm_daily_assignments';
    const key = entry.source === 'persistent' ? 'item_id' : 'id';
    const value = entry.source === 'persistent' ? entry.item_id : entry.id;
    const completion = entry.source === 'persistent' ? { status: 'done', completed_at: new Date().toISOString(), cancelled_at: null } : { status: 'done', completed_at: new Date().toISOString(), cancelled_at: null, actual_duration_minutes: actualMinutes ?? null };
    const { error: updateError } = await supabase.from(table).update(completion).eq(key, value);
    if (updateError) return setError(updateError.message);
    setFocusSnapshot((current) => current?.map((candidate) => candidate.id === entry.id ? { ...candidate, status: 'done', actual_duration_minutes: actualMinutes ?? candidate.actual_duration_minutes } : candidate) ?? null);
    if (entry.source === 'persistent') setPersistent((current) => current.map((state) => state.item_id === entry.item_id ? { ...state, status: 'done' } : state));
    else setAssignments((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, status: 'done', actual_duration_minutes: actualMinutes ?? null } : candidate));
  }

  async function restoreAssignment(entry: AssignmentRow) {
    const table = entry.source === 'persistent' ? 'm_persistent_states' : 'm_daily_assignments';
    const key = entry.source === 'persistent' ? 'item_id' : 'id';
    const value = entry.source === 'persistent' ? entry.item_id : entry.id;
    const { error: updateError } = await supabase.from(table).update({ status: 'planned', completed_at: null, cancelled_at: null }).eq(key, value);
    if (updateError) return setError(updateError.message);
    setFocusSnapshot((current) => current?.map((candidate) => candidate.id === entry.id ? { ...candidate, status: 'planned' } : candidate) ?? null);
    if (entry.source === 'persistent') setPersistent((current) => current.map((state) => state.item_id === entry.item_id ? { ...state, status: 'planned' } : state));
    else setAssignments((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, status: 'planned' } : candidate));
  }

  async function cancelAssignment(entry: AssignmentRow) {
    const table = entry.source === 'persistent' ? 'm_persistent_states' : 'm_daily_assignments';
    const key = entry.source === 'persistent' ? 'item_id' : 'id';
    const value = entry.source === 'persistent' ? entry.item_id : entry.id;
    const { error: updateError } = await supabase.from(table).update({ status: 'cancelled', completed_at: null, cancelled_at: new Date().toISOString(), ...(entry.source === 'daily' ? { actual_duration_minutes: null } : {}) }).eq(key, value);
    if (updateError) return setError(updateError.message);
    setFocusSnapshot((current) => current?.filter((candidate) => candidate.id !== entry.id) ?? null);
    await loadData();
  }

  async function quickPlan(item: ItemRow, date: string) {
    const slot = defaultSlotForGroup(item.group_id);
    if (!slot) { setPlanTarget({ item, date }); return; }
    const result = await supabase.from('m_daily_assignments').upsert({ user_id: user.id, item_id: item.id, time_slot_id: slot.id, plan_date: date, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null }, { onConflict: 'user_id,item_id,time_slot_id,plan_date' });
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function quickPlanPersistent(item: ItemRow) {
    const slot = defaultSlotForGroup(item.group_id);
    if (!slot) { setPersistentTarget(item); return; }
    const result = await supabase.from('m_persistent_states').upsert({ item_id: item.id, user_id: user.id, time_slot_id: slot.id, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null }, { onConflict: 'item_id' });
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function setPersistentSlot(slotId: string) {
    if (!persistentTarget) return;
    const current = persistent.find((state) => state.item_id === persistentTarget.id);
    const now = new Date().toISOString();
    const cancelling = current?.status === 'planned' && current.time_slot_id === slotId;
    const result = await supabase.from('m_persistent_states').upsert({ item_id: persistentTarget.id, user_id: user.id, time_slot_id: slotId, status: cancelling ? 'cancelled' : 'planned', planned_at: now, completed_at: null, cancelled_at: cancelling ? now : null });
    if (result.error) setError(result.error.message); else await loadData();
  }

  function plannableItemsForGroup(groupId: string): ItemRow[] {
    const groupIds = new Set<string>([groupId]);
    let added = true;
    while (added) {
      added = false;
      groups.forEach((group) => {
        if (group.content_type === 'standard' && group.parent_id && groupIds.has(group.parent_id) && !groupIds.has(group.id)) { groupIds.add(group.id); added = true; }
      });
    }
    return items.filter((item) => item.group_id && groupIds.has(item.group_id) && item.kind !== 'metric' && item.is_in_plan);
  }

  async function planGroup(group: GroupRow, slotId: string) {
    const candidates = plannableItemsForGroup(group.id);
    const now = new Date().toISOString();
    const daily = candidates.filter((item) => item.kind === 'daily').map((item) => ({ user_id: user.id, item_id: item.id, time_slot_id: slotId, plan_date: selectedDate, status: 'planned', planned_at: now, completed_at: null, cancelled_at: null }));
    const fixed = candidates.filter((item) => item.kind === 'persistent').map((item) => ({ user_id: user.id, item_id: item.id, time_slot_id: slotId, status: 'planned', planned_at: now, completed_at: null, cancelled_at: null }));
    const [dailyResult, fixedResult] = await Promise.all([
      daily.length ? supabase.from('m_daily_assignments').upsert(daily, { onConflict: 'user_id,item_id,time_slot_id,plan_date' }) : Promise.resolve({ error: null }),
      fixed.length ? supabase.from('m_persistent_states').upsert(fixed, { onConflict: 'item_id' }) : Promise.resolve({ error: null }),
    ]);
    const planError = dailyResult.error ?? fixedResult.error;
    if (planError) { setError(planError.message); return false; }
    setGroupPlanTarget(null); await loadData(); return true;
  }

  async function saveMetric(value: number, note: string) {
    if (!metricTarget) return;
    const { error: upsertError } = await supabase.from('m_metric_entries').upsert({ user_id: user.id, item_id: metricTarget.item.id, entry_date: metricTarget.date, value, note: note.trim() || null }, { onConflict: 'user_id,item_id,entry_date' });
    if (upsertError) setError(upsertError.message); else { setMetricTarget(null); await loadData(); }
  }

  async function moveItem(itemId: string, groupId: string | null) {
    if (!itemId) return;
    if (!groupId) { setError('Kütüphane kayıtlarının bir gruba ait olması gerekir.'); return; }
    const position = items.filter((item) => item.group_id === groupId && item.id !== itemId).length;
    const { error: updateError } = await supabase.from('m_items').update({ group_id: groupId, position }).eq('id', itemId);
    if (updateError) setError(updateError.message); else await loadData();
  }

  async function moveGroup(groupId: string, parentId: string | null) {
    if (!groupId || groupId === parentId) return;
    let current = parentId ? groups.find((group) => group.id === parentId) : undefined;
    while (current) {
      if (current.id === groupId) return;
      current = current.parent_id ? groups.find((group) => group.id === current!.parent_id) : undefined;
    }
    const position = groups.filter((group) => group.parent_id === parentId && group.id !== groupId).length;
    const result = await supabase.from('m_groups').update({ parent_id: parentId, position }).eq('id', groupId);
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function moveBefore(kind: 'item' | 'group', movingId: string, targetId: string) {
    if (!movingId || movingId === targetId) return;
    if (kind === 'item') {
      const target = items.find((item) => item.id === targetId);
      if (!target) return;
      const siblings = items.filter((item) => item.group_id === target.group_id && item.id !== movingId).sort((a, b) => a.position - b.position);
      const targetIndex = siblings.findIndex((item) => item.id === targetId);
      const ordered = [...siblings.slice(0, targetIndex), items.find((item) => item.id === movingId)!, ...siblings.slice(targetIndex)].filter(Boolean);
      const results = await Promise.all(ordered.map((item, position) => supabase.from('m_items').update({ group_id: target.group_id, position }).eq('id', item.id)));
      const failed = results.find((result) => result.error)?.error;
      if (failed) setError(failed.message); else await loadData();
      return;
    }
    const target = groups.find((group) => group.id === targetId);
    if (!target) return;
    const moving = groups.find((group) => group.id === movingId);
    if (!moving) return;
    let current = target.parent_id ? groups.find((group) => group.id === target.parent_id) : undefined;
    while (current) {
      if (current.id === movingId) return;
      current = current.parent_id ? groups.find((group) => group.id === current!.parent_id) : undefined;
    }
    const siblings = groups.filter((group) => group.parent_id === target.parent_id && group.id !== movingId).sort((a, b) => a.position - b.position);
    const targetIndex = siblings.findIndex((group) => group.id === targetId);
    const ordered = [...siblings.slice(0, targetIndex), moving, ...siblings.slice(targetIndex)];
    const results = await Promise.all(ordered.map((group, position) => supabase.from('m_groups').update({ parent_id: target.parent_id, position }).eq('id', group.id)));
    const failed = results.find((result) => result.error)?.error;
    if (failed) setError(failed.message); else await loadData();
  }

  async function saveSchedule(draft: ScheduleDraft) {
    if (!scheduleTarget) return false;
    const { id, ...values } = draft;
    if (!id) {
      if (preferredBlockId && agendaBlocks.some((block) => block.id === preferredBlockId && block.time_slot_id === values.time_slot_id)) values.block_id = preferredBlockId;
      const positions = [...schedules.filter((schedule) => schedule.time_slot_id === values.time_slot_id).map((schedule) => schedule.agenda_position), ...todoTasks.filter((task) => task.time_slot_id === values.time_slot_id).map((task) => task.agenda_position)];
      values.agenda_position = (positions.length ? Math.max(...positions) : -1) + 1;
    }
    const previous = id ? schedules.find((schedule) => schedule.id === id) : undefined;
    const mutate = () => id ? supabase.from('m_agenda_schedules').update(values).eq('id', id) : supabase.from('m_agenda_schedules').insert({ ...values, item_id: scheduleTarget.id, user_id: user.id, is_active: true });
    let result = await mutate();
    if (result.error?.message.toLocaleLowerCase('tr').includes('failed to fetch')) result = await mutate();
    if (result.error) { setError(result.error.message.includes('Failed to fetch') ? 'Program kaydedilemedi. Bağlantını kontrol edip yeniden dene.' : result.error.message); return false; }
    if (!id) {
      const clearedExceptions = await supabase.from('m_daily_assignments').delete().eq('item_id', scheduleTarget.id).eq('time_slot_id', values.time_slot_id).gte('plan_date', values.start_date).eq('status', 'cancelled');
      if (clearedExceptions.error) { setError(clearedExceptions.error.message); return false; }
    }
    if (previous) await supabase.from('m_daily_assignments').delete().eq('item_id', previous.item_id).eq('time_slot_id', previous.time_slot_id).gte('plan_date', isoDate(new Date())).eq('status', 'planned');
    await loadData(); return true;
  }

  async function createAgendaBlock(slot: SlotRow) {
    const name = window.prompt(`${slot.name} için blok adı`);
    if (!name?.trim()) return;
    const slotBlocks = agendaBlocks.filter((block) => block.time_slot_id === slot.id);
    const positions = [...schedules.filter((schedule) => schedule.time_slot_id === slot.id).map((schedule) => schedule.agenda_position), ...todoTasks.filter((task) => task.time_slot_id === slot.id).map((task) => task.agenda_position), ...slotBlocks.map((block) => block.agenda_position)];
    const position = slotBlocks.length; const agenda_position = (positions.length ? Math.max(...positions) : -1) + 1;
    const result = await supabase.from('m_agenda_blocks').insert({ user_id: user.id, time_slot_id: slot.id, name: name.trim(), position, agenda_position });
    if (result.error) setError(result.error.message); else { setAgendaAddTarget(null); await loadData(); }
  }

  function closeScheduleTarget() {
    const returnToAgenda = preferredSlotId !== null;
    setScheduleTarget(null); setPreferredSlotId(null); setPreferredBlockId(null);
    if (returnToAgenda) { setWorkspace('agenda'); window.history.replaceState(null, '', '/'); }
  }

  async function toggleSchedule(schedule: ScheduleRow) {
    const mutate = () => supabase.from('m_agenda_schedules').update({ is_active: !schedule.is_active }).eq('id', schedule.id);
    let result = await mutate();
    if (result.error?.message.toLocaleLowerCase('tr').includes('failed to fetch')) result = await mutate();
    if (result.error) setError(result.error.message); else {
      if (schedule.is_active) await supabase.from('m_daily_assignments').delete().eq('item_id', schedule.item_id).eq('time_slot_id', schedule.time_slot_id).gte('plan_date', isoDate(new Date())).eq('status', 'planned');
      await loadData();
    }
  }

  async function deleteSchedule(schedule: ScheduleRow) {
    if (!window.confirm('Bu tekrar programı kaldırılsın mı? Bugünkü ve gelecekteki planlı kayıtlar kaldırılır; tamamlanmış geçmiş korunur. Aktivite Kütüphanede kalır.')) return;
    const today = isoDate(new Date());
    const linkedPlanned = await supabase.from('m_daily_assignments').delete().eq('schedule_id', schedule.id).gte('plan_date', today).eq('status', 'planned');
    if (linkedPlanned.error) return setError(linkedPlanned.error.message);
    const detachedHistory = await supabase.from('m_daily_assignments').update({ schedule_id: null }).eq('schedule_id', schedule.id);
    if (detachedHistory.error) return setError(detachedHistory.error.message);
    const mutate = () => supabase.from('m_agenda_schedules').delete().eq('id', schedule.id);
    let result = await mutate();
    if (result.error?.message.toLocaleLowerCase('tr').includes('failed to fetch')) result = await mutate();
    if (result.error) setError(result.error.message); else { await supabase.from('m_daily_assignments').delete().eq('item_id', schedule.item_id).eq('time_slot_id', schedule.time_slot_id).is('schedule_id', null).gte('plan_date', today).eq('status', 'planned'); await loadData(); }
  }

  async function addTodoList(name: string) {
    const result = await supabase.from('m_todo_lists').insert({ user_id: user.id, name, color: palette[todoLists.length % palette.length], position: todoLists.length });
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function saveTodo(draft: TodoDraft, task?: TodoTaskRow) {
    const result = task ? await supabase.from('m_todo_tasks').update(draft).eq('id', task.id) : await supabase.from('m_todo_tasks').insert({ ...draft, user_id: user.id, position: todoTasks.length, status: 'pending' });
    if (result.error) { setError(result.error.message); return false; }
    await loadData(); return true;
  }

  async function toggleTodo(task: TodoTaskRow) {
    const done = task.status !== 'done';
    const result = await supabase.from('m_todo_tasks').update({ status: done ? 'done' : 'pending', completed_at: done ? new Date().toISOString() : null }).eq('id', task.id);
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function deleteTodo(task: TodoTaskRow) {
    if (!window.confirm('Bu görev silinsin mi?')) return;
    const result = await supabase.from('m_todo_tasks').delete().eq('id', task.id);
    if (result.error) setError(result.error.message); else await loadData();
  }

  async function saveAgendaOrder(rows: AgendaOrderRow[]) {
    const results = await Promise.all(rows.map((row, agenda_position) => row.kind === 'activity' && row.schedule
      ? supabase.from('m_agenda_schedules').update({ agenda_position, block_id: row.blockId }).eq('id', row.schedule.id)
      : row.task ? supabase.from('m_todo_tasks').update({ agenda_position }).eq('id', row.task.id) : Promise.resolve({ error: null })));
    const failed = results.find((result) => result.error)?.error;
    if (failed) setError(failed.message); else await loadData();
  }

  function dropAgendaRow(rows: AgendaOrderRow[], movingKey: string, targetKey: string) {
    const from = rows.findIndex((row) => row.key === movingKey);
    const to = rows.findIndex((row) => row.key === targetKey);
    if (from < 0 || to < 0 || from === to) return;
    if ((rows[from].scheduledTime ?? '') !== (rows[to].scheduledTime ?? '')) {
      setError('Kesin saatli kayıtlar yalnız aynı saat içindeki kayıtlarla sıralanabilir.');
      return;
    }
    const targetBlockId = rows[to].blockId;
    const moving = { ...rows[from], blockId: targetBlockId };
    if (moving.kind === 'todo' && targetBlockId) { setError('Todo kayıtlarını bloklara taşıma desteği sonraki modül bağlantısında eklenecek.'); return; }
    const sourceRows = rows.filter((row) => row.key !== movingKey && row.blockId === rows[from].blockId);
    const destinationRows = rows.filter((row) => row.key !== movingKey && row.blockId === targetBlockId);
    const targetIndex = destinationRows.findIndex((row) => row.key === targetKey);
    destinationRows.splice(targetIndex < 0 ? destinationRows.length : targetIndex, 0, moving);
    void saveAgendaOrder([...sourceRows, ...destinationRows]);
  }

  function moveAgendaToBlock(rows: AgendaOrderRow[], movingKey: string, blockId: string | null) {
    const moving = rows.find((row) => row.key === movingKey);
    if (!moving || moving.blockId === blockId) return;
    if (moving.kind === 'todo' && blockId) { setError('Todo kayıtlarını bloklara taşıma desteği sonraki modül bağlantısında eklenecek.'); return; }
    const sourceRows = rows.filter((row) => row.key !== movingKey && row.blockId === moving.blockId);
    const destinationRows = rows.filter((row) => row.blockId === blockId);
    void saveAgendaOrder([...sourceRows, ...destinationRows, { ...moving, blockId }]);
  }

  async function moveAgendaNodeBefore(nodes: Array<{ key: string; position: number; row?: AgendaOrderRow; block?: AgendaBlockRow }>, movingKey: string, targetKey: string) {
    if (!movingKey || movingKey === targetKey) return;
    const from = nodes.findIndex((node) => node.key === movingKey); const to = nodes.findIndex((node) => node.key === targetKey);
    if (from < 0 || to < 0) return;
    const ordered = [...nodes]; const [moving] = ordered.splice(from, 1); ordered.splice(to, 0, moving);
    const results = await Promise.all(ordered.map((node, agenda_position) => node.block
      ? supabase.from('m_agenda_blocks').update({ agenda_position }).eq('id', node.block.id)
      : node.row?.kind === 'activity' && node.row.schedule
        ? supabase.from('m_agenda_schedules').update({ agenda_position }).eq('id', node.row.schedule.id)
        : node.row?.task ? supabase.from('m_todo_tasks').update({ agenda_position }).eq('id', node.row.task.id) : Promise.resolve({ error: null })));
    const failed = results.find((result) => result.error)?.error;
    if (failed) setError(failed.message); else await loadData();
  }

  function renderLibraryItem(item: ItemRow, depth = 0) {
    const hasReminder = reminders.some((reminder) => reminder.item_id === item.id && reminder.is_enabled);
    return <div className={styles.libraryRow} key={item.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/library-kind', 'item'); event.dataTransfer.setData('text/library-id', item.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); if (event.dataTransfer.getData('text/library-kind') === 'item') void moveBefore('item', event.dataTransfer.getData('text/library-id'), item.id); }}>
      <button className={styles.libraryItemIdentity} style={{ paddingLeft: 8 + Math.min(depth * 12, 36) }} onClick={() => setEditor({ item, groupId: item.group_id })}><span className={styles.libraryDrag}>⠿</span><i style={{ background: item.color ?? palette[0] }} /><span><strong>{item.name}</strong><small>{item.kind === 'metric' ? `Ölçüm${item.metric_unit ? ` · ${item.metric_unit}` : ''}` : item.activity_tag || (item.kind === 'persistent' ? 'Geçici' : 'Aktivite')}{item.estimated_minutes ? ` · ${item.estimated_minutes} dk` : ''}{hasReminder ? ' · 🔔' : ''}</small></span></button>
      <div className={styles.libraryRowActions}>{item.kind !== 'metric' && <button className={schedules.some((schedule) => schedule.item_id === item.id) ? styles.libraryInPlan : ''} onClick={() => setScheduleTarget(item)}>{schedules.some((schedule) => schedule.item_id === item.id) ? 'Programlı ✓' : 'Ajandaya ekle'}</button>}</div>
    </div>;
  }

  function renderLibraryGroup(group: GroupRow, depth = 0): React.ReactNode {
    const groupItems = items.filter((item) => item.group_id === group.id && item.kind !== 'metric').sort((a, b) => a.position - b.position);
    const children = groups.filter((candidate) => candidate.parent_id === group.id).sort((a, b) => a.position - b.position);
    const collapsed = collapsedLibraryGroups.has(group.id);
    return <section className={styles.libraryGroup} key={group.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/library-kind', 'group'); event.dataTransfer.setData('text/library-id', group.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const kind = event.dataTransfer.getData('text/library-kind'); const id = event.dataTransfer.getData('text/library-id'); if (kind === 'item') void moveItem(id, group.id); else if (kind === 'group') void moveGroup(id, group.id); }}>
      <header style={{ paddingLeft: 10 + Math.min(depth * 12, 36), background: group.background_color ?? '#f4f5f1', color: readableText(group.background_color ?? '#f4f5f1') }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const kind = event.dataTransfer.getData('text/library-kind'); const id = event.dataTransfer.getData('text/library-id'); if (kind === 'group') void moveBefore('group', id, group.id); else if (kind === 'item') void moveItem(id, group.id); }}><span className={styles.libraryDrag}>⠿</span><button className={styles.libraryCollapse} aria-label={collapsed ? `${group.name} grubunu aç` : `${group.name} grubunu daralt`} onClick={() => setCollapsedLibraryGroups((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}>{collapsed ? '›' : '⌄'}</button><i style={{ background: group.color ?? palette[0] }} /><button className={styles.groupTitle} onClick={() => void editGroup(group)}>{group.name}</button><small>{groupItems.length + children.length}</small><div><button title="Gruba ekle" onClick={() => setLibraryAddTarget(group)}>＋</button></div></header>
      {!collapsed && <>{groupItems.map((item) => renderLibraryItem(item, depth + 1))}{children.map((child) => renderLibraryGroup(child, depth + 1))}</>}
    </section>;
  }

  function renderItem(item: ItemRow, depth = 0) {
    const persistentState = persistent.find((state) => state.item_id === item.id);
    const persistentStatus = persistentState?.status;
    return <div className={`${styles.calendarRow} ${item.kind === 'persistent' ? styles.persistentRow : ''}`} key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/item-id', item.id)}>
      <div className={styles.itemIdentity} style={{ paddingLeft: 5 + Math.min(depth * 12, 36) }}><span className={styles.drag}>⠿</span><i style={{ background: item.color ?? palette[0] }} /><button onClick={() => setAgendaItemTarget(item)}><strong>{item.name}</strong><small>{item.kind === 'metric' ? `Ölçüm${item.metric_unit ? ` · ${item.metric_unit}` : ''}` : item.kind === 'persistent' ? 'Geçici · ileride modüle taşınabilir' : `${item.activity_tag || 'Aktivite'}${item.estimated_minutes ? ` · ${item.estimated_minutes} dk` : ''}`}{reminders.some((reminder) => reminder.item_id === item.id && reminder.is_enabled) ? ' · 🔔' : ''}</small></button></div>
      {item.kind === 'persistent' ? <div className={`${styles.persistentCell} ${persistentStatus === 'done' ? styles.cellDone : persistentStatus === 'planned' ? styles.cellPlanned : ''}`}><button className={styles.persistentState} onClick={() => { if (!persistentState || persistentState.status === 'cancelled') void quickPlanPersistent(item); else if (persistentState.status === 'done') void restoreAssignment({ id: `persistent-${item.id}`, item_id: item.id, time_slot_id: persistentState.time_slot_id!, plan_date: selectedDate, status: 'done', actual_duration_minutes: null, source: 'persistent' }); else void completeAssignment({ id: `persistent-${item.id}`, item_id: item.id, time_slot_id: persistentState.time_slot_id!, plan_date: selectedDate, status: 'planned', actual_duration_minutes: null, source: 'persistent' }); }}><strong>{persistentStatus === 'done' ? '✓ Yapıldı' : persistentStatus === 'planned' ? 'Planlandı' : 'Boş'}</strong></button><button className={styles.persistentSlot} onClick={() => setPersistentTarget(item)}>{persistentState?.time_slot_id ? slots.find((slot) => slot.id === persistentState.time_slot_id)?.name ?? 'Zaman seç' : defaultSlotForGroup(item.group_id)?.name ?? 'Zaman seç'}</button>{persistentState && persistentState.status !== 'cancelled' && <button className={styles.assignmentCancel} aria-label="Plandan çıkar" onClick={() => void cancelAssignment({ id: `persistent-${item.id}`, item_id: item.id, time_slot_id: persistentState.time_slot_id!, plan_date: selectedDate, status: persistentState.status, actual_duration_minutes: null, source: 'persistent' })}>×</button>}</div> : visibleDates.map((date) => {
        const key = isoDate(date);
        if (item.kind === 'metric') {
          const entry = metrics.find((metric) => metric.item_id === item.id && metric.entry_date === key);
          return <button key={key} className={`${styles.calendarCell} ${selectedDate === key ? styles.selectedCell : ''}`} onClick={() => { setSelectedDate(key); setMetricTarget({ item, date: key, entry }); }}><strong>{entry?.value ?? '—'}</strong>{entry && <small>{item.metric_unit}</small>}</button>;
        }
        const dayAssignments = assignments.filter((entry) => entry.item_id === item.id && entry.plan_date === key);
        const planned = dayAssignments.filter((entry) => entry.status === 'planned').length; const done = dayAssignments.filter((entry) => entry.status === 'done').length;
        if (view === 'daily') {
          const defaultSlot = defaultSlotForGroup(item.group_id);
          return <div key={key} className={`${styles.calendarCell} ${styles.dailyStatusCell} ${done && !planned ? styles.cellDone : planned ? styles.cellPlanned : ''} ${selectedDate === key ? styles.selectedCell : ''}`}>
            {dayAssignments.length ? <div className={styles.assignmentList}>{dayAssignments.map((entry) => {
              const slot = slots.find((candidate) => candidate.id === entry.time_slot_id);
              return <div key={entry.id} className={entry.status === 'done' ? styles.assignmentDone : ''}><button className={styles.assignmentState} onClick={() => { if (entry.status === 'done') void restoreAssignment({ ...entry, source: 'daily' }); else if (item.activity_tag || item.estimated_minutes) setDurationTarget({ ...entry, source: 'daily' }); else void completeAssignment({ ...entry, source: 'daily' }); }}><strong>{entry.status === 'done' ? '✓ Yapıldı' : 'Planlandı'}</strong></button><button className={styles.assignmentSlot} onClick={() => setPlanTarget({ item, date: key })}>{slot?.name ?? 'Zaman seç'}</button><button className={styles.assignmentCancel} aria-label="Plandan çıkar" title="Plandan çıkar" onClick={() => void cancelAssignment({ ...entry, source: 'daily' })}>×</button></div>;
            })}</div> : <button className={styles.quickPlan} onClick={() => void quickPlan(item, key)}><strong>Boş</strong><small>{defaultSlot?.name ?? 'Zaman seç'}</small></button>}
            <button className={styles.addAssignment} aria-label="Başka zaman dilimine ekle" title="Başka zaman dilimine ekle" onClick={() => setPlanTarget({ item, date: key })}>＋</button>
          </div>;
        }
        return <button key={key} className={`${styles.calendarCell} ${done && !planned ? styles.cellDone : planned ? styles.cellPlanned : ''} ${selectedDate === key ? styles.selectedCell : ''}`} onClick={() => { setSelectedDate(key); setPlanTarget({ item, date: key }); }}><strong>{done ? '✓' : planned ? '●' : '＋'}</strong>{dayAssignments.length > 1 && <small>{dayAssignments.length}</small>}</button>;
      })}
    </div>;
  }

  function renderGroup(group: GroupRow, depth = 0): React.ReactNode {
    const groupItems = items.filter((item) => item.group_id === group.id && item.is_in_plan); const children = groups.filter((candidate) => candidate.parent_id === group.id && candidate.is_in_plan);
    const moduleNotes = notes.filter((note) => note.group_id === group.id);
    const plannableCount = group.content_type === 'standard' ? plannableItemsForGroup(group.id).length : 0;
    return <section className={styles.calendarGroup} key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData('text/item-id'), group.id)}>
      <header style={{ paddingLeft: 10 + Math.min(depth * 12, 36), background: group.background_color ?? '#f4f5f1', color: readableText(group.background_color ?? '#f4f5f1') }}><i style={{ background: group.color ?? palette[0] }} /><button className={styles.groupTitle} onClick={() => void editGroup(group)}>{group.name}</button><small>{group.content_type === 'module' ? moduleNotes.length : groupItems.length}</small><div>{group.content_type === 'standard' && plannableCount > 0 && <button aria-label={`${group.name} grubunu Ajandaya ekle`} title={`${plannableCount} itemı Ajandaya ekle`} onClick={() => setGroupPlanTarget(group)}>▤</button>}{group.content_type === 'standard' ? <button aria-label={`${group.name} grubuna ekle`} title="Gruba ekle" onClick={() => setEditor({ groupId: group.id, initialKind: defaultKindForGroup(group.id) })}>＋</button> : group.module_key === 'notes' ? <button aria-label={`${group.name} grubuna not ekle`} title="Not ekle" onClick={() => setNoteEditor({ groupId: group.id })}>＋</button> : null}</div></header>
      {group.content_type === 'module' && group.module_key === 'notes' ? <NotesModule notes={moduleNotes} onOpen={(note) => setNoteEditor({ groupId: group.id, note })} onAdd={() => setNoteEditor({ groupId: group.id })} /> : <>{groupItems.map((item) => renderItem(item, depth + 1))}{children.map((child) => renderGroup(child, depth + 1))}</>}
    </section>;
  }
  void renderGroup;

  function renderAgendaDay(date: Date) {
    const key = isoDate(date);
    const dayEntries = assignments.filter((entry) => entry.plan_date === key && entry.status !== 'cancelled');
    return <section className={styles.agendaDay} key={key}>{view === 'weekly' && <header><div><span>{new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(date)}</span><strong>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(date)}</strong></div><button onClick={() => { setSelectedDate(key); setView('daily'); }}>Günü aç</button></header>}<div className={styles.agendaSlots}>{activeSlots.map((slot) => {
      const slotEntries = dayEntries.filter((entry) => entry.time_slot_id === slot.id);
      const todoEntries = todoTasks.filter((task) => task.agenda_date === key && task.time_slot_id === slot.id);
      const activityRows = slotEntries.map((entry) => ({ entry, item: items.find((candidate) => candidate.id === entry.item_id), schedule: schedules.find((schedule) => schedule.id === entry.schedule_id) ?? schedules.find((schedule) => schedule.item_id === entry.item_id && schedule.time_slot_id === slot.id) })).filter((row): row is typeof row & { item: ItemRow } => !!row.item);
      const orderRows: AgendaOrderRow[] = [...activityRows.map((row) => ({ key: `activity-${row.entry.id}`, kind: 'activity' as const, blockId: row.schedule?.block_id ?? null, scheduledTime: row.schedule?.scheduled_time ?? null, position: row.schedule?.agenda_position ?? 0, schedule: row.schedule })), ...todoEntries.map((task) => ({ key: `todo-${task.id}`, kind: 'todo' as const, blockId: null, scheduledTime: task.scheduled_time, position: task.agenda_position, task }))].sort((a, b) => {
        const timeA = a.scheduledTime ?? '99:99:99'; const timeB = b.scheduledTime ?? '99:99:99';
        return timeA.localeCompare(timeB) || a.position - b.position;
      });
      const renderRow = (row: AgendaOrderRow, scopedRows: AgendaOrderRow[]) => {
        scopedRows = orderRows;
        const activity = row.kind === 'activity' ? activityRows.find((candidate) => `activity-${candidate.entry.id}` === row.key) : undefined;
        const task = row.task;
        if (activity) return <article draggable className={activity.entry.status === 'done' ? styles.agendaEntryDone : ''} key={row.key} onDragStart={(event) => event.dataTransfer.setData('text/agenda-row', row.key)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); dropAgendaRow(scopedRows, event.dataTransfer.getData('text/agenda-row'), row.key); }}><button className={styles.agendaEntryState} onClick={() => { setSelectedDate(key); if (activity.entry.status === 'done') void restoreAssignment({ ...activity.entry, source: 'daily' }); else if (activity.item.activity_tag || activity.item.estimated_minutes) setDurationTarget({ ...activity.entry, source: 'daily' }); else void completeAssignment({ ...activity.entry, source: 'daily' }); }}><span>{activity.entry.status === 'done' ? '✓' : ''}</span></button><button className={styles.agendaEntryIdentity} onClick={() => { setSelectedDate(key); setAgendaItemTarget(activity.item); }}><strong>{activity.item.name}</strong><small>{row.scheduledTime ? `${row.scheduledTime.slice(0, 5)} · ` : ''}{groups.find((group) => group.id === activity.item.group_id)?.name ?? activity.item.activity_tag ?? 'Aktivite'}{activity.item.estimated_minutes ? ` · ${activity.item.estimated_minutes} dk` : ''}{activity.schedule?.reminder_time || reminders.some((reminder) => reminder.item_id === activity.item.id && reminder.is_enabled) ? ' · 🔔' : ''}</small></button><button className={styles.agendaEntryRemove} aria-label="Yalnız bu günden kaldır" title="Yalnız bu günden kaldır" onClick={() => void cancelAssignment({ ...activity.entry, source: 'daily' })}>×</button></article>;
        if (task) return <article draggable className={`${styles.agendaTodoEntry} ${task.status === 'done' ? styles.agendaEntryDone : ''}`} key={row.key} onDragStart={(event) => event.dataTransfer.setData('text/agenda-row', row.key)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); dropAgendaRow(scopedRows, event.dataTransfer.getData('text/agenda-row'), row.key); }}><button className={styles.agendaEntryState} onClick={() => void toggleTodo(task)}><span>{task.status === 'done' ? '✓' : ''}</span></button><button className={styles.agendaEntryIdentity} onClick={() => { setWorkspace('modules'); setActiveModule('todo'); }}><strong>{task.title}</strong><small>{task.scheduled_time ? `${task.scheduled_time.slice(0, 5)} · ` : ''}Todo · {todoLists.find((list) => list.id === task.list_id)?.name ?? 'Gelen Kutusu'}{task.priority === 'high' ? ' · Yüksek' : ''}</small></button><button className={styles.agendaEntryRemove} aria-label="Ajandadan kaldır" onClick={() => void saveTodo({ title: task.title, description: task.description, list_id: task.list_id, priority: task.priority, agenda_date: null, time_slot_id: null, reminder_time: null, scheduled_time: null, agenda_position: task.agenda_position }, task)}>×</button></article>;
        return null;
      };
      const slotBlocks = agendaBlocks.filter((block) => block.time_slot_id === slot.id).sort((a, b) => a.agenda_position - b.agenda_position);
      const ungroupedRows = orderRows.filter((row) => !row.blockId);
      const topNodes: Array<{ key: string; position: number; row?: AgendaOrderRow; block?: AgendaBlockRow }> = [...ungroupedRows.map((row) => ({ key: row.key, position: row.position, row })), ...slotBlocks.map((block) => ({ key: `block-${block.id}`, position: block.agenda_position, block }))].sort((a, b) => a.position - b.position);
      return <section className={styles.agendaSlotSection} key={slot.id}>
        <header onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveAgendaToBlock(orderRows, event.dataTransfer.getData('text/agenda-row'), null); }}><i style={{ background: slot.color ?? palette[0] }} /><div><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></div><button className={styles.agendaSlotAdd} aria-label={`${slot.name} zaman dilimine ekle`} onClick={() => setAgendaAddTarget({ slot, date: key })}>＋</button></header>
        <div>{topNodes.map((node) => <div className={styles.agendaNode} key={node.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const movingBlock = event.dataTransfer.getData('text/agenda-block'); if (movingBlock) { event.preventDefault(); void moveAgendaNodeBefore(topNodes, movingBlock, node.key); } }}>{node.row ? renderRow(node.row, ungroupedRows) : (() => { const block = node.block!; const blockRows = orderRows.filter((row) => row.blockId === block.id); const collapsed = collapsedBlocks.has(block.id); return <section className={styles.agendaBlock}><header draggable onDragStart={(event) => event.dataTransfer.setData('text/agenda-block', `block-${block.id}`)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const movingRow = event.dataTransfer.getData('text/agenda-row'); if (movingRow) { event.preventDefault(); event.stopPropagation(); moveAgendaToBlock(orderRows, movingRow, block.id); } }}><button onClick={() => setCollapsedBlocks((current) => { const next = new Set(current); if (next.has(block.id)) next.delete(block.id); else next.add(block.id); return next; })}><span>{collapsed ? '›' : '⌄'}</span><strong>{block.name}</strong><small>{blockRows.length}</small></button><button aria-label={`${block.name} bloğuna aktivite ekle`} onClick={() => { setPreferredSlotId(slot.id); setPreferredBlockId(block.id); setSelectedDate(key); setWorkspace('library'); }}>＋</button></header>{!collapsed && blockRows.map((row) => renderRow(row, blockRows))}</section>; })()}</div>)}{!orderRows.length && !slotBlocks.length && <button className={styles.agendaSlotEmpty} onClick={() => setAgendaAddTarget({ slot, date: key })}>Bu zaman dilimine ekle</button>}</div>
      </section>;
    })}</div></section>;
  }

  function openAgenda(mode: 'focus' | 'agenda') {
    const dailyEntries = assignments.filter((entry) => entry.plan_date === selectedDate && (mode === 'agenda' || entry.status === 'planned'));
    const fixedStates = persistent.filter((entry) => entry.time_slot_id && (mode === 'agenda' || entry.status === 'planned'));
    const fixedEntries: AssignmentRow[] = fixedStates.map((entry) => ({ id: `persistent-${entry.item_id}`, item_id: entry.item_id, time_slot_id: entry.time_slot_id!, plan_date: selectedDate, status: entry.status, actual_duration_minutes: null, source: 'persistent' }));
    setAgendaMode(mode);
    setFocusSnapshot([...dailyEntries.map((entry) => ({ ...entry, source: 'daily' as const })), ...fixedEntries]);
  }
  const dateAgendaTitle = selectedDate === isoDate(new Date()) ? 'Bugünün Ajandası' : `${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(parseDate(selectedDate))} Ajandası`;
  const agendaTitle = agendaMode === 'focus' ? 'Focus' : dateAgendaTitle;
  const focusSlots = slots.map((slot) => ({ ...slot, entries: (focusSnapshot ?? []).filter((entry) => entry.time_slot_id === slot.id) })).filter((slot) => slot.entries.length);
  const focusTodoTasks = todoTasks.filter((task) => task.agenda_date === selectedDate && task.status === 'pending');

  if (loading) return <div className={styles.loading}>Planın yükleniyor…</div>;

  return <div className={styles.app}>
    <main className={styles.mainWide}>
      {error && <button className={styles.errorBanner} onClick={() => setError('')}>{error} ×</button>}
      <div className={styles.stickyTop}><header className={styles.header}><div className={styles.compactBrand}><span>M</span><strong>{workspace === 'agenda' ? 'Ajanda' : workspace === 'library' ? 'Kütüphane' : workspace === 'modules' ? 'Modüller' : 'Ayarlar'}</strong></div>{workspace === 'agenda' && <div className={styles.headerActions}><div className={styles.agendaViewSwitch} aria-label="Ajanda görünümü"><button className={view === 'daily' ? styles.agendaViewActive : ''} onClick={() => changeView('daily')}>Günlük</button><button className={view === 'weekly' ? styles.agendaViewActive : ''} onClick={() => changeView('weekly')}>Haftalık</button></div><button className={styles.focusButton} onClick={() => openAgenda('focus')}><span className={styles.focusDot}>●</span> Kalanlar <b>{focusPlannedCount}</b></button></div>}</header></div>
      {(workspace === 'agenda' || workspace === 'library') && <section className={`${styles.calendarBoard} ${workspace === 'agenda' && view === 'daily' ? styles.dailyView : ''} ${workspace === 'library' ? styles.libraryBoard : ''}`}>
        <div className={styles.calendarScroller}>
          {workspace === 'agenda' ? <><div className={styles.calendarToolbar}><button aria-label={view === 'daily' ? 'Önceki gün' : 'Önceki hafta'} onClick={() => movePeriod(-1)}>‹</button><button className={styles.toolbarDate} onClick={() => { const today = new Date(); setWeekStart(mondayOf(today)); setSelectedDate(isoDate(today)); }}><strong>{view === 'daily' ? new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(selectedDate)) : <>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(weekStart)} – {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(weekDates[6])}</>}</strong><small>Bugüne dön</small></button><button aria-label={view === 'daily' ? 'Sonraki gün' : 'Sonraki hafta'} onClick={() => movePeriod(1)}>›</button></div><div className={styles.agendaTimeline}>{visibleDates.map((date) => renderAgendaDay(date))}</div></> : <><div className={styles.libraryToolbar}><div><strong>Aktivite Kütüphanesi</strong><small>Grupları ve itemları sürükleyerek düzenleyebilirsin.</small></div><button onClick={() => setEditor({ groupId: null, initialKind: 'group', initialIsInPlan: false })}>＋ Grup</button><button onClick={() => setEditor({ groupId: null, initialKind: 'daily', initialIsInPlan: false })}>＋ Item</button></div><div className={styles.libraryTree} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const kind = event.dataTransfer.getData('text/library-kind'); const id = event.dataTransfer.getData('text/library-id'); if (kind === 'item') void moveItem(id, null); else if (kind === 'group') void moveGroup(id, null); }}>{groups.filter((group) => group.parent_id === null).sort((a, b) => a.position - b.position).map((group) => renderLibraryGroup(group))}{items.filter((item) => item.group_id === null && item.kind !== 'metric').sort((a, b) => a.position - b.position).map((item) => renderLibraryItem(item))}{!groups.length && !items.some((item) => item.kind !== 'metric') && <div className={styles.empty}>İlk grubunu veya itemını ekleyerek Kütüphaneyi oluştur.</div>}</div></>}
        </div>
      </section>}
      {workspace === 'modules' && (activeModule === 'todo' ? <><button className={styles.moduleBack} onClick={() => setActiveModule(null)}>‹ Modüller</button><TodoModule lists={todoLists} tasks={todoTasks} slots={activeSlots} onAddList={addTodoList} onSave={saveTodo} onToggle={toggleTodo} onDelete={deleteTodo} /></> : activeModule === 'metrics' ? <><button className={styles.moduleBack} onClick={() => setActiveModule(null)}>‹ Modüller</button><section className={styles.simpleMetrics}><header><div><span>Wellbeing verileri</span><h2>Metrikler</h2></div><button onClick={() => setEditor({ groupId: null, initialKind: 'metric', initialIsInPlan: false })}>＋ Metrik</button></header><p>Değeri seçili Ajanda günü için gir; eğilimleri Analitik ekranında izle.</p><div>{items.filter((item) => item.kind === 'metric').map((item) => { const itemEntries = metrics.filter((entry) => entry.item_id === item.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date)); const selectedEntry = itemEntries.find((entry) => entry.entry_date === selectedDate); const latest = itemEntries[0]; return <article key={item.id}><button onClick={() => setEditor({ item, groupId: item.group_id })}><i style={{ background: item.color ?? palette[0] }} /><span><strong>{item.name}</strong><small>{item.metric_period === 'weekly' ? 'Haftalık' : item.metric_period === 'monthly' ? 'Aylık' : 'Günlük'} · {latest ? `Son: ${latest.value} ${item.metric_unit ?? ''}` : 'Henüz veri yok'}</small></span></button><button className={selectedEntry ? styles.metricEntered : ''} onClick={() => setMetricTarget({ item, date: selectedDate, entry: selectedEntry })}>{selectedEntry ? `${selectedEntry.value} ${item.metric_unit ?? ''}` : 'Değer gir'}</button></article>; })}{!items.some((item) => item.kind === 'metric') && <div className={styles.empty}>İlk metriğini ekleyerek başla.</div>}</div></section></> : <section className={styles.surfacePanel}><span>◆</span><h2>Modüller</h2><p>Bağımsız araçlar gerektiğinde Ajandaya kendi kayıtlarını gönderir.</p><div className={styles.modulePreview}><button onClick={() => setWorkspace('library')}><b>▦</b><strong>Aktivite Kütüphanesi</strong><small>Aktivitelerini düzenle ve Ajandaya gönder</small></button><button onClick={() => setActiveModule('todo')}><b>✓</b><strong>Todo</strong><small>{todoTasks.filter((task) => task.status === 'pending').length} açık görev</small></button><button onClick={() => setActiveModule('metrics')}><b>∿</b><strong>Metrikler</strong><small>{items.filter((item) => item.kind === 'metric').length} takip</small></button><button><b>□</b><strong>Alışveriş</strong><small>Yakında</small></button><button><b>◷</b><strong>Randevular</strong><small>Yakında</small></button></div></section>)}
      {workspace === 'settings' && <section className={styles.surfacePanel}><span>⚙</span><h2>Ayarlar</h2><p>Günün yapısını, bildirimleri ve ileride bağlantılı servisleri buradan yöneteceksin.</p><div className={styles.settingsList}><button onClick={() => setSlotManagerOpen(true)}><span>◷</span><strong>Zaman dilimleri</strong><small>Saatleri ve günün bölümlerini düzenle</small><b>›</b></button><button onClick={() => void enableNotifications()}><span>◉</span><strong>Bildirimler</strong><small>{notificationPermission === 'granted' ? 'Bildirimler açık' : 'Bildirim iznini yönet'}</small><b>›</b></button><button onClick={() => void supabase.auth.signOut()}><span>↗</span><strong>Çıkış yap</strong><small>{user.email}</small><b>›</b></button></div></section>}
    </main>
    <BottomNav active={workspace} onChange={(surface) => { setPreferredSlotId(null); setPreferredBlockId(null); setWorkspace(surface); window.history.replaceState(null, '', surface === 'agenda' ? '/' : `/?surface=${surface}`); }} />
    {planTarget && <div className={styles.overlay} onMouseDown={() => setPlanTarget(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(planTarget.date))}</span><button onClick={() => setPlanTarget(null)}>×</button></div><h2>{planTarget.item.name}</h2><p>Bir veya birden fazla zaman dilimi seçebilirsin.</p><div className={styles.slotPicker}>{activeSlots.map((slot) => { const chosen = assignments.some((entry) => entry.item_id === planTarget.item.id && entry.time_slot_id === slot.id && entry.plan_date === planTarget.date && entry.status === 'planned'); return <button key={slot.id} className={chosen ? styles.chosen : ''} onClick={() => void toggleSlot(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{chosen ? '✓' : ''}</b></button>; })}</div><button className={styles.primary} onClick={() => setPlanTarget(null)}>Tamam</button></section></div>}
    {persistentTarget && <div className={styles.overlay} onMouseDown={() => setPersistentTarget(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Sabit item</span><button onClick={() => setPersistentTarget(null)}>×</button></div><h2>{persistentTarget.name}</h2><p>Ajanda’da görüneceği zaman dilimini seç.</p><div className={styles.slotPicker}>{activeSlots.map((slot) => { const state = persistent.find((entry) => entry.item_id === persistentTarget.id); const chosen = state?.status === 'planned' && state.time_slot_id === slot.id; return <button key={slot.id} className={chosen ? styles.chosen : ''} onClick={() => void setPersistentSlot(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{chosen ? '✓' : ''}</b></button>; })}</div><button className={styles.primary} onClick={() => setPersistentTarget(null)}>Tamam</button></section></div>}
    {slotManagerOpen && <TimeSlotManager slots={activeSlots} onClose={() => setSlotManagerOpen(false)} onSave={saveSlot} onDelete={archiveSlot} />}
    {metricTarget && <MetricEntryModal target={metricTarget} onClose={() => setMetricTarget(null)} onSave={saveMetric} />}
    {focusSnapshot && <div className={styles.overlay} onMouseDown={() => setFocusSnapshot(null)}><section className={`${styles.dialog} ${styles.focusDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(selectedDate))}</span><button onClick={() => setFocusSnapshot(null)}>×</button></div><h2>{agendaTitle}</h2><p>{focusSnapshot.filter((entry) => entry.status === 'planned').length + focusTodoTasks.length} kayıt seni bekliyor.</p>{focusSlots.map((slot) => <div className={styles.focusSlot} key={slot.id}><header><i style={{ background: slot.color ?? palette[0] }} /><strong>{slot.name}</strong><span>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</span></header>{slot.entries.map((entry) => { const item = items.find((candidate) => candidate.id === entry.item_id); return <div key={entry.id} className={`${styles.focusEntry} ${entry.status === 'done' ? styles.focusDone : ''}`}><button className={styles.focusState} onClick={() => { if (entry.status === 'done') void restoreAssignment(entry); else if (entry.source === 'daily' && (item?.activity_tag || item?.estimated_minutes)) setDurationTarget(entry); else void completeAssignment(entry); }}><span className={styles.roundCheck}>{entry.status === 'done' ? '✓' : ''}</span><span><strong>{item?.name}</strong><small>{item?.activity_tag ? `${item.activity_tag}${item.estimated_minutes ? ` · ${item.estimated_minutes} dk` : ''}` : groups.find((group) => group.id === item?.group_id)?.name ?? 'Grupsuz'}</small></span><em>{entry.status === 'done' ? entry.actual_duration_minutes ? `${entry.actual_duration_minutes} dk` : 'Yapıldı' : 'Planlandı'}</em></button>{entry.source === 'daily' && <button className={styles.focusMove} title="Zaman dilimlerini değiştir" onClick={() => { if (item) setPlanTarget({ item, date: selectedDate }); setFocusSnapshot(null); }}>⋯</button>}<button className={styles.focusCancel} aria-label="Plandan çıkar" title="Plandan çıkar" onClick={() => void cancelAssignment(entry)}>×</button></div>; })}</div>)}{focusTodoTasks.length > 0 && <div className={styles.focusSlot}><header><i style={{ background: '#756b91' }} /><strong>Todo</strong><span>{focusTodoTasks.length}</span></header>{focusTodoTasks.map((task) => <div className={styles.focusEntry} key={task.id}><button className={styles.focusState} onClick={() => void toggleTodo(task)}><span className={styles.roundCheck} /><span><strong>{task.title}</strong><small>{todoLists.find((list) => list.id === task.list_id)?.name ?? 'Gelen Kutusu'}</small></span><em>Planlandı</em></button><button className={styles.focusCancel} onClick={() => void saveTodo({ title: task.title, description: task.description, list_id: task.list_id, priority: task.priority, agenda_date: null, time_slot_id: null, reminder_time: null, scheduled_time: null, agenda_position: task.agenda_position }, task)}>×</button></div>)}</div>}{!focusSlots.length && !focusTodoTasks.length && <div className={styles.empty}>Bu gün için bekleyen kayıt yok.</div>}</section></div>}
    {durationTarget && <DurationCompletionModal entry={durationTarget} item={items.find((item) => item.id === durationTarget.item_id)!} onClose={() => setDurationTarget(null)} onComplete={async (minutes) => { await completeAssignment(durationTarget, minutes); setDurationTarget(null); }} />}
    {groupPlanTarget && <GroupPlanModal group={groupPlanTarget} itemCount={plannableItemsForGroup(groupPlanTarget.id).length} slots={activeSlots} date={selectedDate} onClose={() => setGroupPlanTarget(null)} onPlan={(slotId) => planGroup(groupPlanTarget, slotId)} />}
    {agendaItemTarget && <AgendaItemModal item={agendaItemTarget} group={groups.find((group) => group.id === agendaItemTarget.group_id)} date={selectedDate} assignments={assignments.filter((entry) => entry.item_id === agendaItemTarget.id && entry.plan_date === selectedDate)} reminders={reminders.filter((reminder) => reminder.item_id === agendaItemTarget.id && reminder.is_enabled)} onClose={() => setAgendaItemTarget(null)} onManageDay={() => { const item = agendaItemTarget; setAgendaItemTarget(null); if (item.kind === 'persistent') setPersistentTarget(item); else if (item.kind === 'daily') setPlanTarget({ item, date: selectedDate }); else setMetricTarget({ item, date: selectedDate, entry: metrics.find((metric) => metric.item_id === item.id && metric.entry_date === selectedDate) }); }} onManageProgram={() => { const item = agendaItemTarget; setAgendaItemTarget(null); setScheduleTarget(item); }} onOpenSource={() => { setAgendaItemTarget(null); setWorkspace('library'); window.history.replaceState(null, '', '/?surface=library'); }} />}
    {scheduleTarget && <ScheduleManagerModal item={scheduleTarget} schedules={schedules.filter((schedule) => schedule.item_id === scheduleTarget.id)} slots={activeSlots} blocks={agendaBlocks} preferredSlotId={preferredSlotId} selectedDate={selectedDate} onClose={closeScheduleTarget} onSave={saveSchedule} onToggle={toggleSchedule} onDelete={deleteSchedule} />}
    {agendaAddTarget && <div className={styles.overlay} onMouseDown={() => setAgendaAddTarget(null)}><section className={`${styles.dialog} ${styles.agendaAddDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{agendaAddTarget.slot.name}</span><button onClick={() => setAgendaAddTarget(null)}>×</button></div><h2>Ajandaya ekle</h2><p>Bu zaman dilimine ne eklemek istiyorsun?</p><div className={styles.agendaAddOptions}><button onClick={() => { setPreferredSlotId(agendaAddTarget.slot.id); setSelectedDate(agendaAddTarget.date); setAgendaAddTarget(null); setWorkspace('library'); }}><b>▦</b><span><strong>Kütüphaneden aktivite</strong><small>Zaman dilimi otomatik seçilecek</small></span></button><button onClick={() => void createAgendaBlock(agendaAddTarget.slot)}><b>▤</b><span><strong>Blok oluştur</strong><small>İlaçlar veya Sabah rutini gibi</small></span></button></div></section></div>}
    {libraryAddTarget && <div className={styles.overlay} onMouseDown={() => setLibraryAddTarget(null)}><section className={`${styles.dialog} ${styles.agendaAddDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{libraryAddTarget.name}</span><button onClick={() => setLibraryAddTarget(null)}>×</button></div><h2>Gruba ekle</h2><p>Bu grubun altında ne oluşturmak istiyorsun?</p><div className={styles.agendaAddOptions}><button onClick={() => { const groupId = libraryAddTarget.id; setLibraryAddTarget(null); setEditor({ groupId, initialKind: 'daily', initialIsInPlan: false }); }}><b>◆</b><span><strong>Kütüphane kaydı</strong><small>Ajandaya programlanabilir item</small></span></button><button onClick={() => { const groupId = libraryAddTarget.id; setLibraryAddTarget(null); setEditor({ groupId, initialKind: 'group', initialIsInPlan: false }); }}><b>▤</b><span><strong>Alt grup</strong><small>Kayıtları bir alt seviyede düzenle</small></span></button></div></section></div>}
    {noteEditor && <NoteEditorModal note={noteEditor.note} onClose={() => setNoteEditor(null)} onSave={saveNote} onDelete={noteEditor.note ? () => deleteNote(noteEditor.note!) : undefined} />}
    {editor && <ItemEditorModal key={editor.item?.id ?? editor.group?.id ?? `new-${editor.initialKind ?? 'item'}-${editor.groupId ?? 'root'}`} item={editor.item} group={editor.group} initialKind={editor.initialKind} initialIsInPlan={editor.initialIsInPlan} initialGroupId={editor.groupId} groups={groups} slots={activeSlots} reminders={editor.item ? reminders.filter((reminder) => reminder.item_id === editor.item!.id).map(({ reminder_time, weekdays, is_enabled }) => ({ reminder_time: reminder_time.slice(0, 5), weekdays, is_enabled })) : []} activityTags={Array.from(new Set(items.map((item) => item.activity_tag).filter((tag): tag is string => !!tag))).sort((a, b) => a.localeCompare(b, 'tr'))} onClose={() => setEditor(null)} onSave={saveItem} onSaveGroup={saveGroup} onDelete={editor.item ? async () => { if (await deleteItem(editor.item!)) setEditor(null); } : editor.group ? async () => { if (await deleteGroup(editor.group!)) setEditor(null); } : undefined} />}
  </div>;
}

function ScheduleManagerModal({ item, schedules, slots, blocks, preferredSlotId, selectedDate, onClose, onSave, onToggle, onDelete }: { item: ItemRow; schedules: ScheduleRow[]; slots: SlotRow[]; blocks: AgendaBlockRow[]; preferredSlotId: string | null; selectedDate: string; onClose: () => void; onSave: (draft: ScheduleDraft) => Promise<boolean>; onToggle: (schedule: ScheduleRow) => Promise<void>; onDelete: (schedule: ScheduleRow) => Promise<void> }) {
  const [editing, setEditing] = useState<ScheduleRow | 'new' | null>(schedules.length ? null : 'new');
  const labels = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
  const describe = (schedule: ScheduleRow) => schedule.recurrence_type === 'once' ? 'Yalnız bir gün' : schedule.recurrence_type === 'daily' ? 'Her gün' : schedule.weekdays.map((day) => labels[day]).join(', ');
  return <div className={styles.overlay} onMouseDown={onClose}><section className={`${styles.dialog} ${styles.scheduleDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{schedules.length ? 'Ajanda programları' : 'Ajandaya ekle'}</span><button onClick={onClose}>×</button></div><h2>{item.name}</h2>{editing ? <ScheduleEditor schedule={editing === 'new' ? undefined : editing} slots={slots} blocks={blocks} preferredSlotId={preferredSlotId} selectedDate={selectedDate} nextPosition={schedules.length} onCancel={schedules.length ? () => setEditing(null) : onClose} onSave={async (draft) => { const saved = await onSave(draft); if (saved) { if (schedules.length) setEditing(null); else onClose(); } return saved; }} /> : <><p>Aktivitenin Ajandaya bağlı tekrarlarını yönet.</p><div className={styles.scheduleList}>{schedules.map((schedule) => <article key={schedule.id} className={!schedule.is_active ? styles.schedulePaused : ''}><button onClick={() => setEditing(schedule)}><i style={{ background: slots.find((slot) => slot.id === schedule.time_slot_id)?.color ?? palette[0] }} /><span><strong>{schedule.scheduled_time ? `${schedule.scheduled_time.slice(0, 5)} · ` : ''}{slots.find((slot) => slot.id === schedule.time_slot_id)?.name ?? 'Zaman dilimi'}</strong><small>{describe(schedule)}{schedule.block_id ? ` · ${blocks.find((block) => block.id === schedule.block_id)?.name ?? 'Blok'}` : ''}{schedule.reminder_time ? ` · 🔔 ${schedule.reminder_time.slice(0, 5)}` : ''}</small></span></button><div><button onClick={() => void onToggle(schedule)}>{schedule.is_active ? 'Duraklat' : 'Başlat'}</button><button onClick={() => void onDelete(schedule)}>Sil</button></div></article>)}</div><button className={styles.primary} onClick={() => setEditing('new')}>＋ Yeni zaman ekle</button></>}</section></div>;
}

function ScheduleEditor({ schedule, slots, blocks, preferredSlotId, selectedDate, nextPosition, onCancel, onSave }: { schedule?: ScheduleRow; slots: SlotRow[]; blocks: AgendaBlockRow[]; preferredSlotId: string | null; selectedDate: string; nextPosition: number; onCancel: () => void; onSave: (draft: ScheduleDraft) => Promise<boolean> }) {
  const [slotId, setSlotId] = useState(schedule?.time_slot_id ?? preferredSlotId ?? slots[0]?.id ?? '');
  const [blockId] = useState(schedule?.block_id ?? '');
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekdays'>(schedule?.recurrence_type ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(schedule?.weekdays ?? [parseDate(selectedDate).getDay()]);
  const [startDate, setStartDate] = useState(schedule?.start_date ?? selectedDate);
  const [reminderTime, setReminderTime] = useState(schedule?.reminder_time?.slice(0, 5) ?? '');
  const [scheduledTime, setScheduledTime] = useState(schedule?.scheduled_time?.slice(0, 5) ?? '');
  const [busy, setBusy] = useState(false);
  const labels = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
  async function submit() { const validBlockId = blocks.some((block) => block.id === blockId && block.time_slot_id === slotId) ? blockId : null; setBusy(true); await onSave({ id: schedule?.id, time_slot_id: slotId, block_id: validBlockId, recurrence_type: recurrence, weekdays: recurrence === 'weekdays' ? weekdays : [], start_date: startDate, reminder_time: reminderTime || null, scheduled_time: scheduledTime || null, agenda_position: schedule?.agenda_position ?? nextPosition }); setBusy(false); }
  return <><p>{schedule ? 'Programı düzenle.' : 'Zaman dilimini ve tekrarı seç; program hemen oluşsun.'}</p><label className={styles.scheduleLabel}>Zaman dilimi</label><div className={styles.slotPicker}>{slots.map((slot) => <button key={slot.id} className={slotId === slot.id ? styles.chosen : ''} onClick={() => setSlotId(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{slotId === slot.id ? '✓' : ''}</b></button>)}</div><label className={styles.scheduleLabel}>Tekrar</label><div className={styles.scheduleRecurrence}><button className={recurrence === 'once' ? styles.chosen : ''} onClick={() => setRecurrence('once')}>Yalnız bu gün</button><button className={recurrence === 'daily' ? styles.chosen : ''} onClick={() => setRecurrence('daily')}>Her gün</button><button className={recurrence === 'weekdays' ? styles.chosen : ''} onClick={() => setRecurrence('weekdays')}>Belirli günler</button></div>{recurrence === 'weekdays' && <div className={styles.scheduleWeekdays}>{labels.map((label, day) => <button key={label} className={weekdays.includes(day) ? styles.chosen : ''} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())}>{label}</button>)}</div>}<details className={styles.scheduleAdvanced}><summary>Diğer seçenekler</summary><label className={styles.scheduleLabel}>Başlangıç tarihi</label><input className={styles.scheduleDate} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><label className={styles.scheduleReminder}><span>Kesin saat</span><input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} /><small>Boşsa Ajandadaki manuel sıra kullanılır.</small></label><label className={styles.scheduleReminder}><span>Bildirim saati</span><input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /><small>Boş bırakırsan bildirim gönderilmez.</small></label></details><div className={styles.scheduleFormActions}><button onClick={onCancel}>Vazgeç</button><button className={styles.primary} disabled={busy || !startDate || !slotId || (recurrence === 'weekdays' && !weekdays.length)} onClick={() => void submit()}>{busy ? 'Kaydediliyor…' : schedule ? 'Kaydet' : 'Ajandaya ekle'}</button></div></>;
}

function ScheduleModal({ item, slots, selectedDate, onClose, onSave }: { item: ItemRow; slots: SlotRow[]; selectedDate: string; onClose: () => void; onSave: (draft: { time_slot_id: string; recurrence_type: 'once' | 'daily' | 'weekdays'; weekdays: number[]; start_date: string }) => Promise<boolean> }) {
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '');
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekdays'>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([parseDate(selectedDate).getDay()]);
  const [busy, setBusy] = useState(false);
  const dayLabels = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
  async function submit() { if (!slotId || (recurrence === 'weekdays' && !weekdays.length)) return; setBusy(true); await onSave({ time_slot_id: slotId, recurrence_type: recurrence, weekdays: recurrence === 'weekdays' ? weekdays : [], start_date: selectedDate }); setBusy(false); }
  return <div className={styles.overlay} onMouseDown={onClose}><section className={`${styles.dialog} ${styles.scheduleDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Ajandaya ekle</span><button onClick={onClose}>×</button></div><h2>{item.name}</h2><p>Aktivitenin ne zaman Ajandada görüneceğini belirle.</p><label className={styles.scheduleLabel}>Tekrar</label><div className={styles.scheduleRecurrence}><button className={recurrence === 'once' ? styles.chosen : ''} onClick={() => setRecurrence('once')}>Yalnız bu gün</button><button className={recurrence === 'daily' ? styles.chosen : ''} onClick={() => setRecurrence('daily')}>Her gün</button><button className={recurrence === 'weekdays' ? styles.chosen : ''} onClick={() => setRecurrence('weekdays')}>Belirli günler</button></div>{recurrence === 'weekdays' && <div className={styles.scheduleWeekdays}>{dayLabels.map((label, day) => <button key={label} className={weekdays.includes(day) ? styles.chosen : ''} onClick={() => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort())}>{label}</button>)}</div>}<label className={styles.scheduleLabel}>Zaman dilimi</label><div className={styles.slotPicker}>{slots.map((slot) => <button key={slot.id} className={slotId === slot.id ? styles.chosen : ''} onClick={() => setSlotId(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{slotId === slot.id ? '✓' : ''}</b></button>)}</div>{!slots.length && <div className={styles.empty}>Ajandaya eklemeden önce Ayarlardan bir zaman dilimi oluştur.</div>}<button className={styles.primary} disabled={busy || !slotId || (recurrence === 'weekdays' && !weekdays.length)} onClick={() => void submit()}>{busy ? 'Ekleniyor…' : 'Ajandaya ekle'}</button></section></div>;
}
void ScheduleModal;

function AgendaItemModal({ item, group, date, assignments, reminders, onClose, onManageDay, onManageProgram, onOpenSource }: { item: ItemRow; group?: GroupRow; date: string; assignments: AssignmentRow[]; reminders: ReminderRow[]; onClose: () => void; onManageDay: () => void; onManageProgram: () => void; onOpenSource: () => void }) {
  const planned = assignments.filter((entry) => entry.status === 'planned').length;
  const done = assignments.filter((entry) => entry.status === 'done').length;
  return <div className={styles.overlay} onMouseDown={onClose}><section className={`${styles.dialog} ${styles.agendaItemDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Ajanda kaydı</span><button onClick={onClose}>×</button></div><h2>{item.name}</h2><p>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(date))}</p><div className={styles.agendaSourceCard}><span>Kaynak</span><strong>Aktivite Kütüphanesi</strong><small>{group?.name ?? 'Grupsuz'} · {item.kind === 'metric' ? 'Ölçüm' : item.activity_tag || (item.kind === 'persistent' ? 'Geçici' : 'Aktivite')}{reminders.length ? ' · 🔔' : ''}</small></div>{item.description && <section className={styles.agendaDescription}><MarkdownContent value={item.description} /></section>}<div className={styles.agendaItemSummary}><div><span>Planlanan</span><strong>{planned}</strong></div><div><span>Tamamlanan</span><strong>{done}</strong></div></div><div className={styles.agendaItemActions}><button onClick={onManageDay}>{item.kind === 'metric' ? 'Bugünün değerini gir' : 'Yalnız bugünü düzenle'}</button><button onClick={onManageProgram}>Tekrar programını düzenle</button><button onClick={onOpenSource}>Kütüphanede göster</button></div><small className={styles.agendaOwnershipNote}>Bugünün kaydı, tekrar programı ve kaynak aktivite birbirinden ayrı yönetilir.</small></section></div>;
}

function GroupPlanModal({ group, itemCount, slots, date, onClose, onPlan }: { group: GroupRow; itemCount: number; slots: SlotRow[]; date: string; onClose: () => void; onPlan: (slotId: string) => Promise<boolean> }) {
  const [slotId, setSlotId] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() { if (!slotId) return; setBusy(true); await onPlan(slotId); setBusy(false); }
  return <div className={styles.overlay} onMouseDown={onClose}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(parseDate(date))}</span><button onClick={onClose}>×</button></div><h2>{group.name}</h2><p>{itemCount} itemı Ajandaya eklemek için bir zaman dilimi seç.</p><div className={styles.slotPicker}>{slots.map((slot) => <button key={slot.id} className={slotId === slot.id ? styles.chosen : ''} onClick={() => setSlotId(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{slotId === slot.id ? '✓' : ''}</b></button>)}</div><button className={styles.primary} disabled={!slotId || busy} onClick={() => void submit()}>{busy ? 'Ekleniyor…' : 'Ajandaya ekle'}</button></section></div>;
}

function NotesModule({ notes, onOpen, onAdd }: { notes: NoteRow[]; onOpen: (note: NoteRow) => void; onAdd: () => void }) {
  if (!notes.length) return <button className={styles.notesEmpty} onClick={onAdd}><span>＋</span><strong>İlk notunu ekle</strong><small>Bu grup item yerine kendi notlarını tutar.</small></button>;
  return <div className={styles.notesModule}>{notes.map((note) => <button key={note.id} onClick={() => onOpen(note)}><header><strong>{note.is_pinned && <span>◆</span>}{note.title}</strong><small>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(note.updated_at))}</small></header><p>{note.body || 'İçerik eklenmemiş.'}</p></button>)}</div>;
}

function NoteEditorModal({ note, onClose, onSave, onDelete }: { note?: NoteRow; onClose: () => void; onSave: (draft: { title: string; body: string; is_pinned: boolean }) => Promise<boolean>; onDelete?: () => Promise<boolean> }) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [pinned, setPinned] = useState(note?.is_pinned ?? false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; setBusy(true); await onSave({ title: title.trim(), body: body.trim(), is_pinned: pinned }); setBusy(false); }
  return <div className={styles.overlay} onMouseDown={onClose}><form className={`${styles.metricDialog} ${styles.noteDialog}`} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>{note ? 'Notu düzenle' : 'Yeni not'}</span><button type="button" onClick={onClose}>×</button></div><h2>{note ? note.title : 'Aklındakini kaydet'}</h2><label>Başlık<div><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus placeholder="Not başlığı" /></div></label><label>İçerik<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} placeholder="Yazmaya başla…" /></label><label className={styles.notePin}><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Bu notu üstte tut</label><div className={styles.noteActions}>{note && onDelete && <button type="button" className={styles.noteDelete} disabled={busy} onClick={() => void onDelete()}>Sil</button>}<span /><button className={styles.primary} disabled={busy || !title.trim()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div></form></div>;
}

function DurationCompletionModal({ item, onClose, onComplete }: { entry: AssignmentRow; item: ItemRow; onClose: () => void; onComplete: (minutes: number) => Promise<void> }) {
  const [minutes, setMinutes] = useState(item.estimated_minutes?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (Number(minutes) <= 0) return; setBusy(true); await onComplete(Number(minutes)); setBusy(false); }
  return <div className={styles.overlay} onMouseDown={onClose}><form className={`${styles.metricDialog} ${styles.durationDialog}`} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Aktivite tamamlandı</span><button type="button" onClick={onClose}>×</button></div><h2>{item.name}</h2><p>Bu aktivite ne kadar sürdü?</p><label>Süre<div><input type="number" min="5" step="5" required value={minutes} onChange={(event) => setMinutes(event.target.value)} autoFocus /><span>dakika</span></div></label><button className={styles.primary} disabled={busy || Number(minutes) <= 0}>{busy ? 'Kaydediliyor…' : 'Tamamla'}</button></form></div>;
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
