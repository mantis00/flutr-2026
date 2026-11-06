export type Institution = {
  id: number;
  name: string;
  slug: string;

  city: string;
  state_province: string;
  country: string;

  email_address: string | null;
  logo_url: string | null;

  created_at: string;

  /** Public-site visibility: LIVE = public site live, HIDDEN = public site hidden (staff access unaffected). */
  status: "LIVE" | "HIDDEN";
};

export const STATUS_LABEL: Record<Institution["status"], string> = {
  LIVE: "Public site live",
  HIDDEN: "Public site hidden",
};

export function filterInstitutions(
  institutions: Institution[],
  search: string,
  statusFilter: string,
): Institution[] {
  const normalizedSearch = search.toLowerCase();

  return institutions
    .filter((inst) => {
      const matchesSearch =
        normalizedSearch === "" ||
        inst.name.toLowerCase().includes(normalizedSearch) ||
        inst.slug.toLowerCase().includes(normalizedSearch) ||
        inst.email_address?.toLowerCase().includes(normalizedSearch) ||
        inst.city.toLowerCase().includes(normalizedSearch) ||
        inst.state_province.toLowerCase().includes(normalizedSearch) ||
        inst.country.toLowerCase().includes(normalizedSearch);

      const matchesStatus = statusFilter === "all" || inst.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
