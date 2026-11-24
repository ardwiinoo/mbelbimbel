"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/master";
import * as mapelSvc from "@/server/services/mapel";

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

export async function saveMapelCategory(input: Parameters<typeof mapelSvc.saveMapel>[1]) {
  const r = await runAction((actor) => mapelSvc.saveMapel(actor, input));
  if (r.ok) {
    revalidatePath("/tentor");
    revalidatePath("/", "layout"); // warna & pilihan kategori dipakai di semua halaman
  }
  return r;
}

export async function deleteMapelCategory(key: string) {
  const r = await runAction((actor) => mapelSvc.deleteMapel(actor, key));
  if (r.ok) {
    revalidatePath("/tentor");
    revalidatePath("/", "layout");
  }
  return r;
}
