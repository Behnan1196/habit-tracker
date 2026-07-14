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
};

type GroupOption = { id: string; parent_id: string | null; name: string };
type ItemDraft = Omit<EditableItem, 'id'>;

const colors = ['#395f47', '#638169', '#667e99', '#738aa6', '#8d76a4', '#ad765e', '#c48255', '#b18a4f', '#4f9186', '#747c76'];

export function ItemEditorModal({ item, initialGroupId, groups, onClose, onSave, onDelete }: {
  item?: EditableItem;
  initialGroupId: string | null;
  groups: GroupOption[];
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'daily');
  const [description, setDescription] = useState(item?.description ?? '');
  const [groupId, setGroupId] = useState(item?.group_id ?? initialGroupId);
  const [color, setColor] = useState(item?.color ?? colors[0]);
  const [metricUnit, setMetricUnit] = useState(item?.metric_unit ?? '');
  const [busy, setBusy] = useState(false);

  const groupOptions = useMemo(() => {
    function path(group: GroupOption): string {
      const parent = groups.find((candidate) => candidate.id === group.parent_id);
      return parent ? `${path(parent)} › ${group.name}` : group.name;
    }
    return groups.map((group) => ({ id: group.id, label: path(group) })).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [groups]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSave({ name: name.trim(), kind, description: description.trim() || null, group_id: groupId, color, metric_unit: kind === 'metric' ? metricUnit.trim() || null : null });
    setBusy(false);
  }

  return <div className={styles.overlay} onMouseDown={onClose}>
    <form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className={styles.modalHeader}><div className={styles.header}><div><span className={styles.eyebrow}>{item ? 'Item ayarları' : 'Yeni item'}</span><h2 id="editor-title">{item ? 'Item’ı düzenle' : 'Planına item ekle'}</h2></div><button className={styles.closeBtn} type="button" onClick={onClose} aria-label="Kapat">×</button></div></div>
      <div className={styles.modalBody}>
        <div className={styles.typeToggle}>
          <button className={`${styles.typeBtn} ${kind === 'daily' ? styles.active : ''}`} type="button" onClick={() => setKind('daily')}><strong>Günlük</strong><small>Gün ve saate planlanır</small></button>
          <button className={`${styles.typeBtn} ${kind === 'persistent' ? styles.active : ''}`} type="button" onClick={() => setKind('persistent')}><strong>Sürekli</strong><small>Bir güne bağlı değildir</small></button>
          <button className={`${styles.typeBtn} ${kind === 'metric' ? styles.active : ''}`} type="button" onClick={() => setKind('metric')}><strong>Metrik</strong><small>Sayısal değer tutulur</small></button>
        </div>

        <label className={styles.label} htmlFor="item-name">İsim</label>
        <input id="item-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'metric' ? 'Örn. Kilo' : 'Örn. Sabah yürüyüşü'} autoFocus />

        <label className={styles.label} htmlFor="item-description">Açıklama / Not</label>
        <textarea id="item-description" className={styles.textarea} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Bu item hakkında hatırlamak istediğin detaylar…" />

        <div className={styles.fieldGrid}>
          <div><label className={styles.label} htmlFor="item-group">Grup</label><select id="item-group" className={styles.select} value={groupId ?? ''} onChange={(event) => setGroupId(event.target.value || null)}><option value="">Grupsuz</option>{groupOptions.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></div>
          {kind === 'metric' && <div><label className={styles.label} htmlFor="metric-unit">Birim</label><input id="metric-unit" className={styles.input} value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} placeholder="kg, cm, saat…" /></div>}
        </div>

        <label className={styles.label}>Renk</label>
        <div className={styles.colorGrid}>{colors.map((option) => <button key={option} type="button" aria-label={`Renk ${option}`} className={`${styles.colorDot} ${color === option ? styles.selectedColor : ''}`} style={{ background: option }} onClick={() => setColor(option)} />)}</div>
        <div className={styles.preview}><i style={{ background: color }} /><div><strong>{name.trim() || 'Item önizlemesi'}</strong><small>{kind === 'daily' ? 'Günlük item' : kind === 'persistent' ? 'Sürekli item' : `Metrik${metricUnit ? ` · ${metricUnit}` : ''}`}</small></div></div>
      </div>
      <div className={styles.modalFooter}><div className={styles.actions}>{item && onDelete && <button className={styles.deleteBtn} type="button" disabled={busy} onClick={() => void onDelete()}>Sil</button>}<span /><button className={styles.cancelBtn} type="button" onClick={onClose}>Vazgeç</button><button className={styles.saveBtn} disabled={busy || !name.trim()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div></div>
    </form>
  </div>;
}
