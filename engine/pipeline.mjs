// 生成一本书的精读学习页：检索 → 打分 → 生成 → 结构校验 → 质检 → 修正 → 保存。
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataPath } from './paths.mjs';
import { EVIDENCE_THRESHOLD, ROLES } from '../config/models.mjs';
import { chatJSON } from './llm.mjs';
import * as P from './prompts.mjs';
import { SCHEMA_VERSION, validatePage } from './schema.mjs';
import { evidenceText, searchBook, slugify } from './search.mjs';
import { extractNotes, readBookFile } from './upload.mjs';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.author]
 * @param {string} [o.file]          上传的原文路径（txt/pdf/epub）
 * @param {string} [o.model]         生成用模型 alias，默认 ROLES.generate
 * @param {string} [o.checkModel]    质检用模型 alias，默认 ROLES.check
 * @param {boolean} [o.skipCheck]
 * @param {(msg:string)=>void} [o.log]
 */
export async function buildBookPage(o) {
  const log = o.log || (() => {});
  const genModel = o.model || ROLES.generate;
  const steps = [];
  const step = (name, r) => { steps.push({ name, model: r.model, cost: r.cost, ms: r.ms, usage: r.usage }); return r; };
  const t0 = Date.now();

  // 1. 资料
  let assessment, notes, source;
  if (o.file) {
    source = 'upload';
    log('读取原文…');
    const text = await readBookFile(o.file);
    log(`原文 ${text.length} 字，分块抽取笔记…`);
    const ex = await extractNotes(text, o.title, { onProgress: (d, n) => log(`抽取 ${d}/${n}`) });
    steps.push({ name: 'extract', model: ROLES.extract, cost: ex.cost, parts: ex.parts });
    notes = ex.notes;
    assessment = { identified: { title: o.title, author: o.author || '' }, key_points: [], unverified: [], can_generate: true, total: null, reason: '用户上传原文' };
  } else {
    source = 'search';
    log('联网检索…');
    const search = await searchBook(o.title, o.author);
    steps.push({ name: 'search', cost: search.cost, results: search.results.length });
    notes = evidenceText(search);
    log(`检索到 ${search.results.length} 条资料，评估充分度…`);
    // 打分用固定模型（ROLES.assess），保证不同生成模型面对同一个准入标准；
    // 它判断的是“主力模型是否了解这本书”，并用检索资料交叉验证
    const a = step('assess', await chatJSON({
      alias: ROLES.assess, task: 'assess', book: o.title, maxTokens: 12000,
      messages: [{ role: 'system', content: P.ASSESS_SYSTEM }, { role: 'user', content: P.assessUser({ title: o.title, author: o.author, evidence: notes }) }],
    }));
    assessment = a.data;
    const s = assessment.scores || {};
    const identity = s.identity || 0, corr = s.corroborated || 0, fam = s.familiarity || 0;
    assessment.total = identity + corr + fam;
    // 规则：身份确认 + 至少一个核心概念被资料印证 + 资料与模型认知合计足够 + 总分达标
    assessment.can_generate = !assessment.ambiguous && identity >= 2 && corr >= 1 && corr + fam >= 4 && assessment.total >= EVIDENCE_THRESHOLD;
    if (!assessment.can_generate) {
      const status = assessment.ambiguous ? 'ambiguous' : 'insufficient';
      log(status === 'ambiguous' ? '书名对应多本书，需要用户确认。' : `资料不足（${total}/9），需要用户上传原文。`);
      return finish({ status, assessment, steps, source });
    }
  }

  // 2. 生成
  log(`用 ${genModel} 生成书页…`);
  const title = assessment.identified?.title || o.title;
  const author = assessment.identified?.author || o.author || '';
  const genMessages = [{ role: 'system', content: P.GENERATE_SYSTEM }, { role: 'user', content: P.generateUser({ title, author, assessment, notes }) }];
  let usedModel = genModel, gen;
  try {
    gen = step('generate', await chatJSON({ alias: genModel, task: 'generate', book: title, temperature: 0.6, messages: genMessages }));
  } catch (e) {
    // hy4 偶尔写超长被截断，或输出不是合法 JSON：换备用模型重写一次，而不是让整个任务失败
    const fb = ROLES.generateFallback;
    if (!fb || fb === genModel) throw e;
    log(`${genModel} 生成失败（${e.message.slice(0, 60)}），改用 ${fb} 重新生成…`);
    usedModel = fb;
    gen = step('generate-fallback', await chatJSON({ alias: fb, task: 'generate', book: title, temperature: 0.6, messages: genMessages }));
  }
  let page = shuffleQuiz(gen.data);

  // 3. 结构校验，不通过就让同一模型修一次
  let errors = validatePage(page);
  if (errors.length) {
    log(`结构校验发现 ${errors.length} 处问题，修正…`);
    const fix = step('fix-structure', await chatJSON({
      alias: usedModel, task: 'fix-structure', book: title,
      messages: [
        { role: 'system', content: P.GENERATE_SYSTEM },
        { role: 'user', content: `下面的书页 JSON 有结构问题，请修正后输出完整 JSON：\n${errors.join('\n')}\n\n${JSON.stringify(page)}` },
      ],
    }));
    page = shuffleQuiz(fix.data);
    errors = validatePage(page);
  }

  // 4. 质检与修正
  let check = null;
  if (!o.skipCheck) {
    const checkModel = o.checkModel || ROLES.check;
    log(`用 ${checkModel} 质检…`);
    const c = step('check', await chatJSON({
      alias: checkModel, task: 'check', book: title, maxTokens: 16000,
      messages: [{ role: 'system', content: P.CHECK_SYSTEM }, { role: 'user', content: P.checkUser({ page, notes }) }],
    }));
    check = c.data;
    const serious = (check.issues || []).filter(i => i.severity === 'high' || i.severity === 'medium');
    if (serious.length) {
      log(`质检发现 ${serious.length} 处需要修正，修正中…`);
      try {
        const r = step('repair', await chatJSON({
          alias: usedModel, task: 'repair', book: title,
          messages: [{ role: 'system', content: P.REPAIR_SYSTEM }, { role: 'user', content: P.repairUser({ page, issues: serious }) }],
        }));
        const repaired = shuffleQuiz(r.data);
        const repErrors = validatePage(repaired);
        if (repErrors.length <= errors.length) { page = repaired; errors = repErrors; }
      } catch (e) {
        // 修正失败时保留质检前的书页（结构已通过校验），不让整个任务失败
        log(`修正失败（${e.message.slice(0, 60)}），保留修正前的版本`);
      }
    }
  }

  page.schema_version = SCHEMA_VERSION;
  const db = assessment.douban;
  if (db && typeof db.rating === 'number' && db.rating > 0 && db.rating <= 10) {
    page.book.douban = { rating: db.rating, count: Number.isInteger(db.count) ? db.count : null, via: 'search', at: new Date().toISOString().slice(0, 10) };
  }
  page.meta = {
    generated_at: new Date().toISOString(),
    model: usedModel,
    source,
    evidence_score: assessment.total,
    check_score: check?.score ?? null,
    structure_errors: errors,
  };
  return finish({ status: errors.length ? 'invalid' : 'ok', page, assessment, check, steps, source });

  async function finish(result) {
    const model = result.page?.meta?.model || genModel; // 换过备用模型时记实际用的那个
    const out = { ...result, title: o.title, model, ms: Date.now() - t0, cost: steps.reduce((s, x) => s + (x.cost || 0), 0) };
    const dir = dataPath('books', slugify(o.title));
    await mkdir(dir, { recursive: true });
    if (result.page) await writeFile(join(dir, `${model}.json`), JSON.stringify(result.page, null, 2));
    await writeFile(join(dir, `${model}.run.json`), JSON.stringify({ ...out, page: undefined }, null, 2));
    log(`完成：${out.status}，用时 ${(out.ms / 1000).toFixed(0)} 秒，成本 ¥${out.cost.toFixed(3)}`);
    return out;
  }
}

/**
 * 模型给出的正确答案位置常有规律（如 0123 循环）。这里把每题的选项重新排列：
 * 12 题的正确答案在 A–D 各出现 3 次、顺序随机，并避免连续 3 题答案相同。
 */
export function shuffleQuiz(page) {
  if (!Array.isArray(page?.quiz)) return page;
  const n = page.quiz.length;
  let targets;
  for (let tries = 0; tries < 50; tries++) {
    targets = Array.from({ length: n }, (_, i) => i % 4);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; }
    if (!targets.some((t, i) => i >= 2 && t === targets[i - 1] && t === targets[i - 2])) break;
  }
  page.quiz.forEach((q, i) => {
    if (!Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.answer) || !q.options[q.answer]) return;
    const correct = q.options[q.answer];
    const others = q.options.filter((_, j) => j !== q.answer);
    for (let k = others.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [others[k], others[j]] = [others[j], others[k]]; }
    others.splice(targets[i], 0, correct);
    q.options = others;
    q.answer = targets[i];
  });
  return page;
}
