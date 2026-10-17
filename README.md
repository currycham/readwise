# Readwise · 书籍精读学习页内容引擎

输入书名，生成一个 60 分钟限时、可交互的精读学习页（按《如何阅读一本书》和《学习之道》组织），附带推荐模块、双人播客稿和“问作者”。这一阶段的目标是**把内容质量做扎实，并选定模型**；网站（Next.js + 数据库 + 登录额度）在下一阶段搭建，直接复用这里的引擎和模板。

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

需要 Node.js 20+；解析 PDF 需要 `pdftotext`（macOS：`brew install poppler`）。项目没有第三方依赖，不用 `npm install`。

```bash
cp .env.example .env          # 填入申请到的 key
npm run dev                   # 本地预览：http://localhost:5173（不需要 key 就能看样例书页）
```

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
| 火山引擎豆包语音 或 百炼 MiniMax 语音 | 播客语音合成（下一步接入） | 待定 |

模型 ID 和价格变化很快，`config/models.mjs` 里是初值，以控制台为准，用环境变量覆盖即可。

## 目录

```
config/      模型与价格、问题分类表、对比书单
engine/      llm（兼容接口客户端+记账）、search、upload、prompts、schema（结构与校验）、pipeline、ask、podcast
renderer/    书页模板与渲染
scripts/     命令行入口
server/      本地预览服务（问作者、播客稿接口，带简单限流）
fixtures/    人工整理的《最小阻力之路》样例书页（质量基准）
out/         生成结果、缓存、成本账本（不入库）
```

## 模型对比怎么看

1. 先跑 `npm run compare`，看报告里的成功率、平均成本、用时、质检分和严重问题数。
2. 质检分只是参考，**一定要人工抽查**：每本书至少打开两个模型的页面，对照你对原书的了解，看核心概念是否准确、例子是否编造、题目是否有歧义。
3. 用 `fixtures/最小阻力之路.json` 作为质量基准：生成结果至少要达到这个水平。
4. 选定后在 `.env` 里设置 `ROLE_GENERATE`、`ROLE_CHECK`、`ROLE_ASK`。

## 下一阶段

- 网站：Next.js + PostgreSQL + Redis，部署在腾讯云；书名搜索与去重、生成队列与进度、公共书库（大家在读、按问题分类）、手机号登录、用户额度与全站预算上限、管理后台。
- 播客：接入语音合成，音频存 COS + CDN，开头声明“本节目由 AI 生成”。
- 合规：ICP 备案、生成式 AI 应用登记、内容安全审核、AI 生成标识。
