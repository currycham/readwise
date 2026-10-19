// 把已有播客转成 64kbps 单声道（PODCAST_BITRATE 可改），文件约减半。用法：npm run podcast-compress [-- --dry]
import { statSync } from 'node:fs';
import { compressMp3 } from '../engine/tts.mjs';
import { getDb } from '../lib/db.mjs';

const dry = process.argv.includes('--dry');
const rows = getDb().prepare("SELECT id, title, author, podcast_file FROM books WHERE podcast_status = 'ready' AND podcast_file IS NOT NULL ORDER BY id").all();
let before = 0, after = 0;
for (const b of rows) {
  let size;
  try { size = statSync(b.podcast_file).size; } catch { console.log(`✗ ${b.title}：文件不存在`); continue; }
  // 按每秒字节数判断现在的码率，已经是低码率的跳过
  const kbps = Math.round(size * 8 / 1000 / Math.max(1, (getDb().prepare('SELECT podcast_ms FROM books WHERE id = ?').get(b.id).podcast_ms || 1) / 1000));
  if (kbps <= 72) { console.log(`- ${b.title}：已是 ${kbps}kbps，跳过`); continue; }
  if (dry) { console.log(`· ${b.title}：${(size / 1e6).toFixed(1)}MB（约 ${kbps}kbps）`); continue; }
  const ok = await compressMp3(b.podcast_file, b.podcast_file, { title: b.title, author: b.author, id: `podcast-${b.id}` });
  const now = statSync(b.podcast_file).size;
  before += size; after += now;
  console.log(`${ok ? '✓' : '✗'} ${b.title}：${(size / 1e6).toFixed(1)}MB → ${(now / 1e6).toFixed(1)}MB`);
}
if (!dry) console.log(`完成：${(before / 1e6).toFixed(0)}MB → ${(after / 1e6).toFixed(0)}MB`);
