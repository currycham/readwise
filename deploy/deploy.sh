#!/usr/bin/env bash
# 在本机执行，把当前代码部署到服务器并重启服务。
#
#   DEPLOY_HOST=ubuntu@<服务器IP> DEPLOY_KEY=~/.ssh/<你的密钥> deploy/deploy.sh --setup   # 第一次：初始化服务器 + 部署
#   DEPLOY_HOST=ubuntu@<服务器IP> DEPLOY_KEY=~/.ssh/<你的密钥> deploy/deploy.sh           # 以后每次更新
#
# 选项：
#   --setup        先运行 setup-server.sh（装 Node、建用户、systemd、Caddy 配置），可重复执行
#   --env FILE     上传 FILE 作为服务器上的 .env（默认只在服务器还没有 .env 时提示）
#   --push-data    把本机 out/ 里的数据库、书页和播客音频推到服务器（仅当服务器上还没有数据库时，防止覆盖线上数据）
#
# 指定密钥：DEPLOY_KEY=~/.ssh/<你的密钥>（不设则用 ssh 默认配置）
# 要求：本机能 ssh 免密登录 DEPLOY_HOST，且该用户有免密 sudo（腾讯云的 ubuntu / root 默认满足）。
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-}"
[ -n "$HOST" ] || { echo "请设置 DEPLOY_HOST，例如 DEPLOY_HOST=ubuntu@<服务器IP>"; exit 1; }
SETUP=0; ENV_FILE=""; PUSH_DATA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --setup) SETUP=1 ;;
    --env) ENV_FILE="$2"; shift ;;
    --push-data) PUSH_DATA=1 ;;
    *) echo "未知选项 $1"; exit 1 ;;
  esac
  shift
done

BASE=/srv/readwise
SSH_CMD="ssh -o ServerAliveInterval=30${DEPLOY_KEY:+ -i $DEPLOY_KEY -o IdentitiesOnly=yes}"
SSH="$SSH_CMD $HOST"
export RSYNC_RSH="$SSH_CMD"
# macOS 自带的 openrsync 不支持 --chown，同步后再在服务器上统一改属主
RSYNC_SUDO=(--rsync-path="sudo rsync")

if [ -n "$(git status --porcelain)" ]; then echo "提示：有未提交的改动，也会一起部署。"; fi

if [ "$SETUP" = 1 ]; then
  echo "==> 初始化服务器"
  rsync -az --delete deploy/ "$HOST:/tmp/readwise-deploy/"
  $SSH "sudo bash /tmp/readwise-deploy/setup-server.sh"
fi

echo "==> 同步代码"
rsync -az --delete "${RSYNC_SUDO[@]}" \
  --include '.env.example' --exclude '.env' --exclude '.env.*' \
  --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' --exclude 'out/' --exclude 'uploads/' \
  --exclude '.DS_Store' --exclude 'fixtures/*.html' \
  ./ "$HOST:$BASE/app/"

if [ -n "$ENV_FILE" ]; then
  echo "==> 上传 $ENV_FILE 为服务器 .env"
  rsync -az "${RSYNC_SUDO[@]}" "$ENV_FILE" "$HOST:$BASE/app/.env"
  $SSH "sudo chmod 600 $BASE/app/.env"
fi
if ! $SSH "sudo test -f $BASE/app/.env"; then
  echo "!! 服务器上还没有 .env。先准备一份生产用的 .env（必填 SESSION_SECRET、ADMIN_PHONES 和模型 key），"
  echo "   然后：DEPLOY_HOST=$HOST deploy/deploy.sh --env 你的生产.env"
  exit 1
fi

if [ "$PUSH_DATA" = 1 ]; then
  if $SSH "sudo test -f $BASE/data/readwise.db"; then
    echo "!! 服务器上已有数据库，跳过 --push-data（不会覆盖线上数据）。"
  else
    echo "==> 推送本机数据"
    TMP="$(mktemp -d)"
    sqlite3 out/readwise.db ".backup '$TMP/readwise.db'"   # 热备份，带上 WAL 里的内容
    rsync -az "${RSYNC_SUDO[@]}" "$TMP/readwise.db" "$HOST:$BASE/data/"
    for d in books media; do
      [ -d "out/$d" ] && rsync -az "${RSYNC_SUDO[@]}" "out/$d/" "$HOST:$BASE/data/$d/"
    done
    rm -rf "$TMP"
  fi
fi

$SSH "sudo chown -R readwise:readwise $BASE/app $BASE/data"

echo "==> 安装依赖并构建"
$SSH "cd $BASE/app && sudo -u readwise -H bash -c 'export PATH=/usr/local/bin:/usr/bin:/bin; npm ci --no-audit --no-fund && npm run build'"

# 定时任务随代码更新
$SSH "sudo install -m 644 $BASE/app/deploy/readwise-cron /etc/cron.d/readwise"

echo "==> 重启服务"
# worker 会等当前任务做完再退出，最长可能要十几分钟；网站先重启，worker 放后台重启
$SSH "sudo systemctl restart readwise-web && sudo systemctl restart --no-block readwise-worker"

echo "==> 检查"
for i in $(seq 1 20); do
  if $SSH "curl -fsS -o /dev/null http://127.0.0.1:3000/"; then
    echo "网站已启动：https://readwise.waywise.tech"
    echo "看日志：ssh $HOST sudo journalctl -u readwise-web -u readwise-worker -f"
    exit 0
  fi
  sleep 2
done
echo "!! 网站 40 秒内没有响应，看日志：ssh $HOST sudo journalctl -u readwise-web -n 100"
exit 1
