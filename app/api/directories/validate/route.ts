import { NextResponse } from "next/server";
import { directoryValidateSchema } from "@/lib/validation/schemas";
import { resolveDirectoryPath, DirectoryPathError } from "@/lib/fs/paths";
import { jsonError } from "@/lib/validation/api";

export async function POST(req: Request) {
  let body: ReturnType<typeof directoryValidateSchema.parse>;
  try {
    body = directoryValidateSchema.parse(await req.json());
  } catch (err) {
    return jsonError(err);
  }

  try {
    const resolvedPath = await resolveDirectoryPath(body.path);
    return NextResponse.json({ valid: true, resolvedPath });
  } catch (err) {
    if (err instanceof DirectoryPathError) {
      return NextResponse.json({ valid: false, error: err.message });
    }
    throw err;
  }
}
