"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/students";

export async function restoreStudent(id: string) {
  const r = await runAction((actor) => svc.restoreStudent(actor, id));
  if (r.ok) {
    revalidatePath("/terhapus");
    revalidatePath("/siswa");
    revalidatePath("/jadwal");
    revalidatePath("/invoice");
    revalidatePath("/");
  }
  return r;
}
