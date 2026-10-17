// 用户报错：书页内容有误时提交，管理员在后台处理
import { getBookBySlug } from '../../../lib/books.mjs';
import { getDb } from '../../../lib/db.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const user = await getUser();
    if (!user) return json({ error: '登录后可以反馈问题', code: 'login' }, 401);
    const { slug, content } = await req.json();
    const book = getBookBySlug(String(slug || ''));
    const text = String(content || '').trim();
    if (!book || [...text].length < 4 || [...text].length > 1000) return json({ error: '请写清楚哪里有问题（4–1000 字）' }, 400);
    const db = getDb();
    const recent = db.prepare("SELECT COUNT(*) n FROM reports WHERE user_id = ? AND at >= ?").get(user.id, new Date(Date.now() - 86400e3).toISOString()).n;
    if (recent >= 20) return json({ error: '今天的反馈次数已达上限' }, 429);
    db.prepare('INSERT INTO reports (user_id, book_id, content) VALUES (?, ?, ?)').run(user.id, book.id, text);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
