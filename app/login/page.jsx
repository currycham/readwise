import { loginMethods } from '../../lib/auth.mjs';
import LoginForm from './LoginForm';

export const metadata = { title: '登录 / 注册' };

export default async function LoginPage({ searchParams }) {
  const next = (await searchParams).next || '/';
  const methods = loginMethods();
  const how = methods.includes('email') && methods.includes('phone') ? '用邮箱或手机号登录' : methods.includes('phone') ? '用手机号登录' : '用邮箱登录';
  return (
    <div className="wrap narrow page">
      <div className="stack">
        <h1>登录 / 注册</h1>
        <p className="muted">{how}，第一次登录会自动注册，不用设密码。登录后可以生成新的书籍回顾、向作者提问。</p>
      </div>
      <LoginForm next={next.startsWith('/') && !next.startsWith('//') ? next : '/'} methods={methods} />
    </div>
  );
}
