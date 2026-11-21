import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { currentActor, toUserMessage } from "@/lib/action";
import type { Actor } from "./authz";
import { MAX_UPLOAD_BYTES } from "./file-rules";

/**
 * Cek CSRF untuk route POST yang memakai cookie sesi: Origin harus sama dengan host.
 * (Cookie sesi juga SameSite=Lax, jadi POST lintas situs tidak membawa cookie.)
 */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Pembungkus route upload multipart: CSRF, batas ukuran, actor, error aman. */
export async function handleForm(
  req: NextRequest,
  fn: (actor: Actor | null, form: FormData) => Promise<string | { message: string; id?: string }>,
) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Origin tidak valid" }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "File terlalu besar" }, { status: 413 });
  }
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ ok: false, error: "Sesi berakhir, silakan login ulang" }, { status: 401 });
  try {
    const form = await req.formData();
    const r = await fn(actor, form);
    return NextResponse.json(typeof r === "string" ? { ok: true, message: r } : { ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: toUserMessage(e) }, { status: 400 });
  }
}

export const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};
export const fileOf = (f: FormData, k: string) => {
  const v = f.get(k);
  return v instanceof File ? v : null;
};
