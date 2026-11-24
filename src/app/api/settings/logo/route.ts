import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { saveLogo } from "@/server/services/master";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) => saveLogo(actor, { file: fileOf(f, "file"), hapus: str(f, "hapus") === "1" }));
}
