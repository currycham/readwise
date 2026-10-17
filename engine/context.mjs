// 调用上下文：后台任务和网站请求在这里记下 userId / bookId / jobId，
// llm.mjs 记账时自动带上，并交给网站注册的记账回调（写入数据库）。
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();
let sink = null;

export const withContext = (ctx, fn) => store.run({ ...(store.getStore() || {}), ...ctx }, fn);
export const currentContext = () => store.getStore() || {};
export const setUsageSink = fn => { sink = fn; };
export const usageSink = () => sink;
