'use client';
// 书籍网络：力导向图（canvas 自绘，不依赖图形库）。节点是书，按问题分类着色；连线是书与书的联系，按关系类型着色。
import { useEffect, useMemo, useRef, useState } from 'react';

export const TYPE_COLORS = { 呼应: '#4FD1C5', 对话: '#FF7A6B', 互补: '#F6C453', 延伸: '#7AA2F7', 同源: '#C792EA' };
const TYPE_TIPS = {
  呼应: '谈同一个问题，结论相近，可以互相印证',
  对话: '同一个问题，观点不同，放在一起读能看到争论',
  互补: '一本讲原理、一本讲方法，或补上对方没讲的部分',
  延伸: '读完一本，另一本把问题推得更深更远',
  同源: '思想上有传承关系',
};
const short = t => t.split(/[:：]/)[0];

export default function BookGraph({ nodes: rawNodes, links: rawLinks, colors, initial }) {
  const wrapRef = useRef(null), canvasRef = useRef(null);
  const [sel, setSel] = useState(null);           // 选中的书 id
  const [hover, setHover] = useState(null);
  const [off, setOff] = useState(() => new Set()); // 隐藏的关系类型
  const [q, setQ] = useState('');
  const st = useRef(null);                          // 模拟状态，放在 ref 里避免每帧重渲染

  // 节点和连线（只建一次）
  const { nodes, links, byId } = useMemo(() => {
    const deg = new Map();
    rawLinks.forEach(l => { deg.set(l.a, (deg.get(l.a) || 0) + 1); deg.set(l.b, (deg.get(l.b) || 0) + 1); });
    const tops = [...new Set(rawNodes.map(n => n.top))];
    const nodes = rawNodes.map((n, i) => {
      // 初始位置：同一分类放在圆周上同一个方向，便于聚成簇
      const ang = (tops.indexOf(n.top) / Math.max(1, tops.length)) * Math.PI * 2 + (i % 7) * 0.12;
      const r = 180 + (i % 5) * 30;
      return { ...n, deg: deg.get(n.id) || 0, x: Math.cos(ang) * r, y: Math.sin(ang) * r, vx: 0, vy: 0, color: colors[n.top] || '#9FB3C8', r: 6 + 2.6 * Math.sqrt(deg.get(n.id) || 0) };
    });
    const byId = new Map(nodes.map(n => [n.id, n]));
    const links = rawLinks.filter(l => byId.has(l.a) && byId.has(l.b)).map((l, i) => ({ ...l, s: byId.get(l.a), t: byId.get(l.b), phase: (i * 0.137) % 1 }));
    return { nodes, links, byId };
  }, [rawNodes, rawLinks, colors]);

  const neighbors = useMemo(() => {
    const m = new Map(nodes.map(n => [n.id, []]));
    links.forEach(l => { m.get(l.a).push({ other: l.t, l }); m.get(l.b).push({ other: l.s, l }); });
    m.forEach(arr => arr.sort((x, y) => y.l.strength - x.l.strength));
    return m;
  }, [nodes, links]);

  // 动画、物理模拟和交互
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current, ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = st.current = { k: 1, tx: 0, ty: 0, alpha: 1, w: 0, h: 0, drag: null, pointers: new Map(), fitted: false, sel: null, hover: null, off: new Set(), raf: 0 };

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      s.w = wrap.clientWidth; s.h = wrap.clientHeight;
      canvas.width = s.w * dpr; canvas.height = s.h * dpr;
      canvas.style.width = s.w + 'px'; canvas.style.height = s.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!s.fitted) { s.tx = s.w / 2; s.ty = s.h / 2; }
    }
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

    // 同一分类的书互相轻微吸引，形成簇
    function step() {
      const a = s.alpha;
      const cents = new Map();
      for (const n of nodes) { const c = cents.get(n.top) || { x: 0, y: 0, n: 0 }; c.x += n.x; c.y += n.y; c.n++; cents.set(n.top, c); }
      for (let i = 0; i < nodes.length; i++) {
        const p = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const o = nodes[j];
          let dx = p.x - o.x, dy = p.y - o.y, d2 = dx * dx + dy * dy + 0.01;
          const d = Math.sqrt(d2), min = p.r + o.r + 26;
          let f = 2600 / d2;                                   // 斥力
          if (d < min) f += (min - d) * 0.08;                  // 防重叠
          dx /= d; dy /= d;
          p.vx += dx * f * a; p.vy += dy * f * a; o.vx -= dx * f * a; o.vy -= dy * f * a;
        }
      }
      for (const l of links) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = 150 - 22 * l.strength, f = (d - rest) * 0.012 * (0.6 + 0.25 * l.strength) * a;
        l.s.vx += dx / d * f; l.s.vy += dy / d * f; l.t.vx -= dx / d * f; l.t.vy -= dy / d * f;
      }
      for (const n of nodes) {
        const c = cents.get(n.top);
        n.vx += (c.x / c.n - n.x) * 0.004 * a - n.x * 0.0035 * a;   // 向分类中心、整体中心靠拢
        n.vy += (c.y / c.n - n.y) * 0.004 * a - n.y * 0.0035 * a;
        if (s.drag?.node === n) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
      }
      s.alpha = Math.max(0.02, s.alpha * 0.992);
    }

    function fit() {
      if (!nodes.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
      const pad = 70, k = Math.min(1.6, Math.min((s.w - pad * 2) / (x1 - x0 || 1), (s.h - pad * 2) / (y1 - y0 || 1)));
      s.k = k; s.tx = s.w / 2 - (x0 + x1) / 2 * k; s.ty = s.h / 2 - (y0 + y1) / 2 * k;
    }
    // 先离屏跑一段，打开时就是展开好的样子
    for (let i = 0; i < 260; i++) step();
    fit(); s.fitted = true;
    if (initial && byId.has(initial)) { s.sel = initial; setSel(initial); }

    const curve = l => { // 稍微弯曲的连线：控制点在中垂线上
      const mx = (l.s.x + l.t.x) / 2, my = (l.s.y + l.t.y) / 2, dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
      return { cx: mx - dy * 0.12, cy: my + dx * 0.12 };
    };
    const at = (l, c, t) => ({ x: (1 - t) * (1 - t) * l.s.x + 2 * (1 - t) * t * c.cx + t * t * l.t.x, y: (1 - t) * (1 - t) * l.s.y + 2 * (1 - t) * t * c.cy + t * t * l.t.y });

    function draw(time) {
      if (s.alpha > 0.021 || s.drag) step();
      const focus = s.hover ?? s.sel;
      const near = new Set(focus != null ? [focus, ...neighbors.get(focus).map(x => x.other.id)] : []);
      ctx.clearRect(0, 0, s.w, s.h);
      ctx.save(); ctx.translate(s.tx, s.ty); ctx.scale(s.k, s.k);

      // 连线
      ctx.lineCap = 'round';
      for (const l of links) {
        if (s.off.has(l.type)) continue;
        const lit = focus == null || l.a === focus || l.b === focus;
        const c = curve(l);
        ctx.strokeStyle = TYPE_COLORS[l.type];
        ctx.globalAlpha = focus == null ? 0.22 + 0.12 * l.strength : lit ? 0.9 : 0.05;
        ctx.lineWidth = (0.7 + 0.55 * l.strength) / Math.sqrt(s.k);
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.quadraticCurveTo(c.cx, c.cy, l.t.x, l.t.y); ctx.stroke();
        // 沿线流动的光点
        if (!reduce && (focus == null || lit)) {
          const p = at(l, c, (time / (5200 - 900 * l.strength) + l.phase) % 1);
          ctx.globalAlpha = lit && focus != null ? 1 : 0.7;
          ctx.fillStyle = '#fff'; ctx.shadowColor = TYPE_COLORS[l.type]; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(p.x, p.y, (1.3 + 0.4 * l.strength) / Math.sqrt(s.k), 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      // 节点
      for (const n of nodes) {
        const dim = focus != null && !near.has(n.id);
        ctx.globalAlpha = dim ? 0.18 : 1;
        const pulse = n.id === s.sel && !reduce ? 1 + 0.08 * Math.sin(time / 300) : 1;
        ctx.shadowColor = n.color; ctx.shadowBlur = dim ? 0 : n.id === focus ? 30 : 16;
        const g = ctx.createRadialGradient(n.x - n.r * 0.3, n.y - n.r * 0.3, 0, n.x, n.y, n.r * pulse);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, n.color); g.addColorStop(1, n.color + '99');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        if (n.id === s.sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / s.k; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse + 5 / s.k, 0, 7); ctx.stroke(); }
      }
      // 书名：放大后、联系多的书、或高亮相关时显示
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const n of nodes) {
        const show = near.has(n.id) || (focus == null && (s.k > 0.95 || n.deg >= 3));
        if (!show) continue;
        const fs = (n.id === focus ? 14 : 12) / s.k;
        ctx.font = `${n.id === focus ? 600 : 400} ${fs}px system-ui, -apple-system, "PingFang SC", sans-serif`;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3 / s.k; ctx.strokeStyle = 'rgba(6,10,20,.85)';
        const label = short(n.title), y = n.y + n.r + 5 / s.k;
        ctx.strokeText(label, n.x, y);
        ctx.fillStyle = n.id === focus ? '#fff' : 'rgba(225,235,250,.88)'; ctx.fillText(label, n.x, y);
      }
      // 选中时在连线中点写共同概念
      if (focus != null) {
        ctx.font = `${11 / s.k}px system-ui, -apple-system, "PingFang SC", sans-serif`;
        for (const { l } of neighbors.get(focus)) {
          if (s.off.has(l.type) || !l.concept) continue;
          const p = at(l, curve(l), 0.5);
          ctx.globalAlpha = 0.95; ctx.lineWidth = 3 / s.k; ctx.strokeStyle = 'rgba(6,10,20,.9)';
          ctx.strokeText(l.concept, p.x, p.y); ctx.fillStyle = TYPE_COLORS[l.type]; ctx.fillText(l.concept, p.x, p.y);
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
      s.raf = requestAnimationFrame(draw);
    }
    s.raf = requestAnimationFrame(draw);

    // ---------- 交互：拖动节点、平移、滚轮和双指缩放、点击选中 ----------
    const toWorld = (cx, cy) => ({ x: (cx - s.tx) / s.k, y: (cy - s.ty) / s.k });
    const pick = (cx, cy) => {
      const p = toWorld(cx, cy);
      let best = null, bd = Infinity;
      for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < n.r + 8 / s.k && d < bd) { bd = d; best = n; } }
      return best;
    };
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const zoomAt = (cx, cy, f) => {
      const k = Math.min(4, Math.max(0.25, s.k * f)); f = k / s.k;
      s.tx = cx - (cx - s.tx) * f; s.ty = cy - (cy - s.ty) * f; s.k = k;
    };
    function down(e) {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e); s.pointers.set(e.pointerId, p);
      if (s.pointers.size === 2) { const [a, b] = [...s.pointers.values()]; s.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; s.drag = null; return; }
      const n = pick(p.x, p.y);
      s.drag = { node: n, x: p.x, y: p.y, moved: 0 };
      if (n) s.alpha = Math.max(s.alpha, 0.3);
    }
    function move(e) {
      const p = local(e);
      if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, p);
      if (s.pinch && s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / s.pinch.d); s.pinch.d = d; return;
      }
      if (s.drag) {
        const dx = p.x - s.drag.x, dy = p.y - s.drag.y;
        s.drag.moved += Math.abs(dx) + Math.abs(dy); s.drag.x = p.x; s.drag.y = p.y;
        if (s.drag.node) { const w = toWorld(p.x, p.y); s.drag.node.x = w.x; s.drag.node.y = w.y; s.alpha = Math.max(s.alpha, 0.3); }
        else { s.tx += dx; s.ty += dy; }
        return;
      }
      if (e.pointerType === 'mouse') {
        const n = pick(p.x, p.y);
        canvas.style.cursor = n ? 'pointer' : 'grab';
        const id = n ? n.id : null;
        if (id !== s.hover) { s.hover = id; setHover(id); }
      }
    }
    function up(e) {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) s.pinch = null;
      const d = s.drag; s.drag = null;
      if (d && d.moved < 6) { const id = d.node ? d.node.id : null; s.sel = id; setSel(id); }
    }
    function wheel(e) { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }
    function leave() { if (s.hover != null) { s.hover = null; setHover(null); } }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('pointerleave', leave);
    // 把一本书移到可见区域中间：桌面上右侧有详情卡，手机上底部有详情卡
    s.center = id => {
      const n = byId.get(id); if (!n) return;
      const k = Math.max(s.k, 1.1), wide = s.w > 640;
      s.k = k; s.tx = (wide ? (s.w - 380) / 2 : s.w / 2) - n.x * k; s.ty = (wide ? s.h / 2 : s.h * 0.24) - n.y * k;
    };
    s.zoom = f => zoomAt(s.w / 2, s.h / 2, f);
    if (initial && byId.has(initial)) s.center(initial);
    s.fit = fit;
    return () => {
      cancelAnimationFrame(s.raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerleave', leave);
    };
  }, [nodes, links, byId, neighbors, initial]);

  // React 状态同步给绘制循环
  useEffect(() => { if (st.current) st.current.sel = sel; }, [sel]);
  useEffect(() => { if (st.current) st.current.off = off; }, [off]);

  const choose = id => { setSel(id); st.current?.center(id); };
  const matches = q.trim() ? nodes.filter(n => n.title.toLowerCase().includes(q.trim().toLowerCase()) || (n.author || '').includes(q.trim())).slice(0, 6) : [];
  const cur = sel != null ? byId.get(sel) : null;
  const tip = hover != null && hover !== sel ? byId.get(hover) : null;

  return (
    <div className="graph" ref={wrapRef}>
      <canvas ref={canvasRef} aria-label="书籍网络图：节点是书，连线是书与书之间的联系" />

      <div className="g-top">
        <div className="g-legend" role="group" aria-label="按关系类型筛选">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <button key={t} type="button" title={TYPE_TIPS[t]} aria-pressed={!off.has(t)} className={off.has(t) ? 'off' : ''}
              onClick={() => setOff(o => { const n = new Set(o); n.has(t) ? n.delete(t) : n.add(t); return n; })}>
              <i style={{ background: c }} />{t}
            </button>
          ))}
        </div>
        <div className="g-search">
          <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="找一本书" aria-label="在网络里找书" />
          {matches.length > 0 && (
            <div className="g-sug">{matches.map(n => <button key={n.id} type="button" onClick={() => { choose(n.id); setQ(''); }}>《{short(n.title)}》<small>{n.author}</small></button>)}</div>
          )}
        </div>
      </div>

      <div className="g-zoom">
        <button type="button" onClick={() => st.current?.zoom(1.3)} aria-label="放大">＋</button>
        <button type="button" onClick={() => st.current?.zoom(1 / 1.3)} aria-label="缩小">－</button>
        <button type="button" onClick={() => { st.current?.fit(); setSel(null); }} aria-label="看全部" title="看全部">⤢</button>
      </div>

      {tip && <div className="g-tip">《{short(tip.title)}》<span>{neighbors.get(tip.id).length} 条联系 · 点击查看</span></div>}

      {cur ? (
        <aside className="g-card" aria-live="polite">
          <button type="button" className="g-x" onClick={() => setSel(null)} aria-label="关闭">×</button>
          <div className="g-cat"><i style={{ background: cur.color }} />{cur.top.replace(/^如何/, '')} · {cur.sub}</div>
          <h2>《{cur.title}》</h2>
          <p className="g-by">{cur.author}{cur.douban ? <> · 豆瓣 {Number(cur.douban).toFixed(1)}</> : null}</p>
          {cur.one && <p className="g-one">{cur.one}</p>}
          <a className="btn primary sm" href={`/b/${encodeURIComponent(cur.slug)}`}>打开书籍回顾 →</a>
          <h3>{neighbors.get(cur.id).length ? `和 ${neighbors.get(cur.id).length} 本书有联系` : '暂时还没有和其他书的联系'}</h3>
          <ul>
            {neighbors.get(cur.id).map(({ other, l }) => (
              <li key={other.id}>
                <button type="button" onClick={() => choose(other.id)}>
                  <span className="g-type" style={{ color: TYPE_COLORS[l.type], borderColor: TYPE_COLORS[l.type] }}>{l.type}</span>
                  <b>《{short(other.title)}》</b>{l.concept && <span className="g-concept">{l.concept}</span>}
                </button>
                <p>{l.why}</p>
              </li>
            ))}
          </ul>
        </aside>
      ) : (
        <div className="g-hint">拖动、滚轮或双指缩放 · 点一本书看它和哪些书相连</div>
      )}
    </div>
  );
}
