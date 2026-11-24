"use client";
// Grafik ringan tanpa library (HTML/CSS). Mengikuti spesifikasi dataviz:
// bar <= 24px, ujung data membulat 4px, celah 2px antar-segmen, teks pakai warna
// teks (bukan warna seri), legenda + angka selalu terlihat, tooltip hover/fokus,
// dan tampilan tabel sebagai alternatif aksesibel.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Slot warna kategori (urutan tetap, divalidasi). Isi teks di atas warna: putih/gelap sesuai luminans. */
// Hex langsung (bukan CSS var): Tailwind v4 membuang :root var yang hanya dipakai di style inline.
// Palet PASTEL: isi lembut + garis tepi satu tingkat lebih pekat (supaya blok tetap terbaca di latar putih)
// + teks gelap sewarna (kontras terjaga). Identitas seri tetap dibantu legenda & angka, bukan warna saja.
export const SERIES = {
  blue: { fill: "#A8C9F5", edge: "#6FA3E8", ink: "#1E3A8A" },
  orange: { fill: "#FBC7A3", edge: "#F0975F", ink: "#7C2D12" },
  aqua: { fill: "#A6E4CE", edge: "#5CC9A1", ink: "#064E3B" },
  red: { fill: "#F6B0B0", edge: "#E67C7C", ink: "#7F1D1D" },
} as const;
const edge = (k: keyof typeof SERIES) => `inset 0 0 0 1px ${SERIES[k].edge}`;
export type SeriesKey = keyof typeof SERIES;

const nf = new Intl.NumberFormat("id-ID");
const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-md group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

function TableToggle({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        {open ? "Sembunyikan tabel" : "Lihat sebagai tabel"}
      </button>
      {open && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="py-1 pr-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={cn("py-1 pr-3", j > 0 && "tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export type Part = { label: string; value: number; color: SeriesKey };

/** Satu keseluruhan dibagi beberapa bagian (<= 6). tall = angka di dalam blok bila muat. */
export function SegmentedBar({ parts, tall = true, unit = "" }: { parts: Part[]; tall?: boolean; unit?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="space-y-3">
      {total === 0 ? (
        <div className={cn("rounded-md bg-muted", tall ? "h-10" : "h-2.5")} aria-label="Belum ada data" />
      ) : (
        <div className={cn("flex w-full gap-[2px] overflow-visible", tall ? "h-10" : "h-2.5")} role="img" aria-label={shown.map((p) => `${p.label} ${p.value}`).join(", ")}>
          {shown.map((p, i) => {
            const w = (p.value / total) * 100;
            return (
              <div
                key={p.label}
                tabIndex={0}
                className={cn(
                  "group relative flex min-w-[6px] items-center justify-center text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === 0 && "rounded-l-[4px]",
                  i === shown.length - 1 && "rounded-r-[4px]",
                )}
                style={{ width: `${w}%`, background: SERIES[p.color].fill, color: SERIES[p.color].ink, boxShadow: edge(p.color) }}
              >
                {tall && w >= 12 && <span className="tabular-nums">{nf.format(p.value)}</span>}
                <Tip>
                  <b>{nf.format(p.value)}{unit}</b> {p.label} · {pct(p.value, total)}%
                </Tip>
              </div>
            );
          })}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: SERIES[p.color].fill, boxShadow: edge(p.color) }} aria-hidden />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-semibold tabular-nums">{nf.format(p.value)}</span>
            {total > 0 && <span className="text-xs text-muted-foreground">({pct(p.value, total)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kolom vertikal satu seri (mis. les hadir per minggu). Nilai di atas kolom. */
export function ColumnChart({ data, valueLabel }: { data: { label: string; value: number }[]; valueLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-3 border-b border-border px-1" role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold tabular-nums text-foreground">{d.value > 0 ? nf.format(d.value) : ""}</span>
            <div
              tabIndex={0}
              className="group relative w-full max-w-6 rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ height: d.value ? Math.max(4, Math.round((d.value / max) * 112)) : 0, background: SERIES.blue.fill, boxShadow: edge("blue") }}
            >
              <Tip>
                <b>{nf.format(d.value)}</b> {valueLabel} · {d.label}
              </Tip>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-1">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
      <TableToggle head={["Periode", valueLabel]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

/** Bar horizontal berperingkat (terbesar dulu), satu warna, nilai di ujung bar. */
export function RankedBars({ data, valueLabel }: { data: { label: string; value: number }[]; valueLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted-foreground">Belum ada data bulan ini.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground" title={d.label}>
              {d.label}
            </span>
            <div className="flex items-center gap-2">
              <div
                tabIndex={0}
                className="group relative h-3 rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: SERIES.blue.fill, boxShadow: edge("blue") }}
              >
                <Tip>
                  <b>{nf.format(d.value)}</b> {valueLabel} · {d.label}
                </Tip>
              </div>
              <span className="font-semibold tabular-nums">{nf.format(d.value)}</span>
            </div>
          </li>
        ))}
      </ul>
      <TableToggle head={["Nama", valueLabel]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}
