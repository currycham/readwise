// 套餐、额度与积分价格。改这里即可调整定价，不需要改业务代码。
// 积分：1 元 = 10 积分。

const env = process.env;

export const CREDITS_PER_YUAN = 10;

export const PLANS = {
  free: {
    name: '免费',
    generationsPerMonth: Number(env.FREE_GEN_PER_MONTH || 1),
    asksPerDay: Number(env.FREE_ASKS_PER_DAY || 10),
  },
  member: {
    name: '会员',
    priceYuanPerMonth: Number(env.MEMBER_PRICE || 15),
    priceYuanPerYear: Number(env.MEMBER_PRICE_YEAR || 128),
    generationsPerMonth: Number(env.MEMBER_GEN_PER_MONTH || 5),
    asksPerDay: Number(env.MEMBER_ASKS_PER_DAY || 100),
  },
};

export const PRICES = {
  extraGeneration: Number(env.PRICE_EXTRA_GEN || 30), // 积分 / 本（¥3），超出月度额度后
  extraAsk: Number(env.PRICE_EXTRA_ASK || 1),         // 积分 / 问（¥0.1），超出每日额度后
};

export const SIGNUP_BONUS = Number(env.SIGNUP_BONUS || 20); // 新用户赠送积分：再完成 2 篇回顾就够多生成 1 本

// 获得积分（统一一种积分，和充值的积分一样可以花）。每项都有月度上限，控制白送的模型成本：
// 单个用户每月最多获得 60 + 25 + 100 = 185 积分（¥18.5）。
export const REWARDS = {
  complete: Number(env.REWARD_COMPLETE || 5),            // 首次闯关检测及格（≥ passScore 题）
  perfect: Number(env.REWARD_PERFECT || 3),              // 首次闯关全对，额外
  completeMonthlyCap: Number(env.REWARD_COMPLETE_CAP || 60),
  passScore: 8,                                          // 12 题答对 8 题及格（约 67%）
  minMinutes: Number(env.REWARD_MIN_MINUTES || 10),      // 打开书页满这么多分钟后才能开始计分闯关
  generate: Number(env.REWARD_GENERATE || 5),            // 成功生成一本新书（首位生成者）
  generateMonthlyCap: Number(env.REWARD_GENERATE_CAP || 25),
  contrib: Number(env.REWARD_CONTRIB || 2),              // 你首位生成的书，每被一位其他用户闯关及格
  contribBookCap: Number(env.REWARD_CONTRIB_BOOK_CAP || 40),
  contribMonthlyCap: Number(env.REWARD_CONTRIB_CAP || 100),
};

// 充值积分包（在线支付开通后启用）。买得越多送得越多。
export const PACKS = [
  { yuan: 6, credits: 60 },
  { yuan: 30, credits: 330, note: '多送 10%' },
  { yuan: 68, credits: 800, note: '多送 18%' },
  { yuan: 128, credits: 1600, note: '多送 25%' },
];

// 等级：按累计“获得”的积分（不含充值、注册赠送、管理员发放）计算，花掉也不降级。
export const LEVELS = [
  { name: '书童', min: 0 },
  { name: '书生', min: 20 },
  { name: '秀才', min: 60 },
  { name: '举人', min: 150 },
  { name: '进士', min: 400 },
  { name: '翰林', min: 1000 },
];

export const LIMITS = {
  dailyBudgetYuan: Number(env.DAILY_BUDGET_YUAN || 200), // 全站每日模型成本上限，超出后暂停生成与问答
  activeJobsPerUser: 2,                                  // 每人同时进行的生成任务
  podcastPerUserPerDay: 3,                               // 每人每天触发生成的播客数
  askChars: 800,                                         // 单个问题最长字数
};
