import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { readStoredFile } from "./files";

/** Identitas bimbel untuk kop semua PDF (nota, slip honor). */
export type Branding = {
  nama_bimbel: string;
  tagline: string | null;
  alamat: string | null;
  wa_admin: string | null;
  kota: string | null;
  rekening: string | null;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
};

export async function loadBranding(): Promise<Branding> {
  const [cfg] = await db().select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const logo = await readStoredFile(cfg?.logoFileId);
  return {
    nama_bimbel: cfg?.namaBimbel ?? "Bimbel",
    tagline: cfg?.tagline ?? null,
    alamat: cfg?.alamat ?? null,
    wa_admin: cfg?.waAdmin ?? null,
    kota: cfg?.kota ?? null,
    rekening: cfg?.rekening ?? null,
    logo: logo ? { data: logo.data, format: logo.format } : null,
  };
}
