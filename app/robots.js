// /robots.txt：书页和书库开放收录，账号、后台、接口和任务页不收录
import { SITE_URL } from './lib/site';

export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/me', '/jobs/', '/new', '/login', '/media/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
