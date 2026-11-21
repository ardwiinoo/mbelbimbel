"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/materials";

export async function softDeleteMaterial(id: string) {
  const r = await runAction((actor) => svc.softDeleteMaterial(actor, id));
  if (r.ok) revalidatePath("/materi");
  return r;
}
