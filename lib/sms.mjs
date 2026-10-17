// 短信验证码。SMS_PROVIDER=dev 时不发短信，验证码打印在服务端日志（开发、内测用）。
import { tcCall } from './tencentcloud.mjs';

export async function sendCode(phone, code) {
  const provider = process.env.SMS_PROVIDER || 'dev';
  if (provider === 'dev') {
    console.log(`[短信·开发模式] ${phone} 的验证码：${code}`);
    return { dev: true };
  }
  if (provider === 'tencent') {
    const r = await tcCall({
      service: 'sms', host: 'sms.tencentcloudapi.com', action: 'SendSms', version: '2021-01-11',
      region: process.env.SMS_REGION || 'ap-guangzhou',
      payload: {
        PhoneNumberSet: [`+86${phone}`],
        SmsSdkAppId: process.env.SMS_SDK_APP_ID,
        SignName: process.env.SMS_SIGN_NAME,
        TemplateId: process.env.SMS_TEMPLATE_ID,
        TemplateParamSet: [code, '5'],
      },
    });
    const s = r.SendStatusSet?.[0];
    if (s?.Code !== 'Ok') throw new Error(`短信发送失败：${s?.Code} ${s?.Message}`);
    return {};
  }
  throw new Error(`未知短信服务：${provider}`);
}
