// 书籍网络：给还没算过联系的书找联系（--all 全部重算）。用法：npm run book-links [-- --all]
import { getDb } from '../lib/db.mjs';
import { linkBook } from '../lib/links.mjs';

const all = process.argv.includes('--all');
const rows = getDb().prepare(`SELECT id, title FROM books WHERE status = 'ready' ${all ? '' : 'AND links_at IS NULL'} ORDER BY id`).all();
let cost = 0;
for (const b of rows) {
  try { const r = await linkBook(b.id, { log: console.log }); cost += r.cost; }
  catch (e) { console.log(`✗ 《${b.title}》：${e.message.slice(0, 100)}`); }
}
console.log(`完成 ${rows.length} 本，花费 ¥${cost.toFixed(3)}`);
