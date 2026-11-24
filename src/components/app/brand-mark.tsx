"use client";
// Penanda merek: logo yang diunggah di Pengaturan, atau ikon topi wisuda bawaan bila belum ada / gagal dimuat.
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ logoId, className, iconClassName }: { logoId: string | null; className?: string; iconClassName?: string }) {
  const [broken, setBroken] = useState(false);
  if (logoId && !broken) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border bg-white p-0.5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/branding/logo?v=${logoId}`} alt="" className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-primary text-primary-foreground", className)}>
      <GraduationCap className={iconClassName} />
    </span>
  );
}
