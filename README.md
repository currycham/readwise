# Readwise · 书籍精读回顾

输入书名，生成一个 60 分钟限时、可交互的精读学习页（按《如何阅读一本书》和《学习之道》组织），附带推荐模块、双人播客稿和“问作者”。仓库包含两部分：内容引擎（`engine/`、`renderer/`，可单独用命令行跑）和网站（`app/` Next.js + `worker/` 后台任务进程 + SQLite）。

## 流程

```
书名 ──► 联网检索（博查）──► 资料充分度打分（0–9）
                                 │ 不足 / 同名多本 → 提示上传原文或指定作者
                                 ▼
原文 txt/pdf/epub ──► 分块抽取笔记 ─┘
                                 ▼
                    生成书页 JSON ──► 结构校验（不过则修一次）
                                 ▼
                    质检（编造/误引/答案错误）──► 按 high/medium 意见修正
                                 ▼
                    保存 out/books/<书名>/<模型>.json + 渲染 HTML
                                 ▼
             问作者（书页作上下文，流式）  播客稿（首次点播放时生成）
```

- 模型只输出结构化 JSON，`renderer/template.html` 负责渲染。改样式不需要重新生成内容，网页和以后的 App 共用同一份数据。
- 每次模型调用都会记账到 `out/ledger.jsonl`（tokens、元、用时），方便核算单本成本。
- 上传的原文只在内存中处理，不保存，生成的公开书页只含解读，单处引用不超过 30 字。

## 快速开始

需要 Node.js 20+；解析 PDF 需要 `pdftotext`（macOS：`brew install poppler`）。

```bash
npm install
cp .env.example .env          # 填入申请到的 key，ADMIN_PHONES 填自己的手机号
npm run dev                   # 网站：http://localhost:3000
npm run worker                # 另开一个终端：后台任务进程（生成书页、合成播客）
```

本地开发时短信默认是 `SMS_PROVIDER=dev`：验证码打印在 `npm run dev` 的终端里。

生产环境：`npm run build` 后用 pm2 / systemd 常驻 `npm start` 和 `npm run worker` 两个进程，前面套 Nginx + HTTPS。

只想看引擎效果、不起网站时，`npm run preview` 打开旧的本地预览服务（http://localhost:5173）。

## 网站功能

| 页面 | 说明 |
|---|---|
| `/` | 首页：产品说明、搜索生成、最近在读、按问题找书、价格 |
| `/library`、`/b/<slug>` | 公共书库和书页，不登录也能看；书页显示豆瓣评分、首位生成者 |
| `/login` | 手机号验证码登录（新号码自动注册） |
| `/new`、`/jobs/<id>` | 生成新书、查看进度 |
| `/me` | 额度、积分流水、改昵称、我首次生成的书 |
| `/pricing` | 套餐与积分规则（定价在 `config/plans.mjs`） |
| `/admin` | 管理后台：概览、书籍、用户、任务、反馈 |

**额度规则**：免费用户每月生成 1 本、每天问作者 10 次；会员每月 5 本、每天 100 次；超出后按积分扣（生成 30 积分/本，提问 1 积分/次）。全站每天有模型成本上限 `DAILY_BUDGET_YUAN`。

**内测白名单**：在 `/admin/users` 点“设为无限量”，该用户生成、提问、触发播客都不受次数限制，也不扣积分（仍受“同时最多 2 本在生成”和全站每日成本上限约束）。白名单期间的生成不计入套餐额度，取消白名单后按正常额度计算。在线支付尚未接入，内测期间积分和会员由管理员在后台发放。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run generate -- "原子习惯" --author 詹姆斯·克利尔` | 检索 → 生成 → 质检，输出到 `out/books/原子习惯/` |
| `npm run generate -- "某本书" --file 原文.pdf` | 资料不足时用原文生成（txt / pdf / epub） |
| `npm run generate -- "原子习惯" --model hy4` | 指定生成模型（alias 见 `config/models.mjs`） |
| `npm run compare -- --models deepseek-pro,hy4,qwen-max` | 用测试书单（`config/eval-books.mjs`）对比多个模型，输出 `out/compare/*.html` 报告 |
| `npm run podcast-script -- out/books/原子习惯/deepseek-pro.json` | 为书页写 30 分钟双人播客稿 |
| `npm run render -- fixtures/最小阻力之路.json` | 把书页 JSON 渲染成单个 HTML |
| `npm run check -- 书页.json` | 只做结构校验 |

## 需要申请的服务

| 服务 | 用途 | 环境变量 |
|---|---|---|
| DeepSeek 开放平台 | 生成书页、修正、播客稿（候选） | `DEEPSEEK_API_KEY` |
| 腾讯混元（或腾讯云 TokenHub） | 生成（候选 Hy4）、质检和问作者（Hy3） | `HUNYUAN_API_KEY` 或 `TOKENHUB_*` |
| 阿里云百炼 | 生成（候选 Qwen-Max）；以后 MiniMax 语音合成也可从这里调用 | `DASHSCOPE_API_KEY` |
| 博查 Web Search API | 联网检索书籍资料 | `BOCHA_API_KEY` |
| 腾讯云 TokenHub · MiniMax 语音 | 播客语音合成 | `TOKENHUB_API_KEY`、`TTS_*` |
| 腾讯云短信 | 登录验证码 | `TENCENTCLOUD_*`、`SMS_*` |
| 腾讯云文本内容安全 | 审核提问、昵称、反馈 | `TENCENTCLOUD_*`、`TMS_*` |

模型 ID 和价格变化很快，`config/models.mjs` 里是初值，以控制台为准，用环境变量覆盖即可。

## 目录

```
config/      模型与价格、问题分类表、对比书单
engine/      llm（兼容接口客户端+记账）、search、upload、prompts、schema（结构与校验）、pipeline、ask、podcast
renderer/    书页模板与渲染
scripts/     命令行入口
server/      旧的本地预览服务（npm run preview）
app/         Next.js 网站（页面、接口、管理后台）
lib/         数据库、登录、额度积分、任务队列、短信、内容审核
worker/      后台任务进程：书页生成、播客稿 + 语音合成
fixtures/    人工整理的《最小阻力之路》样例书页（质量基准）
out/         生成结果、缓存、成本账本（不入库）
```

## 模型对比怎么看

1. 先跑 `npm run compare`，看报告里的成功率、平均成本、用时、质检分和严重问题数。
2. 质检分只是参考，**一定要人工抽查**：每本书至少打开两个模型的页面，对照你对原书的了解，看核心概念是否准确、例子是否编造、题目是否有歧义。
3. 用 `fixtures/最小阻力之路.json` 作为质量基准：生成结果至少要达到这个水平。
4. 选定后在 `.env` 里设置 `ROLE_GENERATE`、`ROLE_CHECK`、`ROLE_ASK`。

## 下一阶段

- 在线支付（微信 / 支付宝），需先把备案主体换成公司。
- 用户量上来后：SQLite → PostgreSQL，播客音频存 COS + CDN。
- 合规：ICP 备案、生成式 AI 应用登记；上线前打开 `MODERATION_PROVIDER=tencent` 和 `SMS_PROVIDER=tencent`。
