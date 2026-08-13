#!/usr/bin/env node
import { Command } from "commander";
import { createProgram } from "./commands/core";
import { CommandExit } from "./runtime";
import { printError } from "./output";
import { autoUpdateCli } from "./auto-update";

const COMMANDS = new Set([
  "config", "device", "auth", "doctor", "skill", "version", "update",
  "draft", "favorite", "customer", "media", "publish", "schedule", "order", "wallet", "asset",
]);

function firstCommand(args: string[]) {
  for (const arg of args) {
    if (["--json", "--help", "-h", "--version", "-V"].includes(arg)) continue;
    if (arg.startsWith("-")) return undefined;
    return arg;
  }
  return undefined;
}

async function runCommander(args: string[]) {
  const program = createProgram();
  const configure = (command: Command) => {
    command.exitOverride();
    command.configureOutput({ writeErr: () => undefined });
    for (const child of command.commands) configure(child);
  };
  configure(program);
  try {
    await program.parseAsync(["node", "mdd", ...args]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = String((error as { code?: unknown }).code);
      if (code === "commander.helpDisplayed" || code === "commander.version") return;
    }
    throw error;
  }
}

export async function runCli(args: string[]) {
  const output = { json: args.includes("--json") || args.some((arg) => arg.startsWith("--json=")) };
  try {
    const group = firstCommand(args);
    if (group && !COMMANDS.has(group)) throw new Error(`未知命令：${group}。执行 mdd --help 查看帮助。`);
    await autoUpdateCli(args);
    await runCommander(args);
    return 0;
  } catch (error) {
    if (error instanceof CommandExit) return error.exitCode;
    printError(error, output);
    return 1;
  }
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
