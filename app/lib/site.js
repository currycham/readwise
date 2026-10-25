// 开源仓库地址，首页和页脚链接用；fork 部署时用 NEXT_PUBLIC_REPO_URL 覆盖（设为空则不显示）
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/currycham/readwise';

// 站点对外地址：书页 canonical、分享预览、sitemap 用；fork 部署时用 SITE_URL 覆盖
export const SITE_URL = (process.env.SITE_URL || 'https://readwise.waywise.tech').replace(/\/$/, '');

// 价格入口（导航、首页价格区、/pricing 页）：内测期间先隐藏，正式收费时设 NEXT_PUBLIC_SHOW_PRICING=1 打开
export const SHOW_PRICING = process.env.NEXT_PUBLIC_SHOW_PRICING === '1';
