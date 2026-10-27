import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import {
  conflict,
  forbidden,
  internalError,
  invalidRequest,
  notFound,
  ok,
  unauthorized,
} from "@/lib/api-response";
import { requireValidBody } from "@/lib/validation/request";
import { shipmentIdParamsSchema, updateShipmentBodySchema } from "@/lib/validation/shipments";
import { handleTenantError } from "@/lib/tenant";

import {
  getTenantShipmentById,
  updateTenantShipment,
  deleteTenantShipment,
  SHIPMENT_ERRORS,
} from "@/lib/services/tenant-shipments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");

    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const routeParams = await context.params;
    const paramResult = shipmentIdParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const result = await getTenantShipmentById({
      slug,
      id: paramResult.data.id,
    });

    if (!result) {
      return notFound();
    }

    return ok(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected GET /tenant/shipments/[id] error:", error);
    return internalError();
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");

    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const routeParams = await context.params;
    const paramResult = shipmentIdParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const bodyResult = await requireValidBody(request, updateShipmentBodySchema);
    if ("error" in bodyResult) return bodyResult.error;

    const updated = await updateTenantShipment({
      slug,
      id: paramResult.data.id,
      ...bodyResult.data,
    });

    if (!updated) {
      return notFound("Shipment not found");
    }

    return ok({ updated: true });
  } catch (error) {
    if (error instanceof Error && error.message === SHIPMENT_ERRORS.CANNOT_DELETE_ITEM_IN_FLIGHT) {
      return conflict("Cannot delete a shipment item that has in-flight records");
    }

    if (error instanceof Error && error.message === SHIPMENT_ERRORS.INVALID_INVENTORY_REDUCTION) {
      return conflict("Cannot reduce shipment quantities below already released butterflies");
    }

    if (error instanceof Error && error.message === SHIPMENT_ERRORS.SHIPMENT_ITEM_NOT_FOUND) {
      return notFound("Shipment item not found");
    }

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected PATCH /tenant/shipments/[id] error:", error);
    return internalError();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");

    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const routeParams = await context.params;
    const paramResult = shipmentIdParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const deleted = await deleteTenantShipment({
      slug,
      id: paramResult.data.id,
    });

    if (!deleted) {
      return notFound("Shipment not found");
    }

    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected DELETE /tenant/shipments/[id] error:", error);
    return internalError();
  }
}
