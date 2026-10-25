import { CREDITS_PER_YUAN, PACKS, PRICES } from '../../config/plans.mjs';
import EarnRules from '../components/EarnRules';
import PlanCards from '../components/PlanCards';
import { notFound } from 'next/navigation';
import { SHOW_PRICING } from '../lib/site';

export const metadata = { title: '价格' };

export default function Pricing() {
  if (!SHOW_PRICING) notFound();
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
      </div>
      <section className="stack">
        <h2 style={{ fontSize: 24 }}>读书赚积分</h2>
        <p className="muted" style={{ maxWidth: 680 }}>不想花钱也能多生成：读完书、生成别人也想读的书，都会得到积分。大约读完 6 本，就够多生成 1 本。</p>
        <EarnRules />
      </section>
      <section className="stack">
        <h2 style={{ fontSize: 24 }}>充值积分</h2>
        <div className="packs">
          {PACKS.map(p => <div key={p.yuan}><b><span className="cur">¥</span>{p.yuan}</b><span className="num">{p.credits} 积分</span><small>{p.note || '\u00a0'}</small></div>)}
        </div>
        <p className="muted small">在线支付即将开通。内测期间如需积分或会员，请联系管理员。</p>
      </section>
    </div>
  );
}
