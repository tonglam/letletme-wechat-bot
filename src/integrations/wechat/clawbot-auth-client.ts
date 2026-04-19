import { IlinkHttpClient, WechatApiError } from "./ilink-http-client.ts";
import { buildCommonHeaders, type Fetcher } from "./ilink-helpers.ts";
import type { PendingQrStatus, WechatCredentials } from "./wechat-types.ts";

type ClawbotAuthClientOptions = {
  baseUrl: string;
  channelVersion: string;
  skRouteTag?: string | undefined;
  fetcher?: Fetcher;
  now?: () => number;
};

type RawQrCodeResponse = {
  qrcode?: string;
  qrcode_img_content?: string;
  qrcode_url?: string;
};

type RawQrStatusResponse = {
  status?: PendingQrStatus | "scaned_but_redirect";
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  redirect_host?: string;
};

export type QrCodeResult = {
  qrcode: string;
  qrcodeUrl: string;
};

export type PollQrStatusResult = {
  status: PendingQrStatus;
  credentials?: WechatCredentials | undefined;
  redirectBaseUrl?: string | undefined;
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
  private readonly httpClient: IlinkHttpClient;
  private readonly now: () => number;

  constructor(private readonly options: ClawbotAuthClientOptions) {
    this.httpClient = new IlinkHttpClient(options.fetcher ? {
      fetcher: options.fetcher
    } : {});
    this.now = options.now ?? Date.now;
  }

  async createQrCode(): Promise<QrCodeResult> {
    try {
      const body = await this.httpClient.get<RawQrCodeResponse>(
        this.options.baseUrl,
        "/ilink/bot/get_bot_qrcode?bot_type=3",
        {
          headers: buildCommonHeaders(this.options.channelVersion, this.options.skRouteTag)
        }
      );

      const qrcode = body.qrcode;
      const qrcodeUrl = body.qrcode_img_content ?? body.qrcode_url;

      if (!qrcode || !qrcodeUrl) {
        throw new WechatBridgeAuthError("QR code response is missing required fields.", {
          statusCode: 502
        });
      }

      return {
        qrcode,
        qrcodeUrl
      };
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async pollQrStatus(
    qrcode: string,
    options: { baseUrl?: string | undefined } = {}
  ): Promise<PollQrStatusResult> {
    try {
      const body = await this.httpClient.get<RawQrStatusResponse>(
        options.baseUrl ?? this.options.baseUrl,
        `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
        {
          headers: buildCommonHeaders(this.options.channelVersion, this.options.skRouteTag)
        }
      );

      const status = body.status;
      if (!status) {
        throw new WechatBridgeAuthError("QR status response is missing the status field.", {
          statusCode: 502
        });
      }

      if (status === "scaned_but_redirect") {
        return {
          status: "scaned",
          redirectBaseUrl: body.redirect_host ? `https://${body.redirect_host}` : undefined
        };
      }

      if (status !== "confirmed") {
        return { status };
      }

      if (!body.bot_token || !body.ilink_bot_id || !body.ilink_user_id) {
        throw new WechatBridgeAuthError("Confirmed QR status response is missing credentials.", {
          statusCode: 502
        });
      }

      return {
        status,
        credentials: {
          token: body.bot_token,
          accountId: body.ilink_bot_id,
          userId: body.ilink_user_id,
          baseUrl: body.baseurl ?? this.options.baseUrl,
          savedAt: new Date(this.now()).toISOString()
        }
      };
    } catch (error) {
      throw mapAuthError(error);
    }
  }
}

function mapAuthError(error: unknown) {
  if (error instanceof WechatBridgeAuthError) {
    return error;
  }

  if (error instanceof WechatApiError) {
    return new WechatBridgeAuthError(error.message, {
      statusCode: error.statusCode
    });
  }

  if (error instanceof Error) {
    return new WechatBridgeAuthError(error.message, {
      statusCode: 500
    });
  }

  return new WechatBridgeAuthError("Unknown WeChat bootstrap error.", {
    statusCode: 500
  });
}
