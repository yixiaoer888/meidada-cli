import type { CliConfig } from "./config";
import { randomUUID } from "node:crypto";
import { CLI_VERSION } from "./version";

type Envelope<T> = { code: number; message: string; data: T };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
  }
}

export class ApiClient {
  constructor(private readonly config: CliConfig) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.apiUrl}/api${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "X-CLI-Version": CLI_VERSION,
        "X-Request-ID": randomUUID(),
        ...(this.config.clientId ? { "X-CLI-Client-Id": this.config.clientId } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || !body || body.code !== 0) {
      const message = response.status === 401
        ? "设备凭证已失效；请在 CLI 部署页重新生成单次部署 API Key 并执行 mdd config init"
        : body?.message || `HTTP ${response.status}`;
      throw new ApiError(message, response.status, body?.code);
    }
    return body.data;
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}
