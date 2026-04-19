import type { Credentials } from "@wechatbot/wechatbot";

import type { StoredWechatTarget } from "../../domain/target-registry.ts";
import type { ClawbotAuthClient, PollQrStatusResult, QrCodeResult } from "../../integrations/wechat/clawbot-auth-client.ts";
import type { WechatBridgeStateStore } from "../../integrations/wechat/bridge-state-store.ts";

export type BindingSummary = {
  status: "unbound" | "pending" | "confirmed";
  accountId?: string | undefined;
  userId?: string | undefined;
  baseUrl?: string | undefined;
  savedAt?: string | undefined;
  pendingQrcode?: string | undefined;
  pendingQrcodeUrl?: string | undefined;
};

export type AdminState = {
  binding: BindingSummary;
  targets: StoredWechatTarget[];
};

export interface BindingAdminServicePort {
  createQrCode(): Promise<QrCodeResult>;
  pollQrStatus(): Promise<PollQrStatusResult>;
  getState(): Promise<AdminState>;
  upsertTarget(target: StoredWechatTarget): Promise<StoredWechatTarget>;
  removeTarget(alias: string): Promise<{ removed: boolean }>;
  resetBinding(): Promise<{ cleared: boolean }>;
}

export class BindingAdminService implements BindingAdminServicePort {
  constructor(
    private readonly authClient: ClawbotAuthClient,
    private readonly stateStore: WechatBridgeStateStore
  ) {}

  async createQrCode(): Promise<QrCodeResult> {
    const qrcode = await this.authClient.createQrCode();
    await this.stateStore.setPendingQr({
      qrcode: qrcode.qrcode,
      qrcodeUrl: qrcode.qrcodeUrl,
      createdAt: new Date().toISOString()
    });
    return qrcode;
  }

  async pollQrStatus(): Promise<PollQrStatusResult> {
    const pendingQr = await this.stateStore.getPendingQr();
    if (!pendingQr) {
      throw new Error("No pending QR binding exists. Start a new QR binding first.");
    }

    const status = await this.authClient.pollQrStatus(pendingQr.qrcode);
    if (status.status === "confirmed" && status.credentials) {
      await this.stateStore.setCredentials(status.credentials);
      await this.stateStore.clearPendingQr();
    }

    if (status.status === "expired") {
      await this.stateStore.clearPendingQr();
    }

    return status;
  }

  async getState(): Promise<AdminState> {
    const credentials = await this.stateStore.getCredentials();
    const pendingQr = await this.stateStore.getPendingQr();

    return {
      binding: summarizeBinding(credentials, pendingQr),
      targets: await this.stateStore.list()
    };
  }

  async upsertTarget(target: StoredWechatTarget): Promise<StoredWechatTarget> {
    return this.stateStore.upsert(target);
  }

  async removeTarget(alias: string): Promise<{ removed: boolean }> {
    return {
      removed: await this.stateStore.remove(alias)
    };
  }

  async resetBinding(): Promise<{ cleared: boolean }> {
    const credentials = await this.stateStore.getCredentials();
    if (credentials) {
      await this.authClient.resetChannel({
        botToken: credentials.token,
        channelId: credentials.accountId
      });
    }

    await this.stateStore.clearBindingState();

    return { cleared: true };
  }
}

function summarizeBinding(
  credentials: Credentials | undefined,
  pendingQr: Awaited<ReturnType<WechatBridgeStateStore["getPendingQr"]>>
): BindingSummary {
  if (credentials) {
    return {
      status: "confirmed",
      accountId: credentials.accountId,
      userId: credentials.userId,
      baseUrl: credentials.baseUrl,
      savedAt: credentials.savedAt
    };
  }

  if (pendingQr) {
    return {
      status: "pending",
      pendingQrcode: pendingQr.qrcode,
      pendingQrcodeUrl: pendingQr.qrcodeUrl
    };
  }

  return {
    status: "unbound"
  };
}
