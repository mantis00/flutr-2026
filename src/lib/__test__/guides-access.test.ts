const mockCookieStore = new Map<string, string>();

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mockCookieStore.has(name) ? { name, value: mockCookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      mockCookieStore.set(name, value);
    },
  }),
}));

jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import {
  GUIDES_COOKIE,
  canReadGuides,
  isGuidesUnlocked,
  passwordMatches,
  setGuidesUnlockedCookie,
} from "@/lib/guides-access";

const authMock = auth as unknown as jest.Mock;

const SESSION = {
  user: { id: "1", role: "EMPLOYEE", institutionId: 1 },
};

beforeEach(() => {
  mockCookieStore.clear();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
  process.env.AUTH_SECRET = "test-secret";
  delete process.env.GUIDES_PASSWORD;
});

describe("passwordMatches", () => {
  it("accepts the configured password", () => {
    process.env.GUIDES_PASSWORD = "correct horse";
    expect(passwordMatches("correct horse")).toBe(true);
  });

  it("falls back to the default password when none is configured", () => {
    expect(passwordMatches("flutr2026")).toBe(true);
  });

  it("rejects a wrong password, including near misses", () => {
    expect(passwordMatches("flutr2025")).toBe(false);
    expect(passwordMatches("Flutr2026")).toBe(false);
    expect(passwordMatches("flutr2026 ")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("rejects without throwing on inputs far longer than the password", () => {
    // Digests are fixed width, so the constant-time compare can't be tripped
    // into a length mismatch by a huge input.
    expect(passwordMatches("x".repeat(100_000))).toBe(false);
  });
});

describe("isGuidesUnlocked", () => {
  it("is false when no cookie is set", async () => {
    await expect(isGuidesUnlocked()).resolves.toBe(false);
  });

  it("is true for a cookie this module issued", async () => {
    await setGuidesUnlockedCookie();
    await expect(isGuidesUnlocked()).resolves.toBe(true);
  });

  it("never stores the password itself", async () => {
    process.env.GUIDES_PASSWORD = "super-secret-value";
    await setGuidesUnlockedCookie();
    const value = mockCookieStore.get(GUIDES_COOKIE)!;
    expect(value).not.toContain("super-secret-value");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is false for a tampered or foreign cookie, without throwing", async () => {
    for (const value of ["", "not-hex-at-all", "ab", "f".repeat(64), "zz".repeat(32)]) {
      mockCookieStore.set(GUIDES_COOKIE, value);
      await expect(isGuidesUnlocked()).resolves.toBe(false);
    }
  });

  it("stops accepting a cookie once the password is rotated", async () => {
    process.env.GUIDES_PASSWORD = "first";
    await setGuidesUnlockedCookie();
    await expect(isGuidesUnlocked()).resolves.toBe(true);

    process.env.GUIDES_PASSWORD = "second";
    await expect(isGuidesUnlocked()).resolves.toBe(false);
  });

  it("stops accepting a cookie once AUTH_SECRET is rotated", async () => {
    await setGuidesUnlockedCookie();
    process.env.AUTH_SECRET = "a-different-secret";
    await expect(isGuidesUnlocked()).resolves.toBe(false);
  });
});

describe("canReadGuides", () => {
  it("allows a signed-in user with no cookie", async () => {
    authMock.mockResolvedValue(SESSION);
    await expect(canReadGuides()).resolves.toBe(true);
  });

  it("allows a signed-out reader holding a valid cookie", async () => {
    await setGuidesUnlockedCookie();
    await expect(canReadGuides()).resolves.toBe(true);
  });

  it("refuses a signed-out reader with no cookie", async () => {
    await expect(canReadGuides()).resolves.toBe(false);
  });

  it("refuses a session that carries no usable user", async () => {
    authMock.mockResolvedValue({ user: { id: "1" } });
    await expect(canReadGuides()).resolves.toBe(false);
  });
});
