"use client";

import { Link } from "@/components/ui/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useInstitution } from "@/hooks/use-institution";

import { LOGOUT_ITEM, TENANT_NAV_ITEMS, type NavItem } from "./tenant-nav-items";

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavListItem({
  item,
  basePath,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  basePath: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const href = `${basePath}${item.href}`;
  const inSection = isActive(href, pathname);
  const Icon = item.icon;
  // Children are only worth showing once you are inside the section; otherwise
  // the sidebar would carry every guide at all times.
  const expanded = inSection && !!item.children?.length;
  // The highlighted item announces itself as current, except when one of its
  // own children is the page you are on — then the child carries it instead.
  const childIsCurrent = !!item.children?.some((child) => pathname === `${basePath}${child.href}`);

  return (
    <li>
      <Link
        href={href}
        aria-current={inSection && !childIsCurrent ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          inSection
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {item.label}
      </Link>

      {expanded && (
        <ul
          aria-label={`${item.label} pages`}
          className="border-border mt-1 ml-5 space-y-0.5 border-l pl-2"
        >
          {item.children!.map((child) => {
            const childHref = `${basePath}${child.href}`;
            const childActive = pathname === childHref;

            return (
              <li key={child.id}>
                <Link
                  href={childHref}
                  aria-current={childActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    childActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export default function TenantNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { basePath } = useInstitution();
  const LogoutIcon = LOGOUT_ITEM.icon;

  async function handleLogout() {
    onNavigate?.();
    await signOut({ redirectTo: "/login" });
  }

  return (
    <nav aria-label="Tenant navigation" className="flex flex-1 flex-col overflow-y-auto p-3">
      <ul className="flex-1 space-y-1">
        {TENANT_NAV_ITEMS.map((item) => (
          <NavListItem
            key={item.id}
            item={item}
            basePath={basePath}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </ul>

      <ul className="space-y-1 pt-3">
        <li>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <LogoutIcon className="size-4 shrink-0" aria-hidden="true" />
            {LOGOUT_ITEM.label}
          </button>
        </li>
      </ul>
    </nav>
  );
}
