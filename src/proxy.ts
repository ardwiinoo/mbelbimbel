import { NextResponse, type NextRequest } from "next/server";

// Harus sama dengan SESSION_COOKIE di src/server/session.ts (proxy tidak boleh
// mengimpor modul DB). Proxy HANYA mengecek keberadaan cookie untuk redirect
// cepat ke /login; validasi sesi yang sebenarnya dilakukan di server (getProfile).
const SESSION_COOKIE = "bimbel_sid";
const PUBLIC_PATHS = ["/login", "/offline", "/auth/"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // /api/* dikecualikan: route handler mengecek sesi sendiri, dan agar body upload
  // tidak di-buffer proxy (batas proxyClientMaxBodySize 10 MB).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
