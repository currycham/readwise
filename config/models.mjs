// 模型与供应商配置。所有供应商都走 OpenAI 兼容的 /chat/completions 接口。
//
// 注意：模型 ID 和价格变化很快，下面的值是按 2026 年 10 月公开资料填写的初值，
// 申请到 API 后请以各家控制台为准，可以直接用环境变量覆盖，不必改代码。
// 价格单位：人民币元 / 百万 tokens。

const env = process.env;

export const PROVIDERS = {
  deepseek: {
    baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  hunyuan: {
    // 混元旧版接口（正迁移到 TokenHub），新 key 请用 tokenhub
    baseURL: env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1',
    keyEnv: 'HUNYUAN_API_KEY',
  },
  tokenhub: {
    // 腾讯云 TokenHub 按量计费接口（Token Plan 订阅用 https://api.lkeap.cloud.tencent.com/plan/v3）
    baseURL: env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1',
    keyEnv: 'TOKENHUB_API_KEY',
  },
  dashscope: {
    baseURL: env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyEnv: 'DASHSCOPE_API_KEY',
  },
};

// alias -> 具体模型。compare 脚本和 --model 参数都用 alias。
export const MODELS = {
  'deepseek-pro': {
    provider: env.DEEPSEEK_PRO_PROVIDER || 'deepseek',
    model: env.DEEPSEEK_PRO_MODEL || 'deepseek-v4-pro',
    price: { input: 9, cachedInput: 0.3, output: 27 }, // 高峰价，待核实
    maxOutput: 32000,
    jsonMode: true,
  },
  'deepseek-flash': {
    provider: env.DEEPSEEK_FLASH_PROVIDER || 'deepseek',
    model: env.DEEPSEEK_FLASH_MODEL || 'deepseek-flash',
    price: { input: 2, cachedInput: 0.05, output: 8 }, // 待核实
    maxOutput: 16000,
    jsonMode: true,
  },
  'hy4': {
    provider: env.HY4_PROVIDER || 'hunyuan',
    model: env.HY4_MODEL || 'hy4-preview',
    price: { input: 6, cachedInput: 0.3, output: 18 },
    maxOutput: 32000,
    jsonMode: true,
  },
  'hy3': {
    provider: env.HY3_PROVIDER || 'hunyuan',
    model: env.HY3_MODEL || 'hy3',
    price: { input: 1, cachedInput: 0.25, output: 4 },
    maxOutput: 16000,
    jsonMode: true,
  },
  'qwen-max': {
    provider: 'dashscope',
    model: env.QWEN_MAX_MODEL || 'qwen3.8-max',
    price: { input: 9, cachedInput: 1.8, output: 27 }, // 待核实
    maxOutput: 32000,
    jsonMode: true,
  },
  'qwen-plus': {
    provider: 'dashscope',
    model: env.QWEN_PLUS_MODEL || 'qwen3.7-plus',
    price: { input: 0.8, cachedInput: 0.16, output: 2 }, // 待核实
    maxOutput: 16000,
    jsonMode: true,
  },
};

// 每个环节默认用哪个模型；命令行 --model 只覆盖 generate。
export const ROLES = {
  assess: env.ROLE_ASSESS || 'deepseek-flash',   // 未用：打分由生成模型完成（需要判断它是否了解这本书）
  extract: env.ROLE_EXTRACT || 'deepseek-flash', // 上传原文的分块抽取
  generate: env.ROLE_GENERATE || 'deepseek-pro', // 生成书页
  check: env.ROLE_CHECK || 'hy3',                // 质检
  repair: env.ROLE_REPAIR || 'deepseek-pro',     // 按质检意见修正
  ask: env.ROLE_ASK || 'hy3',                    // 问作者
  podcast: env.ROLE_PODCAST || 'deepseek-pro',   // 播客稿
};

// 联网搜索：博查 Web Search API（或设 SEARCH_PROVIDER=none 只用模型知识，仅供测试）
export const SEARCH = {
  provider: env.SEARCH_PROVIDER || 'bocha',
  bocha: {
    url: env.BOCHA_URL || 'https://api.bochaai.com/v1/web-search',
    keyEnv: 'BOCHA_API_KEY',
    pricePerCall: 0.036, // 元/次，待核实
  },
};

// 资料充分度门槛（0–9 分，见 engine/prompts.mjs 的打分规则）
export const EVIDENCE_THRESHOLD = Number(env.EVIDENCE_THRESHOLD || 6);
