"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/materials";

export async function deleteMaterial(id: string) {
  const r = await runAction((actor) => svc.deleteMaterial(actor, id));
  if (r.ok) revalidatePath("/materi");
  return r;
}
