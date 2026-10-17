import Link from 'next/link';
import { CATEGORIES } from '../../config/categories.mjs';
import { listBooks, searchBooks } from '../../lib/books.mjs';
import BookCard from '../components/BookCard';
import SearchBox from '../components/SearchBox';
import { getUser } from '../lib/session';

export const metadata = { title: '书库' };
export const dynamic = 'force-dynamic';

export default async function Library({ searchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  const sort = sp.sort === 'popular' ? 'popular' : 'recent';
  const books = sp.q ? searchBooks(sp.q, 48) : listBooks({ sort, top: sp.top, sub: sp.sub, limit: 96 });
  const top = CATEGORIES.find(c => c.name === sp.top);
  const qs = o => '?' + new URLSearchParams(Object.entries({ top: sp.top, sub: sp.sub, sort, ...o }).filter(([, v]) => v)).toString();
  return (
    <div className="wrap page">
      <div className="stack">
        <h1>书库{top ? ` · ${top.name}` : ''}{sp.sub ? ` · ${sp.sub}` : ''}</h1>
        <div style={{ maxWidth: 560 }}><SearchBox loggedIn={!!user} /></div>
      </div>
      <div className="stack">
        <div className="tabs">
          <Link href="/library" className={!sp.top ? 'on' : ''}>全部</Link>
          {CATEGORIES.map(c => <Link key={c.id} href={`/library?top=${encodeURIComponent(c.name)}`} className={sp.top === c.name ? 'on' : ''}>{c.name.replace(/^如何/, '')}</Link>)}
        </div>
        {top && (
          <div className="tabs">
            {top.subs.map(s => <Link key={s} href={qs({ sub: s })} className={sp.sub === s ? 'on' : ''}>{s}</Link>)}
          </div>
        )}
        <div className="tabs">
          <Link href={qs({ sort: 'recent' })} className={sort === 'recent' ? 'on' : ''}>最新</Link>
          <Link href={qs({ sort: 'popular' })} className={sort === 'popular' ? 'on' : ''}>最受欢迎</Link>
        </div>
      </div>
      {books.length ? <div className="books">{books.map(b => <BookCard key={b.id} b={b} />)}</div>
        : <div className="card muted">这里还没有书。在上面输入书名，生成第一本。</div>}
    </div>
  );
}
