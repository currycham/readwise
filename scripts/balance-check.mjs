// 检查各家 API 余额，低于阈值（或查询出错）时发邮件给 ADMIN_EMAILS。同一服务 24 小时内最多提醒一次。
// 服务器上由 cron 每 3 小时运行一次；手动：npm run balance-check [-- --test 无论如何都发一封]
import { checkBalances, loadBalanceState, saveBalanceState } from '../lib/balance.mjs';
import { sendMail } from '../lib/mail.mjs';

const test = process.argv.includes('--test');
const to = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
const state = await loadBalanceState();
const results = await checkBalances();
const now = new Date();
for (const r of results) console.log(`${r.name}：${r.error ? `查询失败 ${r.error}` : `¥${r.balance}（阈值 ¥${r.min}）${r.low ? ' ⚠ 余额不足' : ''}`}`);

const due = results.filter(r => (r.low || r.error) && (test || !state.alerted?.[r.id] || now - Date.parse(state.alerted[r.id]) > 24 * 3600e3));
if ((due.length || test) && to.length) {
  const list = test ? results : due;
  const site = process.env.SITE_NAME || 'ReadWise';
  const line = r => r.error ? `· ${r.name}（${r.use}）：余额查询失败，${r.error}` : `· ${r.name}（${r.use}）：余额 ¥${r.balance}，${r.low ? `低于提醒阈值 ¥${r.min}` : `提醒阈值 ¥${r.min}，余额正常`}\n  充值：${r.console}`;
  await sendMail({
    to: to.join(','),
    subject: test ? `${site} 余额检查（测试邮件）` : `${site} 余额提醒：${due.map(r => r.name).join('、')}${due.some(r => r.low) ? '余额不足' : '查询失败'}`,
    text: `${list.map(line).join('\n\n')}\n\n余额用完后对应功能会停止：DeepSeek 影响生成新书（资料判定、质检），博查影响生成新书（检索），腾讯云影响生成、问作者和播客。\n同一服务 24 小时内只提醒一次。检查时间 ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
  });
  for (const r of due) (state.alerted ||= {})[r.id] = now.toISOString();
  console.log(`已发提醒邮件：${(test ? results : due).map(r => r.name).join('、')}`);
}
await saveBalanceState({ ...state, at: now.toISOString(), results });
