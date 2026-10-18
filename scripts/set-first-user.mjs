// 把书籍的首位生成者改成某个账号：npm run set-first-user -- 昵称或邮箱 [--only 书名]
// 不带 --only 时改所有书。账号要先注册好。
import { getDb } from '../lib/db.mjs';
import { parseArgs } from './args.mjs';

const { pos, opt } = parseArgs();
if (!pos[0]) { console.error('用法：npm run set-first-user -- 昵称或邮箱 [--only 书名]'); process.exit(1); }
const db = getDb();
const users = db.prepare('SELECT id, nickname, email FROM users WHERE nickname = ? OR email = ?').all(pos[0], pos[0].toLowerCase());
if (users.length !== 1) { console.error(users.length ? `有 ${users.length} 个账号叫「${pos[0]}」，请改用邮箱指定` : `没有找到账号「${pos[0]}」，请先注册`); process.exit(1); }
const r = opt.only
  ? db.prepare('UPDATE books SET first_user_id = ? WHERE title = ?').run(users[0].id, opt.only)
  : db.prepare('UPDATE books SET first_user_id = ?').run(users[0].id);
console.log(`已把 ${r.changes} 本书的首位生成者改为「${users[0].nickname}」（用户 ${users[0].id}）`);
