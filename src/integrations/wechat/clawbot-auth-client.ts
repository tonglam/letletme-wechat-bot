import type { Credentials } from "@wechatbot/wechatbot";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ClawbotAuthClientOptions = {
  baseUrl: string;
  fetcher?: Fetcher;
};

type QrcodeApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    qrcode?: string;
    qrcode_url?: string;
  };
};

type QrcodeStatusApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    status?: "wait" | "scaned" | "confirmed" | "expired";
    credentials?: {
      bot_token?: string;
      ilink_bot_id?: string;
      ilink_user_id?: string;
    } | null;
    baseurl?: string;
  };
};

type ResetChannelApiResponse = {
  message?: string;
  data?: {
    channel_id?: string;
  };
};

export type QrCodeResult = {
  qrcode: string;
  qrcodeUrl: string;
};

export type PollQrStatusResult = {
  status: "wait" | "scaned" | "confirmed" | "expired";
  credentials?: Credentials | undefined;
};

export class WechatBridgeAuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, options: { statusCode: number }) {
    super(message);
    this.name = "WechatBridgeAuthError";
    this.statusCode = options.statusCode;
  }
}

export class ClawbotAuthClient {
  private readonly fetcher: Fetcher;

  constructor(private readonly options: ClawbotAuthClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async createQrCode(): Promise<QrCodeResult> {
    const body = await this.call<QrcodeApiResponse>("/api/v1/wechat/qrcode", {
      method: "POST"
    });

    const qrcode = body.data?.qrcode;
    const qrcodeUrl = body.data?.qrcode_url;

    if (!qrcode || !qrcodeUrl) {
      throw new WechatBridgeAuthError("QR code response is missing required fields.", {
        statusCode: 502
      });
    }

    return {
      qrcode,
      qrcodeUrl
    };
  }

  async pollQrStatus(qrcode: string): Promise<PollQrStatusResult> {
    const body = await this.call<QrcodeStatusApiResponse>("/api/v1/wechat/qrcode/status", {
      method: "POST",
      body: JSON.stringify({ qrcode })
    });

    const status = body.data?.status;
    if (!status) {
      throw new WechatBridgeAuthError("QR status response is missing the status field.", {
        statusCode: 502
      });
    }

    if (status !== "confirmed") {
      return { status };
    }

    const credentials = body.data?.credentials;
    const baseUrl = body.data?.baseurl;
    if (!credentials?.bot_token || !credentials.ilink_bot_id || !credentials.ilink_user_id || !baseUrl) {
      throw new WechatBridgeAuthError("Confirmed QR status response is missing credentials.", {
        statusCode: 502
      });
    }

    return {
      status,
      credentials: {
        token: credentials.bot_token,
        accountId: credentials.ilink_bot_id,
        userId: credentials.ilink_user_id,
        baseUrl,
        savedAt: new Date().toISOString()
      }
    };
  }

  async resetChannel(input: { botToken: string; channelId: string }): Promise<{ channelId: string }> {
    const body = await this.call<ResetChannelApiResponse>("/api/v1/wechat/channel_reset", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.botToken}`
      },
      body: JSON.stringify({ channel_id: input.channelId })
    });

    return {
      channelId: body.data?.channel_id ?? input.channelId
    };
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });
    const body = (await parseJsonSafely(response)) as T & { success?: boolean; message?: string };

    if (!response.ok || body?.success === false) {
      throw new WechatBridgeAuthError(body?.message ?? "WeChat bootstrap request failed.", {
        statusCode: response.status
      });
    }

    return body;
  }
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return response.json();
}
