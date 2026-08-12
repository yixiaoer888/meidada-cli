import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseScheduleOptions, readScheduleFile, writeScheduleFile } from "./schedule";

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("publish schedule files", () => {
  test("preserves an ordered draft queue and explicit spending limits", async () => {
    const payload = parseScheduleOptions({
      drafts: "draft-1,draft-2",
      channel: "news",
      media: "101,102",
      startAt: "2026-08-13T09:00:00+08:00",
      runAt: "09:00",
      timezone: "Asia/Shanghai",
      repeat: "daily",
      budgetPerRun: "300",
      budgetTotal: "5000",
      keepDraft: false,
      output: "schedule.json",
    });
    expect(payload).toMatchObject({
      draftIds: ["draft-1", "draft-2"],
      channel: "NEWS",
      mediaIds: [101, 102],
      repeat: "DAILY",
      budgetPerRun: 300,
      budgetTotal: 5000,
      keepDraft: false,
    });

    root = await mkdtemp(join(tmpdir(), "mdd-schedule-"));
    const file = join(root, "schedule.json");
    await writeScheduleFile(file, payload);
    const stored = await readScheduleFile(file);
    expect(stored.idempotencyKey).toStartWith("schedule-");
    expect(stored.payload).toEqual(JSON.parse(JSON.stringify(payload)));
  });

  test("rejects unsafe schedule inputs", () => {
    expect(() => parseScheduleOptions({
      drafts: "draft-1",
      channel: "news",
      media: "not-an-id",
      startAt: "2026-08-13T09:00:00+08:00",
      runAt: "25:00",
      timezone: "Asia/Shanghai",
      repeat: "daily",
      budgetPerRun: "0",
      output: "schedule.json",
    })).toThrow();

    expect(() => parseScheduleOptions({
      drafts: "draft-1",
      channel: "news",
      media: "101",
      startAt: "2026-08-13T09:00:00+08:00",
      runAt: "09:00",
      timezone: "Asia/Shanghai",
      repeat: "daily",
      budgetPerRun: "500",
      budgetTotal: "100",
      output: "schedule.json",
    })).toThrow("累计预算不能低于单次预算");
  });
});
