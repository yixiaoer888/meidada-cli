import { readFile } from "node:fs/promises";
import { batchOrderBody, type BatchOrderBody } from "./contracts/orders";
import { publishSourceDraftSchema, type PublishSourceDraft } from "./contracts/publish-approvals";
import type { ApiClient } from "./api-client";
import { buildPublishGuidance } from "./publish-guidance";

const CHANNEL_PATH = {
  NEWS: "news",
  WE_MEDIA: "we-media",
  OVERSEAS: "overseas",
  SHORT_VIDEO: "short-video",
} as const;

function channelPath(channel: BatchOrderBody["channel"]): string {
  if (!(channel in CHANNEL_PATH)) {
    throw new Error("CLI 投放仅支持新闻媒体、自媒体、海外媒体和短视频");
  }
  return CHANNEL_PATH[channel as keyof typeof CHANNEL_PATH];
}

export async function readPublishPayload(path: string): Promise<BatchOrderBody> {
  const parsedJson = JSON.parse(await readFile(path, "utf8")) as unknown;
  const payload = isCampaignFile(parsedJson) ? parsedJson.payload : parsedJson;
  const parsed = batchOrderBody.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`).join("; ");
    throw new Error(`投放文件校验失败：${issues}`);
  }
  return parsed.data;
}

export async function readPublishRequest(path: string): Promise<{
  payload: BatchOrderBody;
  sourceDraft?: PublishSourceDraft;
  idempotencyKey?: string;
}> {
  const parsedJson = JSON.parse(await readFile(path, "utf8")) as unknown;
  const payload = isCampaignFile(parsedJson) ? parsedJson.payload : parsedJson;
  const parsed = batchOrderBody.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`).join("; ");
    throw new Error(`投放文件校验失败：${issues}`);
  }
  return {
    payload: parsed.data,
    sourceDraft: isCampaignFile(parsedJson) && parsedJson.sourceDraft
      ? publishSourceDraftSchema.parse(parsedJson.sourceDraft)
      : undefined,
    idempotencyKey: isCampaignFile(parsedJson) ? parsedJson.idempotencyKey : undefined,
  };
}

function isCampaignFile(value: unknown): value is {
  schemaVersion: string;
  payload: unknown;
  idempotencyKey?: string;
  sourceDraft?: unknown;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const sourceDraft = candidate.sourceDraft as Record<string, unknown> | undefined;
  return typeof candidate.schemaVersion === "string"
    && "payload" in candidate
    && (sourceDraft === undefined || publishSourceDraftSchema.safeParse(sourceDraft).success)
    && (candidate.idempotencyKey === undefined || typeof candidate.idempotencyKey === "string");
}

export async function validatePublish(client: ApiClient, payload: BatchOrderBody) {
  const selectedChannelPath = channelPath(payload.channel);
  const [wallet, media] = await Promise.all([
    client.get<{ balance: string; frozenAmount: string }>("/wallet"),
    Promise.all(
      payload.mediaIds.map((mediaId) =>
        client.get<Record<string, unknown>>(`/media/${selectedChannelPath}/${mediaId}`).then((item) => ({
          mediaId,
          name: item.name,
          sellingPrice: item.sellingPrice,
        })),
      ),
    ),
  ]);
  const estimatedTotal = media.reduce((sum, item) => sum + Number(item.sellingPrice || 0), 0);
  return {
    valid: true,
    channel: payload.channel,
    media,
    mediaCount: media.length,
    estimatedTotal: estimatedTotal.toFixed(2),
    walletBalance: wallet.balance,
    balanceSufficient: Number(wallet.balance) >= estimatedTotal,
    guidance: buildPublishGuidance(payload),
  };
}
