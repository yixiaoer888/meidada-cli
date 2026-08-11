import { describe, expect, it } from "bun:test";
import { ApiError } from "./api-client";
import { classifyError, successPayload } from "./output";

describe("CLI output protocol", () => {
  it("uses a stable success envelope", () => {
    const result = successPayload("media.search", { list: [] });
    expect(result.ok).toBe(true);
    expect(result.schemaVersion).toBe("1");
    expect(result.command).toBe("media.search");
    expect(result.requestId).toBeTruthy();
    expect(result.meta).toEqual({});
  });

  it("maps API business errors to stable codes and exit codes", () => {
    expect(classifyError(new ApiError("missing scope", 403, 40304))).toMatchObject({
      code: "SCOPE_REQUIRED",
      retryable: false,
      exitCode: 3,
    });
    expect(classifyError(new ApiError("duplicate", 409, 40904))).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      retryable: false,
      exitCode: 1,
    });
    expect(classifyError(new ApiError("pending", 409, 40905))).toMatchObject({
      code: "DUPLICATE_PENDING_OPERATION",
      retryable: false,
      exitCode: 1,
    });
  });
});
