import { readFile } from "node:fs/promises";
import path from "node:path";
import LicenseView from "@/components/settings/LicenseView";
import { appInfo } from "@/lib/app-info";

export const dynamic = "force-dynamic";

export default async function LicenseSettingsPage() {
  const [licenseText] = await Promise.all([loadLicenseText()]);
  return <LicenseView licenseText={licenseText} appInfo={appInfo} />;
}

async function loadLicenseText(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), "LICENSE"), "utf8");
  } catch (error) {
    console.error("[settings/license] Failed to read LICENSE file:", error);
    return "";
  }
}
