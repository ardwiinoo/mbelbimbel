import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { updateReport, uploadReport } from "@/server/services/reports";

export const runtime = "nodejs";

/** report_id terisi = edit laporan; kosong = upload laporan baru. */
export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) => {
    const reportId = str(f, "report_id");
    if (reportId) return updateReport(actor, { reportId, periode: str(f, "periode") || null, file: fileOf(f, "file") });
    return uploadReport(actor, {
      studentId: str(f, "student_id"),
      programId: str(f, "program_id"),
      periode: str(f, "periode") || null,
      file: fileOf(f, "file"),
    });
  });
}
