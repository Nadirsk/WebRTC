# Deploying the Phase 0 media server

One Linux server running the media node, TURN and TLS. This is the setup for measuring real-world quality from phones in the target market.

> The setup script has been written for Ubuntu 24.04 but not yet run on a real server. Expect to fix small things on the first run.

## 1. Pick a server

| Need | Why |
|---|---|
| Location close to the users being tested (e.g. Dubai/Bahrain or a Pakistan data centre) | Latency is mostly distance |
| 4+ CPU cores, 4 GB RAM | One mediasoup worker per core |
| Public IPv4 address | Clients connect straight to it |
| Generous bandwidth (1 Gbps port, several TB/month) | Audio is ~40 kbps per listener; video is far more |
| Ubuntu 24.04 | What the script targets |

Cloud providers work, but check the outbound bandwidth price: AWS/GCP charge about $0.09/GB, while Hetzner/OVH-style providers include several TB.

## 2. DNS

Create an `A` record, e.g. `edge1.yourdomain.com → <server public IP>`. The same name is used for HTTPS/WSS and for TURN.

## 3. Cloud firewall (security group)

If the provider has a firewall in front of the server, open:

| Port | Protocol | Use |
|---|---|---|
| 22 | TCP | SSH |
| 80, 443 | TCP | Caddy (Let's Encrypt + HTTPS/WSS) |
| 3478 | UDP + TCP | TURN |
| 5349 | TCP | TURN over TLS |
| 44444 – 44444+cores-1 | UDP + TCP | mediasoup (one port per worker) |
| 49160 – 49999 | UDP | TURN relay ports |

The script configures `ufw` on the server itself with the same rules.

## 4. Run the setup script

```bash
ssh root@edge1.yourdomain.com
git clone <this repo> rtc-platform && cd rtc-platform
sudo bash deploy/setup-ubuntu.sh edge1.yourdomain.com
```

It installs Node.js 22, Caddy and coturn, builds the project into `/opt/rtc-platform`, writes `/opt/rtc-platform/.env` (with the public IP, worker count and a random TURN secret) and starts the `rtc-media-node` service.

Check it:

```bash
curl https://edge1.yourdomain.com/api/health
journalctl -u rtc-media-node -f
```

## 5. Give coturn the TLS certificate and start it

Caddy gets the certificate on the first HTTPS request. Copy it for coturn:

```bash
D=edge1.yourdomain.com
C=/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/$D
cp $C/$D.crt /etc/coturn/certs/fullchain.pem
cp $C/$D.key /etc/coturn/certs/privkey.pem
chown -R turnserver:turnserver /etc/coturn/certs
systemctl restart coturn
```

Certificates renew every ~60 days; add the copy to a weekly cron job (P1 automates this).

## 6. Test

1. `https://edge1.yourdomain.com/` on a laptop: open the voice room, join from two devices.
2. Voice room with **Force TURN relay** ticked: the route should show `TURN relay`. If joining fails, TURN is misconfigured.
3. `https://edge1.yourdomain.com/latency.html` from phones on each mobile network. Record results in [P0_MEASUREMENTS.md](P0_MEASUREMENTS.md).
4. Capacity, from one or more test machines:
   ```bash
   npm run loadtest -- --url https://edge1.yourdomain.com --listeners 200 --per-tab 50 --duration 120
   ```
5. Android app: in *Media server* enter `wss://edge1.yourdomain.com/ws`.

## Updating

```bash
cd ~/rtc-platform && git pull
sudo rsync -a --delete --exclude node_modules --exclude .git --exclude mobile-test --exclude .env ./ /opt/rtc-platform/
cd /opt/rtc-platform && sudo -u rtc npm ci --workspace media-node --workspace web-client --include-workspace-root && sudo -u rtc npm run build
sudo systemctl restart rtc-media-node
```

A restart drops the calls on this server. Zero-downtime deploys (draining a node first) are part of P1.

## Simulating bad networks (Linux test machine)

```bash
# 10% loss, 80 ms delay ± 30 ms jitter on the test machine's interface
sudo tc qdisc add dev eth0 root netem loss 10% delay 80ms 30ms
# remove
sudo tc qdisc del dev eth0 root
```

Run the latency test and the voice room with different loss levels. The P0 target is audio that stays understandable at 15–20% loss.
