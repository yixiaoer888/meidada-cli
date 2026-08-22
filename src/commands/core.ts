import { Command } from "commander";
import { configPath, DEFAULT_API_URL, deviceTokenEnv, promptSecret, promptValue, readApiKeyFromStdin, readConfig } from "../config";
import { devicePath, enrollDevice, ensureDeviceIdentity } from "../device";
import { agentSkillDirectories, syncSkill, type AgentName } from "../skill";
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
  readApiKeyFromStdin: typeof readApiKeyFromStdin;
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
  readApiKeyFromStdin,
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

type EnrollmentOptions = { apiUrl?: string; apiKeyStdin?: boolean };
type EnrollmentAction = "config.init" | "setup";

type SafeError = Error & {
  errorCode?: string;
  status?: number;
  code?: number;
};

function redactSecret(value: string, secret: string) {
  return secret ? value.replaceAll(secret, "[REDACTED]") : value;
}

function safeError(error: unknown, secret: string, errorCode?: string): SafeError {
  const source = error instanceof Error ? error : new Error(String(error));
  const safe = new Error(redactSecret(source.message, secret)) as SafeError;
  safe.name = source.name;
  if (typeof (source as SafeError).status === "number") safe.status = (source as SafeError).status;
  if (typeof (source as SafeError).code === "number") safe.code = (source as SafeError).code;
  if (errorCode || (source as SafeError).errorCode) safe.errorCode = errorCode || (source as SafeError).errorCode;
  return safe;
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:api[-_]?key|token|secret|password|authorization|credential)/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitive(nested);
    }
  }
  return result;
}

async function runEnrollment(
  options: EnrollmentOptions,
  command: Command,
  dependencies: CoreCommandDependencies,
  action: EnrollmentAction,
) {
  const ctx = context(command, dependencies);
  if (action === "setup" && !options.apiKeyStdin) {
    throw new Error("mdd setup 必须使用 --api-key-stdin；不要把 API Key 放入命令参数");
  }

  const previous = await dependencies.readConfig();
  const apiUrl = options.apiUrl || previous?.apiUrl || process.env.MDD_API_URL || DEFAULT_API_URL;
  let enrollmentKey = "";
  try {
    enrollmentKey = options.apiKeyStdin
      ? await dependencies.readApiKeyFromStdin()
      : await dependencies.promptSecret("单次部署 API Key");
    if (!apiUrl || !enrollmentKey) throw new Error("API URL 和 API Key 不能为空");

    let identity: Awaited<ReturnType<typeof dependencies.enrollDevice>>["identity"];
    let registered: Awaited<ReturnType<typeof dependencies.enrollDevice>>["registered"];
    try {
      const result = await dependencies.enrollDevice(apiUrl, enrollmentKey, { configDestination: dependencies.configPath });
      identity = result.identity;
      registered = result.registered;
    } catch (error) {
      throw safeError(error, enrollmentKey, "DEVICE_REGISTRATION_FAILED");
    }

    if (action === "setup") {
      // A successful authenticated profile request proves both API reachability and device authentication.
      const profile = await (await ctx.getClient()).get<Record<string, unknown>>("/profile");
      ctx.success(action, {
        configured: true,
        verification: { api: "ok", authentication: "ok" },
        account: redactSensitive(profile),
        clientId: identity.clientId,
        deviceName: registered.device.name,
        configPath: dependencies.configPath,
      });
      return;
    }
    ctx.success(action, { configured: true, apiUrl, clientId: identity.clientId, deviceName: registered.device.name, configPath: dependencies.configPath });
  } catch (error) {
    throw safeError(error, enrollmentKey);
  } finally {
    enrollmentKey = "";
  }
}

export function registerCoreCommands(program: Command, dependencies = defaultDependencies) {
  strict(program.command("setup"))
    .description("注册设备并自动完成认证检查和当前账号查询")
    .option("--api-url <url>", "API 地址")
    .option("--api-key-stdin", "从标准输入读取一次性部署 API Key（推荐 Agent 使用）")
    .action((options: EnrollmentOptions, command: Command) => runEnrollment(options, command, dependencies, "setup"));

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
    .option("--api-key-stdin", "从标准输入读取一次性部署 API Key（推荐 Agent 使用）")
    .action((options: EnrollmentOptions, command: Command) => runEnrollment(options, command, dependencies, "config.init"));

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
      configured: !!(value?.apiKey || process.env[deviceTokenEnv]),
      apiUrl: value?.apiUrl || process.env.MDD_API_URL || null,
      tokenSource: value?.apiKey ? "config" : process.env[deviceTokenEnv] ? "environment" : null,
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
    .option("--global", "同步到指定 Agent 的用户级目录")
    .option("--agent <name>", `目标 Agent：${Object.keys(agentSkillDirectories).join(", ")}`)
    .option("--target-dir <path>", "显式指定 Skill 根目录")
    .option("--dry-run", "只预览目标和覆盖状态，不写入文件")
    .option("--force", "覆盖内容不同的已有 Skill")
    .action(async (options: { global?: boolean; agent?: string; targetDir?: string; dryRun?: boolean; force?: boolean }, command: Command) => {
      const ctx = context(command, dependencies);
      if (options.agent && !(options.agent in agentSkillDirectories)) {
        throw new Error(`不支持的 Agent：${options.agent}；可选值：${Object.keys(agentSkillDirectories).join(", ")}`);
      }
      ctx.success("skill.sync", await dependencies.syncSkill({
        global: Boolean(options.global),
        agent: options.agent as AgentName | undefined,
        targetDir: options.targetDir,
        dryRun: Boolean(options.dryRun),
        force: Boolean(options.force),
      }));
    });

  strict(program.command("version")).description("显示版本").action((_options, command: Command) => {
    const ctx = context(command, dependencies);
    ctx.success("version", CLI_VERSION);
  });

  strict(program.command("update")).description("检查或安装 CLI 正式版更新")
    .option("--yes", "兼容参数：确认更新 CLI")
    .option("--check", "只检查是否有新版本，不执行更新")
    .option("--registry <url>", "本次更新使用的 npm registry，不修改全局配置")
    .option("--global", "更新后同步到 Agent 用户级 Skill 目录")
    .option("--agent <name>", `全局 Skill 目标 Agent：${Object.keys(agentSkillDirectories).join(", ")}`)
    .option("--force", "允许更新时覆盖内容不同的已有 Skill")
    .action(async (options: { yes?: boolean; check?: boolean; registry?: string; global?: boolean; agent?: string; force?: boolean }, command: Command) => {
      const ctx = context(command, dependencies);
      if (options.agent && !(options.agent in agentSkillDirectories)) {
        throw new Error(`不支持的 Agent：${options.agent}；可选值：${Object.keys(agentSkillDirectories).join(", ")}`);
      }
      if (Boolean(options.global) !== Boolean(options.agent)) {
        throw new Error("mdd update 使用全局 Skill 时必须同时指定 --global --agent <name>；项目级更新不要指定 --agent");
      }
      // 与 yxer 对齐：update 默认执行更新，只有 --check 保持只读。
      const result = await dependencies.updateCli({
        confirmed: !options.check,
        ...(options.check ? { check: true } : {}),
        ...(options.registry ? { registry: options.registry } : {}),
      });
      if (options.check) {
        ctx.success("update.check", result);
        return;
      }

      let skill: Awaited<ReturnType<typeof dependencies.syncSkill>> | null = null;
      let skillError: string | null = null;
      try {
        skill = await dependencies.syncSkill({
          global: Boolean(options.global),
          agent: options.agent as AgentName | undefined,
          force: Boolean(options.force),
        });
      } catch (error) {
        skillError = error instanceof Error ? error.message : String(error);
      }

      const updateResult: Record<string, unknown> = { ...result };
      delete updateResult.nextCommand;
      ctx.success("update", {
        ...updateResult,
        skillSynced: Boolean(skill?.synced),
        skillChanged: Boolean(skill?.changed),
        restartAgent: Boolean(skill?.changed && skill?.synced),
        ...(skill ? { skill } : {}),
        ...(skillError ? {
          skillError,
          nextCommand: options.global
            ? `mdd skill sync --global --agent ${options.agent} --dry-run --json`
            : "mdd skill sync --dry-run --json",
        } : {}),
      });
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
