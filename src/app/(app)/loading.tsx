"use client";
// Skeleton instan saat pindah halaman (Suspense otomatis dari Next.js).
// Bentuknya dipilih sesuai halaman tujuan supaya transisi tidak "loncat".
import { usePathname } from "next/navigation";
import { DashboardSkeleton, FormSkeleton, ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  const path = usePathname();
  if (path === "/") return <DashboardSkeleton />;
  if (path.startsWith("/profil") || path.startsWith("/pengaturan")) return <FormSkeleton />;
  return <ListSkeleton />;
}
