import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listBooks } from '../../../lib/books.mjs';
import { getDb } from '../../../lib/db.mjs';
import { myRank, userLevel } from '../../../lib/rewards.mjs';
import BookCard from '../../components/BookCard';
import { getUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

// 用户主页：只展示已公开的信息（昵称、等级、积分、读完本数、首位生成的书），不展示具体读了哪些书
function loadUser(id) {
  const u = Number.isInteger(id) && id > 0 ? getDb().prepare('SELECT id, nickname, created_at, banned FROM users WHERE id = ?').get(id) : null;
  return u && !u.banned ? u : null;
}

export async function generateMetadata({ params }) {
  const u = loadUser(Number((await params).id));
  return { title: u ? `${u.nickname} 的书架` : '读者不存在' };
}

export default async function UserPage({ params }) {
  const id = Number((await params).id);
  const u = loadUser(id);
  if (!u) notFound();
  const viewer = await getUser();
  const lv = userLevel(id);
  const rank = myRank(id, 'all');
  const read = getDb().prepare('SELECT COUNT(*) n FROM completions WHERE user_id = ? AND passed = 1').get(id).n;
  const books = listBooks({ firstUserId: id, sort: 'popular', limit: 96 });
  const views = books.reduce((n, b) => n + (b.views || 0), 0);
  return (
    <div className="wrap page">
      <div className="stack">
        <div className="muted small"><Link href="/rank">← 排行榜</Link></div>
        <h1>{u.nickname}{viewer?.id === id ? <span className="muted small" style={{ fontWeight: 400 }}>　（你）</span> : null}</h1>
        <p className="muted">{lv.name} · 第 {lv.index} 级</p>
      </div>
      <div className="stats">
        <div className="stat"><div className="v">{rank.rank ? `第 ${rank.rank} 名` : '未上榜'}</div><div className="k">总榜</div></div>
        <div className="stat"><div className="v">{lv.earned}</div><div className="k">累计获得积分</div></div>
        <div className="stat"><div className="v">{read} 本</div><div className="k">读完并闯关</div></div>
        <div className="stat"><div className="v">{books.length} 本</div><div className="k">首位生成{books.length ? `，共被浏览 ${views} 次` : ''}</div></div>
      </div>
      <section className="stack">
        <h2 style={{ fontSize: 22 }}>{viewer?.id === id ? '我' : 'TA'}生成的书</h2>
        {books.length
          ? <div className="books">{books.map(b => <BookCard key={b.id} b={b} />)}</div>
          : <div className="card muted">还没有首位生成的书。</div>}
      </section>
    </div>
  );
}
