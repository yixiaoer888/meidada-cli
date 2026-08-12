import { z } from "zod";

export const scheduleRepeatSchema = z.enum(["ONCE", "DAILY"]);
export const scheduleStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "FAILED"]);

export const publishSchedulePayloadSchema = z.object({
  draftIds: z.array(z.string().min(1)).min(1).max(100),
  channel: z.enum(["NEWS", "WE_MEDIA", "OVERSEAS"]),
  mediaIds: z.array(z.number().int().positive()).min(1).max(50),
  customerId: z.string().min(1).optional(),
  remark: z.string().max(500).optional(),
  repeat: scheduleRepeatSchema,
  startAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(64),
  runAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "runAt 必须是 HH:mm"),
  budgetPerRun: z.number().positive(),
  budgetTotal: z.number().positive().optional(),
  keepDraft: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.budgetTotal !== undefined && value.budgetTotal < value.budgetPerRun) {
    context.addIssue({
      code: "custom",
      path: ["budgetTotal"],
      message: "累计预算不能低于单次预算",
    });
  }
});

export const publishScheduleSchema = z.object({
  id: z.string().min(1),
  status: scheduleStatusSchema,
  payload: publishSchedulePayloadSchema,
  nextRunAt: z.string().datetime().nullable(),
  lastRunAt: z.string().datetime().nullable(),
  spentTotal: z.string(),
  runCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PublishSchedulePayload = z.infer<typeof publishSchedulePayloadSchema>;
export type PublishSchedule = z.infer<typeof publishScheduleSchema>;
