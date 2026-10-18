import { requestCode } from '../../../../lib/auth.mjs';
import { clientIp, fail, json, sameOrigin } from '../../../lib/http';

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const { account, phone } = await req.json();
    const r = await requestCode(account ?? phone, clientIp(req));
    return json({ ok: true, type: r.type, minutes: r.minutes, dev: r.dev, devCode: r.devCode });
  } catch (e) { return fail(e); }
}
