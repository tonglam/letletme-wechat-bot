import { setTimeout as delay } from "node:timers/promises";

import { IlinkHttpClient } from "./ilink-http-client.ts";
import { buildAuthHeaders, buildBaseInfo, type Fetcher } from "./ilink-helpers.ts";
import { USER_MESSAGE_TYPE, type WechatCredentials, type WireMessage } from "./wechat-types.ts";

type SyncStateStore = {
  getCredentials(): Promise<WechatCredentials | undefined>;
  getCursor(): Promise<string>;
  setCursor(cursor: string): Promise<void>;
  rememberContextToken(userId: string, contextToken: string): Promise<void>;
};

type WechatMessageSyncServiceOptions = {
  channelVersion: string;
  skRouteTag?: string | undefined;
  fetcher?: Fetcher;
  backoffMs?: number;
};

type GetUpdatesResponse = {
  get_updates_buf?: string;
  msgs?: WireMessage[];
};

export class WechatMessageSyncService {
  private readonly httpClient: IlinkHttpClient;
  private readonly backoffMs: number;
  private running = false;
  private abortController: AbortController | undefined;

  constructor(
    private readonly stateStore: SyncStateStore,
    private readonly options: WechatMessageSyncServiceOptions
  ) {
    this.httpClient = new IlinkHttpClient(options.fetcher ? {
      fetcher: options.fetcher
    } : {});
    this.backoffMs = options.backoffMs ?? 1_000;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop();
  }

  stop() {
    this.running = false;
    this.abortController?.abort();
    this.abortController = undefined;
  }

  async syncOnce(signal?: AbortSignal) {
    const credentials = await this.stateStore.getCredentials();
    if (!credentials) {
      return;
    }

    const cursor = await this.stateStore.getCursor();
    const updates = await this.httpClient.post<GetUpdatesResponse>(
      credentials.baseUrl,
      "/ilink/bot/getupdates",
      {
        get_updates_buf: cursor,
        base_info: buildBaseInfo(this.options.channelVersion)
      },
      {
        headers: buildAuthHeaders(credentials.token, this.options.channelVersion, this.options.skRouteTag),
        timeoutMs: 40_000,
        ...(signal ? { signal } : {})
      }
    );

    if (typeof updates.get_updates_buf === "string") {
      await this.stateStore.setCursor(updates.get_updates_buf);
    }

    for (const message of updates.msgs ?? []) {
      if (message.message_type === USER_MESSAGE_TYPE && message.from_user_id && message.context_token) {
        await this.stateStore.rememberContextToken(message.from_user_id, message.context_token);
      }
    }
  }

  private async runLoop() {
    let retryDelayMs = this.backoffMs;

    while (this.running) {
      try {
        this.abortController = new AbortController();
        await this.syncOnce(this.abortController.signal);
        retryDelayMs = this.backoffMs;
      } catch (error) {
        if (!this.running || isAbortLikeError(error)) {
          break;
        }

        console.error("[letletme-wechat-bot] message sync failed:", error instanceof Error ? error.message : String(error));
        await delay(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, 10_000);
      } finally {
        this.abortController = undefined;
      }
    }
  }
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
