export type AppEnv = {
  stateFilePath: string;
  port: number;
  timezone: string;
  notificationApiToken: string | undefined;
  adminApiToken: string | undefined;
  defaultTextTargetAlias: string | undefined;
  wechatBootstrapBaseUrl: string;
  wechatChannelVersion: string;
  wechatSkRouteTag: string | undefined;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_BOOTSTRAP_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_CHANNEL_VERSION = "1.0.0";

export function parseEnv(source: EnvSource): AppEnv {
  const stateFilePath = source.WECHAT_STATE_FILE_PATH?.trim();
  if (!stateFilePath) {
    throw new Error("WECHAT_STATE_FILE_PATH is required.");
  }

  return {
    stateFilePath,
    port: parseOptionalPort(source.PORT),
    timezone: source.TIMEZONE?.trim() || "UTC",
    notificationApiToken: source.NOTIFICATION_API_TOKEN?.trim() || undefined,
    adminApiToken: source.ADMIN_API_TOKEN?.trim() || undefined,
    defaultTextTargetAlias: source.DEFAULT_TEXT_TARGET_ALIAS?.trim() || undefined,
    wechatBootstrapBaseUrl: source.WECHAT_BOOTSTRAP_BASE_URL?.trim() || DEFAULT_BOOTSTRAP_BASE_URL,
    wechatChannelVersion: source.WECHAT_CHANNEL_VERSION?.trim() || DEFAULT_CHANNEL_VERSION,
    wechatSkRouteTag: source.WECHAT_SK_ROUTE_TAG?.trim() || undefined
  };
}

export function loadEnv(): AppEnv {
  return parseEnv(process.env);
}

function parseOptionalPort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("PORT must be a positive integer.");
  }

  return parsed;
}
