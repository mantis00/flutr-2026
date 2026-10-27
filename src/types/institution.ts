import type { institutions } from "@/lib/schema";

type Institution = typeof institutions.$inferSelect;

export type SocialLinks = {
  x?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
};

export type PublicInstitution = Pick<
  Institution,
  | "id"
  | "name"
  | "main_header"
  | "description"
  | "street_address"
  | "extended_address"
  | "city"
  | "state_province"
  | "postal_code"
  | "country"
  | "email_address"
  | "phone_number"
  | "website_url"
  | "volunteer_url"
  | "donation_url"
  | "logo_url"
  | "facility_image_url"
  | "theme_colors"
> & {
  social_links?: SocialLinks | null;
};
