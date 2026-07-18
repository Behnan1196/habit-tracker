'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { ItemKind } from '@/types/domain';
import styles from './EditModal.module.css';

export type EditableItem = { id: string; group_id: string | null; kind: ItemKind; name: string; description: string | null; color: string | null; metric_unit: string | null; metric_period: 'daily' | 'weekly' | 'monthly' | null; activity_tag: string | null; activity_tags: string[]; estimated_minutes: number | null; is_in_plan: boolean };
export type ReminderDraft = { reminder_time: string; weekdays: number[]; is_enabled: boolean };
type GroupOption = { id: string; parent_id: string | null; name: string; content_type: 'standard' | 'module'; default_item_kind: ItemKind | null; default_time_slot_id: string | null; module_key: string | null; module_settings: Record<string, unknown>; is_in_plan: boolean };
type SlotOption = { id: string; name: string; start_time: string | null; end_time: string | null };
type ItemDraft = Omit<EditableItem, 'id'>;
export type EditableGroup = GroupOption & { color: string | null; background_color: string | null };
type GroupDraft = Omit<EditableGroup, 'id'>;
type EditorKind = ItemKind | 'group';

const colors = ['#ffffff', '#111111', '#395f47', '#638169', '#667e99', '#738aa6', '#8d76a4', '#ad765e', '#c48255', '#b18a4f', '#4f9186', '#747c76'];
const backgroundColors = ['#f4f5f1', ...colors];
function readableText(background: string) { const value = background.replace('#', ''); const [r, g, b] = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => Number.parseInt(part, 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#18201a' : '#ffffff'; }

export function ItemEditorModal({ item, group, initialGroupId, initialKind, initialIsInPlan = true, groups, slots, reminders, activityTags, onClose, onSave, onSaveGroup, onDelete }: { item?: EditableItem; group?: EditableGroup; initialGroupId: string | null; initialKind?: EditorKind; initialIsInPlan?: boolean; groups: GroupOption[]; slots: SlotOption[]; reminders: ReminderDraft[]; activityTags: string[]; onClose: () => void; onSave: (draft: ItemDraft, reminders: ReminderDraft[]) => Promise<void>; onSaveGroup: (draft: GroupDraft) => Promise<void>; onDelete?: () => Promise<void> }) {
  const mode: 'group' | 'metric' | 'activity' = group || initialKind === 'group' ? 'group' : item?.kind === 'metric' || initialKind === 'metric' ? 'metric' : 'activity';
  const [name, setName] = useState(item?.name ?? group?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [groupId, setGroupId] = useState(group?.parent_id ?? item?.group_id ?? initialGroupId);
  const [color, setColor] = useState(group?.color ?? item?.color ?? colors[2]);
  const [backgroundColor, setBackgroundColor] = useState(group?.background_color ?? '#f4f5f1');
  const [metricUnit, setMetricUnit] = useState(item?.metric_unit ?? '');
  const [metricPeriod, setMetricPeriod] = useState<'daily' | 'weekly' | 'monthly'>(item?.metric_period ?? 'daily');
  const [activityTag, setActivityTag] = useState(item?.activity_tag ?? groups.find((entry) => entry.id === initialGroupId)?.name ?? '');
  const [activityTagsValue, setActivityTagsValue] = useState((item?.activity_tags ?? []).join(', '));
  const [estimatedMinutes, setEstimatedMinutes] = useState(item?.estimated_minutes?.toString() ?? '');
  const [contentType, setContentType] = useState<'standard' | 'module'>(group?.content_type ?? 'standard');
  const [defaultTimeSlotId, setDefaultTimeSlotId] = useState(group?.default_time_slot_id ?? '');
  const [busy, setBusy] = useState(false);
  const isInPlan = item?.is_in_plan ?? group?.is_in_plan ?? initialIsInPlan;

  const groupOptions = useMemo(() => {
    function path(entry: GroupOption): string { const parent = groups.find((candidate) => candidate.id === entry.parent_id); return parent ? `${path(parent)} › ${entry.name}` : entry.name; }
    function descendsFrom(entry: GroupOption, id: string): boolean { if (!entry.parent_id) return false; if (entry.parent_id === id) return true; const parent = groups.find((candidate) => candidate.id === entry.parent_id); return parent ? descendsFrom(parent, id) : false; }
    return groups.filter((option) => !group || (option.id !== group.id && !descendsFrom(option, group.id))).map((option) => ({ id: option.id, label: path(option) })).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [group, groups]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || (mode === 'activity' && !groupId)) return; setBusy(true);
    if (mode === 'group') await onSaveGroup({ name: name.trim(), parent_id: groupId, color, background_color: backgroundColor, content_type: contentType, default_item_kind: null, default_time_slot_id: contentType === 'standard' ? defaultTimeSlotId || null : null, module_key: contentType === 'module' ? 'notes' : null, module_settings: group?.module_settings ?? {}, is_in_plan: isInPlan });
    else await onSave({ name: name.trim(), kind: mode === 'metric' ? 'metric' : 'daily', description: description.trim() || null, group_id: mode === 'metric' ? null : groupId, color, metric_unit: mode === 'metric' ? metricUnit.trim() || null : null, metric_period: mode === 'metric' ? metricPeriod : null, activity_tag: mode === 'activity' ? activityTag.trim() || null : null, activity_tags: mode === 'activity' ? Array.from(new Set(activityTagsValue.split(',').map((tag) => tag.trim()).filter(Boolean))) : [], estimated_minutes: mode === 'activity' && Number(estimatedMinutes) > 0 ? Number(estimatedMinutes) : null, is_in_plan: false }, reminders);
    setBusy(false);
  }

  const title = mode === 'group' ? group ? 'Grubu düzenle' : 'Yeni grup' : mode === 'metric' ? item ? 'Metriği düzenle' : 'Yeni metrik' : item ? 'Kütüphane kaydını düzenle' : 'Kütüphaneye ekle';
  return <div className={styles.overlay} onMouseDown={onClose}><form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="editor-title">
    <div className={styles.modalHeader}><div className={styles.header}><div><span className={styles.eyebrow}>{mode === 'group' ? 'Kütüphane düzeni' : mode === 'metric' ? 'Metrikler' : 'Aktivite Kütüphanesi'}</span><h2 id="editor-title">{title}</h2></div><button className={styles.closeBtn} type="button" onClick={onClose} aria-label="Kapat">×</button></div></div>
    <div className={styles.modalBody}>
      <label className={styles.label} htmlFor="item-name">İsim</label><input id="item-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === 'group' ? 'Örn. Egzersiz' : mode === 'metric' ? 'Örn. Kilo' : 'Örn. Sabah yürüyüşü'} autoFocus />
      {mode !== 'group' && <><label className={styles.label} htmlFor="item-description">Açıklama / Not</label><textarea id="item-description" className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Bu kayıt hakkında hatırlamak istediğin detaylar…" /></>}
      <div className={styles.fieldGrid}>
        {mode !== 'metric' && <div><label className={styles.label} htmlFor="item-group">{mode === 'group' ? 'Üst grup' : 'Grup'}</label><select id="item-group" className={styles.select} required={mode === 'activity'} value={groupId ?? ''} onChange={(event) => { const next = event.target.value || null; setGroupId(next); if (mode === 'activity' && !item) setActivityTag(groups.find((entry) => entry.id === next)?.name ?? ''); }}><option value="">{mode === 'group' ? 'Ana seviye' : 'Grup seç'}</option>{groupOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>}
        {mode === 'group' && <div><label className={styles.label} htmlFor="group-content">İçerik</label><select id="group-content" className={styles.select} value={contentType} onChange={(event) => setContentType(event.target.value as 'standard' | 'module')}><option value="standard">Kütüphane grubu</option><option value="module">Notlar modülü</option></select></div>}
        {mode === 'group' && contentType === 'standard' && <div><label className={styles.label} htmlFor="default-time-slot">Varsayılan zaman dilimi</label><select id="default-time-slot" className={styles.select} value={defaultTimeSlotId} onChange={(event) => setDefaultTimeSlotId(event.target.value)}><option value="">Belirtilmedi</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></div>}
        {mode === 'metric' && <><div><label className={styles.label} htmlFor="metric-unit">Birim</label><input id="metric-unit" className={styles.input} value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} placeholder="kg, cm, saat…" /></div><div><label className={styles.label} htmlFor="metric-period">Ölçüm periyodu</label><select id="metric-period" className={styles.select} value={metricPeriod} onChange={(event) => setMetricPeriod(event.target.value as 'daily' | 'weekly' | 'monthly')}><option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option></select></div></>}
        {mode === 'activity' && <><div><label className={styles.label} htmlFor="activity-tag">Ana kategori</label><input id="activity-tag" className={styles.input} list="activity-tags" value={activityTag} onChange={(event) => setActivityTag(event.target.value)} placeholder="Grup adından gelir" /><datalist id="activity-tags">{activityTags.map((tag) => <option key={tag} value={tag} />)}</datalist></div><div><label className={styles.label} htmlFor="estimated-minutes">Tahmini süre</label><div className={styles.unitInput}><input id="estimated-minutes" className={styles.input} type="number" min="5" step="5" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} placeholder="45" /><span>dk</span></div></div><div style={{ gridColumn: '1 / -1' }}><label className={styles.label} htmlFor="activity-tags">Amaçlar / Etkiler</label><input id="activity-tags" className={styles.input} value={activityTagsValue} onChange={(event) => setActivityTagsValue(event.target.value)} placeholder="Mental, Açık hava, Sosyal (virgülle ayır)" /></div></>}
      </div>
      <label className={styles.label}>Renk</label><div className={styles.colorGrid}>{colors.map((option) => <button key={option} type="button" aria-label={`Renk ${option}`} className={`${styles.colorDot} ${color === option ? styles.selectedColor : ''}`} style={{ background: option }} onClick={() => setColor(option)} />)}</div>
      {mode === 'group' && <><label className={styles.label}>Arka plan</label><div className={styles.colorGrid}>{backgroundColors.map((option) => <button key={option} type="button" aria-label={`Arka plan ${option}`} className={`${styles.colorDot} ${backgroundColor === option ? styles.selectedColor : ''}`} style={{ background: option }} onClick={() => setBackgroundColor(option)} />)}</div></>}
      <div className={styles.preview} style={mode === 'group' ? { background: backgroundColor, color: readableText(backgroundColor) } : undefined}><i style={{ background: color }} /><div><strong>{name.trim() || 'Önizleme'}</strong><small>{mode === 'group' ? contentType === 'module' ? 'Notlar modülü' : 'Kütüphane grubu' : mode === 'metric' ? `${metricPeriod === 'daily' ? 'Günlük' : metricPeriod === 'weekly' ? 'Haftalık' : 'Aylık'} metrik${metricUnit ? ` · ${metricUnit}` : ''}` : `${activityTag || 'Kütüphane kaydı'}${estimatedMinutes ? ` · ${estimatedMinutes} dk` : ''}`}</small></div></div>
    </div>
    <div className={styles.modalFooter}><div className={styles.actions}>{(item || group) && onDelete && <button className={styles.deleteBtn} type="button" disabled={busy} onClick={() => void onDelete()}>Sil</button>}<span /><button className={styles.cancelBtn} type="button" onClick={onClose}>Vazgeç</button><button className={styles.saveBtn} disabled={busy || !name.trim() || (mode === 'activity' && !groupId)}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div></div>
  </form></div>;
}
