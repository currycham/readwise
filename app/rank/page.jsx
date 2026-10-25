import Link from 'next/link';
import { leaderboard, myRank, userLevel } from '../../lib/rewards.mjs';
import EarnRules from '../components/EarnRules';
import { getUser } from '../lib/session';
import { SHOW_PRICING } from '../lib/site';

export const metadata = { title: '排行榜' };
export const dynamic = 'force-dynamic';

export default async function Rank({ searchParams }) {
  const period = (await searchParams).p === 'all' ? 'all' : 'week';
  const user = await getUser();
  const rows = leaderboard(period, 50);
  const me = user ? myRank(user.id, period) : null;
  const lv = user ? userLevel(user.id) : null;
  return (
    <div className="wrap page narrow">
      <div className="stack">
        <h1>排行榜</h1>
        <p className="muted">按读书获得的积分排名：读完一本、生成新书、你生成的书被别人读完，都会加分。{SHOW_PRICING && '充值的积分不计入。'}点昵称可以看 TA 生成过的书。</p>
        <div className="tabs">
          <Link href="/rank" className={period === 'week' ? 'on' : ''}>本周</Link>
          <Link href="/rank?p=all" className={period === 'all' ? 'on' : ''}>总榜</Link>
        </div>
      </div>
      {user && (
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <span><b>{user.nickname}</b> · {lv.name}{lv.next ? <span className="muted small">　再得 {lv.next.need} 积分升为{lv.next.name}</span> : null}</span>
          <span className="num">{me.rank ? `第 ${me.rank} 名 · ${me.earned} 分` : `${period === 'week' ? '本周' : ''}还没有上榜`}</span>
        </div>
      )}
      {rows.length ? (
        <div className="tbl"><table>
          <thead><tr><th>名次</th><th>读者</th><th>等级</th><th>{period === 'week' ? '本周' : '累计'}读完</th><th>生成</th><th>积分</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id} className={user?.id === r.id ? 'me' : ''}>
              <td className="num">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
              <td><Link href={`/u/${r.id}`}>{r.nickname}</Link></td>
              <td>{r.level}</td>
              <td className="num">{r.books} 本</td>
              <td className="num">{r.generated} 本</td>
              <td className="num">{r.earned}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : (
        <div className="card muted">{period === 'week' ? '本周' : ''}还没有人上榜。去<Link href="/library">书库</Link>读完一本书、闯关及格，就能拿到第一个名次。</div>
      )}
      <section className="stack">
        <h2 style={{ fontSize: 22 }}>怎么获得积分</h2>
        <EarnRules />
      </section>
    </div>
  );
}
