import LoginForm from './LoginForm';

export const metadata = { title: '登录 / 注册' };

export default async function LoginPage({ searchParams }) {
  const next = (await searchParams).next || '/';
  return (
    <div className="wrap narrow page">
      <div className="stack">
        <h1>登录 / 注册</h1>
        <p className="muted">用手机号登录，第一次登录会自动注册。登录后可以生成新的书籍回顾、向作者提问。</p>
      </div>
      <LoginForm next={next.startsWith('/') ? next : '/'} />
    </div>
  );
}
