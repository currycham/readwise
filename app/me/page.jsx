import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isMember, publicUser } from '../../lib/auth.mjs';
import { quotaSummary } from '../../lib/credits.mjs';
import { getDb } from '../../lib/db.mjs';
import { myRank, userLevel } from '../../lib/rewards.mjs';
import { fmtBJ } from '../../lib/time.mjs';
import { getUser } from '../lib/session';
import { LogoutButton, NicknameForm } from './MeForms';

export const metadata = { title: '我的账户' };
export const dynamic = 'force-dynamic';

const STATUS = { queued: '排队中', running: '生成中', done: '已完成', failed: '失败', insufficient: '资料不足', ambiguous: '书名有歧义' };
const REASON = { reward_complete: '读完一本', reward_generate: '生成新书', reward_contrib: '你生成的书被人读完', signup: '注册赠送', generate: '生成书籍', ask: '提问', refund: '退回', admin: '管理员调整', purchase: '充值' };

export default async function Me({ searchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect('/login?next=/me');
  const q = quotaSummary(user);
  const db = getDb();
  const jobs = db.prepare(`SELECT j.*, b.slug, b.title AS book_title FROM jobs j LEFT JOIN books b ON b.id = j.book_id
    WHERE j.user_id = ? AND j.type = 'generate' ORDER BY j.id DESC LIMIT 30`).all(user.id);
  const firsts = db.prepare("SELECT slug, title FROM books WHERE first_user_id = ? AND status = 'ready' ORDER BY id DESC").all(user.id);
  const txs = db.prepare('SELECT * FROM credit_tx WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(user.id);
  const pu = publicUser(user);
  const lv = userLevel(user.id);
  const rank = myRank(user.id, 'week');
  const done = db.prepare(`SELECT b.slug, b.title, c.score, c.total, c.credits FROM completions c JOIN books b ON b.id = c.book_id
    WHERE c.user_id = ? ORDER BY c.at DESC LIMIT 30`).all(user.id);

  return (
    <div className="wrap page">
      {sp.welcome && (
        <div className="card stack" style={{ borderColor: 'var(--accent)' }}>
          <h3>欢迎来到 Readwise</h3>
          <p>先给自己起个昵称吧。你生成的书籍回顾会显示“首位生成者：你的昵称”。</p>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>我的账户</h1>
        <LogoutButton />
      </div>
      <div className="stats">
        <div className="stat"><div className="v">{q.planName}</div><div className="k">{q.unlimited ? '生成、提问、播客不限次数' : isMember(user) ? `会员到期 ${fmtBJ(user.member_until).slice(0, 10)}` : '当前套餐'}</div></div>
        <div className="stat"><div className="v">{q.credits}</div><div className="k">积分</div></div>
        <div className="stat"><div className="v">{q.unlimited ? `已用 ${q.generations.used}` : `${q.generations.left} / ${q.generations.limit}`}</div><div className="k">{q.unlimited ? '本月生成次数' : '本月剩余生成次数'}</div></div>
        <div className="stat"><div className="v">{q.unlimited ? `已用 ${q.asks.used}` : `${q.asks.left} / ${q.asks.limit}`}</div><div className="k">{q.unlimited ? '今天提问次数' : '今天剩余提问次数'}</div></div>
      </div>
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span><b style={{ fontSize: 20 }}>{lv.name}</b>　<span className="muted small">第 {lv.index} 级 · 累计获得 {lv.earned} 积分</span></span>
          <Link href="/rank" className="small">{rank.rank ? `本周排行第 ${rank.rank} 名` : '查看排行榜'} →</Link>
        </div>
        {lv.next ? (
          <>
            <div className="lvbar" role="progressbar" aria-valuenow={lv.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${lv.pct}%` }} /></div>
            <div className="muted small">再获得 {lv.next.need} 积分升为「{lv.next.name}」。读完一本书、生成新书都能得积分。</div>
          </>
        ) : <div className="muted small">已是最高等级。</div>}
      </div>
      <div className="card stack" style={{ maxWidth: 520 }}>
        <div className="muted small">登录账号 {pu.account}</div>
        <NicknameForm nickname={user.nickname} next={sp.next} />
      </div>

      <section className="stack">
        <h2 style={{ fontSize: 22 }}>我读完的书</h2>
        {done.length ? <div className="tabs">{done.map(b => <Link key={b.slug} href={`/b/${encodeURIComponent(b.slug)}`}>《{b.title}》{b.score}/{b.total}{b.credits ? ` +${b.credits}` : ''}</Link>)}</div>
          : <p className="muted">还没有。读完一本书并完成检测闯关，就会出现在这里。</p>}
      </section>

      <section className="stack">
        <h2 style={{ fontSize: 22 }}>我首次生成的书</h2>
        {firsts.length ? <div className="tabs">{firsts.map(b => <Link key={b.slug} href={`/b/${encodeURIComponent(b.slug)}`}>《{b.title}》</Link>)}</div>
          : <p className="muted">还没有。<Link href="/">去生成第一本</Link></p>}
      </section>

      <section className="stack">
        <h2 style={{ fontSize: 22 }}>生成记录</h2>
        {jobs.length ? (
          <div className="tbl"><table><thead><tr><th>书名</th><th>状态</th><th>付费方式</th><th>提交时间</th></tr></thead><tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td>{j.slug ? <Link href={`/b/${encodeURIComponent(j.slug)}`}>《{j.book_title}》</Link> : `《${JSON.parse(j.input).title}》`}</td>
                <td>{['queued', 'running'].includes(j.status) ? <Link href={`/jobs/${j.id}`}>{STATUS[j.status]}</Link> : STATUS[j.status]}</td>
                <td>{{ free: '免费额度', member: '会员额度', unlimited: '内测无限量', credits: `${j.charged_credits} 积分`, admin: '管理员' }[j.charge] || ''}</td>
                <td className="num">{fmtBJ(j.created_at)}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <p className="muted">还没有生成记录。</p>}
      </section>

      {txs.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: 22 }}>积分明细</h2>
          <div className="tbl"><table><thead><tr><th>时间</th><th>变动</th><th>余额</th><th>原因</th></tr></thead><tbody>
            {txs.map(t => <tr key={t.id}><td className="num">{fmtBJ(t.at)}</td><td className="num">{t.delta > 0 ? '+' : ''}{t.delta}</td><td className="num">{t.balance_after}</td><td>{REASON[t.reason] || t.reason}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </div>
  );
}
