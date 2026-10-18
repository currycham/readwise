// 把命令行生成好的书页 JSON 导入网站书库：npm run import-book -- out/books/xxx/hy4.json [--podcast]
// --podcast：导入后排队生成播客（由 worker 处理）
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { validatePage } from '../engine/schema.mjs';
import { insertBook, updateBook } from '../lib/books.mjs';
import { getDb } from '../lib/db.mjs';
import { parseArgs } from './args.mjs';

const { pos, opt } = parseArgs();
if (!pos[0]) { console.error('用法：npm run import-book -- 书页.json [--podcast]'); process.exit(1); }
const page = JSON.parse(await readFile(pos[0], 'utf8'));
const errs = validatePage(page);
if (errs.length) { console.error('结构校验不通过：\n' + errs.join('\n')); process.exit(1); }

let checkScore = null;
try { checkScore = JSON.parse(await readFile(pos[0].replace(/\.json$/, '.run.json'), 'utf8')).check?.score ?? null; } catch {}
const { book, existed } = insertBook(page, { userId: null, model: basename(pos[0], '.json'), source: 'search', checkScore, requestedTitle: page.book.title });
console.log(existed ? `书库里已有《${book.title}》（id ${book.id}），未重复导入` : `已导入《${book.title}》（id ${book.id}，/b/${book.slug}）`);

if (opt.podcast && !['queued', 'running', 'ready'].includes(book.podcast_status)) {
  getDb().prepare("INSERT INTO jobs (type, book_id, charge, progress) VALUES ('podcast', ?, 'admin', '排队中')").run(book.id);
  updateBook(book.id, { podcast_status: 'queued' });
  console.log('已排队生成播客，worker 会自动处理');
}
