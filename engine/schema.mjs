// 书页 JSON 的结构说明（写进提示词）和本地校验。前端模板只认这个结构。
import { isValidCategory, normalizeCategory } from '../config/categories.mjs';

export const SCHEMA_VERSION = 1;

export const PAGE_SHAPE = `{
  "schema_version": 1,
  "book": {
    "title": "书名（不带书名号）",
    "author": "作者中文名",
    "author_en": "作者原名，没有就空字符串",
    "original_title": "原书名，没有就空字符串",
    "categories": [{"top": "大问题，必须来自分类表", "sub": "子问题，必须来自分类表"}]  // 只放 1 项
  },
  "recommend": {
    "one_line": "这本书帮你解决什么问题，一句话，≤40字",
    "reasons": ["值得读的理由1，≤25字", "理由2", "理由3"],
    "for_whom": "适合谁，≤40字",
    "not_for": "不适合谁，≤40字",
    "gains": "读完能获得什么，≤40字"
  },
  "motto": {"text": "一句凸显并升华全书主题和价值的话", "source": "quote 或 distilled（quote 仅在确信是原书原话时使用）"},
  "why_reread": "用这本书自己的核心概念，解释借《如何阅读一本书》和《学习之道》重读它的意义，120–200字",
  "inspect": {
    "book_type": "书的类型与读法，60–100字",
    "problem": "作者要解决的问题，40–80字",
    "unity": "一句话全书主旨，≤60字",
    "map": {
      "top": "全书的根本命题，≤25字",
      "left":  {"title": "一条路径/一种状态的名字", "nodes": [{"text": "≤22字", "chunk": 2}]},
      "right": {"title": "对照的另一条路径/状态", "nodes": [{"text": "≤22字", "chunk": 4}]},
      "bridge": "从左到右靠什么，≤40字"
    }
  },
  "chunks": [
    {
      "title": "知识块标题",
      "one": "一句话核心",
      "core": ["核心论述段落 4–5 段，每段 60–120 字"],
      "terms": [{"term": "术语", "def": "定义"}],
      "arg": ["论证链节点（可为空数组）"],
      "example": "具体生活例子",
      "myth": "容易误解之处，以及作者的真实意思",
      "recall": [{"q": "主动回忆题", "a": "参考答案"}, {"q": "", "a": ""}]
    }
  ],
  "cloze": ["论证链填空句，用 [词] 标出空格"],
  "quiz": [{"q": "短题干", "options": ["A", "B", "C", "D"], "answer": 1, "why": "解释，≤50字", "chunk": 3}],
  "internalize": {
    "claim": "全书核心主张，用于让读者表态，≤40字",
    "apply_template": "“用在一件事上”的填写模板，多行，用 \\n 分隔，体现本书的方法"
  },
  "author_persona": {
    "name": "作者名",
    "voice": "作者的说话风格与思维方式，60–120字",
    "starter_questions": ["读者向作者提的问题1（第一人称“我”是读者，问的对象是作者，如：我总是……，您会怎么建议？）", "问题2", "问题3"]
  },
  "confidence": {"level": "high / medium / low", "notes": "哪些内容依据充分，哪些属于概括或推断"},
  "sources": [{"title": "来源标题", "url": "来源链接"}]
}`;

const isStr = v => typeof v === 'string' && v.trim().length > 0;
const len = s => [...(s || '')].length;

/** 返回错误列表；空数组表示通过。 */
export function validatePage(p) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  if (!p || typeof p !== 'object') return ['不是对象'];

  need(p.book && isStr(p.book.title) && isStr(p.book.author), 'book.title / book.author 缺失');
  // 先就地规整分类：去掉附带的说明、旧分类名换成新的，能修好就不必让模型重写
  if (Array.isArray(p.book?.categories)) p.book.categories = p.book.categories.map(c => normalizeCategory(c) || c);
  const cats = p.book?.categories;
  need(Array.isArray(cats) && cats.length >= 1 && cats.length <= 3, 'book.categories 需要 1–3 个');
  (cats || []).forEach((c, i) => need(isValidCategory(c.top, c.sub), `book.categories[${i}] 不在分类表中：${c.top}/${c.sub}`));

  const r = p.recommend || {};
  need(isStr(r.one_line) && len(r.one_line) <= 50, 'recommend.one_line 缺失或过长');
  need(Array.isArray(r.reasons) && r.reasons.length === 3 && r.reasons.every(isStr), 'recommend.reasons 需要正好 3 条');
  (r.reasons || []).forEach((x, i) => need(len(x) <= 32, `recommend.reasons[${i}] 过长（≤25字）`));
  need(isStr(r.for_whom) && isStr(r.not_for) && isStr(r.gains), 'recommend.for_whom / not_for / gains 缺失');

  need(p.motto && isStr(p.motto.text) && ['quote', 'distilled'].includes(p.motto.source), 'motto 缺失或 source 不合法');
  need(isStr(p.why_reread), 'why_reread 缺失');

  const ins = p.inspect || {};
  need(isStr(ins.book_type) && isStr(ins.problem) && isStr(ins.unity), 'inspect.book_type / problem / unity 缺失');
  const map = ins.map || {};
  need(isStr(map.top) && isStr(map.bridge), 'inspect.map.top / bridge 缺失');
  for (const side of ['left', 'right']) {
    const s = map[side];
    need(s && isStr(s.title) && Array.isArray(s.nodes) && s.nodes.length >= 3 && s.nodes.length <= 6, `inspect.map.${side} 需要标题和 3–6 个节点`);
  }

  const ch = p.chunks;
  need(Array.isArray(ch) && ch.length >= 8 && ch.length <= 10, `chunks 需要 8–10 个（现在 ${ch?.length ?? 0}）`);
  (ch || []).forEach((c, i) => {
    const at = `chunks[${i}]`;
    need(isStr(c.title) && isStr(c.one), `${at}.title / one 缺失`);
    need(Array.isArray(c.core) && c.core.length >= 4 && c.core.length <= 6 && c.core.every(isStr), `${at}.core 需要 4–6 段`);
    if (Array.isArray(c.core) && c.core.length) {
      const avg = c.core.reduce((n, x) => n + len(x), 0) / c.core.length;
      need(avg >= 40, `${at}.core 段落过短（平均 ${Math.round(avg)} 字，需要每段 60–120 字的完整论述）`);
    }
    need(!/^(误解|容易误解)[:：]/.test(c.myth || '') && !/^例子[:：]/.test(c.example || ''), `${at}.example / myth 不要以“例子：”“误解：”开头`);
    need(Array.isArray(c.terms) && c.terms.length >= 1 && c.terms.every(t => isStr(t.term) && isStr(t.def)), `${at}.terms 至少 1 个`);
    need(Array.isArray(c.arg), `${at}.arg 需要是数组（可以为空）`);
    need(isStr(c.example) && isStr(c.myth), `${at}.example / myth 缺失`);
    need(Array.isArray(c.recall) && c.recall.length === 2 && c.recall.every(x => isStr(x.q) && isStr(x.a)), `${at}.recall 需要正好 2 题`);
  });
  const nChunks = ch?.length || 0;
  if (Array.isArray(ch) && ch.length) {
    const total = ch.reduce((n, c) => n + len([c.one, ...(c.core || []), ...(c.terms || []).map(t => (t.term || '') + (t.def || '')), c.example, c.myth, ...(c.recall || []).map(r => (r.q || '') + (r.a || ''))].join('')), 0);
    need(total >= 4300, `知识块内容偏少（合计 ${total} 字，需要约 4800–6500 字）`);
  }
  for (const side of ['left', 'right']) {
    (map[side]?.nodes || []).forEach((n, i) => need(Number.isInteger(n.chunk) && n.chunk >= 1 && n.chunk <= nChunks, `inspect.map.${side}.nodes[${i}].chunk 超出范围`));
  }

  need(Array.isArray(p.cloze) && p.cloze.length >= 8 && p.cloze.length <= 12, 'cloze 需要 8–12 句');
  (p.cloze || []).forEach((s, i) => need(/\[[^\]]+\]/.test(s), `cloze[${i}] 没有 [空格]`));

  need(Array.isArray(p.quiz) && p.quiz.length === 12, `quiz 需要正好 12 题（现在 ${p.quiz?.length ?? 0}）`);
  (p.quiz || []).forEach((q, i) => {
    need(isStr(q.q) && Array.isArray(q.options) && q.options.length === 4 && q.options.every(isStr), `quiz[${i}] 题干或 4 个选项缺失`);
    need(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3, `quiz[${i}].answer 需要 0–3`);
    need(Number.isInteger(q.chunk) && q.chunk >= 1 && q.chunk <= nChunks, `quiz[${i}].chunk 超出范围`);
    need(isStr(q.why), `quiz[${i}].why 缺失`);
  });
  if (Array.isArray(p.quiz) && p.quiz.length) {
    const counts = [0, 0, 0, 0];
    p.quiz.forEach(q => counts[q.answer] != null && counts[q.answer]++);
    need(Math.max(...counts) <= 4 && Math.min(...counts) >= 2, `quiz 正确答案分布不均：${counts.join('/')}（每个位置 2–4 次）`);
    const seq = p.quiz.map(q => q.answer).join('');
    need(!/^(0123)+$|^(3210)+$|^(\d)\1*$/.test(seq) && !/^(\d{2,4})\1{2,}/.test(seq), `quiz 正确答案位置有规律（${seq}），需要随机打乱`);
  }

  need(p.internalize && isStr(p.internalize.claim) && isStr(p.internalize.apply_template), 'internalize 缺失');
  const ap = p.author_persona || {};
  need(isStr(ap.name) && isStr(ap.voice) && Array.isArray(ap.starter_questions) && ap.starter_questions.length === 3, 'author_persona 缺失或引导问题不是 3 个');
  need(p.confidence && ['high', 'medium', 'low'].includes(p.confidence.level), 'confidence.level 需要 high / medium / low');
  need(Array.isArray(p.sources), 'sources 需要是数组');
  return e;
}
