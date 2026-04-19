# letletme-wechat-bot

`letletme-wechat-bot` is a Bun + TypeScript + Elysia notification bridge that delivers outbound WeChat messages over a pre-bound Clawbot channel.

The service is intentionally not an interactive bot runtime. Other systems call HTTP endpoints here, and this service handles channel bootstrap, target alias resolution, and outbound text/image delivery.

## What It Does

- exposes one canonical notification endpoint: `POST /wechatBot/letletme/notification`
- exposes admin/bootstrap endpoints for QR login, binding status, target alias management, and channel reset
- sends text notifications through a stored WeChat channel binding
- sends image notifications from remote URLs through the WeChat SDK
- prefixes outbound text notifications as `[letletme-wechat-bot] <content>`
- supports a default text target alias through env when a text payload omits `targets`

## Tech Stack

- Bun
- TypeScript with strict compiler settings
- Elysia for the HTTP API
- [`@wechatbot/wechatbot`](https://www.npmjs.com/package/@wechatbot/wechatbot) for WeChat iLink delivery
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

## Admin API

All admin endpoints use `Authorization: Bearer <token>` when `ADMIN_API_TOKEN` is configured.

- `GET /wechatBot/letletme/admin/state`
- `POST /wechatBot/letletme/admin/binding/qrcode`
- `POST /wechatBot/letletme/admin/binding/poll`
- `POST /wechatBot/letletme/admin/binding/reset`
- `POST /wechatBot/letletme/admin/targets`
- `DELETE /wechatBot/letletme/admin/targets/:alias`

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
PORT=8026
TIMEZONE=Australia/Perth
NOTIFICATION_API_TOKEN=***
ADMIN_API_TOKEN=***
DEFAULT_TEXT_TARGET_ALIAS=deploy-alerts
WECHAT_BOOTSTRAP_BASE_URL=https://weknora.weixin.qq.com
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

- QR bootstrap uses the official Clawbot binding flow.
- Delivery only works after credentials are confirmed and stored.
- Each target alias must include a `userId` and `contextToken`.
- `binding/reset` clears stored credentials and cached context tokens after requesting a channel reset.
