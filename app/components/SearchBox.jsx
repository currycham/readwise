'use client';
// 首页搜索：输入书名时联想书库里已有的书；没有就引导生成。
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SearchBox({ loggedIn, autoFocus = false }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    const v = q.trim();
    if (!v) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/books/search?q=${encodeURIComponent(v)}`);
        const j = await r.json();
        setItems(j.books || []);
        setOpen(true);
      } catch { setItems([]); }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q]);

  function generate(title) {
    const t = title.replace(/[《》]/g, '').trim();
    if (!t) return;
    const next = `/new?title=${encodeURIComponent(t)}`;
    router.push(loggedIn ? next : `/login?next=${encodeURIComponent(next)}`);
  }

  function submit(e) {
    e.preventDefault();
    const v = q.trim().replace(/[《》]/g, '');
    if (!v) return;
    const exact = items.find(b => b.title === v);
    if (exact) router.push(`/b/${encodeURIComponent(exact.slug)}`);
    else generate(v);
  }

  const v = q.trim().replace(/[《》]/g, '');
  return (
    <div className="search">
      <form onSubmit={submit} role="search">
        <input id="book-search" className="input" value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="输入一本你读过、想再回顾的书" aria-label="书名" autoComplete="off" autoFocus={autoFocus} />
        <button className="btn primary" type="submit">开始</button>
      </form>
      {open && v && (
        <div className="suggest">
          {items.map(b => (
            <a key={b.slug} href={`/b/${encodeURIComponent(b.slug)}`}><span>《{b.title}》 <small>{b.author}</small></span><small>已有回顾</small></a>
          ))}
          {!items.some(b => b.title === v) && (
            <button type="button" onMouseDown={() => generate(v)}><span>生成《{v}》的书籍回顾</span><small>{loggedIn ? '约 10 分钟' : '登录后生成'}</small></button>
          )}
        </div>
      )}
    </div>
  );
}
