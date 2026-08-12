import { describe, expect, test } from "bun:test";
import { updateCli, type ProcessResult, type UpdateDependencies } from "./update";
import { CLI_VERSION } from "./version";

const NEXT_VERSION = "0.4.0";
const BACKUP_NAME = `meidada-cli-${CLI_VERSION}.tgz`;

function dependencies(overrides: Partial<UpdateDependencies> = {}) {
  const commands: Array<{ executable: string; args: string[] }> = [];
  const value: UpdateDependencies = {
    fetch: async () => Response.json({ name: "@meidada-cn/cli", version: NEXT_VERSION }),
    resolveInstallContext: () => ({
      installRoot: "C:\\agent-runtime",
      packageRoot: "C:\\agent-runtime\\node_modules\\@meidada-cn\\cli",
      npmExecutable: "C:\\agent-runtime\\npm.cmd",
      cliExecutable: "C:\\agent-runtime\\mdd.cmd",
    }),
    runProcess: async (executable, args): Promise<ProcessResult> => {
      commands.push({ executable, args });
      return {
        code: 0,
        stdout: args[0] === "pack"
          ? JSON.stringify([{ filename: BACKUP_NAME }])
          : args[0] === "version" ? JSON.stringify({ version: NEXT_VERSION }) : "ok",
        stderr: "",
      };
    },
    ...overrides,
  };
  return { value, commands };
}

describe("CLI self update", () => {
  test("returns a preview without changing the installation", async () => {
    const setup = dependencies();
    const result = await updateCli({ confirmed: false }, setup.value);

    expect(result).toMatchObject({
      packageName: "@meidada-cn/cli",
      currentVersion: CLI_VERSION,
      latestVersion: NEXT_VERSION,
      updateAvailable: true,
      updated: false,
      confirmationRequired: true,
      installRoot: "C:\\agent-runtime",
    });
    expect(setup.commands).toEqual([]);
  });

  test("uses the current installation root and completes all work after one confirmation", async () => {
    const setup = dependencies();
    const result = await updateCli({ confirmed: true }, setup.value);

    expect(result).toMatchObject({
      currentVersion: NEXT_VERSION,
      updated: true,
      confirmationRequired: false,
      skillSynced: true,
      restartAgent: true,
    });
    expect(setup.commands).toHaveLength(7);
    expect(setup.commands[0]).toMatchObject({ executable: "C:\\agent-runtime\\npm.cmd" });
    expect(setup.commands[0]!.args.slice(0, 2)).toEqual(["pack", "C:\\agent-runtime\\node_modules\\@meidada-cn\\cli"]);
    expect(setup.commands[1]!.args.slice(0, 5)).toEqual([
      "install", "--global", "--prefix", "C:\\agent-runtime", `@meidada-cn/cli@${NEXT_VERSION}`,
    ]);
    expect(setup.commands[2]).toEqual({
      executable: "C:\\agent-runtime\\mdd.cmd",
      args: ["skill", "sync", "--global", "--json"],
    });
    expect(setup.commands[6]).toEqual({
      executable: "C:\\agent-runtime\\mdd.cmd",
      args: ["schedule", "--help"],
    });
  });

  test("stops before installation when npm returns an invalid package", async () => {
    const setup = dependencies({
      fetch: async () => Response.json({ name: "unexpected-package", version: NEXT_VERSION }),
    });

    await expect(updateCli({ confirmed: true }, setup.value)).rejects.toThrow("非预期包");
    expect(setup.commands).toEqual([]);
  });

  test("stops before installation when npm returns an invalid version", async () => {
    const setup = dependencies({
      fetch: async () => Response.json({ name: "@meidada-cn/cli", version: "latest" }),
    });

    await expect(updateCli({ confirmed: false }, setup.value)).rejects.toThrow("无效的 CLI 版本号");
    expect(setup.commands).toEqual([]);
  });

  test("restores the previous package when post-install verification fails", async () => {
    let versionChecks = 0;
    const setup = dependencies({
      runProcess: async (executable, args) => {
        setup.commands.push({ executable, args });
        if (args[0] === "pack") return { code: 0, stdout: JSON.stringify([{ filename: BACKUP_NAME }]), stderr: "" };
        if (args[0] === "version") {
          versionChecks += 1;
          return { code: 0, stdout: JSON.stringify({ version: CLI_VERSION }), stderr: "" };
        }
        return { code: 0, stdout: "ok", stderr: "" };
      },
    });

    await expect(updateCli({ confirmed: true }, setup.value))
      .rejects.toThrow(`已自动恢复 CLI ${CLI_VERSION}`);
    expect(versionChecks).toBe(1);
    expect(setup.commands.at(-1)?.args).toEqual([
      "install", "--global", "--prefix", "C:\\agent-runtime", expect.stringContaining(BACKUP_NAME), "--no-audit", "--no-fund",
    ]);
  });
});
