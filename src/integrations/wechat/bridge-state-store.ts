import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { StoredWechatTarget, WechatTargetRegistry } from "../../domain/target-registry.ts";
import type { WechatCredentials } from "./wechat-types.ts";

export type PendingQr = {
  qrcode: string;
  qrcodeUrl: string;
  createdAt: string;
  pollBaseUrl?: string | undefined;
};

type BridgeState = {
  version: 2;
  credentials?: WechatCredentials | undefined;
  contextTokens: Record<string, string>;
  cursor: string;
  pendingQr?: PendingQr | undefined;
  targets: Record<string, StoredWechatTarget>;
};

const EMPTY_STATE: BridgeState = {
  version: 2,
  contextTokens: {},
  cursor: "",
  targets: {}
};

export class WechatBridgeStateStore implements WechatTargetRegistry {
  constructor(private readonly stateFilePath: string) {}

  async getCredentials(): Promise<WechatCredentials | undefined> {
    const state = await this.loadState();
    return state.credentials;
  }

  async setCredentials(credentials: WechatCredentials): Promise<void> {
    const state = await this.loadState();
    state.credentials = credentials;
    await this.saveState(state);
  }

  async clearCredentials(): Promise<void> {
    const state = await this.loadState();
    state.credentials = undefined;
    await this.saveState(state);
  }

  async getContextTokens(): Promise<Record<string, string>> {
    const state = await this.loadState();
    return state.contextTokens;
  }

  async getContextToken(userId: string): Promise<string | undefined> {
    const state = await this.loadState();
    return state.contextTokens[userId];
  }

  async rememberContextToken(userId: string, contextToken: string): Promise<void> {
    const state = await this.loadState();
    state.contextTokens[userId] = contextToken;

    for (const target of Object.values(state.targets)) {
      if (target.userId === userId) {
        target.contextToken = contextToken;
        target.updatedAt = new Date().toISOString();
      }
    }

    await this.saveState(state);
  }

  async clearContextTokens(): Promise<void> {
    const state = await this.loadState();
    state.contextTokens = {};
    for (const target of Object.values(state.targets)) {
      target.contextToken = undefined;
      target.updatedAt = new Date().toISOString();
    }
    await this.saveState(state);
  }

  async getCursor(): Promise<string> {
    const state = await this.loadState();
    return state.cursor;
  }

  async setCursor(cursor: string): Promise<void> {
    const state = await this.loadState();
    state.cursor = cursor;
    await this.saveState(state);
  }

  async clearCursor(): Promise<void> {
    const state = await this.loadState();
    state.cursor = "";
    await this.saveState(state);
  }

  async getPendingQr(): Promise<PendingQr | undefined> {
    const state = await this.loadState();
    return state.pendingQr;
  }

  async setPendingQr(pendingQr: PendingQr): Promise<void> {
    const state = await this.loadState();
    state.pendingQr = pendingQr;
    await this.saveState(state);
  }

  async clearPendingQr(): Promise<void> {
    const state = await this.loadState();
    state.pendingQr = undefined;
    await this.saveState(state);
  }

  async clearBindingState(): Promise<void> {
    const state = await this.loadState();
    state.credentials = undefined;
    state.pendingQr = undefined;
    state.contextTokens = {};
    state.cursor = "";

    for (const target of Object.values(state.targets)) {
      target.contextToken = undefined;
      target.updatedAt = new Date().toISOString();
    }

    await this.saveState(state);
  }

  async resolveAliases(aliases: string[]): Promise<StoredWechatTarget[]> {
    const state = await this.loadState();

    return aliases.map((alias) => {
      const target = state.targets[alias];
      if (!target) {
        throw new Error(`Unknown target alias: ${alias}`);
      }

      return {
        ...target,
        contextToken: target.contextToken ?? state.contextTokens[target.userId]
      };
    });
  }

  async upsert(target: StoredWechatTarget): Promise<StoredWechatTarget> {
    const state = await this.loadState();
    const existing = state.targets[target.alias];
    const contextToken = target.contextToken ?? existing?.contextToken ?? state.contextTokens[target.userId];
    const storedTarget: StoredWechatTarget = {
      alias: target.alias,
      userId: target.userId,
      contextToken,
      updatedAt: new Date().toISOString()
    };

    state.targets[target.alias] = storedTarget;
    if (contextToken) {
      state.contextTokens[target.userId] = contextToken;
    }
    await this.saveState(state);

    return storedTarget;
  }

  async list(): Promise<StoredWechatTarget[]> {
    const state = await this.loadState();
    return Object.values(state.targets)
      .map((target) => ({
        ...target,
        contextToken: target.contextToken ?? state.contextTokens[target.userId]
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias));
  }

  async remove(alias: string): Promise<boolean> {
    const state = await this.loadState();
    const target = state.targets[alias];
    if (!target) {
      return false;
    }

    delete state.targets[alias];
    await this.saveState(state);
    return true;
  }

  private async loadState(): Promise<BridgeState> {
    try {
      const raw = await readFile(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BridgeState>;
      return {
        version: 2,
        contextTokens: parsed.contextTokens ?? {},
        cursor: parsed.cursor ?? "",
        targets: parsed.targets ?? {},
        credentials: parsed.credentials,
        pendingQr: parsed.pendingQr
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_STATE);
      }

      throw error;
    }
  }

  private async saveState(state: BridgeState): Promise<void> {
    await mkdir(dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
  }
}
