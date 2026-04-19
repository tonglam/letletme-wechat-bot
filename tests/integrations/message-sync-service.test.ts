import { describe, expect, mock, test } from "bun:test";

import { WechatMessageSyncService } from "../../src/integrations/wechat/message-sync-service.ts";

describe("WechatMessageSyncService", () => {
  test("persists the cursor and caches context tokens from inbound user messages", async () => {
    const rememberCalls: Array<{ userId: string; contextToken: string }> = [];
    let storedCursor = "";

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/getupdates");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        get_updates_buf: "",
        base_info: {
          channel_version: "1.0.0"
        }
      });

      return new Response(
        JSON.stringify({
          ret: 0,
          get_updates_buf: "cursor-1",
          msgs: [
            {
              from_user_id: "ops@im.wechat",
              to_user_id: "bot@im.bot",
              client_id: "client-1",
              create_time_ms: 1713499200000,
              message_type: 1,
              message_state: 2,
              context_token: "ctx-123",
              item_list: []
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const service = new WechatMessageSyncService(
      {
        getCredentials: async () => ({
          token: "bot-token",
          accountId: "bot@im.bot",
          userId: "bot-user@im.wechat",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "2026-04-19T00:00:00.000Z"
        }),
        getCursor: async () => storedCursor,
        setCursor: async (cursor: string) => {
          storedCursor = cursor;
        },
        rememberContextToken: async (userId: string, contextToken: string) => {
          rememberCalls.push({ userId, contextToken });
        }
      },
      {
        channelVersion: "1.0.0",
        fetcher: fetchMock
      }
    );

    await service.syncOnce();

    expect(storedCursor).toBe("cursor-1");
    expect(rememberCalls).toEqual([{ userId: "ops@im.wechat", contextToken: "ctx-123" }]);
  });
});
