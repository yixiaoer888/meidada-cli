import { Command } from "commander";
import { configPath, promptSecret, promptValue, readConfig } from "../config";
import { devicePath, enrollDevice, ensureDeviceIdentity } from "../device";
import { syncSkill } from "../skill";
import { createCommandContext, type CommandContext } from "../runtime";
import { CLI_VERSION } from "../version";
import { registerLowRiskCommands } from "./low-risk";
import { registerHighRiskCommands } from "./high-risk";
import { registerUtilityCommands } from "./utility";
import { updateCli } from "../update";

export type CoreCommandDependencies = {
  configPath: string;
  devicePath: string;
  readConfig: typeof readConfig;
  promptValue: typeof promptValue;
  promptSecret: typeof promptSecret;
  enrollDevice: typeof enrollDevice;
  ensureDeviceIdentity: typeof ensureDeviceIdentity;
  syncSkill: typeof syncSkill;
  updateCli: typeof updateCli;
  createContext: typeof createCommandContext;
};

const defaultDependencies: CoreCommandDependencies = {
  configPath,
  devicePath,
  readConfig,
  promptValue,
  promptSecret,
  enrollDevice,
  ensureDeviceIdentity,
  syncSkill,
  updateCli,
  createContext: createCommandContext,
};

function context(command: Command, dependencies: CoreCommandDependencies): CommandContext {
  return dependencies.createContext(Boolean(command.optsWithGlobals().json));
}

function strict(command: Command) {
  return command.allowExcessArguments(false);
}

export function registerCoreCommands(program: Command, dependencies = defaultDependencies) {
  const config = program.command("config").description("管理 CLI 配置");
  strict(config.command("get")).description("查看当前配置").action((_options, command: Command) => {
    const ctx = context(command, dependencies);
    return dependencies.readConfig().then((value) => ctx.success("config.get", value
      ? { apiUrl: value.apiUrl, apiKeyConfigured: true, configPath: dependencies.configPath }
      : { apiKeyConfigured: false, configPath: dependencies.configPath }));
  });
  strict(config.command("init"))
    .description("注册当前设备并保存设备令牌")
    .option("--api-url <url>", "API 地址")
    .option("--api-key <key>", "CLI 单次部署 API Key")
    .action(async (options: { apiUrl?: string; apiKey?: string }, command: Command) => {
      const ctx = context(command, dependencies);
      const previous = await dependencies.readConfig();
      const apiUrl = options.apiUrl || previous?.apiUrl || await dependencies.promptValue("API URL");
      const enrollmentKey = options.apiKey || process.env.MDD_API_KEY || await dependencies.promptSecret("单次部署 API Key");
      if (!apiUrl || !enrollmentKey) throw new Error("API URL 和 API Key 不能为空");
      const { identity, registered } = await dependencies.enrollDevice(apiUrl, enrollmentKey);
      ctx.success("config.init", { configured: true, apiUrl, clientId: identity.clientId, deviceName: registered.device.name, configPath: dependencies.configPath });
    });

  const device = program.command("device").description("管理设备身份");
  strict(device.command("prepare")).description("生成本机 clientId").action(async (_options, command: Command) => {
    const ctx = context(command, dependencies);
    ctx.success("device.prepare", { ...(await dependencies.ensureDeviceIdentity()), devicePath: dependencies.devicePath });
  });

  const auth = program.command("auth").description("查看认证状态");
  strict(auth.command("status")).description("查看本地认证来源").action(async (_options, command: Command) => {
    const ctx = context(command, dependencies);
    const value = await dependencies.readConfig();
    ctx.success("auth.status", {
      configured: !!(process.env.MDD_API_KEY || value?.apiKey),
      apiUrl: process.env.MDD_API_URL || value?.apiUrl || null,
      tokenSource: process.env.MDD_API_KEY ? "environment" : value?.apiKey ? "config" : null,
      clientId: value?.clientId || null,
      configPath: dependencies.configPath,
    });
  });
  strict(auth.command("whoami")).description("查看当前账号").action(async (_options, command: Command) => {
    const ctx = context(command, dependencies);
    ctx.success("auth.whoami", await (await ctx.getClient()).get("/profile"));
  });

  strict(program.command("doctor")).description("检查 API 和认证状态").action(async (_options, command: Command) => {
    const ctx = context(command, dependencies);
    const profile = await (await ctx.getClient()).get<Record<string, unknown>>("/profile");
    ctx.success("doctor", { api: "ok", authentication: "ok", profile });
  });

  strict(program.command("skill").description("管理 Agent Skill").command("sync"))
    .description("同步内置 Skill")
    .option("--global", "同步到用户级 Agent 目录")
    .action(async (options: { global?: boolean }, command: Command) => {
      const ctx = context(command, dependencies);
      ctx.success("skill.sync", await dependencies.syncSkill(Boolean(options.global)));
    });

  strict(program.command("version")).description("显示版本").action((_options, command: Command) => {
    const ctx = context(command, dependencies);
    ctx.success("version", CLI_VERSION);
  });

  strict(program.command("update")).description("检查或安装 CLI 正式版更新")
    .option("--yes", "确认更新，并自动同步 Agent Skill")
    .action(async (options: { yes?: boolean }, command: Command) => {
      const ctx = context(command, dependencies);
      const result = await dependencies.updateCli({ confirmed: Boolean(options.yes) });
      ctx.success(options.yes ? "update" : "update.check", result);
    });
}

export function createProgram(dependencies = defaultDependencies) {
  const program = new Command();
  program
    .name("mdd")
    .description("媒大大官方内容投放 CLI")
    .option("--json", "输出稳定 JSON")
    .option("-V, --version", "显示版本")
    .showHelpAfterError(false)
    .allowExcessArguments(false);
  registerCoreCommands(program, dependencies);
  registerLowRiskCommands(program);
  registerHighRiskCommands(program);
  registerUtilityCommands(program);
  program.action((options: { version?: boolean }, command: Command) => {
    if (options.version) {
      context(command, dependencies).success("version", CLI_VERSION);
      return;
    }
    command.outputHelp();
  });
  return program;
}
