import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { saveMaterial } from "@/server/services/materials";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) =>
    saveMaterial(actor, {
      id: str(f, "id") || undefined,
      judul: str(f, "judul"),
      kategori: str(f, "kategori"),
      jenjang: str(f, "jenjang"),
      file: fileOf(f, "file"),
    }),
  );
}
