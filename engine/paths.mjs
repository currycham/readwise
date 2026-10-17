// 数据目录。网站（Next.js 打包后）和后台任务进程都从项目根目录启动，所以用 cwd 定位，而不是模块位置。
import { join } from 'node:path';

export const ROOT = process.env.READWISE_ROOT || process.cwd();
export const DATA_DIR = process.env.READWISE_DATA_DIR || join(ROOT, 'out');
export const dataPath = (...p) => join(DATA_DIR, ...p);
export const rootPath = (...p) => join(ROOT, ...p);
