"use server";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/action";
import * as svc from "@/server/services/students";

export type { StudentInput } from "@/server/services/students";

export async function saveStudent(input: svc.StudentInput) {
  const r = await runAction((actor) => svc.saveStudent(actor, input));
  if (r.ok) revalidatePath("/siswa");
  return r;
}

export async function softDeleteStudent(id: string) {
  const r = await runAction((actor) => svc.softDeleteStudent(actor, id));
  if (r.ok) revalidatePath("/siswa");
  return r;
}
