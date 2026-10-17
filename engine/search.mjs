// 联网检索：为一本书收集元数据和有实质内容的解读，结果缓存在 out/cache，避免对比测试时重复花钱。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SEARCH } from '../config/models.mjs';

const CACHE = new URL('../out/cache/', import.meta.url);

export function slugify(s) {
  return s.replace(/[《》\s/\\?:*"<>|]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'book';
}

/** 针对一本书构造几组偏向“内容”的查询：核心观点、要点笔记、各章概要、书评解读。书目信息在这些结果里通常也会出现。 */
function queries(title, author) {
  const t = `《${title}》${author ? ' ' + author : ''}`;
  return [
    `${t} 核心观点 主要内容 概念`,
    `${t} 读书笔记 要点 总结`,
    `${t} 各章 内容 概要`,
    `${t} 书评 解读 作者观点`,
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
      const res = await bochaFetch(apiKey, q);
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

  // 按 URL 去重，并去掉盗版下载类页面（不作为资料，也不会出现在书页来源里）
  const seen = new Set();
  const piracy = /(下载|高清|pdf|epub|mobi|azw3|txt全文|全文阅读|电子书免费|网盘)/i;
  // 书店商品页、旧书网、试读页只有书目信息，没有内容价值
  const shop = /(孔夫子|旧书|正版|现货|购物车|京东价|淘宝|天猫|当当|拼多多|在线阅读|版权信息|试读|包邮)/;
  results = results.filter(r => r.url && !seen.has(r.url) && seen.add(r.url) && !piracy.test(r.title || '') && !shop.test((r.title || '') + (r.text || '').slice(0, 80)));
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

/** 博查有 QPS 限制：每次请求间隔 1.2 秒，遇到 429 退避重试（最多 5 次）。 */
let lastCall = 0;
async function bochaFetch(apiKey, query) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 1200 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetch(SEARCH.bocha.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, summary: true, count: 8, freshness: 'noLimit' }),
    });
    if (res.ok) return res;
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 429 && attempt < 5) {
      await new Promise(r => setTimeout(r, 3000 * 2 ** attempt));
      continue;
    }
    throw new Error(`博查搜索返回 ${res.status}：${detail}`);
  }
}
