import type { StoredWechatTarget } from "../../domain/target-registry.ts";
import type { ClawbotAuthClient, PollQrStatusResult, QrCodeResult } from "../../integrations/wechat/clawbot-auth-client.ts";
import type { WechatBridgeStateStore } from "../../integrations/wechat/bridge-state-store.ts";
import type { WechatCredentials } from "../../integrations/wechat/wechat-types.ts";

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

type SyncLifecyclePort = {
  start(): void;
  stop(): void;
};

export class BindingAdminService implements BindingAdminServicePort {
  constructor(
    private readonly authClient: ClawbotAuthClient,
    private readonly stateStore: WechatBridgeStateStore,
    private readonly syncService?: SyncLifecyclePort
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

    const status = await this.authClient.pollQrStatus(pendingQr.qrcode, {
      baseUrl: pendingQr.pollBaseUrl
    });

    if (status.redirectBaseUrl && status.status === "scaned") {
      await this.stateStore.setPendingQr({
        ...pendingQr,
        pollBaseUrl: status.redirectBaseUrl
      });
    }

    if (status.status === "confirmed" && status.credentials) {
      await this.stateStore.setCredentials(status.credentials);
      await this.stateStore.clearPendingQr();
      this.syncService?.start();
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
    this.syncService?.stop();
    await this.stateStore.clearBindingState();

    return { cleared: true };
  }
}

function summarizeBinding(
  credentials: WechatCredentials | undefined,
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
