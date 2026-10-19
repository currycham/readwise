// 书库去重键改为只看主书名（去掉冒号后的副标题）后，给已有的书重算一次。用法：npm run rekey-books [-- --dry]
import { normKey } from '../lib/books.mjs';
import { getDb } from '../lib/db.mjs';

const dry = process.argv.includes('--dry');
const db = getDb();
for (const b of db.prepare('SELECT id, title, norm_key FROM books ORDER BY id').all()) {
  const k = normKey(b.title);
  if (k === b.norm_key) continue;
  const dup = db.prepare('SELECT title FROM books WHERE norm_key = ? AND id != ?').get(k, b.id);
  if (dup) { console.log(`✗ 《${b.title}》：和《${dup.title}》重复，保留原来的键`); continue; }
  if (!dry) db.prepare('UPDATE books SET norm_key = ? WHERE id = ?').run(k, b.id);
  console.log(`${dry ? '·' : '✓'} 《${b.title}》：${b.norm_key} → ${k}`);
}
