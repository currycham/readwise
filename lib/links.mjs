// 书籍网络的数据：计算并保存书与书的联系，给网络页和书页“相关的书”取数。
import { findLinks } from '../engine/links.mjs';
import { getDb, now } from './db.mjs';

const ready = () => getDb().prepare("SELECT id, slug, page_json FROM books WHERE status = 'ready' ORDER BY id").all()
  .map(r => ({ id: r.id, slug: r.slug, page: JSON.parse(r.page_json) }));

/** 找出这本书和书库里其他书的联系并入库。同一对书已有联系时，保留更强的那条 */
export async function linkBook(bookId, { log = () => {} } = {}) {
  const all = ready();
  const target = all.find(b => b.id === bookId);
  if (!target) return { links: 0, cost: 0 };
  const others = all.filter(b => b.id !== bookId);
  const { links, cost } = await findLinks(target, others);
  const db = getDb();
  const bySlug = new Map(others.map(b => [b.slug, b.id]));
  const up = db.prepare(`INSERT INTO book_links (a, b, type, concept, why, strength) VALUES (@a, @b, @type, @concept, @why, @strength)
    ON CONFLICT (a, b) DO UPDATE SET type = excluded.type, concept = excluded.concept, why = excluded.why, strength = excluded.strength
    WHERE excluded.strength > book_links.strength`);
  db.transaction(() => {
    for (const l of links) {
      const other = bySlug.get(l.slug);
      up.run({ a: Math.min(bookId, other), b: Math.max(bookId, other), type: l.type, concept: l.concept, why: l.why, strength: l.strength });
    }
    db.prepare('UPDATE books SET links_at = ? WHERE id = ?').run(now(), bookId);
  })();
  log(`书籍网络：《${target.page.book.title}》找到 ${links.length} 条联系`);
  return { links: links.length, cost };
}

/** 网络页：所有公开的书和它们之间的联系 */
export function graphData() {
  const db = getDb();
  const nodes = db.prepare("SELECT id, slug, title, author, categories, one_line, douban_rating, views FROM books WHERE status = 'ready'").all()
    .map(b => { const c = JSON.parse(b.categories || '[]')[0] || {}; return { id: b.id, slug: b.slug, title: b.title, author: b.author, top: c.top || '', sub: c.sub || '', one: b.one_line || '', douban: b.douban_rating, views: b.views }; });
  const links = db.prepare(`SELECT l.a, l.b, l.type, l.concept, l.why, l.strength FROM book_links l
    JOIN books x ON x.id = l.a AND x.status = 'ready' JOIN books y ON y.id = l.b AND y.status = 'ready'`).all();
  return { nodes, links };
}

/** 首页入口卡片用：公开的书之间有多少条联系 */
export function countLinks() {
  return getDb().prepare(`SELECT COUNT(*) n FROM book_links l JOIN books x ON x.id = l.a AND x.status = 'ready' JOIN books y ON y.id = l.b AND y.status = 'ready'`).get().n;
}

/** 书页底部“相关的书”：按联系强弱排 */
export function relatedBooks(bookId, limit = 6) {
  return getDb().prepare(`SELECT o.slug, o.title, o.author, l.type, l.concept, l.why, l.strength FROM book_links l
    JOIN books o ON o.id = CASE WHEN l.a = ? THEN l.b ELSE l.a END AND o.status = 'ready'
    WHERE l.a = ? OR l.b = ? ORDER BY l.strength DESC, o.views DESC LIMIT ?`).all(bookId, bookId, bookId, limit);
}
