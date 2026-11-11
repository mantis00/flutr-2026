jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/authz", () => ({
  requireUser: jest.fn(),
  canWriteShipment: jest.fn(() => true),
}));
jest.mock("@/lib/tenant", () => ({ resolveTenantBySlug: jest.fn() }));
jest.mock("@/lib/queries/institution", () => ({ getTenantInstitution: jest.fn() }));
jest.mock("@/lib/queries/shipments", () => ({
  createShipment: jest.fn(),
  updateShipment: jest.fn(),
  SHIPMENT_ERRORS: {
    PARASITE_DETAILS_REQUIRED: "PARASITE_DETAILS_REQUIRED",
    INVALID_PARASITE_DETAILS: "INVALID_PARASITE_DETAILS",
  },
}));
jest.mock("@/lib/queries/releases", () => ({}));
jest.mock("@/lib/wingspan/client", () => ({ attachImagesCamel: jest.fn() }));

import { auth } from "@/auth";
import { requireUser } from "@/lib/authz";
import { getTenantInstitution } from "@/lib/queries/institution";
import { createShipment, updateShipment } from "@/lib/queries/shipments";
import { resolveTenantBySlug } from "@/lib/tenant";
import { createTenantShipment, updateTenantShipment } from "@/lib/services/tenant-shipments";

const mockAuth = auth as jest.Mock;
const mockRequireUser = requireUser as jest.Mock;
const mockGetTenantInstitution = getTenantInstitution as jest.Mock;
const mockCreateShipment = createShipment as jest.Mock;
const mockUpdateShipment = updateShipment as jest.Mock;
const mockResolveTenant = resolveTenantBySlug as jest.Mock;

const shipmentFields = {
  supplier_code: "SUP-1",
  shipment_date: new Date("2026-01-10T00:00:00.000Z"),
  arrival_date: new Date("2026-01-11T00:00:00.000Z"),
};

const parasitizedItem = {
  butterfly_species_id: 1,
  number_received: 5,
  emerged_in_transit: 0,
  damaged_in_transit: 0,
  diseased_in_transit: 0,
  parasite: 2,
  non_emergence: 0,
  poor_emergence: 0,
};

describe("parasite tracking shipment service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "1" } });
    mockRequireUser.mockReturnValue({ id: 1, role: "ADMIN", institutionId: 7 });
    mockResolveTenant.mockResolvedValue(7);
    mockGetTenantInstitution.mockResolvedValue({ track_parasite_details: true });
    mockCreateShipment.mockResolvedValue(10);
    mockUpdateShipment.mockResolvedValue(true);
  });

  it("requires complete classification when creating a shipment for a tracking institution", async () => {
    await expect(
      createTenantShipment({
        slug: "butterfly-house",
        ...shipmentFields,
        items: [parasitizedItem],
      }),
    ).rejects.toThrow("PARASITE_DETAILS_REQUIRED");
    expect(mockCreateShipment).not.toHaveBeenCalled();
  });

  it("accepts multiple classified parasite types when their counts match", async () => {
    await expect(
      createTenantShipment({
        slug: "butterfly-house",
        ...shipmentFields,
        items: [
          {
            ...parasitizedItem,
            parasite_details: [
              { type: "wasp", count: 1 },
              { type: "fly", count: 1 },
            ],
          },
        ],
      }),
    ).resolves.toBe(10);
    expect(mockCreateShipment).toHaveBeenCalledTimes(1);
  });

  it("allows an institution that disabled parasite tracking to save unclassified counts", async () => {
    mockGetTenantInstitution.mockResolvedValue({ track_parasite_details: false });

    await expect(
      createTenantShipment({
        slug: "butterfly-house",
        ...shipmentFields,
        items: [parasitizedItem],
      }),
    ).resolves.toBe(10);
    expect(mockCreateShipment).toHaveBeenCalledTimes(1);
  });

  it("requires classifications for newly added parasitized items when tracking is enabled", async () => {
    await expect(
      updateTenantShipment({
        slug: "butterfly-house",
        id: 5,
        add_items: [parasitizedItem],
      }),
    ).rejects.toThrow("PARASITE_DETAILS_REQUIRED");
    expect(mockUpdateShipment).not.toHaveBeenCalled();
  });

  it("passes the institution setting to shipment updates", async () => {
    await expect(
      updateTenantShipment({
        slug: "butterfly-house",
        id: 5,
        update_items: [
          {
            id: 2,
            number_received: 5,
            emerged_in_transit: 0,
            damaged_in_transit: 0,
            diseased_in_transit: 0,
            parasite: 0,
            non_emergence: 0,
            poor_emergence: 0,
          },
        ],
      }),
    ).resolves.toBe(true);

    expect(mockUpdateShipment).toHaveBeenCalledWith(
      7,
      5,
      expect.objectContaining({ update_items: expect.any(Array) }),
      true,
    );
  });
});
