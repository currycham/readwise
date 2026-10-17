import { CREDITS_PER_YUAN, PRICES } from '../../config/plans.mjs';
import PlanCards from '../components/PlanCards';

export const metadata = { title: '价格' };

export default function Pricing() {
  return (
    <div className="wrap page">
      <div className="stack">
        <h1>价格</h1>
        <p className="muted" style={{ maxWidth: 680 }}>书库里所有人生成过的书籍回顾和播客都可以免费阅读、收听。只有生成新书和向作者提问会产生费用，因为它们需要实时调用大模型。</p>
      </div>
      <PlanCards />
      <div className="card stack" style={{ maxWidth: 720 }}>
        <h3>积分怎么用</h3>
        <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
          <li>1 元 = {CREDITS_PER_YUAN} 积分，积分长期有效。</li>
          <li>当月生成额度用完后，每多生成一本扣 {PRICES.extraGeneration} 积分。资料不足、书名有歧义或生成失败时，积分全额退回。</li>
          <li>当天的免费提问用完后，每次提问扣 {PRICES.extraAsk} 积分。回答中断时不扣。</li>
          <li>播客对所有人免费。第一位点播放的读者触发生成，之后所有人共享。</li>
        </ul>
        <p className="muted small">在线支付即将开通。内测期间如需积分或会员，请联系管理员。</p>
      </div>
    </div>
  );
}
