# Deployment Guide

## Server & Runtime

- Target host: `43.163.91.9`
- Runtime: Bun 1.2.12 or compatible
- App home: `/home/workspace/letletme-wechat-bot`

## Directory Layout

```text
/home/workspace/letletme-wechat-bot
├── dist/          # bundled Bun output
├── logs/          # console logs
├── run/           # PID tracking
├── state/         # binding state + target registry
├── scripts/       # start/stop/rerun/monitor helpers
└── .env           # exported env vars
```

Create the tree on first deploy:

```bash
mkdir -p /home/workspace/letletme-wechat-bot/{dist,logs,run,state,scripts}
```

## Environment Variables

Put secrets in `/home/workspace/letletme-wechat-bot/.env` and guard permissions with `chmod 600`.

Required:

```bash
WECHAT_STATE_FILE_PATH=/home/workspace/letletme-wechat-bot/state/wechat-state.json
```

Optional:

```bash
PORT=8026
TIMEZONE=UTC
NOTIFICATION_API_TOKEN=***
ADMIN_API_TOKEN=***
DEFAULT_TEXT_TARGET_ALIAS=deploy-alerts
WECHAT_BOOTSTRAP_BASE_URL=https://weknora.weixin.qq.com
BUN_CMD=/home/deploy/.bun/bin/bun
```

## Runtime Scripts

- `./scripts/start.sh` starts the bundled Bun service and records the PID.
- `./scripts/stop.sh` stops the recorded PID.
- `./scripts/rerun.sh` stops then starts the service.
- `./scripts/monitor.sh [-f]` shows status and recent logs or tails the console log.

## Bootstrap Workflow

1. Deploy the service and confirm the HTTP server is reachable.
2. Call `POST /wechatBot/letletme/admin/binding/qrcode` to get a fresh QR URL.
3. Scan and confirm the QR code in WeChat.
4. Call `POST /wechatBot/letletme/admin/binding/poll` until it returns `confirmed`.
5. Register target aliases with `POST /wechatBot/letletme/admin/targets`.
6. Send notifications through `POST /wechatBot/letletme/notification`.

## GitHub Actions Secrets

Configure these repository secrets for deployment:

```bash
DEPLOY_HOST=43.163.91.9
DEPLOY_USERNAME=<deploy user>
DEPLOY_SSH_KEY=<private key>
```
