'use client';
import { useState } from 'react';

export function NicknameForm({ nickname, next }) {
  const [v, setV] = useState(nickname);
  const [msg, setMsg] = useState('');
  async function save(e) {
    e.preventDefault();
    const r = await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: v }) });
    const j = await r.json();
    setMsg(r.ok ? '已保存' : j.error);
    if (r.ok && next) location.href = next;
  }
  return (
    <form className="field" onSubmit={save}>
      <label htmlFor="nickname">昵称（显示为“首位生成者”）</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input id="nickname" className="input" value={v} onChange={e => setV(e.target.value)} maxLength={16} />
        <button className="btn primary" type="submit">{next ? '保存并继续' : '保存'}</button>
      </div>
      {msg && <small className="muted">{msg}</small>}
    </form>
  );
}

export function LogoutButton() {
  return <button className="btn sm" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/'; }}>退出登录</button>;
}
