"use server";
import { revalidatePath } from "next/cache";
import { currentActor, runAction, toUserMessage } from "@/lib/action";
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

/** Riwayat pencatatan satu invoice (terbit, lunas, batal lunas): siapa, kapan, apa. */
export async function loadInvoiceHistory(id: string) {
  try {
    return { ok: true as const, data: await svc.invoiceHistory(await currentActor(), id) };
  } catch (e) {
    return { ok: false as const, error: toUserMessage(e) };
  }
}
