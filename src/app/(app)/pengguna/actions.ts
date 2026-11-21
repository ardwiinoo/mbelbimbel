"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/users";

export async function createUser(input: Parameters<typeof svc.createUser>[1]) {
  const r = await runAction((actor) => svc.createUser(actor, input));
  if (r.ok) {
    revalidatePath("/pengguna");
    revalidatePath("/tentor");
  }
  return r;
}

export async function updateUser(input: Parameters<typeof svc.updateUser>[1]) {
  const r = await runAction((actor) => svc.updateUser(actor, input));
  if (r.ok) {
    revalidatePath("/pengguna");
    revalidatePath("/tentor");
  }
  return r;
}

export async function resetPassword(id: string, password: string) {
  return runAction((actor) => svc.resetPassword(actor, id, password));
}
