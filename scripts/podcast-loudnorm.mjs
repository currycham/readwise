// 把已有播客的响度统一到 -16 LUFS（PODCAST_LUFS 可改），新播客转码时自动处理。用法：npm run podcast-loudnorm [-- --dry]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compressMp3 } from '../engine/tts.mjs';
import { getDb } from '../lib/db.mjs';

const dry = process.argv.includes('--dry');
const target = Number(process.env.PODCAST_LUFS ?? -16);
const rows = getDb().prepare("SELECT id, title, author, podcast_file FROM books WHERE podcast_status = 'ready' AND podcast_file IS NOT NULL ORDER BY id").all();

async function lufs(file) {
  const { stderr } = await promisify(execFile)('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { timeout: 300000, maxBuffer: 16 << 20 });
  // 最后一个 “I: … LUFS” 是 Summary 里的整体响度
  return Number([...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1]);
}

for (const b of rows) {
  let before;
  try { before = await lufs(b.podcast_file); } catch (e) { console.log(`✗ ${b.title}：${e.message.slice(0, 80)}`); continue; }
  // 和目标相差 2 LU 以内的跳过，避免重复转码
  if (Math.abs(before - target) <= 2) { console.log(`- ${b.title}：已是 ${before} LUFS，跳过`); continue; }
  if (dry) { console.log(`· ${b.title}：${before} LUFS`); continue; }
  const ok = await compressMp3(b.podcast_file, b.podcast_file, { title: b.title, author: b.author, id: `podcast-${b.id}` });
  console.log(`${ok ? '✓' : '✗'} ${b.title}：${before} → ${await lufs(b.podcast_file)} LUFS`);
}
