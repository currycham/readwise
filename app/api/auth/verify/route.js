import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_DAYS, publicUser, verifyCode } from '../../../../lib/auth.mjs';
import { clientIp, fail, json, sameOrigin } from '../../../lib/http';

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const { account, phone, code } = await req.json();
    const { token, user, isNew } = verifyCode(account ?? phone, String(code || '').trim(), clientIp(req));
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
      secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
    });
    return json({ ok: true, isNew, user: publicUser(user) });
  } catch (e) { return fail(e); }
}
