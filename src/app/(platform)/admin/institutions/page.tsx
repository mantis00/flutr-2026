import InstitutionsClient from "@/components/platform/institutions/institutions-client";
import { getAllInstitutions } from "@/lib/queries/institution";

export default async function PlatformInstitutionsPage() {
  const raw = await getAllInstitutions();

  const institutions = raw.map((i) => {
    // Derived from the `stats_active` flag, which controls public-site visibility only.
    // It does not restrict staff access to the institution's admin area.
    const status = i.stats_active ? ("LIVE" as const) : ("HIDDEN" as const);

    return {
      id: i.id,
      name: i.name,
      slug: i.slug,
      city: i.city,
      state_province: i.state_province,
      country: i.country,
      email_address: i.email_address,
      logo_url: i.logo_url,
      created_at: i.created_at.toISOString(),
      status,
    };
  });
  return <InstitutionsClient institutions={institutions} />;
}
