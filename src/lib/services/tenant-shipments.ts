import { auth } from "@/auth";
import {
  requireUser,
  canReadShipment,
  canWriteShipment,
  canDeleteShipment,
  canCreateRelease,
  canManageInstitutionProfile,
} from "@/lib/authz";
import { resolveTenantBySlug } from "@/lib/tenant";
import { attachImagesCamel } from "@/lib/wingspan/client";
import {
  listShipments,
  createShipment,
  getShipmentWithItems,
  updateShipment,
  deleteShipment,
  deleteShipmentsForInstitution,
  getShipmentSummaryList,
  SHIPMENT_ERRORS,
  type ShipmentDeleteOptions,
} from "@/lib/queries/shipments";
import {
  listReleaseEventsForShipment,
  createReleaseFromShipment,
  RELEASE_ERRORS,
} from "@/lib/queries/releases";
import type { CreateShipmentBody, UpdateShipmentBody } from "@/lib/validation/shipments";
import type { CreateReleaseFromShipmentBody } from "@/lib/validation/releases";

export { SHIPMENT_ERRORS };
export { RELEASE_ERRORS };

type TenantShipmentContext = {
  slug: string;
};

type TenantShipmentListInput = TenantShipmentContext & {
  page?: number;
  limit?: number;
};

type TenantShipmentIdInput = TenantShipmentContext & {
  id: number;
};

type CreateTenantShipmentInput = TenantShipmentContext & CreateShipmentBody;

type UpdateTenantShipmentInput = TenantShipmentContext & {
  id: number;
} & UpdateShipmentBody;

type CreateTenantReleaseInput = TenantShipmentContext & {
  shipmentId: number;
} & CreateReleaseFromShipmentBody;

export async function getTenantShipments({ slug, page = 1, limit = 50 }: TenantShipmentListInput) {
  const user = requireUser(await auth());

  if (!canReadShipment(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);

  return listShipments(tenantId, page, limit);
}

export async function createTenantShipment(data: CreateTenantShipmentInput) {
  const user = requireUser(await auth());

  if (!canWriteShipment(user)) throw new Error("FORBIDDEN");

  const { slug, ...shipmentData } = data;
  const tenantId = await resolveTenantBySlug(user, slug);

  return createShipment(tenantId, shipmentData);
}

export async function getTenantShipmentById({ slug, id }: TenantShipmentIdInput) {
  const user = requireUser(await auth());

  if (!canReadShipment(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);

  const result = await getShipmentWithItems(tenantId, id);
  if (!result) return null;

  return { ...result, items: await attachImagesCamel(result.items) };
}

export async function updateTenantShipment(data: UpdateTenantShipmentInput) {
  const user = requireUser(await auth());

  if (!canWriteShipment(user)) throw new Error("FORBIDDEN");

  const { slug, id, ...shipmentData } = data;
  const tenantId = await resolveTenantBySlug(user, slug);

  return updateShipment(tenantId, id, shipmentData);
}

export async function deleteTenantShipment({ slug, id }: TenantShipmentIdInput) {
  const user = requireUser(await auth());

  if (!canDeleteShipment(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);

  return deleteShipment(tenantId, id);
}

export async function getTenantShipmentReleases({ slug, id }: TenantShipmentIdInput) {
  const user = requireUser(await auth());

  if (!canReadShipment(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);

  return listReleaseEventsForShipment(tenantId, id);
}

export async function getTenantShipmentSummary({ slug }: TenantShipmentContext) {
  const user = requireUser(await auth());

  if (!canReadShipment(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);
  const rows = await getShipmentSummaryList(tenantId);
  return { shipments: rows };
}

export async function deleteTenantShipments({
  slug,
  options,
}: TenantShipmentContext & { options: ShipmentDeleteOptions }) {
  const user = requireUser(await auth());

  if (!canManageInstitutionProfile(user)) throw new Error("FORBIDDEN");

  const tenantId = await resolveTenantBySlug(user, slug);
  return deleteShipmentsForInstitution(tenantId, options);
}

export async function createTenantRelease(data: CreateTenantReleaseInput) {
  const session = await auth();
  const user = requireUser(session);

  if (!canCreateRelease(user)) throw new Error("FORBIDDEN");

  const { slug, shipmentId, ...releaseData } = data;
  const tenantId = await resolveTenantBySlug(user, slug);
  const releasedBy = session?.user?.name ?? String(user.id);

  return createReleaseFromShipment(tenantId, shipmentId, releasedBy, releaseData);
}
