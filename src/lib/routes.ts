export const ROUTES = {
  home: "/",
  login: "/login",
  unauthorized: "/unauthorized",
  admin: {
    dashboard: "/admin/dashboard",
    institutions: "/admin/institutions",
    institutionAdd: "/admin/institutions/add",
    institutionById: (id: string | number) => `/admin/institutions/${id}`,
    institutionShipmentsApi: (id: string | number) => `/api/platform/institutions/${id}/shipments`,
    institutionImportPreview: (id: string | number) =>
      `/api/platform/institutions/${id}/shipments/import/preview`,
    institutionImportCommit: (id: string | number) =>
      `/api/platform/institutions/${id}/shipments/import/commit`,
    institutionExportApi: (
      id: string | number,
      format: "xlsx" | "csv" = "xlsx",
      range?: { from?: string; to?: string },
    ) => {
      const params = new URLSearchParams({ format });
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      return `/api/platform/institutions/${id}/shipments/export?${params.toString()}`;
    },
    species: "/admin/species",
    suppliers: "/admin/suppliers",
  },
  tenant: {
    dashboard: (slug: string) => `/${slug}/dashboard`,
    organization: (slug: string) => `/${slug}/organization`,
    shipments: (slug: string) => `/${slug}/shipments`,
    shipmentAdd: (slug: string) => `/${slug}/shipments/add`,
    shipmentById: (slug: string, id: string | number) => `/${slug}/shipments/${id}`,
    shipmentReleaseNew: (slug: string, id: string | number) =>
      `/${slug}/shipments/${id}/release/new`,
    shipmentReleaseEdit: (slug: string, id: string | number, releaseId: string | number) =>
      `/${slug}/shipments/${id}/release/${releaseId}/edit`,
    butterflies: (slug: string) => `/${slug}/butterflies`,
    news: (slug: string) => `/${slug}/news`,
    guides: (slug: string) => `/${slug}/guides`,
    guideBySlug: (slug: string, guide: string) => `/${slug}/guides/${guide}`,
    speciesApi: "/api/tenant/species",
    speciesOverrideApi: (id: number | string) => `/api/tenant/species/${id}`,
    newsApi: "/api/tenant/news",
    newsEntryApi: (id: number | string) => `/api/tenant/news/${id}`,
    shipmentsApi: "/api/tenant/shipments",
    shipmentSummaryApi: "/api/tenant/shipments/summary",
    shipmentImportPreviewApi: "/api/tenant/shipments/import/preview",
    shipmentImportCommitApi: "/api/tenant/shipments/import/commit",
    shipmentExportApi: (
      format: "xlsx" | "csv" = "xlsx",
      range?: { from?: string; to?: string },
    ) => {
      const params = new URLSearchParams({ format });
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      return `/api/tenant/shipments/export?${params.toString()}`;
    },
  },
} as const;
