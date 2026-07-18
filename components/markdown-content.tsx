'use client';

import type { ReactNode } from 'react';
import styles from './markdown-content.module.css';

function youtubeId(value: string) {
  try { const url = new URL(value); if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0]; if (url.hostname.includes('youtube.com')) return url.searchParams.get('v') ?? url.pathname.match(/\/shorts\/([^/?]+)/)?.[1] ?? null; } catch { return null; }
  return null;
}

function inline(text: string): ReactNode[] {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|https?:\/\/[^\s]+|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const output: ReactNode[] = []; let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0; if (index > cursor) output.push(text.slice(cursor, index)); const token = match[0];
    if (match[2] && match[3]) output.push(<a key={index} href={match[3]} target="_blank" rel="noreferrer">{match[2]}</a>);
    else if (token.startsWith('http')) output.push(<a key={index} href={token} target="_blank" rel="noreferrer">{token}</a>);
    else if (token.startsWith('**')) output.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else output.push(<em key={index}>{token.slice(1, -1)}</em>);
    cursor = index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor)); return output;
}

export function MarkdownContent({ value }: { value: string }) {
  const lines = value.split(/\r?\n/); const nodes: ReactNode[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { nodes.push(<ul key={`list-${nodes.length}`}>{list.map((entry, index) => <li key={index}>{inline(entry)}</li>)}</ul>); list = []; } };
  lines.forEach((line, index) => {
    const trimmed = line.trim(); const video = youtubeId(trimmed);
    if (video) { flush(); nodes.push(<a className={styles.youtube} key={index} href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noreferrer"><span style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video}/hqdefault.jpg)` }}><b>▶</b></span><strong>YouTube videosunu izle</strong></a>); return; }
    if (/^[-*] /.test(trimmed)) { list.push(trimmed.slice(2)); return; } flush();
    if (!trimmed) { nodes.push(<div className={styles.space} key={index} />); return; }
    if (trimmed.startsWith('### ')) nodes.push(<h4 key={index}>{inline(trimmed.slice(4))}</h4>);
    else if (trimmed.startsWith('## ')) nodes.push(<h3 key={index}>{inline(trimmed.slice(3))}</h3>);
    else if (trimmed.startsWith('# ')) nodes.push(<h2 key={index}>{inline(trimmed.slice(2))}</h2>);
    else nodes.push(<p key={index}>{inline(line)}</p>);
  }); flush(); return <div className={styles.markdown}>{nodes}</div>;
}
