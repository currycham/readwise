import { isMember } from '../../../lib/auth.mjs';
import { getDb } from '../../../lib/db.mjs';
import { fmtBJ } from '../../../lib/time.mjs';

export default async function AdminUsers({ searchParams }) {
  const sp = await searchParams;
  const q = sp.q || '';
  const only = sp.unlimited === '1';
  const rows = getDb().prepare(`SELECT u.*, (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.type = 'generate') gens,
      (SELECT COUNT(*) FROM usage x WHERE x.user_id = u.id AND x.task = 'ask') asks,
      (SELECT COALESCE(SUM(cost),0) FROM usage x WHERE x.user_id = u.id) cost
    FROM users u WHERE (u.phone LIKE ? OR u.email LIKE ? OR u.nickname LIKE ?) AND (? = '' OR u.unlimited = 1) ORDER BY u.id DESC LIMIT 200`).all(`%${q}%`, `%${q}%`, `%${q}%`, only ? '1' : '');
  return (
    <div className="stack">
      <form className="row"><input className="input" name="q" defaultValue={q} placeholder="邮箱、手机号或昵称" style={{ maxWidth: 280 }} /><button className="btn">搜索</button>
        <label className="small"><input type="checkbox" name="unlimited" value="1" defaultChecked={only} /> 只看内测白名单</label></form>
      <div className="tbl"><table>
        <thead><tr><th>用户</th><th>角色</th><th>积分</th><th>会员到期</th><th>生成</th><th>提问</th><th>累计成本</th><th>注册</th><th>调整积分</th><th>会员</th><th>内测白名单</th><th>状态</th></tr></thead>
        <tbody>{rows.map(u => (
          <tr key={u.id}>
            <td>{u.nickname}<br /><span className="muted small num">{u.email || u.phone}</span></td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="user_role" /><input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="role" value={u.role === 'admin' ? 'user' : 'admin'} />
                <button className="btn sm">{u.role === 'admin' ? '管理员 ✕' : '设为管理员'}</button>
              </form>
            </td>
            <td className="num">{u.credits}</td>
            <td className="num">{isMember(u) ? fmtBJ(u.member_until).slice(0, 10) : ''}</td>
            <td className="num">{u.gens}</td>
            <td className="num">{u.asks}</td>
            <td className="num">¥{u.cost.toFixed(2)}</td>
            <td className="num">{fmtBJ(u.created_at).slice(0, 10)}</td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="user_credits" /><input type="hidden" name="id" value={u.id} />
                <input className="input num" name="delta" placeholder="+100" size={5} aria-label="积分变动" /><button className="btn sm">确定</button>
              </form>
            </td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="user_member" /><input type="hidden" name="id" value={u.id} />
                <input className="input num" name="days" placeholder="30" size={3} aria-label="增加会员天数" /><button className="btn sm">天</button>
              </form>
            </td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="user_unlimited" /><input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="unlimited" value={u.unlimited ? '0' : '1'} />
                <button className={`btn sm ${u.unlimited ? 'primary' : ''}`} title="白名单用户生成、提问、播客都不受额度限制，也不扣积分">{u.unlimited ? '无限量 ✕' : '设为无限量'}</button>
              </form>
            </td>
            <td>
              <form method="post" action="/api/admin" className="inline-form">
                <input type="hidden" name="action" value="user_ban" /><input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="banned" value={u.banned ? '0' : '1'} />
                <button className={`btn sm ${u.banned ? '' : 'danger'}`}>{u.banned ? '恢复' : '停用'}</button>
              </form>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
