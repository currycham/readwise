// 给已有播客补写 AI 生成标识（ID3 标签，不重新编码）。用法：npm run podcast-tag
import { tagMp3 } from '../engine/tts.mjs';
import { getDb } from '../lib/db.mjs';

const rows = getDb().prepare("SELECT id, title, author, podcast_file FROM books WHERE podcast_status = 'ready' AND podcast_file IS NOT NULL ORDER BY id").all();
let ok = 0;
for (const b of rows) {
  const r = await tagMp3(b.podcast_file, { title: b.title, author: b.author, id: `podcast-${b.id}` });
  if (r) ok++;
  console.log(`${r ? '✓' : '✗'} ${b.title}`);
}
console.log(`完成：${ok}/${rows.length}`);
