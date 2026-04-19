import { describe, expect, mock, test } from "bun:test";

import { IlinkWechatBridgeClient, WechatDeliveryError } from "../../src/integrations/wechat/wechat-bridge-client.ts";

describe("IlinkWechatBridgeClient", () => {
  test("sends text notifications through raw sendmessage", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/sendmessage");
      expect(init?.method).toBe("POST");

      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.AuthorizationType).toBe("ilink_bot_token");
      expect(headers.Authorization).toBe("Bearer bot-token");
      expect(headers["iLink-App-Id"]).toBe("bot");
      expect(headers["iLink-App-ClientVersion"]).toBe("65536");
      expect(headers["X-WECHAT-UIN"]).toBeDefined();
      expect(Buffer.from(headers["X-WECHAT-UIN"]!, "base64").toString("utf8")).toMatch(/^\d+$/);

      const body = JSON.parse(String(init?.body));
      expect(body.base_info).toEqual({ channel_version: "1.0.0" });
      expect(body.msg.to_user_id).toBe("ops@im.wechat");
      expect(body.msg.context_token).toBe("ctx-123");
      expect(body.msg.message_type).toBe(2);
      expect(body.msg.message_state).toBe(2);
      expect(body.msg.item_list).toEqual([
        {
          type: 1,
          text_item: {
            text: "hello"
          }
        }
      ]);

      return new Response(JSON.stringify({ ret: 0 }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });

    const client = new IlinkWechatBridgeClient(
      {
        getCredentials: async () => ({
          token: "bot-token",
          accountId: "bot@im.bot",
          userId: "bot-user@im.wechat",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "2026-04-19T00:00:00.000Z"
        }),
        getContextToken: async () => "ctx-123"
      },
      {
        channelVersion: "1.0.0",
        fetcher: fetchMock
      }
    );

    await expect(
      client.sendText({
        userId: "ops@im.wechat",
        text: "hello"
      })
    ).resolves.toBeUndefined();
  });

  test("fails fast when no context token is available for a target", async () => {
    const client = new IlinkWechatBridgeClient(
      {
        getCredentials: async () => ({
          token: "bot-token",
          accountId: "bot@im.bot",
          userId: "bot-user@im.wechat",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "2026-04-19T00:00:00.000Z"
        }),
        getContextToken: async () => undefined
      },
      {
        channelVersion: "1.0.0"
      }
    );

    await expect(
      client.sendText({
        userId: "ops@im.wechat",
        text: "hello"
      })
    ).rejects.toEqual(new WechatDeliveryError("No context token is cached for this target."));
  });

  test("uploads remote images before sending them through raw sendmessage", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "https://example.com/chart.png") {
        expect(init?.method).toBeUndefined();
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: {
            "content-type": "image/png"
          }
        });
      }

      if (url === "https://ilinkai.weixin.qq.com/ilink/bot/getuploadurl") {
        const body = JSON.parse(String(init?.body));
        expect(body.base_info).toEqual({ channel_version: "1.0.0" });
        expect(body.media_type).toBe(1);
        expect(body.to_user_id).toBe("ops@im.wechat");

        return new Response(
          JSON.stringify({
            ret: 0,
            upload_full_url: "https://cdn.example.com/upload"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url === "https://cdn.example.com/upload") {
        expect(init?.method).toBe("POST");
        expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");

        return new Response(null, {
          status: 200,
          headers: {
            "x-encrypted-param": "encrypted-upload-param"
          }
        });
      }

      if (url === "https://ilinkai.weixin.qq.com/ilink/bot/sendmessage") {
        const body = JSON.parse(String(init?.body));
        expect(body.msg.item_list[0]).toEqual({
          type: 1,
          text_item: {
            text: "daily chart"
          }
        });
        expect(body.msg.item_list[1].type).toBe(2);
        expect(body.msg.item_list[1].image_item.media.encrypt_query_param).toBe("encrypted-upload-param");
        expect(body.msg.item_list[1].image_item.mid_size).toBeGreaterThan(0);

        return new Response(JSON.stringify({ ret: 0 }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const client = new IlinkWechatBridgeClient(
      {
        getCredentials: async () => ({
          token: "bot-token",
          accountId: "bot@im.bot",
          userId: "bot-user@im.wechat",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "2026-04-19T00:00:00.000Z"
        }),
        getContextToken: async () => "ctx-123"
      },
      {
        channelVersion: "1.0.0",
        fetcher: fetchMock
      }
    );

    await expect(
      client.sendImage({
        userId: "ops@im.wechat",
        imageUrl: "https://example.com/chart.png",
        caption: "daily chart"
      })
    ).resolves.toBeUndefined();
  });
});
