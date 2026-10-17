// 问作者：书页内容作为固定 system 前缀（可缓存），只保留最近 10 轮对话。
import { ROLES } from '../config/models.mjs';
import { chat } from './llm.mjs';
import { askSystem } from './prompts.mjs';

const MAX_TURNS = 10;
const MAX_QUESTION_CHARS = 800;

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new Error('没有问题');
  const clean = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? MAX_QUESTION_CHARS : 4000) }));
  if (clean.at(-1)?.role !== 'user') throw new Error('最后一条应是读者的问题');
  return clean.slice(-MAX_TURNS * 2);
}

export async function askAuthor(page, messages, { onDelta, alias = ROLES.ask } = {}) {
  return chat({
    alias,
    task: 'ask',
    book: page.book.title,
    maxTokens: 1200,
    temperature: 0.7,
    onDelta,
    messages: [{ role: 'system', content: askSystem(page) }, ...sanitizeMessages(messages)],
  });
}
