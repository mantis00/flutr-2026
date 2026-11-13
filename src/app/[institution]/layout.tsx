import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { canCrossTenant, requireUser } from "@/lib/authz";
import { getInstitutionBySlug } from "@/lib/queries/institution";
import { InstitutionDataProvider } from "@/components/providers/institution-provider";
import { readableForeground } from "@/lib/theme-color";
import type { PublicInstitution } from "@/types/institution";

interface InstitutionLayoutProps {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}

async function viewerIsStaff(slug: string): Promise<boolean> {
  const session = await auth();
  try {
    const user = requireUser(session);
    return canCrossTenant(user) || session?.user?.institutionSlug === slug;
  } catch {
    return false;
  }
}

export default async function InstitutionLayout({ children, params }: InstitutionLayoutProps) {
  const { institution: slug } = await params;

  // Not filtered by public-site visibility: staff of a hidden institution still need
  // the admin area. Public routes are gated in `(public)/layout.tsx`.
  const found = await getInstitutionBySlug(slug);

  if (!found) notFound();

  const { public_site_live: publicSiteLive, ...row } = found;

  // Provider props are serialized into the HTML and RSC payload, so a hidden
  // institution's profile would be readable even on routes that 404. The short-circuit
  // keeps a live site from touching cookies, which would make public pages dynamic.
  const institution: PublicInstitution | null =
    publicSiteLive || (await viewerIsStaff(slug))
      ? { ...row, social_links: row.social_links as PublicInstitution["social_links"] }
      : null;

  const primaryColor = institution?.theme_colors?.[0];
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
