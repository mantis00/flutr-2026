"use client";

import { useInstitutionData } from "@/components/providers/institution-provider";
import { useInstitution } from "@/hooks/use-institution";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { ROUTES } from "@/lib/routes";

/** Header for readers who unlocked the guides with the shared password. */
export function GuestGuidesHeader() {
  const institution = useInstitutionData();
  const { slug } = useInstitution();

  return (
    <header role="banner" className="bg-background flex h-14 shrink-0 items-center border-b px-6">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-6">
        <Link
          href={ROUTES.tenant.guides(slug)}
          className="text-foreground focus-visible:ring-ring truncate rounded-sm text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {institution?.name ?? "Flutr"} guides
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.login}>Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
