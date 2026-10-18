// 测试腾讯云短信配置：npm run sms-test -- 13800000000（会真的发一条验证码短信）
import { randomInt } from 'node:crypto';
import { sendCode } from '../lib/sms.mjs';

const phone = process.argv[2];
if (!/^1[3-9]\d{9}$/.test(phone || '')) { console.error('用法：npm run sms-test -- 11位手机号'); process.exit(1); }
console.log(`SMS_PROVIDER=${process.env.SMS_PROVIDER || 'dev'}，应用 ${process.env.SMS_SDK_APP_ID || '未填'}，签名「${process.env.SMS_SIGN_NAME || '未填'}」，模板 ${process.env.SMS_TEMPLATE_ID || '未填'}`);
try {
  const r = await sendCode(phone, String(randomInt(0, 1e6)).padStart(6, '0'));
  console.log(r.dev ? '当前是开发模式，没有真的发短信（设 SMS_PROVIDER=tencent）' : '已发送，请查看手机');
} catch (e) { console.error('发送失败：', e.message, e.detail || ''); process.exit(1); }
