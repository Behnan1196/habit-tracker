'use client';

import type { User } from '@supabase/supabase-js';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PlannerShell } from './planner-shell';
import { InsightsShell } from './insights-shell';
import styles from './planner-shell.module.css';

export function AuthGate({ view = 'planner' }: { view?: 'planner' | 'metrics' | 'analytics' }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase.auth]);

  async function authenticate(event: FormEvent | undefined, mode: 'signin' | 'signup') {
    event?.preventDefault();
    setBusy(true);
    setMessage('');
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('E-posta adresine gönderilen bağlantıyla hesabını doğrula.');
  }

  if (user === undefined) return <div className={styles.loading}>Momentum hazırlanıyor…</div>;
  if (user) return view === 'planner' ? <PlannerShell user={user} /> : <InsightsShell user={user} view={view} />;

  return (
    <main className={styles.authPage}>
      <section className={styles.authIntro}>
        <div className={styles.brand}><span>M</span> momentum</div>
        <p>Günün parçalarını kendi ritmine göre yerleştir.</p>
        <h1>Plan yapmak için<br />hayatını kalıba sokma.</h1>
        <div className={styles.authQuote}>Gruplarını, rutinlerini ve zaman dilimlerini sen belirlersin.</div>
      </section>
      <form className={styles.authCard} onSubmit={(event) => authenticate(event, 'signin')}>
        <span>Tekrar hoş geldin</span><h2>Hesabına giriş yap</h2>
        <label>E-posta<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Şifre<input type="password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {message && <p>{message}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? 'Bekleyin…' : 'Giriş yap'}</button>
        <button className={styles.secondary} type="button" disabled={busy} onClick={() => void authenticate(undefined, 'signup')}>Yeni hesap oluştur</button>
      </form>
    </main>
  );
}
