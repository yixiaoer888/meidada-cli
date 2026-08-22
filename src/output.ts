import { randomUUID } from "node:crypto";
import { CLI_VERSION } from "./version";

export type OutputOptions = { json: boolean; quiet?: boolean; command?: string };
export type ErrorDetails = {
  code: string;
  message: string;
  retryable: boolean;
  suggestion: string | null;
  exitCode: number;
};

const schemaVersion = "1";

export function successPayload(command: string, data: unknown) {
  return {
    ok: true as const,
    action: command,
    version: CLI_VERSION,
    schemaVersion,
    command,
    requestId: randomUUID(),
    data,
    meta: {},
  };
}

export function printSuccess(command: string, data: unknown, options: OutputOptions) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(successPayload(command, data))}\n`);
    return;
  }
  if (options.quiet) return;
  if (typeof data === "string") {
    process.stdout.write(`${data}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function classifyError(error: unknown): ErrorDetails {
  const message = error instanceof Error ? error.message : String(error);
  const timeout = /超时|timeout/i.test(message);
  const confirmationRequired = /确认|approval/i.test(message);
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : 0;
  const apiCode = typeof error === "object" && error && "code" in error && typeof error.code === "number" ? error.code : undefined;
  const explicitCode = typeof error === "object" && error && "errorCode" in error && typeof error.errorCode === "string" ? error.errorCode : undefined;
  const code = explicitCode ?? (timeout ? "ORDER_WAIT_TIMEOUT"
    : apiCode === 40905 ? "DUPLICATE_PENDING_OPERATION"
      : apiCode === 40904 ? "IDEMPOTENCY_KEY_REUSED"
        : apiCode === 40903 ? "DRAFT_CHANGED"
          : apiCode === 40902 ? "PRICE_CHANGED"
            : apiCode === 40201 ? "INSUFFICIENT_BALANCE"
              : apiCode === 40101 ? "CLI_KEY_EXPIRED"
                : apiCode === 40304 ? "SCOPE_REQUIRED"
                  : apiCode === 40303 ? "USER_CONFIRMATION_REQUIRED"
                    : status === 401 ? "UNAUTHORIZED"
                      : status === 403 ? "FORBIDDEN"
                        : status === 404 ? "NOT_FOUND"
                          : status >= 500 ? "SERVER_ERROR"
                            : confirmationRequired ? "USER_CONFIRMATION_REQUIRED"
                              : error instanceof TypeError ? "NETWORK_ERROR" : "VALIDATION_FAILED");
  const retryable = status >= 500 || status === 408 || code === "NETWORK_ERROR" || code === "ORDER_WAIT_TIMEOUT";
  const exitCode = code === "ORDER_WAIT_TIMEOUT" ? 7
    : code === "UNAUTHORIZED" || code === "CLI_KEY_EXPIRED" ? 2
      : code === "FORBIDDEN" || code === "SCOPE_REQUIRED" ? 3
        : code === "NOT_FOUND" ? 4
          : code === "NETWORK_ERROR" ? 5
            : status >= 500 ? 6
              : code === "USER_CONFIRMATION_REQUIRED" ? 8 : 1;
  return { code, message, retryable, suggestion: retryable ? "稍后重试" : null, exitCode };
}

export function printError(error: unknown, options: OutputOptions) {
  const details = classifyError(error);
  if (options.json) {
    const { exitCode: _exitCode, ...payload } = details;
    process.stdout.write(`${JSON.stringify({
      ok: false,
      version: CLI_VERSION,
      schemaVersion,
      command: options.command ?? "unknown",
      requestId: randomUUID(),
      error: payload,
    })}\n`);
    return;
  }
  process.stderr.write(`错误：${details.message}\n`);
}
