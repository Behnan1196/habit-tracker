'use client';

import Link from 'next/link';
import styles from './planner-shell.module.css';

export type MainSurface = 'agenda' | 'library' | 'modules' | 'analytics' | 'settings';

const entries: { id: MainSurface; label: string; icon: string; href: string }[] = [
  { id: 'agenda', label: 'Ajanda', icon: '▤', href: '/' },
  { id: 'library', label: 'Kütüphane', icon: '▦', href: '/?surface=library' },
  { id: 'modules', label: 'Modüller', icon: '◆', href: '/?surface=modules' },
  { id: 'analytics', label: 'Analitik', icon: '⌁', href: '/analytics' },
  { id: 'settings', label: 'Ayarlar', icon: '⚙', href: '/?surface=settings' },
];

export function BottomNav({ active, onChange }: { active: MainSurface; onChange?: (surface: Exclude<MainSurface, 'analytics'>) => void }) {
  return <nav className={styles.bottomNav} aria-label="Ana navigasyon">{entries.map((entry) => entry.id !== 'analytics' && onChange
    ? <button key={entry.id} className={active === entry.id ? styles.bottomNavActive : ''} onClick={() => onChange(entry.id as Exclude<MainSurface, 'analytics'>)}><span>{entry.icon}</span><small>{entry.label}</small></button>
    : <Link key={entry.id} href={entry.href} className={active === entry.id ? styles.bottomNavActive : ''}><span>{entry.icon}</span><small>{entry.label}</small></Link>)}</nav>;
}
