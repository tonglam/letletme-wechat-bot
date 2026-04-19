import { BindingAdminService } from "./application/services/binding-admin-service.ts";
import { NotificationService } from "./application/services/notification-service.ts";
import { loadEnv } from "./config/env.ts";
import { createApp } from "./http/create-app.ts";
import { WechatBridgeStateStore } from "./integrations/wechat/bridge-state-store.ts";
import { ClawbotAuthClient } from "./integrations/wechat/clawbot-auth-client.ts";
import { WechatMessageSyncService } from "./integrations/wechat/message-sync-service.ts";
import { IlinkWechatBridgeClient } from "./integrations/wechat/wechat-bridge-client.ts";

const env = loadEnv();

const stateStore = new WechatBridgeStateStore(env.stateFilePath);
const syncService = new WechatMessageSyncService(stateStore, {
  channelVersion: env.wechatChannelVersion,
  skRouteTag: env.wechatSkRouteTag
});
const authClient = new ClawbotAuthClient({
  baseUrl: env.wechatBootstrapBaseUrl,
  channelVersion: env.wechatChannelVersion,
  skRouteTag: env.wechatSkRouteTag
});
const notificationService = new NotificationService(
  new IlinkWechatBridgeClient(stateStore, {
    channelVersion: env.wechatChannelVersion,
    skRouteTag: env.wechatSkRouteTag
  }),
  stateStore,
  {
    defaultTextTargetAlias: env.defaultTextTargetAlias
  }
);
const adminService = new BindingAdminService(authClient, stateStore, syncService);

if (await stateStore.getCredentials()) {
  syncService.start();
}

const app = createApp({
  notificationService,
  adminService,
  notificationApiToken: env.notificationApiToken,
  adminApiToken: env.adminApiToken
});

app.listen(env.port);

console.log(`letletme-wechat-bot listening on port ${env.port} (${env.timezone})`);
