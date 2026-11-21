// Seed data demo ke DB pada DATABASE_URL (migrasi dijalankan dulu).
// Pakai: pnpm seed
import { closeDb } from "../src/db";
import { runStartupTasks } from "../src/server/startup";
import { seedDemo } from "../src/server/seed";

async function main() {
  await runStartupTasks();
  await seedDemo();
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
