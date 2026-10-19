// /sitemap.xml：首页、书库等公开页面，以及每一本公开的书页
import { getDb } from '../lib/db.mjs';
import { SITE_URL } from './lib/site';

export const dynamic = 'force-dynamic';

export default function sitemap() {
  const books = getDb().prepare("SELECT slug, updated_at FROM books WHERE status = 'ready' ORDER BY id").all();
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/library`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/rank`, changeFrequency: 'daily', priority: 0.4 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.3 },
    ...books.map(b => ({ url: `${SITE_URL}/b/${encodeURIComponent(b.slug)}`, lastModified: b.updated_at, changeFrequency: 'weekly', priority: 0.9 })),
  ];
}
