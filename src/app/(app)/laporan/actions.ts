"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/reports";

export async function deleteReport(id: string) {
  const r = await runAction((actor) => svc.deleteReport(actor, id));
  if (r.ok) revalidatePath("/laporan");
  return r;
}
