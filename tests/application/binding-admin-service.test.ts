import { describe, expect, test } from "bun:test";

import { BindingAdminService } from "../../src/application/services/binding-admin-service.ts";

describe("BindingAdminService", () => {
  test("includes session health for confirmed bindings when the sync service can probe it", async () => {
    const service = new BindingAdminService(
      {
        createQrCode: async () => {
          throw new Error("not used");
        },
        pollQrStatus: async () => {
          throw new Error("not used");
        }
      } as never,
      {
        getCredentials: async () => ({
          token: "bot-token",
          accountId: "bot@im.bot",
          userId: "user@im.wechat",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "2026-04-19T00:00:00.000Z"
        }),
        getPendingQr: async () => undefined,
        list: async () => [],
        upsert: async () => {
          throw new Error("not used");
        },
        remove: async () => false,
        clearBindingState: async () => undefined,
        setPendingQr: async () => undefined,
        clearPendingQr: async () => undefined,
        setCredentials: async () => undefined
      } as never,
      {
        start() {},
        stop() {},
        probeSession: async () => ({
          status: "valid",
          checkedAt: "2026-04-19T01:00:00.000Z"
        })
      }
    );

    await expect(service.getState()).resolves.toEqual({
      binding: {
        status: "confirmed",
        accountId: "bot@im.bot",
        userId: "user@im.wechat",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "2026-04-19T00:00:00.000Z",
        session: {
          status: "valid",
          checkedAt: "2026-04-19T01:00:00.000Z"
        }
      },
      targets: []
    });
  });
});
