import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import JSZip from "jszip";

export type PublishContentType = "ARTICLE" | "IMAGE_NOTE" | "SHORT_VIDEO" | "UNKNOWN";
export type PublishConfidence = "HIGH" | "MEDIUM" | "LOW";

export type PublishDetectionInput = {
  draftId?: string;
  file?: string;
  video?: string;
  title?: string;
  mediaIds?: number[];
  channel?: string;
  keyword?: string;
  remark?: string;
  accountRule?: number;
  articleType?: number;
  allowVideo?: number;
  content?: string;
  imageCount?: number;
};

export type PublishDetection = {
  contentType: PublishContentType;
  confidence: PublishConfidence;
  recommendedCommand: "publish article" | "publish note" | "publish video" | "publish prepare";
  recommendedChannel: "news" | "we-media" | "short-video" | null;
  routeLocked: boolean;
  reasons: string[];
  requiredFields: string[];
  missingFields: string[];
  confirmationQuestions: string[];
  titlePlan: {
    currentTitle: string | null;
    needsTitle: boolean;
    supportsPerMediaTitles: boolean;
    shouldAskBeforeAutoDrafting: boolean;
    question: string | null;
  };
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countHtmlImages(value: string) {
  return (value.match(/<img\b/gi) ?? []).length;
}

async function countDocxImages(file: string) {
  const archive = await JSZip.loadAsync(await readFile(file));
  return Object.values(archive.files).filter((entry) => /^word\/media\//i.test(entry.name)).length;
}

async function inspectSource(input: PublishDetectionInput) {
  if (input.video) {
    return {
      kind: "video" as const,
      imageCount: 0,
      textLength: 0,
      hasVideo: true,
      reasons: ["检测到 --video，按短视频投放处理。"],
    };
  }

  const file = input.file;
  if (file) {
    const extension = extname(file).toLowerCase();
    if (VIDEO_EXTENSIONS.has(extension)) {
      return {
        kind: "video-file" as const,
        imageCount: 0,
        textLength: 0,
        hasVideo: true,
        reasons: [`检测到视频文件扩展名 ${extension}，按短视频投放处理。`],
      };
    }
    if (extension === ".html" || extension === ".htm") {
      const content = await readFile(file, "utf8");
      return {
        kind: "document" as const,
        imageCount: countHtmlImages(content),
        textLength: stripHtml(content).length,
        hasVideo: /<video\b/i.test(content),
        reasons: ["检测到 HTML 文件。"],
      };
    }
    if (extension === ".txt") {
      const content = await readFile(file, "utf8");
      return {
        kind: "document" as const,
        imageCount: 0,
        textLength: content.trim().length,
        hasVideo: false,
        reasons: ["检测到 TXT 文件。"],
      };
    }
    if (extension === ".docx") {
      return {
        kind: "document" as const,
        imageCount: await countDocxImages(file),
        textLength: 0,
        hasVideo: false,
        reasons: ["检测到 DOCX 文件。"],
      };
    }
  }

  if (input.content !== undefined) {
    return {
      kind: "draft" as const,
      imageCount: input.imageCount ?? countHtmlImages(input.content),
      textLength: stripHtml(input.content).length,
      hasVideo: /<video\b/i.test(input.content),
      reasons: ["检测到草稿内容。"],
    };
  }

  return {
    kind: "unknown" as const,
    imageCount: 0,
    textLength: 0,
    hasVideo: false,
    reasons: ["未检测到可识别的内容来源。"],
  };
}

function requiredFields(type: PublishContentType) {
  if (type === "SHORT_VIDEO") return ["video 或含视频的草稿", "title", "media"];
  if (type === "IMAGE_NOTE") return ["file 或 draft", "title", "media", "publish form", "publish rule"];
  if (type === "ARTICLE") return ["file 或 draft", "title", "media"];
  return ["content type", "file 或 draft 或 video", "title", "media"];
}

function missingFields(input: PublishDetectionInput, type: PublishContentType) {
  const missing: string[] = [];
  const hasSource = Boolean(input.draftId || input.file || input.video);
  if (!hasSource) missing.push("file/draft/video");
  if (type !== "UNKNOWN" && !hasText(input.title)) missing.push("title");
  if (!input.mediaIds || input.mediaIds.length === 0) missing.push("media");
  return missing;
}

function titlePlan(input: PublishDetectionInput, type: PublishContentType) {
  const needsTitle = type !== "UNKNOWN" && !hasText(input.title);
  return {
    currentTitle: hasText(input.title) ? input.title!.trim() : null,
    needsTitle,
    supportsPerMediaTitles: true,
    shouldAskBeforeAutoDrafting: Boolean(input.mediaIds && input.mediaIds.length > 1),
    question: input.mediaIds && input.mediaIds.length > 1
      ? "是否需要我按不同媒体分别拟定标题？确认后再生成多标题建议。"
      : null,
  };
}

export async function detectPublishContent(input: PublishDetectionInput): Promise<PublishDetection> {
  const source = await inspectSource(input);
  const reasons = [...source.reasons];
  let contentType: PublishContentType = "UNKNOWN";
  let confidence: PublishConfidence = "LOW";

  if (source.hasVideo) {
    contentType = "SHORT_VIDEO";
    confidence = "HIGH";
    reasons.push("内容中包含视频素材，匹配短视频表单。");
  } else if (input.articleType === 2) {
    contentType = "IMAGE_NOTE";
    confidence = "HIGH";
    reasons.push("--article-type=2 已明确指定图文/笔记。");
  } else if (input.articleType === 1) {
    contentType = "ARTICLE";
    confidence = "HIGH";
    reasons.push("--article-type=1 已明确指定文章。");
  } else if (source.imageCount >= 3) {
    contentType = "IMAGE_NOTE";
    confidence = "MEDIUM";
    reasons.push(`检测到 ${source.imageCount} 张图片，更像图文/笔记投放。`);
  } else if (source.kind === "document" || source.kind === "draft") {
    contentType = "ARTICLE";
    confidence = source.imageCount > 0 ? "MEDIUM" : "HIGH";
    reasons.push(
      source.imageCount > 0
        ? `检测到 ${source.imageCount} 张图片，文章和图文/笔记都可能适用。`
        : "未检测到视频或多图，默认按文章投放。",
    );
  }

  const recommendedCommand = contentType === "SHORT_VIDEO"
    ? "publish video"
    : contentType === "IMAGE_NOTE"
      ? "publish note"
      : contentType === "ARTICLE"
        ? "publish article"
        : "publish prepare";
  const recommendedChannel = contentType === "SHORT_VIDEO"
    ? "short-video"
    : contentType === "IMAGE_NOTE"
      ? "we-media"
      : contentType === "ARTICLE"
        ? "news"
        : null;
  const questions: string[] = [];
  if (confidence !== "HIGH") {
    questions.push("当前素材可能对应多个发布形态，请确认是文章、图文/笔记，还是短视频。");
  }
  if (contentType === "IMAGE_NOTE") {
    questions.push("请确认发布方式：图文发布、优先图文发布未通过则转短视频发布，还是优先图文发布未通过则截图发布。");
  }
  const plan = titlePlan(input, contentType);
  if (plan.question) questions.push(plan.question);
  if (contentType === "SHORT_VIDEO" && plan.needsTitle) questions.push("请补充短视频标题，或者确认先由 Agent 拟定标题再继续。");

  return {
    contentType,
    confidence,
    recommendedCommand,
    recommendedChannel,
    routeLocked: confidence === "HIGH",
    reasons,
    requiredFields: requiredFields(contentType),
    missingFields: missingFields(input, contentType),
    confirmationQuestions: questions,
    titlePlan: plan,
  };
}
