// 开源仓库地址，首页和页脚链接用；fork 部署时用 NEXT_PUBLIC_REPO_URL 覆盖（设为空则不显示）
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/currycham/readwise';

// 站点对外地址：书页 canonical、分享预览、sitemap 用；fork 部署时用 SITE_URL 覆盖
export const SITE_URL = (process.env.SITE_URL || 'https://readwise.waywise.tech').replace(/\/$/, '');
