"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/invoices";

export async function issueInvoice(studentId: string, programId: string, sessionIds: string[]) {
  const r = await runAction((actor) => svc.issueInvoice(actor, studentId, programId, sessionIds));
  if (r.ok) {
    revalidatePath("/invoice");
    revalidatePath("/jadwal");
  }
  return r;
}

export async function setPaid(id: string, lunas: boolean, tglBayar?: string) {
  const r = await runAction((actor) => svc.setPaid(actor, id, lunas, tglBayar));
  if (r.ok) revalidatePath("/invoice");
  return r;
}
