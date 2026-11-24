"use client";
// Daftar kategori mapel dari DB, dibagikan ke semua komponen klien (warna Jadwal, badge, pilihan form)
// tanpa melempar props lewat banyak lapis. Diisi di layout (app).
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { findMapel, type MapelCat } from "@/lib/mapel";

const Ctx = createContext<MapelCat[]>([]);

export function MapelProvider({ list, children }: { list: MapelCat[]; children: ReactNode }) {
  return <Ctx.Provider value={list}>{children}</Ctx.Provider>;
}

export function useMapel() {
  const list = useContext(Ctx);
  return useMemo(
    () => ({
      list,
      /** Hanya yang aktif (untuk pilihan baru di form & pil filter). */
      active: list.filter((m) => m.aktif),
      /** Kategori untuk sebuah kunci; tidak dikenal → "lainnya". */
      of: (key: string | null | undefined) => findMapel(list, key),
    }),
    [list],
  );
}

/** Opsi untuk <AppSelect> dengan titik warna. Kategori nonaktif hanya muncul bila sedang dipakai (`keep`). */
export function useMapelOptions(keep: (string | null | undefined)[] = []) {
  const { list } = useMapel();
  const k = keep.join("|");
  return useMemo(
    () => list.filter((m) => m.aktif || k.split("|").includes(m.key)).map((m) => ({ value: m.key, label: m.label, dot: m.dot })),
    [list, k],
  );
}
