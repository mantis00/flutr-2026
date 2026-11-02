"use client";

import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { useInstitutionData } from "@/components/providers/institution-provider";
import { useInstitution } from "@/hooks/use-institution";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/components/ui/link";
import { GUIDE_ITEMS } from "@/components/tenant/guides/guide-items";
import { ROUTES } from "@/lib/routes";

/** Header for readers who unlocked the guides with the shared password. */
export function GuestGuidesHeader() {
  const institution = useInstitutionData();
  const { slug } = useInstitution();
  const pathname = usePathname();

  const current = GUIDE_ITEMS.find(
    (guide) => pathname === ROUTES.tenant.guideBySlug(slug, guide.slug),
  );

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <span className="max-w-40 truncate">{current?.title ?? "All guides"}</span>
                <ChevronDown className="ml-1 size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem asChild>
                <Link href={ROUTES.tenant.guides(slug)}>All guides</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {GUIDE_ITEMS.map((guide) => (
                <DropdownMenuItem key={guide.slug} asChild>
                  <Link
                    href={ROUTES.tenant.guideBySlug(slug, guide.slug)}
                    aria-current={current?.slug === guide.slug ? "page" : undefined}
                  >
                    {guide.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.login}>Sign in</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
