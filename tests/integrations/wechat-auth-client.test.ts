import { afterEach, describe, expect, mock, test } from "bun:test";

import { ClawbotAuthClient, WechatBridgeAuthError } from "../../src/integrations/wechat/clawbot-auth-client.ts";

describe("ClawbotAuthClient", () => {
  afterEach(() => {
    mock.restore();
  });

  test("creates a qrcode binding request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://weknora.weixin.qq.com/api/v1/wechat/qrcode");
      expect(init?.method).toBe("POST");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            qrcode: "qr-token",
            qrcode_url: "https://example.com/qr.png"
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const client = new ClawbotAuthClient({
      baseUrl: "https://weknora.weixin.qq.com",
      fetcher: fetchMock
    });

    await expect(client.createQrCode()).resolves.toEqual({
      qrcode: "qr-token",
      qrcodeUrl: "https://example.com/qr.png"
    });
  });

  test("maps confirmed qrcode status into persisted credentials", async () => {
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status: "confirmed",
            credentials: {
              bot_token: "bot-token",
              ilink_bot_id: "bot@im.bot",
              ilink_user_id: "user@im.wechat"
            },
            baseurl: "https://ilinkai.weixin.qq.com"
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    });

    const client = new ClawbotAuthClient({
      baseUrl: "https://weknora.weixin.qq.com",
      fetcher: fetchMock
    });

    const result = await client.pollQrStatus("qr-token");

    expect(result.status).toBe("confirmed");
    expect(result.credentials).toEqual({
      token: "bot-token",
      baseUrl: "https://ilinkai.weixin.qq.com",
      accountId: "bot@im.bot",
      userId: "user@im.wechat",
      savedAt: expect.any(String)
    });
  });

  test("resets the channel with bearer auth", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://weknora.weixin.qq.com/api/v1/wechat/channel_reset");
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        authorization: "Bearer bot-token"
      });
      expect(init?.body).toBe(JSON.stringify({ channel_id: "bot@im.bot" }));

      return new Response(JSON.stringify({ data: { channel_id: "bot@im.bot" } }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });

    const client = new ClawbotAuthClient({
      baseUrl: "https://weknora.weixin.qq.com",
      fetcher: fetchMock
    });

    await expect(client.resetChannel({ botToken: "bot-token", channelId: "bot@im.bot" })).resolves.toEqual({
      channelId: "bot@im.bot"
    });
  });

  test("raises a typed error when the bootstrap API rejects a request", async () => {
    const fetchMock = mock(async () => {
      return new Response(JSON.stringify({ success: false, message: "bad request" }), {
        status: 400,
        headers: {
          "content-type": "application/json"
        }
      });
    });

    const client = new ClawbotAuthClient({
      baseUrl: "https://weknora.weixin.qq.com",
      fetcher: fetchMock
    });

    await expect(client.createQrCode()).rejects.toEqual(
      new WechatBridgeAuthError("bad request", {
        statusCode: 400
      })
    );
  });
});
