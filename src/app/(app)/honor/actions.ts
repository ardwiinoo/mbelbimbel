"use server";
import { revalidatePath } from "next/cache";
import { currentActor, runAction, toUserMessage } from "@/lib/action";
import * as svc from "@/server/services/honor";

export async function saveHonorAdjustment(input: Parameters<typeof svc.saveHonorAdjustment>[1]) {
  const r = await runAction((actor) => svc.saveHonorAdjustment(actor, input));
  if (r.ok) revalidatePath("/honor");
  return r;
}

export async function setHonorPaid(input: Parameters<typeof svc.setHonorPaid>[1]) {
  const r = await runAction((actor) => svc.setHonorPaid(actor, input));
  if (r.ok) {
    revalidatePath("/honor");
    revalidatePath("/jadwal"); // sesi yang dikunci/dibuka mempengaruhi tombol edit di Jadwal
  }
  return r;
}

/** Invoice terkait sebuah honor (hanya baca) — untuk dicek sebelum menandai lunas. */
export async function loadHonorInvoices(input: { tutor_id: string; periode: string }) {
  try {
    return { ok: true as const, data: await svc.getHonorInvoices(await currentActor(), input.tutor_id, input.periode) };
  } catch (e) {
    return { ok: false as const, error: toUserMessage(e) };
  }
}

/** Riwayat pencatatan honor (tunjangan, lunas, batal lunas): siapa, kapan, apa. */
export async function loadHonorHistory(input: { tutor_id: string; periode: string }) {
  try {
    return { ok: true as const, data: await svc.getHonorHistory(await currentActor(), input.tutor_id, input.periode) };
  } catch (e) {
    return { ok: false as const, error: toUserMessage(e) };
  }
}
