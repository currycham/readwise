import { searchBooks } from '../../../../lib/books.mjs';
import { json } from '../../../lib/http';

export async function GET(req) {
  const q = new URL(req.url).searchParams.get('q') || '';
  if (!q.trim()) return json({ books: [] });
  return json({ books: searchBooks(q.slice(0, 60), 6).map(b => ({ slug: b.slug, title: b.title, author: b.author })) });
}
