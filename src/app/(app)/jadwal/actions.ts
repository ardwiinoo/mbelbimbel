"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/sessions";

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

export async function setAttendanceStatus(id: string, status: "terjadwal" | "hadir" | "tidak_hadir" | "batal", alasan: string) {
  const r = await runAction((actor) => svc.setAttendanceStatus(actor, id, status, alasan));
  if (r.ok) revalidatePath("/jadwal");
  return r;
}
