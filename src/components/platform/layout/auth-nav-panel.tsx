"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shield, X, LayoutDashboard, Building2, Package, Leaf, Warehouse } from "lucide-react";

import { Link } from "@/components/ui/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { BackButton } from "@/components/shared/back-button";
import { useInstitutionData } from "@/components/providers/institution-provider";

interface PanelLink {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PLATFORM_LINKS: PanelLink[] = [
  { label: "Platform Dashboard", href: ROUTES.admin.dashboard, icon: LayoutDashboard },
  { label: "Institutions", href: ROUTES.admin.institutions, icon: Building2 },
  { label: "Butterflies", href: ROUTES.admin.species, icon: Leaf },
  { label: "Suppliers", href: ROUTES.admin.suppliers, icon: Warehouse },
];

function getTenantLinks(slug: string): PanelLink[] {
  return [
    { label: "Dashboard", href: ROUTES.tenant.dashboard(slug), icon: LayoutDashboard },
    { label: "Organization", href: ROUTES.tenant.organization(slug), icon: Building2 },
    { label: "Shipments", href: ROUTES.tenant.shipments(slug), icon: Package },
  ];
}

function PanelSection({
  title,
  links,
  pathname,
}: {
  title: string;
  links: PanelLink[];
  pathname: string;
}) {
  return (
    <div>
      <p
        className="text-muted-foreground mb-1 truncate px-2 text-[10px] font-semibold tracking-wider uppercase"
        title={title}
      >
        {title}
      </p>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AuthNavPanel() {
  const [open, setOpen] = useState(true);
  const { data: session } = useSession();
  const pathname = usePathname();
  const institution = useInstitutionData();
  const params = useParams<{ institution?: string }>();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!session?.user?.role) return null;

  const role = session.user.role.toUpperCase();
  const isSuperuser = role === "SUPERUSER";

  // Slug from URL param (present on [institution] routes), then session fallback for non-superusers.
  const tenantSlug =
    params?.institution ?? (isSuperuser ? null : session.user.institutionSlug) ?? null;

  return (
    <nav aria-label="Admin quick navigation" className="fixed top-16 right-4 z-50">
      {!open ? (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open admin navigation"
          className="bg-background shadow-lg"
        >
          <Shield className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <div className="bg-background w-56 rounded-lg border shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">{isSuperuser ? "Admin Panel" : "Quick Nav"}</p>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={close}
              aria-label="Close admin navigation"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>

          <div className="space-y-3 p-3">
            {isSuperuser && (
              <PanelSection title="Platform" links={PLATFORM_LINKS} pathname={pathname} />
            )}

            {tenantSlug && (
              <PanelSection
                title={institution?.name ?? tenantSlug}
                links={getTenantLinks(tenantSlug)}
                pathname={pathname}
              />
            )}

            <div className="border-t pt-2">
              <BackButton
                fallbackHref={
                  tenantSlug
                    ? ROUTES.tenant.dashboard(tenantSlug)
                    : isSuperuser
                      ? ROUTES.admin.dashboard
                      : "/"
                }
              />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
