import { describe, expect, test } from "bun:test";

import { NotificationService } from "../../src/application/services/notification-service.ts";
import type { ResolvedWechatTarget, WechatTargetRegistry } from "../../src/domain/target-registry.ts";
import type { WechatBridgeClient } from "../../src/integrations/wechat/wechat-bridge-client.ts";

describe("NotificationService", () => {
  test("sends text notifications through the message path", async () => {
    const calls: Array<{ kind: string; userId: string; contextToken: string; text?: string; imageUrl?: string; caption?: string | undefined }> = [];
    const client: WechatBridgeClient = {
      sendText: async ({ userId, contextToken, text }) => {
        calls.push({ kind: "text", userId, contextToken, text });
      },
      sendImage: async ({ userId, contextToken, imageUrl, caption }) => {
        calls.push({ kind: "image", userId, contextToken, imageUrl, caption });
      }
    };
    const registry: WechatTargetRegistry = {
      async resolveAliases(aliases: string[]) {
        return aliases.map((alias) => ({
          alias,
          userId: `${alias}@im.wechat`,
          contextToken: `${alias}-ctx`
        }));
      },
      async upsert() {
        throw new Error("not used");
      },
      async list() {
        return [];
      },
      async remove() {
        return false;
      }
    };

    const service = new NotificationService(client, registry);

    const result = await service.send({
      type: "text",
      targets: ["tong-private", "ops-group"],
      text: "deploy finished"
    });

    expect(result).toEqual({
      status: "success",
      notificationType: "text",
      requestedCount: 2,
      deliveredCount: 2,
      failedCount: 0,
      failures: []
    });
    expect(calls).toEqual([
      {
        kind: "text",
        userId: "tong-private@im.wechat",
        contextToken: "tong-private-ctx",
        text: "[letletme-wechat-bot] deploy finished"
      },
      {
        kind: "text",
        userId: "ops-group@im.wechat",
        contextToken: "ops-group-ctx",
        text: "[letletme-wechat-bot] deploy finished"
      }
    ]);
  });

  test("uses the configured default text target alias when none is provided", async () => {
    const calls: Array<{ userId: string; contextToken: string; text: string }> = [];
    const client: WechatBridgeClient = {
      sendText: async ({ userId, contextToken, text }) => {
        calls.push({ userId, contextToken, text });
      },
      sendImage: async () => {
        throw new Error("sendImage should not be called");
      }
    };
    const registry: WechatTargetRegistry = {
      async resolveAliases() {
        return [
          {
            alias: "deploy-alerts",
            userId: "group-1@im.wechat",
            contextToken: "group-1-ctx"
          }
        ];
      },
      async upsert() {
        throw new Error("not used");
      },
      async list() {
        return [];
      },
      async remove() {
        return false;
      }
    };

    const service = new NotificationService(client, registry, {
      defaultTextTargetAlias: "deploy-alerts"
    });

    const result = await service.send({
      type: "text",
      targets: [],
      text: "hello"
    });

    expect(result).toEqual({
      status: "success",
      notificationType: "text",
      requestedCount: 1,
      deliveredCount: 1,
      failedCount: 0,
      failures: []
    });
    expect(calls).toEqual([
      {
        userId: "group-1@im.wechat",
        contextToken: "group-1-ctx",
        text: "[letletme-wechat-bot] hello"
      }
    ]);
  });

  test("returns partial failure when one target delivery fails", async () => {
    const targets: ResolvedWechatTarget[] = [
      { alias: "ok", userId: "ok@im.wechat", contextToken: "ok-ctx" },
      { alias: "fail", userId: "fail@im.wechat", contextToken: "fail-ctx" }
    ];
    const client: WechatBridgeClient = {
      sendText: async ({ userId }) => {
        if (userId === "fail@im.wechat") {
          throw new Error("rebind required");
        }
      },
      sendImage: async () => {
        throw new Error("sendImage should not be called");
      }
    };
    const registry: WechatTargetRegistry = {
      async resolveAliases() {
        return targets;
      },
      async upsert() {
        throw new Error("not used");
      },
      async list() {
        return targets;
      },
      async remove() {
        return false;
      }
    };

    const service = new NotificationService(client, registry);

    const result = await service.send({
      type: "text",
      targets: ["ok", "fail"],
      text: "hello"
    });

    expect(result).toEqual({
      status: "partial_failure",
      notificationType: "text",
      requestedCount: 2,
      deliveredCount: 1,
      failedCount: 1,
      failures: [{ target: "fail", message: "rebind required" }]
    });
  });

  test("sends image notifications through the image path and preserves caption", async () => {
    const calls: Array<{ userId: string; contextToken: string; imageUrl: string; caption: string | undefined }> = [];
    const client: WechatBridgeClient = {
      sendText: async () => {
        throw new Error("sendText should not be called");
      },
      sendImage: async ({ userId, contextToken, imageUrl, caption }) => {
        calls.push({ userId, contextToken, imageUrl, caption });
      }
    };
    const registry: WechatTargetRegistry = {
      async resolveAliases() {
        return [
          {
            alias: "ops-group",
            userId: "ops-group@im.wechat",
            contextToken: "ops-group-ctx"
          }
        ];
      },
      async upsert() {
        throw new Error("not used");
      },
      async list() {
        return [];
      },
      async remove() {
        return false;
      }
    };

    const service = new NotificationService(client, registry);

    const result = await service.send({
      type: "image",
      targets: ["ops-group"],
      imageUrl: "https://example.com/chart.png",
      caption: "daily report"
    });

    expect(result.status).toBe("success");
    expect(calls).toEqual([
      {
        userId: "ops-group@im.wechat",
        contextToken: "ops-group-ctx",
        imageUrl: "https://example.com/chart.png",
        caption: "daily report"
      }
    ]);
  });
});
