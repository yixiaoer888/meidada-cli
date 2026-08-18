export class CliStageError extends Error {
  readonly status?: number;
  readonly code?: number;

  constructor(
    readonly stage: string,
    error: unknown,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    super(`阶段：${stage}；${message}`);
    this.name = "CliStageError";
    if (typeof error === "object" && error) {
      const status = (error as { status?: unknown }).status;
      const code = (error as { code?: unknown }).code;
      if (typeof status === "number") this.status = status;
      if (typeof code === "number") this.code = code;
    }
  }
}

export function stageError<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  return operation().catch((error) => {
    if (error instanceof CliStageError) throw error;
    throw new CliStageError(stage, error);
  });
}
