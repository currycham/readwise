// 生成一本书的精读页：
//   npm run generate -- "最小阻力之路" [--author 罗伯特·弗里茨] [--model deepseek-pro] [--file 原文.pdf] [--skip-check]
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildBookPage } from '../engine/pipeline.mjs';
import { slugify } from '../engine/search.mjs';
import { renderPage } from '../renderer/render.mjs';
import { parseArgs } from './args.mjs';

const { pos, opt } = parseArgs();
const title = pos[0];
if (!title) {
  console.error('用法：npm run generate -- "书名" [--author 作者] [--model alias] [--file 原文.pdf] [--skip-check]');
  process.exit(1);
}
const r = await buildBookPage({
  title, author: opt.author || '', model: opt.model, file: opt.file, skipCheck: !!opt['skip-check'],
  log: m => console.log('·', m),
});
if (r.status === 'insufficient') {
  console.log(`\n暂无足够可靠的资料（${r.assessment.total}/9）：${r.assessment.reason}\n请用 --file 上传原文（txt/pdf/epub）后重试。`);
} else if (r.status === 'ambiguous') {
  console.log('\n书名对应多本书，请用 --author 指定：');
  for (const c of r.assessment.candidates || []) console.log(`  - 《${c.title}》${c.author} ${c.note || ''}`);
} else {
  const slug = slugify(title);
  const file = new URL(`../out/books/${slug}/${r.model}.html`, import.meta.url);
  await writeFile(file, await renderPage(r.page, { slug }));
  console.log(`\n${r.status === 'ok' ? '已生成' : '已生成（仍有结构问题，见 run.json）'}：${fileURLToPath(file)}`);
  if (r.check) console.log(`质检 ${r.check.score}/10：${r.check.summary}`);
}
