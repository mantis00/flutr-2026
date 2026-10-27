import { notFound } from "next/navigation";
import { getPublicInstitution } from "@/lib/queries/institution";
import { InstitutionDataProvider } from "@/components/providers/institution-provider";
import { readableForeground } from "@/lib/theme-color";
import type { PublicInstitution } from "@/types/institution";

interface InstitutionLayoutProps {
  children: React.ReactNode;
  params: Promise<{ institution: string }>;
}

export default async function InstitutionLayout({ children, params }: InstitutionLayoutProps) {
  const { institution: slug } = await params;

  const row = await getPublicInstitution(slug);

  if (!row) notFound();

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
