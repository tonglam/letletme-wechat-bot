import type { Storage } from "@wechatbot/wechatbot";

import { WechatBridgeStateStore } from "./bridge-state-store.ts";

export class WechatStateStorageAdapter implements Storage {
  constructor(private readonly stateStore: WechatBridgeStateStore) {}

  async get<T>(key: string): Promise<T | undefined> {
    switch (key) {
      case "credentials":
        return (await this.stateStore.getCredentials()) as T | undefined;
      case "context_tokens":
        return (await this.stateStore.getContextTokens()) as T;
      default:
        return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    switch (key) {
      case "credentials":
        await this.stateStore.setCredentials(value as never);
        return;
      case "context_tokens":
        await this.stateStore.replaceContextTokens((value as Record<string, string>) ?? {});
        return;
      default:
        return;
    }
  }

  async delete(key: string): Promise<void> {
    switch (key) {
      case "credentials":
        await this.stateStore.clearCredentials();
        return;
      case "context_tokens":
        await this.stateStore.clearContextTokens();
        return;
      default:
        return;
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    if (value === undefined) {
      return false;
    }

    if (typeof value === "object" && value !== null) {
      return Object.keys(value).length > 0;
    }

    return true;
  }

  async clear(): Promise<void> {
    await this.stateStore.clearBindingState();
  }
}
