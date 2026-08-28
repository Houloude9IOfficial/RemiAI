import { NextResponse } from "next/server";
import { refreshProviderModels } from "@/lib/providers/refresh";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const providerId = Number(id);

  try {
    const result = await refreshProviderModels(providerId, {
      fallbackToCatalog: true,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Provider not found" ? 404 : 500 },
    );
  }
}