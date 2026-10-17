// 播客音频：支持 Range 请求（拖动进度条）。正式上线建议改由 COS + CDN 分发。
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { dataPath } from '../../../../engine/paths.mjs';

export async function GET(req, { params }) {
  const name = (await params).file;
  if (!/^\d+\.mp3$/.test(name)) return new Response('Not found', { status: 404 });
  const file = dataPath('media', 'podcast', name);
  let size;
  try { size = statSync(file).size; } catch { return new Response('Not found', { status: 404 }); }
  const headers = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' };
  const range = req.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), {
      status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)), { headers: { ...headers, 'content-length': String(size) } });
}
