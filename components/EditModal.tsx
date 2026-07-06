'use client';

import { HabitItem, PRESET_COLORS } from '@/types';
import { useState, useEffect, useMemo } from 'react';
import styles from './EditModal.module.css';

interface Props {
  open: boolean;
  initial?: Partial<HabitItem>;
  groups: HabitItem[]; // now flat list of all groups
  onSave: (item: Omit<HabitItem, 'id' | 'order'>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function EditModal({ open, initial, groups, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [min, setMin] = useState<number | undefined>(undefined);
  const [max, setMax] = useState<number | undefined>(undefined);
  const [type, setType] = useState<'habit' | 'group' | 'metric'>('habit');
  const [color, setColor] = useState(PRESET_COLORS[0].value);
  const [backColor, setBackColor] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isFixed, setIsFixed] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setType(initial?.type ?? 'habit');
      setColor(initial?.color ?? PRESET_COLORS[0].value);
      setBackColor(initial?.backColor ?? '');
      setGroupId(initial?.groupId ?? null);
      setNotes(initial?.notes ?? '');
      setIsFixed(initial?.isFixed ?? false);
      setMin(initial?.min ?? undefined);
      setMax(initial?.max ?? undefined);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = () => {
    let trimmedName = name.trim();
    if (!trimmedName) return;

    // Capitalize first letter to ensure consistency
    trimmedName = trimmedName.charAt(0).toUpperCase() + trimmedName.slice(1);

    onSave({ 
      name: trimmedName, 
      type,
      color,
      backColor: backColor || undefined,
      groupId,
      notes: notes.trim(),
      isFixed,
      min: min ?? undefined,
      max: max ?? undefined,
    });
    onClose();
  };

  const isDescendant = (childId: string, potentialParentId: string): boolean => {
    if (childId === potentialParentId) return true;
    const parent = groups.find(g => g.id === potentialParentId);
    if (!parent || !parent.groupId) return false;
    return isDescendant(childId, parent.groupId);
  };

  const getGroupPath = (gId: string): string => {
    const g = groups.find(x => x.id === gId);
    if (!g) return '';
    if (!g.groupId) return g.name;
    return getGroupPath(g.groupId) + ' > ' + g.name;
  };

  const availableGroups = groups.filter(g => {
    if (type === 'group' && initial?.id) {
       if (isDescendant(initial.id, g.id)) return false;
    }
    return true;
  }).map(g => ({
    id: g.id,
    pathName: getGroupPath(g.id)
  })).sort((a, b) => a.pathName.localeCompare(b.pathName));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{initial?.id ? 'Düzenle' : 'Yeni Ekle'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Type toggle */}
        <div className={styles.typeToggle}>
          <button
            className={`${styles.typeBtn} ${type === 'habit' ? styles.active : ''}`}
            onClick={() => setType('habit')}
          >
            Alışkanlık
          </button>
          <button
            className={`${styles.typeBtn} ${type === 'group' ? styles.active : ''}`}
            onClick={() => setType('group')}
          >
            Grup Başlığı
          </button>
          <button
            className={`${styles.typeBtn} ${type === 'metric' ? styles.active : ''}`}
            onClick={() => setType('metric')}
          >
            Metrik
          </button>
        </div>

        {/* Name */}
        <label className={styles.label}>İsim</label>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={type === 'group' ? 'örn. Vitaminler' : type === 'metric' ? 'örn. Bel Ölçüsü (cm)' : 'örn. D Vitamini'}
          autoFocus
          autoCapitalize="sentences"
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        {/* Notes */}
        <label className={styles.label}>Notlar (Opsiyonel)</label>
        <textarea
          className={styles.textarea}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Bu öğe ile ilgili ek bilgiler..."
          rows={2}
        />

        {/* KPI range inputs */}
        {(type === 'metric') && (
          <>
            <label className={styles.label}>Minimum Değer</label>
            <input
              type="number"
              className={styles.input}
              value={min ?? ''}
              onChange={e => setMin(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Örn. 67"
            />
            <label className={styles.label}>Maksimum Değer</label>
            <input
              type="number"
              className={styles.input}
              value={max ?? ''}
              onChange={e => setMax(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Örn. 70"
            />
          </>
        )}

        {/* isFixed toggle */}
        {type !== 'metric' && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isFixed}
              onChange={e => setIsFixed(e.target.checked)}
            />
            <span>
              <strong>Sabit &mdash; haftalık sıfırlanmaz</strong>
              <span className={styles.checkboxHint}> (yapılacaklar, alışveriş vb.)</span>
            </span>
          </label>
        )}

        {/* Group select (now available for groups, separators, and metrics!) */}
        {groups.length > 0 && (
          <>
            <label className={styles.label}>Grup (opsiyonel)</label>
            <select
              className={styles.select}
              value={groupId ?? ''}
              onChange={e => setGroupId(e.target.value || null)}
            >
              <option value=''>— Gruba bağlı değil —</option>
              {availableGroups.map(g => (
                <option key={g.id} value={g.id}>{g.pathName}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
          <div style={{ flex: 1 }}>
            <label className={styles.label}>Yazı Rengi</label>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`${styles.colorDot} ${color === c.value ? styles.selectedColor : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          
          <div style={{ flex: 1 }}>
            <label className={styles.label}>Arka Plan Rengi</label>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`${styles.colorDot} ${backColor === c.value ? styles.selectedColor : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setBackColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
            {backColor && (
              <button
                onClick={() => setBackColor('')}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginTop: '8px' }}
              >
                Temizle
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {onDelete && (
            <button className={styles.deleteBtn} onClick={() => { onDelete(); onClose(); }}>
              Sil
            </button>
          )}
          <button className={styles.saveBtn} onClick={handleSave} disabled={!name.trim()}>
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
