"use client";
import { useEffect } from "react";
import { startInstallListener } from "@/lib/pwa-install";

// Tangkap beforeinstallprompt sedini mungkin (sebelum komponen lain dirender).
if (typeof window !== "undefined") startInstallListener();

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
