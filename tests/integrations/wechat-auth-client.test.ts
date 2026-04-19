import { afterEach, describe, expect, mock, test } from "bun:test";

import { ClawbotAuthClient, WechatBridgeAuthError } from "../../src/integrations/wechat/clawbot-auth-client.ts";

describe("ClawbotAuthClient", () => {
  afterEach(() => {
    mock.restore();
  });

  test("creates a qrcode binding request through the raw iLink endpoint", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toEqual({
        "iLink-App-Id": "bot",
        "iLink-App-ClientVersion": "65536"
      });

      return new Response(
        JSON.stringify({
          qrcode: "qr-token",
          qrcode_img_content: "https://example.com/qr.png"
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
      baseUrl: "https://ilinkai.weixin.qq.com",
      channelVersion: "1.0.0",
      fetcher: fetchMock
    });

    await expect(client.createQrCode()).resolves.toEqual({
      qrcode: "qr-token",
      qrcodeUrl: "https://example.com/qr.png"
    });
  });

  test("maps confirmed qrcode status into persisted credentials", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://redirect.ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=qr-token");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toEqual({
        "iLink-App-Id": "bot",
        "iLink-App-ClientVersion": "65536"
      });

      return new Response(
        JSON.stringify({
          status: "confirmed",
          bot_token: "bot-token",
          ilink_bot_id: "bot@im.bot",
          ilink_user_id: "user@im.wechat",
          baseurl: "https://sh.ilinkai.weixin.qq.com"
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
      baseUrl: "https://ilinkai.weixin.qq.com",
      channelVersion: "1.0.0",
      fetcher: fetchMock
    });

    const result = await client.pollQrStatus("qr-token", {
      baseUrl: "https://redirect.ilinkai.weixin.qq.com"
    });

    expect(result.status).toBe("confirmed");
    expect(result.credentials).toEqual({
      token: "bot-token",
      baseUrl: "https://sh.ilinkai.weixin.qq.com",
      accountId: "bot@im.bot",
      userId: "user@im.wechat",
      savedAt: expect.any(String)
    });
  });

  test("surfaces redirect polling hints without requiring OpenAPI headers", async () => {
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          status: "scaned_but_redirect",
          redirect_host: "sh.ilinkai.weixin.qq.com"
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
      baseUrl: "https://ilinkai.weixin.qq.com",
      channelVersion: "1.0.0",
      fetcher: fetchMock
    });

    await expect(client.pollQrStatus("qr-token")).resolves.toEqual({
      status: "scaned",
      redirectBaseUrl: "https://sh.ilinkai.weixin.qq.com"
    });
  });

  test("raises a typed error when the QR endpoint rejects a request", async () => {
    const fetchMock = mock(async () => {
      return new Response(JSON.stringify({ errmsg: "bad request", ret: 4001 }), {
        status: 400,
        headers: {
          "content-type": "application/json"
        }
      });
    });

    const client = new ClawbotAuthClient({
      baseUrl: "https://ilinkai.weixin.qq.com",
      channelVersion: "1.0.0",
      fetcher: fetchMock
    });

    await expect(client.createQrCode()).rejects.toEqual(
      new WechatBridgeAuthError("bad request", {
        statusCode: 400
      })
    );
  });
});
