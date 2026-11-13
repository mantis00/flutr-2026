"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

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
import { ROUTES } from "@/lib/routes";
import { ThemeToggle } from "@/components/shared/theme-toggle";

import PlatformNavList from "./platform-nav-list";

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
  return role ?? "";
}

export default function PlatformHeader({
  user,
  sessionUser,
}: {
  user: AuthUser;
  sessionUser?: SessionUser;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="bg-background flex h-14 shrink-0 items-center border-b px-6">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0" showCloseButton>
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>Platform navigation</SheetTitle>
                <SheetDescription>
                  Navigate between platform admin sections and account actions.
                </SheetDescription>
              </SheetHeader>
              <PlatformNavList onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <Link
            href={ROUTES.admin.dashboard}
            className="text-foreground focus-visible:ring-ring rounded-sm text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Flutr
          </Link>
        </div>

        <div className="flex items-center gap-3">
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
