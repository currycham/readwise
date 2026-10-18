// 后台任务进程：从队列领取任务，执行书页生成和播客生成。
//   npm run worker      （生产环境用 pm2 / systemd 常驻）
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { setUsageSink, withContext } from '../engine/context.mjs';
import { dataPath } from '../engine/paths.mjs';
import { buildBookPage } from '../engine/pipeline.mjs';
import { podcastScript, synthesizePodcast } from '../engine/podcast.mjs';
import { validatePage } from '../engine/schema.mjs';
import { insertBook, updateBook } from '../lib/books.mjs';
import { getDb } from '../lib/db.mjs';
import { rewardGenerate } from '../lib/rewards.mjs';
import { claimJob, finishJob, recordUsage, requeueStale, setProgress } from '../lib/jobs.mjs';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
const POLL_MS = 2000;
let stopping = false;

setUsageSink(recordUsage);

async function runGenerate(job) {
  const { title, author = '', file } = job.input;
  try {
    const r = await buildBookPage({ title, author, file, log: m => setProgress(job.id, m) });
    if (r.status === 'insufficient') {
      return finishJob(job.id, { status: 'insufficient', result: { reason: r.assessment?.reason, total: r.assessment?.total } });
    }
    if (r.status === 'ambiguous') {
      return finishJob(job.id, { status: 'ambiguous', result: { candidates: r.assessment?.candidates || [], reason: r.assessment?.reason } });
    }
    const errors = validatePage(r.page);
    if (errors.length) throw new Error(`生成内容未通过结构校验：${errors.slice(0, 3).join('；')}`);
    if (job.input.regenerate) {
      // 管理员重新生成：覆盖原书页内容，保留首位生成者、浏览数和播客
      const id = job.input.regenerate;
      const d = r.page.book.douban;
      updateBook(id, { page_json: JSON.stringify(r.page), model: r.model, check_score: r.check?.score ?? null, one_line: r.page.recommend?.one_line || '',
        categories: JSON.stringify(r.page.book.categories || []), ...(d ? { douban_rating: d.rating, douban_count: d.count, douban_via: 'search' } : {}) });
      const b = getDb().prepare('SELECT slug FROM books WHERE id = ?').get(id);
      return finishJob(job.id, { status: 'done', bookId: id, result: { slug: b.slug, regenerated: true } });
    }
    const { book, existed } = insertBook(r.page, { userId: job.user_id, model: r.model, source: r.source, checkScore: r.check?.score, requestedTitle: title });
    const reward = existed ? 0 : rewardGenerate(job, book.id);
    finishJob(job.id, { status: 'done', bookId: book.id, result: { slug: book.slug, existed, reward } });
  } finally {
    if (file) await rm(file, { force: true }); // 上传的原文处理完即删除
  }
}

async function runPodcast(job) {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(job.book_id);
  if (!book) throw new Error('书不存在');
  // 重新配音时旧播客照常可听，合成成功后直接替换
  if (!job.input?.revoice) updateBook(book.id, { podcast_status: 'running' });
  try {
    const page = JSON.parse(book.page_json);
    let s;
    if (job.input?.revoice && book.podcast_script) {
      // 只换音色：沿用已有对谈稿，重新配音
      s = { script: JSON.parse(book.podcast_script) };
    } else {
      setProgress(job.id, '编写对谈稿…');
      s = await podcastScript(page);
      updateBook(book.id, { podcast_script: JSON.stringify(s.script) });
    }
    const file = dataPath('media', 'podcast', `${book.id}.mp3`);
    const a = await synthesizePodcast(s.script, file, { book: book.title, onProgress: (d, n) => setProgress(job.id, `配音 ${d}/${n}`) });
    updateBook(book.id, { podcast_status: 'ready', podcast_file: file, podcast_ms: a.durationMs });
    finishJob(job.id, { status: 'done', bookId: book.id, result: { ms: a.durationMs } });
  } catch (e) {
    // 重新配音失败时旧音频还在（新文件只在全部合成成功后才写入），恢复原来的播客
    const keep = job.input?.revoice && book.podcast_file && existsSync(book.podcast_file);
    updateBook(book.id, { podcast_status: keep ? 'ready' : 'failed' });
    throw e;
  }
}

async function run(job) {
  const t0 = Date.now();
  console.log(`▶ 任务 ${job.id} ${job.type} ${job.input?.title || `book:${job.book_id}`}`);
  try {
    await withContext({ userId: job.user_id, jobId: job.id, bookId: job.book_id }, () =>
      job.type === 'generate' ? runGenerate(job) : job.type === 'podcast' ? runPodcast(job) : Promise.reject(new Error(`未知任务类型 ${job.type}`)));
    console.log(`✓ 任务 ${job.id} 完成，用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
  } catch (e) {
    console.error(`✗ 任务 ${job.id} 失败：${e.message}`);
    finishJob(job.id, { status: 'failed', error: e.message.slice(0, 1000) });
  }
}

async function loop(slot) {
  while (!stopping) {
    const job = claimJob();
    if (!job) { await new Promise(r => setTimeout(r, POLL_MS)); continue; }
    await run(job);
  }
  console.log(`工位 ${slot} 已停止`);
}

const n = requeueStale();
if (n) console.log(`把 ${n} 个未完成的任务放回队列`);
console.log(`后台任务进程启动，并发 ${CONCURRENCY}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; console.log('收到退出信号，等当前任务完成…'); });
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => loop(i + 1)));
process.exit(0);
