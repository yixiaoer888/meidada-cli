import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { publishSchedulePayloadSchema, type PublishSchedulePayload } from "./contracts/publish-schedules";

const CHANNELS = { news: "NEWS", "we-media": "WE_MEDIA", overseas: "OVERSEAS" } as const;

export type SchedulePrepareOptions = {
  drafts: string;
  channel: string;
  media: string;
  startAt: string;
  runAt: string;
  timezone: string;
  repeat: string;
  budgetPerRun: string;
  budgetTotal?: string;
  customer?: string;
  remark?: string;
  keepDraft?: boolean;
  output: string;
};

export function parseScheduleOptions(options: SchedulePrepareOptions): PublishSchedulePayload {
  const channel = CHANNELS[options.channel as keyof typeof CHANNELS];
  if (!channel) throw new Error("channel 必须是 news、we-media 或 overseas");
  const draftIds = options.drafts.split(",").map((value) => value.trim()).filter(Boolean);
  const mediaIds = options.media.split(",").map((value) => Number(value.trim()));
  if (mediaIds.some((value) => !Number.isInteger(value) || value <= 0)) throw new Error("--media 必须是逗号分隔的正整数");
  const budgetPerRun = Number(options.budgetPerRun);
  const budgetTotal = options.budgetTotal === undefined ? undefined : Number(options.budgetTotal);
  if (!Number.isFinite(budgetPerRun) || budgetPerRun <= 0) throw new Error("--budget-per-run 必须是大于 0 的数字");
  if (budgetTotal !== undefined && (!Number.isFinite(budgetTotal) || budgetTotal <= 0)) throw new Error("--budget-total 必须是大于 0 的数字");
  return parseSchedulePayload({
    draftIds,
    channel,
    mediaIds,
    customerId: options.customer,
    remark: options.remark,
    repeat: options.repeat.toUpperCase(),
    startAt: options.startAt,
    timezone: options.timezone,
    runAt: options.runAt,
    budgetPerRun,
    budgetTotal,
    keepDraft: options.keepDraft ?? false,
  });
}

export function parseSchedulePayload(value: unknown): PublishSchedulePayload {
  const parsed = publishSchedulePayloadSchema.safeParse(value);
  if (!parsed.success) throw new Error(`定时投放计划校验失败：${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: parsed.data.timezone }).format();
  } catch {
    throw new Error(`无效的 IANA 时区：${parsed.data.timezone}`);
  }
  return parsed.data;
}

export async function readScheduleFile(path: string) {
  const value = JSON.parse(await readFile(path, "utf8")) as { schemaVersion?: unknown; payload?: unknown; idempotencyKey?: unknown };
  if (value.schemaVersion !== "1") throw new Error("不支持的定时投放计划文件版本");
  if (value.idempotencyKey !== undefined && typeof value.idempotencyKey !== "string") throw new Error("定时投放计划幂等键无效");
  return { payload: parseSchedulePayload(value.payload), idempotencyKey: value.idempotencyKey };
}

export async function writeScheduleFile(path: string, payload: PublishSchedulePayload) {
  const idempotencyKey = `schedule-${randomUUID()}`;
  const value = { schemaVersion: "1", payload, idempotencyKey };
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { output: path, idempotencyKey, payload };
}
