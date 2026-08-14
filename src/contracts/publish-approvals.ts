import { z } from "zod";
import { batchOrderBody } from "./orders";

export const publishSourceDraftSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.string().datetime(),
  kind: z.enum(["DRAFT_BOX", "TEMPORARY_UPLOAD"]).default("DRAFT_BOX"),
});

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
  sourceDraft: publishSourceDraftSchema.optional(),
});

export const publishApprovalConfirmSchema = z.object({
  keepDraft: z.boolean().optional(),
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
  sourceDraft: publishSourceDraftSchema.nullable(),
  quote: publishApprovalQuoteSchema,
  confirmationUrl: z.string(),
  previewUrl: z.string().url().optional(),
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
export type PublishSourceDraft = z.infer<typeof publishSourceDraftSchema>;
