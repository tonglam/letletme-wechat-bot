import { BindingAdminService } from "./application/services/binding-admin-service.ts";
import { NotificationService } from "./application/services/notification-service.ts";
import { loadEnv } from "./config/env.ts";
import { createApp } from "./http/create-app.ts";
import { WechatBridgeStateStore } from "./integrations/wechat/bridge-state-store.ts";
import { ClawbotAuthClient } from "./integrations/wechat/clawbot-auth-client.ts";
import { SdkWechatBridgeClient } from "./integrations/wechat/wechat-bridge-client.ts";
import { WechatStateStorageAdapter } from "./integrations/wechat/wechat-storage.ts";

const env = loadEnv();

const stateStore = new WechatBridgeStateStore(env.stateFilePath);
const storage = new WechatStateStorageAdapter(stateStore);
const authClient = new ClawbotAuthClient({
  baseUrl: env.wechatBootstrapBaseUrl
});
const notificationService = new NotificationService(
  new SdkWechatBridgeClient(storage),
  stateStore,
  {
    defaultTextTargetAlias: env.defaultTextTargetAlias
  }
);
const adminService = new BindingAdminService(authClient, stateStore);

const app = createApp({
  notificationService,
  adminService,
  notificationApiToken: env.notificationApiToken,
  adminApiToken: env.adminApiToken
});

app.listen(env.port);

console.log(`letletme-wechat-bot listening on port ${env.port} (${env.timezone})`);
