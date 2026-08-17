import type { BatchOrderBody } from "./contracts/orders";

type GuidanceItem = {
  field: string;
  message: string;
  option?: string;
};

type GuidanceWarning = {
  code: string;
  message: string;
};

export type PublishGuidance = {
  channel: BatchOrderBody["channel"];
  requiredMissing: GuidanceItem[];
  optionalSuggestions: GuidanceItem[];
  contentWarnings: GuidanceWarning[];
};

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasVideo(content: string): boolean {
  return /<video\b/i.test(content);
}

function hasImage(content: string): boolean {
  return /<img\b/i.test(content);
}

export function buildPublishGuidance(payload: BatchOrderBody): PublishGuidance {
  const requiredMissing: GuidanceItem[] = [];
  const optionalSuggestions: GuidanceItem[] = [];
  const contentWarnings: GuidanceWarning[] = [];

  if (!hasText(payload.remark)) {
    optionalSuggestions.push({
      field: "remark",
      option: "--remark",
      message: "可以补充发布要求、位置偏好、标签、禁改要求或其他给媒体的备注。",
    });
  }

  if (!hasText(payload.customerName)) {
    optionalSuggestions.push({
      field: "customer",
      option: "--customer",
      message: "如需按客户归属统计或带入客户默认备注，可以指定客户资料。",
    });
  }

  if (payload.channel === "SHORT_VIDEO") {
    if (!hasText(payload.keyword)) {
      optionalSuggestions.push({
        field: "keyword",
        option: "--keyword",
        message: "短视频可补充话题关键词，便于媒体理解内容主题和发布标签。",
      });
    }
    if (!hasVideo(payload.content) && !hasImage(payload.content)) {
      contentWarnings.push({
        code: "SHORT_VIDEO_MEDIA_NOT_DETECTED",
        message: "正文中未检测到视频或图片素材，短视频渠道通常需要视频素材或图集素材。",
      });
    }
    optionalSuggestions.push(
      {
        field: "description",
        message: "短视频可在正文中补充描述、卖点、口播文案或发布说明；本地视频可通过 --video 上传。",
      },
      {
        field: "cover",
        message: "如渠道要求封面图，建议把封面图放入稿件正文或发布备注中说明。",
      },
    );
  }

  if (payload.channel === "WE_MEDIA") {
    if (payload.articleType === undefined) {
      optionalSuggestions.push({
        field: "articleType",
        option: "--article-type",
        message: "自媒体可指定内容类型：1 文章，2 图文/笔记，3 视频。",
      });
    }
    if (payload.accountRule === undefined) {
      optionalSuggestions.push({
        field: "accountRule",
        option: "--account-rule",
        message: "自媒体可指定账号规则：1、2 或 3，按上游平台规则执行。",
      });
    }
    if (payload.allowVideo === undefined) {
      optionalSuggestions.push({
        field: "allowVideo",
        option: "--allow-video",
        message: "自媒体可指定视频处理方式：0 图文，1 允许视频兜底，3 截图发布。",
      });
    }
    if (payload.articleType === 3 && !hasVideo(payload.content)) {
      contentWarnings.push({
        code: "WE_MEDIA_VIDEO_NOT_DETECTED",
        message: "已选择自媒体视频类型，但正文中未检测到 video 标签，请确认视频素材已放入稿件。",
      });
    }
  }

  if (payload.channel === "OVERSEAS") {
    optionalSuggestions.push(
      {
        field: "regionLanguage",
        option: "--remark",
        message: "海外媒体建议在备注中补充目标地区、语种、链接保留、署名和发布时间要求。",
      },
      {
        field: "source",
        option: "--remark",
        message: "如稿件来自官网、公告或外部链接，建议在备注中说明来源和是否允许编辑。",
      },
    );
  }

  if (payload.channel === "NEWS") {
    optionalSuggestions.push({
      field: "newsRequirements",
      option: "--remark",
      message: "新闻媒体可在备注中补充来源、栏目、是否带图、是否允许改标题等要求。",
    });
  }

  return {
    channel: payload.channel,
    requiredMissing,
    optionalSuggestions,
    contentWarnings,
  };
}
