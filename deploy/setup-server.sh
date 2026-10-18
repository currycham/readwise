#!/usr/bin/env bash
# 服务器一次性初始化（Ubuntu/Debian，root 执行）。由 deploy.sh --setup 自动上传并运行，也可手动：
#   sudo bash /tmp/readwise-deploy/setup-server.sh
# 做的事：确保有 Node 20+、装依赖工具、建 readwise 用户和目录、装 systemd 服务、把站点接进现有 Caddy、装每日备份。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION=22.14.0
BASE=/srv/readwise

[ "$(id -u)" = 0 ] || { echo "请用 root 执行（sudo bash $0）"; exit 1; }

echo "==> 系统依赖（编译 better-sqlite3 的兜底工具、pdftotext、sqlite3 备份）"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential python3 poppler-utils sqlite3 rsync curl xz-utils >/dev/null

echo "==> Node.js"
# 服务器上已有 Node 20+ 就直接用，避免影响机器上的其他程序；没有才从 npmmirror 装到 /usr/local
NODE_MAJOR=$(PATH=/usr/local/bin:/usr/bin:/bin node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64) ARCH=arm64 ;; *) echo "不支持的架构 $(uname -m)"; exit 1 ;; esac
  curl -fsSL "https://registry.npmmirror.com/-/binary/node/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1
fi
PATH=/usr/local/bin:/usr/bin:/bin node -v

echo "==> 用户和目录 $BASE"
id readwise &>/dev/null || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin readwise
mkdir -p "$BASE/app" "$BASE/data" "$BASE/backup"
cat > "$BASE/.npmrc" <<NPMRC
registry=https://registry.npmmirror.com
better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3
NPMRC
chown -R readwise:readwise "$BASE"
chmod 750 "$BASE/data" "$BASE/backup"

echo "==> systemd 服务"
install -m 644 "$HERE/readwise-web.service" "$HERE/readwise-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable readwise-web readwise-worker >/dev/null

echo "==> 每日备份"
install -m 755 "$HERE/readwise-backup" /etc/cron.daily/readwise-backup

echo "==> Caddy"
if [ -f /etc/caddy/Caddyfile ] && command -v caddy >/dev/null; then
  install -m 644 "$HERE/readwise.caddy" /etc/caddy/readwise.caddy
  if ! grep -q '^import readwise.caddy' /etc/caddy/Caddyfile; then
    cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
    printf '\nimport readwise.caddy\n' >> /etc/caddy/Caddyfile
  fi
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy
  echo "Caddy 已加载 readwise.waywise.tech"
else
  echo "!! 没找到 /etc/caddy/Caddyfile（Caddy 可能跑在 Docker 里或配置在别处）。"
  echo "   请手动把 $HERE/readwise.caddy 的内容加进你的 Caddyfile 后 reload；"
  echo "   如果 Caddy 在容器里，把 127.0.0.1:3000 改成 host.docker.internal:3000 或宿主机内网 IP。"
fi

if [ ! -f "$BASE/app/.env" ]; then
  echo
  echo "!! 还没有 $BASE/app/.env：首次部署时 deploy.sh 会帮你上传，或手动创建（参考 .env.example）。"
fi
echo "初始化完成。"
