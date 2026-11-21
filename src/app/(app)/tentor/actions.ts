"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/master";

export async function saveTutor(input: Parameters<typeof svc.saveTutor>[1]) {
  const r = await runAction((actor) => svc.saveTutor(actor, input));
  if (r.ok) revalidatePath("/tentor");
  return r;
}

export async function saveProgram(input: Parameters<typeof svc.saveProgram>[1]) {
  const r = await runAction((actor) => svc.saveProgram(actor, input));
  if (r.ok) revalidatePath("/tentor");
  return r;
}
