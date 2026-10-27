jest.mock("@/lib/queries/institution", () => ({
  getPublicInstitution: jest.fn(),
}));

jest.mock("@/lib/queries/gallery", () => ({
  getGalleryData: jest.fn(),
  getGalleryGlobalSpecies: jest.fn(),
}));

jest.mock("@/components/public/gallery/gallery-header", () => ({
  GalleryHeader: () => null,
}));

jest.mock("@/components/public/gallery/gallery-content", () => ({
  GalleryContent: () => null,
}));

import GalleryPage from "@/app/[institution]/(public)/gallery/page";
import { getPublicInstitution } from "@/lib/queries/institution";
import { getGalleryData, getGalleryGlobalSpecies } from "@/lib/queries/gallery";

const mockGetPublicInstitution = getPublicInstitution as jest.Mock;
const mockGetGalleryData = getGalleryData as jest.Mock;
const mockGetGalleryGlobalSpecies = getGalleryGlobalSpecies as jest.Mock;

describe("GalleryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes the institution id to both institution and global gallery queries", async () => {
    mockGetPublicInstitution.mockResolvedValueOnce({ id: 77, name: "Test House" });
    mockGetGalleryData.mockResolvedValueOnce({ species: [] });
    mockGetGalleryGlobalSpecies.mockResolvedValueOnce([]);

    await GalleryPage({
      params: Promise.resolve({ institution: "test-house" }),
    });

    expect(mockGetPublicInstitution).toHaveBeenCalledWith("test-house");
    expect(mockGetGalleryData).toHaveBeenCalledWith(77);
    expect(mockGetGalleryGlobalSpecies).toHaveBeenCalledWith(77);
  });
});
