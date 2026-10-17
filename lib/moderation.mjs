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
  return { ok: r.Suggestion !== 'Block', label: r.Label, suggestion: r.Suggestion };
}
