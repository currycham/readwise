import Link from 'next/link';
import { CATEGORIES } from '../config/categories.mjs';
import { booksByTop, categoryCounts, countBooks, getBookBySlug, listBooks } from '../lib/books.mjs';
import { quotaSummary } from '../lib/credits.mjs';
import { countLinks } from '../lib/links.mjs';
import EarnRules from './components/EarnRules';
import PlanCards from './components/PlanCards';
import BookCard from './components/BookCard';
import SearchBox from './components/SearchBox';
import { getUser } from './lib/session';
import { REPO_URL, SHOW_PRICING } from './lib/site';

export const dynamic = 'force-dynamic';

// 一份书籍回顾的全部模块，列在首页右侧的示例卡片里
const FLOW = [
  ['先看', '推荐', '一句话说清这本书解决什么问题、值不值得读。'],
  ['15–20′', '双人播客', '两位主持人对谈，先建立整体印象。'],
  ['5′', '检视', '书的类型、要解决的问题、全书结构图。'],
  ['40′', '分析', '8–10 个知识块，论述、术语、例子、误解、回忆题。'],
  ['5′', '检测', '12 道闯关题，概念题和情境题混合，答对 8 道过关。'],
  ['10′', '内化', '表态、讲给朋友听、用到自己的一件事上。'],
  ['读后', '向作者提问', '由 AI 模拟作者，基于书的内容回答你的具体问题。'],
];

// 首页右侧的示例书，可用 SAMPLE_BOOK 换成书库里的其他书
const SAMPLE_SLUG = process.env.SAMPLE_BOOK || '最小阻力之路';

export default async function Home() {
  const user = await getUser();
  const total = countBooks();
  const recent = listBooks({ sort: 'recent', limit: 8 });
  const popular = listBooks({ sort: 'popular', limit: 8 });
  const counts = categoryCounts();
  const byTop = booksByTop();
  const quota = user ? quotaSummary(user) : null;
  const nLinks = countLinks();
  const sample = getBookBySlug(SAMPLE_SLUG) || popular[0] || null;

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <div className="label">ReadWise · 书籍精读回顾</div>
            <h1><span className="nw">让读过的书，</span><span className="nw"><em>成为</em>你的一部分</span></h1>
            <p className="lead">
              AI 参考<b>《如何阅读一本书》</b>的阅读方法和<b>《学习之道》</b>的学习思想，把一本书梳理成一份书籍回顾：先听一段双人播客，再逐块精读、闯关检测，最后把书里的道理用到自己身上。读完还能<b>向“作者”提问</b>，由 AI 模拟作者作答。
            </p>
            <SearchBox loggedIn={!!user} />
            <div className="meta">
              <span>书库已有 <b className="num">{total}</b> 本，所有人都能免费阅读</span>
              <span>{quota?.unlimited ? '你是内测用户，生成和提问不限次数' : quota ? `你本月还能免费生成 ${quota.generations.left} 本，积分 ${quota.credits}` : '浏览不用登录，生成新书需要登录'}</span>
            </div>
          </div>

          {sample && (
            <Link href={`/b/${encodeURIComponent(sample.slug)}`} className="preview sample" aria-label={`打开示例书籍回顾：${sample.title}`}>
              <div className="pv-label">示例 · 点开看完整的书籍回顾</div>
              <div className="pv-title">{sample.title}</div>
              <div className="muted small">{sample.author}{sample.douban_rating ? <> · <span className="db">豆瓣 {sample.douban_rating}</span></> : null}</div>
              {sample.one_line && <div className="pv-rec"><b>没读过？先看这里</b>{sample.one_line}</div>}
              <ol className="pv-mods">
                {FLOW.map(([t, b]) => <li key={b}><span>{b}</span><span className="t">{t}</span></li>)}
              </ol>
              <span className="btn primary pv-go">打开《{sample.title}》示例 →</span>
            </Link>
          )}
        </section>
      </div>

      <section className="sec">
        <div className="wrap">
          {popular.length > 4 && (
            <>
              <div className="sec-head"><h2>最受欢迎</h2><Link href="/library" className="small">查看全部书库 →</Link></div>
              <div className="books">{popular.slice(0, 4).map(b => <BookCard key={b.id} b={b} />)}</div>
            </>
          )}
          <div className="sec-head" style={popular.length > 4 ? { marginTop: 36 } : undefined}><h2>大家最近在读</h2>{popular.length > 4 ? null : <Link href="/library" className="small">查看全部书库 →</Link>}</div>
          {recent.length ? (
            <div className="books">{recent.map(b => <BookCard key={b.id} b={b} />)}</div>
          ) : (
            <div className="card muted">书库还是空的。在上面输入一本你想读透的书，生成第一份书籍回顾，你的昵称会作为“首位生成者”显示在页面上。</div>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>按问题找书</h2><span className="muted small">每本书都按它能帮你解决的问题归类，鼠标移到方框上可以看到书目</span></div>
          <div className="cats">
            {CATEGORIES.map(c => {
              const groups = byTop[c.name] || [], n = counts[c.name] || 0;
              const listed = groups.reduce((k, g) => k + g.books.length, 0);
              return (
                <div className="cat" key={c.id} tabIndex={0}>
                  <h3><Link href={`/library?top=${encodeURIComponent(c.name)}`}>{c.name}</Link><small>{n} 本</small></h3>
                  <div className="subs">
                    {c.subs.map(s => <Link key={s} title={c.desc[s]} href={`/library?top=${encodeURIComponent(c.name)}&sub=${encodeURIComponent(s)}`}>{s}{counts[`${c.name}/${s}`] ? ` ${counts[`${c.name}/${s}`]}` : ''}</Link>)}
                  </div>
                  <div className="cat-books">
                    {groups.length ? (
                      <>
                        {groups.map(g => (
                          <div key={g.sub}>
                            <div className="cat-sub">{g.sub}</div>
                            <ul>{g.books.map(b => (
                              <li key={b.slug}><Link href={`/b/${encodeURIComponent(b.slug)}`}><b>{b.title}</b><span>{b.author}{b.douban ? ` · 豆瓣 ${b.douban}` : ''}</span></Link></li>
                            ))}</ul>
                          </div>
                        ))}
                        {n > listed && <Link className="small" href={`/library?top=${encodeURIComponent(c.name)}`}>查看全部 {n} 本 →</Link>}
                      </>
                    ) : <p className="muted small">这里还没有书。在上方输入书名，生成第一本。</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {nLinks > 0 && (
        <section className="sec">
          <div className="wrap">
            <Link href="/graph" className="graph-teaser">
              <svg viewBox="0 0 200 120" aria-hidden="true">
                <g stroke="#6CC4B8" strokeOpacity=".55" strokeWidth="1.2" fill="none">
                  <path d="M30 80Q60 40 95 52" /><path d="M95 52Q130 30 168 44" stroke="#E3A452" /><path d="M95 52Q110 85 140 92" stroke="#5CC4B4" />
                  <path d="M30 80Q80 100 140 92" stroke="#E8826F" /><path d="M168 44Q160 75 140 92" stroke="#B59BD8" /><path d="M60 22Q70 40 95 52" />
                </g>
                {[[30, 80, '#D98BA6', 6], [95, 52, '#E3A452', 9], [168, 44, '#7FB2D9', 7], [140, 92, '#5CC4B4', 7], [60, 22, '#B59BD8', 5]].map(([x, y, c, r]) => (
                  <circle key={x} cx={x} cy={y} r={r} fill={c} style={{ filter: `drop-shadow(0 0 6px ${c})` }} />
                ))}
              </svg>
              <div>
                <div className="label">书籍网络</div>
                <b>书与书之间，是连在一起的</b>
                <p>{total} 本书、{nLinks} 条联系：哪些书互相呼应、彼此争论、互为补充，读完一本，下一本读什么。</p>
                <span>打开书籍网络 →</span>
              </div>
            </Link>
          </div>
        </section>
      )}

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>读书赚积分，冲上排行榜</h2><Link href="/rank" className="small">查看排行榜 →</Link></div>
          <EarnRules compact />
        </div>
      </section>

      {SHOW_PRICING && (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head"><h2>价格</h2><Link href="/pricing" className="small">详细说明 →</Link></div>
            <PlanCards />
          </div>
        </section>
      )}

      {REPO_URL && (
        <section className="sec">
          <div className="wrap">
            <a className="card oss" href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 16 16" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              <div>
                <b>ReadWise 是开源项目</b>
                <p className="muted small">从检索、生成、质检到播客配音，整个流程的代码和设计思路都在 GitHub 上。欢迎 Star、提建议，或者部署一个你自己的版本。</p>
              </div>
              <span className="small">去 GitHub 看看 →</span>
            </a>
          </div>
        </section>
      )}
    </>
  );
}
