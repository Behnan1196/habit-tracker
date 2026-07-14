'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppMenu } from './app-menu';
import styles from './planner-shell.module.css';

type Assignment = { id: string; item_id: string; time_slot_id: string; plan_date: string; status: 'planned' | 'done' | 'cancelled' };
type NameRow = { id: string; name: string; group_id?: string | null };

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function InsightsShell({ user }: { user: User }) {
  return <div className={styles.app}><Analytics user={user} /></div>;
}

function Analytics({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [items, setItems] = useState<NameRow[]>([]);
  const [groups, setGroups] = useState<NameRow[]>([]);
  const [slots, setSlots] = useState<NameRow[]>([]);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - 29);
    void Promise.all([
      supabase.from('m_daily_assignments').select('id,item_id,time_slot_id,plan_date,status').gte('plan_date', isoDate(since)),
      supabase.from('m_items').select('id,name,group_id'), supabase.from('m_groups').select('id,name'), supabase.from('m_time_slots').select('id,name'),
    ]).then(([a, i, g, s]) => { setAssignments((a.data ?? []) as Assignment[]); setItems((i.data ?? []) as NameRow[]); setGroups((g.data ?? []) as NameRow[]); setSlots((s.data ?? []) as NameRow[]); });
  }, [supabase]);

  const visibleSince = new Date(); visibleSince.setDate(visibleSince.getDate() - range + 1);
  const visible = assignments.filter((entry) => entry.plan_date >= isoDate(visibleSince));
  const actionable = visible.filter((entry) => entry.status !== 'cancelled');
  const done = actionable.filter((entry) => entry.status === 'done');
  const rate = actionable.length ? Math.round(done.length / actionable.length * 100) : 0;
  const days = Array.from({ length: range }, (_, index) => { const date = new Date(visibleSince); date.setDate(date.getDate() + index); const key = isoDate(date); const rows = actionable.filter((entry) => entry.plan_date === key); return { key, label: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date), total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; });
  const groupStats = groups.map((group) => { const ids = items.filter((item) => item.group_id === group.id).map((item) => item.id); const rows = actionable.filter((entry) => ids.includes(entry.item_id)); return { name: group.name, total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; }).filter((group) => group.total).sort((a, b) => b.total - a.total);
  const slotStats = slots.map((slot) => { const rows = actionable.filter((entry) => entry.time_slot_id === slot.id); return { name: slot.name, total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; }).filter((slot) => slot.total).sort((a, b) => b.total - a.total);

  return <main className={styles.main}><header className={styles.header}><div><p>Plan ve gerçekleşen</p><h1>Analitik.</h1></div><div className={styles.headerActions}><div className={styles.rangeSwitch}><button className={range === 7 ? styles.activeRange : ''} onClick={() => setRange(7)}>7 gün</button><button className={range === 30 ? styles.activeRange : ''} onClick={() => setRange(30)}>30 gün</button></div><AppMenu user={user} active="analytics" /></div></header>
    <section className={styles.summaryGrid}><div><span>Tamamlanma</span><strong>%{rate}</strong><small>{done.length} / {actionable.length} plan</small></div><div><span>Planlanan</span><strong>{actionable.length}</strong><small>Seçilen dönemde</small></div><div><span>İptal edilen</span><strong>{visible.filter((entry) => entry.status === 'cancelled').length}</strong><small>Geçmişte korunuyor</small></div></section>
    <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Günlük ritim</span><h2>Tamamlanan planlar</h2></div></div><div className={styles.dayChart}>{days.map((day) => <div key={day.key}><span><i style={{ height: `${day.total ? Math.max(8, day.done / day.total * 100) : 2}%` }} /></span><strong>{day.done}</strong><small>{range === 7 ? day.label : day.key.slice(8)}</small></div>)}</div></section>
    <div className={styles.breakdownGrid}><Breakdown title="Grup performansı" rows={groupStats} /><Breakdown title="Zaman dilimleri" rows={slotStats} /></div>
  </main>;
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; total: number; done: number }[] }) {
  return <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Dağılım</span><h2>{title}</h2></div></div><div className={styles.breakdown}>{rows.map((row) => <div key={row.name}><header><strong>{row.name}</strong><span>{row.done}/{row.total}</span></header><i><b style={{ width: `${row.done / row.total * 100}%` }} /></i></div>)}{rows.length === 0 && <div className={styles.empty}>Bu dönem için yeterli veri yok.</div>}</div></section>;
}
