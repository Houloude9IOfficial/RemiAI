import { NextResponse } from "next/server";
import { ensureBootstrapCode, getCurrentAccount, hasAccount } from "@/lib/auth/service";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureBootstrapCode();
  const account = await getCurrentAccount();
  return NextResponse.json({ configured: hasAccount(), authenticated: Boolean(account), account });
}
