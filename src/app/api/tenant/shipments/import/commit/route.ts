import { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import {
  conflict,
  forbidden,
  internalError,
  invalidRequest,
  jsonError,
  ok,
  unauthorized,
} from "@/lib/api-response";
import { handleTenantError } from "@/lib/tenant";
import { commitTenantShipmentImport } from "@/lib/services/tenant-shipment-import";
import { ShipmentImportValidationError } from "@/lib/services/shipment-import";
import { shipmentImportCommitRequestSchema } from "@/lib/validation/shipment-import";
import { requireValidBody } from "@/lib/validation/request";

export async function POST(request: NextRequest) {
  try {
    const slug = request.headers.get("x-tenant-slug");
    if (!slug) {
      return invalidRequest("Missing tenant slug");
    }

    const bodyResult = await requireValidBody(request, shipmentImportCommitRequestSchema);
    if ("error" in bodyResult) return bodyResult.error;

    const summary = await commitTenantShipmentImport({
      slug,
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

    const tenantError = handleTenantError(error);
    if (tenantError) return tenantError;

    logger.error("Unexpected POST /tenant/shipments/import/commit error:", error);
    return internalError();
  }
}
