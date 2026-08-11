import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export async function syncSkill(global: boolean) {
  const skillPath = bundledSkillPath();
  const targets = global
    ? [
        join(homedir(), ".codex", "skills"),
        join(homedir(), ".cursor", "skills"),
        join(homedir(), ".codebuddy", "skills"),
        join(homedir(), ".trae", "skills"),
        join(homedir(), ".claude", "skills"),
        join(homedir(), ".codeium", "windsurf", "skills"),
        join(homedir(), ".gemini", "skills"),
      ]
    : [resolve(process.cwd(), ".agents", "skills")];

  for (const target of targets) {
    const destination = join(target, "media-distribution", "SKILL.md");
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(skillPath, "SKILL.md"), destination);
  }
  return { synced: true, global, targets };
}
