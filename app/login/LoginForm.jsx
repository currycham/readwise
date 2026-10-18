'use client';
import { useState } from 'react';

export default function LoginForm({ next }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(null); // 新用户登录成功后进入起昵称这一步

  async function send() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSent(Date.now());
      setMsg(j.devCode ? `本地开发模式，验证码：${j.devCode}` : j.dev ? '开发模式：验证码已打印在服务端日志里。' : '验证码已发送，5 分钟内有效。');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code }) });
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
        <label htmlFor="phone">手机号</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id="phone" className="input" inputMode="numeric" maxLength={11} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="11 位手机号" autoComplete="tel" />
          <button type="button" className="btn" onClick={send} disabled={busy || phone.length !== 11 || Date.now() - sent < 60e3} style={{ whiteSpace: 'nowrap' }}>{sent ? '重新获取' : '获取验证码'}</button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="code">验证码</label>
        <input id="code" className="input" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 位验证码" autoComplete="one-time-code" />
      </div>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy || phone.length !== 11 || code.length !== 6}>登录</button>
      <p className="muted small">登录即表示你同意用户协议和隐私政策。我们只用手机号识别账号，不会公开显示。</p>
    </form>
  );
}
