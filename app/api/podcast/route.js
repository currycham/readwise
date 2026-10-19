// 播客：GET 查询状态；POST 在还没有播客时触发生成（需要登录）。
import { getBookBySlug, podcastUrl } from '../../../lib/books.mjs';
import { getDb } from '../../../lib/db.mjs';
import { enqueuePodcast } from '../../../lib/jobs.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

function status(book) {
  const job = getDb().prepare("SELECT status, progress FROM jobs WHERE type = 'podcast' AND book_id = ? ORDER BY id DESC LIMIT 1").get(book.id);
  return {
    status: book.podcast_status,
    progress: job?.progress || '',
    url: podcastUrl(book),
    ms: book.podcast_ms,
    script: book.podcast_status === 'ready' && book.podcast_script ? JSON.parse(book.podcast_script) : null,
  };
}

export async function GET(req) {
  const book = getBookBySlug(new URL(req.url).searchParams.get('slug') || '');
  if (!book) return json({ error: '找不到这本书' }, 404);
  return json(status(book));
}

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const { slug } = await req.json();
    const book = getBookBySlug(String(slug || ''));
    if (!book || book.status !== 'ready') return json({ error: '找不到这本书' }, 404);
    if (['queued', 'running', 'ready'].includes(book.podcast_status)) return json(status(book));
    const user = await getUser();
    if (!user) return json({ error: '这本书还没有播客。登录后可以生成，生成好之后所有人都能收听。', code: 'login' }, 401);
    enqueuePodcast(user, book);
    return json(status(getBookBySlug(book.slug)));
  } catch (e) { return fail(e); }
}
