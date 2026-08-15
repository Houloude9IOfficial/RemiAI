"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { skillsApi, type RepoDTO } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { InstallSecurityDialog } from "./InstallSecurityDialog";

export function SkillRepos() {
  const queryClient = useQueryClient();
  const { data: repos = [], isLoading } = useQuery({
    queryKey: ["skill-repos"],
    queryFn: skillsApi.listRepos,
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [removeRepo, setRemoveRepo] = useState<RepoDTO | null>(null);

  // Add-repo flow state.
  const [sourceInput, setSourceInput] = useState("");
  const [resolved, setResolved] = useState<{
    source: string;
    displayName: string;
    needsConfirmation: boolean;
    skills: Array<{ name: string; description: string }>;
  } | null>(null);
  const [pendingInstall, setPendingInstall] = useState<{
    source: string;
    skill?: string;
  } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["skill-repos"] });
    queryClient.invalidateQueries({ queryKey: ["skills"] });
  };

  const resolveMutation = useMutation({
    mutationFn: (source: string) => skillsApi.resolveRepo(source),
    onSuccess: (res) => {
      setResolved({
        source: res.source,
        displayName: res.displayName,
        needsConfirmation: res.needsConfirmation,
        skills: res.skills,
      });
      if (res.skills.length === 0) {
        toast.error(`No skills found in ${res.displayName}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const installMutation = useMutation({
    mutationFn: ({
      source,
      skill,
      confirmed,
    }: {
      source: string;
      skill?: string;
      confirmed?: boolean;
    }) => skillsApi.install(source, { skill, confirmed }),
    onSuccess: () => {
      toast.success("Skill installed and enabled");
      setPendingInstall(null);
      setResolved(null);
      setSourceInput("");
      invalidate();
    },
    onError: (err: Error & { needsConfirmation?: boolean }, vars) => {
      setPendingInstall(null);
      if (err.needsConfirmation) {
        // Re-open the security dialog for the same install.
        setPendingInstall({ source: vars.source, skill: vars.skill });
      } else {
        toast.error(err.message);
      }
    },
  });

  const removeRepoMutation = useMutation({
    mutationFn: (id: number) => skillsApi.removeRepo(id),
    onSuccess: (res) => {
      toast.success(
        res.removedSkills > 0
          ? `Repository and ${res.removedSkills} skill(s) removed`
          : "Repository removed",
      );
      setRemoveRepo(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleInstall = (source: string, skill?: string, needsConfirmation?: boolean) => {
    if (needsConfirmation) {
      setPendingInstall({ source, skill });
      return;
    }
    installMutation.mutate({ source, skill, confirmed: true });
  };

  const handleResolve = () => {
    const source = sourceInput.trim();
    if (!source) {
      toast.error("Enter a repository (owner/repo or a full URL)");
      return;
    }
    setResolved(null);
    resolveMutation.mutate(source);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const securityRepo = pendingInstall
    ? pendingInstall.source
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Add custom repo ── */}
      <div className="rounded-lg border bg-card p-4">
        <Label htmlFor="repo-source" className="text-[11px] text-muted-foreground">
          Add a skill repository
        </Label>
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
          Enter an <code className="rounded bg-muted/50 px-1">owner/repo</code>{" "}
          (GitHub), a full URL, or a path/URL the skills CLI accepts.
        </p>
        <div className="mt-2 flex gap-2">
          <Input
            id="repo-source"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResolve()}
            placeholder="e.g. vercel-labs/agent-skills"
            className="h-9 text-xs"
          />
          <Button
            size="sm"
            className="h-9 shrink-0"
            onClick={handleResolve}
            disabled={resolveMutation.isPending}
          >
            {resolveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            List skills
          </Button>
        </div>

        {/* Resolved skills */}
        {resolved && (
          <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{resolved.displayName}</span>
              <Badge variant="outline" className="text-[9px] uppercase">
                {resolved.needsConfirmation ? "Unverified" : "Trusted"}
              </Badge>
            </div>
            <div className="mt-2 divide-y divide-border/40">
              {resolved.skills.map((skill) => (
                <div key={skill.name} className="flex items-start gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium">{skill.name}</span>
                    <p className="line-clamp-1 text-[10px] text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 shrink-0 text-[10px]"
                    onClick={() =>
                      handleInstall(
                        resolved.source,
                        skill.name,
                        resolved.needsConfirmation,
                      )
                    }
                    disabled={installMutation.isPending}
                  >
                    Install
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Repo list ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Repositories ({repos.length})
        </h2>
        {repos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No repositories added yet.
          </p>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
            {repos.map((repo) => (
              <div key={repo.id} className="px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    <BookMarked className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{repo.name}</span>
                      {repo.isPreloaded && (
                        <Badge
                          variant="secondary"
                          className="border-emerald-500/20 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400"
                        >
                          <ShieldCheck className="mr-0.5 h-2.5 w-2.5" />
                          Preloaded
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {repo.skillCount} skill(s) installed
                      {repo.lastCheckedAt
                        ? ` · last checked ${new Date(repo.lastCheckedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setExpandedId((cur) => (cur === repo.id ? null : repo.id))
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          expandedId === repo.id && "rotate-180",
                        )}
                      />
                      Skills
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Remove repository"
                      aria-label={`Remove repository ${repo.name}`}
                      onClick={() => setRemoveRepo(repo)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === repo.id && (
                  <RepoSkillsPanel
                    repo={repo}
                    onInstall={handleInstall}
                    busy={installMutation.isPending}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Security confirmation (unknown repo install) ── */}
      <InstallSecurityDialog
        open={pendingInstall !== null}
        repoName={securityRepo ?? ""}
        busy={installMutation.isPending}
        onCancel={() => setPendingInstall(null)}
        onConfirm={() =>
          pendingInstall &&
          installMutation.mutate({
            source: pendingInstall.source,
            skill: pendingInstall.skill,
            confirmed: true,
          })
        }
      />

      {/* ── Remove repo confirmation ── */}
      <Dialog
        open={removeRepo !== null}
        onOpenChange={(open) => !open && setRemoveRepo(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove repository?</DialogTitle>
            <DialogDescription className="pt-2" render={<div />}>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {removeRepo?.name}
                </span>{" "}
                {removeRepo && removeRepo.skillCount > 0 ? (
                  <>
                    owns <span className="font-medium text-foreground">
                      {removeRepo.skillCount}
                    </span>{" "}
                    installed skill(s) — they will be removed from your
                    library and from disk.
                  </>
                ) : (
                  <>will be removed.</>
                )}{" "}
                This cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveRepo(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeRepo && removeRepoMutation.mutate(removeRepo.id)}
              disabled={removeRepoMutation.isPending}
            >
              {removeRepoMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Remove repository"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Expanded "Skills" panel for one repo — fetches the repo's UPSTREAM skill
 * list (native GitHub discovery / CLI), lets you refresh it, and installs
 * the whole repo at once (no per-skill installs). Already-installed skills
 * show an "Installed" badge.
 */
function RepoSkillsPanel({
  repo,
  onInstall,
  busy,
}: {
  repo: RepoDTO;
  onInstall: (source: string, skill?: string, needsConfirmation?: boolean) => void;
  busy?: boolean;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["skill-repo-resolve", repo.id],
    queryFn: () => skillsApi.resolveRepo(repo.source),
    staleTime: 60_000,
  });

  const installedNames = new Set(repo.skills.map((s) => s.name));
  const allInstalled =
    !!data &&
    data.skills.length > 0 &&
    data.skills.every((s) => installedNames.has(s.name));

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Available skills
        </span>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-[10px] text-muted-foreground/50">
              {data.skills.length} found · {installedNames.size} installed
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh skills"
            aria-label={`Refresh skills from ${repo.source}`}
          >
            <RefreshCw
              className={cn("h-3 w-3", isFetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading skills from {repo.source}…
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 py-2">
          <p className="text-[11px] text-muted-foreground">
            Could not load skills — check your connection and retry.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      ) : data.skills.length === 0 ? (
        <p className="py-2 text-[11px] text-muted-foreground/60">
          No skills found in this repository.
        </p>
      ) : (
        <>
          <div className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/50">
            {data.skills.map((skill) => {
              const installed = installedNames.has(skill.name);
              return (
                <div
                  key={skill.name}
                  className="flex items-start gap-2 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium">{skill.name}</span>
                      {installed && (
                        <Badge
                          variant="secondary"
                          className="border-emerald-500/20 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400"
                        >
                          Installed
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Repo-level install — the whole repository at once */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50">
              Installs all {data.skills.length} skills from this repository.
            </span>
            <Button
              variant={allInstalled ? "ghost" : "default"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => onInstall(data.source, undefined, data.needsConfirmation)}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : allInstalled ? (
                "Reinstall all"
              ) : (
                `Install all (${data.skills.length})`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
