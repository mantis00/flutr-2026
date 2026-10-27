import Link from "next/link";
import { LayoutGrid, BarChart3, Mail, Heart, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ExploreLinkItem {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

interface ExploreLinksProps {
  basePath: string;
}

export function ExploreLinks({ basePath }: ExploreLinksProps) {
  const links: ExploreLinkItem[] = [
    {
      href: `${basePath}/stats`,
      icon: BarChart3,
      title: "Flight Statistics",
      description: "Real-time transparency data",
    },
    {
      href: `${basePath}/gallery`,
      icon: LayoutGrid,
      title: "Species Gallery",
      description: "Browse our local residents",
    },
    {
      href: `${basePath}/contact#volunteer`,
      icon: Heart,
      title: "Volunteer",
      description: "Help support our butterfly house",
    },
    {
      href: `${basePath}/contact#contact`,
      icon: Mail,
      title: "Contact Us",
      description: "Get in touch with us",
    },
  ];

  return (
    <section aria-labelledby="explore-heading">
      <h2 id="explore-heading" className="mb-4 text-lg font-bold">
        Explore Flutr
      </h2>
      <nav aria-label="Explore pages">
        <ul className="space-y-2" role="list">
          {links.map((link, idx) => {
            const Icon = link.icon;
            return (
              <li key={`${link.title}-${idx}`}>
                <Link
                  href={link.href}
                  className="group bg-card hover:bg-accent focus-visible:ring-ring flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <div className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{link.title}</p>
                    <p className="text-muted-foreground text-sm">{link.description}</p>
                  </div>
                  <ChevronRight
                    className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
