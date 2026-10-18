'use client';
import { useState } from 'react';

export default function LoginForm({ next, methods = ['email'] }) {
  const email = methods.includes('email'), phone = methods.includes('phone');
  const label = email && phone ? '邮箱或手机号' : phone ? '手机号' : '邮箱';
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(null); // 新用户登录成功后进入起昵称这一步
  const a = account.trim();
  const ready = (email && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(a)) || (phone && /^1\d{10}$/.test(a));

  async function send() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: account.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSent(Date.now());
      setMsg(j.devCode ? `本地开发模式，验证码：${j.devCode}` : j.dev ? '开发模式：验证码已打印在服务端日志里。'
        : j.type === 'email' ? `验证码已发到你的邮箱，${j.minutes} 分钟内有效。没收到的话看看垃圾邮件。` : `验证码已发送，${j.minutes} 分钟内有效。`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: account.trim(), code }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.isNew) { setNick(j.user?.nickname || ''); setBusy(false); return; }
      location.href = next;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function saveNick(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      location.href = next;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (nick !== null) return (
    <form className="card stack" onSubmit={saveNick} style={{ maxWidth: 440 }}>
      <h3>注册成功，给自己起个昵称</h3>
      <p className="muted small">昵称会显示在排行榜上；你第一个生成的书籍回顾，页面上会写“首位生成者：你的昵称”。以后可以在“我的”页面修改。</p>
      <div className="field">
        <label htmlFor="nick">昵称（2–16 个字）</label>
        <input id="nick" className="input" value={nick} onChange={e => setNick(e.target.value)} maxLength={16} autoFocus />
      </div>
      {err && <p className="err">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy || [...nick.trim()].length < 2}>保存并开始</button>
      <a className="muted small" href={next}>先跳过，用默认昵称</a>
    </form>
  );

  return (
    <form className="card stack" onSubmit={verify} style={{ maxWidth: 440 }}>
      <div className="field">
        <label htmlFor="account">{label}</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id="account" className="input" type={phone ? 'text' : 'email'} inputMode={email ? 'email' : 'numeric'} value={account}
            onChange={e => setAccount(email ? e.target.value : e.target.value.replace(/\D/g, ''))} maxLength={email ? 254 : 11}
            placeholder={email && phone ? '邮箱地址或 11 位手机号' : phone ? '11 位手机号' : 'name@example.com'} autoComplete={email ? 'email' : 'tel'} />
          <button type="button" className="btn" onClick={send} disabled={busy || !ready || Date.now() - sent < 60e3} style={{ whiteSpace: 'nowrap' }}>{sent ? '重新获取' : '获取验证码'}</button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="code">验证码</label>
        <input id="code" className="input" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 位验证码" autoComplete="one-time-code" />
      </div>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy || !ready || code.length !== 6}>登录</button>
      <p className="muted small">登录即表示你同意<a href="/terms" target="_blank">用户协议</a>和<a href="/privacy" target="_blank">隐私政策</a>。你的{label}只用来登录，不会公开显示。</p>
    </form>
  );
}
