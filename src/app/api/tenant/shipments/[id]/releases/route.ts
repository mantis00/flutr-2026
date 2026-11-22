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
import { createReleaseFromShipmentSchema } from "@/lib/validation/releases";
import { shipmentIdParamsSchema } from "@/lib/validation/shipments";
import { handleTenantError } from "@/lib/tenant";

import {
  getTenantShipmentReleases,
  createTenantRelease,
  RELEASE_ERRORS,
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
    const result = shipmentIdParamsSchema.safeParse(routeParams);
    if (!result.success) {
      return invalidRequest("Invalid request parameters", result.error.issues);
    }

    const releaseEvents = await getTenantShipmentReleases({
      slug,
      id: result.data.id,
    });

    return ok({ releaseEvents });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected GET /tenant/shipments/[id]/releases error:", error);
    return internalError();
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");

    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const routeParams = await context.params;
    const result = shipmentIdParamsSchema.safeParse(routeParams);
    if (!result.success) {
      return invalidRequest("Invalid request parameters", result.error.issues);
    }

    const bodyResult = await requireValidBody(request, createReleaseFromShipmentSchema);
    if ("error" in bodyResult) return bodyResult.error;

    const release = await createTenantRelease({
      slug,
      shipmentId: result.data.id,
      ...bodyResult.data,
    });

    return ok({ release }, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === RELEASE_ERRORS.INVALID_QUANTITY) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.DUPLICATE_SHIPMENT_ITEM) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.INVALID_RELEASE_DATE) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.RELEASE_DATE_BEFORE_ARRIVAL) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.RELEASE_DATE_IN_FUTURE) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.SHIPMENT_NOT_FOUND) {
        return notFound(error.message);
      }

      if (error.message === RELEASE_ERRORS.SHIPMENT_ITEM_NOT_FOUND) {
        return notFound(error.message);
      }

      if (error.message === RELEASE_ERRORS.QUANTITY_EXCEEDS_REMAINING) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.NEGATIVE_LOSS_DELTA) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW) {
        return conflict(error.message);
      }

      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected POST /tenant/shipments/[id]/releases error:", error);
    return internalError();
  }
}
