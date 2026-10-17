import Link from 'next/link';
import { getUser } from '../lib/session';

export default async function Header() {
  const user = await getUser();
  return (
    <header className="site-head">
      <div className="wrap">
        <Link href="/" className="brand"><b>Readwise</b><span>60 分钟吃透一本书</span></Link>
        <nav aria-label="主导航">
          <Link href="/library">书库</Link>
          <Link href="/pricing">价格</Link>
        </nav>
        <div className="who">
          {user ? (
            <>
              {user.role === 'admin' && <Link href="/admin" className="pill">后台</Link>}
              <Link href="/me" className="pill" title="我的账户"><span className="num">{user.credits}</span> 积分 · {user.nickname}</Link>
            </>
          ) : (
            <Link href="/login" className="btn sm primary">登录 / 注册</Link>
          )}
        </div>
      </div>
    </header>
  );
}
