import { z } from "zod";

export const customerProfileBody = z.object({
  name: z.string().trim().min(1).max(100),
  contactName: z.string().trim().max(100).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  signature: z.string().trim().max(200).optional(),
  defaultRemark: z.string().trim().max(2000).optional(),
  industry: z.string().trim().max(100).optional(),
});

export const customerProfileSchema = customerProfileBody.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CustomerProfileBody = z.infer<typeof customerProfileBody>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
