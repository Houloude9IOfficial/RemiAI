/**
 * Skills API client — mirrors the `lib/api/tools.ts` pattern (unwrap + typed
 * methods).
 */

export interface SkillDTO {
  id: number;
  name: string;
  description: string;
  repoId: number;
  repoSource: string;
  repoName: string;
  enabled: boolean;
  updateAvailable: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface SkillDetailDTO extends SkillDTO {
  diskPath: string;
  content: string;
  supportingFiles: string[];
}

export interface RepoSkillDTO {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  updateAvailable: boolean;
}

export interface RepoDTO {
  id: number;
  source: string;
  name: string;
  isPreloaded: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  skillCount: number;
  skills: RepoSkillDTO[];
}

export interface ResolvedRepoSkills {
  source: string;
  displayName: string;
  preloaded: boolean;
  needsConfirmation: boolean;
  skills: Array<{ name: string; description: string }>;
}

async function unwrap<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string })?.error ?? "Request failed",
    ) as Error & { needsConfirmation?: boolean };
    if ((data as { needsConfirmation?: boolean }).needsConfirmation) {
      err.needsConfirmation = true;
    }
    throw err;
  }
  return data as T;
}

export const skillsApi = {
  list: (): Promise<SkillDTO[]> =>
    fetch("/api/skills").then((res) => unwrap<SkillDTO[]>(res)),

  get: (id: number): Promise<SkillDetailDTO> =>
    fetch(`/api/skills/${id}`).then((res) => unwrap<SkillDetailDTO>(res)),

  update: (id: number, enabled: boolean): Promise<{ ok: true; enabled: boolean }> =>
    fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).then((res) => unwrap<{ ok: true; enabled: boolean }>(res)),

  remove: (id: number): Promise<{ ok: true }> =>
    fetch(`/api/skills/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true }>(res),
    ),

  listRepos: (): Promise<RepoDTO[]> =>
    fetch("/api/skills/repos").then((res) => unwrap<RepoDTO[]>(res)),

  /** Resolve a repo source and list its skills (no writes). */
  resolveRepo: (source: string): Promise<ResolvedRepoSkills> =>
    fetch("/api/skills/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }).then((res) => unwrap<ResolvedRepoSkills>(res)),

  removeRepo: (id: number): Promise<{ ok: true; removedSkills: number }> =>
    fetch(`/api/skills/repos/${id}`, { method: "DELETE" }).then((res) =>
      unwrap<{ ok: true; removedSkills: number }>(res),
    ),

  /** Check + apply updates for a repo. */
  updateRepo: (id: number): Promise<{ ok: true; updated: number }> =>
    fetch(`/api/skills/repos/${id}`, { method: "POST" }).then((res) =>
      unwrap<{ ok: true; updated: number }>(res),
    ),

  install: (
    source: string,
    opts: { skill?: string; confirmed?: boolean } = {},
  ): Promise<{ ok: true; skill: SkillDTO }> =>
    fetch("/api/skills/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, skill: opts.skill, confirmed: opts.confirmed }),
    }).then((res) => unwrap<{ ok: true; skill: SkillDTO }>(res)),
};
