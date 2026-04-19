import { createCipheriv, randomBytes } from "node:crypto";

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const ILINK_APP_ID = "bot";
export const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export function buildBaseInfo(channelVersion: string) {
  return {
    channel_version: channelVersion
  };
}

export function buildCommonHeaders(
  channelVersion: string,
  skRouteTag?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(buildClientVersion(channelVersion))
  };

  if (skRouteTag) {
    headers.SKRouteTag = skRouteTag;
  }

  return headers;
}

export function buildAuthHeaders(
  token: string,
  channelVersion: string,
  skRouteTag?: string
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "X-WECHAT-UIN": randomWechatUin(),
    ...buildCommonHeaders(channelVersion, skRouteTag)
  };
}

export function buildClientVersion(version: string): number {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return ((parseNumber(major) & 0xff) << 16) | ((parseNumber(minor) & 0xff) << 8) | (parseNumber(patch) & 0xff);
}

export function randomWechatUin() {
  const value = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(value), "utf8").toString("base64");
}

export function generateAesKey() {
  return randomBytes(16);
}

export function encryptAesEcb(plaintext: Buffer, key: Buffer) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function encodeAesKeyHex(key: Buffer) {
  return key.toString("hex");
}

export function encodeAesKeyBase64(key: Buffer) {
  return Buffer.from(key.toString("hex"), "utf8").toString("base64");
}

function parseNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
