// 额度与积分：先用套餐内免费额度，超出后扣积分；全站每日预算兜底。
import { LIMITS, PLANS, PRICES } from '../config/plans.mjs';
import { getDb } from './db.mjs';
import { startOfMonthBJ, startOfTodayBJ } from './time.mjs';

export class QuotaError extends Error { constructor(msg, status = 402, code = 'quota') { super(msg); this.status = status; this.code = code; } }

const memberOf = u => !!u?.member_until && Date.parse(u.member_until) > Date.now();
export const planOf = u => (memberOf(u) ? PLANS.member : PLANS.free);
/** 内测白名单用户：生成、提问不占额度也不扣积分 */
export const isUnlimited = u => !!u?.unlimited;

/** 调整积分并记流水（需在事务内或单独调用）。余额不足时抛错。 */
export function addCredits(userId, delta, reason, ref = null) {
  const db = getDb();
  const u = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!u) throw new Error('用户不存在');
  const balance = u.credits + delta;
  if (balance < 0) throw new QuotaError('积分不足');
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(balance, userId);
  db.prepare('INSERT INTO credit_tx (user_id, delta, balance_after, reason, ref) VALUES (?, ?, ?, ?, ?)').run(userId, delta, balance, reason, ref);
  return balance;
}

export function todayCost() {
  return getDb().prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE at >= ?').get(startOfTodayBJ()).c;
}

export function assertBudget() {
  if (todayCost() >= LIMITS.dailyBudgetYuan) {
    throw new QuotaError('今天的生成额度已经用完，请明天再来。已有的书籍回顾可以照常阅读。', 503, 'budget');
  }
}

/** 本月已用的生成次数（占用了免费额度的任务：排队、进行中、完成） */
export function generationsUsedThisMonth(userId, charges = ['free', 'member']) {
  return getDb().prepare(`SELECT COUNT(*) n FROM jobs WHERE user_id = ? AND type = 'generate' AND charge IN (${charges.map(() => '?').join(',')})
    AND status IN ('queued','running','done') AND created_at >= ?`).get(userId, ...charges, startOfMonthBJ()).n;
}

export function asksUsedToday(userId) {
  return getDb().prepare("SELECT COUNT(*) n FROM usage WHERE user_id = ? AND task = 'ask' AND at >= ?").get(userId, startOfTodayBJ()).n;
}

/** 用户当前的额度概况，用于页面展示 */
export function quotaSummary(u) {
  const plan = planOf(u);
  const unlimited = isUnlimited(u);
  // 白名单期间的生成不计入套餐额度，移出白名单后从正常额度重新算
  const gens = generationsUsedThisMonth(u.id, unlimited ? ['unlimited'] : undefined);
  const asks = asksUsedToday(u.id);
  return {
    plan: unlimited ? 'unlimited' : memberOf(u) ? 'member' : 'free',
    planName: unlimited ? '内测无限量' : plan.name,
    unlimited,
    credits: u.credits,
    generations: { used: gens, limit: plan.generationsPerMonth, left: Math.max(0, plan.generationsPerMonth - gens) },
    asks: { used: asks, limit: plan.asksPerDay, left: Math.max(0, plan.asksPerDay - asks) },
    prices: PRICES,
  };
}

/**
 * 决定一次生成怎么付费：返回 { charge, credits }。不扣费，扣费由 chargeGeneration 在事务里完成。
 */
export function planGeneration(u) {
  if (isUnlimited(u)) return { charge: 'unlimited', credits: 0 };
  const plan = planOf(u);
  if (generationsUsedThisMonth(u.id) < plan.generationsPerMonth) return { charge: memberOf(u) ? 'member' : 'free', credits: 0 };
  if (u.credits >= PRICES.extraGeneration) return { charge: 'credits', credits: PRICES.extraGeneration };
  throw new QuotaError(`本月${plan.name}额度已用完。继续生成每本需要 ${PRICES.extraGeneration} 积分，你现在有 ${u.credits} 积分。`);
}

/** 问作者：额度内免费，超出扣 1 积分。返回扣的积分数。 */
export function chargeAsk(u, ref) {
  if (isUnlimited(u)) return 0;
  const plan = planOf(u);
  if (asksUsedToday(u.id) < plan.asksPerDay) return 0;
  if (u.credits < PRICES.extraAsk) {
    throw new QuotaError(`今天的 ${plan.asksPerDay} 次免费提问已用完。继续提问每次 ${PRICES.extraAsk} 积分，你现在没有积分了。`);
  }
  addCredits(u.id, -PRICES.extraAsk, 'ask', ref);
  return PRICES.extraAsk;
}
