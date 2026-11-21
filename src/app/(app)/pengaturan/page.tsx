import { requireAdmin, getSettings } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Pengaturan" };

export default async function PengaturanPage() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Pengaturan" desc="Identitas bimbel, info pembayaran di nota, kontak admin, dan aturan absen." />
      <SettingsForm s={settings!} />
    </>
  );
}
