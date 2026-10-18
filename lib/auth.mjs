// 邮箱或手机号 + 验证码登录；首次登录即注册。会话 token 只在库里存哈希。
// 开放哪些方式由 LOGIN_METHODS 决定（email / phone，逗号分隔，默认只开邮箱；手机号需要短信资质）。
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { SIGNUP_BONUS } from '../config/plans.mjs';
import { addCredits } from './credits.mjs';
import { getDb, now, tx } from './db.mjs';
import { sendLoginMail } from './mail.mjs';
import { sendCode } from './sms.mjs';

export const SESSION_COOKIE = 'rw_session';
export const SESSION_DAYS = 30;
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const hash = s => createHash('sha256').update(s + SECRET).digest('hex');

export class AuthError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export const validPhone = p => /^1[3-9]\d{9}$/.test(p);
export const validEmail = e => /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i.test(e) && e.length <= 254;

export const loginMethods = () => (process.env.LOGIN_METHODS || 'email').split(',').map(s => s.trim()).filter(m => m === 'email' || m === 'phone');

/** 把用户输入的账号解析成 { type: 'email' | 'phone', value } */
export function parseAccount(input) {
  const v = String(input || '').trim();
  const methods = loginMethods();
  if (v.includes('@')) {
    if (!methods.includes('email')) throw new AuthError('暂不支持邮箱登录');
    if (!validEmail(v)) throw new AuthError('邮箱地址格式不对');
    return { type: 'email', value: v.toLowerCase() };
  }
  if (!methods.includes('phone')) throw new AuthError(methods.includes('email') ? '请输入邮箱地址' : '暂不支持这种登录方式');
  if (!validPhone(v)) throw new AuthError('请输入正确的 11 位手机号');
  return { type: 'phone', value: v };
}

const CODE_MINUTES = { email: 10, phone: 5 };

const ipHits = new Map();
function ipLimited(ip) {
  const t = Date.now(), arr = (ipHits.get(ip) || []).filter(x => t - x < 3600e3);
  if (arr.length >= 10) return true;
  arr.push(t); ipHits.set(ip, arr); return false;
}

export async function requestCode(input, ip = '') {
  const acc = parseAccount(input);
  const db = getDb();
  const row = db.prepare('SELECT sent_at FROM login_codes WHERE target = ?').get(acc.value);
  if (row && Date.now() - Date.parse(row.sent_at) < 60e3) throw new AuthError('验证码已发送，请 1 分钟后再试', 429);
  if (ipLimited(ip)) throw new AuthError('请求太频繁，请稍后再试', 429);
  const code = String(randomInt(0, 1e6)).padStart(6, '0');
  const minutes = CODE_MINUTES[acc.type];
  db.prepare(`INSERT INTO login_codes (target, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(target) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`)
    .run(acc.value, hash(acc.value + code), new Date(Date.now() + minutes * 60e3).toISOString(), now());
  let r;
  try { r = acc.type === 'email' ? await sendLoginMail(acc.value, code, minutes) : await sendCode(acc.value, code); } catch (e) {
    // 没发出去就删掉记录，用户可以马上重试，不用等 1 分钟
    db.prepare('DELETE FROM login_codes WHERE target = ?').run(acc.value);
    if (e.status) throw new AuthError(e.message, e.status);
    console.error('[验证码] 发送失败：', e.message);
    throw new AuthError('验证码发送失败，请稍后再试', 502);
  }
  // 本地开发（dev 模式且非生产环境）时把验证码返回给页面，省得翻日志
  return { type: acc.type, minutes, dev: !!r.dev, ...(r.dev && process.env.NODE_ENV !== 'production' ? { devCode: code } : {}) };
}

const listEnv = k => (process.env[k] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/** 校验验证码，成功后返回 { token, user, isNew } */
export function verifyCode(input, code, ip = '') {
  const acc = parseAccount(input);
  if (!/^\d{6}$/.test(code || '')) throw new AuthError('验证码是 6 位数字');
  const db = getDb();
  const row = db.prepare('SELECT * FROM login_codes WHERE target = ?').get(acc.value);
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new AuthError('验证码已过期，请重新获取');
  if (row.attempts >= 5) throw new AuthError('错误次数过多，请重新获取验证码', 429);
  if (row.code_hash !== hash(acc.value + code)) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE target = ?').run(acc.value);
    throw new AuthError('验证码不正确');
  }
  db.prepare('DELETE FROM login_codes WHERE target = ?').run(acc.value);

  const isAdmin = [...listEnv('ADMIN_EMAILS'), ...listEnv('ADMIN_PHONES')].includes(acc.value);
  const col = acc.type; // 'email' | 'phone'，就是 users 表的列名
  return tx(() => {
    let user = db.prepare(`SELECT * FROM users WHERE ${col} = ?`).get(acc.value);
    let isNew = false;
    if (!user) {
      // 邮箱注册不需要实名，防止批量注册薅免费额度：同一 IP 每天最多注册几个账号
      const perIp = Number(process.env.SIGNUP_PER_IP_DAY || 3);
      if (ip && perIp > 0 && db.prepare('SELECT COUNT(*) n FROM users WHERE signup_ip = ? AND created_at >= ?').get(ip, new Date(Date.now() - 86400e3).toISOString()).n >= perIp)
        throw new AuthError('这个网络今天注册的账号太多了，请明天再试', 429);
      isNew = true;
      const id = db.prepare(`INSERT INTO users (${col}, nickname, role, signup_ip) VALUES (?, ?, ?, ?)`)
        .run(acc.value, '读者', isAdmin ? 'admin' : 'user', ip || null).lastInsertRowid;
      db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(col === 'phone' ? `读者${acc.value.slice(-4)}` : `读者${String(id).padStart(4, '0')}`, id);
      if (SIGNUP_BONUS > 0) addCredits(id, SIGNUP_BONUS, 'signup');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    } else if (isAdmin && user.role !== 'admin') {
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

/** 脱敏后的登录账号：138****8000 / a***@qq.com */
export const maskAccount = u => u.email ? u.email.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : u.phone ? u.phone.slice(0, 3) + '****' + u.phone.slice(-4) : '';

/** 返回给前端的用户信息（不含完整手机号或邮箱） */
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nickname: u.nickname, account: maskAccount(u), role: u.role, credits: u.credits, unlimited: !!u.unlimited, memberUntil: isMember(u) ? u.member_until : null };
}
