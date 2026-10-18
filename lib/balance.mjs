// 各家 API 的余额检查：低于阈值时由 scripts/balance-check.mjs 发邮件提醒。
// 最近一次结果存在数据目录的 balance.json，后台概览页读取显示。
import { readFile, writeFile } from 'node:fs/promises';
import { dataPath } from '../engine/paths.mjs';
import { tcCall } from './tencentcloud.mjs';

const FILE = dataPath('balance.json');
const env = process.env;

// 每家：用途说明、阈值（元）、查询函数（返回余额，单位元）
const PROVIDERS = [
  {
    id: 'deepseek', name: 'DeepSeek', use: '资料判定、质检', console: 'https://platform.deepseek.com/top_up',
    enabled: () => !!env.DEEPSEEK_API_KEY, min: () => Number(env.BALANCE_MIN_DEEPSEEK || 20),
    async fetch() {
      const r = await fetch('https://api.deepseek.com/user/balance', { headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}` }, signal: AbortSignal.timeout(15e3) });
      const j = await r.json();
      if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
      const cny = j.balance_infos?.find(b => b.currency === 'CNY') || j.balance_infos?.[0];
      return Number(cny?.total_balance ?? 0);
    },
  },
  {
    id: 'bocha', name: '博查搜索', use: '联网检索书籍资料', console: 'https://open.bochaai.com',
    enabled: () => !!env.BOCHA_API_KEY && (env.SEARCH_PROVIDER || 'bocha') === 'bocha', min: () => Number(env.BALANCE_MIN_BOCHA || 10),
    async fetch() {
      const r = await fetch('https://api.bochaai.com/v1/fund/remaining', { headers: { authorization: `Bearer ${env.BOCHA_API_KEY}` }, signal: AbortSignal.timeout(15e3) });
      const j = await r.json();
      if (!r.ok || j.data?.remaining == null) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
      return Number(j.data.remaining);
    },
  },
  {
    // TokenHub（混元、MiniMax 配音）按量计费从腾讯云账户余额扣
    id: 'tencent', name: '腾讯云账户', use: 'TokenHub：混元生成、问作者、播客配音', console: 'https://console.cloud.tencent.com/expense/overview',
    enabled: () => !!(env.TENCENTCLOUD_SECRET_ID && env.TENCENTCLOUD_SECRET_KEY), min: () => Number(env.BALANCE_MIN_TENCENT || 50),
    async fetch() {
      const r = await tcCall({ service: 'billing', host: 'billing.tencentcloudapi.com', action: 'DescribeAccountBalance', version: '2018-07-09', payload: {} });
      return Number(r.RealBalance ?? r.Balance) / 100; // 接口单位是分
    },
  },
];

/** 查询所有已配置的服务，返回 [{ id, name, use, console, balance, min, low, error }] */
export async function checkBalances() {
  return Promise.all(PROVIDERS.filter(p => p.enabled()).map(async p => {
    const base = { id: p.id, name: p.name, use: p.use, console: p.console, min: p.min() };
    try {
      const balance = Math.round((await p.fetch()) * 100) / 100;
      return { ...base, balance, low: balance < base.min };
    } catch (e) { return { ...base, balance: null, low: false, error: e.message.slice(0, 200) }; }
  }));
}

export async function loadBalanceState() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return { at: null, results: [], alerted: {} }; }
}
export const saveBalanceState = s => writeFile(FILE, JSON.stringify(s, null, 2));
