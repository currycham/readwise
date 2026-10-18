// 邮件验证码。MAIL_PROVIDER=dev 时不发邮件，验证码打印在服务端日志（开发用）；smtp 时通过 SMTP 发送。
// 腾讯云服务器封禁了 25 端口，SMTP 要用 465（SSL）或 587（STARTTLS）。
import nodemailer from 'nodemailer';

let transport;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10e3, greetingTimeout: 10e3, socketTimeout: 20e3,
  });
  return transport;
}

/** 通用发信（提醒邮件等）；dev 模式只打印 */
export async function sendMail({ to, subject, text, html }) {
  const provider = process.env.MAIL_PROVIDER || 'dev';
  if (provider === 'dev') { console.log(`[邮件·开发模式] 收件人 ${to}\n主题：${subject}\n${text}`); return { dev: true }; }
  if (provider !== 'smtp') throw new Error(`未知邮件服务：${provider}`);
  await getTransport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
  return {};
}

export class MailError extends Error { constructor(msg) { super(msg); this.status = 502; } }

export async function sendLoginMail(email, code, minutes) {
  const provider = process.env.MAIL_PROVIDER || 'dev';
  if (provider === 'dev') {
    console.log(`[邮件·开发模式] ${email} 的验证码：${code}`);
    return { dev: true };
  }
  if (provider !== 'smtp') throw new Error(`未知邮件服务：${provider}`);
  const site = process.env.SITE_NAME || 'Readwise';
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: `${site} 登录验证码：${code}`,
      text: `你的登录验证码是 ${code}，${minutes} 分钟内有效。\n\n如果不是你本人操作，请忽略这封邮件。\n\n${site}`,
      html: `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;color:#15242A;line-height:1.7">
<p>你的 ${site} 登录验证码是：</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#0D6866;margin:8px 0">${code}</p>
<p>${minutes} 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p></div>`,
    });
    return {};
  } catch (e) {
    console.error(`[邮件] 发送失败 ${email.replace(/^(.).*(@.*)$/, '$1***$2')}：${e.code || ''} ${e.message}`);
    throw new MailError('验证码邮件发送失败，请检查邮箱地址或稍后再试');
  }
}
