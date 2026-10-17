import { getJob, queuePosition } from '../../../../lib/jobs.mjs';
import { json } from '../../../lib/http';
import { getUser } from '../../../lib/session';

export async function GET(_req, { params }) {
  const user = await getUser();
  const job = getJob(Number((await params).id));
  if (!job || !user || (job.user_id !== user.id && user.role !== 'admin')) return json({ error: '找不到这个任务' }, 404);
  return json({
    id: job.id, type: job.type, status: job.status, progress: job.progress, position: queuePosition(job),
    title: job.input?.title, result: job.result, error: job.status === 'failed' ? '生成失败，已退还积分。可以稍后重试，或联系管理员。' : null,
    created_at: job.created_at, started_at: job.started_at, finished_at: job.finished_at,
  });
}
