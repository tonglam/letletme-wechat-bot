# letletme-wechat-bot

`letletme-wechat-bot` is a Bun + TypeScript + Elysia notification bridge for raw iLink / ClawBot delivery.

The service stays notification-first. Other systems call HTTP endpoints here, and this service handles QR binding, target alias resolution, context-token sync, and outbound text/image delivery over the raw iLink protocol.

## What It Does

- exposes one canonical notification endpoint: `POST /wechatBot/letletme/notification`
- exposes admin/bootstrap endpoints for QR login, binding status, target alias management, and local binding reset
- exposes a minimal admin QR page at `GET /wechatBot/letletme/admin`
- sends text notifications through raw `/ilink/bot/sendmessage`
- sends image notifications by downloading the remote image, uploading it through raw `/ilink/bot/getuploadurl`, then sending the CDN media reference
- runs a background `getupdates` sync loop after login so `context_token` values stay usable for outbound notifications
- prefixes outbound text notifications as `[letletme-wechat-bot] <content>`
- supports a default text target alias through env when a text payload omits `targets`

## Tech Stack

- Bun
- TypeScript with strict compiler settings
- Elysia for the HTTP API
- raw iLink / ClawBot HTTP endpoints
- Bun test runner

## Notification API

### Endpoint

```http
POST /wechatBot/letletme/notification
Content-Type: application/json
Authorization: Bearer <token>   # optional, only when NOTIFICATION_API_TOKEN is configured
```

### Text Notification

`targets` is optional for text notifications. If omitted, the service uses `DEFAULT_TEXT_TARGET_ALIAS` from env.

```json
{
  "type": "text",
  "text": "deployment finished",
  "targets": ["deploy-alerts"]
}
```

Delivered text format:

```text
[letletme-wechat-bot] deployment finished
```

### Image Notification

`targets` is required for image notifications.

```json
{
  "type": "image",
  "imageUrl": "https://example.com/chart.png",
  "caption": "daily update",
  "targets": ["ops-group"]
}
```

### Response Shape

```json
{
  "status": "success",
  "notificationType": "text",
  "requestedCount": 1,
  "deliveredCount": 1,
  "failedCount": 0,
  "failures": []
}
```

When a notification resolves to zero targets, or a target has no usable `context_token`, the API returns `partial_failure` with an explicit reason.

## Admin API

All admin endpoints use `Authorization: Bearer <token>` when `ADMIN_API_TOKEN` is configured.

- `GET /wechatBot/letletme/admin/state`
- `GET /wechatBot/letletme/admin`
- `POST /wechatBot/letletme/admin/binding/qrcode`
- `POST /wechatBot/letletme/admin/binding/poll`
- `POST /wechatBot/letletme/admin/binding/reset`
- `POST /wechatBot/letletme/admin/targets`
- `DELETE /wechatBot/letletme/admin/targets/:alias`

### Admin QR Page

Open the admin page in a browser:

```http
GET /wechatBot/letletme/admin
```

When `ADMIN_API_TOKEN` is configured, open it with:

```text
/wechatBot/letletme/admin?token=<ADMIN_API_TOKEN>
```

The page can:

- generate a QR code
- render the QR image for scan
- poll and display `wait`, `scaned`, `confirmed`, and `expired`
- regenerate the QR after expiry
- refresh current binding state

### Create QR Binding

```http
POST /wechatBot/letletme/admin/binding/qrcode
```

Response:

```json
{
  "qrcode": "qrcode_token_xxx",
  "qrcodeUrl": "https://..."
}
```

### Upsert Target Alias

`contextToken` is optional. The background `getupdates` loop can learn and refresh it after a message is received from that user.

```json
{
  "alias": "ops-group",
  "userId": "group_xxx",
  "contextToken": "ctx_xxx"
}
```

## Environment

Required:

```bash
WECHAT_STATE_FILE_PATH=/home/workspace/letletme-wechat-bot/state/wechat-state.json
```

Common optional settings:

```bash
PORT=8027
TIMEZONE=Australia/Perth
NOTIFICATION_API_TOKEN=***
ADMIN_API_TOKEN=***
DEFAULT_TEXT_TARGET_ALIAS=deploy-alerts
WECHAT_BOOTSTRAP_BASE_URL=https://ilinkai.weixin.qq.com
WECHAT_CHANNEL_VERSION=1.0.0
WECHAT_SK_ROUTE_TAG=
BUN_CMD=/home/deploy/.bun/bin/bun
```

## Local Development

```bash
bun install
bun run dev
bun test
bun run typecheck
bun run build
```

## Operational Notes

- QR bootstrap uses raw `GET /ilink/bot/get_bot_qrcode?bot_type=3` and `GET /ilink/bot/get_qrcode_status?qrcode=...`.
- Delivery uses raw `POST /ilink/bot/sendmessage`.
- Media delivery uses raw `POST /ilink/bot/getuploadurl` plus CDN upload.
- The receive loop starts after credentials are confirmed and keeps `get_updates_buf` and `context_token` state in the local state file.
- Each target alias must include a `userId`. `contextToken` can be learned later.
- `binding/reset` clears local credentials, cursor, pending QR state, and cached context tokens.
