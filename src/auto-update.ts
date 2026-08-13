import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { updateCli } from "./update";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 60 * 60 * 1000;
const SKIPPED_COMMANDS = new Set(["update", "version", "skill"]);

export const autoUpdateStatePath = join(homedir(), ".mdd", "auto-update.json");

type AutoUpdateState = { lastAttemptAt?: string; lastSuccessAt?: string };

export type AutoUpdateDependencies = {
  now: () => Date;
  readState: () => Promise<AutoUpdateState | null>;
  writeState: (state: AutoUpdateState) => Promise<void>;
  update: () => Promise<{ updated: boolean }>;
};

async function readState(): Promise<AutoUpdateState | null> {
  try {
    return JSON.parse(await readFile(autoUpdateStatePath, "utf8")) as AutoUpdateState;
  } catch {
    return null;
  }
}

async function writeState(state: AutoUpdateState) {
  await mkdir(dirname(autoUpdateStatePath), { recursive: true });
  await writeFile(autoUpdateStatePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

const defaultDependencies: AutoUpdateDependencies = {
  now: () => new Date(),
  readState,
  writeState,
  update: () => updateCli({ confirmed: true }),
};

function commandName(args: string[]) {
  return args.find((arg) => !arg.startsWith("-"));
}

function isDisabled(args: string[]) {
  const setting = process.env.MDD_AUTO_UPDATE?.trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(setting || "")) return true;
  if (args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))) return true;
  const command = commandName(args);
  return Boolean(command && SKIPPED_COMMANDS.has(command));
}

export async function autoUpdateCli(args: string[], dependencies = defaultDependencies) {
  if (isDisabled(args)) return { checked: false, updated: false };

  const now = dependencies.now();
  const state = await dependencies.readState().catch(() => null);
  const lastAttempt = state?.lastAttemptAt ? Date.parse(state.lastAttemptAt) : Number.NaN;
  const lastSuccess = state?.lastSuccessAt ? Date.parse(state.lastSuccessAt) : Number.NaN;
  const interval = Number.isFinite(lastSuccess) && lastSuccess >= lastAttempt ? CHECK_INTERVAL_MS : RETRY_INTERVAL_MS;
  if (Number.isFinite(lastAttempt) && now.getTime() - lastAttempt < interval) {
    return { checked: false, updated: false };
  }

  const attemptState = { ...state, lastAttemptAt: now.toISOString() };
  await dependencies.writeState(attemptState).catch(() => undefined);
  try {
    const result = await dependencies.update();
    await dependencies.writeState({ ...attemptState, lastSuccessAt: now.toISOString() }).catch(() => undefined);
    return { checked: true, updated: result.updated };
  } catch {
    return { checked: true, updated: false };
  }
}
