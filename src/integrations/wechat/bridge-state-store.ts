import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Credentials } from "@wechatbot/wechatbot";

import type { StoredWechatTarget, WechatTargetRegistry } from "../../domain/target-registry.ts";

export type PendingQr = {
  qrcode: string;
  qrcodeUrl: string;
  createdAt: string;
};

type BridgeState = {
  version: 1;
  credentials?: Credentials | undefined;
  contextTokens: Record<string, string>;
  pendingQr?: PendingQr | undefined;
  targets: Record<string, StoredWechatTarget>;
};

const EMPTY_STATE: BridgeState = {
  version: 1,
  contextTokens: {},
  targets: {}
};

export class WechatBridgeStateStore implements WechatTargetRegistry {
  constructor(private readonly stateFilePath: string) {}

  async getCredentials(): Promise<Credentials | undefined> {
    const state = await this.loadState();
    return state.credentials;
  }

  async setCredentials(credentials: Credentials): Promise<void> {
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

  async setContextToken(userId: string, contextToken: string): Promise<void> {
    const state = await this.loadState();
    state.contextTokens[userId] = contextToken;
    await this.saveState(state);
  }

  async replaceContextTokens(tokens: Record<string, string>): Promise<void> {
    const state = await this.loadState();
    state.contextTokens = tokens;
    await this.saveState(state);
  }

  async clearContextTokens(): Promise<void> {
    const state = await this.loadState();
    state.contextTokens = {};
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
    await this.saveState(state);
  }

  async resolveAliases(aliases: string[]): Promise<StoredWechatTarget[]> {
    const state = await this.loadState();

    return aliases.map((alias) => {
      const target = state.targets[alias];
      if (!target) {
        throw new Error(`Unknown target alias: ${alias}`);
      }

      return target;
    });
  }

  async upsert(target: StoredWechatTarget): Promise<StoredWechatTarget> {
    const state = await this.loadState();
    const storedTarget = {
      ...target,
      updatedAt: new Date().toISOString()
    };

    state.targets[target.alias] = storedTarget;
    state.contextTokens[target.userId] = target.contextToken;
    await this.saveState(state);

    return storedTarget;
  }

  async list(): Promise<StoredWechatTarget[]> {
    const state = await this.loadState();
    return Object.values(state.targets).sort((left, right) => left.alias.localeCompare(right.alias));
  }

  async remove(alias: string): Promise<boolean> {
    const state = await this.loadState();
    const target = state.targets[alias];
    if (!target) {
      return false;
    }

    delete state.targets[alias];
    delete state.contextTokens[target.userId];
    await this.saveState(state);
    return true;
  }

  private async loadState(): Promise<BridgeState> {
    try {
      const raw = await readFile(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BridgeState>;
      return {
        version: 1,
        contextTokens: parsed.contextTokens ?? {},
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
