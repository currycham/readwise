/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  // 生成任务的上传文件较大
  experimental: { serverActions: { bodySizeLimit: '30mb' } },
};
export default nextConfig;
