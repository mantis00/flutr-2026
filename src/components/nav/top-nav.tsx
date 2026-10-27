"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useInstitution } from "@/hooks/use-institution";
import { useInstitutionData } from "@/components/providers/institution-provider";
import type { NavLink } from "./nav-links";
import { ThemeToggle } from "@/components/shared/theme-toggle";

interface TopNavProps {
  links: NavLink[];
  className?: string;
}

export function TopNav({ links, className }: TopNavProps) {
  const { basePath } = useInstitution();
  const pathname = usePathname();
  const institution = useInstitutionData();

  return (
    <header className={cn("bg-background sticky top-0 z-50 w-full border-b", className)}>
      <div className="relative mx-auto flex h-14 max-w-[90vw] items-center px-4 sm:px-6 lg:px-8">
        <Link
          href={basePath}
          className="z-10 flex items-center gap-2 font-semibold"
          aria-label={institution?.name ? `${institution.name} home` : "Home"}
        >
          {institution?.logo_url ? (
            <span className="flex size-6 shrink-0 items-center justify-center rounded bg-white p-0.5 ring-1 ring-black/10 sm:size-7 lg:size-8">
              <Image
                src={institution.logo_url}
                alt={institution.name}
                width={32}
                height={32}
                sizes="(max-width: 640px) 20px, (max-width: 1024px) 24px, 28px"
                className="size-full object-contain"
                unoptimized
              />
            </span>
          ) : (
            <span>{institution?.name ?? "Flutr"}</span>
          )}
        </Link>

        <nav
          aria-label="Main navigation"
          className="absolute inset-x-0 flex items-center justify-center gap-1"
        >
          {links.map((link) => {
            const href = `${basePath}${link.href}`;
            const isActive = link.href === "" ? pathname === basePath : pathname.startsWith(href);

            return (
              <Link
                key={link.label}
                href={href}
                className={cn(
                  "rounded-md px-3 py-2 text-base font-medium transition-colors",
                  "hover:text-primary hover:font-bold",
                  "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
                  isActive ? "text-primary font-bold" : "text-muted-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="z-10 ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
