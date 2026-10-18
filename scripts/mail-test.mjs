// 测试邮件配置：npm run mail-test -- you@example.com（会真的发一封验证码邮件）
import { randomInt } from 'node:crypto';
import { sendLoginMail } from '../lib/mail.mjs';

const to = process.argv[2];
if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to || '')) { console.error('用法：npm run mail-test -- 邮箱地址'); process.exit(1); }
console.log(`MAIL_PROVIDER=${process.env.MAIL_PROVIDER || 'dev'}，SMTP ${process.env.SMTP_HOST || '未填'}:${process.env.SMTP_PORT || 465}，账号 ${process.env.SMTP_USER || '未填'}`);
try {
  const r = await sendLoginMail(to, String(randomInt(0, 1e6)).padStart(6, '0'), 10);
  console.log(r.dev ? '当前是开发模式，没有真的发邮件（设 MAIL_PROVIDER=smtp）' : '已发送，请查收（也看看垃圾邮件）');
} catch (e) { console.error('发送失败：', e.message); process.exit(1); }
