"use client";

import { useState } from "react";
import { Link } from "@/components/ui/link";
import { ExternalLink, Menu } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useInstitution } from "@/hooks/use-institution";
import { useInstitutionData } from "@/components/providers/institution-provider";
import { ThemeToggle } from "@/components/shared/theme-toggle";

import TenantNavList from "./tenant-nav-list";

type AuthUser = {
  id: string;
  role: string;
  institutionId: number | null;
};

type SessionUser = {
  name?: string | null;
  image?: string | null;
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getRoleLabel(role: string | undefined): string {
  if (role === "SUPERUSER") return "Global Admin";
  if (role === "ADMIN") return "Admin";
  return "Employee";
}

export default function TenantHeader({
  user,
  sessionUser,
}: {
  user: AuthUser;
  sessionUser?: SessionUser;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { basePath } = useInstitution();
  const institution = useInstitutionData();

  return (
    <header role="banner" className="bg-background flex h-14 shrink-0 items-center border-b px-6">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0" showCloseButton>
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>
                  Navigate between admin sections and account actions.
                </SheetDescription>
              </SheetHeader>
              <TenantNavList onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <Link
            href={`${basePath}/dashboard`}
            className="text-foreground focus-visible:ring-ring rounded-sm text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {institution?.name ?? "Flutr"}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
            <Link href={basePath}>
              <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
              View Public Site
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild className="sm:hidden">
            <Link href={basePath} aria-label="View public site">
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </Button>

          <ThemeToggle />

          <div className="flex items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm leading-none font-medium">
                {sessionUser?.name ?? `User #${user.id}`}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">{getRoleLabel(user.role)}</p>
            </div>

            <Avatar className="size-8">
              <AvatarImage src={sessionUser?.image ?? ""} alt="" />
              <AvatarFallback className="text-xs">{getInitials(sessionUser?.name)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </header>
  );
}
