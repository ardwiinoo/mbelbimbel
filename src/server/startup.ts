import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";
import { bootstrapSuperAdmin, ensureSettings, seedDemo } from "./seed";

const log = (m: string) => console.log(`[startup] ${m}`);

/**
 * Migrasi Drizzle (folder ./drizzle ikut di image standalone), lalu data awal.
 * Gagal di sini = container berhenti & di-restart Docker (lebih baik daripada
 * melayani request dengan skema DB yang salah).
 */
export async function runStartupTasks() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  log("menjalankan migrasi database...");
  await migrate(db(), { migrationsFolder });
  await ensureSettings();
  await bootstrapSuperAdmin(log);
  if (process.env.SEED_DEMO === "true") await seedDemo(log);
  log("siap");
}
