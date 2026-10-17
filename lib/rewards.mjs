// 积分奖励与等级：闯关检测（服务端判分）、生成新书、首位生成的书被别人读完；排行榜。
import { LEVELS, REWARDS } from '../config/plans.mjs';
import { addCredits } from './credits.mjs';
import { getDb, tx } from './db.mjs';
import { startOfMonthBJ, startOfWeekBJ } from './time.mjs';

export const EARN_REASONS = ['reward_complete', 'reward_generate', 'reward_contrib'];
const EARN_SQL = `reason IN (${EARN_REASONS.map(r => `'${r}'`).join(',')})`;

/** 本月某项奖励已发多少 */
function earnedThisMonth(userId, reason, ref = null) {
  return getDb().prepare(`SELECT COALESCE(SUM(delta), 0) n FROM credit_tx WHERE user_id = ? AND reason = ? AND at >= ?${ref ? ' AND ref = ?' : ''}`)
    .get(userId, reason, startOfMonthBJ(), ...(ref ? [ref] : [])).n;
}

/** 在月度上限内发奖励，返回实际发放数 */
function grant(userId, amount, reason, cap, ref) {
  const n = Math.max(0, Math.min(amount, cap - earnedThisMonth(userId, reason)));
  if (n > 0) addCredits(userId, n, reason, ref);
  return n;
}

/** 累计获得的积分（等级和总榜用） */
export function earnedTotal(userId) {
  return getDb().prepare(`SELECT COALESCE(SUM(delta), 0) n FROM credit_tx WHERE user_id = ? AND ${EARN_SQL}`).get(userId).n;
}

export function levelOf(earned) {
  let i = 0;
  while (i + 1 < LEVELS.length && earned >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] || null;
  const pct = next ? Math.round((100 * (earned - LEVELS[i].min)) / (next.min - LEVELS[i].min)) : 100;
  return { index: i + 1, name: LEVELS[i].name, earned, pct, next: next && { name: next.name, need: next.min - earned } };
}

export const userLevel = userId => levelOf(earnedTotal(userId));

/** 登录用户打开书页时记一次（只记第一次） */
export function recordOpen(userId, bookId) {
  getDb().prepare('INSERT OR IGNORE INTO book_opens (user_id, book_id) VALUES (?, ?)').run(userId, bookId);
}

/** 计分闯关还要等多少秒才能开始（0 表示已可开始） */
export function lockSeconds(userId, bookId) {
  const o = getDb().prepare('SELECT at FROM book_opens WHERE user_id = ? AND book_id = ?').get(userId, bookId);
  const start = o ? Date.parse(o.at) : Date.now();
  return Math.max(0, Math.ceil((start + REWARDS.minMinutes * 60e3 - Date.now()) / 1000));
}

/** 书页上展示的闯关状态：第一次作答记录 + 结果 */
export function quizState(userId, book, quiz) {
  const db = getDb();
  const rows = db.prepare('SELECT q, choice, correct FROM quiz_answers WHERE user_id = ? AND book_id = ?').all(userId, book.id);
  const answered = {};
  for (const r of rows) answered[r.q] = reveal(quiz, r.q, r.choice);
  const done = db.prepare('SELECT score, total, passed, credits, note FROM completions WHERE user_id = ? AND book_id = ?').get(userId, book.id) || null;
  return { answered, completion: done, lock: done || rows.length ? 0 : lockSeconds(userId, book.id) };
}

function reveal(quiz, i, choice) {
  const q = quiz[i];
  return { choice, correct: choice === q.answer, answer: q.answer, why: q.why, chunk: q.chunk };
}

/**
 * 判一道题。游客和已完成首次闯关的用户只判分不记录（练习）；
 * 登录用户首次闯关的每题第一次作答入库，12 题答完时结算奖励。
 */
export function answerQuiz(user, book, i, choice) {
  const quiz = JSON.parse(book.page_json).quiz;
  if (!Number.isInteger(i) || i < 0 || i >= quiz.length || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    throw Object.assign(new Error('题号或选项不对'), { status: 400 });
  }
  const res = reveal(quiz, i, choice);
  if (!user) return { ...res, practice: true };
  return tx(() => {
    const db = getDb();
    if (db.prepare('SELECT 1 FROM completions WHERE user_id = ? AND book_id = ?').get(user.id, book.id)) return { ...res, practice: true };
    const prior = db.prepare('SELECT choice FROM quiz_answers WHERE user_id = ? AND book_id = ? AND q = ?').get(user.id, book.id, i);
    if (prior) return { ...reveal(quiz, i, prior.choice), repeat: true };
    const answeredCount = db.prepare('SELECT COUNT(*) n FROM quiz_answers WHERE user_id = ? AND book_id = ?').get(user.id, book.id).n;
    if (answeredCount === 0) {
      const wait = lockSeconds(user.id, book.id);
      if (wait > 0) return { locked: wait };
    }
    db.prepare('INSERT INTO quiz_answers (user_id, book_id, q, choice, correct) VALUES (?, ?, ?, ?, ?)').run(user.id, book.id, i, choice, res.correct ? 1 : 0);
    if (answeredCount + 1 < quiz.length) return res;
    return { ...res, completion: settle(user, book, quiz.length) };
  });
}

/** 首次闯关结算：及格发完成奖励，并给首位生成者发贡献奖励 */
function settle(user, book, total) {
  const db = getDb();
  const score = db.prepare('SELECT SUM(correct) n FROM quiz_answers WHERE user_id = ? AND book_id = ?').get(user.id, book.id).n;
  const passed = score >= REWARDS.passScore;
  let credits = 0, note = null;
  if (passed) {
    const want = REWARDS.complete + (score === total ? REWARDS.perfect : 0);
    credits = grant(user.id, want, 'reward_complete', REWARDS.completeMonthlyCap, `book:${book.id}`);
    if (credits < want) note = credits ? '本月完成奖励快到上限了，只发了一部分' : '本月完成奖励已达上限';
    contribute(user, book);
  } else {
    note = `首次闯关需要答对 ${REWARDS.passScore} 题才有积分`;
  }
  db.prepare('INSERT INTO completions (user_id, book_id, score, total, passed, credits, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, book.id, score, total, passed ? 1 : 0, credits, note);
  return { score, total, passed, credits, note };
}

function contribute(reader, book) {
  const owner = book.first_user_id;
  if (!owner || owner === reader.id) return;
  const db = getDb();
  const u = db.prepare('SELECT banned FROM users WHERE id = ?').get(owner);
  if (!u || u.banned) return;
  const ref = `book:${book.id}`;
  const onBook = db.prepare("SELECT COALESCE(SUM(delta), 0) n FROM credit_tx WHERE user_id = ? AND reason = 'reward_contrib' AND ref = ?").get(owner, ref).n;
  const amount = Math.min(REWARDS.contrib, REWARDS.contribBookCap - onBook);
  if (amount > 0) grant(owner, amount, 'reward_contrib', REWARDS.contribMonthlyCap, ref);
}

/** 成功生成新书的奖励（白名单和管理员生成不发，避免无限刷） */
export function rewardGenerate(job, bookId) {
  if (!job.user_id || !['free', 'member', 'credits'].includes(job.charge)) return 0;
  return tx(() => grant(job.user_id, REWARDS.generate, 'reward_generate', REWARDS.generateMonthlyCap, `book:${bookId}`));
}

/** 排行榜：按获得的积分。period = 'week' | 'all' */
export function leaderboard(period = 'week', limit = 50) {
  const since = period === 'week' ? startOfWeekBJ() : '';
  return getDb().prepare(`SELECT u.id, u.nickname, SUM(t.delta) earned,
      (SELECT COUNT(*) FROM completions c WHERE c.user_id = u.id AND c.passed = 1 ${since ? 'AND c.at >= @since' : ''}) books
    FROM credit_tx t JOIN users u ON u.id = t.user_id
    WHERE t.${EARN_SQL} AND u.banned = 0 ${since ? 'AND t.at >= @since' : ''}
    GROUP BY u.id HAVING earned > 0 ORDER BY earned DESC, MIN(t.at) LIMIT @limit`).all({ since, limit })
    .map((r, i) => ({ ...r, rank: i + 1, level: levelOf(earnedTotal(r.id)).name }));
}

/** 某用户在榜上的名次（不在榜上返回 null） */
export function myRank(userId, period = 'week') {
  const since = period === 'week' ? startOfWeekBJ() : '';
  const db = getDb();
  const mine = db.prepare(`SELECT COALESCE(SUM(delta), 0) n FROM credit_tx WHERE user_id = ? AND ${EARN_SQL} ${since ? 'AND at >= ?' : ''}`).get(userId, ...(since ? [since] : [])).n;
  if (!mine) return { earned: 0, rank: null };
  const ahead = db.prepare(`SELECT COUNT(*) n FROM (SELECT t.user_id, SUM(t.delta) e FROM credit_tx t JOIN users u ON u.id = t.user_id
    WHERE t.${EARN_SQL} AND u.banned = 0 ${since ? 'AND t.at >= ?' : ''} GROUP BY t.user_id HAVING e > ?)`).get(...(since ? [since] : []), mine).n;
  return { earned: mine, rank: ahead + 1 };
}
