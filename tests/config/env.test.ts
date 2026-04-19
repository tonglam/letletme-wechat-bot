import { describe, expect, test } from "bun:test";

import { parseEnv } from "../../src/config/env.ts";

describe("parseEnv", () => {
  test("throws when the state file path is missing", () => {
    expect(() => parseEnv({})).toThrow("WECHAT_STATE_FILE_PATH is required.");
  });

  test("parses valid env values and defaults", () => {
    expect(
      parseEnv({
        WECHAT_STATE_FILE_PATH: "/tmp/wechat-state.json",
        PORT: "8026",
        TIMEZONE: "Australia/Perth",
        NOTIFICATION_API_TOKEN: "notify-secret",
        ADMIN_API_TOKEN: "admin-secret",
        DEFAULT_TEXT_TARGET_ALIAS: "ops-group",
        WECHAT_BOOTSTRAP_BASE_URL: "https://ilinkai.weixin.qq.com",
        WECHAT_CHANNEL_VERSION: "1.2.3",
        WECHAT_SK_ROUTE_TAG: "route-a"
      })
    ).toEqual({
      stateFilePath: "/tmp/wechat-state.json",
      port: 8026,
      timezone: "Australia/Perth",
      notificationApiToken: "notify-secret",
      adminApiToken: "admin-secret",
      defaultTextTargetAlias: "ops-group",
      wechatBootstrapBaseUrl: "https://ilinkai.weixin.qq.com",
      wechatChannelVersion: "1.2.3",
      wechatSkRouteTag: "route-a"
    });
  });

  test("uses sane defaults for optional env values", () => {
    expect(
      parseEnv({
        WECHAT_STATE_FILE_PATH: "/tmp/wechat-state.json"
      })
    ).toEqual({
      stateFilePath: "/tmp/wechat-state.json",
      port: 3000,
      timezone: "UTC",
      notificationApiToken: undefined,
      adminApiToken: undefined,
      defaultTextTargetAlias: undefined,
      wechatBootstrapBaseUrl: "https://ilinkai.weixin.qq.com",
      wechatChannelVersion: "1.0.0",
      wechatSkRouteTag: undefined
    });
  });

  test("does not require OpenAPI signing env vars", () => {
    expect(
      () =>
        parseEnv({
          WECHAT_STATE_FILE_PATH: "/tmp/wechat-state.json",
          WECHAT_OPENAPI_APP_ID: "",
          WECHAT_OPENAPI_SECRET_KEY: ""
        })
    ).not.toThrow();
  });
});
