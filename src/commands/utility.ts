import { Command } from "commander";
import { uploadAssets } from "../assets";
import { CommandExit, createCommandContext } from "../runtime";

function context(command: Command) {
  return createCommandContext(Boolean(command.optsWithGlobals().json));
}

function strict(command: Command) {
  return command.allowExcessArguments(false);
}

export function registerUtilityCommands(program: Command) {
  strict(program.command("wallet").command("balance")).description("查询钱包余额").action(async (_options, command: Command) => {
    const ctx = context(command);
    ctx.success("wallet.balance", await (await ctx.getClient()).get("/wallet"));
  });

  strict(program.command("asset").command("upload <files...>"))
    .description("上传素材")
    .option("--concurrency <count>", "并发数", "3")
    .action(async (files: string[], options: { concurrency: string }, command: Command) => {
      const ctx = context(command);
      const result = await uploadAssets(await ctx.getClient(), files, Number(options.concurrency));
      ctx.success("asset.upload", result);
      if (result.failed > 0) throw new CommandExit(2);
    });
}
