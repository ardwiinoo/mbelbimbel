"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/** Ikon dalam lingkaran pastel supaya jenis notifikasi terbaca sekilas (tidak hanya lewat warna latar). */
const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`flex size-6 items-center justify-center rounded-full ${className}`}>{children}</span>
)

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <Badge className="bg-green-200/80 text-green-700"><CircleCheckIcon className="size-4" /></Badge>
        ),
        info: (
          <Badge className="bg-blue-200/80 text-blue-700"><InfoIcon className="size-4" /></Badge>
        ),
        warning: (
          <Badge className="bg-amber-200/80 text-amber-700"><TriangleAlertIcon className="size-4" /></Badge>
        ),
        error: (
          <Badge className="bg-red-200/80 text-red-700"><OctagonXIcon className="size-4" /></Badge>
        ),
        loading: (
          <Badge className="bg-slate-200/80 text-slate-600"><Loader2Icon className="size-4 animate-spin" /></Badge>
        ),
      }}
      // Dipakai bersama richColors: sonner membaca variabel --success-*, --error-*, --info-*, --warning-*.
      // Palet pastel: latar lembut, tepi satu tingkat lebih pekat, teks gelap sewarna (kontras terjaga).
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "#E8F8EE",
          "--success-border": "#A7E3BE",
          "--success-text": "#14532D",
          "--error-bg": "#FDECEC",
          "--error-border": "#F5B5B5",
          "--error-text": "#7F1D1D",
          "--info-bg": "#E6F0FD",
          "--info-border": "#A9C8F5",
          "--info-text": "#1E3A8A",
          "--warning-bg": "#FEF6D8",
          "--warning-border": "#F2D56B",
          "--warning-text": "#713F12",
          "--border-radius": "0.9rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !gap-3 !px-4 !py-3.5 !text-sm !font-medium !shadow-[0_12px_32px_-14px_rgba(30,58,138,0.4)]",
          icon: "!mr-0 !size-6",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
