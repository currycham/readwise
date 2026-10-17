import { LEVELS, REWARDS, SIGNUP_BONUS } from '../../config/plans.mjs';

// 获得积分的规则和等级表（价格页、首页共用）
export default function EarnRules({ compact = false }) {
  const rules = [
    ['读完一本', `+${REWARDS.complete}`, `首次闯关检测答对 ${REWARDS.passScore} 题及格，全对再 +${REWARDS.perfect}`],
    ['生成新书', `+${REWARDS.generate}`, '成为一本书的首位生成者'],
    ['被人读完', `+${REWARDS.contrib}`, '你首位生成的书，每有一位读者闯关及格'],
    ['新用户', `+${SIGNUP_BONUS}`, '注册即送'],
  ];
  return (
    <div className="stack">
      <div className="earn">
        {rules.map(([t, n, d]) => <div key={t}><b className="num">{n}</b><span>{t}</span><small>{d}</small></div>)}
      </div>
      {!compact && (
        <p className="muted small">每月上限：读完 {REWARDS.completeMonthlyCap}、生成 {REWARDS.generateMonthlyCap}、被人读完 {REWARDS.contribMonthlyCap} 积分（每本书最多 {REWARDS.contribBookCap}）。
          获得的积分和充值的积分一样可以用来生成新书、超额提问。</p>
      )}
      <div className="levels">
        {LEVELS.map(l => <span key={l.name}><b>{l.name}</b><small className="num">{l.min}+</small></span>)}
      </div>
      <p className="muted small">等级按累计获得的积分计算（不含充值和赠送），花掉积分不会降级。</p>
    </div>
  );
}
