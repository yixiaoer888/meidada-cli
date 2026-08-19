import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { batchOrderBody, type BatchOrderBody } from "./contracts/orders";
import type { CustomerProfile } from "./contracts/customers";
import type { Draft } from "./contracts/drafts";
import type { ApiClient } from "./api-client";
import { validatePublish } from "./publish";
import { importDocument, type ImportedDocument } from "./document-import";
import { uploadAsset } from "./assets";
import { stageError } from "./errors";

type BasePrepareOptions = {
  channel: BatchOrderBody["channel"];
  mediaIds: number[];
  customerId?: string;
  remark?: string;
  keyword?: string;
  accountRule?: BatchOrderBody["accountRule"];
  articleType?: BatchOrderBody["articleType"];
  allowVideo?: BatchOrderBody["allowVideo"];
  selection?: Record<string, unknown>;
  output: string;
};

type DraftPrepareOptions = BasePrepareOptions & {
  draftId: string;
  file?: never;
  video?: never;
  title?: never;
};

type FilePrepareOptions = BasePrepareOptions & {
  file: string;
  video?: never;
  title?: string;
  draftId?: never;
};

type VideoPrepareOptions = BasePrepareOptions & {
  video: string;
  title: string;
  draftId?: never;
  file?: never;
};

export async function preparePublish(
  client: ApiClient,
  options: DraftPrepareOptions | FilePrepareOptions | VideoPrepareOptions,
) {
  const [article, customer] = await Promise.all([
    readPublishArticle(client, options),
    options.customerId
      ? client.get<CustomerProfile>(`/customers/${encodeURIComponent(options.customerId)}`)
      : Promise.resolve(undefined),
  ]);
  if (!article.title.trim()) throw new Error("文章标题为空，不能生成投放表单");
  const preview = article.sourceDraft
    ? await client.post<{ url: string; expiresAt: string }>(`/drafts/${encodeURIComponent(article.sourceDraft.id)}/preview-share`)
    : null;

  const payload = batchOrderBody.parse({
    channel: options.channel,
    mediaIds: options.mediaIds,
    title: resolvePublishTitle(article.title, article.content),
    content: article.content,
    keyword: options.keyword,
    remark: options.remark || customer?.defaultRemark || undefined,
    customerName: customer?.name,
    accountRule: options.accountRule,
    articleType: options.articleType,
    allowVideo: options.allowVideo,
  });
  const validation = await validatePublish(client, payload);
  const campaign = {
    schemaVersion: "1",
    idempotencyKey: `mdd-${randomUUID()}`,
    ...(article.sourceDraft ? { sourceDraft: article.sourceDraft } : {}),
    ...(options.selection ? { selection: options.selection } : {}),
    ...(article.import ? { import: article.import } : {}),
    payload,
  };
  await writeFile(options.output, `${JSON.stringify(campaign, null, 2)}\n`, "utf8");
  return {
    output: options.output,
    sourceDraft: article.sourceDraft ?? null,
    import: article.import ?? null,
    previewUrl: preview?.url ?? null,
    payload,
    validation,
    orderCreated: false,
    draftCreated: false,
  };
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function blockText(html: string): string {
  return unescapeHtml(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstTextBlockTitle(content: string): string | undefined {
  const firstBlock = content.match(/^\s*<(h1|h2|h3|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i);
  if (!firstBlock) return undefined;
  const text = blockText(firstBlock[2] ?? "");
  return text.length > 0 && text.length <= 255 ? text : undefined;
}

function resolvePublishTitle(title: string, content: string): string {
  const contentTitle = firstTextBlockTitle(content);
  if (!contentTitle || contentTitle === title) return title;
  if (contentTitle.startsWith(title) && contentTitle.length > title.length) return contentTitle;
  return title;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readPublishArticle(client: ApiClient, options: DraftPrepareOptions | FilePrepareOptions | VideoPrepareOptions): Promise<{
  title: string;
  content: string;
  sourceDraft?: { id: string; updatedAt: string; kind: "DRAFT_BOX" };
  import?: Pick<ImportedDocument, "format" | "imageCount" | "warnings"> | { format: "VIDEO"; imageCount: 0; warnings: string[] };
}> {
  if (typeof options.video === "string") {
    if (options.channel !== "SHORT_VIDEO") throw new Error("--video 只支持 --channel short-video");
    const title = options.title.trim();
    if (!title) throw new Error("使用 --video 时必须通过 --title 指定短视频标题");
    const uploaded = await stageError("处理本地视频", () => uploadAsset(client, options.video));
    if (!uploaded.fileType.startsWith("video/")) throw new Error("--video 只支持视频文件");
    const content = `<video src="${escapeHtml(uploaded.accessUrl)}" controls preload="metadata"></video>`;
    return {
      title,
      content,
      import: { format: "VIDEO", imageCount: 0, warnings: [] },
    };
  }

  if (typeof options.file === "string") {
    const imported = await stageError("导入本地文档", () => importDocument(client, options.file, options.title));
    return {
      title: imported.title,
      content: imported.content,
      import: {
        format: imported.format,
        imageCount: imported.imageCount,
        warnings: imported.warnings,
      },
    };
  }

  const draft = await client.get<Draft>(`/drafts/${encodeURIComponent(options.draftId)}`);
  return {
    title: draft.title,
    content: draft.content,
    sourceDraft: { id: draft.id, updatedAt: draft.updatedAt, kind: "DRAFT_BOX" },
  };
}
