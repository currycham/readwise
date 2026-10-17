// 联网检索：为一本书收集元数据和有实质内容的解读，结果缓存在 out/cache，避免对比测试时重复花钱。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SEARCH } from '../config/models.mjs';

const CACHE = new URL('../out/cache/', import.meta.url);

export function slugify(s) {
  return s.replace(/[《》\s/\\?:*"<>|]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'book';
}

/** 针对一本书构造几组查询：元数据、核心观点、章节结构、书评。 */
function queries(title, author) {
  const t = `《${title}》${author ? ' ' + author : ''}`;
  return [
    `${t} 作者 出版社 ISBN`,
    `${t} 核心观点 主要内容`,
    `${t} 章节 目录 读书笔记`,
    `${t} 书评 解读`,
  ];
}

export async function searchBook(title, author = '') {
  const key = slugify(`${title}-${author}`);
  const file = new URL(`${key}.json`, CACHE);
  try { return JSON.parse(await readFile(file, 'utf8')); } catch {}

  let results = [];
  let cost = 0;
  if (SEARCH.provider === 'none') {
    results = [];
  } else if (SEARCH.provider === 'bocha') {
    const apiKey = process.env[SEARCH.bocha.keyEnv];
    if (!apiKey) throw new Error(`缺少 ${SEARCH.bocha.keyEnv}；没有搜索 key 时可设 SEARCH_PROVIDER=none 测试`);
    for (const q of queries(title, author)) {
      const res = await fetch(SEARCH.bocha.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: q, summary: true, count: 8, freshness: 'noLimit' }),
      });
      if (!res.ok) throw new Error(`博查搜索返回 ${res.status}：${(await res.text()).slice(0, 300)}`);
      const j = await res.json();
      const pages = j.data?.webPages?.value || j.webPages?.value || [];
      for (const p of pages) {
        results.push({ query: q, title: p.name, url: p.url, site: p.siteName || '', text: (p.summary || p.snippet || '').slice(0, 1500) });
      }
      cost += SEARCH.bocha.pricePerCall;
    }
  } else {
    throw new Error(`未知搜索供应商：${SEARCH.provider}`);
  }

  // 按 URL 去重
  const seen = new Set();
  results = results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url));
  const out = { title, author, provider: SEARCH.provider, results, cost, at: new Date().toISOString() };
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2));
  return out;
}

export function evidenceText(search, max = 24000) {
  let s = '';
  search.results.forEach((r, i) => {
    const block = `[${i + 1}] ${r.title}（${r.site || r.url}）\n${r.url}\n${r.text}\n\n`;
    if (s.length + block.length <= max) s += block;
  });
  return s || '（没有检索结果）';
}
