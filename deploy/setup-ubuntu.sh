#!/usr/bin/env bash
# One-time setup of a Phase 0 media server on a fresh Ubuntu 24.04 machine.
# Run as root from a checkout of this repo:   sudo bash deploy/setup-ubuntu.sh edge1.example.com
#
# Installs Node.js 22, Caddy (TLS), coturn (TURN), opens the firewall, builds the project into
# /opt/rtc-platform and starts it with systemd. Review docs/DEPLOY_P0.md before running.
set -euo pipefail

DOMAIN="${1:?usage: setup-ubuntu.sh <domain pointing at this server>}"
APP_DIR=/opt/rtc-platform
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_IP="$(curl -fsS https://api.ipify.org)"
WORKERS="$(nproc)"
WEBRTC_BASE_PORT=44444
TURN_SECRET="$(openssl rand -hex 32)"

echo "==> Domain $DOMAIN, public IP $PUBLIC_IP, $WORKERS CPU cores"

apt-get update
apt-get install -y curl ca-certificates gnupg rsync openssl ufw coturn debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22
if ! command -v node >/dev/null || ! node -v | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# Bigger UDP buffers help under load
cat > /etc/sysctl.d/90-rtc.conf <<'EOF'
net.core.rmem_max=26214400
net.core.wmem_max=26214400
net.core.rmem_default=1048576
net.core.wmem_default=1048576
EOF
sysctl --system >/dev/null

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3478/udp
ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow "${WEBRTC_BASE_PORT}:$((WEBRTC_BASE_PORT + WORKERS - 1))/udp"
ufw allow "${WEBRTC_BASE_PORT}:$((WEBRTC_BASE_PORT + WORKERS - 1))/tcp"
ufw allow 49160:49999/udp
ufw --force enable

# App
id rtc >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin rtc
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude .git --exclude mobile-test "$REPO_DIR/" "$APP_DIR/"
cd "$APP_DIR"
npm ci --workspace media-node --workspace web-client --include-workspace-root
npm run build

if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
NODE_ID=$(hostname)
REGION=p0
HTTP_LISTEN_IP=127.0.0.1
HTTP_PORT=3000
ANNOUNCED_ADDRESS=$PUBLIC_IP
WEBRTC_BASE_PORT=$WEBRTC_BASE_PORT
MEDIASOUP_NUM_WORKERS=$WORKERS
TURN_URLS=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp,turns:$DOMAIN:5349?transport=tcp
TURN_SECRET=$TURN_SECRET
EOF
fi
chown -R rtc:rtc "$APP_DIR"

# Caddy
sed "s/edge1.example.com/$DOMAIN/" "$REPO_DIR/deploy/caddy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# coturn (TLS cert is copied from Caddy once it has been issued; see docs/DEPLOY_P0.md)
SECRET_IN_ENV="$(grep '^TURN_SECRET=' "$APP_DIR/.env" | cut -d= -f2-)"
sed -e "s/CHANGE_ME_PUBLIC_IP/$PUBLIC_IP/g" \
    -e "s/CHANGE_ME_SAME_AS_TURN_SECRET/$SECRET_IN_ENV/" \
    -e "s/CHANGE_ME_TURN_DOMAIN/$DOMAIN/" \
    "$REPO_DIR/deploy/coturn/turnserver.conf" > /etc/turnserver.conf
mkdir -p /var/log/turnserver /etc/coturn/certs
chown turnserver:turnserver /var/log/turnserver
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true

# Service
cp "$REPO_DIR/deploy/systemd/rtc-media-node.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rtc-media-node
systemctl enable coturn

echo
echo "==> Done. Next steps:"
echo "    1. Open https://$DOMAIN/api/health (Caddy issues the certificate on first request)."
echo "    2. Copy the certificate for coturn and start it (docs/DEPLOY_P0.md, step 5)."
echo "    3. Run the latency test from a phone: https://$DOMAIN/latency.html"
