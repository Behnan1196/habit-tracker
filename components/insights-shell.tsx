'use client';

import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './planner-shell.module.css';

type MetricItem = { id: string; name: string; metric_unit: string | null; color: string | null; group_id: string | null };
type MetricEntry = { id: string; item_id: string; entry_date: string; value: number; note: string | null };
type Assignment = { id: string; item_id: string; time_slot_id: string; plan_date: string; status: 'planned' | 'done' | 'cancelled' };
type NameRow = { id: string; name: string; group_id?: string | null };

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function Sidebar({ user, active }: { user: User; active: 'metrics' | 'analytics' }) {
  const supabase = useMemo(() => createClient(), []);
  return <aside className={styles.sidebar}>
    <div className={styles.brand}><span>M</span> momentum</div>
    <nav className={styles.nav}>
      <Link href="/"><span>◫</span> Bugün</Link>
      <Link className={active === 'analytics' ? styles.active : ''} href="/analytics"><span>⌁</span> Analitik</Link>
      <Link className={active === 'metrics' ? styles.active : ''} href="/metrics"><span>◇</span> Metrikler</Link>
    </nav>
    <div className={styles.sidebarBottom}><div className={styles.profile}><span>{user.email?.slice(0, 2).toUpperCase()}</span><div><strong>{user.email?.split('@')[0]}</strong><button onClick={() => void supabase.auth.signOut()}>Çıkış yap</button></div></div></div>
  </aside>;
}

export function InsightsShell({ user, view }: { user: User; view: 'metrics' | 'analytics' }) {
  return <div className={styles.app}><Sidebar user={user} active={view} />{view === 'metrics' ? <Metrics user={user} /> : <Analytics />}</div>;
}

function Metrics({ user }: { user: User }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<MetricItem[]>([]);
  const [entries, setEntries] = useState<MetricEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const since = new Date(); since.setDate(since.getDate() - 89);
    const [itemResult, entryResult] = await Promise.all([
      supabase.from('m_items').select('id,name,metric_unit,color,group_id').eq('kind', 'metric').eq('is_active', true).order('position'),
      supabase.from('m_metric_entries').select('id,item_id,entry_date,value,note').gte('entry_date', isoDate(since)).order('entry_date'),
    ]);
    setItems((itemResult.data ?? []) as MetricItem[]);
    setEntries((entryResult.data ?? []) as MetricEntry[]);
    if (!selected && itemResult.data?.[0]) setSelected(itemResult.data[0].id);
    setMessage(itemResult.error?.message ?? entryResult.error?.message ?? '');
  }, [selected, supabase]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || value === '') return;
    const { error } = await supabase.from('m_metric_entries').upsert({ user_id: user.id, item_id: selected, entry_date: date, value: Number(value), note: note.trim() || null }, { onConflict: 'user_id,item_id,entry_date' });
    if (error) setMessage(error.message); else { setValue(''); setNote(''); setMessage('Değer kaydedildi.'); await load(); }
  }

  async function addMetric() {
    const name = window.prompt('Yeni metriğin adı');
    if (!name?.trim()) return;
    const unit = window.prompt('Birim (kg, saat, cm, adet...)', 'kg');
    const { error } = await supabase.from('m_items').insert({ user_id: user.id, name: name.trim(), kind: 'metric', metric_unit: unit?.trim() || null, position: items.length });
    if (error) setMessage(error.message); else await load();
  }

  return <main className={styles.main}>
    <header className={styles.header}><div><p>Günlük kayıtlar</p><h1>Metrikler.</h1></div><button className={styles.focusButton} onClick={() => void addMetric()}>＋ Yeni metrik</button></header>
    {message && <button className={styles.notice} onClick={() => setMessage('')}>{message} ×</button>}
    <section className={styles.metricGrid}>
      {items.map((item) => {
        const history = entries.filter((entry) => entry.item_id === item.id);
        const latest = history.at(-1); const previous = history.at(-2);
        const values = history.map((entry) => Number(entry.value)); const min = Math.min(...values, 0); const max = Math.max(...values, 1);
        return <button key={item.id} className={`${styles.metricCard} ${selected === item.id ? styles.metricSelected : ''}`} onClick={() => setSelected(item.id)}>
          <span>{item.name}</span><strong>{latest?.value ?? '—'} <small>{item.metric_unit}</small></strong>
          <em>{latest && previous ? `${Number(latest.value) - Number(previous.value) >= 0 ? '+' : ''}${(Number(latest.value) - Number(previous.value)).toFixed(1)} son kayda göre` : 'Henüz karşılaştırma yok'}</em>
          <div className={styles.sparkBars}>{history.slice(-14).map((entry) => <i key={entry.id} style={{ height: `${18 + ((Number(entry.value) - min) / (max - min || 1)) * 52}%` }} />)}</div>
        </button>;
      })}
      {items.length === 0 && <div className={styles.empty}>İlk metriğini ekleyerek günlük değerlerini takip etmeye başla.</div>}
    </section>
    {items.length > 0 && <form className={styles.metricForm} onSubmit={save}><div><span>Yeni kayıt</span><h2>{items.find((item) => item.id === selected)?.name}</h2></div><label>Tarih<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Değer<input type="number" step="any" required value={value} onChange={(event) => setValue(event.target.value)} /></label><label className={styles.noteField}>Not<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="İsteğe bağlı" /></label><button className={styles.primary}>Kaydet</button></form>}
  </main>;
}

function Analytics() {
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

  return <main className={styles.main}><header className={styles.header}><div><p>Plan ve gerçekleşen</p><h1>Analitik.</h1></div><div className={styles.rangeSwitch}><button className={range === 7 ? styles.activeRange : ''} onClick={() => setRange(7)}>7 gün</button><button className={range === 30 ? styles.activeRange : ''} onClick={() => setRange(30)}>30 gün</button></div></header>
    <section className={styles.summaryGrid}><div><span>Tamamlanma</span><strong>%{rate}</strong><small>{done.length} / {actionable.length} plan</small></div><div><span>Planlanan</span><strong>{actionable.length}</strong><small>Seçilen dönemde</small></div><div><span>İptal edilen</span><strong>{visible.filter((entry) => entry.status === 'cancelled').length}</strong><small>Geçmişte korunuyor</small></div></section>
    <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Günlük ritim</span><h2>Tamamlanan planlar</h2></div></div><div className={styles.dayChart}>{days.map((day) => <div key={day.key}><span><i style={{ height: `${day.total ? Math.max(8, day.done / day.total * 100) : 2}%` }} /></span><strong>{day.done}</strong><small>{range === 7 ? day.label : day.key.slice(8)}</small></div>)}</div></section>
    <div className={styles.breakdownGrid}><Breakdown title="Grup performansı" rows={groupStats} /><Breakdown title="Zaman dilimleri" rows={slotStats} /></div>
  </main>;
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; total: number; done: number }[] }) {
  return <section className={styles.analyticsCard}><div className={styles.sectionTitle}><div><span>Dağılım</span><h2>{title}</h2></div></div><div className={styles.breakdown}>{rows.map((row) => <div key={row.name}><header><strong>{row.name}</strong><span>{row.done}/{row.total}</span></header><i><b style={{ width: `${row.done / row.total * 100}%` }} /></i></div>)}{rows.length === 0 && <div className={styles.empty}>Bu dönem için yeterli veri yok.</div>}</div></section>;
}
