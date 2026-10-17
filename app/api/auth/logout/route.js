import { cookies } from 'next/headers';
import { SESSION_COOKIE, logout } from '../../../../lib/auth.mjs';
import { json, sameOrigin } from '../../../lib/http';

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
  const c = await cookies();
  logout(c.get(SESSION_COOKIE)?.value);
  c.delete(SESSION_COOKIE);
  return json({ ok: true });
}
