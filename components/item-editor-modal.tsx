'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { ItemKind } from '@/types/domain';
import styles from './EditModal.module.css';

export type EditableItem = {
  id: string;
  group_id: string | null;
  kind: ItemKind;
  name: string;
  description: string | null;
  color: string | null;
  metric_unit: string | null;
  metric_period: 'daily' | 'weekly' | 'monthly' | null;
  activity_tag: string | null;
  estimated_minutes: number | null;
  is_in_plan: boolean;
};
export type ReminderDraft = { reminder_time: string; weekdays: number[]; is_enabled: boolean };

type GroupOption = { id: string; parent_id: string | null; name: string; content_type: 'standard' | 'module'; default_item_kind: ItemKind | null; default_time_slot_id: string | null; module_key: string | null; module_settings: Record<string, unknown>; is_in_plan: boolean };
type SlotOption = { id: string; name: string; start_time: string | null; end_time: string | null };
type ItemDraft = Omit<EditableItem, 'id'>;
export type EditableGroup = GroupOption & { color: string | null; background_color: string | null };
type GroupDraft = Omit<EditableGroup, 'id'>;
type EditorKind = ItemKind | 'group';

const colors = ['#ffffff', '#111111', '#395f47', '#638169', '#667e99', '#738aa6', '#8d76a4', '#ad765e', '#c48255', '#b18a4f', '#4f9186', '#747c76'];
const backgroundColors = ['#f4f5f1', ...colors];

function readableText(background: string) {
  const value = background.replace('#', '');
  const [red, green, blue] = [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => Number.parseInt(part, 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#18201a' : '#ffffff';
}

export function ItemEditorModal({ item, group, initialGroupId, initialKind, initialIsInPlan = true, groups, slots, reminders, activityTags, onClose, onSave, onSaveGroup, onDelete }: {
  item?: EditableItem;
  group?: EditableGroup;
  initialGroupId: string | null;
  initialKind?: EditorKind;
  initialIsInPlan?: boolean;
  groups: GroupOption[];
  slots: SlotOption[];
  reminders: ReminderDraft[];
  activityTags: string[];
  onClose: () => void;
  onSave: (draft: ItemDraft, reminders: ReminderDraft[]) => Promise<void>;
  onSaveGroup: (draft: GroupDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? group?.name ?? '');
  const [kind, setKind] = useState<EditorKind>(group ? 'group' : item?.kind ?? initialKind ?? 'daily');
  const [description, setDescription] = useState(item?.description ?? '');
  const [groupId, setGroupId] = useState(group?.parent_id ?? item?.group_id ?? initialGroupId);
  const [color, setColor] = useState(group?.color ?? item?.color ?? colors[2]);
  const [backgroundColor, setBackgroundColor] = useState(group?.background_color ?? '#f4f5f1');
  const [metricUnit, setMetricUnit] = useState(item?.metric_unit ?? '');
  const [metricPeriod, setMetricPeriod] = useState<'daily' | 'weekly' | 'monthly'>(item?.metric_period ?? 'daily');
  const [activityTag, setActivityTag] = useState(item?.activity_tag ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(item?.estimated_minutes?.toString() ?? '');
  const isInPlan = item?.is_in_plan ?? group?.is_in_plan ?? initialIsInPlan;
  const [contentType, setContentType] = useState<'standard' | 'module'>(group?.content_type ?? 'standard');
  const [defaultItemKind, setDefaultItemKind] = useState<ItemKind | null>(group?.default_item_kind ?? null);
  const [defaultTimeSlotId, setDefaultTimeSlotId] = useState(group?.default_time_slot_id ?? '');
  const [reminderDrafts] = useState<ReminderDraft[]>(reminders);
  const [busy, setBusy] = useState(false);

  function inheritedKind(targetGroupId: string | null): ItemKind {
    let current = targetGroupId ? groups.find((candidate) => candidate.id === targetGroupId) : undefined;
    while (current) {
      if (current.content_type === 'standard' && current.default_item_kind) return current.default_item_kind;
      current = current.parent_id ? groups.find((candidate) => candidate.id === current!.parent_id) : undefined;
    }
    return 'daily';
  }

  const groupOptions = useMemo(() => {
    function path(group: GroupOption): string {
      const parent = groups.find((candidate) => candidate.id === group.parent_id);
      return parent ? `${path(parent)} › ${group.name}` : group.name;
    }
    function hasAncestor(candidate: GroupOption, ancestorId: string): boolean {
      if (!candidate.parent_id) return false;
      if (candidate.parent_id === ancestorId) return true;
      const parent = groups.find((entry) => entry.id === candidate.parent_id);
      return parent ? hasAncestor(parent, ancestorId) : false;
    }
    return groups.filter((option) => !group || (option.id !== group.id && !hasAncestor(option, group.id))).map((option) => ({ id: option.id, label: path(option) })).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [group, groups]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    if (kind === 'group') await onSaveGroup({ name: name.trim(), parent_id: groupId, color, background_color: backgroundColor, content_type: contentType, default_item_kind: contentType === 'standard' ? defaultItemKind : null, default_time_slot_id: contentType === 'standard' ? defaultTimeSlotId || null : null, module_key: contentType === 'module' ? 'notes' : null, module_settings: {}, is_in_plan: isInPlan });
    else await onSave({ name: name.trim(), kind, description: description.trim() || null, group_id: groupId, color, metric_unit: kind === 'metric' ? metricUnit.trim() || null : null, metric_period: kind === 'metric' ? metricPeriod : null, activity_tag: kind === 'daily' ? activityTag.trim() || null : null, estimated_minutes: kind === 'daily' && Number(estimatedMinutes) > 0 ? Number(estimatedMinutes) : null, is_in_plan: isInPlan }, reminderDrafts);
    setBusy(false);
  }

  return <div className={styles.overlay} onMouseDown={onClose}>
    <form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className={styles.modalHeader}><div className={styles.header}><div><span className={styles.eyebrow}>{item || group ? 'Düzenleme' : 'Yeni kayıt'}</span><h2 id="editor-title">{group ? 'Grubu düzenle' : item ? 'Item’ı düzenle' : 'Planına ekle'}</h2></div><button className={styles.closeBtn} type="button" onClick={onClose} aria-label="Kapat">×</button></div></div>
      <div className={styles.modalBody}>
        <div className={styles.typeToggle}>
          <button className={`${styles.typeBtn} ${kind === 'daily' ? styles.active : ''}`} type="button" onClick={() => setKind('daily')}><strong>Günlük</strong><small>Gün ve saate planlanır</small></button>
          <button className={`${styles.typeBtn} ${kind === 'persistent' ? styles.active : ''}`} type="button" onClick={() => setKind('persistent')}><strong>Sabit</strong><small>Bir güne bağlı değildir</small></button>
          <button className={`${styles.typeBtn} ${kind === 'metric' ? styles.active : ''}`} type="button" onClick={() => setKind('metric')}><strong>Metrik</strong><small>Sayısal değer tutulur</small></button>
          <button className={`${styles.typeBtn} ${kind === 'group' ? styles.active : ''}`} type="button" onClick={() => setKind('group')}><strong>Grup</strong><small>Alt kayıtları toplar</small></button>
        </div>

        {group && kind !== 'group' && <p className={styles.conversionNote}>Grubun altındaki kayıtlar üst gruba taşınır; bu kayıt seçtiğin item tipine dönüşür.</p>}
        {item && kind === 'group' && <p className={styles.conversionNote}>Item’ın geçmiş plan ve metrik kayıtları silinir; bu kayıt gruba dönüşür.</p>}

        <label className={styles.label} htmlFor="item-name">İsim</label>
        <input id="item-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'group' ? 'Örn. Sağlık' : kind === 'metric' ? 'Örn. Kilo' : 'Örn. Sabah yürüyüşü'} autoFocus />

        {kind !== 'group' && <><label className={styles.label} htmlFor="item-description">Açıklama / Not</label><textarea id="item-description" className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Bu item hakkında hatırlamak istediğin detaylar…" /></>}

        <div className={styles.fieldGrid}>
          <div><label className={styles.label} htmlFor="item-group">{kind === 'group' ? 'Üst grup' : 'Grup'}</label><select id="item-group" className={styles.select} value={groupId ?? ''} onChange={(event) => { const nextGroupId = event.target.value || null; setGroupId(nextGroupId); if (!item && !group && kind !== 'group') setKind(inheritedKind(nextGroupId)); }}><option value="">{kind === 'group' ? 'Ana seviye' : 'Grupsuz'}</option>{groupOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
          {kind === 'group' && <div><label className={styles.label} htmlFor="group-content">İçerik</label><select id="group-content" className={styles.select} value={contentType} onChange={(event) => setContentType(event.target.value as 'standard' | 'module')}><option value="standard">Standart grup</option><option value="module">Notlar modülü</option></select></div>}
          {kind === 'group' && contentType === 'standard' && <div><label className={styles.label} htmlFor="default-item-kind">Varsayılan item tipi</label><select id="default-item-kind" className={styles.select} value={defaultItemKind ?? ''} onChange={(event) => setDefaultItemKind((event.target.value || null) as ItemKind | null)}><option value="">{groupId ? 'Üst gruptan devral' : 'Belirtilmedi (Günlük)'}</option><option value="daily">Günlük</option><option value="persistent">Sabit</option><option value="metric">Metrik</option></select></div>}
          {kind === 'group' && contentType === 'standard' && <div><label className={styles.label} htmlFor="default-time-slot">Varsayılan zaman dilimi</label><select id="default-time-slot" className={styles.select} value={defaultTimeSlotId} onChange={(event) => setDefaultTimeSlotId(event.target.value)}><option value="">{groupId ? 'Üst gruptan devral' : 'Belirtilmedi'}</option>{slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></div>}
          {kind === 'metric' && <div><label className={styles.label} htmlFor="metric-unit">Birim</label><input id="metric-unit" className={styles.input} value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} placeholder="kg, cm, saat…" /></div>}
          {kind === 'metric' && <div><label className={styles.label} htmlFor="metric-period">Ölçüm periyodu</label><select id="metric-period" className={styles.select} value={metricPeriod} onChange={(event) => setMetricPeriod(event.target.value as 'daily' | 'weekly' | 'monthly')}><option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="monthly">Aylık</option></select></div>}
          {kind === 'daily' && <div><label className={styles.label} htmlFor="activity-tag">Aktivite etiketi</label><input id="activity-tag" className={styles.input} list="activity-tags" value={activityTag} onChange={(event) => setActivityTag(event.target.value)} placeholder="Örn. Egzersiz" /><datalist id="activity-tags">{activityTags.map((tag) => <option key={tag} value={tag} />)}</datalist></div>}
          {kind === 'daily' && <div><label className={styles.label} htmlFor="estimated-minutes">Tahmini süre</label><div className={styles.unitInput}><input id="estimated-minutes" className={styles.input} type="number" min="5" step="5" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} placeholder="45" /><span>dk</span></div></div>}
        </div>

        <label className={styles.label}>Renk</label>
        <div className={styles.colorGrid}>{colors.map((option) => <button key={option} type="button" aria-label={`Renk ${option}`} className={`${styles.colorDot} ${color === option ? styles.selectedColor : ''}`} style={{ background: option }} onClick={() => setColor(option)} />)}</div>
        {kind === 'group' && <><label className={styles.label}>Arka plan</label><div className={styles.colorGrid}>{backgroundColors.map((option) => <button key={option} type="button" aria-label={`Arka plan ${option}`} className={`${styles.colorDot} ${backgroundColor === option ? styles.selectedColor : ''}`} style={{ background: option }} onClick={() => setBackgroundColor(option)} />)}</div></>}
        <div className={styles.preview} style={kind === 'group' ? { background: backgroundColor, color: readableText(backgroundColor) } : undefined}><i style={{ background: color }} /><div><strong>{name.trim() || 'Önizleme'}</strong><small>{kind === 'group' ? contentType === 'module' ? 'Notlar modülü' : 'Standart grup' : kind === 'daily' ? `Günlük${activityTag ? ` · ${activityTag}` : ''}${estimatedMinutes ? ` · ${estimatedMinutes} dk` : ''}` : kind === 'persistent' ? 'Sabit item' : `${metricPeriod === 'daily' ? 'Günlük' : metricPeriod === 'weekly' ? 'Haftalık' : 'Aylık'} metrik${metricUnit ? ` · ${metricUnit}` : ''}`}</small></div></div>
      </div>
      <div className={styles.modalFooter}><div className={styles.actions}>{(item || group) && onDelete && <button className={styles.deleteBtn} type="button" disabled={busy} onClick={() => void onDelete()}>Sil</button>}<span /><button className={styles.cancelBtn} type="button" onClick={onClose}>Vazgeç</button><button className={styles.saveBtn} disabled={busy || !name.trim()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div></div>
    </form>
  </div>;
}
