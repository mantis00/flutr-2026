import {
  Building2,
  Bug,
  CircleQuestionMark,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Newspaper,
  Package,
} from "lucide-react";

import { GUIDE_ITEMS } from "@/components/tenant/guides/guide-items";

export interface NavItem {
  id: string;
  label: string;
  /** Relative path appended to the institution basePath (e.g. "/dashboard"). */
  href: string;
  icon: LucideIcon;
  /** Rendered as a nested list, but only while this item's section is open. */
  children?: readonly NavItem[];
}

const GUIDE_CHILDREN: readonly NavItem[] = GUIDE_ITEMS.map((guide) => ({
  id: `guides-${guide.slug}`,
  label: guide.title,
  href: `/guides/${guide.slug}`,
  icon: guide.icon,
}));

/** Primary navigation items rendered in the tenant sidebar. */
export const TENANT_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "organization",
    label: "Organization",
    href: "/organization",
    icon: Building2,
  },
  {
    id: "shipments",
    label: "Shipments",
    href: "/shipments",
    icon: Package,
  },
  {
    id: "butterflies",
    label: "Butterflies",
    href: "/butterflies",
    icon: Bug,
  },
  {
    id: "news",
    label: "News",
    href: "/news",
    icon: Newspaper,
  },
  {
    id: "guides",
    label: "Guides & Help",
    href: "/guides",
    icon: CircleQuestionMark,
    children: GUIDE_CHILDREN,
  },
];

/** Logout action — rendered as a button, not a link. */
export const LOGOUT_ITEM = {
  id: "logout",
  label: "Log out",
  icon: LogOut,
} as const;
