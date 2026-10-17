// 连通性检查：列出各供应商可用模型，并对每个模型 alias 发一个极小请求。
//   npm run ping            → 测试所有 alias 和搜索
//   npm run ping -- --list  → 只列出各供应商的模型 ID
import { MODELS, PROVIDERS, SEARCH } from '../config/models.mjs';
import { chat } from '../engine/llm.mjs';
import { parseArgs } from './args.mjs';

const { opt } = parseArgs();

for (const [name, p] of Object.entries(PROVIDERS)) {
  const key = process.env[p.keyEnv];
  if (!key || !p.baseURL) continue;
  try {
    const r = await fetch(`${p.baseURL.replace(/\/$/, '')}/models`, { headers: { authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    const ids = (j.data || []).map(m => m.id);
    console.log(`\n[${name}] /models ${r.status}：${ids.length ? ids.join(', ') : JSON.stringify(j).slice(0, 200)}`);
  } catch (e) {
    console.log(`\n[${name}] /models 失败：${e.message}`);
  }
}
if (opt.list) process.exit(0);

console.log('\n模型测试：');
for (const alias of Object.keys(MODELS)) {
  try {
    const r = await chat({ alias, task: 'ping', maxTokens: 20, messages: [{ role: 'user', content: '只回复两个字：收到' }] });
    console.log(`✓ ${alias.padEnd(15)} ${MODELS[alias].model.padEnd(18)} ${r.ms}ms  “${r.text.trim().slice(0, 20)}”`);
  } catch (e) {
    console.log(`✗ ${alias.padEnd(15)} ${MODELS[alias].model.padEnd(18)} ${e.message.slice(0, 160)}`);
  }
}

if (SEARCH.provider === 'bocha') {
  const key = process.env[SEARCH.bocha.keyEnv];
  const r = await fetch(SEARCH.bocha.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: '《原子习惯》 核心观点', summary: true, count: 3 }),
  });
  const j = await r.json().catch(() => ({}));
  const pages = j.data?.webPages?.value || [];
  console.log(`\n${r.ok && pages.length ? '✓' : '✗'} 博查搜索 ${r.status}：${pages.length ? pages.map(p => p.name).join(' | ') : JSON.stringify(j).slice(0, 200)}`);
}
