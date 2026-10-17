'use client';
import { useState } from 'react';

export default function LoginForm({ next }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSent(Date.now());
      setMsg(j.dev ? '开发模式：验证码已打印在服务端日志里。' : '验证码已发送，5 分钟内有效。');
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
      location.href = j.isNew ? `/me?welcome=1&next=${encodeURIComponent(next)}` : next;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

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
