"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/master";

export async function saveSettings(input: Parameters<typeof svc.saveSettings>[1]) {
  const r = await runAction((actor) => svc.saveSettings(actor, input));
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
