// 把书页 JSON 渲染成单个 HTML 文件。数据以 JSON 嵌入，页面脚本负责渲染。
import { readFile } from 'node:fs/promises';
import { rootPath } from '../engine/paths.mjs';

const TEMPLATE = rootPath('renderer', 'template.html');

export async function renderPage(page, { slug, apiBase = '' } = {}) {
  const tpl = await readFile(TEMPLATE, 'utf8');
  const data = { ...page, meta: { ...(page.meta || {}), slug: slug || page.meta?.slug || page.book.title } };
  // 防止内容里的 </script> 提前结束脚本块
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = tpl.replace('<!--TITLE-->', esc(page.book.title)).replace('<!--BOOK_DATA-->', () => json);
  if (apiBase) html = html.replace('<script>\n(function(){', () => `<script>window.BOOK_API=${JSON.stringify(apiBase)};</script>\n<script>\n(function(){`);
  return html;
}
