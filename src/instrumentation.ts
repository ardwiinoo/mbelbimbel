// Dijalankan SEKALI saat server Next.js start (bukan saat `next build`),
// sebelum server melayani request. Tugas: migrasi DB + data awal.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Pengaman ekstra: jangan pernah menyentuh DB saat build.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.RUN_MIGRATIONS === "false") return;

  const { runStartupTasks } = await import("./server/startup");
  await runStartupTasks();
}
