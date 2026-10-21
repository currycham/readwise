// 用户协议和隐私政策共用的站点信息
export const SITE = process.env.SITE_NAME || 'ReadWise';
export const DOMAIN = 'readwise.waywise.tech';
export const UPDATED = '2026 年 10 月 18 日';
// 联系邮箱：默认用发验证码的邮箱（用户收验证码时本来就能看到），可用 CONTACT_EMAIL 覆盖
export const contactEmail = () => process.env.CONTACT_EMAIL || process.env.SMTP_USER || '';
