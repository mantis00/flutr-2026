import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import {
  conflict,
  forbidden,
  internalError,
  invalidRequest,
  jsonError,
  notFound,
  ok,
  unauthorized,
} from "@/lib/api-response";
import {
  commitPlatformShipmentImport,
  ShipmentImportValidationError,
} from "@/lib/services/shipment-import";
import { platformInstitutionIdParamsSchema } from "@/lib/validation/institution";
import { shipmentImportCommitRequestSchema } from "@/lib/validation/shipment-import";
import { requireValidBody } from "@/lib/validation/request";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const routeParams = await context.params;
    const paramResult = platformInstitutionIdParamsSchema.safeParse(routeParams);
    if (!paramResult.success) {
      return invalidRequest("Invalid request parameters", paramResult.error.issues);
    }

    const bodyResult = await requireValidBody(request, shipmentImportCommitRequestSchema);
    if ("error" in bodyResult) return bodyResult.error;

    const summary = await commitPlatformShipmentImport({
      institutionId: paramResult.data.id,
      ...bodyResult.data,
    });

    return ok(summary);
  } catch (error) {
    if (error instanceof ShipmentImportValidationError) {
      return jsonError(
        "INVALID_REQUEST",
        "The workbook contains blocking validation issues. No year can be committed until they are fixed.",
        400,
        error.issues.map((issue) => ({
          path: issue.field ?? (issue.rowNumber != null ? `row ${issue.rowNumber}` : ""),
          message: issue.message,
        })),
      );
    }

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return unauthorized();
      if (error.message === "FORBIDDEN") return forbidden();
      if (error.message === "NOT_FOUND") return notFound("Institution not found");
      if (error.message === "PREVIEW_HASH_MISMATCH") {
        return invalidRequest("Preview hash mismatch. Re-run parse preview before commit.");
      }
      if (error.message === "YEAR_NOT_FOUND") {
        return invalidRequest("The requested year was not found in the validated workbook.");
      }
      if (error.message === "IMPORT_ALREADY_RUNNING") {
        return conflict(
          "An import is already running for this institution. Wait for it to finish and retry.",
        );
      }
    }

    logger.error(
      "Unexpected POST /platform/institutions/[id]/shipments/import/commit error:",
      error,
    );
    return internalError();
  }
}
