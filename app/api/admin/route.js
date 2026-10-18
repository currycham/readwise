// 后台操作：表单 POST，处理后跳回原页面
import { NextResponse } from 'next/server';
import { isValidCategory } from '../../../config/categories.mjs';
import { updateBook } from '../../../lib/books.mjs';
import { addCredits } from '../../../lib/credits.mjs';
import { getDb, tx } from '../../../lib/db.mjs';
import { retryJob } from '../../../lib/jobs.mjs';
import { addDays } from '../../../lib/time.mjs';
import { sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

export async function POST(req) {
  const admin = await getUser();
  if (admin?.role !== 'admin' || !sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const f = Object.fromEntries((await req.formData()).entries());
  const id = Number(f.id);
  const db = getDb();
  const back = req.headers.get('referer') || '/admin';
  try {
    switch (f.action) {
      case 'book_status':
        updateBook(id, { status: f.status === 'hidden' ? 'hidden' : 'ready' }); break;
      case 'book_douban': {
        const rating = f.rating === '' ? null : Number(f.rating);
        if (rating != null && !(rating >= 0 && rating <= 10)) throw new Error('评分需要在 0–10 之间');
        updateBook(id, { douban_rating: rating, douban_count: f.count === '' ? null : Math.round(Number(f.count)), douban_via: rating == null ? null : 'admin' });
        break;
      }
      case 'book_category': {
        const [top, sub] = String(f.category || '').split('/');
        if (!isValidCategory(top, sub)) throw new Error('分类不在分类表中');
        const b = db.prepare('SELECT page_json FROM books WHERE id = ?').get(id);
        const page = JSON.parse(b.page_json);
        page.book.categories = [{ top, sub }];
        updateBook(id, { categories: JSON.stringify(page.book.categories), page_json: JSON.stringify(page) });
        break;
      }
      case 'book_podcast_reset':
        updateBook(id, { podcast_status: 'none', podcast_file: null, podcast_ms: null, podcast_script: null }); break;
      case 'book_regenerate': {
        const b = db.prepare('SELECT title, author FROM books WHERE id = ?').get(id);
        db.prepare("INSERT INTO jobs (type, user_id, input, charge, progress) VALUES ('generate', ?, ?, 'admin', '排队中')")
          .run(admin.id, JSON.stringify({ title: b.title, author: b.author, regenerate: id }));
        break;
      }
      case 'user_credits': {
        const delta = Math.round(Number(f.delta));
        if (!delta) throw new Error('请输入积分变动，例如 100 或 -50');
        tx(() => addCredits(id, delta, 'admin', `by:${admin.id}`));
        break;
      }
      case 'user_member': {
        const days = Math.round(Number(f.days));
        if (!days) throw new Error('请输入天数');
        const u = db.prepare('SELECT member_until FROM users WHERE id = ?').get(id);
        const base = u.member_until && Date.parse(u.member_until) > Date.now() ? u.member_until : new Date().toISOString();
        db.prepare('UPDATE users SET member_until = ? WHERE id = ?').run(addDays(base, days), id);
        break;
      }
      case 'user_role':
        if (id === admin.id) throw new Error('不能修改自己的角色');
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(f.role === 'admin' ? 'admin' : 'user', id); break;
      case 'user_unlimited':
        db.prepare('UPDATE users SET unlimited = ? WHERE id = ?').run(f.unlimited === '1' ? 1 : 0, id); break;
      case 'user_ban':
        if (id === admin.id) throw new Error('不能停用自己');
        db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(f.banned === '1' ? 1 : 0, id);
        if (f.banned === '1') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        break;
      case 'job_retry': retryJob(id); break;
      case 'report_resolve': db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").run(id); break;
      default: throw new Error('未知操作');
    }
  } catch (e) {
    const u = new URL(back); u.searchParams.set('err', e.message);
    return NextResponse.redirect(u, 303);
  }
  return NextResponse.redirect(back, 303);
}
