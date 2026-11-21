// Jalankan migrasi + data awal secara manual (biasanya otomatis saat server start).
import { closeDb } from "../src/db";
import { runStartupTasks } from "../src/server/startup";

runStartupTasks()
  .catch((e) => {
    console.error("Migrasi gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
