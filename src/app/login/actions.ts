"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { toUserMessage } from "@/lib/action";
import { createSession, deleteSession, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { authenticate } from "@/server/services/users";

export async function signIn(_: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email.trim() || !password) return { error: "Email dan password wajib diisi" };

  try {
    const userId = await authenticate(email, password);
    const { token, expiresAt } = await createSession(userId, (await headers()).get("user-agent"));
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  } catch (e) {
    return { error: toUserMessage(e) };
  }
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token).catch(() => {});
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
