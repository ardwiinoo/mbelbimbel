import type { NextRequest } from "next/server";
import { fileOf, handleForm, str } from "@/server/http";
import { addAssessment } from "@/server/services/students";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleForm(req, (actor, f) => addAssessment(actor, str(f, "student_id"), fileOf(f, "file")));
}
