import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { canCrossTenant, requireUser } from "@/lib/authz";

export const GUIDES_COOKIE = "guides_access";

/** 30 days — long enough that staff without an account don't retype it each shift. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function guidesPassword(): string {
  // ponytail: one shared password, a default that is published in this repo, and
  // no attempt limit on the unlock form. Deliberate — this gates documentation,
  // not data. Set GUIDES_PASSWORD and add throttling before it guards anything
  // worth guessing at.
  return process.env.GUIDES_PASSWORD || "flutr2026";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Cookie value. Derived from the password and AUTH_SECRET so the cookie never
 * carries the password itself and stops working if either is rotated.
 */
function unlockToken(): string {
  return sha256(`${guidesPassword()}:${process.env.AUTH_SECRET ?? ""}`);
}

/** Constant-time compare of two equal-length hex digests. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function passwordMatches(input: string): boolean {
  return digestsMatch(sha256(input), sha256(guidesPassword()));
}

export async function isGuidesUnlocked(): Promise<boolean> {
  const value = (await cookies()).get(GUIDES_COOKIE)?.value;
  if (!value) return false;
  try {
    return digestsMatch(value, unlockToken());
  } catch {
    // Cookie wasn't hex, so it wasn't ours.
    return false;
  }
}

/**
 * Guide pages must call this themselves, not rely on the layout. A layout can
 * neither withhold the page by dropping `children` nor stop it by redirecting:
 * the page renders in parallel and streams out ahead of the redirect, so
 * gating only in the layout ships the content either way.
 *
 * `slug` is the institution in the URL. A signed-in user may read only their
 * own institution's guides unless they can cross tenants.
 */
export async function canReadGuides(slug: string): Promise<boolean> {
  const session = await auth();
  try {
    const user = requireUser(session);
    return canCrossTenant(user) || session?.user?.institutionSlug === slug;
  } catch {
    return isGuidesUnlocked();
  }
}

export async function setGuidesUnlockedCookie(): Promise<void> {
  (await cookies()).set(GUIDES_COOKIE, unlockToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}
