// 提交生成：JSON {title, author} 或 multipart（附原文 txt/pdf/epub）
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dataPath } from '../../../engine/paths.mjs';
import { enqueueGenerate } from '../../../lib/jobs.mjs';
import { checkText } from '../../../lib/moderation.mjs';
import { fail, json, sameOrigin } from '../../lib/http';
import { getUser } from '../../lib/session';

const MAX_FILE = 30 * 1024 * 1024;

export async function POST(req) {
  try {
    if (!sameOrigin(req)) return json({ error: '非法请求' }, 403);
    const user = await getUser();
    if (!user) return json({ error: '请先登录', code: 'login' }, 401);
    let title, author = '', file;
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const fd = await req.formData();
      title = String(fd.get('title') || ''); author = String(fd.get('author') || '');
      const f = fd.get('file');
      if (f && typeof f === 'object' && f.size > 0) {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!['txt', 'pdf', 'epub'].includes(ext)) return json({ error: '只支持 txt / pdf / epub 文件' }, 400);
        if (f.size > MAX_FILE) return json({ error: '文件不能超过 30MB' }, 400);
        const dir = dataPath('uploads');
        await mkdir(dir, { recursive: true });
        file = `${dir}/${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
        await writeFile(file, Buffer.from(await f.arrayBuffer()));
      }
    } else {
      ({ title, author = '' } = await req.json());
    }
    if (!(await checkText(`${title} ${author}`)).ok) return json({ error: '书名包含不合适的内容' }, 400);
    const r = enqueueGenerate(user, { title, author: String(author).slice(0, 40), file });
    if (r.book) return json({ slug: r.book.slug, existed: true });
    return json({ jobId: r.job.id, charge: r.job.charge, credits: r.job.charged_credits });
  } catch (e) { return fail(e); }
}
