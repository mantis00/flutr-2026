import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireUser } from "@/lib/authz";
import { getInstitutionById } from "@/lib/queries/institution";
import { listUsersForTenant } from "@/lib/queries/users";
import InstitutionDetailShell from "@/components/platform/institutions/detail/institution-detail-shell";
import type {
  InstitutionDetail,
  InstitutionUser,
} from "@/components/platform/institutions/detail/institution-detail-shell";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

function resolveInitialTab(tab: string | undefined) {
  switch (tab) {
    case "users":
    case "data":
      return tab;
    default:
      return "profile";
  }
}

export default async function PlatformInstitutionPage({ params, searchParams }: Props) {
  const { id: rawId } = await params;
  const { tab } = await searchParams;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) notFound();

  const session = await auth();
  const platformUser = (() => {
    try {
      return requireUser(session);
    } catch {
      redirect("/login");
    }
  })();

  const [row, rawUsers] = await Promise.all([
    getInstitutionById(id),
    listUsersForTenant(id, platformUser),
  ]);

  if (!row) notFound();

  const institution: InstitutionDetail = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    main_header: row.main_header ?? null,
    description: row.description ?? null,
    street_address: row.street_address,
    extended_address: row.extended_address ?? null,
    city: row.city,
    state_province: row.state_province,
    postal_code: row.postal_code,
    country: row.country,
    time_zone: row.time_zone ?? null,
    email_address: row.email_address ?? null,
    phone_number: row.phone_number ?? null,
    website_url: row.website_url ?? null,
    volunteer_url: row.volunteer_url ?? null,
    donation_url: row.donation_url ?? null,
    logo_url: row.logo_url ?? null,
    facility_image_url: row.facility_image_url ?? null,
    social_links: (row.social_links as Record<string, string> | null) ?? null,
    theme_colors: row.theme_colors ?? null,
    stats_active: row.stats_active,
    iabes_member: row.iabes_member,
  };

  const users: InstitutionUser[] = rawUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));

  return (
    <InstitutionDetailShell
      institution={institution}
      users={users}
      initialTab={resolveInitialTab(tab)}
    />
  );
}
