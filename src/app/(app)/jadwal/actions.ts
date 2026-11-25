"use server";
import { revalidatePath } from "next/cache";
import { currentActor, runAction, toUserMessage } from "@/lib/action";
import * as svc from "@/server/services/sessions";
import { undoWaiveSession as undoWaiveSvc } from "@/server/services/invoices";

/** Super Admin: batalkan pembebasan tagihan sebuah sesi. */
export async function undoWaiveSession(id: string) {
  const r = await runAction((actor) => undoWaiveSvc(actor, id));
  if (r.ok) {
    revalidatePath("/jadwal");
    revalidatePath("/invoice");
    revalidatePath("/");
  }
  return r;
}

export async function createSessions(input: Parameters<typeof svc.createSessions>[1]) {
  const r = await runAction((actor) => svc.createSessions(actor, input));
  if (r.ok) revalidatePath("/jadwal");
  return r;
}

export async function updateSession(input: Parameters<typeof svc.updateSession>[1]) {
  const r = await runAction((actor) => svc.updateSession(actor, input));
  if (r.ok) revalidatePath("/jadwal");
  return r;
}

/** Cek bentrok untuk peringatan di dialog (hanya baca; tidak menyimpan apa pun). */
export async function checkSessionConflicts(input: Parameters<typeof svc.findConflicts>[1]) {
  try {
    return { ok: true as const, conflicts: await svc.findConflicts(await currentActor(), input) };
  } catch (e) {
    return { ok: false as const, error: toUserMessage(e) };
  }
}

export async function setAttendanceStatus(id: string, status: "terjadwal" | "hadir" | "tidak_hadir" | "batal", alasan: string) {
  const r = await runAction((actor) => svc.setAttendanceStatus(actor, id, status, alasan));
  if (r.ok) revalidatePath("/jadwal");
  return r;
}
