import Link from 'next/link';
import { userLevel } from '../../lib/rewards.mjs';
import { getUser } from '../lib/session';

export default async function Header() {
  const user = await getUser();
  return (
    <header className="site-head">
      <div className="wrap">
        <Link href="/" className="brand"><b>ReadWise</b><span>让读过的书成为你的一部分</span></Link>
        <nav aria-label="主导航">
          <Link href="/library">书库</Link>
          <Link href="/graph"><span className="hide-sm">书籍</span>网络</Link>
          <Link href="/rank">排行榜</Link>
          <Link href="/pricing" className="hide-sm">价格</Link>
        </nav>
        <div className="who">
          {user ? (
            <>
              {user.role === 'admin' && <Link href="/admin" className="pill">后台</Link>}
              <UserPill user={user} />
            </>
          ) : (
            <Link href="/login" className="btn sm primary nw">登录 / 注册</Link>
          )}
        </div>
      </div>
    </header>
  );
}

// 等级按“累计获得”的积分算（读完、生成新书等奖励，不含赠送和退款），和可用余额分开写，避免误解
function UserPill({ user }) {
  const lv = userLevel(user.id);
  const tip = `等级按累计获得的积分计算（读完一本书、生成新书等），不含赠送；可用积分用于生成书。${lv.next ? `再获得 ${lv.next.need} 积分升为「${lv.next.name}」。` : '已是最高等级。'}`;
  return (
    <Link href="/me" className="pill user-pill" title={tip}>
      <span className="hide-sm">{user.nickname}</span>
      <span className="lv">{lv.name}<span className="hide-sm"> · 已获得 <span className="num">{lv.earned}</span></span></span>
      <span className="bal">可用 <span className="num">{user.credits}</span><span className="hide-sm"> 积分</span></span>
    </Link>
  );
}
