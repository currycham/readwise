// 任务队列（存在 SQLite 里）：网站进程入队，后台任务进程领取执行。
import { LIMITS } from '../config/plans.mjs';
import { findBookByTitle, updateBook } from './books.mjs';
import { addCredits, assertBudget, isUnlimited, planGeneration, QuotaError } from './credits.mjs';
import { getDb, now, tx } from './db.mjs';
import { startOfTodayBJ } from './time.mjs';

const parse = j => j && { ...j, input: JSON.parse(j.input || '{}'), result: j.result ? JSON.parse(j.result) : null };

export function getJob(id) {
  return parse(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id));
}

export function queuePosition(job) {
  if (job.status !== 'queued') return 0;
  return getDb().prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'queued' AND id < ?").get(job.id).n + 1;
}

/**
 * 生成新书页。已有同名书时直接返回 { book }；否则扣额度并入队，返回 { job }。
 * @param {object} user
 * @param {{title:string, author?:string, file?:string, fileName?:string}} input
 */
export function enqueueGenerate(user, input, { admin = false } = {}) {
  const title = String(input.title || '').replace(/[《》]/g, '').trim();
  if (!title || [...title].length > 60) throw new QuotaError('请输入书名（60 字以内）', 400, 'input');
  if (!input.file) {
    const exist = findBookByTitle(title);
    if (exist && exist.status === 'ready') return { book: exist };
  }
  const db = getDb();
  const active = db.prepare("SELECT COUNT(*) n FROM jobs WHERE user_id = ? AND type = 'generate' AND status IN ('queued','running')").get(user.id).n;
  if (!admin && active >= LIMITS.activeJobsPerUser) throw new QuotaError(`你已有 ${active} 本书在生成中，请等完成后再提交`, 429, 'busy');
  assertBudget();
  return tx(() => {
    const plan = admin ? { charge: 'admin', credits: 0 } : planGeneration(user);
    const id = db.prepare('INSERT INTO jobs (type, user_id, input, charge, charged_credits, progress) VALUES (?, ?, ?, ?, ?, ?)')
      .run('generate', user.id, JSON.stringify({ ...input, title }), plan.charge, plan.credits, '排队中').lastInsertRowid;
    if (plan.credits) addCredits(user.id, -plan.credits, 'generate', `job:${id}`);
    return { job: getJob(id) };
  });
}

/** 播客：首次有人点播放时入队。已在生成或已完成时直接返回当前状态。 */
export function enqueuePodcast(user, book) {
  if (['queued', 'running', 'ready'].includes(book.podcast_status)) return { status: book.podcast_status };
  const db = getDb();
  const today = db.prepare("SELECT COUNT(*) n FROM jobs WHERE user_id = ? AND type = 'podcast' AND created_at >= ?").get(user.id, startOfTodayBJ()).n;
  if (user.role !== 'admin' && !isUnlimited(user) && today >= LIMITS.podcastPerUserPerDay) throw new QuotaError('今天触发生成的播客已达上限，请明天再试', 429, 'busy');
  assertBudget();
  return tx(() => {
    db.prepare('INSERT INTO jobs (type, user_id, book_id, charge, progress) VALUES (?, ?, ?, ?, ?)').run('podcast', user.id, book.id, 'free', '排队中');
    updateBook(book.id, { podcast_status: 'queued' });
    return { status: 'queued' };
  });
}

/** 后台进程领取一个任务 */
export function claimJob() {
  return parse(getDb().prepare(`UPDATE jobs SET status = 'running', started_at = ?
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1) RETURNING *`).get(now()));
}

/** 进程重启时，把上次没跑完的任务放回队列 */
export function requeueStale() {
  return getDb().prepare("UPDATE jobs SET status = 'queued', progress = '重新排队' WHERE status = 'running'").run().changes;
}

export function setProgress(id, text) {
  getDb().prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(text, id);
}

/** 结束任务；失败或资料不足时退还积分（待复核 review 先不退，复核驳回时再退） */
export function finishJob(id, { status, result = null, error = null, bookId = null }) {
  const db = getDb();
  tx(() => {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    const cost = db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage WHERE job_id = ?').get(id).c;
    db.prepare('UPDATE jobs SET status = ?, result = ?, error = ?, book_id = COALESCE(?, book_id), cost = ?, finished_at = ? WHERE id = ?')
      .run(status, result ? JSON.stringify(result) : null, error, bookId, cost, now(), id);
    if (status !== 'done' && status !== 'review' && job.charged_credits > 0) {
      addCredits(job.user_id, job.charged_credits, 'refund', `job:${id}`);
      db.prepare('UPDATE jobs SET charged_credits = 0 WHERE id = ?').run(id);
    }
  });
}

/** 复核通过：书页公开，任务记为完成 */
export function approveJob(id) {
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ? AND status = 'review'").get(id);
  if (!job) throw new Error('任务不在待复核状态');
  const b = db.prepare('SELECT id, slug FROM books WHERE id = ?').get(job.book_id);
  if (!b) throw new Error('书页不存在');
  db.prepare("UPDATE books SET status = 'ready' WHERE id = ?").run(b.id);
  const result = { ...JSON.parse(job.result || '{}'), slug: b.slug, approved: true };
  db.prepare("UPDATE jobs SET status = 'done', result = ? WHERE id = ?").run(JSON.stringify(result), id);
  return { job, bookId: b.id };
}

/** 复核驳回：删除隐藏的书页，任务记为失败并退回积分 */
export function rejectJob(id) {
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ? AND status = 'review'").get(id);
  if (!job) throw new Error('任务不在待复核状态');
  tx(() => {
    if (job.book_id) {
      db.prepare('UPDATE jobs SET book_id = NULL WHERE book_id = ?').run(job.book_id);
      db.prepare("DELETE FROM books WHERE id = ? AND status = 'hidden'").run(job.book_id);
    }
  });
  finishJob(id, { status: 'failed', result: JSON.parse(job.result || 'null'), error: '生成内容未通过内容安全审核，已退回积分' });
}

export function retryJob(id) {
  getDb().prepare("UPDATE jobs SET status = 'queued', error = NULL, progress = '重新排队' WHERE id = ? AND status IN ('failed')").run(id);
}

/** 把模型调用记到 usage 表（engine 的记账回调） */
export function recordUsage(e) {
  getDb().prepare(`INSERT INTO usage (at, user_id, book_id, job_id, task, model, input_tokens, output_tokens, cached_tokens, chars, ms, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(e.at || now(), e.userId ?? null, e.bookId ?? null, e.jobId ?? null, e.task, e.model || e.alias || null,
    e.inputTokens ?? null, e.outputTokens ?? null, e.cachedTokens ?? null, e.chars ?? null, e.ms ?? null, e.cost || 0);
}
