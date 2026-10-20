// 把书页 JSON 渲染成单个 HTML 文件。数据以 JSON 嵌入，页面脚本负责渲染。
import { readFile } from 'node:fs/promises';
import { rootPath } from '../engine/paths.mjs';

const TEMPLATE = rootPath('renderer', 'template.html');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {object} page
 * @param {object} [o]
 * @param {string} [o.slug]
 * @param {string} [o.apiBase]
 * @param {string} [o.siteUrl]  站点根地址；给了才写 canonical、og:url 和分享图
 * @param {string} [o.aigcId]   AI 生成内容的隐式标识里的内容编号
 */
export async function renderPage(page, { slug, apiBase = '', siteUrl = '', aigcId = '' } = {}) {
  const tpl = await readFile(TEMPLATE, 'utf8');
  const data = { ...page, meta: { ...(page.meta || {}), slug: slug || page.meta?.slug || page.book.title } };
  // 防止内容里的 </script> 提前结束脚本块
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  let html = tpl.replace('<!--TITLE-->', esc(`《${page.book.title}》书籍回顾 · Readwise`))
    .replace('<!--HEAD-->', () => headTags(page, { slug: data.meta.slug, siteUrl, aigcId }))
    .replace('<!--BOOK_DATA-->', () => json);
  if (apiBase) html = html.replace('<script>\n(function(){', () => `<script>window.BOOK_API=${JSON.stringify(apiBase)};</script>\n<script>\n(function(){`);
  return html;
}

// 页面描述、分享预览（og）和 AI 生成内容的隐式标识（《人工智能生成合成内容标识办法》，元数据字段参照 GB 45438-2025）
function headTags(page, { slug, siteUrl, aigcId }) {
  const b = page.book;
  const title = `《${b.title}》书籍回顾`;
  const desc = [b.author && `${b.author} 著。`, page.recommend?.one_line, '双人播客、限时精读、闯关检测和向作者提问，AI 生成。']
    .filter(Boolean).join('').replace(/\s+/g, ' ').slice(0, 150);
  const root = siteUrl.replace(/\/$/, '');
  const url = root && slug ? `${root}/b/${encodeURIComponent(slug)}` : '';
  let host = '';
  try { host = root ? new URL(root).host : ''; } catch {}
  const aigc = { Label: '1', ContentProducer: process.env.AIGC_PRODUCER || host || 'Readwise', ProduceID: aigcId || slug || b.title };
  const tags = [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="AIGC" content="${esc(JSON.stringify(aigc))}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Readwise">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta name="twitter:card" content="summary">`,
    // 书页不经过 Next 的 layout，网站图标要自己写
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" href="/icon.png" type="image/png">`,
    `<link rel="apple-touch-icon" href="/apple-icon.png">`,
  ];
  if (url) tags.push(`<link rel="canonical" href="${esc(url)}">`, `<meta property="og:url" content="${esc(url)}">`, `<meta property="og:image" content="${esc(root)}/podcast-art.png">`);
  return tags.join('\n');
}
