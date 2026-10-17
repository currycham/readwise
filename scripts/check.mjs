// 只做结构校验：npm run check -- 书页.json
import { readFile } from 'node:fs/promises';
import { validatePage } from '../engine/schema.mjs';

const f = process.argv[2];
if (!f) { console.error('用法：npm run check -- 书页.json'); process.exit(1); }
const errors = validatePage(JSON.parse(await readFile(f, 'utf8')));
console.log(errors.length ? `✗ ${errors.length} 处问题：\n- ${errors.join('\n- ')}` : '✓ 结构校验通过');
process.exit(errors.length ? 1 : 0);
