import Link from 'next/link';
import { CATEGORIES } from '../config/categories.mjs';
import { categoryCounts, countBooks, listBooks } from '../lib/books.mjs';
import { quotaSummary } from '../lib/credits.mjs';
import EarnRules from './components/EarnRules';
import PlanCards from './components/PlanCards';
import BookCard from './components/BookCard';
import SearchBox from './components/SearchBox';
import { getUser } from './lib/session';

export const dynamic = 'force-dynamic';

const FLOW = [
  ['先看', '推荐', '一句话说清这本书解决什么问题、值不值得读。'],
  ['15′', '双人播客', '两位主持人对谈，先建立整体印象。'],
  ['5′', '检视', '书的类型、要解决的问题、全书结构图。'],
  ['40′', '分析', '8–10 个知识块，论述、术语、例子、误解、回忆题。'],
  ['5′', '检测', '12 道快问快答，概念题和情境题混合。'],
  ['10′', '内化', '表态、讲给朋友听、用到自己的一件事上。'],
];

export default async function Home() {
  const user = await getUser();
  const total = countBooks();
  const recent = listBooks({ sort: 'recent', limit: 8 });
  const popular = listBooks({ sort: 'popular', limit: 8 });
  const counts = categoryCounts();
  const quota = user ? quotaSummary(user) : null;

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <div className="label">Readwise · 书籍精读回顾</div>
            <h1>60 分钟，<em>吃透</em>一本书</h1>
            <p className="lead">
              输入书名，生成一份按<b>《如何阅读一本书》</b>和<b>《学习之道》</b>设计的精读手册：先听 15 分钟播客，再限时精读、检测、内化，读完还能<b>向作者提问</b>。
            </p>
            <SearchBox loggedIn={!!user} />
            <div className="meta">
              <span>书库已有 <b className="num">{total}</b> 本，所有人都能免费阅读</span>
              <span>{quota?.unlimited ? '你是内测用户，生成和提问不限次数' : quota ? `你本月还能免费生成 ${quota.generations.left} 本，积分 ${quota.credits}` : '浏览不用登录，生成新书需要登录'}</span>
            </div>
          </div>

          <div className="preview" aria-label="书籍回顾页面示意">
            <div className="pv-bar"><i className="d" /><i className="c" /><i /><i /></div>
            <div className="pv-steps"><span>检视 5′</span><span>分析 40′</span><span>检测 5′</span><span>内化 10′</span></div>
            <div className="pv-title">被讨厌的勇气</div>
            <div className="muted small">岸见一郎　古贺史健 · <span className="db">豆瓣 8.6</span></div>
            <div className="pv-rec"><b>没读过？先看这里</b>帮你摆脱对认可的执念，在人际关系里获得自由。</div>
            <div className="pv-pod"><span className="play" /><span>双人播客 · 18 分钟</span><span className="wave" /></div>
            <div className="pv-chunk"><b>块 4　课题分离</b><br />分清哪些是自己的课题、哪些是别人的课题，不干涉，也不被干涉。</div>
            <div className="pv-q"><span>A. 讨好上司</span><span className="r">B. 分清课题</span><span>C. 回避冲突</span><span>D. 压抑情绪</span></div>
            <div className="pv-ask"><p className="u">我总担心领导怎么看我，怎么办？</p><p className="a">领导怎么评价你，是他的课题。你的课题是……</p></div>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>一份书籍回顾里有什么</h2><span className="muted small">总共约 60 分钟，每一步都限时</span></div>
          <div className="flow">
            {FLOW.map(([t, b, p]) => <div key={b}><span className="t">{t}</span><b>{b}</b><p>{p}</p></div>)}
          </div>
          <div className="method">
            <div><b>《如何阅读一本书》</b>：整体在谈什么、细节怎么说、有道理吗、与我何干。四个问题串起检视、分析、检测、内化四步。</div>
            <div><b>《学习之道》</b>：限时专注、组块理解、先回想再看答案、交错练习、间隔复习，把“读过”变成“记住”。</div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>大家最近在读</h2><Link href="/library" className="small">查看全部书库 →</Link></div>
          {recent.length ? (
            <div className="books">{recent.map(b => <BookCard key={b.id} b={b} />)}</div>
          ) : (
            <div className="card muted">书库还是空的。在上面输入一本你想吃透的书，生成第一份书籍回顾，你的昵称会作为“首位生成者”显示在页面上。</div>
          )}
          {popular.length > 4 && (
            <>
              <div className="sec-head" style={{ marginTop: 36 }}><h2>最受欢迎</h2></div>
              <div className="books">{popular.slice(0, 4).map(b => <BookCard key={b.id} b={b} />)}</div>
            </>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>按问题找书</h2><span className="muted small">每本书都按它能帮你解决的问题归类</span></div>
          <div className="cats">
            {CATEGORIES.map(c => (
              <div className="cat" key={c.id}>
                <h3><Link href={`/library?top=${encodeURIComponent(c.name)}`}>{c.name}</Link><small>{counts[c.name] || 0} 本</small></h3>
                <div className="subs">
                  {c.subs.map(s => <Link key={s} href={`/library?top=${encodeURIComponent(c.name)}&sub=${encodeURIComponent(s)}`}>{s}{counts[`${c.name}/${s}`] ? ` ${counts[`${c.name}/${s}`]}` : ''}</Link>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>读书赚积分，冲上排行榜</h2><Link href="/rank" className="small">查看排行榜 →</Link></div>
          <EarnRules compact />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head"><h2>价格</h2><Link href="/pricing" className="small">详细说明 →</Link></div>
          <PlanCards />
        </div>
      </section>
    </>
  );
}
