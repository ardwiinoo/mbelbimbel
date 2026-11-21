import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, SESSION_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Keluar paksa: hapus sesi & cookie lalu ke /login. Dipakai saat cookie masih ada
 * tetapi sesi/akun sudah tidak valid (dihapus/nonaktif), agar tidak loop redirect.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token).catch(() => {});

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  const reason = req.nextUrl.searchParams.get("reason");
  url.search = reason === "sesi" || reason === "nonaktif" ? `?reason=${reason}` : "";
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
