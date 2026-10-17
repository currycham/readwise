// 腾讯云 API 3.0 调用（TC3-HMAC-SHA256 签名），供短信和内容审核使用，不依赖官方 SDK。
import { createHash, createHmac } from 'node:crypto';

const sha256 = s => createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();

export async function tcCall({ service, host, action, version, region, payload }) {
  const id = process.env.TENCENTCLOUD_SECRET_ID, key = process.env.TENCENTCLOUD_SECRET_KEY;
  if (!id || !key) throw new Error('缺少 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const ct = 'application/json; charset=utf-8';
  const canonical = `POST\n/\n\ncontent-type:${ct}\nhost:${host}\n\ncontent-type;host\n${sha256(body)}`;
  const scope = `${date}/${service}/tc3_request`;
  const toSign = `TC3-HMAC-SHA256\n${ts}\n${scope}\n${sha256(canonical)}`;
  const signing = hmac(hmac(hmac('TC3' + key, date), service), 'tc3_request');
  const signature = createHmac('sha256', signing).update(toSign).digest('hex');
  const res = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'content-type': ct,
      host,
      authorization: `TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
      'x-tc-action': action,
      'x-tc-timestamp': String(ts),
      'x-tc-version': version,
      ...(region ? { 'x-tc-region': region } : {}),
    },
    body,
  });
  const j = await res.json();
  if (j.Response?.Error) throw new Error(`腾讯云 ${action} 失败：${j.Response.Error.Code} ${j.Response.Error.Message}`);
  return j.Response;
}
