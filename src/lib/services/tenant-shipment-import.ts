import { auth } from "@/auth";
import { canManageInstitutionProfile, requireUser } from "@/lib/authz";
import { resolveTenantBySlug } from "@/lib/tenant";
import type {
  ShipmentImportCommitRequest,
  ShipmentImportCommitResponse,
  ShipmentImportPreviewRequest,
  ShipmentImportPreviewResponse,
} from "@/lib/validation/shipment-import";
import {
  buildShipmentImportPreviewForInstitution,
  commitShipmentImportForInstitution,
  exportShipmentWorkbookForInstitution,
} from "@/lib/services/shipment-import";

type TenantShipmentImportContext = {
  slug: string;
};

export async function getTenantShipmentImportPreview(
  data: TenantShipmentImportContext & ShipmentImportPreviewRequest,
): Promise<ShipmentImportPreviewResponse> {
  const user = requireUser(await auth());
  if (!canManageInstitutionProfile(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, data.slug);
  const { raw_text, source } = data;

  // A tenant request can never legally auto-create a species (see commitTenantShipmentImport
  // below, which force-disables `allow_species_autocreate` server-side regardless of the
  // request body) — so an unresolved species is promoted to a blocking preview issue here,
  // unconditionally, ignoring whatever the request body may have sent for this option (a tenant
  // client never sends it today, but this must hold even if one did).
  return buildShipmentImportPreviewForInstitution({
    institutionId: tenantId,
    raw_text,
    source,
    allowSpeciesAutocreate: false,
  });
}

export async function commitTenantShipmentImport(
  data: TenantShipmentImportContext & ShipmentImportCommitRequest,
): Promise<ShipmentImportCommitResponse> {
  const user = requireUser(await auth());
  if (!canManageInstitutionProfile(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, data.slug);
  const { raw_text, preview_hash, year, options } = data;

  return commitShipmentImportForInstitution({
    institutionId: tenantId,
    raw_text,
    preview_hash,
    year,
    options: {
      ...options,
      // Tenant admins cannot create global species records.
      allow_species_autocreate: false,
    },
  });
}

export async function exportTenantShipmentWorkbook({
  slug,
  range,
}: TenantShipmentImportContext & { range?: { from?: string; to?: string } }): Promise<Buffer> {
  const user = requireUser(await auth());
  if (!canManageInstitutionProfile(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);
  return exportShipmentWorkbookForInstitution({ institutionId: tenantId, range });
}
