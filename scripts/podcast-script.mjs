// 为已生成的书页写播客稿：npm run podcast-script -- out/books/xxx/deepseek-pro.json [--minutes 18] [--model alias]
import { readFile, writeFile } from 'node:fs/promises';
import { podcastScript } from '../engine/podcast.mjs';
import { parseArgs } from './args.mjs';

const { pos, opt } = parseArgs();
if (!pos[0]) { console.error('用法：npm run podcast-script -- 书页.json [--minutes 18] [--model alias]'); process.exit(1); }
const page = JSON.parse(await readFile(pos[0], 'utf8'));
const r = await podcastScript(page, { minutes: opt.minutes ? Number(opt.minutes) : undefined, alias: opt.model });
const out = pos[0].replace(/\.json$/, `.podcast-${r.model}.json`);
await writeFile(out, JSON.stringify(r, null, 2));
console.log(`播客稿 ${r.chars} 字（约 ${r.estMinutes} 分钟），成本 ¥${r.cost.toFixed(3)}，用时 ${(r.ms / 1000).toFixed(0)} 秒：${out}`);
