// 用同一组质检模型统一复审已生成的书页，便于公平对比：
//   npm run recheck -- --checkers deepseek-pro,qwen-max [--models deepseek-pro,qwen-max,hy4]
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { EVAL_BOOKS } from '../config/eval-books.mjs';
import { chatJSON } from '../engine/llm.mjs';
import * as P from '../engine/prompts.mjs';
import { evidenceText, searchBook, slugify } from '../engine/search.mjs';
import { parseArgs } from './args.mjs';

const { opt } = parseArgs();
const checkers = (opt.checkers || 'deepseek-pro,qwen-max').split(',');
const models = (opt.models || 'deepseek-pro,qwen-max,hy4').split(',');
const jobs = [];
for (const b of EVAL_BOOKS) for (const m of models) for (const c of checkers) {
  const f = new URL(`../out/books/${slugify(b.title)}/${m}.json`, import.meta.url);
  if (existsSync(f)) jobs.push({ b, m, c, f });
}
const results = [];
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const { b, m, c, f } = jobs[next++];
    const page = JSON.parse(await readFile(f, 'utf8'));
    const notes = evidenceText(await searchBook(b.title, b.author));
    try {
      const r = await chatJSON({ alias: c, task: 'recheck', book: b.title, maxTokens: 16000,
        messages: [{ role: 'system', content: P.CHECK_SYSTEM }, { role: 'user', content: P.checkUser({ page, notes }) }] });
      const iss = r.data.issues || [];
      results.push({ book: b.title, model: m, checker: c, score: r.data.score, high: iss.filter(i => i.severity === 'high').length, medium: iss.filter(i => i.severity === 'medium').length, issues: iss });
      console.log(`✓ 《${b.title}》${m} ← ${c}：${r.data.score}`);
    } catch (e) { console.log(`✗ 《${b.title}》${m} ← ${c}：${e.message}`); }
  }
}));
await writeFile(new URL('../out/compare/recheck.json', import.meta.url), JSON.stringify(results, null, 2));
console.log('\n模型 × 质检模型：平均分 / high / medium');
for (const m of models) for (const c of checkers) {
  const rs = results.filter(r => r.model === m && r.checker === c);
  if (!rs.length) continue;
  const avg = k => (rs.reduce((s, r) => s + r[k], 0) / rs.length).toFixed(1);
  console.log(`${m.padEnd(13)} ← ${c.padEnd(13)} ${avg('score')} / ${rs.reduce((s, r) => s + r.high, 0)} / ${rs.reduce((s, r) => s + r.medium, 0)}`);
}
