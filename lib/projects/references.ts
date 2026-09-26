export type ProjectFileReference = {
  projectId: number;
  path: string | null;
  kind: "root" | "folder" | "file";
};

const REFERENCE_RE = /\[project-(files|folder|file):(\d+)(?::([^\]]+))?\]/g;

export function formatProjectFileReference(reference: ProjectFileReference): string {
  if (reference.kind === "root") return `[project-files:${reference.projectId}]`;
  return `[project-${reference.kind}:${reference.projectId}:${encodeURIComponent(reference.path ?? "")}]`;
}

export function parseProjectFileReferences(text: string): ProjectFileReference[] {
  const references: ProjectFileReference[] = [];
  for (const match of text.matchAll(REFERENCE_RE)) {
    const projectId = Number(match[2]);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) continue;
    const kind = match[1] === "files" ? "root" : match[1] as "folder" | "file";
    if (kind === "root") {
      if (match[3]) continue;
      references.push({ projectId, path: null, kind });
      continue;
    }
    if (!match[3]) continue;
    try {
      const path = decodeURIComponent(match[3]);
      if (path) references.push({ projectId, path, kind });
    } catch { /* Invalid encoded path is not a reference. */ }
  }
  return references;
}
