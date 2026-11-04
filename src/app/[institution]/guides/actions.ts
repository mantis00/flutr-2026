"use server";

import { passwordMatches, setGuidesUnlockedCookie } from "@/lib/guides-access";

export type UnlockState = { error: string | null };

export async function unlockGuides(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const password = String(formData.get("password") ?? "");

  if (!passwordMatches(password)) {
    return { error: "That password isn't right. Check it and try again." };
  }

  await setGuidesUnlockedCookie();
  // Setting the cookie re-renders this route, and the layout then reads it.
  return { error: null };
}
