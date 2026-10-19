// 书籍网络：让模型找出一本书和书库里其他书之间的联系（呼应、对话、互补、延伸、同源）。
import { ROLES } from '../config/models.mjs';
import { chatJSON } from './llm.mjs';
import { LINK_SYSTEM, LINK_TYPES, linkUser } from './prompts.mjs';

const cut = (s, n) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

/** 一本书的摘要。detail 为 true 时多给问题、主旨和术语（目标书用），否则只给一句话和知识块标题 */
export function bookDigest(page, slug, { detail = false } = {}) {
  const b = page.book, c = b.categories?.[0];
  const parts = [`[${slug}] 《${b.title}》${b.author || ''}`, c && `分类：${c.top} / ${c.sub}`, `一句话：${page.recommend?.one_line || ''}`];
  if (detail) {
    parts.push(`要回答的问题：${cut(page.inspect?.problem, 120)}`, `主旨：${cut(page.inspect?.unity, 120)}`);
    parts.push(`核心术语：${(page.chunks || []).flatMap(k => (k.terms || []).map(t => t.term)).slice(0, 20).join('、')}`);
  }
  parts.push(`知识块：${(page.chunks || []).map(k => k.title).join('；')}`);
  return parts.filter(Boolean).join(detail ? '\n' : ' | ');
}

/**
 * @param {{slug:string, page:object}} target
 * @param {{slug:string, page:object}[]} others
 * @returns {Promise<{links:{slug:string,type:string,concept:string,why:string,strength:number}[], cost:number}>}
 */
export async function findLinks(target, others, { alias = ROLES.link } = {}) {
  if (!others.length) return { links: [], cost: 0 };
  const r = await chatJSON({
    alias, task: 'links', book: target.page.book.title, temperature: 0.3, maxTokens: 12000, // deepseek-pro 的推理过程也算在输出里
    messages: [
      { role: 'system', content: LINK_SYSTEM },
      { role: 'user', content: linkUser({ target: bookDigest(target.page, target.slug, { detail: true }), others: others.map(o => bookDigest(o.page, o.slug)) }) },
    ],
  });
  const valid = new Set(others.map(o => o.slug));
  const seen = new Set();
  const links = (Array.isArray(r.data?.links) ? r.data.links : [])
    .filter(l => valid.has(l.slug) && LINK_TYPES.includes(l.type) && !seen.has(l.slug) && seen.add(l.slug))
    .slice(0, 6)
    // 模型偶尔照搬提示词里的“目标书”，换成书名
    .map(l => ({ ...l, why: String(l.why || '').replaceAll('目标书', `《${String(target.page.book.title).split(/[:：]/)[0]}》`) }))
    .map(l => ({ slug: l.slug, type: l.type, concept: cut(l.concept, 12), why: cut(l.why, 60), strength: Math.min(3, Math.max(1, Math.round(Number(l.strength) || 1))) }));
  return { links, cost: r.cost };
}
