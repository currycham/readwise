// 手机号 + 验证码登录；首次登录即注册。会话 token 只在库里存哈希。
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { SIGNUP_BONUS } from '../config/plans.mjs';
import { addCredits } from './credits.mjs';
import { getDb, now, tx } from './db.mjs';
import { sendCode } from './sms.mjs';

export const SESSION_COOKIE = 'rw_session';
export const SESSION_DAYS = 30;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const hash = s => createHash('sha256').update(s + SECRET).digest('hex');

export class AuthError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export const validPhone = p => /^1[3-9]\d{9}$/.test(p);

const ipHits = new Map();
function ipLimited(ip) {
  const t = Date.now(), arr = (ipHits.get(ip) || []).filter(x => t - x < 3600e3);
  if (arr.length >= 10) return true;
  arr.push(t); ipHits.set(ip, arr); return false;
}

export async function requestCode(phone, ip = '') {
  if (!validPhone(phone)) throw new AuthError('请输入正确的 11 位手机号');
  const db = getDb();
  const row = db.prepare('SELECT sent_at FROM sms_codes WHERE phone = ?').get(phone);
  if (row && Date.now() - Date.parse(row.sent_at) < 60e3) throw new AuthError('验证码已发送，请 1 分钟后再试', 429);
  if (ipLimited(ip)) throw new AuthError('请求太频繁，请稍后再试', 429);
  const code = String(randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(`INSERT INTO sms_codes (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`)
    .run(phone, hash(phone + code), new Date(Date.now() + 5 * 60e3).toISOString(), now());
  const r = await sendCode(phone, code);
  // 本地开发（短信 dev 模式且非生产环境）时把验证码返回给页面，省得翻日志
  return { dev: !!r.dev, ...(r.dev && process.env.NODE_ENV !== 'production' ? { devCode: code } : {}) };
}

/** 校验验证码，成功后返回 { token, user, isNew } */
export function verifyCode(phone, code) {
  if (!validPhone(phone) || !/^\d{6}$/.test(code || '')) throw new AuthError('手机号或验证码格式不对');
  const db = getDb();
  const row = db.prepare('SELECT * FROM sms_codes WHERE phone = ?').get(phone);
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new AuthError('验证码已过期，请重新获取');
  if (row.attempts >= 5) throw new AuthError('错误次数过多，请重新获取验证码', 429);
  if (row.code_hash !== hash(phone + code)) {
    db.prepare('UPDATE sms_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone);
    throw new AuthError('验证码不正确');
  }
  db.prepare('DELETE FROM sms_codes WHERE phone = ?').run(phone);

  const admins = (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
  return tx(() => {
    let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    let isNew = false;
    if (!user) {
      isNew = true;
      const id = db.prepare('INSERT INTO users (phone, nickname, role) VALUES (?, ?, ?)')
        .run(phone, `读者${phone.slice(-4)}`, admins.includes(phone) ? 'admin' : 'user').lastInsertRowid;
      if (SIGNUP_BONUS > 0) addCredits(id, SIGNUP_BONUS, 'signup');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (admins.includes(phone) && user.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    }
    if (user.banned) throw new AuthError('账号已被停用，如有疑问请联系管理员', 403);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hash(token), user.id, new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString());
    return { token, user: db.prepare('SELECT * FROM users WHERE id = ?').get(user.id), isNew };
  });
}

export function userFromToken(token) {
  if (!token) return null;
  const db = getDb();
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hash(token));
  if (!s || Date.parse(s.expires_at) < Date.now()) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  return u && !u.banned ? u : null;
}

export function logout(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
}

export const isMember = u => !!u?.member_until && Date.parse(u.member_until) > Date.now();

/** 返回给前端的用户信息（不含手机号全号） */
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nickname: u.nickname, phone: u.phone.slice(0, 3) + '****' + u.phone.slice(-4), role: u.role, credits: u.credits, unlimited: !!u.unlimited, memberUntil: isMember(u) ? u.member_until : null };
}
