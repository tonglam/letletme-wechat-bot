import { createHash, randomBytes, randomUUID } from "node:crypto";

import { IlinkHttpClient, WechatApiError } from "./ilink-http-client.ts";
import {
  DEFAULT_CDN_BASE_URL,
  buildAuthHeaders,
  buildBaseInfo,
  encodeAesKeyBase64,
  encodeAesKeyHex,
  encryptAesEcb,
  generateAesKey,
  type Fetcher
} from "./ilink-helpers.ts";
import type { WechatCredentials } from "./wechat-types.ts";
import {
  BOT_MESSAGE_TYPE,
  IMAGE_MEDIA_TYPE,
  MESSAGE_STATE_FINISH,
  type CdnMedia,
  type WireImageItem,
  type WireMessageItem
} from "./wechat-types.ts";

export type SendWechatTextInput = {
  userId: string;
  contextToken?: string | undefined;
  text: string;
};

export type SendWechatImageInput = {
  userId: string;
  contextToken?: string | undefined;
  imageUrl: string;
  caption?: string | undefined;
};

export interface WechatBridgeClient {
  sendText(input: SendWechatTextInput): Promise<void>;
  sendImage(input: SendWechatImageInput): Promise<void>;
}

type CredentialStore = {
  getCredentials(): Promise<WechatCredentials | undefined>;
  getContextToken(userId: string): Promise<string | undefined>;
};

type GetUploadUrlResponse = {
  upload_param?: string;
  upload_full_url?: string;
};

type IlinkWechatBridgeClientOptions = {
  channelVersion: string;
  skRouteTag?: string | undefined;
  fetcher?: Fetcher;
  cdnBaseUrl?: string;
};

export class WechatDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatDeliveryError";
  }
}

export class IlinkWechatBridgeClient implements WechatBridgeClient {
  private readonly httpClient: IlinkHttpClient;
  private readonly fetcher: Fetcher;
  private readonly cdnBaseUrl: string;

  constructor(
    private readonly credentialsStore: CredentialStore,
    private readonly options: IlinkWechatBridgeClientOptions
  ) {
    this.httpClient = new IlinkHttpClient(options.fetcher ? {
      fetcher: options.fetcher
    } : {});
    this.fetcher = options.fetcher ?? fetch;
    this.cdnBaseUrl = options.cdnBaseUrl ?? DEFAULT_CDN_BASE_URL;
  }

  async sendText(input: SendWechatTextInput): Promise<void> {
    const credentials = await this.requireCredentials();
    const contextToken = await this.requireContextToken(input.userId, input.contextToken);

    try {
      await this.httpClient.post(
        credentials.baseUrl,
        "/ilink/bot/sendmessage",
        {
          msg: this.buildMessage(input.userId, contextToken, [
            {
              type: 1,
              text_item: {
                text: input.text
              }
            }
          ]),
          base_info: buildBaseInfo(this.options.channelVersion)
        },
        {
          headers: buildAuthHeaders(credentials.token, this.options.channelVersion, this.options.skRouteTag)
        }
      );
    } catch (error) {
      throw mapDeliveryError(error);
    }
  }

  async sendImage(input: SendWechatImageInput): Promise<void> {
    const credentials = await this.requireCredentials();
    const contextToken = await this.requireContextToken(input.userId, input.contextToken);

    try {
      const imageBuffer = await this.downloadRemoteFile(input.imageUrl);
      const uploaded = await this.uploadImage(credentials, input.userId, imageBuffer);
      const items: WireMessageItem[] = [];

      if (input.caption) {
        items.push({
          type: 1,
          text_item: {
            text: input.caption
          }
        });
      }

      items.push({
        type: 2,
        image_item: {
          media: uploaded.media,
          mid_size: uploaded.encryptedFileSize
        }
      } satisfies WireImageItem);

      await this.httpClient.post(
        credentials.baseUrl,
        "/ilink/bot/sendmessage",
        {
          msg: this.buildMessage(input.userId, contextToken, items),
          base_info: buildBaseInfo(this.options.channelVersion)
        },
        {
          headers: buildAuthHeaders(credentials.token, this.options.channelVersion, this.options.skRouteTag)
        }
      );
    } catch (error) {
      throw mapDeliveryError(error);
    }
  }

  private async requireCredentials() {
    const credentials = await this.credentialsStore.getCredentials();
    if (!credentials) {
      throw new WechatDeliveryError("WeChat binding is not configured. Rebind required.");
    }

    return credentials;
  }

  private async requireContextToken(userId: string, explicitToken?: string | undefined) {
    const contextToken = explicitToken ?? (await this.credentialsStore.getContextToken(userId));
    if (!contextToken) {
      throw new WechatDeliveryError("No context token is cached for this target.");
    }

    return contextToken;
  }

  private buildMessage(userId: string, contextToken: string, items: WireMessageItem[]) {
    return {
      from_user_id: "",
      to_user_id: userId,
      client_id: randomUUID(),
      message_type: BOT_MESSAGE_TYPE,
      message_state: MESSAGE_STATE_FINISH,
      context_token: contextToken,
      item_list: items
    };
  }

  private async downloadRemoteFile(url: string) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new WechatDeliveryError("Only http and https image URLs are supported.");
    }

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new WechatDeliveryError(`Remote media download failed: HTTP ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async uploadImage(credentials: WechatCredentials, userId: string, data: Buffer) {
    const aesKey = generateAesKey();
    const ciphertext = encryptAesEcb(data, aesKey);
    const filekey = randomBytes(16).toString("hex");
    const rawMd5 = createHash("md5").update(data).digest("hex");

    const uploadParams = await this.httpClient.post<GetUploadUrlResponse>(
      credentials.baseUrl,
      "/ilink/bot/getuploadurl",
      {
        filekey,
        media_type: IMAGE_MEDIA_TYPE,
        to_user_id: userId,
        rawsize: data.length,
        rawfilemd5: rawMd5,
        filesize: ciphertext.length,
        no_need_thumb: true,
        aeskey: encodeAesKeyHex(aesKey),
        base_info: buildBaseInfo(this.options.channelVersion)
      },
      {
        headers: buildAuthHeaders(credentials.token, this.options.channelVersion, this.options.skRouteTag)
      }
    );

    const uploadUrl = uploadParams.upload_full_url?.trim()
      || (uploadParams.upload_param
        ? `${this.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParams.upload_param)}&filekey=${encodeURIComponent(filekey)}`
        : undefined);

    if (!uploadUrl) {
      throw new WechatDeliveryError("getuploadurl returned no upload URL.");
    }

    const response = await this.fetcher(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream"
      },
      body: new Uint8Array(ciphertext),
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      throw new WechatDeliveryError(`CDN upload failed with HTTP ${response.status}.`);
    }

    const encryptQueryParam = response.headers.get("x-encrypted-param");
    if (!encryptQueryParam) {
      throw new WechatDeliveryError("CDN upload response is missing x-encrypted-param.");
    }

    return {
      media: {
        encrypt_query_param: encryptQueryParam,
        aes_key: encodeAesKeyBase64(aesKey),
        encrypt_type: 1
      } satisfies CdnMedia,
      encryptedFileSize: ciphertext.length
    };
  }
}

function mapDeliveryError(error: unknown) {
  if (error instanceof WechatDeliveryError) {
    return error;
  }

  if (error instanceof WechatApiError) {
    return new WechatDeliveryError(error.message);
  }

  if (error instanceof Error) {
    return new WechatDeliveryError(error.message);
  }

  return new WechatDeliveryError("Unknown WeChat delivery failure.");
}
