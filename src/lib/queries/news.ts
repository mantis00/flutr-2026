import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { institution_news, institutions } from "@/lib/schema";

export async function listNewsForTenant(institutionId: number) {
  return db
    .select()
    .from(institution_news)
    .where(eq(institution_news.institution_id, institutionId))
    .orderBy(desc(institution_news.created_at));
}

export async function getNewsEntryById(institutionId: number, id: number) {
  const [row] = await db
    .select()
    .from(institution_news)
    .where(and(eq(institution_news.institution_id, institutionId), eq(institution_news.id, id)))
    .limit(1);

  return row ?? null;
}

export async function createNewsEntry(
  institutionId: number,
  data: { title: string; content: string; image_url?: string; is_active?: boolean },
) {
  const [row] = await db
    .insert(institution_news)
    .values({
      institution_id: institutionId,
      title: data.title,
      content: data.content,
      image_url: data.image_url,
      is_active: data.is_active ?? true,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  return row ?? null;
}

export async function updateNewsEntry(
  institutionId: number,
  id: number,
  data: Partial<{
    title: string;
    content: string;
    image_url: string | null;
    is_active: boolean;
    show_on_homepage: boolean;
  }>,
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .for("update");

    const [existing] = await tx
      .select({ is_active: institution_news.is_active })
      .from(institution_news)
      .where(and(eq(institution_news.institution_id, institutionId), eq(institution_news.id, id)))
      .for("update");

    if (!existing) return null;

    if (data.show_on_homepage === true) {
      if (data.is_active === false || !existing.is_active) {
        throw new Error("CONFLICT");
      }

      await tx
        .update(institution_news)
        .set({ show_on_homepage: false, updated_at: new Date() })
        .where(
          and(
            eq(institution_news.institution_id, institutionId),
            eq(institution_news.show_on_homepage, true),
          ),
        );
    }

    const updateData = {
      ...data,
      ...(data.is_active === false ? { show_on_homepage: false } : {}),
      updated_at: new Date(),
    };
    const [row] = await tx
      .update(institution_news)
      .set(updateData)
      .where(and(eq(institution_news.institution_id, institutionId), eq(institution_news.id, id)))
      .returning();

    return row ?? null;
  });
}

export async function deleteNewsEntry(institutionId: number, id: number) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .for("update");

    const [row] = await tx
      .delete(institution_news)
      .where(and(eq(institution_news.institution_id, institutionId), eq(institution_news.id, id)))
      .returning();

    return row ?? null;
  });
}
