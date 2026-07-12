import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: err.issues },
      { status: 400 },
    );
  }
  throw err;
}
