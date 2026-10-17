// 把书页 JSON 渲染成 HTML：npm run render -- fixtures/最小阻力之路.json [输出.html]
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { renderPage } from '../renderer/render.mjs';
import { validatePage } from '../engine/schema.mjs';
import { parseArgs } from './args.mjs';

const { pos } = parseArgs();
if (!pos[0]) { console.error('用法：npm run render -- 书页.json [输出.html]'); process.exit(1); }
const page = JSON.parse(await readFile(pos[0], 'utf8'));
const errors = validatePage(page);
if (errors.length) console.warn(`结构校验有 ${errors.length} 处问题：\n- ${errors.join('\n- ')}`);
const out = pos[1] || pos[0].replace(/\.json$/, '.html');
await writeFile(out, await renderPage(page, { slug: basename(pos[0], '.json') }));
console.log('已渲染：', out);
