// 用户上传原文（txt / pdf / epub）→ 纯文本 → 分块抽取精读笔记。
// 原文只在内存中处理，不落盘、不进入公开书页；调用方处理完应删除上传文件。
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chatJSON } from './llm.mjs';
import { EXTRACT_SYSTEM } from './prompts.mjs';
import { ROLES } from '../config/models.mjs';

const run = promisify(execFile);

export async function readBookFile(path) {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'txt' || ext === 'md') return decodeText(await readFile(path));
  if (ext === 'pdf') {
    try {
      const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], { maxBuffer: 200 * 1024 * 1024 });
      return stdout;
    } catch (e) {
      throw new Error(`PDF 解析失败（需要安装 poppler 的 pdftotext）：${e.message}`);
    }
  }
  if (ext === 'epub') {
    const { stdout: list } = await run('unzip', ['-Z1', path], { maxBuffer: 20 * 1024 * 1024 });
    const files = list.split('\n').filter(f => /\.(x?html?)$/i.test(f)).sort();
    let text = '';
    for (const f of files) {
      const { stdout } = await run('unzip', ['-p', path, f], { maxBuffer: 50 * 1024 * 1024 });
      text += stdout.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') + '\n';
    }
    return text;
  }
  throw new Error(`不支持的文件类型：.${ext}（支持 txt / pdf / epub）`);
}

/** 中文 txt 常见 GBK 编码：先按 UTF-8 严格解码，失败再用 GB18030。 */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('gb18030').decode(buf); }
}

export function splitText(text, size = 12000) {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const parts = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) {
      const para = clean.lastIndexOf('\n\n', end);
      if (para > i + size * 0.6) end = para;
    }
    parts.push(clean.slice(i, end));
    i = end;
  }
  return parts;
}

/** 分块并行抽取，返回给生成环节用的“原文笔记”文本，以及花费。 */
export async function extractNotes(text, title, { concurrency = 4, onProgress } = {}) {
  const parts = splitText(text);
  if (parts.length === 0 || text.replace(/\s/g, '').length < 5000) {
    throw new Error('文件里可读的文字太少（可能是扫描版 PDF，需要先 OCR）');
  }
  const results = new Array(parts.length);
  let cost = 0, done = 0, next = 0;
  async function worker() {
    while (next < parts.length) {
      const i = next++;
      const r = await chatJSON({
        alias: ROLES.extract,
        task: 'extract',
        book: title,
        maxTokens: 8000,
        messages: [
          { role: 'system', content: EXTRACT_SYSTEM },
          { role: 'user', content: `书名：《${title}》，第 ${i + 1}/${parts.length} 段原文：\n\n${parts[i]}` },
        ],
      });
      results[i] = r.data;
      cost += r.cost;
      onProgress?.(++done, parts.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, worker));
  const notes = results.map((r, i) => {
    const terms = (r.terms || []).map(t => `${t.term}：${t.def}`).join('；');
    return `### 第 ${i + 1} 段（${r.section_hint || ''}）\n观点：${(r.points || []).join(' / ')}\n术语：${terms}\n例子：${(r.examples || []).join(' / ')}\n作用：${r.role || ''}`;
  }).join('\n\n');
  return { notes, cost, parts: parts.length, chars: text.length };
}
