'use client';

import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './planner-shell.module.css';

export type CalendarView = 'daily' | 'weekly';

export function AppMenu({
  user,
  active,
  view,
  onViewChange,
  workspace,
  onWorkspaceChange,
  onOpenLibrary,
  notificationPermission,
  onEnableNotifications,
  onManageSlots,
}: {
  user: User;
  active: 'calendar' | 'analytics';
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  workspace?: 'plan' | 'library';
  onWorkspaceChange?: (workspace: 'plan' | 'library') => void;
  onOpenLibrary?: () => void;
  notificationPermission?: NotificationPermission | 'unsupported';
  onEnableNotifications?: () => void;
  onManageSlots?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute('open');

  return <details className={styles.appMenu} ref={menu}>
    <summary aria-label="Menüyü aç"><span /><span /><span /></summary>
    <div className={styles.menuPanel}>
      <div className={styles.menuProfile}><span>{user.email?.slice(0, 2).toUpperCase()}</span><div><strong>{user.user_metadata?.full_name ?? user.email?.split('@')[0]}</strong><small>{user.email}</small></div></div>
      <div className={styles.menuSection}>
        <small>Görünüm</small>
        {onViewChange ? <>
          <button className={view === 'daily' ? styles.menuActive : ''} onClick={() => { onViewChange('daily'); close(); }}><span>▣</span> Günlük</button>
          <button className={view === 'weekly' ? styles.menuActive : ''} onClick={() => { onViewChange('weekly'); close(); }}><span>▦</span> Haftalık</button>
        </> : <>
          <Link href="/?view=daily" onClick={close}><span>▣</span> Günlük</Link>
          <Link href="/?view=weekly" onClick={close}><span>▦</span> Haftalık</Link>
        </>}
      </div>
      <div className={styles.menuSection}>
        <small>Momentum</small>
        {onWorkspaceChange ? <>
          <button className={workspace === 'plan' ? styles.menuActive : ''} onClick={() => { onWorkspaceChange('plan'); close(); }}><span>▤</span> Plan</button>
          <button className={workspace === 'library' ? styles.menuActive : ''} onClick={() => { onWorkspaceChange('library'); close(); }}><span>▦</span> Kütüphane</button>
        </> : onOpenLibrary && <button onClick={() => { onOpenLibrary(); close(); }}><span>▦</span> Kütüphane</button>}
        <Link className={active === 'analytics' ? styles.menuActive : ''} href="/analytics" onClick={close}><span>⌁</span> Analitik</Link>
        {onEnableNotifications && <button onClick={() => { onEnableNotifications(); close(); }}><span>◉</span> {notificationPermission === 'granted' ? 'Bildirimler açık' : notificationPermission === 'denied' ? 'Bildirimler engelli' : notificationPermission === 'unsupported' ? 'Bildirim desteklenmiyor' : 'Bildirimleri aç'}</button>}
        {onManageSlots && <button onClick={() => { onManageSlots(); close(); }}><span>◷</span> Zaman dilimleri</button>}
      </div>
      <button className={styles.menuSignOut} onClick={() => void supabase.auth.signOut()}><span>↗</span> Çıkış yap</button>
    </div>
  </details>;
}
