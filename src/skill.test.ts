import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentSkillDirectories, bundledSkillContent, resolveSkillTarget, syncSkill } from "./skill";

describe("Agent Skill synchronization", () => {
  test("maps each supported Agent to one user-level directory", () => {
    const home = join("C:\\Users", "tester");
    const expected = {
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

    expect(agentSkillDirectories).toEqual(expected);
    for (const [agent, segments] of Object.entries(expected)) {
      expect(resolveSkillTarget({ global: true, agent: agent as keyof typeof expected }, { home, cwd: "C:\\repo" }))
        .toBe(join(home, ...segments));
    }
  });

  test("defaults to the current project and refuses an unscoped global write", () => {
    expect(resolveSkillTarget({}, { home: "C:\\Users\\tester", cwd: "C:\\repo" }))
      .toBe(join("C:\\repo", ".agents", "skills"));
    expect(() => resolveSkillTarget({ global: true }, { home: "C:\\Users\\tester", cwd: "C:\\repo" }))
      .toThrow("全局同步必须指定 --agent");
    expect(() => resolveSkillTarget({ agent: "codex" }, { home: "C:\\Users\\tester", cwd: "C:\\repo" }))
      .toThrow("--agent 仅用于 --global");
  });

  test("supports dry-run and requires force before overwriting different content", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdd-skill-test-"));
    const destination = join(root, "media-distribution", "SKILL.md");
    try {
      const preview = await syncSkill({ targetDir: root, dryRun: true });
      expect(preview).toMatchObject({ dryRun: true, changed: true, created: false, overwritten: false });
      expect(await readFile(destination, "utf8").catch(() => null)).toBeNull();

      const created = await syncSkill({ targetDir: root });
      expect(created).toMatchObject({ synced: true, created: true, overwritten: false });
      expect(await readFile(destination, "utf8")).toBe(bundledSkillContent());

      await writeFile(destination, "user customization\n", "utf8");
      await expect(syncSkill({ targetDir: root })).rejects.toThrow("--force 覆盖");
      const overwritten = await syncSkill({ targetDir: root, force: true });
      expect(overwritten).toMatchObject({ overwritten: true, changed: true });
      expect(await readFile(destination, "utf8")).toBe(bundledSkillContent());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("creates only the explicitly selected custom target", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdd-skill-target-"));
    const selected = join(root, "selected");
    const untouched = join(root, "other", "media-distribution", "SKILL.md");
    try {
      await mkdir(join(root, "other"), { recursive: true });
      const result = await syncSkill({ targetDir: selected });
      expect(result.targets).toEqual([selected]);
      expect(await readFile(untouched, "utf8").catch(() => null)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
