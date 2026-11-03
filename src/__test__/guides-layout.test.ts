/**
 * The guides route can't be covered by the middleware matcher — it has to
 * answer without a session — so the tenant check lives in the layout. These
 * tests pin that check, and that a redirected request never gets the guide
 * tree back.
 */

const redirectError = (to: string) => {
  const error = new Error(`NEXT_REDIRECT:${to}`);
  (error as Error & { to: string }).to = to;
  return error;
};

jest.mock("next/navigation", () => ({
  redirect: jest.fn((to: string) => {
    throw redirectError(to);
  }),
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/guides-access", () => ({ isGuidesUnlocked: jest.fn() }));

// The layout only picks a shell; none of these need to render.
jest.mock("@/components/platform/layout/tenant/tenant-header", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/platform/layout/tenant/tenant-sidebar", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/platform/layout/tenant/tenant-footer", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/tenant/guides/guides-password-gate", () => ({
  GuidesPasswordGate: () => null,
}));
jest.mock("@/components/tenant/guides/guest-guides-header", () => ({
  GuestGuidesHeader: () => null,
}));

import { auth } from "@/auth";
import { isGuidesUnlocked } from "@/lib/guides-access";
import GuidesLayout from "@/app/[institution]/guides/layout";

const authMock = auth as unknown as jest.Mock;
const unlockedMock = isGuidesUnlocked as unknown as jest.Mock;

const CHILDREN = "GUIDE-CONTENT";

function sessionFor(role: string, institutionSlug?: string) {
  return { user: { id: "7", role, institutionId: 1, institutionSlug } };
}

function render(slug: string) {
  return GuidesLayout({
    children: CHILDREN,
    params: Promise.resolve({ institution: slug }),
  });
}

/** Every string rendered anywhere in the returned tree. */
function textOf(node: unknown): string {
  return JSON.stringify(node, (_key, value) =>
    typeof value === "function" ? value.name || "fn" : value,
  );
}

beforeEach(() => {
  authMock.mockReset();
  unlockedMock.mockReset();
  authMock.mockResolvedValue(null);
  unlockedMock.mockResolvedValue(false);
});

describe("cross-institution access", () => {
  it.each(["EMPLOYEE", "ADMIN"])(
    "redirects a %s to their own institution's guides",
    async (role) => {
      authMock.mockResolvedValue(sessionFor(role, "reiman-gardens"));
      await expect(render("some-other-institution")).rejects.toThrow(
        "NEXT_REDIRECT:/reiman-gardens/guides",
      );
    },
  );

  it("does not return the guide tree on a redirected request", async () => {
    authMock.mockResolvedValue(sessionFor("ADMIN", "reiman-gardens"));
    await expect(render("some-other-institution")).rejects.toThrow();
    // The throw is the point: nothing is returned, so nothing can be
    // serialised into the response for the wrong tenant.
  });

  it("sends a signed-in user with no institution to /unauthorized", async () => {
    authMock.mockResolvedValue(sessionFor("ADMIN", undefined));
    await expect(render("reiman-gardens")).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });

  it("lets a SUPERUSER read another institution's guides", async () => {
    authMock.mockResolvedValue(sessionFor("SUPERUSER", "reiman-gardens"));
    const tree = await render("some-other-institution");
    expect(textOf(tree)).toContain(CHILDREN);
  });

  it("lets a user read their own institution's guides", async () => {
    authMock.mockResolvedValue(sessionFor("EMPLOYEE", "reiman-gardens"));
    const tree = await render("reiman-gardens");
    expect(textOf(tree)).toContain(CHILDREN);
  });
});

describe("signed-out access", () => {
  it("shows the gate and withholds the guide tree when locked", async () => {
    const tree = await render("reiman-gardens");
    expect(textOf(tree)).not.toContain(CHILDREN);
  });

  it("shows the guide tree once the password cookie is present", async () => {
    unlockedMock.mockResolvedValue(true);
    const tree = await render("reiman-gardens");
    expect(textOf(tree)).toContain(CHILDREN);
  });
});
