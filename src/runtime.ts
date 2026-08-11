import { ApiClient } from "./api-client";
import { resolveConfig } from "./config";
import { printSuccess, type OutputOptions } from "./output";

export class CommandExit extends Error {
  constructor(readonly exitCode: number) {
    super(`CLI exited with code ${exitCode}`);
  }
}

export type CommandContext = {
  output: OutputOptions;
  success: (action: string, data: unknown) => void;
  getClient: () => Promise<ApiClient>;
};

export function createCommandContext(json: boolean): CommandContext {
  let client: ApiClient | undefined;
  return {
    output: { json },
    success: (action, data) => printSuccess(action, data, { json }),
    getClient: async () => {
      client ??= new ApiClient(await resolveConfig());
      return client;
    },
  };
}
