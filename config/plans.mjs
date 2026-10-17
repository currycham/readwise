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

export const SIGNUP_BONUS = Number(env.SIGNUP_BONUS || 0); // 新用户赠送积分

export const LIMITS = {
  dailyBudgetYuan: Number(env.DAILY_BUDGET_YUAN || 200), // 全站每日模型成本上限，超出后暂停生成与问答
  activeJobsPerUser: 2,                                  // 每人同时进行的生成任务
  podcastPerUserPerDay: 3,                               // 每人每天触发生成的播客数
  askChars: 800,                                         // 单个问题最长字数
};
