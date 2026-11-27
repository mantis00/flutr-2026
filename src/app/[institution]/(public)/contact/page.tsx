import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Mail, Phone, MapPin, Globe, Heart, HandHelping, ExternalLink } from "lucide-react";

import { getPublicInstitution } from "@/lib/queries/institution";
import {
  normalizeExternalHttpUrl,
  resolveInstitutionInvolvementLinks,
} from "@/lib/institution-links";
import { SOCIAL_ICONS } from "@/lib/social-icons";
import type { PublicInstitution } from "@/types/institution";

interface ContactPageProps {
  params: Promise<{ institution: string }>;
}

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const { institution: slug } = await params;
  const inst = await getPublicInstitution(slug);
  return {
    title: inst ? `Contact — ${inst.name}` : "Contact",
  };
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { institution: slug } = await params;
  const inst = await getPublicInstitution(slug);
  if (!inst) notFound();

  const socials = inst.social_links as PublicInstitution["social_links"];
  const websiteUrl = normalizeExternalHttpUrl(inst.website_url);
  const { donationUrl, volunteerUrl, hasDonationUrl, hasVolunteerUrl } =
    resolveInstitutionInvolvementLinks(inst);
  const activeSocials = SOCIAL_ICONS.filter((s) => {
    const url = socials?.[s.key];
    return url && /^https?:\/\//i.test(url);
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Contact Us</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          We&apos;d love to hear from you. Reach out with questions, plan a visit, or learn how to
          get involved.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact information card */}
        <section
          aria-labelledby="contact-heading"
          className="bg-card order-1 rounded-2xl border p-6 shadow-sm"
        >
          <h2 id="contact-heading" className="text-foreground mb-4 text-xl font-semibold">
            Get in Touch
          </h2>

          <div className="space-y-4">
            {/* Address */}
            <div className="flex items-start gap-3">
              <MapPin className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <address className="text-sm leading-relaxed not-italic">
                <p className="font-medium">{inst.name}</p>
                <p className="text-muted-foreground">{inst.street_address}</p>
                {inst.extended_address && (
                  <p className="text-muted-foreground">{inst.extended_address}</p>
                )}
                <p className="text-muted-foreground">
                  {inst.city}, {inst.state_province} {inst.postal_code}
                </p>
                <p className="text-muted-foreground">{inst.country}</p>
              </address>
            </div>

            {/* Email */}
            {inst.email_address && (
              <div className="flex items-center gap-3">
                <Mail className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                <a
                  href={`mailto:${inst.email_address}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {inst.email_address}
                </a>
              </div>
            )}

            {/* Phone */}
            {inst.phone_number && (
              <div className="flex items-center gap-3">
                <Phone className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                <a
                  href={`tel:${inst.phone_number}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  {inst.phone_number}
                </a>
              </div>
            )}

            {/* Website */}
            {websiteUrl && (
              <div className="flex items-center gap-3">
                <Globe className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                >
                  {websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in new tab)</span>
                </a>
              </div>
            )}

            {/* Social links */}
            {activeSocials.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  Follow Us
                </p>
                <div className="flex items-center gap-3">
                  {activeSocials.map((social) => {
                    const Icon = social.icon;
                    const url = socials![social.key]!;
                    return (
                      <a
                        key={social.key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground rounded-lg border p-2.5 transition-colors"
                        aria-label={`${social.label} (opens in new tab)`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Donations card */}
        {hasDonationUrl && (
          <section
            id="donate"
            aria-labelledby="donate-heading"
            className="bg-card order-3 rounded-2xl border p-6 shadow-sm lg:order-2"
          >
            <div className="mb-4 flex items-center gap-2">
              <Heart className="text-muted-foreground size-5" aria-hidden="true" />
              <h2 id="donate-heading" className="text-foreground text-xl font-semibold">
                Support {inst.name}
              </h2>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your generous donations help us care for our butterfly collection, fund conservation
              research, and maintain our educational programs.
            </p>
            <a
              href={donationUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              Donate to {inst.name}
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in new tab)</span>
            </a>
          </section>
        )}

        {/* Volunteering card */}
        {hasVolunteerUrl && (
          <section
            id="volunteer"
            aria-labelledby="volunteer-heading"
            className="bg-card order-2 rounded-2xl border p-6 shadow-sm lg:order-3 lg:col-span-2"
          >
            <div className="mb-4 flex items-center gap-2">
              <HandHelping className="text-muted-foreground size-5" aria-hidden="true" />
              <h2 id="volunteer-heading" className="text-foreground text-xl font-semibold">
                Volunteer With Us
              </h2>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Volunteers are the heart of {inst.name}. Learn about current opportunities and how to
              get involved.
            </p>
            <a
              href={volunteerUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              View volunteer opportunities
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in new tab)</span>
            </a>
          </section>
        )}
      </div>
    </div>
  );
}
