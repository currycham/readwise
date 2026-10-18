# 部署与运维

## 部署

脚本和配置在 `deploy/`：服务器上用 systemd 常驻网站（`readwise-web`，只监听 127.0.0.1:3000）和后台任务（`readwise-worker`）两个进程，由现有的 Caddy 反向代理并自动签发 HTTPS 证书。代码在 `/srv/readwise/app`，数据在 `/srv/readwise/data`，每天备份数据库到 `/srv/readwise/backup`（保留 14 天）。

1. DNSPod 给 waywise.tech 加一条 A 记录：主机记录 `readwise` → 服务器 IP；云服务器防火墙放行 80、443。
2. 准备一份生产用的 `.env`（不要提交）：`SESSION_SECRET`（`openssl rand -hex 32`）、`ADMIN_EMAILS`、模型和博查的 key、`NEXT_PUBLIC_ICP`；正式开放前打开 `MAIL_PROVIDER=smtp` 和 `MODERATION_PROVIDER=tencent`。
3. 第一次部署（初始化服务器 + 上传 .env + 推送本机样书，可选）：

```bash
DEPLOY_HOST=ubuntu@<服务器IP> DEPLOY_KEY=~/.ssh/<你的密钥> deploy/deploy.sh --setup --env .env.production --push-data
```

4. 以后每次更新：`DEPLOY_HOST=ubuntu@<服务器IP> DEPLOY_KEY=~/.ssh/<你的密钥> deploy/deploy.sh`

### 邮箱登录（默认）

个人资质即可，不需要短信签名。默认 `LOGIN_METHODS=email`；以后有了企业资质的短信，可以改成 `email,phone` 同时开放。

1. 准备一个发信邮箱，开通 SMTP：
   - **QQ 邮箱**（最简单）：设置 → 账号 → 开启"POP3/SMTP 服务"，拿到**授权码**。`SMTP_HOST=smtp.qq.com`、`SMTP_PORT=465`、`SMTP_USER=你的QQ邮箱`、`SMTP_PASS=授权码`。
   - 或者用 waywise.tech 的域名邮箱（腾讯企业邮等），发件人显示为 `noreply@waywise.tech`，更正式，也更不容易进垃圾箱。
2. 在 `.env.production` 里填：`MAIL_PROVIDER=smtp`、上面四项、`MAIL_FROM="Readwise <发信邮箱>"`（地址要和 `SMTP_USER` 一致），以及 `ADMIN_EMAILS=你的邮箱`。
3. 部署后测试：`cd /srv/readwise/app && sudo -u readwise npm run mail-test -- 你的邮箱`

腾讯云服务器封了 25 端口，SMTP 必须用 465 或 587。

### 接入腾讯云短信（需要企业资质，可选）

1. 腾讯云控制台 → 短信 → 国内短信：
   - **签名**：类型选"网站"，填已备案的域名 waywise.tech，签名内容和备案主体一致（个人备案用个人名义）。
   - **正文模板**：类型选"验证码"，例如 `您的验证码为{1}，{2}分钟内有效，如非本人操作请忽略。`（只有 `{1}` 的模板要设 `SMS_TEMPLATE_PARAMS=1`）。
   - 应用管理里记下 **SDK AppID**。
2. 访问管理 → API 密钥：建议新建子用户，只授权 `QcloudSMSFullAccess`（以后开内容安全再加 `QcloudTMSFullAccess`），拿到 SecretId / SecretKey。
3. 在 `.env.production` 里填：`SMS_PROVIDER=tencent`、`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY`、`SMS_SDK_APP_ID`、`SMS_SIGN_NAME`（签名内容，不带【】）、`SMS_TEMPLATE_ID`。
4. 部署：`deploy/deploy.sh --env .env.production`，然后在服务器上发一条测试短信：
   `cd /srv/readwise/app && sudo -u readwise npm run sms-test -- 你的手机号`

### 常用运维命令（在服务器 `/srv/readwise/app` 下以 readwise 用户执行）

- `npm run import-book -- 书页.json [--podcast]`：把命令行生成的书页导入书库
- `npm run revoice -- [书名 ...]`：换了音色（`TTS_VOICE_A` / `TTS_VOICE_B`）后，沿用对谈稿给已有播客重新配音
- `npm run set-first-user -- 昵称或邮箱 [--only 书名]`：修改首位生成者（后台书籍页也能逐本改）
- `npm run mail-test -- 邮箱`：测试邮件配置

看日志：`ssh ubuntu@<服务器IP> sudo journalctl -u readwise-web -u readwise-worker -f`（邮件还是 dev 模式时，验证码也打印在这里）。

只想看引擎效果、不起网站时，`npm run preview` 打开旧的本地预览服务（http://localhost:5173）。

### 豆瓣评分

生成时直接从豆瓣读书取评分（联想接口找书、按作者挑版本、书页读评分和人数），取不到再用检索资料抽取；每天凌晨刷新超过 30 天的评分，人工填写的不覆盖。`npm run douban-refresh -- [--all] [--dry]` 手动刷新，`DOUBAN_FETCH=0` 关闭。

### 内容审核

生成的书页和播客稿都会过腾讯云文本内容安全。只有命中 `MODERATION_HOLD_LABELS`（默认色情、暴恐、违法）才隐藏并转后台人工复核；其他标签（读书内容里多为误判）照常发布，只在后台任务页留审核提示。

### API 余额提醒

`scripts/balance-check.mjs` 每 3 小时检查 DeepSeek、博查、腾讯云余额，低于 `BALANCE_MIN_*` 发邮件提醒，后台概览也能看到。

## 网站功能与规则

| 页面 | 说明 |
|---|---|
| `/` | 首页：产品说明、搜索生成、最近在读、按问题找书、价格 |
| `/library`、`/b/<slug>` | 公共书库和书页，不登录也能看；书页显示豆瓣评分、首位生成者 |
| `/login` | 邮箱验证码登录（新邮箱自动注册，首次登录起昵称） |
| `/new`、`/jobs/<id>` | 生成新书、查看进度 |
| `/me` | 额度、积分流水、改昵称、我首次生成的书 |
| `/u/<id>` | 用户主页：等级、积分、读完本数、首位生成的书 |
| `/pricing` | 套餐、充值积分包、读书赚积分规则（都在 `config/plans.mjs`） |
| `/rank` | 排行榜：本周 / 总榜，按获得的积分排名 |
| `/admin` | 管理后台：概览、书籍、用户、任务、反馈 |

**额度规则**：免费用户每月生成 1 本、每天问作者 10 次；会员每月 5 本、每天 100 次；超出后按积分扣（生成 30 积分/本，提问 1 积分/次）。全站每天有模型成本上限 `DAILY_BUDGET_YUAN`。

**积分与游戏化**（只有一种积分，获得的和充值的一样可以花）：
- 检测改为闯关：一题一题作答，连对有连击，结束给 S/A/B/C 评级。答案不下发到页面，由 `/api/quiz` 判分。
- 登录用户打开书页满 10 分钟后才能开始计分闯关；每题只算第一次作答；首次闯关答对 8/12 得 5 积分，全对再 +3。之后可以无限练习，不计分。
- 成功生成新书 +5；你首位生成的书每被一位其他用户闯关及格 +2（每本最多 40）。白名单和管理员生成不发奖励。
- 每项奖励都有月度上限（读完 60、生成 25、被人读完 100），单个用户每月最多白得 185 积分（¥18.5）。注册赠送积分由 `SIGNUP_BONUS` 设置（内测期间 100）。
- 等级按累计获得的积分（不含充值、赠送、管理员发放）：书童 → 书生 → 秀才 → 举人 → 进士 → 翰林。排行榜同样只算获得的积分。

**内测白名单**：在 `/admin/users` 点“设为无限量”，该用户生成、提问、触发播客都不受次数限制，也不扣积分（仍受“同时最多 2 本在生成”和全站每日成本上限约束）。白名单期间的生成不计入套餐额度，取消白名单后按正常额度计算。在线支付尚未接入，内测期间积分和会员由管理员在后台发放。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run generate -- "原子习惯" --author 詹姆斯·克利尔` | 检索 → 生成 → 质检，输出到 `out/books/原子习惯/` |
| `npm run generate -- "某本书" --file 原文.pdf` | 资料不足时用原文生成（txt / pdf / epub） |
| `npm run generate -- "原子习惯" --model hy4` | 指定生成模型（alias 见 `config/models.mjs`） |
| `npm run compare -- --models deepseek-pro,hy4,qwen-max` | 用测试书单（`config/eval-books.mjs`）对比多个模型，输出 `out/compare/*.html` 报告 |
| `npm run podcast-script -- out/books/原子习惯/deepseek-pro.json` | 为书页写 15–20 分钟双人播客稿（时长见 `PODCAST_MINUTES`） |
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
| 腾讯云文本内容安全 | 审核书页、播客稿、提问、昵称、反馈 | `TENCENTCLOUD_*`、`TMS_*` |

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
- 合规：生成式 AI 应用登记。
