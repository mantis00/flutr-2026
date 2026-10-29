import { Building2, Bug, Newspaper, Package, Send, Upload, type LucideIcon } from "lucide-react";

export interface GuideItem {
  /** Path segment under `/[institution]/guides`. */
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const GUIDE_ITEMS: readonly GuideItem[] = [
  {
    slug: "organization",
    title: "Organization & users",
    description:
      "Your institution's public profile, theme, and the people who can sign in to manage it.",
    icon: Building2,
  },
  {
    slug: "shipments",
    title: "Shipments",
    description: "Record a shipment of pupae, log how each species arrived, and correct mistakes.",
    icon: Package,
  },
  {
    slug: "releases",
    title: "Butterfly releases",
    description: "Release butterflies into your exhibit and keep the public counts accurate.",
    icon: Send,
  },
  {
    slug: "butterflies",
    title: "Butterflies",
    description: "Set your own common names and lifespans for the species you receive.",
    icon: Bug,
  },
  {
    slug: "news",
    title: "News",
    description: "Post updates that appear on your public homepage.",
    icon: Newspaper,
  },
  {
    slug: "import",
    title: "Importing historical data",
    description: "Bring records from before Flutr into your institution's history.",
    icon: Upload,
  },
];
