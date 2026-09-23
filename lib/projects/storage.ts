import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_FILES_DIR } from "@/lib/paths";
import { MAX_UPLOAD_SIZE, normalizeSessionPath, type SessionFileEntry } from "@/lib/session-files/storage";

function root(projectId: number) {
  return path.join(PROJECT_FILES_DIR, String(projectId));
}

export async function projectFilePath(projectId: number, relativePath: string) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("Invalid project ID");
  const clean = normalizeSessionPath(relativePath);
  if (!clean) throw new Error("A file path is required");
  const base = path.resolve(root(projectId));
  const target = path.resolve(base, clean);
  if (!target.startsWith(base + path.sep)) throw new Error("Invalid file path");
  await fs.mkdir(PROJECT_FILES_DIR, { recursive: true });
  const baseStat = await fs.lstat(base).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (baseStat?.isSymbolicLink()) throw new Error("Symlink paths are not allowed");
  await fs.mkdir(base, { recursive: true });
  let current = path.dirname(target);
  while (current !== base) {
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error("Symlink paths are not allowed");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    current = path.dirname(current);
  }
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error("Symlink paths are not allowed");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function listProjectFiles(projectId: number): Promise<SessionFileEntry[]> {
  const base = root(projectId);
  const entries: SessionFileEntry[] = [];
  try {
    if ((await fs.lstat(base)).isSymbolicLink()) throw new Error("Symlink paths are not allowed");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  async function walk(directory: string, prefix = "") {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const absolute = path.join(directory, item.name);
      const stat = await fs.stat(absolute);
      entries.push({ path: relative, name: item.name, isDirectory: item.isDirectory(), isFile: item.isFile(), size: item.isFile() ? stat.size : 0, mtime: stat.mtime.toISOString() });
      if (item.isDirectory()) await walk(absolute, relative);
    }
  }
  try { await walk(base); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readProjectFile(projectId: number, relativePath: string) {
  return fs.readFile(await projectFilePath(projectId, relativePath));
}

export async function writeProjectFile(projectId: number, relativePath: string, content: Buffer) {
  if (content.length > MAX_UPLOAD_SIZE) throw new Error("File exceeds the 25 MB limit");
  const target = await projectFilePath(projectId, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

export async function deleteProjectFile(projectId: number, relativePath: string) {
  const target = await projectFilePath(projectId, relativePath);
  await fs.rm(target, { recursive: true, force: true });
}

export async function deleteProjectFiles(projectId: number) {
  await fs.rm(root(projectId), { recursive: true, force: true });
}

export function projectFileUrl(projectId: number, relativePath: string) {
  return `/api/projects/${projectId}/files/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}
