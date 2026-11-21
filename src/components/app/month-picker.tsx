"use client";
import { AppSelect } from "./app-select";
import { useQueryNav } from "./table-kit";
import { namaBulan } from "@/lib/format";

/** Pilih bulan (12 bulan terakhir) → ?bulan=YYYY-MM */
export function MonthPicker({ value, current }: { value: string; current: string }) {
  const { set } = useQueryNav();
  const [y, m] = current.split("-").map(Number);
  const options = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const v = d.toISOString().slice(0, 7);
    return { value: v, label: i === 0 ? `${namaBulan(v)} (bulan ini)` : namaBulan(v) };
  });
  return (
    <AppSelect
      className="w-auto min-w-52"
      aria-label="Bulan"
      value={value}
      onChange={(v) => set({ bulan: v === current ? null : v })}
      options={options}
    />
  );
}
