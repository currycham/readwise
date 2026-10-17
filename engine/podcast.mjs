// 播客：先由大模型写双人对谈稿，再交给语音合成（TTS 接口待接入，见 README）。
import { ROLES } from '../config/models.mjs';
import { chatJSON } from './llm.mjs';
import { PODCAST_SYSTEM, podcastUser } from './prompts.mjs';

export async function podcastScript(page, { minutes = 30, alias = ROLES.podcast } = {}) {
  const chars = minutes * 300;
  const r = await chatJSON({
    alias,
    task: 'podcast',
    book: page.book.title,
    temperature: 0.8,
    messages: [
      { role: 'system', content: PODCAST_SYSTEM.replace('{minutes}', minutes).replace('{chars}', chars).replace('{perChunk}', Math.round((chars - 800) / page.chunks.length)) },
      { role: 'user', content: podcastUser(page) },
    ],
  });
  const script = r.data;
  if (!Array.isArray(script.segments)) throw new Error('播客稿结构不对：缺少 segments');
  const total = script.segments.flatMap(s => s.lines || []).reduce((n, l) => n + [...(l.text || '')].length, 0);
  return { script, chars: total, estMinutes: Math.round(total / 300), cost: r.cost, ms: r.ms, model: r.model };
}

export { synthesizePodcast } from './tts.mjs';
