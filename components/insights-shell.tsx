'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppMenu } from './app-menu';
import styles from './planner-shell.module.css';

type Assignment = { id: string; item_id: string; time_slot_id: string; plan_date: string; status: 'planned' | 'done' | 'cancelled' };
type NameRow = { id: string; name: string; group_id?: string | null };
type ItemRow = NameRow & { kind: 'daily' | 'persistent' | 'metric'; metric_unit: string | null; color: string | null };
type MetricEntry = { id: string; item_id: string; entry_date: string; value: number };

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function InsightsShell({ user }: { user: User }) {
  return <div className={styles.app}><Analytics user={user} /></div>;
}

function Analytics({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [metricEntries, setMetricEntries] = useState<MetricEntry[]>([]);
  const [groups, setGroups] = useState<NameRow[]>([]);
  const [slots, setSlots] = useState<NameRow[]>([]);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - 29);
    void Promise.all([
      supabase.from('m_daily_assignments').select('id,item_id,time_slot_id,plan_date,status').gte('plan_date', isoDate(since)),
      supabase.from('m_items').select('id,name,group_id,kind,metric_unit,color').eq('is_active', true), supabase.from('m_groups').select('id,name'), supabase.from('m_time_slots').select('id,name'),
      supabase.from('m_metric_entries').select('id,item_id,entry_date,value').gte('entry_date', isoDate(since)).order('entry_date'),
    ]).then(([a, i, g, s, m]) => { setAssignments((a.data ?? []) as Assignment[]); setItems((i.data ?? []) as ItemRow[]); setGroups((g.data ?? []) as NameRow[]); setSlots((s.data ?? []) as NameRow[]); setMetricEntries((m.data ?? []) as MetricEntry[]); });
  }, [supabase]);

  const visibleSince = new Date(); visibleSince.setDate(visibleSince.getDate() - range + 1);
  const visible = assignments.filter((entry) => entry.plan_date >= isoDate(visibleSince));
  const actionable = visible.filter((entry) => entry.status !== 'cancelled');
  const done = actionable.filter((entry) => entry.status === 'done');
  const rate = actionable.length ? Math.round(done.length / actionable.length * 100) : 0;
  const days = Array.from({ length: range }, (_, index) => { const date = new Date(visibleSince); date.setDate(date.getDate() + index); const key = isoDate(date); const rows = actionable.filter((entry) => entry.plan_date === key); return { key, label: new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date), total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; });
  const groupStats = groups.map((group) => { const ids = items.filter((item) => item.group_id === group.id).map((item) => item.id); const rows = actionable.filter((entry) => ids.includes(entry.item_id)); return { name: group.name, total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; }).filter((group) => group.total).sort((a, b) => b.total - a.total);
  const slotStats = slots.map((slot) => { const rows = actionable.filter((entry) => entry.time_slot_id === slot.id); return { name: slot.name, total: rows.length, done: rows.filter((entry) => entry.status === 'done').length }; }).filter((slot) => slot.total).sort((a, b) => b.total - a.total);
  const metricItems = items.filter((item) => item.kind === 'metric');
  const visibleMetrics = metricEntries.filter((entry) => entry.entry_date >= isoDate(visibleSince));

  return <main className={styles.main}><header className={styles.header}><div><p>Plan ve gerçekleşen</p><h1>Analitik.</h1></div><div className={styles.headerActions}><div className={styles.rangeSwitch}><button className={range === 7 ? styles.activeRange : ''} onClick={() => setRange(7)}>7 gün</button><button className={range === 30 ? styles.activeRange : ''} onClick={() => setRange(30)}>30 gün</button></div><AppMenu user={user} active="analytics" /></div></header>
    <section className={styles.metricTrends}><div className={styles.sectionTitle}><div><span>Metrik trendleri</span><h2>Değişimi izle</h2></div></div><div className={styles.metricTrendGrid}>{metricItems.map((item) => <MetricTrend key={item.id} item={item} entries={visibleMetrics.filter((entry) => entry.item_id === item.id)} range={range} since={visibleSince} />)}{metricItems.length === 0 && <div className={styles.empty}>Grafiğini gösterecek bir metrik item bulunmuyor.</div>}</div></section>
    <section className={styles.summaryGrid}><div><span>Tamamlanma</span><strong>%{rate}</strong><small>{done.length} / {actionable.length} plan</small></div><div><span>Planlanan</span><strong>{actionable.length}</strong><small>Seçilen dönemde</small></div><div><span>İptal edilen</span><strong>{visible.filter((entry) => entry.status === 'cancelled').length}</strong><small>Geçmişte korunuyor</small></div></section>
    <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Günlük ritim</span><h2>Tamamlanan planlar</h2></div></div><div className={styles.dayChart}>{days.map((day) => <div key={day.key}><span><i style={{ height: `${day.total ? Math.max(8, day.done / day.total * 100) : 2}%` }} /></span><strong>{day.done}</strong><small>{range === 7 ? day.label : day.key.slice(8)}</small></div>)}</div></section>
    <div className={styles.breakdownGrid}><Breakdown title="Grup performansı" rows={groupStats} /><Breakdown title="Zaman dilimleri" rows={slotStats} /></div>
  </main>;
}

function MetricTrend({ item, entries, range, since }: { item: ItemRow; entries: MetricEntry[]; range: 7 | 30; since: Date }) {
  const rows = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const values = rows.map((entry) => Number(entry.value));
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const spread = maximum - minimum || 1;
  const start = new Date(since.getFullYear(), since.getMonth(), since.getDate()).getTime();
  const points = rows.map((entry) => {
    const date = new Date(`${entry.entry_date}T00:00:00`).getTime();
    const day = Math.max(0, Math.round((date - start) / 86400000));
    return { ...entry, x: day / (range - 1) * 100, y: 88 - (Number(entry.value) - minimum) / spread * 72 };
  });
  const latest = rows.at(-1); const first = rows[0];
  const change = latest && first ? Number(latest.value) - Number(first.value) : 0;
  const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

  return <article className={styles.metricTrendCard} style={{ '--metric-color': item.color ?? '#395f47' } as React.CSSProperties}><header><div><span>{item.name}</span><strong>{latest ? number.format(Number(latest.value)) : '—'} <small>{item.metric_unit}</small></strong></div>{rows.length > 1 && <em className={change > 0 ? styles.trendUp : change < 0 ? styles.trendDown : ''}>{change > 0 ? '+' : ''}{number.format(change)} {item.metric_unit}</em>}</header>{rows.length ? <><div className={styles.lineChart}><span className={styles.chartMax}>{number.format(maximum)}</span><span className={styles.chartMin}>{number.format(minimum)}</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${item.name} değer grafiği`}><title>{item.name} — {rows.length} kayıt</title><line x1="0" y1="16" x2="100" y2="16" /><line x1="0" y1="52" x2="100" y2="52" /><line x1="0" y1="88" x2="100" y2="88" /><polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />{points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="2"><title>{`${point.entry_date}: ${number.format(Number(point.value))} ${item.metric_unit ?? ''}`}</title></circle>)}</svg></div><footer><span>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(since)}</span><span>{rows.length} kayıt</span><span>Bugün</span></footer></> : <div className={styles.metricEmpty}>Bu dönemde henüz değer girilmedi.</div>}</article>;
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; total: number; done: number }[] }) {
  return <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Dağılım</span><h2>{title}</h2></div></div><div className={styles.breakdown}>{rows.map((row) => <div key={row.name}><header><strong>{row.name}</strong><span>{row.done}/{row.total}</span></header><i><b style={{ width: `${row.done / row.total * 100}%` }} /></i></div>)}{rows.length === 0 && <div className={styles.empty}>Bu dönem için yeterli veri yok.</div>}</div></section>;
}
