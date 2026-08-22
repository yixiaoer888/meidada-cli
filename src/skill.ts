import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error bundled markdown is consumed as text by Bun at build time
import bundledMediaDistributionSkill from "../skills/media-distribution/SKILL.md";

export const agentSkillDirectories = {
  codex: [".codex", "skills"],
  cursor: [".cursor", "skills"],
  claude: [".claude", "skills"],
  trae: [".trae", "skills"],
  workbuddy: [".workbuddy", "skills"],
  codebuddy: [".codebuddy", "skills"],
  openclaw: [".openclaw", "skills"],
  windsurf: [".codeium", "windsurf", "skills"],
  gemini: [".gemini", "skills"],
} as const;

export type AgentName = keyof typeof agentSkillDirectories;

export type SyncSkillOptions = {
  global?: boolean;
  agent?: AgentName;
  targetDir?: string;
  dryRun?: boolean;
  force?: boolean;
};

export function bundledSkillPath() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../skills/media-distribution"),
    resolve(currentDir, "../../skills/media-distribution"),
  ];
  const found = candidates.find((candidate) => existsSync(resolve(candidate, "SKILL.md")));
  if (!found) throw new Error("未找到 CLI 内置 Skill，请重新安装 @meidada-cn/cli");
  return found;
}

export function bundledSkillContent() {
  return bundledMediaDistributionSkill;
}

export function resolveSkillTarget(
  options: SyncSkillOptions,
  roots = { home: homedir(), cwd: process.cwd() },
) {
  if (options.targetDir !== undefined) {
    if (!options.targetDir.trim()) throw new Error("Skill 同步目标不能为空");
    return resolve(options.targetDir);
  }
  if (!options.global) {
    if (options.agent) throw new Error("--agent 仅用于 --global 同步；项目级同步无需指定 Agent");
    return resolve(roots.cwd, ".agents", "skills");
  }
  if (!options.agent) {
    throw new Error("全局同步必须指定 --agent；可选值：" + Object.keys(agentSkillDirectories).join(", "));
  }
  return join(roots.home, ...agentSkillDirectories[options.agent]);
}

export async function syncSkill(options: SyncSkillOptions = {}, roots = { home: homedir(), cwd: process.cwd() }) {
  const target = resolveSkillTarget(options, roots);
  if (!target.trim()) throw new Error("Skill 同步目标不能为空");
  const destination = join(target, "media-distribution", "SKILL.md");
  const content = bundledMediaDistributionSkill || await readFile(resolve(bundledSkillPath(), "SKILL.md"), "utf8");
  const previous = await readFile(destination, "utf8").catch(() => null);
  const created = previous === null;
  const changed = previous !== content;

  if (changed && !created && !options.force && !options.dryRun) {
    throw new Error(`目标 Skill 已存在且内容不同：${destination}；请先使用 --dry-run 检查，再加 --force 覆盖`);
  }

  if (!options.dryRun && changed) {
    await mkdir(dirname(destination), { recursive: true });
    if (bundledMediaDistributionSkill) await writeFile(destination, content, "utf8");
    else await copyFile(resolve(bundledSkillPath(), "SKILL.md"), destination);
  }

  if (!options.dryRun) {
    const written = await readFile(destination, "utf8").catch(() => null);
    if (written !== content) throw new Error("Skill 同步未完成：目标文件校验失败");
  }

  return {
    status: options.dryRun ? "preview" : "synced",
    synced: !options.dryRun,
    dryRun: Boolean(options.dryRun),
    global: Boolean(options.global),
    agent: options.agent || null,
    targets: [target],
    destination,
    created: !options.dryRun && created,
    overwritten: !options.dryRun && !created && changed,
    changed,
  };
}
