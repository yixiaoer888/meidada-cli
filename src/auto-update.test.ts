import { describe, expect, test } from "bun:test";
import { autoUpdateCli, type AutoUpdateDependencies } from "./auto-update";

const NOW = new Date("2026-08-13T02:00:00.000Z");

function dependencies(overrides: Partial<AutoUpdateDependencies> = {}) {
  const writes: unknown[] = [];
  let checks = 0;
  const value: AutoUpdateDependencies = {
    now: () => NOW,
    readState: async () => null,
    writeState: async (state) => { writes.push(state); },
    check: async () => { checks += 1; return { updateAvailable: true }; },
    ...overrides,
  };
  return { value, writes, checks: () => checks };
}

describe("automatic CLI version checks", () => {
  test("only checks before a regular command and records success", async () => {
    const setup = dependencies();
    expect(await autoUpdateCli(["schedule", "--json"], setup.value)).toEqual({ checked: true, updated: false, updateAvailable: true });
    expect(setup.checks()).toBe(1);
    expect(setup.writes).toEqual([
      { lastAttemptAt: NOW.toISOString() },
      { lastAttemptAt: NOW.toISOString(), lastSuccessAt: NOW.toISOString() },
    ]);
  });

  test("checks at most once per day after success", async () => {
    const setup = dependencies({
      readState: async () => ({ lastAttemptAt: "2026-08-12T12:00:00.000Z", lastSuccessAt: "2026-08-12T12:00:00.000Z" }),
    });
    expect(await autoUpdateCli(["schedule"], setup.value)).toEqual({ checked: false, updated: false });
    expect(setup.checks()).toBe(0);
  });

  test("retries one hour after a failed check", async () => {
    const setup = dependencies({ readState: async () => ({ lastAttemptAt: "2026-08-13T00:00:00.000Z" }) });
    expect(await autoUpdateCli(["schedule"], setup.value)).toEqual({ checked: true, updated: false, updateAvailable: true });
  });

  test("does not interrupt commands when updating fails", async () => {
    const setup = dependencies({ check: async () => { throw new Error("offline"); } });
    expect(await autoUpdateCli(["schedule"], setup.value)).toEqual({ checked: true, updated: false });
  });

  test("skips updater commands and supports opt-out", async () => {
    const setup = dependencies();
    expect(await autoUpdateCli(["version", "--json"], setup.value)).toEqual({ checked: false, updated: false });
    expect(await autoUpdateCli(["auth", "status"], setup.value)).toEqual({ checked: false, updated: false });
    expect(await autoUpdateCli(["config", "init"], setup.value)).toEqual({ checked: false, updated: false });
    expect(await autoUpdateCli(["doctor"], setup.value)).toEqual({ checked: false, updated: false });
    expect(await autoUpdateCli(["schedule", "--help"], setup.value)).toEqual({ checked: false, updated: false });
    const previous = process.env.MDD_AUTO_UPDATE;
    process.env.MDD_AUTO_UPDATE = "0";
    try {
      expect(await autoUpdateCli(["doctor"], setup.value)).toEqual({ checked: false, updated: false });
    } finally {
      if (previous === undefined) delete process.env.MDD_AUTO_UPDATE;
      else process.env.MDD_AUTO_UPDATE = previous;
    }
    expect(setup.checks()).toBe(0);
  });
});
