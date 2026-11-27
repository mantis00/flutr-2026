import { z } from "zod";

import { sanitizeText, sanitizedNonEmpty } from "@/lib/validation/sanitize";

// Tenant context is supplied via the x-tenant-slug header — not the request body.

export const createNewsSchema = z
  .object({
    title: sanitizedNonEmpty(200),
    content: z.string().min(1).max(10000).transform(sanitizeText),
    image_url: z.string().trim().url().transform(sanitizeText).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export const updateNewsSchema = z
  .object({
    title: sanitizedNonEmpty(200).optional(),
    content: z.string().min(1).max(10000).transform(sanitizeText).optional(),
    image_url: z.string().trim().url().transform(sanitizeText).optional(),
    is_active: z.boolean().optional(),
    show_on_homepage: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.title === undefined &&
      data.content === undefined &&
      data.image_url === undefined &&
      data.is_active === undefined &&
      data.show_on_homepage === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided",
      });
    }
  });

export const newsIdParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type NewsIdParams = z.infer<typeof newsIdParamsSchema>;
