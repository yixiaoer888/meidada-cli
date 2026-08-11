import { z } from "zod";
import { batchOrderBody } from "./orders";

export const publishApprovalStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "CONFIRMED",
  "REJECTED",
  "EXPIRED",
  "PRICE_CHANGED",
  "DRAFT_CHANGED",
  "FAILED",
]);

export const publishApprovalRequestSchema = z.object({
  payload: batchOrderBody,
  sourceDraft: z.object({
    id: z.string().min(1),
    updatedAt: z.string().datetime(),
  }).optional(),
});

export const publishApprovalConfirmSchema = z.object({
  keepDraft: z.boolean().optional().default(false),
});

export const draftDispositionSchema = z.enum([
  "DELETED",
  "KEPT",
  "KEPT_PARTIAL_FAILURE",
  "NOT_APPLICABLE",
  "DELETE_FAILED",
]);

export const publishApprovalQuoteItemSchema = z.object({
  mediaId: z.number().int(),
  mediaName: z.string(),
  sellingPrice: z.string(),
});

export const publishApprovalQuoteSchema = z.object({
  items: z.array(publishApprovalQuoteItemSchema),
  total: z.string(),
  walletBalance: z.string(),
  balanceAfter: z.string(),
  balanceSufficient: z.boolean(),
});

export const publishApprovalSchema = z.object({
  id: z.string(),
  status: publishApprovalStatusSchema,
  payload: batchOrderBody,
  sourceDraft: z.object({
    id: z.string(),
    updatedAt: z.string(),
  }).nullable(),
  quote: publishApprovalQuoteSchema,
  confirmationUrl: z.string(),
  results: z.array(z.object({
    mediaId: z.number().int(),
    ok: z.boolean(),
    orderNo: z.string().optional(),
    previewUrl: z.string().url().optional(),
    error: z.string().optional(),
  })).nullable(),
  draftDisposition: draftDispositionSchema.nullable(),
  expiresAt: z.string(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PublishApproval = z.infer<typeof publishApprovalSchema>;
export type PublishApprovalQuote = z.infer<typeof publishApprovalQuoteSchema>;
export type PublishApprovalStatus = z.infer<typeof publishApprovalStatusSchema>;
export type PublishApprovalRequest = z.infer<typeof publishApprovalRequestSchema>;
export type PublishApprovalConfirm = z.infer<typeof publishApprovalConfirmSchema>;
export type DraftDisposition = z.infer<typeof draftDispositionSchema>;
