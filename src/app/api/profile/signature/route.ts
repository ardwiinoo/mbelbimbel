import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { saveSignature } from "@/server/services/users";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) => saveSignature(actor, { file: fileOf(f, "file"), hapus: str(f, "hapus") === "1" }));
}
