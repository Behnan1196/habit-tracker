'use client';

import type { User } from '@supabase/supabase-js';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PlannerShell } from './planner-shell';
import { InsightsShell } from './insights-shell';
import styles from './planner-shell.module.css';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthGate({ view = 'planner' }: { view?: 'planner' | 'analytics' }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    queueMicrotask(() => {
      setRecovery(new URLSearchParams(window.location.search).get('recovery') === '1');
      if (new URLSearchParams(window.location.search).get('auth_error') === '1') setMessage('Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.');
    });
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase.auth]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    if (mode === 'forgot') {
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', '/?recovery=1');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
      setBusy(false);
      setMessage(error ? error.message : 'Şifre yenileme bağlantısı e-posta adresine gönderildi.');
      return;
    }

    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: new URL('/auth/callback', window.location.origin).toString() },
        });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup' && !result.data.session) setMessage('Hesap uygunsa doğrulama bağlantısı e-posta adresine gönderildi. Gelen kutunu kontrol et.');
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setRecovery(false);
      setNewPassword('');
      window.history.replaceState(null, '', '/');
      setMessage('Şifren başarıyla yenilendi.');
    }
  }

  if (user === undefined) return <div className={styles.loading}>Momentum hazırlanıyor…</div>;

  if (recovery) return (
    <AuthLayout>
      <form className={styles.authCard} onSubmit={updatePassword}>
        <span>Hesap güvenliği</span><h2>Yeni şifreni belirle</h2>
        <label>Yeni şifre<input type="password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
        {message && <p>{message}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifreyi yenile'}</button>
      </form>
    </AuthLayout>
  );

  if (user) return view === 'planner' ? <PlannerShell user={user} /> : <InsightsShell user={user} />;

  const titles: Record<AuthMode, [string, string]> = {
    signin: ['Tekrar hoş geldin', 'Hesabına giriş yap'],
    signup: ['Momentum’a katıl', 'Yeni hesap oluştur'],
    forgot: ['Hesabına dön', 'Şifreni yenile'],
  };

  return (
    <AuthLayout>
      <form className={styles.authCard} onSubmit={authenticate}>
        <span>{titles[mode][0]}</span><h2>{titles[mode][1]}</h2>
        <label>E-posta<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        {mode !== 'forgot' && <label>Şifre<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label>}
        {message && <p>{message}</p>}
        <button className={styles.primary} disabled={busy}>{busy ? 'Bekleyin…' : mode === 'signin' ? 'Giriş yap' : mode === 'signup' ? 'Hesap oluştur' : 'Yenileme bağlantısı gönder'}</button>
        {mode === 'signin' && <><button className={styles.secondary} type="button" onClick={() => { setMode('signup'); setMessage(''); }}>Yeni hesap oluştur</button><button className={styles.textButton} type="button" onClick={() => { setMode('forgot'); setMessage(''); }}>Şifremi unuttum</button></>}
        {mode !== 'signin' && <button className={styles.secondary} type="button" onClick={() => { setMode('signin'); setMessage(''); }}>Giriş ekranına dön</button>}
      </form>
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.authPage}>
    <section className={styles.authIntro}>
      <div className={styles.brand}><span>M</span> momentum</div>
      <p>Günün parçalarını kendi ritmine göre yerleştir.</p>
      <h1>Plan yapmak için<br />hayatını kalıba sokma.</h1>
      <div className={styles.authQuote}>Gruplarını, rutinlerini ve zaman dilimlerini sen belirlersin.</div>
    </section>
    {children}
  </main>;
}
