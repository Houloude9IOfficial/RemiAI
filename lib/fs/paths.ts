import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

export class DirectoryPathError extends Error {}

export async function resolveDirectoryPath(inputPath: string): Promise<string> {
  const expanded = expandHome(inputPath.trim());
  if (!path.isAbsolute(expanded)) {
    throw new DirectoryPathError("Path must be absolute (or start with ~)");
  }

  let real: string;
  try {
    real = await fs.realpath(expanded);
  } catch {
    throw new DirectoryPathError("Path does not exist");
  }

  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new DirectoryPathError("Path is not a directory");
  }

  return real;
}
