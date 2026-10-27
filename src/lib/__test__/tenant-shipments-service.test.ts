jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: { select: jest.fn() },
}));

jest.mock("@/lib/queries/shipments", () => ({
  deleteShipment: jest.fn(),
  SHIPMENT_ERRORS: {},
}));

jest.mock("@/lib/queries/releases", () => ({}));
jest.mock("@/lib/wingspan/client", () => ({}));

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { DELETE } from "@/app/api/tenant/shipments/[id]/route";
import { createThenableQuery } from "@/__test__/api/_utils/mockDb";
import type { UserRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { deleteShipment } from "@/lib/queries/shipments";
import { deleteTenantShipment } from "@/lib/services/tenant-shipments";
import { TENANT_ERRORS } from "@/lib/tenant";

const mockAuth = auth as jest.Mock;
const mockSelect = db.select as jest.Mock;
const mockDeleteShipment = deleteShipment as jest.Mock;

const SLUG = "butterfly-house";
const TENANT_ID = 7;
const SHIPMENT_ID = 42;

function signIn(role: UserRole, institutionId: number | null = TENANT_ID) {
  mockAuth.mockResolvedValue({
    user: { id: "1", role, institutionId },
    expires: "2027-01-01T00:00:00.000Z",
  });
}

function requestDelete() {
  return DELETE(
    new NextRequest(`http://localhost/api/tenant/shipments/${SHIPMENT_ID}`, {
      method: "DELETE",
      headers: { "x-tenant-slug": SLUG },
    }),
    { params: Promise.resolve({ id: String(SHIPMENT_ID) }) },
  );
}

describe("tenant shipment deletion authorization", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSelect.mockImplementation(() => createThenableQuery([{ id: TENANT_ID, slug: SLUG }]));
    mockDeleteShipment.mockResolvedValue(true);
  });

  describe("service", () => {
    it.each([
      ["ADMIN", TENANT_ID],
      ["SUPERUSER", null],
    ] as const)("allows %s to delete within the resolved tenant", async (role, institutionId) => {
      signIn(role, institutionId);

      await expect(deleteTenantShipment({ slug: SLUG, id: SHIPMENT_ID })).resolves.toBe(true);

      expect(mockDeleteShipment).toHaveBeenCalledTimes(1);
      expect(mockDeleteShipment).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_ID);
    });

    it("rejects EMPLOYEE before resolving the tenant or deleting records", async () => {
      signIn("EMPLOYEE");

      await expect(deleteTenantShipment({ slug: SLUG, id: SHIPMENT_ID })).rejects.toThrow(
        "FORBIDDEN",
      );

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockDeleteShipment).not.toHaveBeenCalled();
    });

    it("rejects an ADMIN targeting another institution", async () => {
      signIn("ADMIN", 99);

      await expect(deleteTenantShipment({ slug: SLUG, id: SHIPMENT_ID })).rejects.toThrow(
        TENANT_ERRORS.FORBIDDEN_CROSS_TENANT_ACCESS,
      );

      expect(mockDeleteShipment).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated deletion without querying the database", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(deleteTenantShipment({ slug: SLUG, id: SHIPMENT_ID })).rejects.toThrow(
        "UNAUTHORIZED",
      );

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockDeleteShipment).not.toHaveBeenCalled();
    });
  });

  describe("DELETE endpoint with real service authorization", () => {
    it.each([
      ["ADMIN", TENANT_ID],
      ["SUPERUSER", null],
    ] as const)("returns 200 for %s using the resolved tenant", async (role, institutionId) => {
      signIn(role, institutionId);

      const response = await requestDelete();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ deleted: true });
      expect(mockDeleteShipment).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_ID);
    });

    it("returns 403 when EMPLOYEE manually calls DELETE", async () => {
      signIn("EMPLOYEE");

      const response = await requestDelete();

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockDeleteShipment).not.toHaveBeenCalled();
    });

    it("returns 403 when ADMIN manually targets another institution", async () => {
      signIn("ADMIN", 99);

      const response = await requestDelete();

      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("FORBIDDEN");
      expect(mockDeleteShipment).not.toHaveBeenCalled();
    });
  });
});
