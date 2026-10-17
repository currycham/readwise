// 时间工具：库里统一存 UTC ISO 字符串；“今天 / 本月”按北京时间计算。
const BJ = 8 * 3600e3;

export const iso = (d = new Date()) => new Date(d).toISOString();

/** 北京时间今天 0 点对应的 UTC ISO */
export function startOfTodayBJ(d = new Date()) {
  const b = new Date(d.getTime() + BJ);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - BJ).toISOString();
}

/** 北京时间本月 1 日 0 点对应的 UTC ISO */
export function startOfMonthBJ(d = new Date()) {
  const b = new Date(d.getTime() + BJ);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1) - BJ).toISOString();
}

export function addDays(d, n) { return new Date(new Date(d).getTime() + n * 86400e3).toISOString(); }

/** 显示用：北京时间 YYYY-MM-DD HH:mm */
export function fmtBJ(s) {
  if (!s) return '';
  const b = new Date(new Date(s).getTime() + BJ).toISOString();
  return b.slice(0, 10) + ' ' + b.slice(11, 16);
}
