import { notFound } from "next/navigation";
import { getInstitutionBySlug } from "@/lib/queries/institution";
import { InstitutionDataProvider } from "@/components/providers/institution-provider";
import { readableForeground } from "@/lib/theme-color";
import type { PublicInstitution } from "@/types/institution";

interface InstitutionLayoutProps {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}

export default async function InstitutionLayout({ children, params }: InstitutionLayoutProps) {
  const { institution: slug } = await params;

  // Not filtered by public-site visibility: staff of a hidden institution still need
  // the admin area. Public routes are gated in `(public)/layout.tsx`.
  const found = await getInstitutionBySlug(slug);

  if (!found) notFound();

  const { public_site_live: _publicSiteLive, ...row } = found;
  const institution: PublicInstitution = {
    ...row,
    social_links: row.social_links as PublicInstitution["social_links"],
  };

  const primaryColor = institution.theme_colors?.[0];
  const primaryForeground = primaryColor ? readableForeground(primaryColor) : null;

  return (
    <InstitutionDataProvider institution={institution}>
      <div
        style={
          primaryColor
            ? ({
                "--primary": primaryColor,
                ...(primaryForeground ? { "--primary-foreground": primaryForeground } : {}),
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </InstitutionDataProvider>
  );
}
