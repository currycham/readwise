// 短信验证码。SMS_PROVIDER=dev 时不发短信，验证码打印在服务端日志（开发、内测用）。
import { tcCall } from './tencentcloud.mjs';

// 腾讯云短信常见错误码 → 给用户看的提示；其余错误统一提示稍后再试，详情写日志
const FRIENDLY = {
  'LimitExceeded.PhoneNumberDailyLimit': '这个手机号今天获取验证码的次数太多了，请明天再试',
  'LimitExceeded.PhoneNumberThirtySecondLimit': '获取太频繁，请稍后再试',
  'LimitExceeded.PhoneNumberOneHourLimit': '获取太频繁，请 1 小时后再试',
  'LimitExceeded.PhoneNumberSameContentDailyLimit': '获取太频繁，请稍后再试',
  'FailedOperation.PhoneNumberInBlacklist': '这个手机号无法接收短信，请检查是否退订过短信',
  'InvalidParameterValue.IncorrectPhoneNumber': '手机号格式不对',
  'FailedOperation.InsufficientBalanceInSmsPackage': '短信服务暂时不可用，请稍后再试',
};
export class SmsError extends Error { constructor(msg, detail) { super(msg); this.status = 400; this.detail = detail; } }

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
        // 模板里有几个变量就传几个：{1} 验证码、{2} 有效分钟数。只有 {1} 的模板设 SMS_TEMPLATE_PARAMS=1
        TemplateParamSet: [code, '5'].slice(0, Number(process.env.SMS_TEMPLATE_PARAMS || 2)),
      },
    });
    const s = r.SendStatusSet?.[0];
    if (s?.Code !== 'Ok') {
      console.error(`[短信] 发送失败 ${phone.slice(0, 3)}****${phone.slice(-4)}：${s?.Code} ${s?.Message}`);
      throw new SmsError(FRIENDLY[s?.Code] || '验证码发送失败，请稍后再试', s?.Code);
    }
    return {};
  }
  throw new Error(`未知短信服务：${provider}`);
}
