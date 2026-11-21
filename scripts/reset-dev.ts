// HANYA development: hapus semua tabel + file upload lokal, lalu migrasi & seed ulang.
// Pakai: pnpm db:reset
import { rm } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { runStartupTasks } from "../src/server/startup";
import { seedDemo } from "../src/server/seed";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error("db:reset hanya boleh untuk database lokal (127.0.0.1/localhost)");
  }
  await db().execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  const uploads = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  if (uploads.startsWith(path.resolve("."))) await rm(uploads, { recursive: true, force: true });
  await runStartupTasks();
  await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
