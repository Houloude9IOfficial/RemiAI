import { NextResponse } from "next/server";
import { ensureBootstrapCode, ensureDemoAccount, getCurrentAccount, hasAccount } from "@/lib/auth/service";
import { demoCapabilities, isDemoMode } from "@/lib/demo-policy";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isDemoMode()) ensureDemoAccount();
  else ensureBootstrapCode();
  const account = await getCurrentAccount();
  return NextResponse.json({ configured: hasAccount(), authenticated: Boolean(account), account, ...demoCapabilities() });
}
