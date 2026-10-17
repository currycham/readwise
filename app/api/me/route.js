import { publicUser } from '../../../lib/auth.mjs';
import { quotaSummary } from '../../../lib/credits.mjs';
import { getDb } from '../../../lib/db.mjs';
import { checkText } from '../../../lib/moderation.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

export async function GET() {
  const u = await getUser();
  if (!u) return json({ user: null });
  return json({ user: publicUser(u), quota: quotaSummary(u) });
}

/** 修改昵称（会显示为“首位生成者”） */
export async function PATCH(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const u = await getUser();
    if (!u) return json({ error: '请先登录' }, 401);
    const nickname = String((await req.json()).nickname || '').trim();
    if ([...nickname].length < 2 || [...nickname].length > 16) return json({ error: '昵称需要 2–16 个字' }, 400);
    if (!(await checkText(nickname)).ok) return json({ error: '昵称包含不合适的内容，请换一个' }, 400);
    getDb().prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, u.id);
    return json({ ok: true, nickname });
  } catch (e) { return fail(e); }
}
