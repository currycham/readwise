// 服务端读取当前登录用户。所有页面和接口都通过这里拿用户。
import { cookies } from 'next/headers';
import { setUsageSink } from '../../engine/context.mjs';
import { SESSION_COOKIE, userFromToken } from '../../lib/auth.mjs';
import { recordUsage } from '../../lib/jobs.mjs';

// 网站进程里的模型调用（问作者）也写入 usage 表
setUsageSink(recordUsage);

export async function getUser() {
  const c = await cookies();
  return userFromToken(c.get(SESSION_COOKIE)?.value);
}

export async function getToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
