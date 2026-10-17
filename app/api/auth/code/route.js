import { requestCode } from '../../../../lib/auth.mjs';
import { clientIp, fail, json, sameOrigin } from '../../../lib/http';

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const { phone } = await req.json();
    const r = await requestCode(String(phone || '').trim(), clientIp(req));
    return json({ ok: true, dev: r.dev });
  } catch (e) { return fail(e); }
}
