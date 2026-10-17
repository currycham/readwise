'use client';
import { useState } from 'react';

export default function NewForm({ initialTitle, quota }) {
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState('');
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const free = quota.generations.left > 0;

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      let r;
      if (file) {
        const fd = new FormData();
        fd.set('title', title); fd.set('author', author); fd.set('file', file);
        r = await fetch('/api/books', { method: 'POST', body: fd });
      } else {
        r = await fetch('/api/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, author }) });
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      location.href = j.slug ? `/b/${encodeURIComponent(j.slug)}` : `/jobs/${j.jobId}`;
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="title">书名</label>
        <input id="title" className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：原子习惯" required maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="author">作者（可选）</label>
        <input id="author" className="input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="同名书较多时填写，例如：詹姆斯·克利尔" maxLength={40} />
      </div>
      <div className="field">
        <label htmlFor="file">原文文件（可选）</label>
        <input id="file" type="file" accept=".txt,.pdf,.epub" onChange={e => setFile(e.target.files?.[0] || null)} />
        <small className="muted">冷门书网上资料不足时需要上传 txt / pdf / epub。原文只用于这一次生成，处理完立即删除，不会公开。</small>
      </div>
      <div className="card" style={{ background: 'var(--bg)', padding: 14 }}>
        <p className="small">
          {free
            ? `本次使用${quota.planName}额度（本月还剩 ${quota.generations.left} 本）。`
            : `本月${quota.planName}额度已用完，本次将扣 ${quota.prices.extraGeneration} 积分（你有 ${quota.credits} 积分）。`}
          资料不足或生成失败时不扣额度、积分自动退回。
        </p>
      </div>
      {err && <p className="err">{err}</p>}
      <button className="btn primary" type="submit" disabled={busy || !title.trim() || (!free && quota.credits < quota.prices.extraGeneration)}>
        {busy ? '提交中…' : '开始生成'}
      </button>
      {!free && quota.credits < quota.prices.extraGeneration && <p className="muted small">积分不足。支付功能即将开通，内测期间可以联系管理员获取积分。</p>}
    </form>
  );
}
