// 为书页生成完整播客（稿 + 语音）：npm run podcast -- out/books/xxx/hy4.json [--minutes 18]
import { readFile, writeFile } from 'node:fs/promises';
import { podcastScript, synthesizePodcast } from '../engine/podcast.mjs';
import { parseArgs } from './args.mjs';

const { pos, opt } = parseArgs();
if (!pos[0]) { console.error('用法：npm run podcast -- 书页.json [--minutes 18]'); process.exit(1); }
const page = JSON.parse(await readFile(pos[0], 'utf8'));
const t0 = Date.now();
console.log('写稿…');
const s = await podcastScript(page, { minutes: opt.minutes ? Number(opt.minutes) : undefined });
console.log(`稿件 ${s.chars} 字，约 ${s.estMinutes} 分钟，¥${s.cost.toFixed(2)}，${Math.round(s.ms / 1000)} 秒`);
await writeFile(pos[0].replace(/\.json$/, '.podcast.json'), JSON.stringify(s, null, 2));
const out = pos[0].replace(/\.json$/, '.mp3');
const a = await synthesizePodcast(s.script, out, { book: page.book.title, onProgress: (d, n) => d % 10 === 0 && console.log(`配音 ${d}/${n}`) });
console.log(`音频 ${Math.round(a.durationMs / 60000)} 分钟，${a.turns} 段，计费 ${a.chars} 字符，约 ¥${a.cost.toFixed(2)}；总用时 ${Math.round((Date.now() - t0) / 1000)} 秒：${out}`);
