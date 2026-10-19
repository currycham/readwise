'use client';
// 书籍网络 3D 版：three.js + 3d-force-graph。书按问题领域聚成星团，连线按关系类型着色并有光粒子流动，
// 辉光后期处理；书名和概念标签用 HTML 叠加层渲染，不被辉光糊掉。点一本书镜头飞过去，右侧卡片写明每条联系。
import { useEffect, useMemo, useRef, useState } from 'react';
import { TYPE_COLORS, TYPE_TIPS } from './types';

const short = t => t.split(/[:：]/)[0];

export default function BookGraph({ nodes: rawNodes, links: rawLinks, colors, initial }) {
  const wrapRef = useRef(null), mountRef = useRef(null);
  const api = useRef({});                           // 场景里的操作：focus、clear、setRotate…
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [off, setOff] = useState(() => new Set());   // 隐藏的关系类型
  const [q, setQ] = useState('');
  const [rotate, setRotate] = useState(true);
  const [tour, setTour] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const byId = useMemo(() => {
    const deg = new Map();
    rawLinks.forEach(l => { deg.set(l.a, (deg.get(l.a) || 0) + 1); deg.set(l.b, (deg.get(l.b) || 0) + 1); });
    return new Map(rawNodes.map(n => [n.id, { ...n, deg: deg.get(n.id) || 0, color: colors[n.top] || '#9FB3C8', r: 2.2 + 0.9 * Math.sqrt(deg.get(n.id) || 0) }]));
  }, [rawNodes, rawLinks, colors]);
  const neighbors = useMemo(() => {
    const m = new Map([...byId.keys()].map(id => [id, []]));
    rawLinks.forEach(l => { if (m.has(l.a) && m.has(l.b)) { m.get(l.a).push({ id: l.b, l }); m.get(l.b).push({ id: l.a, l }); } });
    m.forEach(arr => arr.sort((x, y) => y.l.strength - x.l.strength));
    return m;
  }, [byId, rawLinks]);
  const nTops = useMemo(() => new Set(rawNodes.map(n => n.top)).size, [rawNodes]);

  useEffect(() => {
    let disposed = false, graph = null, raf = 0, ro = null, resume = 0, burst = 0, tourTimer = 0;
    const st = { focus: null, hover: null, off: new Set(), rotate: true, concept: [] };
    (async () => {
      let mods;
      try {
        const c = document.createElement('canvas');
        if (!(c.getContext('webgl2') || c.getContext('webgl'))) throw new Error('no webgl');
        mods = await Promise.all([
          import('3d-force-graph'), import('three'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
          import('three/examples/jsm/renderers/CSS2DRenderer.js'),
        ]);
      } catch { if (!disposed) setFailed(true); return; }
      if (disposed) return;
      const [{ default: ForceGraph3D }, THREE, { UnrealBloomPass }, { CSS2DRenderer, CSS2DObject }] = mods;
      const el = mountRef.current, wrap = wrapRef.current;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // 书多或屏幕窄时，联系少的书平时不显示书名，悬停、选中或成为邻居时再显示
      const degs = [...byId.values()].map(n => n.deg).sort((x, y) => y - x);
      const keep = wrap.clientWidth < 640 ? 8 : 40; // 手机上常显联系最多的 8 本，桌面上 40 本
      const minorDeg = degs.length > keep ? degs[keep - 1] + 1 : 0;

      // 光晕贴图：白色径向渐变，叠加混合后按节点颜色染色
      const glow = (() => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(cv);
      })();

      const nodes = [...byId.values()].map(n => ({ ...n }));
      const nodeById = new Map(nodes.map(n => [n.id, n]));
      const links = rawLinks.filter(l => nodeById.has(l.a) && nodeById.has(l.b)).map(l => ({
        ...l, source: l.a, target: l.b,
        mat: new THREE.MeshBasicMaterial({ color: TYPE_COLORS[l.type], transparent: true, opacity: 0.16 + 0.08 * l.strength, depthWrite: false }),
      }));

      const nodeObj = n => {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(n.r, 28, 18), new THREE.MeshBasicMaterial({ color: n.color, transparent: true, opacity: 0.96 }));
        const inner = new THREE.Mesh(new THREE.SphereGeometry(n.r * 0.38, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: n.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(n.r * 5);
        const div = document.createElement('div');
        div.className = 'n3-label' + (n.deg < minorDeg ? ' minor' : '');
        div.textContent = short(n.title);
        const label = new CSS2DObject(div); label.position.set(0, -n.r - 2.5, 0);
        g.add(halo, core, inner, label);
        n.o = { core, inner, halo, div };
        return g;
      };

      // 每个问题领域在球面上一个锚点（斐波那契球面均匀分布），同领域的书被轻轻拉向锚点，形成星团
      const tops = [...new Set(nodes.map(n => n.top))];
      const anchors = new Map(tops.map((t, i) => {
        const y = 1 - (i + 0.5) / tops.length * 2, rr = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
        return [t, { x: Math.cos(th) * rr * 190, y: y * 190, z: Math.sin(th) * rr * 190 }];
      }));
      const cluster = alpha => { for (const n of nodes) { const a = anchors.get(n.top); n.vx += (a.x - n.x) * 0.03 * alpha; n.vy += (a.y - n.y) * 0.03 * alpha; n.vz += (a.z - n.z) * 0.03 * alpha; } };

      const w = () => wrap.clientWidth, h = () => wrap.clientHeight;
      graph = new ForceGraph3D(el, { controlType: 'orbit', extraRenderers: [new CSS2DRenderer()] })
        .width(w()).height(h())
        // 开了后期处理后背景色会再做一次 sRGB 编码（#02040b 会变成深蓝），这里给近似线性值，最终显示接近 #02040b
        .backgroundColor('#000102')
        .showNavInfo(false)
        .nodeThreeObject(nodeObj)
        .nodeLabel(() => '')
        .linkWidth(l => 0.22 + 0.22 * l.strength)
        .linkMaterial(l => l.mat)
        .linkVisibility(l => !st.off.has(l.type))
        .linkDirectionalParticles(l => (reduce || st.off.has(l.type) ? 0 : l.strength))
        .linkDirectionalParticleWidth(l => 0.9 + 0.35 * l.strength)
        .linkDirectionalParticleSpeed(l => 0.0025 + 0.0012 * l.strength)
        .linkDirectionalParticleColor(l => TYPE_COLORS[l.type])
        .enableNodeDrag(false)
        .warmupTicks(140)
        .cooldownTicks(120)
        .d3VelocityDecay(0.35)
        .onNodeHover(n => { el.style.cursor = n ? 'pointer' : 'grab'; st.hover = n ? n.id : null; setHover(st.hover); paint(); })
        .onNodeClick(n => { stopTour(); focus(n.id, true); })
        .onBackgroundClick(() => { if (st.focus != null) focus(null); })
        .graphData({ nodes, links });
      graph.d3Force('charge').strength(-240);
      graph.d3Force('link').distance(l => 120 - 15 * l.strength).strength(l => 0.06 + 0.05 * l.strength);
      graph.d3Force('cluster', cluster);

      const scene = graph.scene(), camera = graph.camera(), controls = graph.controls();
      scene.fog = new THREE.FogExp2(0x000102, 0.0011);

      // 辉光：节点、连线和粒子都发光，背景保持深色
      const bloom = new UnrealBloomPass(new THREE.Vector2(w(), h()), 0.85, 0.35, 0.3); // 阈值太低会把星点和暗部一起提亮，背景发灰
      graph.postProcessingComposer().addPass(bloom);

      // 两层星空：远处的星和星团周围的尘埃，缓慢转动
      const starField = (count, rMin, rMax, size, color, opacity) => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), s = Math.sqrt(1 - u * u);
          pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, fog: false }));
        scene.add(p); return p;
      };
      const far = starField(2600, 900, 1900, 1.6, 0xa9bfff, 0.7);
      const dust = starField(900, 40, 420, 0.7, 0x6f8ad6, 0.4);

      controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.45;
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resume); });
      controls.addEventListener('end', () => { clearTimeout(resume); resume = setTimeout(() => { controls.autoRotate = st.rotate && !reduce; }, 7000); });

      // 高亮：悬停或选中的书和它的邻居保持明亮，其余变暗
      function paint() {
        const f = st.hover ?? st.focus;
        const near = new Set(f != null ? [f, ...neighbors.get(f).map(x => x.id)] : []);
        for (const n of nodes) {
          const dim = f != null && !near.has(n.id), hot = n.id === f;
          n.o.core.material.opacity = dim ? 0.1 : 0.96;
          n.o.inner.material.opacity = dim ? 0.05 : hot ? 0.9 : 0.55;
          n.o.halo.material.opacity = dim ? 0.02 : hot ? 0.8 : 0.35;
          n.o.halo.scale.setScalar(n.r * (hot ? 9 : 5));
          n.o.div.className = 'n3-label' + (dim ? ' dim' : '') + (hot ? ' hot' : near.has(n.id) ? ' near' : '') + (n.deg < minorDeg && !near.has(n.id) ? ' minor' : '');
        }
        for (const l of links) {
          const lit = f != null && (l.a === f || l.b === f);
          l.mat.opacity = f == null ? 0.16 + 0.08 * l.strength : lit ? 0.9 : 0.025;
        }
      }

      // 选中一本书：镜头飞过去，连线中点标出共同概念，相关连线上持续发射光粒子
      function focus(id, fly) {
        st.focus = id; setSel(id); paint();
        st.concept.forEach(o => scene.remove(o)); st.concept = [];
        clearInterval(burst);
        if (id == null) return;
        const mine = links.filter(l => (l.a === id || l.b === id) && !st.off.has(l.type));
        for (const l of mine) {
          if (!l.concept) continue;
          const d = document.createElement('div');
          d.className = 'n3-concept'; d.textContent = l.concept; d.style.setProperty('--c', TYPE_COLORS[l.type]);
          const o = new CSS2DObject(d);
          o.position.set((l.source.x + l.target.x) / 2, (l.source.y + l.target.y) / 2, (l.source.z + l.target.z) / 2);
          scene.add(o); st.concept.push(o);
        }
        if (!reduce) burst = setInterval(() => mine.forEach(l => graph.emitParticle(l)), 700);
        if (fly) {
          const n = nodeById.get(id), len = Math.hypot(n.x, n.y, n.z) || 1, k = 1 + (wrap.clientWidth > 640 ? 260 : 320) / len;
          graph.cameraPosition({ x: n.x * k, y: n.y * k + 12, z: n.z * k }, n, 1600);
        }
      }

      const order = [...nodes].sort((a, b) => b.deg - a.deg).map(n => n.id);
      function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = 0; setTour(false); } }
      function startTour() {
        let i = Math.max(0, order.indexOf(st.focus) + 1);
        const next = () => { focus(order[i++ % order.length], true); };
        next(); tourTimer = setInterval(next, 5600); setTour(true);
      }

      api.current = {
        focus: id => { stopTour(); focus(id, true); },
        clear: () => { stopTour(); focus(null); graph.zoomToFit(1200, 40); },
        setRotate: on => { st.rotate = on; controls.autoRotate = on && !reduce; },
        setOff: set => { st.off = set; graph.linkVisibility(graph.linkVisibility()).linkDirectionalParticles(graph.linkDirectionalParticles()); if (st.focus != null) focus(st.focus, false); },
        tour: on => (on ? startTour() : stopTour()),
        zoom: f => { const p = camera.position, t = controls.target; graph.cameraPosition({ x: t.x + (p.x - t.x) * f, y: t.y + (p.y - t.y) * f, z: t.z + (p.z - t.z) * f }, t, 400); },
      };

      // 开场：从远处拉近到全景；带 ?b= 时再飞到那本书
      graph.cameraPosition({ x: 0, y: 60, z: 1300 });
      // 布局在 warmupTicks 里已基本算好；不等引擎完全停下（低端设备上要很久），稍后就拉近
      let opened = false;
      const open = () => {
        if (opened || disposed) return; opened = true;
        graph.zoomToFit(2400, 30);
        setReady(true);
        if (initial != null && nodeById.has(initial)) setTimeout(() => !disposed && focus(initial, true), 2500);
      };
      graph.onEngineStop(open);
      setTimeout(open, 1500);

      const tick = t => {
        far.rotation.y = t * 0.000012; dust.rotation.y = -t * 0.00003; dust.rotation.x = t * 0.00001;
        if (st.focus != null && !reduce) { const n = nodeById.get(st.focus); n.o.halo.scale.setScalar(n.r * (8.5 + 1.2 * Math.sin(t / 260))); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      ro = new ResizeObserver(() => { graph.width(w()).height(h()); bloom.setSize(w(), h()); });
      ro.observe(wrap);
      el.addEventListener('pointerdown', () => stopTour());
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf); clearTimeout(resume); clearInterval(burst); clearInterval(tourTimer); ro?.disconnect();
      if (graph) { graph.pauseAnimation(); graph._destructor?.(); }
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [byId, neighbors, rawLinks, initial]);

  useEffect(() => { api.current.setOff?.(off); }, [off]);
  useEffect(() => { api.current.setRotate?.(rotate); }, [rotate]);

  // 沉浸模式：全屏，只留标题，方便录屏
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleImmersive = () => {
    const on = !immersive; setImmersive(on);
    if (on) wrapRef.current.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.();
  };

  const matches = q.trim() ? [...byId.values()].filter(n => n.title.toLowerCase().includes(q.trim().toLowerCase()) || (n.author || '').includes(q.trim())).slice(0, 6) : [];
  const cur = sel != null ? byId.get(sel) : null;
  const tip = hover != null && hover !== sel ? byId.get(hover) : null;

  return (
    <div className={`graph${immersive ? ' immersive' : ''}${ready ? ' ready' : ''}`} ref={wrapRef}>
      <div className="g-mount" ref={mountRef} aria-label="书籍网络 3D 图：节点是书，连线是书与书之间的联系" />
      <span className="hud-c tl" /><span className="hud-c tr" /><span className="hud-c bl" /><span className="hud-c br" />

      {!ready && !failed && <div className="g-loading"><span />正在构建书籍网络…</div>}
      {failed && <div className="g-loading">这个浏览器不支持 3D 图形，可以看下面的文字版。</div>}

      <div className="g-hud">
        <div className="hud-title">READWISE <span>// 书籍网络</span></div>
        <div className="hud-stats"><b>{byId.size}</b> 本书 <i>·</i> <b>{rawLinks.length}</b> 条联系 <i>·</i> <b>{nTops}</b> 个问题领域</div>
        <div className="g-legend" role="group" aria-label="按关系类型筛选">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <button key={t} type="button" title={TYPE_TIPS[t]} aria-pressed={!off.has(t)} className={off.has(t) ? 'off' : ''}
              onClick={() => setOff(o => { const n = new Set(o); n.has(t) ? n.delete(t) : n.add(t); return n; })}>
              <i style={{ background: c, color: c }} />{t}
            </button>
          ))}
        </div>
      </div>

      <div className="g-search">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="搜索一本书" aria-label="在网络里找书" />
        {matches.length > 0 && (
          <div className="g-sug">{matches.map(n => <button key={n.id} type="button" onClick={() => { api.current.focus?.(n.id); setQ(''); }}>《{short(n.title)}》<small>{n.author}</small></button>)}</div>
        )}
      </div>

      <div className="g-tools">
        <button type="button" onClick={() => api.current.zoom?.(0.7)} aria-label="拉近">＋</button>
        <button type="button" onClick={() => api.current.zoom?.(1.4)} aria-label="拉远">－</button>
        <button type="button" onClick={() => api.current.clear?.()} title="回到全景">全景</button>
        <button type="button" aria-pressed={rotate} className={rotate ? 'on' : ''} onClick={() => setRotate(r => !r)} title="镜头自动环绕">环绕</button>
        <button type="button" aria-pressed={tour} className={tour ? 'on' : ''} onClick={() => api.current.tour?.(!tour)} title="镜头依次飞过每一本书">巡游</button>
        <button type="button" aria-pressed={immersive} className={immersive ? 'on' : ''} onClick={toggleImmersive} title="全屏，只保留标题，适合录屏">{immersive ? '退出' : '沉浸'}</button>
      </div>

      {tip && <div className="g-tip">《{short(tip.title)}》<span>{neighbors.get(tip.id).length} 条联系 · 点击查看</span></div>}

      {cur ? (
        <aside className="g-card" aria-live="polite">
          <button type="button" className="g-x" onClick={() => api.current.clear?.()} aria-label="关闭">×</button>
          <div className="g-cat"><i style={{ background: cur.color, color: cur.color }} />{cur.top.replace(/^如何/, '')} · {cur.sub}</div>
          <h2>《{cur.title}》</h2>
          <p className="g-by">{cur.author}{cur.douban ? <> · 豆瓣 {Number(cur.douban).toFixed(1)}</> : null}</p>
          {cur.one && <p className="g-one">{cur.one}</p>}
          <a className="btn primary sm" href={`/b/${encodeURIComponent(cur.slug)}`}>打开书籍回顾 →</a>
          <h3>{neighbors.get(cur.id).length ? `和 ${neighbors.get(cur.id).length} 本书有联系` : '暂时还没有和其他书的联系'}</h3>
          <ul>
            {neighbors.get(cur.id).map(({ id, l }) => (
              <li key={id}>
                <button type="button" onClick={() => api.current.focus?.(id)}>
                  <span className="g-type" style={{ color: TYPE_COLORS[l.type], borderColor: TYPE_COLORS[l.type] }}>{l.type}</span>
                  <b>《{short(byId.get(id).title)}》</b>{l.concept && <span className="g-concept">{l.concept}</span>}
                </button>
                <p>{l.why}</p>
              </li>
            ))}
          </ul>
        </aside>
      ) : (
        ready && <div className="g-hint">拖动旋转 · 滚轮或双指缩放 · 点一本书看它和哪些书相连</div>
      )}

      {immersive && cur && <div className="g-caption">《{short(cur.title)}》<span>{cur.one}</span></div>}
    </div>
  );
}
