// 内容安全审核（腾讯云文本内容安全 TMS）。MODERATION_PROVIDER=none 时跳过（开发用，正式上线前必须开启）。
import { tcCall } from './tencentcloud.mjs';

/** @returns {Promise<{ok:boolean, label?:string}>} */
export async function checkText(text) {
  const provider = process.env.MODERATION_PROVIDER || 'none';
  if (provider === 'none' || !text?.trim()) return { ok: true };
  const r = await tcCall({
    service: 'tms', host: 'tms.tencentcloudapi.com', action: 'TextModeration', version: '2020-12-29',
    region: process.env.TMS_REGION || 'ap-guangzhou',
    payload: { Content: Buffer.from(text.slice(0, 10000)).toString('base64'), ...(process.env.TMS_BIZ_TYPE ? { BizType: process.env.TMS_BIZ_TYPE } : {}) },
  });
  const kw = [...new Set([...(r.Keywords || []), ...(r.DetailResults || []).flatMap(d => d.Keywords || [])])];
  return { ok: r.Suggestion !== 'Block', label: r.Label, subLabel: r.SubLabel || '', suggestion: r.Suggestion, keywords: kw };
}

/** 收集对象里的所有文字（书页、播客稿等结构化内容） */
export function collectText(obj, out = []) {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach(x => collectText(x, out));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach(x => collectText(x, out));
  return out;
}

// 只有这些标签才拦下来人工复核；其余（广告、涉政等，读书内容里多为误判）照常发布，只留审核提示供事后抽查
const holdLabels = () => (process.env.MODERATION_HOLD_LABELS || 'Porn,Terror,Illegal').split(',').map(s => s.trim()).filter(Boolean);

/**
 * 长文本分段审核（单次接口有长度限制）。
 * 命中拦截标签：ok=false；只命中其他标签：ok=true 且带 flag。都附上命中片段，便于人工复核。
 */
export async function checkLongText(text, size = 3000) {
  let flag = null;
  for (let i = 0; i < text.length; i += size) {
    const seg = text.slice(i, i + size);
    const r = await checkText(seg);
    if (r.ok) continue;
    const at = r.keywords?.length ? seg.indexOf(r.keywords[0]) : -1;
    const hit = { label: r.label, subLabel: r.subLabel, keywords: r.keywords, snippet: at >= 0 ? seg.slice(Math.max(0, at - 80), at + 120) : seg.slice(0, 200) };
    if (holdLabels().includes(r.label)) return { ok: false, ...hit };
    flag ||= hit;
  }
  return { ok: true, flag };
}
