import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` bekerja offline dari schema.ts (tidak butuh DB).
// Migrasi diterapkan otomatis saat server start (src/instrumentation.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
