import { NextRequest } from "next/server";

jest.mock("@/lib/services/tenant-shipments", () => ({
  SHIPMENT_ERRORS: {
    CANNOT_DELETE_ITEM_IN_FLIGHT: "CANNOT_DELETE_ITEM_IN_FLIGHT",
    INVALID_INVENTORY_REDUCTION: "INVALID_INVENTORY_REDUCTION",
    SHIPMENT_ITEM_NOT_FOUND: "SHIPMENT_ITEM_NOT_FOUND",
  },
  RELEASE_ERRORS: {
    INVALID_QUANTITY: "Invalid quantity",
    DUPLICATE_SHIPMENT_ITEM: "Duplicate shipment item",
    SHIPMENT_NOT_FOUND: "Shipment not found",
    SHIPMENT_ITEM_NOT_FOUND: "Shipment item not found",
    QUANTITY_EXCEEDS_REMAINING: "Quantity exceeds remaining",
  },
  getTenantShipments: jest.fn(),
  createTenantShipment: jest.fn(),
  getTenantShipmentById: jest.fn(),
  updateTenantShipment: jest.fn(),
  deleteTenantShipment: jest.fn(),
  deleteTenantShipments: jest.fn(),
  getTenantShipmentReleases: jest.fn(),
  createTenantRelease: jest.fn(),
}));

import {
  getTenantShipments,
  createTenantShipment,
  getTenantShipmentById,
  updateTenantShipment,
  deleteTenantShipment,
  deleteTenantShipments,
  getTenantShipmentReleases,
} from "@/lib/services/tenant-shipments";
import {
  GET as getShipments,
  POST as postShipment,
  DELETE as deleteBulkShipments,
} from "@/app/api/tenant/shipments/route";
import {
  GET as getShipmentById,
  PATCH as patchShipmentById,
  DELETE as deleteShipmentById,
} from "@/app/api/tenant/shipments/[id]/route";
import { GET as getShipmentReleases } from "@/app/api/tenant/shipments/[id]/releases/route";

const mockGetTenantShipments = getTenantShipments as jest.Mock;
const mockCreateTenantShipment = createTenantShipment as jest.Mock;
const mockGetTenantShipmentById = getTenantShipmentById as jest.Mock;
const mockUpdateTenantShipment = updateTenantShipment as jest.Mock;
const mockDeleteTenantShipment = deleteTenantShipment as jest.Mock;
const mockDeleteTenantShipments = deleteTenantShipments as jest.Mock;
const mockGetTenantShipmentReleases = getTenantShipmentReleases as jest.Mock;

const SLUG = "butterfly-house";

function makeListRequest(query: Record<string, string> = {}, slug?: string) {
  const params = new URLSearchParams(query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest(`http://localhost/api/tenant/shipments${suffix}`, { headers });
}

function makePostRequest(body: Record<string, unknown>, slug?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest("http://localhost/api/tenant/shipments", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeGetByIdRequest(id: string, slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest(`http://localhost/api/tenant/shipments/${id}`, { headers });
}

function makePatchRequest(id: string, body: Record<string, unknown>, slug?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest(`http://localhost/api/tenant/shipments/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function makeDeleteByIdRequest(id: string, slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest(`http://localhost/api/tenant/shipments/${id}`, {
    method: "DELETE",
    headers,
  });
}

function makeDeleteBulkRequest(body: Record<string, unknown>, slug?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest("http://localhost/api/tenant/shipments", {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
}

function makeGetReleasesRequest(id: string, slug?: string) {
  const headers: Record<string, string> = {};
  if (slug) headers["x-tenant-slug"] = slug;

  return new NextRequest(`http://localhost/api/tenant/shipments/${id}/releases`, {
    headers,
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function validCreatePayload() {
  return {
    supplier_code: "SUP-1",
    shipment_date: "2026-01-10",
    arrival_date: "2026-01-11",
    items: [
      {
        butterfly_species_id: 10,
        number_received: 50,
        emerged_in_transit: 2,
        damaged_in_transit: 1,
        diseased_in_transit: 0,
        parasite: 0,
        non_emergence: 3,
        poor_emergence: 1,
      },
    ],
  };
}

describe("Shipments API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("GET /api/tenant/shipments", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await getShipments(makeListRequest()))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockGetTenantShipments.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await getShipments(makeListRequest({}, SLUG)))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockGetTenantShipments.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await getShipments(makeListRequest({}, SLUG)))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockGetTenantShipments.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await getShipments(makeListRequest({}, SLUG)))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for invalid query parameters", async () => {
      const response = (await getShipments(makeListRequest({ institutionId: "abc" }, SLUG)))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 200 with paginated shipments list including completion status", async () => {
      mockGetTenantShipments.mockResolvedValueOnce({
        shipments: [
          {
            id: 1,
            supplierCode: "SUP-1",
            shipmentDate: "2026-01-10",
            arrivalDate: "2026-01-11",
            createdAt: "2026-01-12T00:00:00.000Z",
            remaining: 12,
            isCompleted: false,
          },
          {
            id: 2,
            supplierCode: "SUP-2",
            shipmentDate: "2026-01-08",
            arrivalDate: "2026-01-09",
            createdAt: "2026-01-09T00:00:00.000Z",
            remaining: 0,
            isCompleted: true,
          },
        ],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      });

      const response = (await getShipments(makeListRequest({}, SLUG)))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.shipments)).toBe(true);
      expect(body.shipments).toHaveLength(2);
      expect(body.shipments[0]).toMatchObject({ remaining: 12, isCompleted: false });
      expect(body.shipments[1]).toMatchObject({ remaining: 0, isCompleted: true });
      expect(mockGetTenantShipments).toHaveBeenCalledWith({ slug: SLUG, page: 1, limit: 50 });
    });

    it("passes requested page and limit to service", async () => {
      mockGetTenantShipments.mockResolvedValueOnce({
        shipments: [],
        pagination: { page: 3, limit: 25, total: 0, totalPages: 0 },
      });

      const response = (await getShipments(makeListRequest({ page: "3", limit: "25" }, SLUG)))!;
      expect(response.status).toBe(200);
      expect(mockGetTenantShipments).toHaveBeenCalledWith({ slug: SLUG, page: 3, limit: 25 });
    });
  });

  describe("POST /api/tenant/shipments", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await postShipment(makePostRequest(validCreatePayload())))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid request body", async () => {
      const response = (await postShipment(makePostRequest({ supplier_code: "" }, SLUG)))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it.each([
      ["shipment_date", "2026-09-09-garbage"],
      ["arrival_date", "2026-09-09T25:00:00Z"],
    ])("rejects malformed %s value %s before creating a shipment", async (field, value) => {
      const response = (await postShipment(
        makePostRequest({ ...validCreatePayload(), [field]: value }, SLUG),
      ))!;

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
      expect(mockCreateTenantShipment).not.toHaveBeenCalled();
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockCreateTenantShipment.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await postShipment(makePostRequest(validCreatePayload(), SLUG)))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockCreateTenantShipment.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await postShipment(makePostRequest(validCreatePayload(), SLUG)))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockCreateTenantShipment.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await postShipment(makePostRequest(validCreatePayload(), SLUG)))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 201 on successful creation", async () => {
      mockCreateTenantShipment.mockResolvedValueOnce(42);

      const response = (await postShipment(makePostRequest(validCreatePayload(), SLUG)))!;
      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.id).toBe(42);
      expect(mockCreateTenantShipment).toHaveBeenCalledWith(
        expect.objectContaining({ slug: SLUG, supplier_code: "SUP-1" }),
      );
    });

    it.each([
      ["2026-09-09", "2026-09-23"],
      ["2026-10-01", "2026-10-02"],
      ["2027-01-01", "2027-01-02"],
    ])("preserves date-only creation values %s -> %s", async (shipmentDate, arrivalDate) => {
      mockCreateTenantShipment.mockResolvedValueOnce(42);

      const response = (await postShipment(
        makePostRequest(
          {
            ...validCreatePayload(),
            shipment_date: shipmentDate,
            arrival_date: arrivalDate,
          },
          SLUG,
        ),
      ))!;

      expect(response.status).toBe(201);
      expect(mockCreateTenantShipment).toHaveBeenCalledWith(
        expect.objectContaining({
          shipment_date: new Date(`${shipmentDate}T00:00:00.000Z`),
          arrival_date: new Date(`${arrivalDate}T00:00:00.000Z`),
        }),
      );
    });
  });

  describe("GET /api/tenant/shipments/[id]", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await getShipmentById(makeGetByIdRequest("1"), routeContext("1")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid shipment id", async () => {
      const response = (await getShipmentById(
        makeGetByIdRequest("abc", SLUG),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockGetTenantShipmentById.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await getShipmentById(makeGetByIdRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockGetTenantShipmentById.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await getShipmentById(makeGetByIdRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockGetTenantShipmentById.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await getShipmentById(makeGetByIdRequest("1", SLUG), routeContext("1")))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when shipment not found", async () => {
      mockGetTenantShipmentById.mockResolvedValueOnce(null);

      const response = (await getShipmentById(
        makeGetByIdRequest("999", SLUG),
        routeContext("999"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with shipment and items", async () => {
      mockGetTenantShipmentById.mockResolvedValueOnce({
        shipment: { id: 42, supplierCode: "SUP-1" },
        items: [{ id: 1, butterflySpeciesId: 10 }],
      });

      const response = (await getShipmentById(makeGetByIdRequest("42", SLUG), routeContext("42")))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.shipment.id).toBe(42);
      expect(body.items).toHaveLength(1);
      expect(mockGetTenantShipmentById).toHaveBeenCalledWith({ slug: SLUG, id: 42 });
    });
  });

  describe("PATCH /api/tenant/shipments/[id]", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await patchShipmentById(
        makePatchRequest("1", { supplier_code: "SUP-2" }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid shipment id", async () => {
      const response = (await patchShipmentById(
        makePatchRequest("abc", { supplier_code: "SUP-2" }, SLUG),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid request body", async () => {
      const response = (await patchShipmentById(
        makePatchRequest("7", {}, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it.each([
      ["shipment_date", "2026-09-09-garbage"],
      ["arrival_date", "2026-09-09T25:00:00Z"],
    ])("rejects malformed %s value %s before updating a shipment", async (field, value) => {
      const response = (await patchShipmentById(
        makePatchRequest("7", { [field]: value }, SLUG),
        routeContext("7"),
      ))!;

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
      expect(mockUpdateTenantShipment).not.toHaveBeenCalled();
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await patchShipmentById(
        makePatchRequest("7", { supplier_code: "SUP-2" }, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await patchShipmentById(
        makePatchRequest("7", { supplier_code: "SUP-2" }, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await patchShipmentById(
        makePatchRequest("7", { supplier_code: "SUP-2" }, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when shipment does not exist", async () => {
      mockUpdateTenantShipment.mockResolvedValueOnce(false);

      const response = (await patchShipmentById(
        makePatchRequest("999", { supplier_code: "SUP-2" }, SLUG),
        routeContext("999"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 409 when attempting to delete an in-flight shipment item", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("CANNOT_DELETE_ITEM_IN_FLIGHT"));

      const response = (await patchShipmentById(
        makePatchRequest("7", { delete_items: [1] }, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
    });

    it("returns 409 when reducing quantities below already released butterflies", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("INVALID_INVENTORY_REDUCTION"));

      const response = (await patchShipmentById(
        makePatchRequest(
          "7",
          {
            update_items: [
              {
                id: 1,
                number_received: 1,
                emerged_in_transit: 0,
                damaged_in_transit: 0,
                diseased_in_transit: 0,
                parasite: 0,
                non_emergence: 0,
                poor_emergence: 0,
              },
            ],
          },
          SLUG,
        ),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
    });

    it("returns 404 when update_items references an item not in this shipment", async () => {
      mockUpdateTenantShipment.mockRejectedValueOnce(new Error("SHIPMENT_ITEM_NOT_FOUND"));

      const response = (await patchShipmentById(
        makePatchRequest(
          "7",
          {
            update_items: [
              {
                id: 999,
                number_received: 10,
                emerged_in_transit: 0,
                damaged_in_transit: 0,
                diseased_in_transit: 0,
                parasite: 0,
                non_emergence: 0,
                poor_emergence: 0,
              },
            ],
          },
          SLUG,
        ),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 on successful update", async () => {
      mockUpdateTenantShipment.mockResolvedValueOnce(true);

      const response = (await patchShipmentById(
        makePatchRequest("7", { supplier_code: "SUP-2" }, SLUG),
        routeContext("7"),
      ))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.updated).toBe(true);
      expect(mockUpdateTenantShipment).toHaveBeenCalledWith(
        expect.objectContaining({ slug: SLUG, id: 7, supplier_code: "SUP-2" }),
      );
    });
  });

  describe("DELETE /api/tenant/shipments/[id]", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await deleteShipmentById(makeDeleteByIdRequest("1"), routeContext("1")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid shipment id", async () => {
      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("abc", SLUG),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockDeleteTenantShipment.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockDeleteTenantShipment.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockDeleteTenantShipment.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when shipment does not exist", async () => {
      mockDeleteTenantShipment.mockResolvedValueOnce(false);

      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("999", SLUG),
        routeContext("999"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 on successful delete", async () => {
      mockDeleteTenantShipment.mockResolvedValueOnce(true);

      const response = (await deleteShipmentById(
        makeDeleteByIdRequest("44", SLUG),
        routeContext("44"),
      ))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.deleted).toBe(true);
      expect(mockDeleteTenantShipment).toHaveBeenCalledWith({ slug: SLUG, id: 44 });
    });
  });

  describe("DELETE /api/tenant/shipments (bulk delete)", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "all" })))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for unrecognised mode", async () => {
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "everything" }, SLUG)))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for year mode missing year field", async () => {
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "year" }, SLUG)))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for range mode missing from/to fields", async () => {
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "range" }, SLUG)))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid calendar date in range mode", async () => {
      const res = (await deleteBulkShipments(
        makeDeleteBulkRequest({ mode: "range", from: "2024-01-01", to: "2024-02-31" }, SLUG),
      ))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when range mode has 'from' after 'to'", async () => {
      const res = (await deleteBulkShipments(
        makeDeleteBulkRequest({ mode: "range", from: "2024-12-31", to: "2024-01-01" }, SLUG),
      ))!;
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockDeleteTenantShipments.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "all" }, SLUG)))!;
      expect(res.status).toBe(401);
    });

    it("returns 403 for insufficient permission", async () => {
      mockDeleteTenantShipments.mockRejectedValueOnce(new Error("FORBIDDEN"));
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "all" }, SLUG)))!;
      expect(res.status).toBe(403);
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockDeleteTenantShipments.mockRejectedValueOnce(new Error("NOT_FOUND"));
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "all" }, SLUG)))!;
      expect(res.status).toBe(404);
    });

    it("deletes all shipments and returns deleted count", async () => {
      mockDeleteTenantShipments.mockResolvedValueOnce({ deleted: 30 });
      const res = (await deleteBulkShipments(makeDeleteBulkRequest({ mode: "all" }, SLUG)))!;
      expect(res.status).toBe(200);
      expect((await res.json()).deleted).toBe(30);
      expect(mockDeleteTenantShipments).toHaveBeenCalledWith({
        slug: SLUG,
        options: { mode: "all" },
      });
    });

    it("deletes shipments by year and returns deleted count", async () => {
      mockDeleteTenantShipments.mockResolvedValueOnce({ deleted: 12 });
      const res = (await deleteBulkShipments(
        makeDeleteBulkRequest({ mode: "year", year: 2023 }, SLUG),
      ))!;
      expect(res.status).toBe(200);
      expect((await res.json()).deleted).toBe(12);
      expect(mockDeleteTenantShipments).toHaveBeenCalledWith({
        slug: SLUG,
        options: { mode: "year", year: 2023 },
      });
    });

    it("deletes shipments by range and returns deleted count", async () => {
      mockDeleteTenantShipments.mockResolvedValueOnce({ deleted: 5 });
      const res = (await deleteBulkShipments(
        makeDeleteBulkRequest({ mode: "range", from: "2022-01-01", to: "2022-12-31" }, SLUG),
      ))!;
      expect(res.status).toBe(200);
      expect((await res.json()).deleted).toBe(5);
      expect(mockDeleteTenantShipments).toHaveBeenCalledWith({
        slug: SLUG,
        options: { mode: "range", from: "2022-01-01", to: "2022-12-31" },
      });
    });
  });

  describe("GET /api/tenant/shipments/[id]/releases", () => {
    it("returns 400 when x-tenant-slug header is missing", async () => {
      const response = (await getShipmentReleases(makeGetReleasesRequest("1"), routeContext("1")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid shipment id", async () => {
      const response = (await getShipmentReleases(
        makeGetReleasesRequest("abc", SLUG),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthenticated requests", async () => {
      mockGetTenantShipmentReleases.mockRejectedValueOnce(new Error("UNAUTHORIZED"));

      const response = (await getShipmentReleases(
        makeGetReleasesRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 for insufficient permission", async () => {
      mockGetTenantShipmentReleases.mockRejectedValueOnce(new Error("FORBIDDEN"));

      const response = (await getShipmentReleases(
        makeGetReleasesRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when tenant slug cannot be resolved", async () => {
      mockGetTenantShipmentReleases.mockRejectedValueOnce(new Error("NOT_FOUND"));

      const response = (await getShipmentReleases(
        makeGetReleasesRequest("1", SLUG),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with release events list", async () => {
      mockGetTenantShipmentReleases.mockResolvedValueOnce([
        {
          id: 3,
          releaseDate: new Date("2025-03-10"),
          releasedBy: "Alice",
          totalReleased: 12,
          totalLosses: 4,
        },
        {
          id: 1,
          releaseDate: new Date("2025-03-01"),
          releasedBy: "Bob",
          totalReleased: 5,
          totalLosses: 0,
        },
      ]);

      const response = (await getShipmentReleases(
        makeGetReleasesRequest("5", SLUG),
        routeContext("5"),
      ))!;
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.releaseEvents).toHaveLength(2);
      expect(body.releaseEvents[0]).toEqual({
        id: 3,
        releaseDate: "2025-03-10T00:00:00.000Z",
        releasedBy: "Alice",
        totalReleased: 12,
        totalLosses: 4,
      });
      expect(body.releaseEvents[1]).toEqual({
        id: 1,
        releaseDate: "2025-03-01T00:00:00.000Z",
        releasedBy: "Bob",
        totalReleased: 5,
        totalLosses: 0,
      });
      expect(new Date(body.releaseEvents[0].releaseDate).getTime()).toBeGreaterThan(
        new Date(body.releaseEvents[1].releaseDate).getTime(),
      );
      expect(mockGetTenantShipmentReleases).toHaveBeenCalledWith({ slug: SLUG, id: 5 });
    });
  });
});
