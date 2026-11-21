import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** Tipe untuk db() maupun tx di dalam db().transaction(). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type Holder = { pool?: Pool; db?: DB };
// Simpan di globalThis supaya hot-reload di dev tidak membuat pool baru terus.
const g = globalThis as unknown as { __bimbelDb?: Holder };
const holder: Holder = (g.__bimbelDb ??= {});

/**
 * Koneksi dibuat LAZY saat pertama dipanggil (saat request), bukan saat modul
 * di-import. Dengan begitu `next build` tidak pernah menyentuh database.
 */
export function db(): DB {
  if (!holder.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL belum di-set");
    holder.pool = new Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
    });
    holder.db = drizzle(holder.pool, { schema });
  }
  return holder.db;
}

export async function closeDb() {
  await holder.pool?.end();
  holder.pool = undefined;
  holder.db = undefined;
}

export { schema };
