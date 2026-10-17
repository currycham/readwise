// OpenAI 兼容的 chat/completions 客户端：流式读取、用量统计、按价格折算成本、写入成本账本。
import { appendFile, mkdir } from 'node:fs/promises';
import { MODELS, PROVIDERS } from '../config/models.mjs';

const LEDGER = new URL('../out/ledger.jsonl', import.meta.url);

export function resolveModel(alias) {
  const m = MODELS[alias];
  if (!m) throw new Error(`未知模型 alias：${alias}。可选：${Object.keys(MODELS).join(', ')}`);
  const p = PROVIDERS[m.provider];
  if (!p) throw new Error(`模型 ${alias} 的供应商 ${m.provider} 未配置`);
  if (!p.baseURL) throw new Error(`供应商 ${m.provider} 缺少 baseURL（检查 .env）`);
  const apiKey = process.env[p.keyEnv];
  if (!apiKey) throw new Error(`缺少环境变量 ${p.keyEnv}（模型 ${alias} 需要）`);
  return { alias, ...m, baseURL: p.baseURL.replace(/\/$/, ''), apiKey };
}

export function costOf(model, usage) {
  const cached = usage.cachedTokens || 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const p = model.price;
  return (fresh * p.input + cached * p.cachedInput + usage.outputTokens * p.output) / 1e6;
}

/**
 * 调用模型。
 * @param {object} o
 * @param {string} o.alias      模型 alias
 * @param {Array}  o.messages   OpenAI 格式消息
 * @param {boolean} [o.json]    要求输出 JSON 对象
 * @param {number} [o.maxTokens]
 * @param {number} [o.temperature]
 * @param {string} [o.task]     写入账本的任务名，例如 generate / check
 * @param {string} [o.book]     写入账本的书名
 * @param {(text:string)=>void} [o.onDelta] 流式回调（问作者用）
 * @returns {Promise<{text:string, usage:object, cost:number, ms:number, model:string}>}
 */
export async function chat(o) {
  const model = resolveModel(o.alias);
  const body = {
    model: model.model,
    messages: o.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: Math.min(o.maxTokens || model.maxOutput, model.maxOutput),
  };
  if (o.temperature != null) body.temperature = o.temperature;
  if (o.json && model.jsonMode) body.response_format = { type: 'json_object' };

  const started = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchStream(model, body, o.onDelta);
      const ms = Date.now() - started;
      const cost = costOf(model, res.usage);
      await record({ task: o.task || 'chat', book: o.book || '', alias: model.alias, model: model.model, ms, cost, ...res.usage });
      return { text: res.text, reasoning: res.reasoning, usage: res.usage, cost, ms, model: model.alias, finish: res.finish };
    } catch (e) {
      lastErr = e;
      if (!e.retryable || attempt === 2) break;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function fetchStream(model, body, onDelta) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15 * 60 * 1000);
  let res;
  try {
    res = await fetch(`${model.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${model.apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(`请求 ${model.alias} 失败：${e.message}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) {
    clearTimeout(timer);
    const detail = await res.text().catch(() => '');
    const err = new Error(`${model.alias} 返回 ${res.status}：${detail.slice(0, 500)}`);
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }

  let text = '', reasoning = '', finish = null, buf = '';
  const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        const choice = j.choices?.[0];
        const d = choice?.delta;
        if (d?.content) { text += d.content; onDelta?.(d.content); }
        if (d?.reasoning_content) reasoning += d.reasoning_content;
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (j.usage) {
          usage.inputTokens = j.usage.prompt_tokens ?? usage.inputTokens;
          usage.outputTokens = j.usage.completion_tokens ?? usage.outputTokens;
          usage.cachedTokens = j.usage.prompt_cache_hit_tokens
            ?? j.usage.prompt_tokens_details?.cached_tokens
            ?? usage.cachedTokens;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return { text, reasoning, usage, finish };
}

async function record(entry) {
  await mkdir(new URL('../out/', import.meta.url), { recursive: true });
  await appendFile(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

/** 从模型输出中取出 JSON 对象（容忍 ```json 围栏和前后多余文字）。 */
export function parseJSON(text) {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('模型输出不是合法 JSON');
}

/** 调用模型并解析 JSON；解析失败时把错误发回模型重试一次。 */
export async function chatJSON(o) {
  const first = await chat({ ...o, json: true });
  try {
    return { ...first, data: parseJSON(first.text) };
  } catch (e) {
    if (first.finish === 'length') throw new Error(`${o.alias} 输出被截断（max_tokens 不够），任务 ${o.task}`);
    const retry = await chat({
      ...o,
      json: true,
      messages: [...o.messages, { role: 'assistant', content: first.text }, { role: 'user', content: `上面的输出不是合法 JSON（${e.message}）。请只输出修正后的完整 JSON 对象，不要任何其他文字。` }],
    });
    return { ...retry, cost: first.cost + retry.cost, ms: first.ms + retry.ms, data: parseJSON(retry.text) };
  }
}
