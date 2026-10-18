import Link from 'next/link';
import { CATEGORIES } from '../../../config/categories.mjs';
import { getDb } from '../../../lib/db.mjs';
import { fmtBJ } from '../../../lib/time.mjs';

export default async function AdminBooks({ searchParams }) {
  const q = (await searchParams).q || '';
  const rows = getDb().prepare(`SELECT b.id, b.slug, b.title, b.author, b.status, b.views, b.check_score, b.model, b.source, b.douban_rating, b.douban_count, b.douban_via,
      b.podcast_status, b.created_at, b.categories, u.nickname, (SELECT COUNT(*) FROM reports r WHERE r.book_id = b.id AND r.status = 'open') reports
    FROM books b LEFT JOIN users u ON u.id = b.first_user_id WHERE b.title LIKE ? ORDER BY b.id DESC LIMIT 200`).all(`%${q}%`);
  return (
    <div className="stack">
      <form className="row"><input className="input" name="q" defaultValue={q} placeholder="搜索书名" style={{ maxWidth: 280 }} /><button className="btn">搜索</button></form>
      <div className="tbl"><table>
        <thead><tr><th>书名</th><th>分类</th><th>状态</th><th>浏览</th><th>质检</th><th>模型</th><th>豆瓣</th><th>播客</th><th>反馈</th><th>首位生成</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>{rows.map(b => (
          <tr key={b.id}>
            <td><Link href={`/b/${encodeURIComponent(b.slug)}`} target="_blank">《{b.title}》</Link><br /><span className="muted small">{b.author}</span></td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="book_category" /><input type="hidden" name="id" value={b.id} />
                <select className="input" name="category" aria-label="分类" defaultValue={(c => c ? `${c.top}/${c.sub}` : '')(JSON.parse(b.categories || '[]')[0])} style={{ maxWidth: 220 }}>
                  {CATEGORIES.map(c => <optgroup key={c.id} label={c.name}>{c.subs.map(s => <option key={s} value={`${c.name}/${s}`} title={c.desc[s]}>{s}</option>)}</optgroup>)}
                </select>
                <button className="btn sm">存</button>
              </form>
            </td>
            <td>{b.status === 'ready' ? '上架' : '下架'}</td>
            <td className="num">{b.views}</td>
            <td className="num">{b.check_score ?? ''}</td>
            <td>{b.model}{b.source === 'upload' ? '·原文' : ''}</td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="book_douban" /><input type="hidden" name="id" value={b.id} />
                <input className="input num" name="rating" defaultValue={b.douban_rating ?? ''} size={3} aria-label="豆瓣评分" />
                <input className="input num" name="count" defaultValue={b.douban_count ?? ''} size={6} aria-label="评价人数" />
                <button className="btn sm">存</button>
              </form>
              <span className="muted small">{{ admin: '人工', douban: '豆瓣', search: '检索' }[b.douban_via] || ''}</span>
            </td>
            <td>{b.podcast_status}{b.podcast_status !== 'none' && (
              <form method="post" action="/api/admin" className="inline-form"><input type="hidden" name="action" value="book_podcast_reset" /><input type="hidden" name="id" value={b.id} /><button className="btn sm">重置</button></form>)}</td>
            <td className="num">{b.reports || ''}</td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="book_first_user" /><input type="hidden" name="id" value={b.id} />
                <input className="input" name="who" defaultValue={b.nickname || ''} size={8} placeholder="昵称/邮箱" aria-label="首位生成者" />
                <button className="btn sm">存</button>
              </form>
            </td>
            <td className="num">{fmtBJ(b.created_at)}</td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="book_status" /><input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="status" value={b.status === 'ready' ? 'hidden' : 'ready'} />
                <button className={`btn sm ${b.status === 'ready' ? 'danger' : ''}`}>{b.status === 'ready' ? '下架' : '上架'}</button>
              </form>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="book_regenerate" /><input type="hidden" name="id" value={b.id} />
                <button className="btn sm">重新生成</button>
              </form>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
