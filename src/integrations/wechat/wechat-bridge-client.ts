import { AuthError, NoContextError, WeChatBot, type Storage } from "@wechatbot/wechatbot";

export type SendWechatTextInput = {
  userId: string;
  contextToken: string;
  text: string;
};

export type SendWechatImageInput = {
  userId: string;
  contextToken: string;
  imageUrl: string;
  caption?: string | undefined;
};

export interface WechatBridgeClient {
  sendText(input: SendWechatTextInput): Promise<void>;
  sendImage(input: SendWechatImageInput): Promise<void>;
}

export class WechatDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WechatDeliveryError";
  }
}

export class SdkWechatBridgeClient implements WechatBridgeClient {
  constructor(private readonly storage: Storage) {}

  async sendText(input: SendWechatTextInput): Promise<void> {
    await this.send(input.userId, input.contextToken, { text: input.text });
  }

  async sendImage(input: SendWechatImageInput): Promise<void> {
    const content =
      input.caption === undefined
        ? { url: input.imageUrl }
        : { url: input.imageUrl, caption: input.caption };

    await this.send(input.userId, input.contextToken, content);
  }

  private async send(
    userId: string,
    contextToken: string,
    content: Parameters<WeChatBot["send"]>[1]
  ): Promise<void> {
    const credentials = await this.storage.get("credentials");
    if (!credentials) {
      throw new WechatDeliveryError("WeChat binding is not configured. Rebind required.");
    }

    const contextTokens = (await this.storage.get<Record<string, string>>("context_tokens")) ?? {};
    await this.storage.set("context_tokens", {
      ...contextTokens,
      [userId]: contextToken
    });

    const bot = new WeChatBot({
      storage: this.storage,
      logLevel: "silent"
    });

    try {
      await bot.login();
      await bot.send(userId, content);
    } catch (error) {
      throw mapWechatError(error);
    }
  }
}

function mapWechatError(error: unknown): Error {
  if (error instanceof NoContextError) {
    return new WechatDeliveryError("No context token is cached for this target.");
  }

  if (error instanceof AuthError) {
    return new WechatDeliveryError("WeChat session is invalid. Rebind required.");
  }

  if (error instanceof Error) {
    return new WechatDeliveryError(error.message);
  }

  return new WechatDeliveryError("Unknown WeChat delivery failure.");
}
