"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import { SESSION_COOKIE } from "@/server/session";
import * as svc from "@/server/services/users";

export async function updateProfile(input: Parameters<typeof svc.changeOwnProfile>[1]) {
  const r = await runAction((actor) => svc.changeOwnProfile(actor, input));
  if (r.ok) {
    revalidatePath("/profil");
    revalidatePath("/", "layout"); // nama di sidebar / header ikut berubah
  }
  return r;
}

export async function changeEmail(newEmail: string, currentPassword: string) {
  const r = await runAction((actor) => svc.changeOwnEmail(actor, newEmail, currentPassword));
  if (r.ok) revalidatePath("/profil");
  return r;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const keep = (await cookies()).get(SESSION_COOKIE)?.value;
  return runAction((actor) => svc.changeOwnPassword(actor, currentPassword, newPassword, keep));
}
