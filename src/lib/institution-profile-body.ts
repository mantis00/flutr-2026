import { pickInstitutionUrlFields } from "@/lib/institution-form-url-fields";

const SOCIAL_FIELDS = [
  "social_twitter",
  "social_instagram",
  "social_facebook",
  "social_linkedin",
  "social_youtube",
] as const;

export interface ProfileBodyValues {
  name: string;
  slug: string;
  main_header?: string;
  description?: string;
  primary_color: string;
  logo_url?: string;
  facility_image_url?: string;
  street_address: string;
  extended_address?: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  time_zone?: string;
  email_address?: string;
  phone_number?: string;
  website_url?: string;
  volunteer_url?: string;
  donation_url?: string;
  social_twitter?: string;
  social_instagram?: string;
  social_facebook?: string;
  social_linkedin?: string;
  social_youtube?: string;
  stats_active: boolean;
  iabes_member: boolean;
}

/** React Hook Form's `dirtyFields` — only edited keys are present and true. */
export type DirtyProfileFields = Partial<Record<keyof ProfileBodyValues, boolean>>;

interface BuildOptions {
  /** Tenants can't change the slug or the platform flags. */
  isTenant: boolean;
  /** Stored colors beyond the first, which this form never edits. */
  existingThemeColors?: string[] | null;
}

/** Blank input clears the stored value instead of leaving the old one behind. */
function blankAsNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

/**
 * PATCH body holding only the fields the user actually edited.
 *
 * The form snapshot is taken at load, so sending untouched fields would
 * revert anyone who saved in between — including `theme_colors`, which used
 * to live on its own tab and is now submitted alongside everything else.
 */
export function buildProfileUpdateBody(
  values: ProfileBodyValues,
  dirtyFields: DirtyProfileFields,
  { isTenant, existingThemeColors }: BuildOptions,
): Record<string, unknown> {
  const edited = <T>(field: keyof ProfileBodyValues, payload: T) =>
    dirtyFields[field] ? payload : {};

  const socialLinks: Record<string, string> = {};
  if (values.social_twitter) socialLinks.twitter = values.social_twitter;
  if (values.social_instagram) socialLinks.instagram = values.social_instagram;
  if (values.social_facebook) socialLinks.facebook = values.social_facebook;
  if (values.social_linkedin) socialLinks.linkedin = values.social_linkedin;
  if (values.social_youtube) socialLinks.youtube = values.social_youtube;

  const extraColors = existingThemeColors?.slice(1) ?? [];

  return {
    ...edited("name", { name: values.name }),
    ...(!isTenant ? edited("slug", { slug: values.slug }) : {}),
    ...edited("main_header", { main_header: blankAsNull(values.main_header) }),
    ...edited("description", { description: blankAsNull(values.description) }),
    ...edited("primary_color", {
      theme_colors: values.primary_color ? [values.primary_color, ...extraColors] : extraColors,
    }),
    ...edited("logo_url", { logo_url: blankAsNull(values.logo_url) }),
    ...edited("facility_image_url", {
      facility_image_url: blankAsNull(values.facility_image_url),
    }),
    ...edited("street_address", { street_address: values.street_address }),
    ...(dirtyFields.extended_address && values.extended_address
      ? { extended_address: values.extended_address }
      : {}),
    ...edited("city", { city: values.city }),
    ...edited("state_province", { state_province: values.state_province }),
    ...edited("postal_code", { postal_code: values.postal_code }),
    ...edited("country", { country: values.country }),
    ...(dirtyFields.time_zone && values.time_zone ? { time_zone: values.time_zone } : {}),
    ...(dirtyFields.email_address && values.email_address
      ? { email_address: values.email_address }
      : {}),
    ...(dirtyFields.phone_number && values.phone_number
      ? { phone_number: values.phone_number }
      : {}),
    ...(dirtyFields.website_url && values.website_url ? { website_url: values.website_url } : {}),
    ...pickInstitutionUrlFields(
      {
        volunteer_url: dirtyFields.volunteer_url ? values.volunteer_url : undefined,
        donation_url: dirtyFields.donation_url ? values.donation_url : undefined,
      },
      { blankAsNull: true },
    ),
    ...(SOCIAL_FIELDS.some((field) => dirtyFields[field]) ? { social_links: socialLinks } : {}),
    ...(!isTenant
      ? {
          ...edited("stats_active", { stats_active: values.stats_active }),
          ...edited("iabes_member", { iabes_member: values.iabes_member }),
        }
      : {}),
  };
}
