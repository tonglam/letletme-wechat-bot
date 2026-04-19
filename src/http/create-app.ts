import { Elysia, t } from "elysia";

import type { BindingAdminServicePort } from "../application/services/binding-admin-service.ts";
import type { NotificationServicePort } from "../application/services/notification-service.ts";
import type { Fetcher } from "../integrations/wechat/ilink-helpers.ts";

const textNotificationSchema = t.Object({
  type: t.Literal("text"),
  targets: t.Optional(t.Array(t.String({ minLength: 1 }))),
  text: t.String({ minLength: 1 })
});

const imageNotificationSchema = t.Object({
  type: t.Literal("image"),
  targets: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
  imageUrl: t.String({ minLength: 1, format: "uri" }),
  caption: t.Optional(t.String({ minLength: 1 }))
});

const targetSchema = t.Object({
  alias: t.String({ minLength: 1 }),
  userId: t.String({ minLength: 1 }),
  contextToken: t.Optional(t.String({ minLength: 1 }))
});

type CreateAppOptions = {
  notificationService: NotificationServicePort;
  adminService: BindingAdminServicePort;
  notificationApiToken: string | undefined;
  adminApiToken: string | undefined;
  fetcher?: Fetcher;
};

export function createApp({
  notificationService,
  adminService,
  notificationApiToken,
  adminApiToken,
  fetcher = fetch
}: CreateAppOptions) {
  return new Elysia()
    .get("/health", () => ({
      status: "ok"
    }))
    .get("/wechatBot/letletme/admin", ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      set.headers["content-type"] = "text/html; charset=utf-8";
      return renderAdminPage();
    })
    .get("/wechatBot/letletme/admin/binding/qrcode/image", async ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      const state = await adminService.getState();
      const qrcodeUrl = state.binding.pendingQrcodeUrl;
      if (!qrcodeUrl) {
        set.status = 404;
        return {
          code: "qr_not_found",
          message: "No pending QR image is available."
        };
      }

      const response = await fetcher(qrcodeUrl);
      if (!response.ok) {
        set.status = 502;
        return {
          code: "qr_proxy_error",
          message: `Failed to load QR image from upstream (HTTP ${response.status}).`
        };
      }

      set.headers["content-type"] = response.headers.get("content-type") ?? "image/png";
      return new Uint8Array(await response.arrayBuffer());
    })
    .post(
      "/wechatBot/letletme/notification",
      async ({ body, headers, set }) => {
        if (notificationApiToken && !isAuthorized(headers.authorization, notificationApiToken)) {
          set.status = 401;
          return unauthorizedResponse();
        }

        return notificationService.send({
          ...body,
          targets: body.targets ?? []
        });
      },
      {
        body: t.Union([textNotificationSchema, imageNotificationSchema])
      }
    )
    .get("/wechatBot/letletme/admin/state", async ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.getState();
    })
    .post("/wechatBot/letletme/admin/binding/qrcode", async ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      try {
        return await adminService.createQrCode();
      } catch (error) {
        return adminErrorResponse(error, set);
      }
    })
    .post("/wechatBot/letletme/admin/binding/poll", async ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      try {
        return await adminService.pollQrStatus();
      } catch (error) {
        return adminErrorResponse(error, set);
      }
    })
    .post(
      "/wechatBot/letletme/admin/targets",
      async ({ body, headers, query, set }) => {
        if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
          set.status = 401;
          return unauthorizedResponse();
        }

        return adminService.upsertTarget(body);
      },
      {
        body: targetSchema
      }
    )
    .delete("/wechatBot/letletme/admin/targets/:alias", async ({ params, headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      return adminService.removeTarget(params.alias);
    })
    .post("/wechatBot/letletme/admin/binding/reset", async ({ headers, query, set }) => {
      if (adminApiToken && !isAdminAuthorized(headers.authorization, query.token, adminApiToken)) {
        set.status = 401;
        return unauthorizedResponse();
      }

      try {
        return await adminService.resetBinding();
      } catch (error) {
        return adminErrorResponse(error, set);
      }
    });
}

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!header) {
    return false;
  }

  return header === `Bearer ${expectedToken}`;
}

function isAdminAuthorized(header: string | undefined, queryToken: string | undefined, expectedToken: string): boolean {
  if (isAuthorized(header, expectedToken)) {
    return true;
  }

  return queryToken === expectedToken;
}

function adminErrorResponse(
  error: unknown,
  set: { status?: number | string }
) {
  const statusCode = extractStatusCode(error);
  set.status = statusCode;
  return {
    code: "admin_error",
    message: error instanceof Error ? error.message : "Unknown admin error."
  };
}

function extractStatusCode(error: unknown) {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    if (typeof value === "number" && Number.isInteger(value) && value >= 400) {
      return value;
    }
  }

  return 500;
}

function unauthorizedResponse() {
  return {
    code: "unauthorized",
    message: "Missing or invalid bearer token."
  };
}

function renderAdminPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>WeChat Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f6f0;
        --panel: #ffffff;
        --line: #d8dccf;
        --text: #16210f;
        --muted: #61705a;
        --accent: #2d9f48;
        --accent-dark: #1f7a34;
        --warning: #b36b00;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        background: linear-gradient(180deg, #e9f2e1 0%, var(--bg) 100%);
        color: var(--text);
      }
      main {
        max-width: 840px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 24px;
        box-shadow: 0 18px 36px rgba(22, 33, 15, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 32px;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .status {
        margin-top: 18px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 10px 14px;
        background: #eef7ea;
        color: var(--accent-dark);
        font-weight: 600;
      }
      .stack {
        display: grid;
        gap: 20px;
        margin-top: 24px;
      }
      button {
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        font-weight: 700;
        padding: 12px 18px;
        cursor: pointer;
      }
      button[disabled] {
        cursor: default;
        opacity: 0.65;
      }
      .muted-button {
        background: #edf0e8;
        color: var(--text);
      }
      .qr-shell {
        min-height: 280px;
        border: 1px dashed var(--line);
        border-radius: 18px;
        background: #fbfcf8;
        display: grid;
        place-items: center;
        padding: 18px;
      }
      .qr-shell img {
        width: min(280px, 100%);
        border-radius: 16px;
        border: 1px solid #e5eadb;
        background: white;
      }
      .hint {
        font-size: 14px;
        color: var(--muted);
      }
      .error {
        color: #a43333;
      }
      .warning {
        color: var(--warning);
      }
      .meta {
        display: grid;
        gap: 10px;
        font-size: 14px;
        color: var(--muted);
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
        background: #eef2e9;
        border-radius: 8px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>WeChat Admin</h1>
        <p>Generate a QR code, scan it in WeChat, and wait until the bot binding becomes confirmed.</p>
        <div id="status" class="status">Loading state...</div>
        <div class="stack">
          <div>
            <button id="generate">Generate QR</button>
            <button id="regenerate" class="muted-button" hidden>Regenerate</button>
          </div>
          <div class="qr-shell" id="qr-shell">
            <p class="hint">No QR code generated yet.</p>
          </div>
          <div class="meta" id="meta"></div>
        </div>
      </section>
    </main>
    <script>
      const statusEl = document.getElementById("status");
      const metaEl = document.getElementById("meta");
      const qrShellEl = document.getElementById("qr-shell");
      const generateButton = document.getElementById("generate");
      const regenerateButton = document.getElementById("regenerate");
      let pollTimer = null;

      function renderStatus(text, tone = "ok") {
        statusEl.textContent = text;
        statusEl.className = "status";
        if (tone === "warning") statusEl.classList.add("warning");
        if (tone === "error") statusEl.classList.add("error");
      }

      function renderMeta(lines) {
        metaEl.innerHTML = lines.map((line) => "<div>" + line + "</div>").join("");
      }

      function renderQr(url) {
        if (!url) {
          qrShellEl.innerHTML = '<p class="hint">No QR code generated yet.</p>';
          return;
        }

        qrShellEl.innerHTML = '<img alt="WeChat QR code" src="' + url + '">';
      }

      const token = new URLSearchParams(window.location.search).get("token");

      function withToken(path) {
        const url = new URL(path, window.location.origin);
        if (token) {
          url.searchParams.set("token", token);
        }
        return url.pathname + url.search;
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            ...(options.headers || {}),
            "content-type": options.body ? "application/json" : (options.headers || {})["content-type"]
          }
        });

        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.message || "Request failed");
        }
        return body;
      }

      async function refreshState() {
        const state = await api(withToken("/wechatBot/letletme/admin/state"));
        const binding = state.binding;

        if (binding.status === "confirmed") {
          renderStatus("Confirmed", "ok");
          renderQr(null);
          regenerateButton.hidden = true;
          renderMeta([
            "Account: <code>" + binding.accountId + "</code>",
            "User: <code>" + binding.userId + "</code>",
            "Base URL: <code>" + binding.baseUrl + "</code>",
            "Saved: <code>" + binding.savedAt + "</code>"
          ]);
          stopPolling();
          return;
        }

        if (binding.status === "pending") {
          renderStatus("Pending scan", "warning");
          renderQr(withToken("/wechatBot/letletme/admin/binding/qrcode/image?ts=" + Date.now()));
          regenerateButton.hidden = true;
          renderMeta([
            "QR token: <code>" + binding.pendingQrcode + "</code>",
            "Waiting for scan and confirm in WeChat."
          ]);
          startPolling();
          return;
        }

        renderStatus("Unbound", "warning");
        renderQr(null);
        regenerateButton.hidden = true;
        renderMeta(["Generate a QR code to start the binding flow."]);
        stopPolling();
      }

      async function generateQr() {
        generateButton.disabled = true;
        regenerateButton.hidden = true;
        renderStatus("Requesting QR code...", "warning");
        try {
          const body = await api(withToken("/wechatBot/letletme/admin/binding/qrcode"), { method: "POST" });
          renderQr(withToken("/wechatBot/letletme/admin/binding/qrcode/image?ts=" + Date.now()));
          renderStatus("QR generated", "warning");
          renderMeta([
            "QR token: <code>" + body.qrcode + "</code>",
            "Scan with WeChat, then confirm on your phone."
          ]);
          startPolling();
        } catch (error) {
          renderStatus("QR generation failed", "error");
          renderMeta([String(error.message || error)]);
        } finally {
          generateButton.disabled = false;
        }
      }

      async function pollBinding() {
        try {
          const body = await api(withToken("/wechatBot/letletme/admin/binding/poll"), { method: "POST" });
          if (body.status === "confirmed") {
            renderStatus("Confirmed", "ok");
            renderQr(null);
            regenerateButton.hidden = true;
            renderMeta([
              "Binding saved.",
              "You can now register target aliases through the admin API."
            ]);
            stopPolling();
            await refreshState();
            return;
          }

          if (body.status === "expired") {
            renderStatus("Expired", "warning");
            renderMeta(["The QR code expired. Generate a new one to continue."]);
            regenerateButton.hidden = false;
            stopPolling();
            return;
          }

          if (body.status === "scaned") {
            renderStatus("Scanned, waiting for confirmation", "warning");
            renderMeta(["The QR code was scanned. Confirm the login in WeChat."]);
            return;
          }

          renderStatus("Waiting for scan", "warning");
          renderMeta(["Scan the QR code with WeChat to continue."]);
        } catch (error) {
          renderStatus("Polling failed", "error");
          renderMeta([String(error.message || error)]);
          stopPolling();
        }
      }

      function startPolling() {
        if (pollTimer !== null) return;
        pollTimer = window.setInterval(pollBinding, 2500);
      }

      function stopPolling() {
        if (pollTimer !== null) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
      }

      generateButton.addEventListener("click", generateQr);
      regenerateButton.addEventListener("click", generateQr);

      refreshState().catch((error) => {
        renderStatus("State load failed", "error");
        renderMeta([String(error.message || error)]);
      });
    </script>
  </body>
</html>`;
}
