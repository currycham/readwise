// 书页：用统一模板渲染成独立 HTML（和内容引擎同一套模板）
import { addView, getBookBySlug, pageForRender } from '../../../lib/books.mjs';
import { renderPage } from '../../../renderer/render.mjs';
import { getUser } from '../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const slug = decodeURIComponent((await params).slug);
  const book = getBookBySlug(slug);
  const user = await getUser();
  if (!book || (book.status !== 'ready' && user?.role !== 'admin')) {
    return new Response('<!doctype html><meta charset="utf-8"><title>找不到这本书</title><p style="font:16px sans-serif;padding:40px">找不到这本书。<a href="/">返回首页</a></p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  addView(book.id);
  const html = await renderPage(pageForRender(book, user), { slug: book.slug });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
