import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { submitAttendance } from "@/server/services/sessions";

export const runtime = "nodejs";

/** Absen foto tentor: foto + GPS dalam satu request, dicek & disimpan atomik di server. */
export async function POST(req: NextRequest) {
  return handleForm(req, async (actor, f) => {
    await submitAttendance(actor, {
      sessionId: str(f, "session_id"),
      lat: Number.parseFloat(str(f, "lat")),
      lng: Number.parseFloat(str(f, "lng")),
      akurasi: Number.parseFloat(str(f, "akurasi")),
      photo: fileOf(f, "photo"),
    });
    return "Absen berhasil! Status: Hadir";
  });
}
