import type { Fetcher } from "./ilink-helpers.ts";

type RequestOptions = {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export class WechatApiError extends Error {
  public readonly statusCode: number;
  public readonly code: number | undefined;

  constructor(message: string, options: { statusCode: number; code?: number | undefined }) {
    super(message);
    this.name = "WechatApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
  }
}

export class IlinkHttpClient {
  private readonly fetcher: Fetcher;

  constructor(options: { fetcher?: Fetcher } = {}) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async get<T>(
    baseUrl: string,
    path: string,
    options: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    return this.request<T>({
      method: "GET",
      url: new URL(path, normalizeBaseUrl(baseUrl)).toString(),
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
  }

  async post<T>(
    baseUrl: string,
    path: string,
    body: unknown,
    options: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    return this.request<T>({
      method: "POST",
      url: new URL(path, normalizeBaseUrl(baseUrl)).toString(),
      ...(options.headers ? { headers: options.headers } : {}),
      body,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 15_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    const requestInit: RequestInit = {
      method: options.method,
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal
    };

    const response = await this.fetcher(options.url, requestInit);

    const body = await parseJsonSafely(response);
    if (!response.ok) {
      throw new WechatApiError(extractErrorMessage(body, `HTTP ${response.status}`), {
        statusCode: response.status,
        code: extractErrorCode(body)
      });
    }

    if (hasApiError(body)) {
      throw new WechatApiError(extractErrorMessage(body, "WeChat iLink API request failed."), {
        statusCode: response.status,
        code: extractErrorCode(body)
      });
    }

    return body as T;
  }
}

async function parseJsonSafely(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return response.json();
}

function extractErrorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null) {
    const message = (body as { errmsg?: unknown; message?: unknown }).errmsg ?? (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function extractErrorCode(body: unknown) {
  if (typeof body === "object" && body !== null) {
    const raw = (body as { errcode?: unknown; ret?: unknown }).errcode ?? (body as { ret?: unknown }).ret;
    if (typeof raw === "number") {
      return raw;
    }
  }

  return undefined;
}

function hasApiError(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const { errcode, ret } = body as { errcode?: unknown; ret?: unknown };
  return (typeof errcode === "number" && errcode !== 0) || (typeof ret === "number" && ret !== 0);
}

function normalizeBaseUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/`;
}
