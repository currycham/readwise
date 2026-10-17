// 多模型对比：npm run compare -- [--models deepseek-pro,hy4,qwen-max] [--books "原子习惯,非暴力沟通"]
// 同一本书的检索结果会缓存，所有模型用同一份资料。
// 质检交叉进行：每个模型的结果由另一个家族的模型审核（--checker 可指定统一的质检模型）。
import { mkdir, writeFile } from 'node:fs/promises';
import { EVAL_BOOKS } from '../config/eval-books.mjs';
import { buildBookPage } from '../engine/pipeline.mjs';
import { searchBook, slugify } from '../engine/search.mjs';
import { renderPage } from '../renderer/render.mjs';
import { parseArgs } from './args.mjs';

const { opt } = parseArgs();
const models = (opt.models || 'deepseek-pro,hy4,qwen-max').split(',').map(s => s.trim()).filter(Boolean);
const books = opt.books ? opt.books.split(',').map(t => EVAL_BOOKS.find(b => b.title === t.trim()) || { title: t.trim() }) : EVAL_BOOKS;

// 质检模型：优先用参与对比的其他家族模型，避免模型给自家内容打高分
const family = a => a.split('-')[0].replace(/\d.*$/, '');
function checkerFor(m) {
  if (opt.checker) return opt.checker;
  return models.find(x => family(x) !== family(m)) || undefined;
}

const rows = [];
// 所有（书 × 模型）组合放进一个并发池（默认同时 4 个）；检索结果先缓存，所有模型共用同一份资料
for (const b of books) await searchBook(b.title, b.author || '');
const jobs = books.flatMap(b => models.map(m => ({ b, m })));
const concurrency = Number(opt.concurrency || 4);
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (next < jobs.length) { const { b, m } = jobs[next++]; rows.push(await runOne(b, m)); }
}));
rows.sort((x, y) => books.findIndex(b => b.title === x.book) - books.findIndex(b => b.title === y.book) || models.indexOf(x.model) - models.indexOf(y.model));

async function runOne(b, m) {
  const tag = `《${b.title}》×${m}`;
  let r;
  try {
    r = await buildBookPage({ ...b, model: m, checkModel: checkerFor(m), log: x => console.log(`· ${tag} ${x}`) });
  } catch (e) {
    console.error(`✗ ${tag} ${e.message}`);
    return { book: b.title, model: m, status: 'error', error: e.message };
  }
  const slug = slugify(b.title);
  let html = '';
  if (r.page) {
    html = `../books/${slug}/${m}.html`;
    await writeFile(new URL(`../out/books/${slug}/${m}.html`, import.meta.url), await renderPage(r.page, { slug }));
  }
  const issues = r.check?.issues || [];
  const sev = s => issues.filter(i => i.severity === s).length;
  return {
    book: b.title, model: m, checker: checkerFor(m) || '', status: r.status, evidence: r.assessment?.total,
    cost: r.cost, sec: Math.round(r.ms / 1000),
    chunks: r.page?.chunks?.length ?? '', chars: r.page ? JSON.stringify(r.page.chunks).length : 0,
    structErrors: r.page?.meta?.structure_errors?.length ?? '',
    checkScore: r.check?.score ?? '', high: sev('high'), medium: sev('medium'),
    summary: r.check?.summary || r.assessment?.reason || '', html,
  };
}

await mkdir(new URL('../out/compare/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
await writeFile(new URL(`../out/compare/${stamp}.json`, import.meta.url), JSON.stringify(rows, null, 2));

// 按模型汇总
const byModel = models.map(m => {
  const rs = rows.filter(r => r.model === m && r.status === 'ok');
  const avg = k => rs.length ? rs.reduce((s, r) => s + (Number(r[k]) || 0), 0) / rs.length : 0;
  return { model: m, ok: rs.length, of: rows.filter(r => r.model === m).length, cost: avg('cost'), sec: avg('sec'), check: avg('checkScore'), high: avg('high') };
});

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><meta charset="utf-8"><title>模型对比 ${stamp}</title>
<style>body{font:14px/1.6 -apple-system,"PingFang SC",sans-serif;margin:24px;color:#15242A}table{border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #C9D5D3;padding:6px 10px;text-align:left;vertical-align:top}th{background:#EDF1F0}td.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#AF3A36}</style>
<h1>书页生成模型对比 · ${stamp}</h1>
<p>质检交叉进行（每个模型的结果由另一个模型审核）；“严重问题”指质检判为 high 的编造或错误，已在修正环节处理，但它反映了模型初稿的可靠性。请务必配合人工抽查：每本书至少打开两个模型的页面，对照你对原书的了解打分。</p>
<h2>按模型汇总</h2>
<table><tr><th>模型</th><th>成功</th><th>平均成本</th><th>平均用时</th><th>平均质检分</th><th>平均严重问题</th></tr>
${byModel.map(m => `<tr><td>${m.model}</td><td class="n">${m.ok}/${m.of}</td><td class="n">¥${m.cost.toFixed(2)}</td><td class="n">${m.sec.toFixed(0)} 秒</td><td class="n">${m.check.toFixed(1)}</td><td class="n">${m.high.toFixed(1)}</td></tr>`).join('')}
</table>
<h2>明细</h2>
<table><tr><th>书</th><th>模型</th><th>状态</th><th>资料分</th><th>成本</th><th>用时</th><th>知识块</th><th>内容量</th><th>结构问题</th><th>质检模型</th><th>质检分</th><th>high/medium</th><th>质检意见</th><th>页面</th></tr>
${rows.map(r => `<tr><td>${esc(r.book)}</td><td>${r.model}</td><td class="${r.status === 'ok' ? '' : 'bad'}">${r.status}${r.error ? '：' + esc(r.error) : ''}</td><td class="n">${r.evidence ?? ''}</td><td class="n">${r.cost != null ? '¥' + r.cost.toFixed(2) : ''}</td><td class="n">${r.sec ?? ''}</td><td class="n">${r.chunks}</td><td class="n">${r.chars}</td><td class="n">${r.structErrors}</td><td>${r.checker || ''}</td><td class="n">${r.checkScore}</td><td class="n">${r.high ?? ''}/${r.medium ?? ''}</td><td>${esc(r.summary)}</td><td>${r.html ? `<a href="${r.html}">打开</a>` : ''}</td></tr>`).join('')}
</table>`;
const reportFile = new URL(`../out/compare/${stamp}.html`, import.meta.url);
await writeFile(reportFile, html);
console.log(`\n对比报告：${decodeURIComponent(reportFile.pathname)}`);
console.table(byModel);
