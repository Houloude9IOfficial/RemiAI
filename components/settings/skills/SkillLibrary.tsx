"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Markdown from "markdown-to-jsx";
import { Loader2, RefreshCw, Sparkles, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { skillsApi, type SkillDTO } from "@/lib/api/skills";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SkillsTab } from "./SkillsSettings";

export function SkillLibrary({
  onNavigate,
}: {
  onNavigate: (tab: SkillsTab) => void;
}) {
  const queryClient = useQueryClient();
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: skillsApi.list,
  });

  const [viewSkill, setViewSkill] = useState<SkillDTO | null>(null);
  const [removeSkill, setRemoveSkill] = useState<SkillDTO | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["skills"] });
    queryClient.invalidateQueries({ queryKey: ["skill-repos"] });
  };

  // Optimistic toggle — flips the switch instantly, syncs in the background,
  // rolls back on failure. Makes rapid toggling of many skills feel fast.
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      skillsApi.update(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["skills"] });
      const prev = queryClient.getQueryData<SkillDTO[]>(["skills"]);
      queryClient.setQueryData<SkillDTO[]>(["skills"], (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, enabled } : s)),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["skills"], ctx.prev);
      toast.error(err.message);
    },
    onSettled: invalidate,
  });

  // Bulk enable/disable all — optimistic, fires all PATCHes in parallel.
  const bulkToggleMutation = useMutation({
    mutationFn: ({
      ids,
      enabled,
    }: {
      ids: number[];
      enabled: boolean;
    }) => Promise.all(ids.map((id) => skillsApi.update(id, enabled))),
    onMutate: async ({ ids, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["skills"] });
      const prev = queryClient.getQueryData<SkillDTO[]>(["skills"]);
      const idSet = new Set(ids);
      queryClient.setQueryData<SkillDTO[]>(["skills"], (old) =>
        (old ?? []).map((s) => (idSet.has(s.id) ? { ...s, enabled } : s)),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["skills"], ctx.prev);
      toast.error(err.message);
    },
    onSettled: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => skillsApi.remove(id),
    onSuccess: () => {
      toast.success("Skill removed");
      setRemoveSkill(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (repoId: number) => skillsApi.updateRepo(repoId),
    onSuccess: (res) => {
      toast.success(
        res.updated > 0
          ? `${res.updated} skill(s) updated`
          : "Skills are up to date",
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeCount = skills.filter((s) => s.enabled).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {activeCount} of {skills.length} skills active
        </span>
        {skills.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() =>
                bulkToggleMutation.mutate({
                  ids: skills.map((s) => s.id),
                  enabled: true,
                })
              }
              disabled={bulkToggleMutation.isPending || activeCount === skills.length}
            >
              Enable all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() =>
                bulkToggleMutation.mutate({
                  ids: skills.map((s) => s.id),
                  enabled: false,
                })
              }
              disabled={bulkToggleMutation.isPending || activeCount === 0}
            >
              Disable all
            </Button>
          </div>
        )}
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No skills installed yet. Browse the repositories tab to install
            skills.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate("repositories")}>
              Browse repositories
            </Button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-card">
          {skills.map((skill) => (
            <div key={skill.id} className="px-3.5 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {skill.repoSource}
                    </Badge>
                    {skill.enabled && (
                      <Badge
                        variant="secondary"
                        className="border-emerald-500/20 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    )}
                    {skill.updateAvailable && (
                      <Badge
                        variant="secondary"
                        className="border-amber-500/20 bg-amber-500/10 text-[9px] text-amber-600 dark:text-amber-400"
                      >
                        Update available
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {skill.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    title="View instructions"
                    aria-label={`View ${skill.name} instructions`}
                    onClick={() => setViewSkill(skill)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {skill.updateAvailable && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      title="Update skill"
                      aria-label={`Update ${skill.name}`}
                      onClick={() => updateMutation.mutate(skill.repoId)}
                      disabled={updateMutation.isPending}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${
                          updateMutation.isPending ? "animate-spin" : ""
                        }`}
                      />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Remove skill"
                    aria-label={`Remove ${skill.name}`}
                    onClick={() => setRemoveSkill(skill)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={(v) =>
                      toggleMutation.mutate({ id: skill.id, enabled: v })
                    }
                    disabled={toggleMutation.isPending}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── View skill (read-only SKILL.md) ── */}
      <ViewSkillDialog skillId={viewSkill?.id ?? null} onClose={() => setViewSkill(null)} />

      {/* ── Remove skill confirmation ── */}
      <Dialog
        open={removeSkill !== null}
        onOpenChange={(open) => !open && setRemoveSkill(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove skill?</DialogTitle>
            <DialogDescription className="pt-2" render={<div />}>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {removeSkill?.name}
                </span>{" "}
                will be disabled and removed from your library. The repository
                stays — you can reinstall it anytime.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveSkill(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeSkill && removeMutation.mutate(removeSkill.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewSkillDialog({
  skillId,
  onClose,
}: {
  skillId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["skill-detail", skillId],
    queryFn: () => skillsApi.get(skillId!),
    enabled: skillId !== null,
  });

  return (
    <Dialog open={skillId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {data ? (
              <>
                {data.name}
                <span className="text-xs font-normal text-muted-foreground">
                  @{data.repoSource}
                </span>
              </>
            ) : (
              "Skill"
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : isError || !data ? (
            <p className="text-xs text-muted-foreground">
              Could not load the skill instructions.
            </p>
          ) : (
            <>
              <div className="prose-xs max-w-none">
                <Markdown
                  options={{
                    overrides: {
                      a: {
                        props: {
                          target: "_blank",
                          rel: "noopener noreferrer",
                          className: "text-primary underline underline-offset-3",
                        },
                      },
                      code: {
                        props: {
                          className:
                            "rounded bg-muted/60 px-1 py-0.5 text-[11px] font-mono",
                        },
                      },
                      pre: {
                        props: {
                          className:
                            "overflow-x-auto rounded-md bg-muted/70 p-3 text-[11px] font-mono",
                        },
                      },
                    },
                  }}
                >
                  {data.content || "_No content._"}
                </Markdown>
              </div>
              {data.supportingFiles.length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-3">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    Supporting files
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {data.supportingFiles.map((f) => (
                      <code
                        key={f}
                        className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
