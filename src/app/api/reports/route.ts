import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { uploadReport } from "@/server/services/reports";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) =>
    uploadReport(actor, {
      studentId: str(f, "student_id"),
      programId: str(f, "program_id"),
      periode: str(f, "periode") || null,
      file: fileOf(f, "file"),
    }),
  );
}
