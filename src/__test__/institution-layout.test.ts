// Asserts on the serialized tree, not the status code: the layout's provider props
// end up in the HTML and RSC payload of every route beneath it, including 404s.

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/queries/institution", () => ({ getInstitutionBySlug: jest.fn() }));

import { auth } from "@/auth";
import { getInstitutionBySlug } from "@/lib/queries/institution";
import InstitutionLayout from "@/app/[institution]/layout";

const authMock = auth as unknown as jest.Mock;
const getInstitutionMock = getInstitutionBySlug as unknown as jest.Mock;

const SLUG = "reiman-gardens";

const MARKERS = [
  "MARKER-NAME",
  "MARKER-DESCRIPTION",
  "MARKER-STREET",
  "MARKER-EMAIL",
  "MARKER-PHONE",
  "MARKER-LOGO-URL",
  "MARKER-FACEBOOK",
];

function profile(publicSiteLive: boolean) {
  return {
    id: 1,
    name: "MARKER-NAME",
    main_header: null,
    description: "MARKER-DESCRIPTION",
    street_address: "MARKER-STREET",
    extended_address: null,
    city: "Ames",
    state_province: "IA",
    postal_code: "50011",
    country: "US",
    email_address: "MARKER-EMAIL",
    phone_number: "MARKER-PHONE",
    website_url: null,
    volunteer_url: null,
    donation_url: null,
    logo_url: "MARKER-LOGO-URL",
    facility_image_url: null,
    theme_colors: ["#1d4ed8"],
    social_links: { facebook: "MARKER-FACEBOOK" },
    public_site_live: publicSiteLive,
  };
}

function sessionFor(role: string, institutionSlug?: string) {
  return { user: { id: "7", role, institutionId: 1, institutionSlug } };
}

function render(slug = SLUG) {
  return InstitutionLayout({
    children: "PAGE",
    params: Promise.resolve({ institution: slug }),
  });
}

function payloadOf(node: unknown): string {
  return JSON.stringify(node, (_key, value) =>
    typeof value === "function" ? value.name || "fn" : value,
  );
}

beforeEach(() => {
  authMock.mockReset();
  getInstitutionMock.mockReset();
  authMock.mockResolvedValue(null);
});

it("404s an institution that doesn't exist", async () => {
  getInstitutionMock.mockResolvedValue(null);
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});

describe("hidden public site", () => {
  beforeEach(() => getInstitutionMock.mockResolvedValue(profile(false)));

  it("keeps the profile out of the payload for an anonymous visitor", async () => {
    const payload = payloadOf(await render());
    for (const marker of MARKERS) expect(payload).not.toContain(marker);
  });

  it("keeps the profile out of the payload for another institution's staff", async () => {
    authMock.mockResolvedValue(sessionFor("ADMIN", "some-other-institution"));
    const payload = payloadOf(await render());
    for (const marker of MARKERS) expect(payload).not.toContain(marker);
  });

  it("still renders the page tree, so staff routes keep working", async () => {
    expect(payloadOf(await render())).toContain("PAGE");
  });

  it("gives the profile to its own staff", async () => {
    authMock.mockResolvedValue(sessionFor("EMPLOYEE", SLUG));
    const payload = payloadOf(await render());
    for (const marker of MARKERS) expect(payload).toContain(marker);
  });

  it("gives the profile to a SUPERUSER from elsewhere", async () => {
    authMock.mockResolvedValue(sessionFor("SUPERUSER", "some-other-institution"));
    expect(payloadOf(await render())).toContain("MARKER-NAME");
  });
});

describe("live public site", () => {
  beforeEach(() => getInstitutionMock.mockResolvedValue(profile(true)));

  it("gives the profile to an anonymous visitor", async () => {
    const payload = payloadOf(await render());
    for (const marker of MARKERS) expect(payload).toContain(marker);
  });

  it("never reads the session, so public pages stay static", async () => {
    await render();
    expect(authMock).not.toHaveBeenCalled();
  });
});
