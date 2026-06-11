import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const BACKUP_FILE = path.join(process.cwd(), 'backups.json');
const REDIS_KEY = 'habit-backups';

// --- Redis helpers (only used when REDIS_URL is set) ---
async function getRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  // Dynamic import to avoid issues in local (no package needed)
  const { createClient } = await import('redis');
  const client = createClient({ url });
  client.on('error', (err) => console.error('Redis error:', err));
  await client.connect();
  return client;
}

// --- Read backups ---
async function getBackups(): Promise<any[]> {
  const isVercel = !!process.env.VERCEL;
  const hasRedis = !!process.env.REDIS_URL;

  if (hasRedis) {
    let client: any = null;
    try {
      client = await getRedisClient();
      if (!client) return [];
      const raw = await client.get(REDIS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Redis GET error:', err);
      return [];
    } finally {
      if (client) await client.disconnect();
    }
  }

  if (isVercel) {
    // Running on Vercel without Redis configured
    throw new Error('Redis veritabanı bağlanmamış. Vercel panelinden REDIS_URL değişkeninin tanımlı olduğundan emin olun.');
  }

  // Local fallback: use backups.json
  try {
    const data = await fs.readFile(BACKUP_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// --- Write backups ---
async function saveBackups(backups: any[]): Promise<void> {
  const isVercel = !!process.env.VERCEL;
  const hasRedis = !!process.env.REDIS_URL;

  if (hasRedis) {
    let client: any = null;
    try {
      client = await getRedisClient();
      if (!client) throw new Error('Redis bağlantısı kurulamadı.');
      await client.set(REDIS_KEY, JSON.stringify(backups));
    } catch (err: any) {
      console.error('Redis SET error:', err);
      throw new Error('Yedek kaydedilirken Redis hatası: ' + err.message);
    } finally {
      if (client) await client.disconnect();
    }
    return;
  }

  if (isVercel) {
    throw new Error('Redis veritabanı bağlanmamış. Vercel panelinden REDIS_URL değişkeninin tanımlı olduğundan emin olun.');
  }

  // Local fallback: write to backups.json
  try {
    await fs.writeFile(BACKUP_FILE, JSON.stringify(backups, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local backup file:', err);
    throw new Error('Lokal yedek dosyası yazılamadı.');
  }
}

// --- API handlers ---
export async function GET() {
  try {
    const backups = await getBackups();
    return NextResponse.json({ success: true, backups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.state) {
      return NextResponse.json({ success: false, error: 'State gereklidir.' }, { status: 400 });
    }

    const currentBackups = await getBackups();
    const newBackup = {
      id: `b-${Date.now()}`,
      timestamp: Date.now(),
      state: body.state,
    };

    const updatedBackups = [newBackup, ...currentBackups].slice(0, 3);
    await saveBackups(updatedBackups);

    return NextResponse.json({ success: true, backups: updatedBackups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
