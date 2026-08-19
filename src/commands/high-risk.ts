import { Command } from "commander";
import { createCommandContext } from "../runtime";
import { preparePublish } from "../prepare";
import { readPublishRequest, validatePublish } from "../publish";
import { detectPublishContent, type PublishContentType } from "../publish-detection";
import { parseScheduleOptions, readScheduleFile, writeScheduleFile, type SchedulePrepareOptions } from "../schedule";

const STATUS_DONE = new Set([-3, -2, -1, 2]);
const CHANNEL_MAP = {
  news: "NEWS",
  "we-media": "WE_MEDIA",
  overseas: "OVERSEAS",
  "short-video": "SHORT_VIDEO",
} as const;

function context(command: Command) {
  return createCommandContext(Boolean(command.optsWithGlobals().json));
}

function strict(command: Command) {
  return command.allowExcessArguments(false);
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function optionalInt<T extends number>(value: string | undefined, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !(allowed as readonly number[]).includes(parsed)) {
    throw new Error(`${label} 必须是 ${allowed.join("、")} 之一`);
  }
  return parsed as T;
}

function seconds(value: string | undefined, fallback: number, label: string) {
  const result = Number(value || fallback);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${label} 必须是大于 0 的数字`);
  return result;
}

type PublishPrepareOptions = {
  draft?: string;
  file?: string;
  video?: string;
  title?: string;
  channel?: string;
  media?: string;
  customer?: string;
  remark?: string;
  keyword?: string;
  contentType?: string;
  yes?: boolean;
  accountRule?: string;
  articleType?: string;
  allowVideo?: string;
  output: string;
};

type PublishContentMode = "prepare" | "article" | "note" | "video";

function addPublishPrepareOptions(command: Command, defaultChannel: string) {
  return strict(command)
    .option("--draft <draftId>", "草稿 ID")
    .option("--file <file>", "本地 DOCX、HTML 或 TXT 文章文件；投放时不会保存到草稿箱")
    .option("--video <file>", "本地短视频文件，仅支持 --channel short-video")
    .option("--title <title>", "覆盖本地文章标题或指定短视频标题")
    .option("--channel <channel>", "渠道", defaultChannel)
    .option("--media <ids>", "逗号分隔的媒体 ID")
    .option("--customer <customerId>", "客户 ID")
    .option("--remark <remark>", "备注")
    .option("--keyword <keyword>", "话题关键词")
    .option("--output <file>", "输出文件", "campaign.json")
    .option("--account-rule <value>", "自媒体账号规则：1、2 或 3，仅 --channel we-media 生效")
    .option("--article-type <value>", "自媒体内容类型：1 文章 / 2 图文或笔记 / 3 视频，仅 --channel we-media 生效")
    .option("--allow-video <value>", "自媒体视频处理：0 图文 / 1 允许视频兜底 / 3 截图发布，仅 --channel we-media 生效");
}

function addPublishDetectionOptions(command: Command) {
  return strict(command)
    .option("--draft <draftId>", "草稿 ID")
    .option("--file <file>", "本地 DOCX、HTML 或 TXT 内容文件")
    .option("--video <file>", "本地短视频文件")
    .option("--title <title>", "标题")
    .option("--channel <channel>", "渠道")
    .option("--media <ids>", "逗号分隔的媒体 ID")
    .option("--customer <customerId>", "客户 ID")
    .option("--remark <remark>", "备注")
    .option("--keyword <keyword>", "话题关键词")
    .option("--content-type <type>", "确认内容类型：article、note 或 video")
    .option("--account-rule <value>", "自媒体账号规则：1、2 或 3")
    .option("--article-type <value>", "自媒体内容类型：1 文章 / 2 图文或笔记 / 3 视频")
    .option("--allow-video <value>", "自媒体视频处理：0 图文 / 1 允许视频兜底 / 3 截图发布")
    .option("--output <file>", "输出文件", "campaign.json");
}

function addPublishAutoOptions(command: Command) {
  return addPublishDetectionOptions(command)
    .option("--yes", "确认继续使用自动检测结果");
}

function parseMediaIds(value: string | undefined, requiredMedia: boolean) {
  if (!value) {
    if (requiredMedia) throw new Error("请使用 --media 指定媒体 ID");
    return undefined;
  }
  const mediaIds = value.split(",").map((item) => Number(item.trim()));
  if (mediaIds.some((item) => !Number.isInteger(item))) throw new Error("--media 必须是逗号分隔的整数");
  return mediaIds;
}

function parseContentType(value: string | undefined): PublishContentType | undefined {
  if (value === undefined) return undefined;
  if (value === "article") return "ARTICLE";
  if (value === "note") return "IMAGE_NOTE";
  if (value === "video") return "SHORT_VIDEO";
  throw new Error("--content-type 必须是 article、note 或 video");
}

function channelForContentType(type: PublishContentType, fallback?: string) {
  if (fallback) return fallback as keyof typeof CHANNEL_MAP;
  if (type === "SHORT_VIDEO") return "short-video";
  if (type === "IMAGE_NOTE") return "we-media";
  return "news";
}

function allowedChannelsForContentType(type: PublishContentType): Array<keyof typeof CHANNEL_MAP> {
  if (type === "SHORT_VIDEO") return ["short-video"];
  if (type === "IMAGE_NOTE") return ["we-media"];
  if (type === "ARTICLE") return ["news", "overseas"];
  return [];
}

function assertContentTypeChannel(options: PublishPrepareOptions, type: PublishContentType) {
  const allowed = allowedChannelsForContentType(type);
  if (allowed.length === 0 || !options.channel) return;
  if (!allowed.includes(options.channel as keyof typeof CHANNEL_MAP)) {
    throw new Error(`--content-type ${options.contentType} 只能搭配 --channel ${allowed.join(" 或 ")}，当前传入的是 --channel ${options.channel}`);
  }
}

function prepareOptionsForContentType(options: PublishPrepareOptions, type: PublishContentType): PublishPrepareOptions {
  assertContentTypeChannel(options, type);
  const channel = channelForContentType(type, options.channel);
  const usesVideoFile = type === "SHORT_VIDEO" && !options.video && options.file;
  return {
    ...options,
    channel,
    file: usesVideoFile ? undefined : options.file,
    video: usesVideoFile ? options.file : options.video,
    articleType: type === "IMAGE_NOTE" ? options.articleType ?? "2" : type === "SHORT_VIDEO" && channel === "we-media" ? options.articleType ?? "3" : options.articleType,
    allowVideo: type === "IMAGE_NOTE" ? options.allowVideo ?? "0" : options.allowVideo,
  };
}

async function buildDetectionInput(options: PublishPrepareOptions, command: Command) {
  const contentType = parseContentType(options.contentType);
  if (contentType) assertContentTypeChannel(options, contentType);
  const mediaIds = parseMediaIds(options.media, false);
  const accountRule = optionalInt(options.accountRule, [1, 2, 3] as const, "--account-rule");
  const articleType = contentType === "ARTICLE"
    ? 1
    : contentType === "IMAGE_NOTE"
      ? 2
      : contentType === "SHORT_VIDEO"
        ? 3
        : optionalInt(options.articleType, [1, 2, 3] as const, "--article-type");
  const allowVideo = optionalInt(options.allowVideo, [0, 1, 3] as const, "--allow-video");
  if (!options.draft) {
    return {
      contentType,
      input: {
        draftId: options.draft,
        file: options.file,
        video: options.video,
        title: options.title,
        mediaIds,
        channel: options.channel,
        keyword: options.keyword,
        remark: options.remark,
        accountRule,
        articleType,
        allowVideo,
      },
    };
  }
  const ctx = context(command);
  const draft = await (await ctx.getClient()).get<{ title: string; content: string }>(`/drafts/${encodeURIComponent(options.draft)}`);
  return {
    contentType,
    input: {
      draftId: options.draft,
      file: options.file,
      video: options.video,
      title: options.title ?? draft.title,
      mediaIds,
      channel: options.channel,
      keyword: options.keyword,
      remark: options.remark,
      accountRule,
      articleType,
      allowVideo,
      content: draft.content,
    },
  };
}

function validatePublishMode(mode: PublishContentMode, options: PublishPrepareOptions) {
  if (!options.channel) throw new Error("channel 必须是 news、we-media、overseas 或 short-video");
  const channel = options.channel as keyof typeof CHANNEL_MAP;
  if (!(channel in CHANNEL_MAP)) throw new Error("channel 必须是 news、we-media、overseas 或 short-video");
  const sourceCount = [options.draft, options.file, options.video].filter(Boolean).length;
  if (sourceCount !== 1) throw new Error("请在 --file、--draft 或 --video 中三选一指定投放来源");

  if (mode === "note" && channel !== "we-media") {
    throw new Error("publish note 仅支持 --channel we-media");
  }
  if (mode === "video") {
    if (channel !== "short-video") throw new Error("--video 只支持 --channel short-video");
    if (!options.video) throw new Error("publish video 需要通过 --video 指定短视频文件");
    if (!options.title?.trim()) throw new Error("使用 --video 时必须通过 --title 指定短视频标题");
  } else if (mode !== "prepare" && options.video) {
    throw new Error(`${mode} 不支持 --video，请改用 --file 或 --draft`);
  }

  return channel;
}

async function runPublishPrepare(mode: PublishContentMode, options: PublishPrepareOptions, command: Command) {
  const ctx = context(command);
  const channel = validatePublishMode(mode, options);
  const mediaIds = parseMediaIds(options.media, true)!;
  const accountRule = optionalInt(options.accountRule, [1, 2, 3] as const, "--account-rule");
  const articleType = mode === "note"
    ? optionalInt(options.articleType ?? "2", [1, 2, 3] as const, "--article-type")
    : optionalInt(options.articleType, [1, 2, 3] as const, "--article-type");
  const allowVideo = mode === "note"
    ? optionalInt(options.allowVideo ?? "0", [0, 1, 3] as const, "--allow-video")
    : optionalInt(options.allowVideo, [0, 1, 3] as const, "--allow-video");
  if (channel !== "we-media" && (accountRule !== undefined || articleType !== undefined || allowVideo !== undefined)) {
    throw new Error("--account-rule、--article-type 和 --allow-video 仅支持 --channel we-media");
  }
  ctx.success("publish.prepare", await preparePublish(await ctx.getClient(), {
    ...(options.video
      ? { video: options.video, title: required(options.title, "使用 --video 时必须通过 --title 指定短视频标题") }
      : options.file
        ? { file: options.file, title: options.title }
        : { draftId: required(options.draft, "请使用 --draft 指定草稿 ID") }),
    channel: CHANNEL_MAP[channel],
    mediaIds,
    customerId: options.customer,
    remark: options.remark,
    keyword: options.keyword,
    accountRule,
    articleType,
    allowVideo,
    output: options.output,
  }));
}

function registerPublish(program: Command) {
  const publish = program.command("publish").description("准备、报价和确认投放");
  const payloadCommand = (action: "validate" | "dry-run" | "request" | "quote") => {
    const commandName = action === "quote" ? "request" : action;
    const description = commandName === "request" ? "创建待确认投放报价" : commandName === "dry-run" ? "模拟投放校验" : "校验投放文件";
    strict(publish.command(`${action} <payloadFile>`)).description(description)
      .action(async (payloadFile: string, _options, command: Command) => {
        const ctx = context(command);
        const client = await ctx.getClient();
        const request = await readPublishRequest(payloadFile);
        const payload = request.payload;
        const validation = await validatePublish(client, payload);
        if (commandName === "validate" || commandName === "dry-run") {
          ctx.success(`publish.${commandName}`, { ...validation, dryRun: commandName === "dry-run" });
          return;
        }
        if (!validation.balanceSufficient) throw new Error("余额不足，不能创建投放报价");
        const approval = await client.post<Record<string, unknown>>(
          "/publish-approvals",
          { payload, ...(request.sourceDraft ? { sourceDraft: request.sourceDraft } : {}) },
          request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : undefined,
        );
        ctx.success("publish.request", { ...approval, guidance: validation.guidance });
      });
  };
  payloadCommand("validate");
  payloadCommand("dry-run");
  payloadCommand("request");
  payloadCommand("quote");

  addPublishDetectionOptions(publish.command("detect").description("检测内容类型、推荐渠道和缺失字段"))
    .action(async (options: PublishPrepareOptions, command: Command) => {
      const ctx = context(command);
      const { contentType, input } = await buildDetectionInput(options, command);
      const detected = await detectPublishContent(input);
      ctx.success("publish.detect", {
        ...detected,
        ...(contentType ? {
          confirmedContentType: contentType,
          contentType,
          confidence: "HIGH",
          routeLocked: true,
        } : {}),
      });
    });

  addPublishAutoOptions(publish.command("auto").description("自动检测内容类型并准备投放文件"))
    .action(async (options: PublishPrepareOptions, command: Command) => {
      const ctx = context(command);
      const { contentType, input } = await buildDetectionInput(options, command);
      const detected = await detectPublishContent(input);
      const effectiveType = contentType ?? detected.contentType;
      const effectiveDetection = contentType
        ? {
            ...detected,
            confirmedContentType: contentType,
            contentType,
            confidence: "HIGH",
            routeLocked: true,
            confirmationQuestions: detected.confirmationQuestions.filter((question) => !question.includes("发布形态")),
          }
        : detected;
      const needsConfirmation = !contentType && detected.confidence !== "HIGH" && !options.yes;
      const missingFields = effectiveDetection.missingFields;
      if (needsConfirmation || missingFields.length > 0 || effectiveType === "UNKNOWN") {
        ctx.success("publish.auto.detect", {
          prepared: false,
          confirmationRequired: needsConfirmation || effectiveType === "UNKNOWN",
          missingFields,
          detection: effectiveDetection,
          nextQuestions: effectiveDetection.confirmationQuestions,
        });
        return;
      }
      const preparedOptions = prepareOptionsForContentType(options, effectiveType);
      await runPublishPrepare("prepare", preparedOptions, command);
    });

  addPublishPrepareOptions(publish.command("article").description("准备文章投放，默认使用新闻媒体渠道"), "news")
    .action((options: PublishPrepareOptions, command: Command) => runPublishPrepare("article", options, command));
  addPublishPrepareOptions(publish.command("note").description("准备图文/笔记投放，仅使用自媒体渠道"), "we-media")
    .action((options: PublishPrepareOptions, command: Command) => runPublishPrepare("note", options, command));
  addPublishPrepareOptions(publish.command("video").description("准备短视频投放，仅使用短视频渠道"), "short-video")
    .action((options: PublishPrepareOptions, command: Command) => runPublishPrepare("video", options, command));

  strict(publish.command("confirm <approvalId>")).description("确认并直接投放")
    .option("--yes", "兼容旧参数，当前可省略")
    .option("--keep-draft", "投放全部成功后仍保留来源草稿")
    .action(async (approvalId: string, options: { yes?: boolean; keepDraft?: boolean }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const path = `/publish-approvals/${encodeURIComponent(approvalId)}`;
      ctx.success("publish.confirm", await client.post(
        `${path}/confirm`,
        options.keepDraft ? { keepDraft: true } : {},
      ));
    });

  addPublishPrepareOptions(publish.command("prepare").description("准备投放文件"), "news")
    .action((options: PublishPrepareOptions, command: Command) => runPublishPrepare("prepare", options, command));

  const approval = publish.command("approval").description("查询投放审批");
  strict(approval.command("get <approvalId>")).description("查看审批").action(async (approvalId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("publish.approval.get", await (await ctx.getClient()).get(`/publish-approvals/${encodeURIComponent(approvalId)}`));
  });
  strict(approval.command("wait <approvalId>")).description("等待审批结果")
    .option("--interval <seconds>", "轮询间隔", "5")
    .option("--timeout <seconds>", "超时时间", "600")
    .action(async (approvalId: string, options: { interval: string; timeout: string }, command: Command) => {
      const ctx = context(command);
      const interval = seconds(options.interval, 5, "interval");
      const timeout = seconds(options.timeout, 600, "timeout");
      const deadline = Date.now() + timeout * 1000;
      const client = await ctx.getClient();
      while (true) {
        const approval = await client.get<{ status: string }>(`/publish-approvals/${encodeURIComponent(approvalId)}`);
        if (!["PENDING", "PROCESSING"].includes(approval.status)) {
          ctx.success("publish.approval.wait", approval);
          return;
        }
        if (Date.now() >= deadline) throw new Error(`等待用户确认超时（${timeout} 秒）`);
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
    });

  strict(publish.command("create")).description("直接投放（已禁用）").option("--yes", "确认直接投放").action(() => {
    throw new Error("CLI 已禁止直接投放或跳过报价。请先使用 publish request 获取报价，用户明确确认后再使用 publish confirm --yes");
  });
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function registerOrder(program: Command) {
  const order = program.command("order").description("查询和取消订单");
  strict(order.command("list")).description("列出订单")
    .option("--status <status>", "订单状态")
    .option("--keyword <keyword>", "关键词")
    .option("--page <page>", "页码")
    .option("--limit <limit>", "数量")
    .action(async (options: { status?: string; keyword?: string; page?: string; limit?: string }, command: Command) => {
      const ctx = context(command);
      ctx.success("order.list", await (await ctx.getClient()).get(`/orders${queryString(options)}`));
    });
  strict(order.command("get <orderNo>")).description("查看订单").action(async (orderNo: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("order.get", await (await ctx.getClient()).get(`/orders/${encodeURIComponent(orderNo)}`));
  });
  strict(order.command("wait <orderNo>")).description("等待订单完成")
    .option("--interval <seconds>", "轮询间隔", "10")
    .option("--timeout <seconds>", "超时时间", "600")
    .action(async (orderNo: string, options: { interval: string; timeout: string }, command: Command) => {
      const ctx = context(command);
      const interval = seconds(options.interval, 10, "interval");
      const timeout = seconds(options.timeout, 600, "timeout");
      const deadline = Date.now() + timeout * 1000;
      const client = await ctx.getClient();
      while (true) {
        const result = await client.post<{ status: number }>(`/orders/${encodeURIComponent(orderNo)}/sync`);
        if (STATUS_DONE.has(result.status)) {
          ctx.success("order.wait", result);
          return;
        }
        if (Date.now() >= deadline) throw new Error(`等待订单超时（${timeout} 秒）`);
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      }
    });
  strict(order.command("cancel <orderNo>")).description("取消订单").option("--yes", "确认取消").action(async (orderNo: string, options: { yes?: boolean }, command: Command) => {
    const ctx = context(command);
    const client = await ctx.getClient();
    const current = await client.get<{ orderNo: string; status: number; sellingPrice: string; mediaName: string }>(`/orders/${encodeURIComponent(orderNo)}`);
    if (current.status !== 0) throw new Error("只有未处理状态的订单可以取消");
    if (!options.yes) {
      ctx.success("order.cancel.preview", {
        cancellable: true,
        orderNo: current.orderNo,
        mediaName: current.mediaName,
        refundableAmount: current.sellingPrice,
        cancelled: false,
        nextCommand: `mdd order cancel ${current.orderNo} --yes`,
      });
      return;
    }
    ctx.success("order.cancel", await client.post(`/orders/${encodeURIComponent(orderNo)}/cancel`));
  });
}

function registerSchedule(program: Command) {
  const schedule = program.command("schedule").description("管理草稿定时投放计划");
  strict(schedule.command("prepare")).description("生成定时投放计划文件")
    .requiredOption("--drafts <ids>", "逗号分隔的草稿 ID")
    .requiredOption("--channel <channel>", "news、we-media、overseas 或 short-video")
    .requiredOption("--media <ids>", "逗号分隔的媒体 ID")
    .requiredOption("--start-at <iso>", "首次执行时间，ISO 8601")
    .requiredOption("--run-at <time>", "每天执行时间，HH:mm")
    .option("--timezone <iana>", "IANA 时区", "Asia/Shanghai")
    .option("--repeat <mode>", "once 或 daily", "daily")
    .requiredOption("--budget-per-run <amount>", "单次预算上限")
    .option("--budget-total <amount>", "累计预算上限")
    .option("--customer <customerId>", "客户 ID")
    .option("--remark <remark>", "备注")
    .option("--keyword <keyword>", "话题关键词")
    .option("--keep-draft", "投放成功后仍保留草稿")
    .option("--output <file>", "计划文件", "schedule.json")
    .action(async (options: SchedulePrepareOptions, command: Command) => {
      const ctx = context(command);
      const payload = parseScheduleOptions(options);
      const prepared = await (await ctx.getClient()).post<Record<string, unknown>>("/publish-schedules/prepare", payload);
      const file = await writeScheduleFile(options.output, payload);
      ctx.success("schedule.prepare", { ...file, server: prepared });
    });

  strict(schedule.command("request <scheduleFile>")).description("创建待确认的定时投放计划")
    .action(async (scheduleFile: string, _options, command: Command) => {
      const ctx = context(command);
      const file = await readScheduleFile(scheduleFile);
      ctx.success("schedule.request", await (await ctx.getClient()).post("/publish-schedules", { payload: file.payload }, file.idempotencyKey ? { "Idempotency-Key": file.idempotencyKey } : undefined));
    });

  strict(schedule.command("confirm <scheduleId>")).description("预览或激活定时投放计划")
    .option("--yes", "确认激活计划")
    .action(async (scheduleId: string, options: { yes?: boolean }, command: Command) => {
      const ctx = context(command);
      const client = await ctx.getClient();
      const path = `/publish-schedules/${encodeURIComponent(scheduleId)}`;
      if (!options.yes) {
        const value = await client.get<Record<string, unknown>>(path);
        const payload = value.payload && typeof value.payload === "object" ? value.payload as Record<string, unknown> : {};
        const draftIds = Array.isArray(payload.draftIds) ? payload.draftIds : [];
        const mediaIds = Array.isArray(payload.mediaIds) ? payload.mediaIds : [];
        ctx.success("schedule.confirm.preview", {
          ...value,
          confirmation: {
            draftIds,
            articleCount: draftIds.length,
            channel: payload.channel ?? null,
            mediaIds,
            mediaCount: mediaIds.length,
            repeat: payload.repeat ?? null,
            startAt: payload.startAt ?? null,
            runAt: payload.runAt ?? null,
            timezone: payload.timezone ?? null,
            budgetPerRun: payload.budgetPerRun ?? null,
            budgetTotal: payload.budgetTotal ?? null,
            keepDraft: payload.keepDraft ?? false,
            estimatedRunCount: payload.repeat === "ONCE" ? 1 : null,
          },
          confirmed: false,
          nextCommand: `mdd schedule confirm ${scheduleId} --yes`,
        });
        return;
      }
      ctx.success("schedule.confirm", await client.post(`${path}/confirm`, {}));
    });

  strict(schedule.command("list")).description("列出定时计划").action(async (_options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.list", await (await ctx.getClient()).get("/publish-schedules"));
  });
  strict(schedule.command("get <scheduleId>")).description("查看定时计划").action(async (scheduleId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.get", await (await ctx.getClient()).get(`/publish-schedules/${encodeURIComponent(scheduleId)}`));
  });
  strict(schedule.command("runs <scheduleId>")).description("查看执行记录").action(async (scheduleId: string, _options, command: Command) => {
    const ctx = context(command);
    ctx.success("schedule.runs", await (await ctx.getClient()).get(`/publish-schedules/${encodeURIComponent(scheduleId)}/runs`));
  });

  for (const action of ["pause", "resume", "cancel"] as const) {
    const description = action === "pause" ? "暂停定时计划" : action === "resume" ? "恢复定时计划" : "取消定时计划";
    strict(schedule.command(`${action} <scheduleId>`)).description(description).option("--yes", "确认操作")
      .action(async (scheduleId: string, options: { yes?: boolean }, command: Command) => {
        const ctx = context(command);
        const client = await ctx.getClient();
        const path = `/publish-schedules/${encodeURIComponent(scheduleId)}/${action}`;
        if (!options.yes) {
          const schedule = await client.get(`/publish-schedules/${encodeURIComponent(scheduleId)}`);
          ctx.success(`schedule.${action}.preview`, { schedule, action, confirmed: false, nextCommand: `mdd schedule ${action} ${scheduleId} --yes` });
          return;
        }
        ctx.success(`schedule.${action}`, await client.post(path, {}));
      });
  }
}

export function registerHighRiskCommands(program: Command) {
  registerPublish(program);
  registerSchedule(program);
  registerOrder(program);
}
