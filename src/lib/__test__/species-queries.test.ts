const mockInsert = jest.fn();
const mockOnConflictDoNothing = jest.fn();
const mockOnConflictDoUpdate = jest.fn();
const mockReturning = jest.fn();
const mockValues = jest.fn((rows: unknown) => ({
  onConflictDoNothing: mockOnConflictDoNothing,
  onConflictDoUpdate: mockOnConflictDoUpdate,
}));

jest.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
  },
}));

import { butterfly_species_institution } from "@/lib/schema";
import {
  createSpecies,
  ensureSpeciesLinksForInstitution,
  upsertSpeciesOverride,
} from "@/lib/queries/species";

const conflictTarget = [
  butterfly_species_institution.butterfly_species_id,
  butterfly_species_institution.institution_id,
];

describe("species queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([{ id: 1 }]);
  });

  it("ensures species links with onConflictDoNothing so existing overrides are preserved", async () => {
    await ensureSpeciesLinksForInstitution(7, [3, 5, 3]);

    expect(mockInsert).toHaveBeenCalledWith(butterfly_species_institution);
    expect(mockValues).toHaveBeenCalledWith([
      {
        institution_id: 7,
        butterfly_species_id: 3,
      },
      {
        institution_id: 7,
        butterfly_species_id: 5,
      },
    ]);
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith({
      target: conflictTarget,
    });
  });

  it("supports transactional executors for manual shipment linking", async () => {
    const txInsert = jest.fn((_table?: unknown) => ({ values: mockValues }));

    await ensureSpeciesLinksForInstitution(11, [8], { insert: txInsert } as unknown as Parameters<
      typeof ensureSpeciesLinksForInstitution
    >[2]);

    expect(txInsert).toHaveBeenCalledWith(butterfly_species_institution);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  describe("createSpecies", () => {
    const minimalInput = {
      scientific_name: "danaus plexippus",
      common_name: "Monarch",
      family: "Nymphalidae",
      sub_family: "Danainae",
      lifespan_days: 30,
      range: ["North America"],
    };

    it("uses the plain db client by default (existing platform species-admin caller)", async () => {
      const dbReturning = jest.fn().mockResolvedValueOnce([{ id: 1, ...minimalInput }]);
      const dbValues = jest.fn(() => ({ returning: dbReturning }));
      mockInsert.mockReturnValueOnce({ values: dbValues });

      const row = await createSpecies(minimalInput);

      expect(row).toEqual({ id: 1, ...minimalInput });
      expect(dbValues).toHaveBeenCalledWith(minimalInput);
    });

    it("uses a supplied executor instead of the plain db client", async () => {
      const txReturning = jest.fn().mockResolvedValueOnce([{ id: 2, ...minimalInput }]);
      const txValues = jest.fn(() => ({ returning: txReturning }));
      const txInsert = jest.fn(() => ({ values: txValues }));

      const row = await createSpecies(minimalInput, { insert: txInsert } as unknown as Parameters<
        typeof createSpecies
      >[1]);

      expect(row).toEqual({ id: 2, ...minimalInput });
      expect(txInsert).toHaveBeenCalledTimes(1);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("upsertSpeciesOverride", () => {
    it("upserts on the (species, institution) pair", async () => {
      await upsertSpeciesOverride(7, 3, { common_name_override: "Exhibit Morpho" });

      expect(mockInsert).toHaveBeenCalledWith(butterfly_species_institution);
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ target: conflictTarget }),
      );
    });

    it("leaves an omitted column untouched on update", async () => {
      await upsertSpeciesOverride(7, 3, { common_name_override: "Exhibit Morpho" });

      const [{ set }] = mockOnConflictDoUpdate.mock.calls[0] as [{ set: Record<string, unknown> }];

      expect(set).toHaveProperty("common_name_override", "Exhibit Morpho");
      // lifespan_override was not supplied, so the existing value must survive.
      expect(set).not.toHaveProperty("lifespan_override");
    });

    it("clears an override when an explicit null is supplied", async () => {
      await upsertSpeciesOverride(7, 3, { common_name_override: null, lifespan_override: 21 });

      const [{ set }] = mockOnConflictDoUpdate.mock.calls[0] as [{ set: Record<string, unknown> }];

      expect(set).toHaveProperty("common_name_override", null);
      expect(set).toHaveProperty("lifespan_override", 21);
    });

    it("writes both overrides on the insert path", async () => {
      await upsertSpeciesOverride(7, 3, { lifespan_override: 21 });

      expect(mockValues).toHaveBeenCalledWith({
        institution_id: 7,
        butterfly_species_id: 3,
        common_name_override: null,
        lifespan_override: 21,
      });
    });
  });
});
