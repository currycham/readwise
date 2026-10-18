// 书库：去重键、查询、入库，以及渲染书页时附加的站点信息（首位生成者、豆瓣评分、播客状态）。
import { REWARDS } from '../config/plans.mjs';
import { slugify } from '../engine/search.mjs';
import { getDb, now } from './db.mjs';
import { quizState, userLevel } from './rewards.mjs';

/** 规范化书名：去掉书名号、括号内容（多为原名或副标题）、空白和标点 */
export function normKey(title) {
  return String(title || '')
    .replace(/[《》]/g, '')
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・,，:：;；!！?？.。、'"“”‘’\-—_]/g, '')
    .toLowerCase();
}

export function findBookByTitle(title) {
  const k = normKey(title);
  return k ? getDb().prepare('SELECT * FROM books WHERE norm_key = ?').get(k) : null;
}

export function getBookBySlug(slug) {
  return getDb().prepare('SELECT * FROM books WHERE slug = ?').get(slug);
}

const CARD = `b.id, b.slug, b.title, b.author, b.categories, b.one_line, b.douban_rating, b.douban_count, b.views,
  b.podcast_status, b.created_at, b.status, b.check_score, b.model, u.nickname AS first_by`;

function card(r) {
  return r && { ...r, categories: JSON.parse(r.categories || '[]') };
}

export function searchBooks(q, limit = 8) {
  const k = `%${normKey(q)}%`, raw = `%${String(q).trim()}%`;
  return getDb().prepare(`SELECT ${CARD} FROM books b LEFT JOIN users u ON u.id = b.first_user_id
    WHERE b.status = 'ready' AND (b.norm_key LIKE ? OR b.title LIKE ? OR b.author LIKE ?) ORDER BY b.views DESC LIMIT ?`)
    .all(k, raw, raw, limit).map(card);
}

/** @param {{sort?:'recent'|'popular', top?:string, sub?:string, limit?:number, offset?:number, includeHidden?:boolean}} o */
export function listBooks(o = {}) {
  const where = [o.includeHidden ? '1=1' : "b.status = 'ready'"], args = [];
  if (o.sub) { where.push('b.categories LIKE ?'); args.push(`%"sub":"${o.sub}"%`); }
  else if (o.top) { where.push('b.categories LIKE ?'); args.push(`%"top":"${o.top}"%`); }
  const order = o.sort === 'popular' ? 'b.views DESC, b.id DESC' : 'b.id DESC';
  return getDb().prepare(`SELECT ${CARD} FROM books b LEFT JOIN users u ON u.id = b.first_user_id
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, o.limit || 24, o.offset || 0).map(card);
}

/** 首页“按问题找书”：{ 大问题: [{ sub, books: [...] }] }，每个大问题最多列 limit 本（按热度） */
export function booksByTop(limit = 8) {
  const out = {};
  const rows = getDb().prepare("SELECT slug, title, author, categories, douban_rating FROM books WHERE status = 'ready' ORDER BY views DESC, id DESC").all();
  const shown = {};
  for (const r of rows) {
    const c = JSON.parse(r.categories || '[]')[0];
    if (!c || (shown[c.top] = (shown[c.top] || 0) + 1) > limit) continue;
    const groups = (out[c.top] ||= []);
    let g = groups.find(x => x.sub === c.sub);
    if (!g) groups.push(g = { sub: c.sub, books: [] });
    g.books.push({ slug: r.slug, title: r.title, author: r.author, douban: r.douban_rating });
  }
  return out;
}

export function countBooks() {
  return getDb().prepare("SELECT COUNT(*) n FROM books WHERE status = 'ready'").get().n;
}

/** 各分类下的书数（首页“按问题找书”用） */
export function categoryCounts() {
  const counts = {};
  for (const r of getDb().prepare("SELECT categories FROM books WHERE status = 'ready'").all()) {
    for (const c of JSON.parse(r.categories || '[]')) {
      counts[c.top] = (counts[c.top] || 0) + 1;
      counts[`${c.top}/${c.sub}`] = (counts[`${c.top}/${c.sub}`] || 0) + 1;
    }
  }
  return counts;
}

function uniqueSlug(title) {
  const db = getDb();
  const base = slugify(title.replace(/[（(].*?[）)]/g, '')) || 'book';
  let slug = base, i = 2;
  while (db.prepare('SELECT 1 FROM books WHERE slug = ?').get(slug)) slug = `${base}-${i++}`;
  return slug;
}

/** 生成成功后入库；同名书已存在时返回已有记录（并发生成同一本书的情况） */
export function insertBook(page, { userId, model, source, checkScore, requestedTitle }) {
  const db = getDb();
  const title = String(page.book.title || requestedTitle).replace(/[《》]/g, '').trim();
  const keys = [...new Set([normKey(title), normKey(requestedTitle || '')].filter(Boolean))];
  for (const k of keys) {
    const exist = db.prepare('SELECT * FROM books WHERE norm_key = ?').get(k);
    if (exist) return { book: exist, existed: true };
  }
  const d = page.book.douban;
  // 每本书只归入一个子问题（模型偶尔多给，取第一个）
  page.book.categories = (page.book.categories || []).slice(0, 1);
  const info = db.prepare(`INSERT INTO books (slug, norm_key, title, author, categories, one_line, douban_rating, douban_count, douban_via,
      page_json, model, source, check_score, first_user_id)
    VALUES (@slug, @norm_key, @title, @author, @categories, @one_line, @douban_rating, @douban_count, @douban_via,
      @page_json, @model, @source, @check_score, @first_user_id)`).run({
    slug: uniqueSlug(title), norm_key: keys[0], title, author: page.book.author || '',
    categories: JSON.stringify(page.book.categories || []), one_line: page.recommend?.one_line || '',
    douban_rating: d?.rating ?? null, douban_count: d?.count ?? null, douban_via: d ? 'search' : null,
    page_json: JSON.stringify(page), model, source, check_score: checkScore ?? null, first_user_id: userId || null,
  });
  return { book: db.prepare('SELECT * FROM books WHERE id = ?').get(info.lastInsertRowid), existed: false };
}

export function addView(id) {
  getDb().prepare('UPDATE books SET views = views + 1 WHERE id = ?').run(id);
}

/** 渲染书页用的数据：书页 JSON + 站点信息 */
export function pageForRender(book, viewer) {
  const page = JSON.parse(book.page_json);
  const first = book.first_user_id ? getDb().prepare('SELECT nickname FROM users WHERE id = ?').get(book.first_user_id) : null;
  page.book.douban = book.douban_rating ? { rating: book.douban_rating, count: book.douban_count, via: book.douban_via } : null;
  page.site = {
    slug: book.slug,
    first_by: first?.nickname || null,
    created_at: book.created_at,
    podcast: { status: book.podcast_status, url: book.podcast_status === 'ready' ? `/media/podcast/${book.id}.mp3` : null, ms: book.podcast_ms },
    viewer: viewer ? { nickname: viewer.nickname, level: userLevel(viewer.id).name } : null,
    quiz: {
      rewards: { complete: REWARDS.complete, perfect: REWARDS.perfect, pass: REWARDS.passScore, minMinutes: REWARDS.minMinutes },
      ...(viewer ? quizState(viewer.id, book, page.quiz) : {}),
    },
  };
  // 检测的答案和解析不下发，答题时由 /api/quiz 判分
  page.quiz = page.quiz.map(({ q, options, chunk }) => ({ q, options, chunk }));
  if (book.podcast_script) page.podcast = { script: JSON.parse(book.podcast_script) };
  return page;
}

export function updateBook(id, fields) {
  const allowed = ['status', 'douban_rating', 'douban_count', 'douban_via', 'categories', 'podcast_status', 'podcast_file', 'podcast_ms', 'podcast_script', 'page_json', 'model', 'check_score', 'title', 'author', 'one_line'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  getDb().prepare(`UPDATE books SET ${keys.map(k => `${k} = @${k}`).join(', ')}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...Object.fromEntries(keys.map(k => [k, fields[k]])), updated_at: now(), id });
}
