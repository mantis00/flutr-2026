import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import {
  forbidden,
  conflict,
  internalError,
  invalidRequest,
  notFound,
  ok,
  unauthorized,
} from "@/lib/api-response";
import { requireValidBody } from "@/lib/validation/request";
import { newsIdParamsSchema, updateNewsSchema } from "@/lib/validation/news";
import { handleTenantError } from "@/lib/tenant";

import { updateTenantNewsEntry, deleteTenantNewsEntry } from "@/lib/services/tenant-news";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");
    if (!slug) return invalidRequest("Missing tenant slug");

    const routeParams = await context.params;
    const paramsResult = newsIdParamsSchema.safeParse(routeParams);
    if (!paramsResult.success) {
      return invalidRequest("Invalid request parameters", paramsResult.error.issues);
    }

    const bodyResult = await requireValidBody(request, updateNewsSchema);
    if ("error" in bodyResult) return bodyResult.error;

    const updated = await updateTenantNewsEntry({
      id: paramsResult.data.id,
      slug,
      ...bodyResult.data,
    });

    return ok({ news: updated });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("News entry not found");
      if (error.message === "CONFLICT") {
        return conflict("Only active news entries can be selected for the homepage");
      }
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected PATCH /tenant/news/[id] error:", error);
    return internalError();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const slug = request.headers.get("x-tenant-slug");
    if (!slug) return invalidRequest("Missing tenant slug");

    const routeParams = await context.params;
    const paramsResult = newsIdParamsSchema.safeParse(routeParams);
    if (!paramsResult.success) {
      return invalidRequest("Invalid request parameters", paramsResult.error.issues);
    }

    await deleteTenantNewsEntry({ id: paramsResult.data.id, slug });

    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("News entry not found");
    }

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected DELETE /tenant/news/[id] error:", error);
    return internalError();
  }
}
