// 从豆瓣刷新书籍评分：默认刷新没有评分、来自检索、或豆瓣数据超过 30 天的书；人工填写的不动
// 用法：npm run douban-refresh [-- --all] [-- --dry]   --all 刷新全部（仍跳过人工填写），--dry 只看不写
import { doubanLookup } from '../engine/douban.mjs';
import { getDb } from '../lib/db.mjs';

const all = process.argv.includes('--all'), dry = process.argv.includes('--dry');
const db = getDb();
const books = db.prepare("SELECT id, title, author, douban_rating, douban_count, douban_via, douban_at FROM books WHERE status = 'ready' AND COALESCE(douban_via, '') != 'admin' ORDER BY id").all();
const stale = Date.now() - 30 * 86400e3;
let changed = 0, miss = 0;
for (const b of books) {
  if (!all && b.douban_via === 'douban' && b.douban_at && Date.parse(b.douban_at) > stale) continue;
  const r = await doubanLookup({ title: b.title, author: b.author }, { log: m => console.log('  ' + m) });
  if (!r) { miss++; console.log(`✗ ${b.title}：没找到（保留原值 ${b.douban_rating ?? '无'}）`); continue; }
  console.log(`✓ ${b.title}：${b.douban_rating ?? '无'}${b.douban_count ? `（${b.douban_count}）` : ''} → ${r.rating}（${r.count}）subject ${r.id}`);
  if (dry) continue;
  db.prepare("UPDATE books SET douban_rating = ?, douban_count = ?, douban_via = 'douban', douban_id = ?, douban_at = ? WHERE id = ?").run(r.rating, r.count, r.id, new Date().toISOString(), b.id);
  changed++;
}
console.log(`完成：更新 ${changed} 本，未找到 ${miss} 本`);
