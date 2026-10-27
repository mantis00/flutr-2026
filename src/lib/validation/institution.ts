import { z } from "zod";
import { sanitizeText, sanitizedNonEmpty } from "@/lib/validation/sanitize";
import { institutionSlugSchema } from "@/lib/validation/slug";

/**
 * This file defines Zod schemas for validating institution-related data across the platform.
 * It includes:
 * 1. Parameter schemas for route parameters (e.g., institution ID, slug)
 * 2. Base field definitions for institution data (used in both platform and tenant schemas)
 * 3. Separate schemas for platform-level operations (superusers) and tenant-level operations (institution admins)
 * 4. Inferred TypeScript types for service layer inputs
 *
 * The goal is to have a single source of truth for institution data validation,
 * ensuring consistency and security across the application.
 */

/**
 * ----------------------------------------------------------------------
 * 1. PARAM SCHEMAS
 * ----------------------------------------------------------------------
 */

export const platformInstitutionIdParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

/**
 * ----------------------------------------------------------------------
 * 2. BASE SCHEMA (The single source of truth for institution fields)
 * ----------------------------------------------------------------------
 */

const baseInstitutionFields = {
  name: sanitizedNonEmpty(200),
  main_header: z.string().max(120).transform(sanitizeText).nullable().optional(),
  street_address: sanitizedNonEmpty(200),
  extended_address: z.string().max(200).transform(sanitizeText).optional(),
  city: sanitizedNonEmpty(100),
  state_province: sanitizedNonEmpty(100),
  postal_code: sanitizedNonEmpty(30),
  country: sanitizedNonEmpty(100),
  phone_number: z.string().max(50).transform(sanitizeText).optional(),
  email_address: z.string().trim().email().transform(sanitizeText).optional(),
  website_url: z.string().trim().url().transform(sanitizeText).optional(),
  volunteer_url: z.string().trim().url().transform(sanitizeText).nullable().optional(),
  donation_url: z.string().trim().url().transform(sanitizeText).nullable().optional(),
  facility_image_url: z.string().trim().url().transform(sanitizeText).nullable().optional(),
  logo_url: z.string().trim().url().transform(sanitizeText).nullable().optional(),
  description: z.string().max(2000).transform(sanitizeText).nullable().optional(),
};

/**
 * ----------------------------------------------------------------------
 * 3. PLATFORM SCHEMAS (SUPERUSER)
 * ----------------------------------------------------------------------
 */

export const platformCreateInstitutionSchema = z
  .object({
    ...baseInstitutionFields,

    // SUPERUSER defines slug on creation
    slug: institutionSlugSchema,

    // Optional fields not in baseInstitutionFields
    time_zone: z.string().max(100).optional(),
    theme_colors: z.array(z.string()).optional(),
    social_links: z.record(z.string(), z.string()).optional(),

    // Platform flags
    iabes_member: z.boolean().optional(),
    stats_active: z.boolean().optional(),
  })
  .strict();

export const platformUpdateInstitutionSchema = platformCreateInstitutionSchema.partial().strict();

/**
 * ----------------------------------------------------------------------
 * 4. TENANT SCHEMAS (Institution Admins)
 * ----------------------------------------------------------------------
 *
 * Tenants cannot:
 * - change slug
 * - modify iabes_member
 *
 * Tenant context is supplied via the x-tenant-slug header — not the request body.
 */

export const tenantUpdateInstitutionSchema = z
  .object({
    ...baseInstitutionFields,

    // Optional: decide if tenants can toggle their own visibility
    stats_active: z.boolean().optional(),

    // Fields not in baseInstitutionFields but present in the schema
    theme_colors: z.array(z.string()).optional(),
    social_links: z.record(z.string(), z.string()).optional(),
    time_zone: z.string().max(100).optional(),
  })
  .partial()
  .strict();

/**
 * ----------------------------------------------------------------------
 * 5. INFERRED TYPES
 * ----------------------------------------------------------------------
 */

export type PlatformCreateInstitutionInput = z.infer<typeof platformCreateInstitutionSchema>;
export type PlatformUpdateInstitutionInput = z.infer<typeof platformUpdateInstitutionSchema>;
export type TenantUpdateInstitutionInput = z.infer<typeof tenantUpdateInstitutionSchema>;
