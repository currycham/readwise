import Link from 'next/link';
import { getDb } from '../../../lib/db.mjs';
import { fmtBJ } from '../../../lib/time.mjs';

export default function AdminReports() {
  const rows = getDb().prepare(`SELECT r.*, u.nickname, b.title, b.slug FROM reports r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN books b ON b.id = r.book_id
    ORDER BY r.status = 'open' DESC, r.id DESC LIMIT 200`).all();
  return (
    <div className="tbl"><table>
      <thead><tr><th>时间</th><th>书</th><th>用户</th><th>内容</th><th>状态</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id}>
          <td className="num">{fmtBJ(r.at)}</td>
          <td>{r.slug ? <Link href={`/b/${encodeURIComponent(r.slug)}`} target="_blank">《{r.title}》</Link> : ''}</td>
          <td>{r.nickname}</td>
          <td className="w">{r.content}</td>
          <td>{r.status === 'open' ? (
            <form method="post" action="/api/admin" className="inline-form"><input type="hidden" name="action" value="report_resolve" /><input type="hidden" name="id" value={r.id} /><button className="btn sm">标记已处理</button></form>
          ) : '已处理'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
