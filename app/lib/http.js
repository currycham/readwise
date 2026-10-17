// 接口通用工具：JSON 响应、错误转换、同源校验、取 IP
import { NextResponse } from 'next/server';

export const json = (data, status = 200) => NextResponse.json(data, { status });

export function fail(e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return json({ error: status >= 500 && !e.code ? '服务器出错了，请稍后再试' : e.message, code: e.code }, status);
}

/** 写操作只接受本站页面发起的请求（防 CSRF） */
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}

export function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
}

export class HttpError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
