'use client';

import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ItemKind, PlanStatus } from '@/types/domain';
import styles from './planner-shell.module.css';

type GroupRow = { id: string; parent_id: string | null; name: string; color: string | null; position: number };
type ItemRow = { id: string; group_id: string | null; kind: ItemKind; name: string; color: string | null; metric_unit: string | null; position: number };
type SlotRow = { id: string; name: string; start_time: string | null; end_time: string | null; color: string | null; position: number };
type AssignmentRow = { id: string; item_id: string; time_slot_id: string; status: PlanStatus };
type PersistentRow = { item_id: string; status: PlanStatus };

const palette = ['#638169', '#667e99', '#ad765e', '#8d76a4', '#b18a4f'];

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shortTime(value: string | null) {
  return value?.slice(0, 5) ?? '—';
}

export function PlannerShell({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [persistent, setPersistent] = useState<PersistentRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = localDate();

  const loadData = useCallback(async () => {
    const [groupResult, itemResult, slotResult, assignmentResult, persistentResult] = await Promise.all([
      supabase.from('m_groups').select('id,parent_id,name,color,position').order('position'),
      supabase.from('m_items').select('id,group_id,kind,name,color,metric_unit,position').eq('is_active', true).order('position'),
      supabase.from('m_time_slots').select('id,name,start_time,end_time,color,position').eq('is_active', true).order('position'),
      supabase.from('m_daily_assignments').select('id,item_id,time_slot_id,status').eq('plan_date', today).neq('status', 'cancelled'),
      supabase.from('m_persistent_states').select('item_id,status').neq('status', 'cancelled'),
    ]);
    const firstError = [groupResult, itemResult, slotResult, assignmentResult, persistentResult].find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    else {
      setGroups((groupResult.data ?? []) as GroupRow[]);
      setItems((itemResult.data ?? []) as ItemRow[]);
      setSlots((slotResult.data ?? []) as SlotRow[]);
      setAssignments((assignmentResult.data ?? []) as AssignmentRow[]);
      setPersistent((persistentResult.data ?? []) as PersistentRow[]);
    }
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => {
    void supabase.from('m_profiles').upsert({ id: user.id, display_name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null }, { onConflict: 'id' });
    queueMicrotask(() => void loadData());
  }, [loadData, supabase, user]);

  const planned = assignments.filter((assignment) => assignment.status === 'planned');
  const focusSlots = slots.map((slot) => ({
    ...slot,
    entries: planned.filter((assignment) => assignment.time_slot_id === slot.id).map((assignment) => ({
      assignment,
      item: items.find((item) => item.id === assignment.item_id),
    })).filter((entry) => entry.item),
  })).filter((slot) => slot.entries.length);

  async function addGroup(parentId: string | null = null) {
    const name = window.prompt(parentId ? 'Alt grup adı' : 'Grup adı');
    if (!name?.trim()) return;
    const { error: insertError } = await supabase.from('m_groups').insert({ user_id: user.id, parent_id: parentId, name: name.trim(), color: palette[groups.length % palette.length], position: groups.length });
    if (insertError) setError(insertError.message); else await loadData();
  }

  async function editGroup(group: GroupRow) {
    const name = window.prompt('Grup adı', group.name);
    if (!name?.trim()) return;
    const { error: updateError } = await supabase.from('m_groups').update({ name: name.trim() }).eq('id', group.id);
    if (updateError) setError(updateError.message); else await loadData();
  }

  async function deleteGroup(group: GroupRow) {
    if (!window.confirm(`“${group.name}” grubu ve altındaki kayıtlar silinsin mi?`)) return;
    const { error: deleteError } = await supabase.from('m_groups').delete().eq('id', group.id);
    if (deleteError) setError(deleteError.message); else await loadData();
  }

  async function addItem(groupId: string | null) {
    const name = window.prompt('Item adı');
    if (!name?.trim()) return;
    const rawKind = window.prompt('Tür: daily, persistent veya metric', 'daily');
    if (!rawKind || !['daily', 'persistent', 'metric'].includes(rawKind)) return;
    const kind = rawKind as ItemKind;
    const metricUnit = kind === 'metric' ? window.prompt('Metrik birimi (kg, saat, adet...)', 'kg') : null;
    const { error: insertError } = await supabase.from('m_items').insert({ user_id: user.id, group_id: groupId, name: name.trim(), kind, metric_unit: metricUnit, position: items.length });
    if (insertError) setError(insertError.message); else await loadData();
  }

  async function editItem(item: ItemRow) {
    const name = window.prompt('Item adı', item.name);
    if (!name?.trim()) return;
    const { error: updateError } = await supabase.from('m_items').update({ name: name.trim() }).eq('id', item.id);
    if (updateError) setError(updateError.message); else await loadData();
  }

  async function deleteItem(item: ItemRow) {
    if (!window.confirm(`“${item.name}” silinsin mi?`)) return;
    const { error: deleteError } = await supabase.from('m_items').delete().eq('id', item.id);
    if (deleteError) setError(deleteError.message); else await loadData();
  }

  async function addSlot() {
    const name = window.prompt('Zaman dilimi adı');
    if (!name?.trim()) return;
    const start = window.prompt('Başlangıç saati', '09:00');
    const end = window.prompt('Bitiş saati', '12:00');
    const { error: insertError } = await supabase.from('m_time_slots').insert({ user_id: user.id, name: name.trim(), start_time: start || null, end_time: end || null, color: palette[slots.length % palette.length], position: slots.length });
    if (insertError) setError(insertError.message); else await loadData();
  }

  async function toggleSlot(slotId: string) {
    if (!selectedItem) return;
    const existing = assignments.find((assignment) => assignment.item_id === selectedItem.id && assignment.time_slot_id === slotId);
    if (existing?.status === 'planned') {
      const { error: updateError } = await supabase.from('m_daily_assignments').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), completed_at: null }).eq('id', existing.id);
      if (updateError) return setError(updateError.message);
    } else {
      const { error: upsertError } = await supabase.from('m_daily_assignments').upsert({ user_id: user.id, item_id: selectedItem.id, time_slot_id: slotId, plan_date: today, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null }, { onConflict: 'user_id,item_id,time_slot_id,plan_date' });
      if (upsertError) return setError(upsertError.message);
    }
    await loadData();
  }

  async function completeAssignment(id: string) {
    const { error: updateError } = await supabase.from('m_daily_assignments').update({ status: 'done', completed_at: new Date().toISOString(), cancelled_at: null }).eq('id', id);
    if (updateError) setError(updateError.message); else await loadData();
  }

  async function cyclePersistent(item: ItemRow) {
    const current = persistent.find((state) => state.item_id === item.id)?.status;
    if (!current) {
      await supabase.from('m_persistent_states').upsert({ item_id: item.id, user_id: user.id, status: 'planned', planned_at: new Date().toISOString(), completed_at: null, cancelled_at: null });
    } else if (current === 'planned') {
      await supabase.from('m_persistent_states').update({ status: 'done', completed_at: new Date().toISOString(), cancelled_at: null }).eq('item_id', item.id);
    } else {
      await supabase.from('m_persistent_states').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), completed_at: null }).eq('item_id', item.id);
    }
    await loadData();
  }

  async function moveItem(itemId: string, groupId: string | null) {
    const { error: updateError } = await supabase.from('m_items').update({ group_id: groupId }).eq('id', itemId);
    if (updateError) setError(updateError.message); else await loadData();
  }

  function renderGroup(group: GroupRow, depth = 0): React.ReactNode {
    const groupItems = items.filter((item) => item.group_id === group.id);
    const children = groups.filter((candidate) => candidate.parent_id === group.id);
    return <article className={styles.group} key={group.id} style={{ marginLeft: Math.min(depth * 18, 54) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData('text/item-id'), group.id)}>
      <header><span style={{ background: group.color ?? palette[0] }} /><h3>{group.name}</h3><small>{groupItems.length} item</small><div className={styles.rowActions}><button onClick={() => void addItem(group.id)}>＋ item</button><button onClick={() => void addGroup(group.id)}>＋ grup</button><button onClick={() => void editGroup(group)}>Düzenle</button><button onClick={() => void deleteGroup(group)}>Sil</button></div></header>
      {groupItems.map(renderItem)}
      {children.map((child) => renderGroup(child, depth + 1))}
    </article>;
  }

  function renderItem(item: ItemRow) {
    const count = assignments.filter((assignment) => assignment.item_id === item.id && assignment.status === 'planned').length;
    const persistentStatus = persistent.find((state) => state.item_id === item.id)?.status;
    const label = item.kind === 'daily' ? 'Günlük' : item.kind === 'persistent' ? 'Sürekli' : `Metrik · ${item.metric_unit ?? 'değer'}`;
    return <div className={styles.itemRow} key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/item-id', item.id)}>
      <button className={styles.item} onClick={() => item.kind === 'daily' ? setSelectedItem(item) : item.kind === 'persistent' ? void cyclePersistent(item) : undefined}>
        <span className={styles.drag}>⠿</span><span className={`${styles.check} ${persistentStatus === 'done' ? styles.checked : ''}`} />
        <span className={styles.itemName}><strong>{item.name}</strong><small>{label}</small></span>
        {count > 0 && <span className={styles.planBadge}>{count} zaman dilimi</span>}
        {persistentStatus && <span className={styles.planBadge}>{persistentStatus === 'done' ? 'Yapıldı' : 'Planlandı'}</span>}
      </button><button className={styles.miniAction} onClick={() => void editItem(item)}>Düzenle</button><button className={styles.miniAction} onClick={() => void deleteItem(item)}>Sil</button>
    </div>;
  }

  if (loading) return <div className={styles.loading}>Planın yükleniyor…</div>;

  return <div className={styles.app}>
    <aside className={styles.sidebar}><div className={styles.brand}><span>M</span> momentum</div><nav className={styles.nav}><Link className={styles.active} href="/"><span>◫</span> Bugün</Link><Link href="/analytics"><span>⌁</span> Analitik</Link><Link href="/metrics"><span>◇</span> Metrikler</Link></nav><div className={styles.sidebarBottom}><button onClick={() => void addGroup()}><span>＋</span> Yeni grup</button><button><span>⚙</span> Ayarlar</button><div className={styles.profile}><span>{user.email?.slice(0, 2).toUpperCase()}</span><div><strong>{user.user_metadata?.full_name ?? user.email?.split('@')[0]}</strong><button onClick={() => void supabase.auth.signOut()}>Çıkış yap</button></div></div></div></aside>
    <main className={styles.main}>
      {error && <button className={styles.errorBanner} onClick={() => setError('')}>{error} ×</button>}
      <header className={styles.header}><div><p>{new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(new Date())}</p><h1>Günaydın.</h1></div><div className={styles.headerActions}><Link className={styles.analyticsLink} href="/analytics"><span>⌁</span> Analitik</Link><button className={styles.focusButton} onClick={() => setFocusOpen(true)}><span className={styles.focusDot} /> Bugünün Planı <b>{planned.length}</b></button></div></header>
      <section className={styles.timeline}>{slots.map((slot) => <div key={slot.id}><i style={{ background: slot.color ?? palette[0] }} /><strong>{slot.name}</strong><span>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</span></div>)}<button onClick={() => void addSlot()}>＋</button></section>
      <section className={styles.board}><div className={styles.boardHead}><div><h2>Planlama alanı</h2><p>Bir item seçerek bugünün akışına yerleştir.</p></div><button onClick={() => void addItem(null)}>＋ Item ekle</button></div><div className={styles.groupList} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveItem(event.dataTransfer.getData('text/item-id'), null)}>{groups.filter((group) => group.parent_id === null).map((group) => renderGroup(group))}{items.filter((item) => item.group_id === null).map(renderItem)}{groups.length === 0 && items.length === 0 && <div className={styles.empty}>İlk grubunu oluşturarak planını şekillendirmeye başla.</div>}</div></section>
    </main>
    {selectedItem && <div className={styles.overlay} onMouseDown={() => setSelectedItem(null)}><section className={styles.dialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Bugüne planla</span><button onClick={() => setSelectedItem(null)}>×</button></div><h2>{selectedItem.name}</h2><p>Bir veya birden fazla zaman dilimi seçebilirsin.</p><div className={styles.slotPicker}>{slots.map((slot) => { const chosen = assignments.some((assignment) => assignment.item_id === selectedItem.id && assignment.time_slot_id === slot.id && assignment.status === 'planned'); return <button key={slot.id} className={chosen ? styles.chosen : ''} onClick={() => void toggleSlot(slot.id)}><i style={{ background: slot.color ?? palette[0] }} /><span><strong>{slot.name}</strong><small>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</small></span><b>{chosen ? '✓' : ''}</b></button>; })}</div><button className={styles.primary} onClick={() => setSelectedItem(null)}>Tamam</button></section></div>}
    {focusOpen && <div className={styles.overlay} onMouseDown={() => setFocusOpen(false)}><section className={`${styles.dialog} ${styles.focusDialog}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className={styles.dialogTop}><span>Bugün</span><button onClick={() => setFocusOpen(false)}>×</button></div><h2>Bugünün Planı</h2><p>{planned.length} planlanmış item seni bekliyor.</p>{focusSlots.map((slot) => <div className={styles.focusSlot} key={slot.id}><header><i style={{ background: slot.color ?? palette[0] }} /><strong>{slot.name}</strong><span>{shortTime(slot.start_time)}–{shortTime(slot.end_time)}</span></header>{slot.entries.map(({ assignment, item }) => <button key={assignment.id} onClick={() => void completeAssignment(assignment.id)}><span className={styles.roundCheck}>✓</span><span><strong>{item?.name}</strong><small>{groups.find((group) => group.id === item?.group_id)?.name ?? 'Grupsuz'}</small></span><em>Planlandı</em></button>)}</div>)}{focusSlots.length === 0 && <div className={styles.empty}>Bugünün planında bekleyen item kalmadı.</div>}</section></div>}
  </div>;
}
