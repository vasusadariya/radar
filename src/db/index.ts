import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set — see README");

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { pool?: Pool };

/**
 * Serverless-safe pool. On Vercel's Fluid compute a function instance is frozen
 * between requests; sockets left open across a freeze go dead and a query on one
 * can hang until the 300s function timeout. So: close idle connections fast, let
 * Vercel keep the instance alive until they're closed (attachDatabasePool), and
 * put a hard client-side timeout on every query as a last line of defence.
 */
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    // Supabase's pooler presents a certificate Node doesn't chain to a public root.
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
if (!globalForDb.pool) {
  // A dropped connection must not crash the process.
  pool.on("error", (err) => console.error("pg pool error", err.message));
  if (process.env.VERCEL) attachDatabasePool(pool);
}
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export const closeDb = () => pool.end();
export * from "./schema";
