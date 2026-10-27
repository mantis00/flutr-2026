"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { institutionSlugSchema } from "@/lib/validation/slug";
import { buildProfileUpdateBody } from "@/lib/institution-profile-body";

import { InfoUse, SectionHeading } from "./section-info";
import type { InstitutionDetail, InstitutionDetailMode } from "./institution-detail-shell";

const PRESET_COLORS: { hex: string; label: string }[] = [
  { hex: "#0d9488", label: "Teal" },
  { hex: "#16a34a", label: "Green" },
  { hex: "#4f46e5", label: "Indigo" },
  { hex: "#ea580c", label: "Orange" },
  { hex: "#e11d48", label: "Rose" },
  { hex: "#475569", label: "Slate" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#7c3aed", label: "Violet" },
];

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

const profileFormSchema = z.object({
  // Identity
  name: z.string().min(1, "Name is required"),
  slug: institutionSlugSchema,
  main_header: z.string().max(120, "Keep the header under 120 characters").optional(),
  description: z.string().optional(),
  // Empty means the institution has no stored theme color — kept distinct
  // from a chosen one so saving an unrelated field can't invent a default.
  primary_color: z
    .string()
    .regex(HEX_REGEX, "Must be a valid hex color (#rrggbb)")
    .or(z.literal("")),

  // Media
  logo_url: z.string().url("Invalid URL").or(z.literal("")).optional(),
  facility_image_url: z.string().url("Invalid URL").or(z.literal("")).optional(),

  // Address
  street_address: z.string().min(1, "Street address is required"),
  extended_address: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state_province: z.string().min(1, "State / Province is required"),
  postal_code: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  time_zone: z.string().optional(),

  // Contact
  email_address: z.string().email("Invalid email address").or(z.literal("")).optional(),
  phone_number: z.string().optional(),
  website_url: z.string().url("Invalid URL").or(z.literal("")).optional(),
  volunteer_url: z.string().url("Invalid URL").or(z.literal("")).optional(),
  donation_url: z.string().url("Invalid URL").or(z.literal("")).optional(),

  // Social links (stored as individual fields, serialised on submit)
  social_twitter: z.string().optional(),
  social_instagram: z.string().optional(),
  social_facebook: z.string().optional(),
  social_linkedin: z.string().optional(),
  social_youtube: z.string().optional(),

  // Platform flags
  stats_active: z.boolean(),
  iabes_member: z.boolean(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface Props {
  institution: InstitutionDetail;
  onSaved: (institution: InstitutionDetail) => void;
  /** Lets the shell guard tab switches, which unmount this form. */
  onDirtyChange?: (dirty: boolean) => void;
  /** @default "platform" */
  mode?: InstitutionDetailMode;
  readOnly?: boolean;
}

type ProfileUpdateResponse = {
  institution?: Partial<InstitutionDetail> & {
    social_links?: Record<string, string> | null;
    theme_colors?: string[] | null;
  };
};

function defaultsFor(institution: InstitutionDetail): ProfileFormValues {
  return {
    name: institution.name,
    slug: institution.slug,
    main_header: institution.main_header ?? "",
    description: institution.description ?? "",
    primary_color: institution.theme_colors?.[0] ?? "",
    logo_url: institution.logo_url ?? "",
    facility_image_url: institution.facility_image_url ?? "",
    street_address: institution.street_address,
    extended_address: institution.extended_address ?? "",
    city: institution.city,
    state_province: institution.state_province,
    postal_code: institution.postal_code,
    country: institution.country,
    time_zone: institution.time_zone ?? "",
    email_address: institution.email_address ?? "",
    phone_number: institution.phone_number ?? "",
    website_url: institution.website_url ?? "",
    volunteer_url: institution.volunteer_url ?? "",
    donation_url: institution.donation_url ?? "",
    social_twitter: institution.social_links?.twitter ?? "",
    social_instagram: institution.social_links?.instagram ?? "",
    social_facebook: institution.social_links?.facebook ?? "",
    social_linkedin: institution.social_links?.linkedin ?? "",
    social_youtube: institution.social_links?.youtube ?? "",
    stats_active: institution.stats_active,
    iabes_member: institution.iabes_member,
  };
}

export default function InstitutionProfileTab({
  institution,
  onSaved,
  onDirtyChange,
  mode = "platform",
  readOnly = false,
}: Props) {
  const isTenant = mode === "tenant";
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: defaultsFor(institution),
  });

  const initialColor = institution.theme_colors?.[0] ?? "";
  const [isCustomColor, setIsCustomColor] = useState(
    !!initialColor && !PRESET_COLORS.some((c) => c.hex === initialColor),
  );
  const [logoPreview, setLogoPreview] = useState(institution.logo_url ?? "");
  const [facilityPreview, setFacilityPreview] = useState(institution.facility_image_url ?? "");
  // Rendered inside modals only, so reading it after mount avoids an SSR mismatch.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    form.reset(defaultsFor(institution));
    setLogoPreview(institution.logo_url ?? "");
    setFacilityPreview(institution.facility_image_url ?? "");
  }, [institution, form]);

  const hasUnsavedChanges = !readOnly && form.formState.isDirty;

  useUnsavedChangesWarning(hasUnsavedChanges);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
    // Clear the flag on unmount so a stale "dirty" can't outlive the form.
    return () => onDirtyChange?.(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  const slugValue = form.watch("slug");
  const primaryColor = form.watch("primary_color");
  const isValidHex = HEX_REGEX.test(primaryColor);
  const publicUrl = `${origin}/${institution.slug}`;

  async function onSubmit(values: ProfileFormValues) {
    const body = buildProfileUpdateBody(values, form.formState.dirtyFields, {
      isTenant,
      existingThemeColors: institution.theme_colors,
    });

    const [url, headers]: [string, Record<string, string>] = isTenant
      ? [
          "/api/tenant/institution",
          { "Content-Type": "application/json", "x-tenant-slug": institution.slug },
        ]
      : [`/api/platform/institutions/${institution.id}`, { "Content-Type": "application/json" }];

    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as ProfileUpdateResponse;
      const updatedInstitution = data.institution
        ? {
            ...institution,
            ...data.institution,
            social_links: data.institution.social_links ?? null,
            theme_colors: data.institution.theme_colors ?? institution.theme_colors,
          }
        : institution;

      // New baseline, so the unsaved-changes guard stops firing.
      form.reset(values);
      onSaved(updatedInstitution);
      toast.success("Institution updated.");
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        form.setError("slug", { message: "Slug is already in use." });
      } else {
        toast.error(data.message ?? "Failed to update institution.");
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-8">
        {readOnly && (
          <p className="text-muted-foreground text-sm">
            Only administrators can edit institution profile settings.
          </p>
        )}

        {/* Identity */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            title="Identity"
            summary="How your institution introduces itself on its public homepage."
          >
            <InfoUse
              heading="Main header and description"
              src="/docs/field-guide/identity-header.webp"
              alt="Homepage hero with the main header and description highlighted"
            >
              The main header replaces the default &ldquo;A World of Natural Wonder&rdquo; headline
              on your public homepage, and the description is the paragraph underneath it. Leave the
              main header blank to keep the default. Your homepage lives at{" "}
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium underline underline-offset-2"
              >
                {publicUrl}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </InfoUse>
            <InfoUse
              heading="Primary color"
              src="/docs/field-guide/identity-primary-color.webp"
              alt="Homepage with the accent word, live statistics card and active nav link highlighted"
            >
              The primary color is your accent across every public page: the highlighted word in the
              hero headline, the live statistics card, active navigation links, and buttons.
            </InfoUse>
          </SectionHeading>

          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Butterfly Haven" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isTenant && (
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="butterfly-haven" {...field} />
                    </FormControl>
                    <FormDescription>flutr.app/{slugValue || "…"}/gallery</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="main_header"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Main header{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="A World of Natural Wonder." {...field} />
                  </FormControl>
                  <FormDescription>
                    Replaces the default headline on your public homepage.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A brief description of the institution…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Primary color */}
            <div className="flex flex-col gap-3" role="group" aria-labelledby="primary-color-label">
              <p id="primary-color-label" className="text-sm font-medium">
                Primary color
              </p>

              {readOnly ? (
                <div className="flex items-center gap-3">
                  <div
                    role="img"
                    aria-label={`Primary color: ${primaryColor || "not set"}`}
                    className="size-8 rounded-full border"
                    style={{ backgroundColor: isValidHex ? primaryColor : undefined }}
                  />
                  <span className="text-muted-foreground font-mono text-sm">
                    {primaryColor || "Not set"}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {PRESET_COLORS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={label}
                        aria-pressed={!isCustomColor && primaryColor === hex}
                        onClick={() => {
                          setIsCustomColor(false);
                          form.setValue("primary_color", hex, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                        }}
                        className={cn(
                          "size-8 rounded-full border-2 transition-all",
                          !isCustomColor && primaryColor === hex
                            ? "border-foreground ring-2 ring-offset-2"
                            : "hover:border-muted-foreground/40 border-transparent",
                        )}
                        style={{ backgroundColor: hex }}
                      />
                    ))}

                    <button
                      type="button"
                      aria-label="Custom color"
                      aria-pressed={isCustomColor}
                      onClick={() => setIsCustomColor(true)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                        isCustomColor
                          ? "border-foreground bg-muted ring-2 ring-offset-2"
                          : "border-muted-foreground/40 hover:border-muted-foreground/60 bg-muted/50 border-dashed",
                      )}
                    >
                      +
                    </button>
                  </div>

                  {isCustomColor && (
                    <FormField
                      control={form.control}
                      name="primary_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom hex color</FormLabel>
                          <FormControl>
                            <Input placeholder="#4f46e5" maxLength={7} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}
            </div>
          </fieldset>
        </section>

        <Separator />

        {/* Media */}
        <section className="flex flex-col gap-4">
          <SectionHeading title="Media" summary="The two images that brand your public pages.">
            <InfoUse
              heading="Logo URL"
              src="/docs/field-guide/media-logo.webp"
              alt="Public site header with the logo slot highlighted"
            >
              The logo appears in the header of every public page and on your card in the Flutr
              institution directory. Without one, visitors see your initials instead.
            </InfoUse>
            <InfoUse
              heading="Facility image URL"
              src="/docs/field-guide/media-facility.webp"
              alt="Homepage hero with the facility image highlighted"
            >
              The facility image is the full-width background of your homepage hero. Without one,
              the hero falls back to an illustrated gradient.
            </InfoUse>
          </SectionHeading>

          <fieldset disabled={readOnly} className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="logo_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Logo URL <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com/logo.png"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          setLogoPreview(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {logoPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-16 w-auto rounded border object-contain"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  onLoad={(e) => ((e.target as HTMLImageElement).style.display = "")}
                />
              )}
            </div>

            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="facility_image_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Facility image URL{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com/facility.jpg"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          setFacilityPreview(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {facilityPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={facilityPreview}
                  alt="Facility image preview"
                  className="h-32 w-full rounded border object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  onLoad={(e) => ((e.target as HTMLImageElement).style.display = "")}
                />
              )}
            </div>
          </fieldset>
        </section>

        <Separator />

        {/* Address */}
        <section className="flex flex-col gap-4">
          <SectionHeading title="Address" summary="Where visitors are told to find you.">
            <InfoUse
              heading="Contact page"
              src="/docs/field-guide/address-contact-page.webp"
              alt="Contact page Get in Touch card with the address highlighted"
            >
              The full address is printed on your public contact page so visitors can plan a trip.
            </InfoUse>
            <InfoUse
              heading="Site footer"
              src="/docs/field-guide/site-footer.webp"
              alt="Public site footer with the address, email, website and social icons highlighted"
            >
              The street address also appears in the footer of every public page.
            </InfoUse>
            <InfoUse
              heading="Institution directory and statistics"
              src="/docs/field-guide/address-directory.webp"
              alt="Flutr directory card with the city, state and country line highlighted"
            >
              City, state, and country place your institution on the Flutr directory cards and on
              the public statistics map.
            </InfoUse>
          </SectionHeading>

          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="street_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Meadow Lane" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="extended_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Extended address{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Suite 200" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Springfield" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state_province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State / Province</FormLabel>
                    <FormControl>
                      <Input placeholder="IL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal code</FormLabel>
                    <FormControl>
                      <Input placeholder="62701" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="United States" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="time_zone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Time zone <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="America/Chicago" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
        </section>

        <Separator />

        {/* Contact */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            title="Contact"
            summary="How visitors reach you, and where those links lead."
          >
            <InfoUse
              heading="Email and phone"
              src="/docs/field-guide/contact-email-phone.webp"
              alt="Contact page with the email address and website link highlighted"
            >
              Email and phone are listed on your public contact page and in the footer of every
              public page, as links that open a mail client or dial the number.
            </InfoUse>
            <InfoUse
              heading="Website URL"
              src="/docs/field-guide/site-footer.webp"
              alt="Public site footer with the website link highlighted"
            >
              The website URL is linked from the footer and the contact page for visitors who want
              your main site.
            </InfoUse>
            <InfoUse
              heading="Volunteer and donation URLs"
              src="/docs/field-guide/contact-cta.webp"
              alt="Contact page with the donate and volunteer buttons highlighted"
            >
              These power the volunteer and donate call-to-action buttons. Leave one blank and its
              button is hidden instead of leading nowhere.
            </InfoUse>
          </SectionHeading>

          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Email address{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="hello@butterfly-haven.org" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Phone number{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+1 (555) 000-0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="website_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Website URL{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://butterfly-haven.org" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="volunteer_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Volunteer URL{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://example.org/volunteer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="donation_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Donation URL{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://example.org/donate" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
        </section>

        <Separator />

        {/* Social Links */}
        <section className="flex flex-col gap-4">
          <SectionHeading title="Social Links" summary="The accounts visitors can follow you on.">
            <InfoUse
              heading="Footer and contact page"
              src="/docs/field-guide/social-links.webp"
              alt="Contact page Follow us row with the social icons highlighted"
            >
              Each link you fill in adds its icon to the footer of every public page and to the
              &ldquo;Follow us&rdquo; row on the contact page. Blank fields show no icon.
            </InfoUse>
          </SectionHeading>

          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            {(
              [
                { name: "social_twitter", label: "Twitter / X" },
                { name: "social_instagram", label: "Instagram" },
                { name: "social_facebook", label: "Facebook" },
                { name: "social_linkedin", label: "LinkedIn" },
                { name: "social_youtube", label: "YouTube" },
              ] as const
            ).map(({ name, label }) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {label} <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </fieldset>
        </section>

        {!isTenant && (
          <>
            <Separator />

            {/* Platform Flags */}
            <section className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold">Platform Flags</h2>

              <fieldset disabled={readOnly} className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="stats_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Active on public stats</FormLabel>
                        <FormDescription>
                          Show this institution on the public statistics page
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="iabes_member"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-lg border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-0.5">
                        <FormLabel>IABES member</FormLabel>
                        <FormDescription>This institution is a member of IABES</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </fieldset>
            </section>
          </>
        )}

        {/* The action bar sticks to the bottom of the scroll area so the form
            never has to be scrolled to the end to save. `-mx-6` bleeds past
            the shell's padding so the bar spans the full panel width. */}
        {!readOnly && (
          <div className="bg-background sticky bottom-0 z-10 -mx-6 flex items-center justify-end gap-3 border-t px-6 py-4">
            {form.formState.isDirty && (
              <p className="text-muted-foreground text-sm" role="status">
                Unsaved changes
              </p>
            )}
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
