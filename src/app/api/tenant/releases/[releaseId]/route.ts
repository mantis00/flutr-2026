import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import {
  conflict,
  internalError,
  invalidRequest,
  mapAuthError,
  notFound,
  ok,
} from "@/lib/api-response";
import { requireValidBody } from "@/lib/validation/request";
import {
  releaseInFlightParamsSchema,
  updateReleaseEventItemsSchema,
} from "@/lib/validation/releases";
import { handleTenantError } from "@/lib/tenant";
import {
  deleteTenantRelease,
  getTenantReleaseById,
  RELEASE_ERRORS,
  updateTenantRelease,
} from "@/lib/services/tenant-releases";

interface RouteContext {
  params: Promise<{ releaseId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");

    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const routeParams = await context.params;
    const paramResult = releaseInFlightParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const result = await getTenantReleaseById({
      slug,
      releaseId: paramResult.data.releaseId,
    });

    if (!result) {
      return notFound();
    }

    return ok({
      event: result.event,
      items: result.items,
      losses: result.losses ?? [],
    });
  } catch (error) {
    const authError = mapAuthError(error);
    if (authError) return authError;

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected GET /tenant/releases/[releaseId] error:", error);
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
    const paramResult = releaseInFlightParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const bodyResult = await requireValidBody(request, updateReleaseEventItemsSchema);
    if ("error" in bodyResult) return bodyResult.error;

    await updateTenantRelease({
      slug,
      releaseId: paramResult.data.releaseId,
      ...bodyResult.data,
    });

    return ok({ updated: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === RELEASE_ERRORS.INVALID_QUANTITY) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.DUPLICATE_SHIPMENT_ITEM) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.RELEASE_EVENT_NOT_FOUND) {
        return notFound(error.message);
      }

      if (error.message === RELEASE_ERRORS.SHIPMENT_ITEM_NOT_FOUND) {
        return notFound(error.message);
      }

      if (error.message === RELEASE_ERRORS.EMPTY_RELEASE_EVENT) {
        return invalidRequest(error.message);
      }

      if (error.message === RELEASE_ERRORS.QUANTITY_EXCEEDS_REMAINING) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.LOSS_TOTAL_UNDERFLOW) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.PARASITE_BREAKDOWN_EXCEEDS_TOTAL) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW) {
        return conflict(error.message);
      }
    }

    const authError = mapAuthError(error);
    if (authError) return authError;

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected PATCH /tenant/releases/[releaseId] error:", error);
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
    const paramResult = releaseInFlightParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    await deleteTenantRelease({
      slug,
      releaseId: paramResult.data.releaseId,
    });

    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === RELEASE_ERRORS.RELEASE_EVENT_NOT_FOUND) {
        return notFound(error.message);
      }

      if (error.message === RELEASE_ERRORS.LOSS_TOTAL_UNDERFLOW) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.PARASITE_BREAKDOWN_EXCEEDS_TOTAL) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED) {
        return conflict(error.message);
      }

      if (error.message === RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW) {
        return conflict(error.message);
      }
    }

    const authError = mapAuthError(error);
    if (authError) return authError;

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected DELETE /tenant/releases/[releaseId] error:", error);
    return internalError();
  }
}
