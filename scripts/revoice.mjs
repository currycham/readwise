// 用当前音色给已有播客重新配音（沿用对谈稿，不重写）：npm run revoice -- [书名 ...]
// 不带书名时处理所有已有播客的书。由 worker 排队执行。
import { updateBook } from '../lib/books.mjs';
import { getDb } from '../lib/db.mjs';

const titles = process.argv.slice(2);
const db = getDb();
const books = db.prepare("SELECT id, title FROM books WHERE podcast_script IS NOT NULL AND podcast_status NOT IN ('queued', 'running')").all()
  .filter(b => !titles.length || titles.includes(b.title));
for (const b of books) {
  db.prepare("INSERT INTO jobs (type, book_id, input, charge, progress) VALUES ('podcast', ?, ?, 'admin', '排队中')").run(b.id, JSON.stringify({ revoice: true }));
  updateBook(b.id, { podcast_status: 'queued' });
  console.log(`已排队重新配音：《${b.title}》`);
}
if (!books.length) console.log('没有可重新配音的书');
