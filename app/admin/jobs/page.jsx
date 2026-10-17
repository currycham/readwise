import { getDb } from '../../../lib/db.mjs';
import { fmtBJ } from '../../../lib/time.mjs';

const STATUS = { queued: '排队', running: '进行中', done: '完成', failed: '失败', insufficient: '资料不足', ambiguous: '歧义' };

export default async function AdminJobs({ searchParams }) {
  const st = (await searchParams).status || '';
  const rows = getDb().prepare(`SELECT j.*, u.nickname, b.title AS book_title FROM jobs j LEFT JOIN users u ON u.id = j.user_id LEFT JOIN books b ON b.id = j.book_id
    WHERE (? = '' OR j.status = ?) ORDER BY j.id DESC LIMIT 200`).all(st, st);
  return (
    <div className="stack">
      <div className="tabs">
        {[['', '全部'], ...Object.entries(STATUS)].map(([k, v]) => <a key={k} href={k ? `?status=${k}` : '?'} className={st === k ? 'on' : ''}>{v}</a>)}
      </div>
      <div className="tbl"><table>
        <thead><tr><th>#</th><th>类型</th><th>书</th><th>用户</th><th>状态</th><th>进度 / 错误</th><th>付费</th><th>成本</th><th>提交</th><th>用时</th><th></th></tr></thead>
        <tbody>{rows.map(j => {
          const input = JSON.parse(j.input || '{}');
          const sec = j.finished_at && j.started_at ? Math.round((Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000) : null;
          return (
            <tr key={j.id}>
              <td className="num">{j.id}</td>
              <td>{j.type === 'generate' ? (input.regenerate ? '重新生成' : '生成') : '播客'}{input.file ? '·原文' : ''}</td>
              <td>{j.book_title || input.title}</td>
              <td>{j.nickname}</td>
              <td>{STATUS[j.status]}</td>
              <td className="w small">{j.status === 'failed' ? <span className="err">{j.error}</span> : j.progress}</td>
              <td>{j.charge}{j.charged_credits ? ` ${j.charged_credits}` : ''}</td>
              <td className="num">¥{(j.cost || 0).toFixed(2)}</td>
              <td className="num">{fmtBJ(j.created_at)}</td>
              <td className="num">{sec != null ? `${Math.round(sec / 60)} 分` : ''}</td>
              <td>{j.status === 'failed' && (
                <form method="post" action="/api/admin" className="inline-form"><input type="hidden" name="action" value="job_retry" /><input type="hidden" name="id" value={j.id} /><button className="btn sm">重试</button></form>)}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}
