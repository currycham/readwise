import { PLANS, PRICES } from '../../config/plans.mjs';

export default function PlanCards() {
  return (
    <div className="plans">
      <div className="plan">
        <h3>免费</h3>
        <div className="price"><span className="cur">¥</span>0</div>
        <ul>
          <li>阅读书库里的全部书籍回顾、收听播客</li>
          <li>每月生成 {PLANS.free.generationsPerMonth} 本新书</li>
          <li>每天向作者提问 {PLANS.free.asksPerDay} 次</li>
        </ul>
      </div>
      <div className="plan hl">
        <h3>会员</h3>
        <div className="price"><span className="cur">¥</span>{PLANS.member.priceYuanPerMonth}<small> / 月　或 ¥{PLANS.member.priceYuanPerYear} / 年</small></div>
        <ul>
          <li>免费版的全部内容</li>
          <li>每月生成 {PLANS.member.generationsPerMonth} 本新书</li>
          <li>每天向作者提问 {PLANS.member.asksPerDay} 次</li>
        </ul>
      </div>
      <div className="plan">
        <h3>按次</h3>
        <div className="price"><span className="cur">¥</span>{PRICES.extraGeneration / 10}<small> / 本（{PRICES.extraGeneration} 积分）</small></div>
        <ul>
          <li>额度用完后，每多生成一本 {PRICES.extraGeneration} 积分</li>
          <li>超出每日提问次数后，每问 {PRICES.extraAsk} 积分</li>
          <li>1 元 = 10 积分，积分长期有效</li>
        </ul>
      </div>
    </div>
  );
}
