'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AppMenu } from './app-menu';
import styles from './planner-shell.module.css';

type GroupRow = { id: string; parent_id: string | null; name: string };
type ItemRow = { id: string; name: string; group_id: string | null; kind: 'daily' | 'persistent' | 'metric'; metric_unit: string | null; metric_period: 'daily' | 'weekly' | 'monthly' | null; activity_tag: string | null; estimated_minutes: number | null; color: string | null };
type MetricEntry = { id: string; item_id: string; entry_date: string; value: number };
type CompletedAssignment = { id: string; item_id: string; plan_date: string; actual_duration_minutes: number | null };
type Range = 7 | 30 | 90 | 365;

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function InsightsShell({ user }: { user: User }) {
  return <div className={styles.app}><Analytics user={user} /></div>;
}

function Analytics({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [entries, setEntries] = useState<MetricEntry[]>([]);
  const [completed, setCompleted] = useState<CompletedAssignment[]>([]);
  const [range, setRange] = useState<Range>(90);
  const [activityRange, setActivityRange] = useState<1 | 7 | 30>(7);

  useEffect(() => {
    const since = new Date(); since.setDate(since.getDate() - 364);
    void Promise.all([
      supabase.from('m_items').select('id,name,group_id,kind,metric_unit,metric_period,activity_tag,estimated_minutes,color').eq('is_active', true).order('position'),
      supabase.from('m_groups').select('id,parent_id,name').order('position'),
      supabase.from('m_metric_entries').select('id,item_id,entry_date,value').gte('entry_date', isoDate(since)).order('entry_date'),
      supabase.from('m_daily_assignments').select('id,item_id,plan_date,actual_duration_minutes').eq('status', 'done').gte('plan_date', isoDate(since)).order('plan_date'),
    ]).then(([itemResult, groupResult, entryResult, completedResult]) => {
      setItems((itemResult.data ?? []) as ItemRow[]);
      setGroups((groupResult.data ?? []) as GroupRow[]);
      setEntries((entryResult.data ?? []) as MetricEntry[]);
      setCompleted((completedResult.data ?? []) as CompletedAssignment[]);
    });
  }, [supabase]);

  const since = new Date(); since.setDate(since.getDate() - range + 1);
  const visibleEntries = entries.filter((entry) => entry.entry_date >= isoDate(since));
  const metricItems = items.filter((item) => item.kind === 'metric');
  const metricsRoot = groups.find((group) => group.name.trim().toLocaleLowerCase('tr-TR') === 'metrics');

  function categoryFor(item: ItemRow) {
    let group = groups.find((candidate) => candidate.id === item.group_id);
    if (!group) return 'Diğer metrikler';
    if (!metricsRoot) return group.name;
    if (group.id === metricsRoot.id) return 'Genel';
    while (group.parent_id && group.parent_id !== metricsRoot.id) {
      const parent = groups.find((candidate) => candidate.id === group?.parent_id);
      if (!parent) break;
      group = parent;
    }
    return group.parent_id === metricsRoot.id ? group.name : 'Diğer metrikler';
  }

  const categories = Array.from(new Set(metricItems.map(categoryFor))).map((name) => ({ name, items: metricItems.filter((item) => categoryFor(item) === name) }));
  const activitySince = new Date(); activitySince.setDate(activitySince.getDate() - activityRange + 1);
  const activityRows = completed.filter((entry) => entry.plan_date >= isoDate(activitySince)).map((entry) => ({ entry, item: items.find((item) => item.id === entry.item_id) })).filter((row) => row.item?.kind === 'daily' && row.item.activity_tag && (row.entry.actual_duration_minutes || row.item.estimated_minutes));
  const activityStats = Array.from(new Set(activityRows.map((row) => row.item!.activity_tag!))).map((tag) => ({ tag, minutes: activityRows.filter((row) => row.item!.activity_tag === tag).reduce((sum, row) => sum + (row.entry.actual_duration_minutes ?? row.item!.estimated_minutes ?? 0), 0) })).sort((a, b) => b.minutes - a.minutes);

  return <main className={styles.main}><header className={styles.header}><div><p>Ölç, gözlemle, karşılaştır</p><h1>Analitik.</h1></div><div className={styles.headerActions}><div className={styles.rangeSwitch}><button className={range === 7 ? styles.activeRange : ''} onClick={() => setRange(7)}>7 gün</button><button className={range === 30 ? styles.activeRange : ''} onClick={() => setRange(30)}>30 gün</button><button className={range === 90 ? styles.activeRange : ''} onClick={() => setRange(90)}>3 ay</button><button className={range === 365 ? styles.activeRange : ''} onClick={() => setRange(365)}>1 yıl</button></div><AppMenu user={user} active="analytics" /></div></header>
    <ActivityDuration stats={activityStats} range={activityRange} onRangeChange={setActivityRange} />
    <div className={styles.metricCategories}>{categories.map((category) => <section className={styles.metricCategory} key={category.name}><div className={styles.metricCategoryTitle}><span>{category.items.length} metrik</span><h2>{category.name}</h2></div><div className={styles.metricTrendGrid}>{category.items.map((item) => <MetricTrend key={item.id} item={item} entries={visibleEntries.filter((entry) => entry.item_id === item.id)} range={range} since={since} />)}</div></section>)}{metricItems.length === 0 && <div className={styles.empty}>Henüz grafik oluşturacak bir metrik bulunmuyor.</div>}</div>
  </main>;
}

function ActivityDuration({ stats, range, onRangeChange }: { stats: { tag: string; minutes: number }[]; range: 1 | 7 | 30; onRangeChange: (range: 1 | 7 | 30) => void }) {
  const total = stats.reduce((sum, row) => sum + row.minutes, 0);
  const maximum = Math.max(...stats.map((row) => row.minutes), 1);
  const colors = ['#395f47', '#c48255', '#667e99', '#8d76a4', '#b18a4f', '#4f9186', '#ad765e'];
  const slices = stats.reduce<{ cursor: number; values: string[] }>((result, row, index) => {
    const end = result.cursor + (total ? row.minutes / total * 100 : 0);
    return { cursor: end, values: [...result.values, `${colors[index % colors.length]} ${result.cursor}% ${end}%`] };
  }, { cursor: 0, values: [] }).values;
  function duration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} sa${rest ? ` ${rest} dk` : ''}` : `${rest} dk`; }
  return <section className={styles.activityAnalytics}><div className={styles.activityHeading}><div className={styles.metricCategoryTitle}><span>Tamamlanan aktiviteler</span><h2>Zaman dağılımı</h2></div><div className={styles.activityRange}><button className={range === 1 ? styles.activeRange : ''} onClick={() => onRangeChange(1)}>Bugün</button><button className={range === 7 ? styles.activeRange : ''} onClick={() => onRangeChange(7)}>7 gün</button><button className={range === 30 ? styles.activeRange : ''} onClick={() => onRangeChange(30)}>30 gün</button></div></div>{stats.length ? <div className={styles.activityVisual}><div className={styles.activityPie} style={{ background: `conic-gradient(${slices.join(', ')})` }} role="img" aria-label="Aktivite süre dağılımı"><div><strong>{duration(total)}</strong><small>toplam</small></div></div><div className={styles.activityBars}>{stats.map((row, index) => <div key={row.tag}><header><strong><i style={{ background: colors[index % colors.length] }} />{row.tag}</strong><span>{duration(row.minutes)}</span></header><b><em style={{ width: `${row.minutes / maximum * 100}%`, background: colors[index % colors.length] }} /></b></div>)}</div></div> : <div className={styles.metricEmpty}>Bu dönemde süre bilgisi olan tamamlanmış aktivite yok.</div>}</section>;
}

function MetricTrend({ item, entries, range, since }: { item: ItemRow; entries: MetricEntry[]; range: Range; since: Date }) {
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
  const period = item.metric_period === 'daily' ? 'Günlük' : item.metric_period === 'weekly' ? 'Haftalık' : 'Aylık';

  return <article className={styles.metricTrendCard} style={{ '--metric-color': item.color ?? '#395f47' } as React.CSSProperties}><header><div><span>{period} ölçüm</span><h3>{item.name}</h3><strong>{latest ? number.format(Number(latest.value)) : '—'} <small>{item.metric_unit}</small></strong></div>{rows.length > 1 && <em className={change > 0 ? styles.trendUp : change < 0 ? styles.trendDown : ''}>{change > 0 ? '+' : ''}{number.format(change)} {item.metric_unit}</em>}</header>{rows.length ? <><div className={styles.lineChart}><span className={styles.chartMax}>{number.format(maximum)}</span><span className={styles.chartMin}>{number.format(minimum)}</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${item.name} değer grafiği`}><title>{item.name} — {rows.length} kayıt</title><line x1="0" y1="16" x2="100" y2="16" /><line x1="0" y1="52" x2="100" y2="52" /><line x1="0" y1="88" x2="100" y2="88" /><polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />{points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="2"><title>{`${point.entry_date}: ${number.format(Number(point.value))} ${item.metric_unit ?? ''}`}</title></circle>)}</svg></div><footer><span>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(since)}</span><span>{rows.length} kayıt</span><span>{latest ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(new Date(`${latest.entry_date}T00:00:00`)) : 'Bugün'}</span></footer></> : <div className={styles.metricEmpty}>Bu dönemde henüz değer girilmedi.</div>}</article>;
}
