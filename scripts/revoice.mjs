// 用当前音色给已有播客重新配音（沿用对谈稿，不重写）：npm run revoice -- [书名 ...]
// 不带书名时处理所有已有播客的书。由 worker 排队执行。
import { getDb } from '../lib/db.mjs';

const titles = process.argv.slice(2);
const db = getDb();
const busy = new Set(db.prepare("SELECT book_id FROM jobs WHERE type = 'podcast' AND status IN ('queued', 'running')").all().map(r => r.book_id));
const books = db.prepare("SELECT id, title FROM books WHERE podcast_script IS NOT NULL AND podcast_status NOT IN ('queued', 'running')").all()
  .filter(b => !busy.has(b.id))
  .filter(b => !titles.length || titles.includes(b.title));
for (const b of books) {
  // 不改 podcast_status：重新配音期间旧播客照常可听
  db.prepare("INSERT INTO jobs (type, book_id, input, charge, progress) VALUES ('podcast', ?, ?, 'admin', '排队中')").run(b.id, JSON.stringify({ revoice: true }));
  console.log(`已排队重新配音：《${b.title}》`);
}
if (!books.length) console.log('没有可重新配音的书');
