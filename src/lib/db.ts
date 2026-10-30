import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/schema";

const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });

/**
 * Minimal shape shared by `db` and a `db.transaction` callback's `tx` argument, so a query
 * function can accept either and participate in a caller-owned transaction when given one.
 * Verified assignable from an actual transaction handle (not just assumed) before adding `update`
 * or `delete` here — widen only as a concrete caller actually needs the extra method.
 */
export type DbExecutor = Pick<typeof db, "insert" | "select">;
