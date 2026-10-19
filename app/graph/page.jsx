// 书籍网络：书库里的书按思想上的联系连成一张网
import Link from 'next/link';
import { CATEGORIES } from '../../config/categories.mjs';
import { graphData } from '../../lib/links.mjs';
import BookGraph, { TYPE_COLORS } from './BookGraph';

export const metadata = { title: '书籍网络', description: '书库里的书按思想上的联系连成一张网：哪些书互相呼应、彼此争论、互为补充，读完一本该读哪一本。' };
export const dynamic = 'force-dynamic';

// 八个问题分类各一种颜色，和深色底的网络图搭配
const PALETTE = ['#F6C453', '#7AA2F7', '#F78FB3', '#FF9F6B', '#4FD1C5', '#9BD86C', '#C792EA', '#5CC8FF'];

export default async function Graph({ searchParams }) {
  const sp = await searchParams;
  const { nodes, links } = graphData();
  const colors = Object.fromEntries(CATEGORIES.map((c, i) => [c.name, PALETTE[i % PALETTE.length]]));
  const initial = nodes.find(n => n.slug === sp.b)?.id ?? null;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const used = CATEGORIES.filter(c => nodes.some(n => n.top === c.name));
  return (
    <div className="graph-page">
      <div className="wrap">
        <div className="label">Readwise · 书籍网络</div>
        <h1>书与书之间的联系</h1>
        <p className="lead muted">
          {nodes.length} 本书，{links.length} 条联系。有的书讲的是同一个问题，有的观点针锋相对，有的一本讲道理、一本讲方法。点开一本书，看它和哪些书相连、为什么相连。
        </p>
      </div>
      <BookGraph nodes={nodes} links={links} colors={colors} initial={initial} />
      <div className="wrap">
        <div className="g-cats" aria-label="节点颜色：问题分类">
          {used.map(c => <span key={c.id}><i style={{ background: colors[c.name] }} />{c.name}</span>)}
        </div>
        <p className="muted small">联系由 AI 根据每本书的内容找出，每加入一本新书都会自动接入网络。</p>
        {/* 不能运行脚本的读者和搜索引擎看到的文字版 */}
        <details className="g-list">
          <summary>文字版：全部 {links.length} 条联系</summary>
          <ul>
            {links.map(l => {
              const a = byId.get(l.a), b = byId.get(l.b);
              return (
                <li key={`${l.a}-${l.b}`}>
                  <Link href={`/b/${encodeURIComponent(a.slug)}`}>《{a.title}》</Link>
                  <span className="g-type" style={{ color: TYPE_COLORS[l.type], borderColor: TYPE_COLORS[l.type] }}>{l.type}</span>
                  <Link href={`/b/${encodeURIComponent(b.slug)}`}>《{b.title}》</Link>
                  {l.concept && <> · {l.concept}</>}：{l.why}
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </div>
  );
}
