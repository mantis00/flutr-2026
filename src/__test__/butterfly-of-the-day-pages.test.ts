const mockStatsHighlightCards = jest.fn(() => null);

jest.mock("@/lib/queries/institution", () => ({
  getPublicInstitution: jest.fn(),
}));

jest.mock("@/lib/queries/home", () => ({
  getInstitutionHomeData: jest.fn(),
  getPublicNewsPreview: jest.fn(),
  getPublicNewsEntries: jest.fn(),
}));

jest.mock("@/lib/services/butterfly-of-the-day", () => ({
  getButterflyOfTheDay: jest.fn(),
}));

jest.mock("@/lib/wingspan/client", () => ({
  attachImages: jest.fn((rows) => Promise.resolve(rows)),
}));

jest.mock("@/lib/queries/stats", () => ({
  getStatsData: jest.fn(),
  transformStatsData: jest.fn(),
}));

jest.mock("@/components/public/home/hero-section", () => ({
  HeroSection: () => null,
}));

jest.mock("@/components/public/home/featured-butterfly", () => ({
  FeaturedButterfly: () => null,
}));

jest.mock("@/components/public/home/explore-links", () => ({
  ExploreLinks: () => null,
}));

jest.mock("@/components/public/home/news-section", () => ({
  NewsSection: () => null,
}));

jest.mock("@/components/shared/stats/stats-header", () => ({
  StatsHeader: () => null,
}));

jest.mock("@/components/shared/stats/stats-overview-cards", () => ({
  StatsOverviewCards: () => null,
}));

jest.mock("@/components/shared/stats/stats-highlight-cards", () => ({
  StatsHighlightCards: mockStatsHighlightCards,
}));

jest.mock("@/components/shared/stats/species-breakdown-chart", () => ({
  SpeciesBreakdownChart: () => null,
}));

jest.mock("@/components/shared/stats/family-distribution-chart", () => ({
  FamilyDistributionChart: () => null,
}));

jest.mock("@/components/shared/stats/region-distribution-panel", () => ({
  RegionDistributionPanel: () => null,
}));

import InstitutionPage from "@/app/[institution]/(public)/page";
import StatsPage from "@/app/[institution]/(public)/stats/page";
import { getPublicInstitution } from "@/lib/queries/institution";
import {
  getInstitutionHomeData,
  getPublicNewsPreview,
  getPublicNewsEntries,
} from "@/lib/queries/home";
import { getButterflyOfTheDay } from "@/lib/services/butterfly-of-the-day";
import { getStatsData, transformStatsData } from "@/lib/queries/stats";

const mockGetPublicInstitution = getPublicInstitution as jest.Mock;
const mockGetInstitutionHomeData = getInstitutionHomeData as jest.Mock;
const mockGetPublicNewsPreview = getPublicNewsPreview as jest.Mock;
const mockGetPublicNewsEntries = getPublicNewsEntries as jest.Mock;
const mockGetButterflyOfTheDay = getButterflyOfTheDay as jest.Mock;
const mockGetStatsData = getStatsData as jest.Mock;
const mockTransformStatsData = transformStatsData as jest.Mock;

function findElementByType(node: unknown, targetType: unknown): Record<string, unknown> | null {
  if (node == null) return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, targetType);
      if (match) return match;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  const candidate = node as {
    type?: unknown;
    props?: {
      children?: unknown;
    };
  };

  if (candidate.type === targetType) {
    return candidate as Record<string, unknown>;
  }

  return findElementByType(candidate.props?.children, targetType);
}

describe("Butterfly of the Day pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the shared Butterfly of the Day helper on the public home page", async () => {
    mockGetPublicInstitution.mockResolvedValueOnce({ id: 12, name: "Reiman Gardens" });
    mockGetInstitutionHomeData.mockResolvedValueOnce({
      totalButterflies: 5,
      totalSpecies: 2,
    });
    mockGetButterflyOfTheDay.mockResolvedValueOnce({
      scientific_name: "Papilio maackii",
      common_name: "Alpine Black Swallowtail",
      family: "Papilionidae",
      images: [],
      range: ["Asia"],
      lifespan_days: 10,
      host_plant: "Citrus",
      in_flight_count: 2,
    });
    mockGetPublicNewsPreview.mockResolvedValueOnce(null);
    mockGetPublicNewsEntries.mockResolvedValueOnce([]);

    await InstitutionPage({
      params: Promise.resolve({ institution: "reiman-gardens" }),
    });

    expect(mockGetButterflyOfTheDay).toHaveBeenCalledWith(12);
  });

  it("uses the shared Butterfly of the Day helper on the public stats page", async () => {
    mockGetPublicInstitution.mockResolvedValueOnce({ id: 33, name: "Omaha Zoo" });
    mockGetStatsData.mockResolvedValueOnce([{ scientific_name: "one" }]);
    mockTransformStatsData.mockReturnValueOnce({
      totalButterflies: 6,
      totalSpecies: 2,
      uniqueFamilies: 2,
      averageLifespan: 12,
      speciesBreakdown: [
        {
          name: "Blue Morpho",
          quantity: 4,
          scientific_name: "Morpho peleides",
          family: "Nymphalidae",
          range: ["South America"],
          images: [],
        },
        {
          name: "Paper Kite",
          quantity: 2,
          scientific_name: "Idea leuconoe",
          family: "Nymphalidae",
          range: ["Asia"],
          images: [],
        },
      ],
      familyDistribution: [],
      regionDistribution: [],
    });
    mockGetButterflyOfTheDay.mockResolvedValueOnce({
      scientific_name: "Idea leuconoe",
      common_name: "Paper Kite",
      family: "Nymphalidae",
      images: [],
      range: ["Asia"],
      lifespan_days: 14,
      host_plant: null,
      in_flight_count: 2,
    });

    const tree = await StatsPage({
      params: Promise.resolve({ institution: "omaha-zoo" }),
    });

    expect(mockGetButterflyOfTheDay).toHaveBeenCalledWith(33);

    const notableSpecies = findElementByType(tree, mockStatsHighlightCards);

    expect(notableSpecies).not.toBeNull();
    expect(notableSpecies?.props).toEqual(
      expect.objectContaining({
        slug: "omaha-zoo",
        mostCommon: expect.objectContaining({
          name: "Blue Morpho",
          quantity: 4,
          scientific_name: "Morpho peleides",
        }),
        mostRare: expect.objectContaining({
          name: "Paper Kite",
          quantity: 2,
          scientific_name: "Idea leuconoe",
        }),
        daily: expect.objectContaining({
          name: "Paper Kite",
          quantity: 2,
          scientific_name: "Idea leuconoe",
        }),
      }),
    );
  });

  it("reuses the single current species as both most common and most rare", async () => {
    mockGetPublicInstitution.mockResolvedValueOnce({ id: 41, name: "Single Species House" });
    mockGetStatsData.mockResolvedValueOnce([{ scientific_name: "one" }]);
    mockTransformStatsData.mockReturnValueOnce({
      totalButterflies: 4,
      totalSpecies: 1,
      uniqueFamilies: 1,
      averageLifespan: 9,
      speciesBreakdown: [
        {
          name: "Julia",
          quantity: 4,
          scientific_name: "Dryas iulia",
          family: "Nymphalidae",
          range: ["South America"],
          images: [],
        },
      ],
      familyDistribution: [],
      regionDistribution: [],
    });
    mockGetButterflyOfTheDay.mockResolvedValueOnce({
      scientific_name: "Dryas iulia",
      common_name: "Julia",
      family: "Nymphalidae",
      images: [],
      range: ["South America"],
      lifespan_days: 9,
      host_plant: null,
      in_flight_count: 4,
    });

    const tree = await StatsPage({
      params: Promise.resolve({ institution: "single-species-house" }),
    });

    const notableSpecies = findElementByType(tree, mockStatsHighlightCards);

    expect(notableSpecies).not.toBeNull();
    expect(notableSpecies?.props).toEqual(
      expect.objectContaining({
        mostCommon: expect.objectContaining({
          scientific_name: "Dryas iulia",
          quantity: 4,
        }),
        mostRare: expect.objectContaining({
          scientific_name: "Dryas iulia",
          quantity: 4,
        }),
      }),
    );
  });

  it("keeps the zero-current stats page safe by not rendering notable species", async () => {
    mockGetPublicInstitution.mockResolvedValueOnce({ id: 51, name: "Quiet House" });
    mockGetStatsData.mockResolvedValueOnce([]);
    mockTransformStatsData.mockReturnValueOnce({
      totalButterflies: 0,
      totalSpecies: 0,
      uniqueFamilies: 0,
      averageLifespan: 0,
      speciesBreakdown: [],
      familyDistribution: [],
      regionDistribution: [],
    });
    mockGetButterflyOfTheDay.mockResolvedValueOnce(null);

    const tree = await StatsPage({
      params: Promise.resolve({ institution: "quiet-house" }),
    });

    expect(findElementByType(tree, mockStatsHighlightCards)).toBeNull();
  });
});
