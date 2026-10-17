// 本地预览服务：浏览书页、问作者（流式）、生成播客稿。正式网站会替换成 Next.js + 数据库，这里只为验证内容效果。
//   npm run dev  → http://localhost:5173
import { createServer } from 'node:http';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askAuthor } from '../engine/ask.mjs';
import { podcastScript } from '../engine/podcast.mjs';
import { renderPage } from '../renderer/render.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRS = ['fixtures', join('out', 'books')];
const PORT = Number(process.env.PORT || 5173);

// 极简限流：每个 IP 每小时最多 30 次提问、3 次播客生成
const hits = new Map();
function allow(ip, kind, limit) {
  const k = `${ip}:${kind}`, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < 3600e3);
  if (arr.length >= limit) return false;
  arr.push(now); hits.set(k, arr); return true;
}

/** id 是相对项目根目录、去掉 .json 的路径，只允许指向 fixtures/ 或 out/books/ 下的文件。 */
function fileOf(id) {
  const p = resolve(ROOT, `${id}.json`);
  const ok = DIRS.some(d => p.startsWith(resolve(ROOT, d) + sep));
  if (!ok) throw Object.assign(new Error('非法路径'), { status: 400 });
  return p;
}
async function loadPage(id) {
  try { return JSON.parse(await readFile(fileOf(id), 'utf8')); }
  catch (e) { throw Object.assign(new Error(e.status ? e.message : '找不到这本书'), { status: e.status || 404 }); }
}

async function listBooks() {
  const out = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.json') && !/\.(run|podcast)[^/]*\.json$/.test(e.name)) {
        try {
          const j = JSON.parse(await readFile(p, 'utf8'));
          if (j.book?.title && j.chunks) out.push({ id: relative(ROOT, p).replace(/\.json$/, ''), title: j.book.title, author: j.book.author, model: j.meta?.model || '样例', mtime: (await stat(p)).mtimeMs });
        } catch {}
      }
    }
  }
  for (const d of DIRS) await walk(join(ROOT, d));
  return out.sort((a, b) => b.mtime - a.mtime);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function readBody(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 200_000) throw Object.assign(new Error('请求太大'), { status: 413 }); }
  return JSON.parse(s || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ip = req.socket.remoteAddress || '';
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const books = await listBooks();
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>书库（本地预览）</title>
<style>body{font:16px/1.7 -apple-system,"PingFang SC",sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#15242A;background:#EDF1F0}a{color:#0D6866}li{margin:6px 0}small{color:#55696D}</style>
<h1>书库 · 本地预览</h1><ul>${books.map(b => `<li><a href="/book?id=${encodeURIComponent(b.id)}">《${esc(b.title)}》</a> ${esc(b.author || '')} <small>${esc(b.model)} · ${esc(b.id)}</small></li>`).join('') || '<li>还没有书页。先运行 npm run generate -- "书名"</li>'}</ul>`, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/book') {
      const id = url.searchParams.get('id') || '';
      const page = await loadPage(id);
      const podcastFile = fileOf(id).replace(/\.json$/, '.podcast.json');
      try { page.podcast = { script: JSON.parse(await readFile(podcastFile, 'utf8')).script }; } catch {}
      return send(res, 200, await renderPage(page, { slug: id, apiBase: '' }), 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/api/ask') {
      if (!allow(ip, 'ask', 30)) return send(res, 429, { error: '提问太频繁，请一小时后再试' });
      const { slug, messages } = await readBody(req);
      const page = await loadPage(slug);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
      try {
        await askAuthor(page, messages, { onDelta: t => res.write(t) });
      } catch (e) {
        res.write(`\n\n（出错了：${e.message}）`);
      }
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/podcast') {
      const { slug } = await readBody(req);
      const page = await loadPage(slug);
      const cache = fileOf(slug).replace(/\.json$/, '.podcast.json');
      try { const c = JSON.parse(await readFile(cache, 'utf8')); return send(res, 200, c); } catch {}
      if (!allow(ip, 'podcast', 3)) return send(res, 429, { error: '播客生成太频繁，请稍后再试' });
      const r = await podcastScript(page, { minutes: 30 });
      await writeFile(cache, JSON.stringify(r, null, 2));
      return send(res, 200, r);
    }
    send(res, 404, { error: '没有这个地址' });
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, () => console.log(`本地预览：http://localhost:${PORT}`));
