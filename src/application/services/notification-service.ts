import type { NotificationFailure, NotificationRequest, NotificationResult } from "../../domain/notification.ts";
import type { WechatTargetRegistry } from "../../domain/target-registry.ts";
import type { WechatBridgeClient } from "../../integrations/wechat/wechat-bridge-client.ts";

export interface NotificationServicePort {
  send(notification: NotificationRequest): Promise<NotificationResult>;
}

type NotificationServiceOptions = {
  defaultTextTargetAlias?: string | undefined;
};

export class NotificationService implements NotificationServicePort {
  constructor(
    private readonly wechatClient: WechatBridgeClient,
    private readonly targetRegistry: WechatTargetRegistry,
    private readonly options: NotificationServiceOptions = {}
  ) {}

  async send(notification: NotificationRequest): Promise<NotificationResult> {
    const failures: NotificationFailure[] = [];
    const targets = await this.resolveTargets(notification);

    for (const target of targets) {
      try {
        if (notification.type === "text") {
          await this.wechatClient.sendText({
            userId: target.userId,
            contextToken: target.contextToken,
            text: this.formatText(notification.text)
          });
        } else {
          await this.wechatClient.sendImage({
            userId: target.userId,
            contextToken: target.contextToken,
            imageUrl: notification.imageUrl,
            caption: notification.caption
          });
        }
      } catch (error) {
        failures.push({
          target: target.alias,
          message: error instanceof Error ? error.message : "Unknown delivery error."
        });
      }
    }

    const requestedCount = targets.length;
    const failedCount = failures.length;
    const deliveredCount = requestedCount - failedCount;

    return {
      status: failedCount === 0 ? "success" : "partial_failure",
      notificationType: notification.type,
      requestedCount,
      deliveredCount,
      failedCount,
      failures
    };
  }

  private async resolveTargets(notification: NotificationRequest) {
    if (notification.targets.length > 0) {
      return this.targetRegistry.resolveAliases(notification.targets);
    }

    if (notification.type === "text" && this.options.defaultTextTargetAlias) {
      return this.targetRegistry.resolveAliases([this.options.defaultTextTargetAlias]);
    }

    return [];
  }

  private formatText(text: string) {
    return `[letletme-wechat-bot] ${text}`;
  }
}
