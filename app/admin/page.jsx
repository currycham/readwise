import { LIMITS } from '../../config/plans.mjs';
import { todayCost } from '../../lib/credits.mjs';
import { getDb } from '../../lib/db.mjs';
import { addDays, startOfTodayBJ } from '../../lib/time.mjs';

const TASK = { search: '检索', assess: '资料判定', generate: '生成', 'fix-structure': '结构修正', check: '质检', repair: '修正', extract: '原文抽取', ask: '问作者', podcast: '播客稿', tts: '配音' };

export default function AdminHome() {
  const db = getDb();
  const today = startOfTodayBJ();
  const week = addDays(today, -6);
  const cost = todayCost();
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const stats = [
    ['今日模型成本', `¥${cost.toFixed(2)}`],
    ['近 7 天成本', `¥${db.prepare('SELECT COALESCE(SUM(cost),0) c FROM usage WHERE at >= ?').get(week).c.toFixed(2)}`],
    ['用户总数', n('SELECT COUNT(*) n FROM users')],
    ['今日新用户', n('SELECT COUNT(*) n FROM users WHERE created_at >= ?', today)],
    ['书籍总数', n("SELECT COUNT(*) n FROM books WHERE status = 'ready'")],
    ['今日生成', n("SELECT COUNT(*) n FROM jobs WHERE type = 'generate' AND created_at >= ?", today)],
    ['今日提问', n("SELECT COUNT(*) n FROM usage WHERE task = 'ask' AND at >= ?", today)],
    ['排队 / 进行中', `${n("SELECT COUNT(*) n FROM jobs WHERE status = 'queued'")} / ${n("SELECT COUNT(*) n FROM jobs WHERE status = 'running'")}`],
    ['待处理反馈', n("SELECT COUNT(*) n FROM reports WHERE status = 'open'")],
  ];
  const byTask = db.prepare('SELECT task, COUNT(*) calls, SUM(cost) cost FROM usage WHERE at >= ? GROUP BY task ORDER BY cost DESC').all(week);
  const byDay = db.prepare(`SELECT substr(datetime(at, '+8 hours'), 1, 10) d, SUM(cost) cost FROM usage WHERE at >= ? GROUP BY d ORDER BY d`).all(week);
  const genAvg = db.prepare("SELECT COUNT(*) n, AVG(cost) c FROM jobs WHERE type = 'generate' AND status = 'done' AND created_at >= ?").get(week);
  const pct = Math.min(100, cost / LIMITS.dailyBudgetYuan * 100);
  return (
    <div className="stack">
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}><span>今日预算使用</span><span className="num">¥{cost.toFixed(2)} / ¥{LIMITS.dailyBudgetYuan}</span></div>
        <div className="bar"><i className={pct > 80 ? 'warn' : ''} style={{ width: `${pct}%` }} /></div>
        <p className="muted small">达到预算后，当天暂停生成新书、播客和提问，已有内容照常访问。预算在环境变量 DAILY_BUDGET_YUAN 里设置。</p>
      </div>
      <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><div className="v">{v}</div><div className="k">{k}</div></div>)}</div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="tbl" style={{ flex: 1, minWidth: 280 }}><table><thead><tr><th>近 7 天按环节</th><th>调用</th><th>成本</th></tr></thead><tbody>
          {byTask.map(t => <tr key={t.task}><td>{TASK[t.task] || t.task}</td><td className="num">{t.calls}</td><td className="num">¥{(t.cost || 0).toFixed(2)}</td></tr>)}
        </tbody></table></div>
        <div className="tbl" style={{ flex: 1, minWidth: 220 }}><table><thead><tr><th>日期（北京时间）</th><th>成本</th></tr></thead><tbody>
          {byDay.map(d => <tr key={d.d}><td className="num">{d.d}</td><td className="num">¥{(d.cost || 0).toFixed(2)}</td></tr>)}
        </tbody></table></div>
      </div>
      <p className="muted small">近 7 天完成生成 {genAvg.n} 本，平均每本成本 ¥{(genAvg.c || 0).toFixed(2)}。</p>
    </div>
  );
}
