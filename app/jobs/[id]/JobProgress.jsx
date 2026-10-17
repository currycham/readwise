'use client';
import { useEffect, useState } from 'react';

const STAGES = [
  ['检索', /检索/], ['判断资料是否可靠', /评估|充分度/], ['生成书页', /生成书页|抽取|读取原文/], ['质检与修正', /质检|修正|结构/],
];

export default function JobProgress({ id }) {
  const [j, setJ] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let timer;
    async function poll() {
      try {
        const r = await fetch(`/api/jobs/${id}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setJ(d);
        if (d.status === 'done' && d.result?.slug) { location.href = `/b/${encodeURIComponent(d.result.slug)}`; return; }
        if (d.status === 'queued' || d.status === 'running') timer = setTimeout(poll, 3000);
      } catch (e) { setErr(e.message); }
    }
    poll();
    return () => clearTimeout(timer);
  }, [id]);

  if (err) return <p className="err">{err}</p>;
  if (!j) return <p className="muted"><span className="spinner" /> 加载中…</p>;

  const stage = STAGES.findIndex(([, re]) => re.test(j.progress));
  return (
    <div className="stack">
      <div className="label">生成进度</div>
      <h1>《{j.title}》</h1>
      {(j.status === 'queued' || j.status === 'running') && (
        <div className="card stack">
          {j.status === 'queued'
            ? <p><span className="spinner" /> 排队中，前面还有 {Math.max(0, j.position - 1)} 本。</p>
            : <p><span className="spinner" /> {j.progress}</p>}
          <ol className="steps-log">
            {STAGES.map(([name], i) => <li key={name} className={i <= stage ? 'on' : ''}>{i < stage ? '✓ ' : ''}{name}</li>)}
          </ol>
          <p className="muted small">大约需要 10 分钟。可以先离开这个页面，生成好后在“我的账户”里也能找到。</p>
        </div>
      )}
      {j.status === 'insufficient' && (
        <div className="card stack">
          <h3>暂无足够可靠的资料</h3>
          <p className="muted">{j.result?.reason}</p>
          <p>可以上传这本书的 txt / pdf / epub 原文后重新生成。本次没有扣额度。</p>
          <a className="btn primary" href={`/new?title=${encodeURIComponent(j.title)}`}>上传原文生成</a>
        </div>
      )}
      {j.status === 'ambiguous' && (
        <div className="card stack">
          <h3>这个书名对应多本书</h3>
          <p className="muted">请选择你要的那一本，或者在生成时填写作者。本次没有扣额度。</p>
          <ul>{(j.result?.candidates || []).map((c, i) => <li key={i}>《{c.title}》{c.author} <span className="muted small">{c.note}</span></li>)}</ul>
          <a className="btn" href={`/new?title=${encodeURIComponent(j.title)}`}>填写作者重新生成</a>
        </div>
      )}
      {j.status === 'failed' && (
        <div className="card stack"><h3>生成失败</h3><p className="muted">{j.error}</p><a className="btn" href={`/new?title=${encodeURIComponent(j.title)}`}>重试</a></div>
      )}
    </div>
  );
}
