import { describe, expect, test } from "bun:test";

import type { BindingAdminServicePort } from "../../src/application/services/binding-admin-service.ts";
import type { NotificationServicePort } from "../../src/application/services/notification-service.ts";
import { createApp } from "../../src/http/create-app.ts";

describe("http routes", () => {
  const adminService: BindingAdminServicePort = {
    createQrCode: async () => ({
      qrcode: "qr-token",
      qrcodeUrl: "https://example.com/qr.png"
    }),
    pollQrStatus: async () => ({
      status: "confirmed",
      credentials: {
        token: "bot-token",
        baseUrl: "https://ilinkai.weixin.qq.com",
        accountId: "bot@im.bot",
        userId: "user@im.wechat",
        savedAt: "2026-04-19T00:00:00.000Z"
      }
    }),
    getState: async () => ({
      binding: {
        status: "confirmed",
        accountId: "bot@im.bot",
        userId: "user@im.wechat",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "2026-04-19T00:00:00.000Z"
      },
      targets: [
        {
          alias: "ops-group",
          userId: "ops-group@im.wechat",
          contextToken: "ops-ctx"
        }
      ]
    }),
    upsertTarget: async (target) => target,
    removeTarget: async () => ({ removed: true }),
    resetBinding: async () => ({ cleared: true })
  };

  test("accepts a valid text notification request", async () => {
    const service: NotificationServicePort = {
      send: async (notification) => ({
        status: "success",
        notificationType: notification.type,
        requestedCount: notification.targets.length,
        deliveredCount: notification.targets.length,
        failedCount: 0,
        failures: []
      })
    };

    const app = createApp({
      notificationService: service,
      adminService,
      notificationApiToken: undefined,
      adminApiToken: undefined
    });

    const response = await app.handle(
      new Request("http://localhost/wechatBot/letletme/notification", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          type: "text",
          targets: ["ops-group"],
          text: "hello"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "success",
      notificationType: "text",
      requestedCount: 1,
      deliveredCount: 1,
      failedCount: 0,
      failures: []
    });
  });

  test("exposes an unauthenticated health endpoint", async () => {
    const service: NotificationServicePort = {
      send: async () => {
        throw new Error("send should not be called");
      }
    };

    const app = createApp({
      notificationService: service,
      adminService,
      notificationApiToken: "notify-secret",
      adminApiToken: "admin-secret"
    });

    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok"
    });
  });

  test("creates a qrcode binding request through the admin API", async () => {
    const service: NotificationServicePort = {
      send: async () => {
        throw new Error("send should not be called");
      }
    };
    const app = createApp({
      notificationService: service,
      adminService,
      notificationApiToken: undefined,
      adminApiToken: "admin-secret"
    });

    const response = await app.handle(
      new Request("http://localhost/wechatBot/letletme/admin/binding/qrcode", {
        method: "POST",
        headers: {
          authorization: "Bearer admin-secret"
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      qrcode: "qr-token",
      qrcodeUrl: "https://example.com/qr.png"
    });
  });

  test("rejects unauthorized admin callers when an admin API token is configured", async () => {
    const service: NotificationServicePort = {
      send: async () => {
        throw new Error("send should not be called");
      }
    };
    const app = createApp({
      notificationService: service,
      adminService,
      notificationApiToken: undefined,
      adminApiToken: "admin-secret"
    });

    const response = await app.handle(
      new Request("http://localhost/wechatBot/letletme/admin/state")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "unauthorized",
      message: "Missing or invalid bearer token."
    });
  });

  test("upserts a target alias through the admin API", async () => {
    const service: NotificationServicePort = {
      send: async () => {
        throw new Error("send should not be called");
      }
    };
    const app = createApp({
      notificationService: service,
      adminService,
      notificationApiToken: undefined,
      adminApiToken: undefined
    });

    const response = await app.handle(
      new Request("http://localhost/wechatBot/letletme/admin/targets", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          alias: "ops-group",
          userId: "ops-group@im.wechat",
          contextToken: "ops-ctx"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alias: "ops-group",
      userId: "ops-group@im.wechat",
      contextToken: "ops-ctx"
    });
  });
});
