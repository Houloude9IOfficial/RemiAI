"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Fuse from "fuse.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Search,
  Brain,
  Loader2,
  X,
  Pencil,
  Plus,
  CalendarDays,
  Tag,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { memoriesApi, type Memory } from "@/lib/api/memories";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/memory-categories";
import DatePicker from "@/components/date-picker/date-picker";
import { format } from "date-fns";
import { REMI_MEMORY_EXPORT_PROMPT, type ImportedMemory } from "@/lib/memory-import";

// ---------------------------------------------------------------------------
// Category meta — label + Tailwind tint (works in light & dark)
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  MemoryCategory,
  { label: string; className: string; dot: string }
> = {
  general: {
    label: "General",
    className:
      "bg-muted text-muted-foreground border-border",
    dot: "bg-zinc-400",
  },
  work: {
    label: "Work",
    className:
      "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  personal: {
    label: "Personal",
    className:
      "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  health: {
    label: "Health",
    className:
      "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  finance: {
    label: "Finance",
    className:
      "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  learning: {
    label: "Learning",
    className:
      "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  social: {
    label: "Social",
    className:
      "bg-pink-500/10 text-pink-700 border-pink-500/20 dark:text-pink-300",
    dot: "bg-pink-500",
  },
  projects: {
    label: "Projects",
    className:
      "bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  other: {
    label: "Other",
    className:
      "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-300",
    dot: "bg-zinc-500",
  },
};

function CategoryBadge({ category }: { category: string }) {
  const meta =
    CATEGORY_META[category as MemoryCategory] ?? CATEGORY_META.general;
  return (
    <Badge
      variant="outline"
      className={`gap-1 rounded-full px-2 py-0 text-[11px] font-medium ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </Badge>
  );
}

function categoryLabel(category: MemoryCategory | "all"): string {
  return category === "all" ? "All" : CATEGORY_META[category].label;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMemoryDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// MemoryList
// ---------------------------------------------------------------------------

export function MemoryList() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">(
    "all",
  );
  const [dateFilter, setDateFilter] = useState("");

  // Edit / create dialog state
  const [editing, setEditing] = useState<Memory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState<MemoryCategory>("general");
  const [formDate, setFormDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [imported, setImported] = useState<ImportedMemory[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importCopied, setImportCopied] = useState(false);

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memories"],
    queryFn: () => memoriesApi.list(),
  });

  // Counts per category (for chips + select)
  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of MEMORY_CATEGORIES) map[c] = 0;
    for (const m of memories) {
      const cat = (m.category ?? "general") as string;
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [memories]);

  // Step 1: category + date pre-filter (server could do this, but client is instant)
  const preFiltered = useMemo(() => {
    let out = memories;
    if (categoryFilter !== "all") {
      out = out.filter(
        (m) => (m.category ?? "general") === categoryFilter,
      );
    }
    if (dateFilter) {
      out = out.filter((m) => m.memoryDate === dateFilter);
    }
    return out;
  }, [memories, categoryFilter, dateFilter]);

  // Step 2: fuzzy search on top (content + category label)
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return preFiltered;
    const fuse = new Fuse(preFiltered, {
      keys: ["content", "category"],
      threshold: 0.4,
      includeScore: true,
    });
    return fuse.search(searchQuery).map((r) => r.item);
  }, [preFiltered, searchQuery]);

  const sorted = useMemo(() => {
    return [...filteredMemories].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [filteredMemories]);

  const hasActiveFilter =
    !!searchQuery || categoryFilter !== "all" || !!dateFilter;

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setDateFilter("");
  };

  // ── Mutations ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: memoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof memoriesApi.update>[1] }) =>
      memoriesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory updated");
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: memoriesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory saved");
      setCreateOpen(false);
      setFormContent("");
      setFormCategory("general");
      setFormDate("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (m: Memory) => {
    setEditing(m);
    setFormContent(m.content);
    setFormCategory((m.category as MemoryCategory) ?? "general");
    setFormDate(m.memoryDate ?? "");
  };

  const openCreate = () => {
    setFormContent("");
    setFormCategory("general");
    setFormDate("");
    setCreateOpen(true);
  };

  const handleUpdate = () => {
    if (!editing) return;
    const trimmed = formContent.trim();
    if (!trimmed) {
      toast.error("Content cannot be empty");
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      payload: {
        content: trimmed,
        category: formCategory,
        memoryDate: formDate ? formDate : null,
      },
    });
  };

  const handleCreate = () => {
    const trimmed = formContent.trim();
    if (!trimmed) {
      toast.error("Content cannot be empty");
      return;
    }
    createMutation.mutate({
      content: trimmed,
      category: formCategory,
      memoryDate: formDate ? formDate : null,
    });
  };

  const extractImport = async () => {
    if (!importText.trim()) return;
    setImportBusy(true);
    try {
      const res = await fetch("/api/memories/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: importText }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImported(data.memories ?? []);
      if (!(data.memories ?? []).length) toast.error("No durable memories were found");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Import failed"); }
    finally { setImportBusy(false); }
  };

  const saveImported = async () => {
    setImportBusy(true);
    const existing = memories.map((m) => `${m.category}|${m.memoryDate ?? ""}|${m.content.toLowerCase()}`);
    const candidates = imported.filter((m) => !existing.includes(`${m.category}|${m.memoryDate ?? ""}|${m.content.toLowerCase()}`));
    const results = await Promise.allSettled(candidates.map((m) => memoriesApi.create(m)));
    const failed = results.filter((r) => r.status === "rejected").length;
    const saved = results.length - failed;
    queryClient.invalidateQueries({ queryKey: ["memories"] });
    setImported([]); setImportText(""); setImportOpen(false); setImportBusy(false);
    toast.success(`Imported ${saved} memor${saved === 1 ? "y" : "ies"}${failed ? `; ${failed} failed` : ""}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Bring your context to Remi</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ask another AI to export durable context in Remi’s memory format, then review it before saving. Remi retrieves relevant memories when needed and keeps the full store searchable.</p>
          </div>
          <Button variant="outline" className="shrink-0 gap-1.5" onClick={() => setImportOpen(true)}>Start</Button>
        </div>
      </div>
      {/* ── Toolbar: search + category + date + add ───────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-2"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Select
              value={categoryFilter}
              onValueChange={(v) =>
                setCategoryFilter(v as MemoryCategory | "all")
              }
            >
              <SelectTrigger className="w-[148px] shrink-0">
                <Tag className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Category">
                  {categoryLabel(categoryFilter)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All categories ({memories.length})
                </SelectItem>
                {MEMORY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${CATEGORY_META[c].dot}`}
                      />
                      {CATEGORY_META[c].label} ({countsByCategory[c] ?? 0})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="hidden sm:block">
              <DatePicker
                value={dateFilter || undefined}
                onChange={(date) =>
                  setDateFilter(date ? format(date, "yyyy-MM-dd") : "")
                }
                placeholder="Event date"
                className="w-[164px] h-8 w-50"
              />
            </div>

            <Button onClick={openCreate} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
        </div>

        {/* Mobile date filter (visible only on small screens) */}
        <div className="flex gap-2 sm:hidden">
          <div className="flex-1">
            <DatePicker
              value={dateFilter || undefined}
              onChange={(date) =>
                setDateFilter(date ? format(date, "yyyy-MM-dd") : "")
              }
              placeholder="Event date"
              className="w-full h-8"
            />
          </div>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {/* Second row: chips + clear (desktop) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {MEMORY_CATEGORIES.filter((c) => (countsByCategory[c] ?? 0) > 0).map(
            (c) => {
              const active = categoryFilter === c;
              const meta = CATEGORY_META[c];
              return (
                <button
                  key={c}
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === c ? "all" : c))
                  }
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : `bg-card hover:bg-accent ${meta.className}`
                  }`}
                  title={`${meta.label}: ${countsByCategory[c]}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : meta.dot}`}
                  />
                  {meta.label}
                  <span className="opacity-60">{countsByCategory[c]}</span>
                </button>
              );
            },
          )}
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={clearFilters}
            >
              Clear filters
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            {filteredMemories.length} of {memories.length} memories
            {dateFilter ? ` · date ${dateFilter}` : ""}
          </span>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Brain className="h-8 w-8 text-muted-foreground/40" />
          {hasActiveFilter ? (
            <>
              <p className="text-sm text-muted-foreground">
                No memories match your filters.
              </p>
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No memories yet.</p>
              <p className="text-xs text-muted-foreground/60 max-w-sm">
                The AI will automatically save memories during conversations
                when it learns something worth remembering about you — now with
                a category and an optional event date.
              </p>
              <Button size="sm" className="mt-2 gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add your first memory
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center text-xs text-muted-foreground">
                  #
                </TableHead>
                <TableHead>Memory</TableHead>
                <TableHead className="hidden w-[128px] sm:table-cell">
                  Category
                </TableHead>
                <TableHead className="hidden w-[162px] sm:table-cell">
                  Date
                </TableHead>
                <TableHead className="w-[72px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((memory, idx) => {
                const cat = (memory.category ?? "general") as MemoryCategory;
                return (
                  <TableRow key={memory.id} className="group">
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {sorted.length - idx}
                    </TableCell>
                    <TableCell className="max-w-[260px] sm:max-w-[420px]">
                      <div
                        className="cursor-pointer"
                        onClick={() => openEdit(memory)}
                        title="Click to edit"
                      >
                        <p className="text-sm leading-snug line-clamp-2 sm:line-clamp-none sm:truncate hover:underline">
                          {memory.content}
                        </p>
                        {/* Mobile: inline category + date under content */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                          <CategoryBadge category={cat} />
                          {memory.memoryDate && (
                            <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />
                              {formatMemoryDate(memory.memoryDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <CategoryBadge category={cat} />
                    </TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">
                      <div className="flex flex-col leading-tight">
                        {memory.memoryDate ? (
                          <>
                            <span className="inline-flex items-center gap-1 font-medium">
                              <CalendarDays className="h-3 w-3 text-muted-foreground" />
                              {formatMemoryDate(memory.memoryDate)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              saved {formatShortDate(memory.createdAt)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              {formatShortDate(memory.createdAt)}
                            </span>
                            <span className="text-[11px] text-muted-foreground/60">
                              no event date
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                          onClick={() => openEdit(memory)}
                          aria-label="Edit memory"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                          onClick={() => deleteMutation.mutate(memory.id)}
                          aria-label="Delete memory"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:hidden">
            {sorted.length} of {memories.length} memories
            {hasActiveFilter ? " (filtered)" : ""}
          </div>
        </div>
      )}

      {/* ── Edit dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit memory</DialogTitle>
            <DialogDescription>
              Update the text, category, or event date. Saved date stays as
              the original creation time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="What should the AI remember?"
              />
              <span className="text-[11px] text-muted-foreground text-right">
                {formContent.length}/500
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={formCategory}
                  onValueChange={(v) => setFormCategory(v as MemoryCategory)}
                >
                  <SelectTrigger>
                    <SelectValue>{categoryLabel(formCategory)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MEMORY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${CATEGORY_META[c].dot}`}
                          />
                          {CATEGORY_META[c].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-date">
                  Event date{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <DatePicker
                  value={formDate || undefined}
                  onChange={(date) =>
                    setFormDate(date ? format(date, "yyyy-MM-dd") : "")
                  }
                  placeholder="Pick a date"
                  className="w-full"
                />
                <span className="text-[11px] text-muted-foreground">
                  When this became true. Leave empty if unknown.
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formContent.trim()}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-x-hidden sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Import memories to Remi</DialogTitle>
            <DialogDescription>
              Copy the Remi guide into another AI, then paste its formatted response below. Review the memories before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden py-2">
            <div className="flex items-center justify-between border-b pb-4">
              <p className="text-sm text-muted-foreground">Use the guide with another AI, then bring the formatted memories back here.</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(REMI_MEMORY_EXPORT_PROMPT); setImportCopied(true); setTimeout(() => setImportCopied(false), 1500); }}><Copy className="h-3.5 w-3.5" /> {importCopied ? "Copied" : "Copy guide"}</Button>
            </div>
            {!imported.length ? <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="memory-import-text">Paste the export</Label>
                <Textarea id="memory-import-text" value={importText} onChange={(e) => setImportText(e.target.value)} rows={14} className="h-[320px] max-h-[45vh] resize-none overflow-y-auto" placeholder="Paste the formatted memories here..." />
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={extractImport} disabled={importBusy || !importText.trim()}>{importBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Extract memories</Button></DialogFooter>
            </> : <>
              <p className="text-sm text-muted-foreground">Review {imported.length} extracted memories. Entries matching an existing memory are marked as duplicates and will be skipped.</p>
              <div className="flex min-w-0 flex-col gap-3">
                {imported.map((memory, index) => {
                  const duplicate = memories.some((m) => m.content.toLowerCase() === memory.content.toLowerCase() && m.category === memory.category && (m.memoryDate ?? null) === memory.memoryDate);
                  return <div key={`${index}-${memory.content}`} className={`min-w-0 overflow-hidden rounded-md border p-3 ${duplicate ? "opacity-60" : ""}`}>
                    <div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">{duplicate ? "Duplicate — will be skipped" : `Memory ${index + 1}`}</span><Button variant="ghost" size="sm" onClick={() => setImported((items) => items.filter((_, i) => i !== index))}>Remove</Button></div>
                    <Textarea value={memory.content} maxLength={500} onChange={(e) => setImported((items) => items.map((item, i) => i === index ? { ...item, content: e.target.value } : item))} rows={2} />
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><Select value={memory.category} onValueChange={(value) => setImported((items) => items.map((item, i) => i === index ? { ...item, category: value as MemoryCategory } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MEMORY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_META[c].label}</SelectItem>)}</SelectContent></Select><Input value={memory.memoryDate ?? ""} placeholder="Event date (YYYY-MM-DD)" onChange={(e) => setImported((items) => items.map((item, i) => i === index ? { ...item, memoryDate: e.target.value || null } : item))} /></div>
                  </div>;
                })}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setImported([])}>Back</Button><Button onClick={saveImported} disabled={importBusy || !imported.length}>{importBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save memories</Button></DialogFooter>
            </>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create dialog ──────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add memory</DialogTitle>
            <DialogDescription>
              Save something the AI should remember about you — with a
              category and an optional event date.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-content">Content</Label>
              <Textarea
                id="create-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. I run 5k every morning and prefer concise answers."
                autoFocus
              />
              <span className="text-[11px] text-muted-foreground text-right">
                {formContent.length}/500
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select
                  value={formCategory}
                  onValueChange={(v) => setFormCategory(v as MemoryCategory)}
                >
                  <SelectTrigger>
                    <SelectValue>{categoryLabel(formCategory)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MEMORY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${CATEGORY_META[c].dot}`}
                          />
                          {CATEGORY_META[c].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-date">
                  Event date{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <DatePicker
                  value={formDate || undefined}
                  onChange={(date) =>
                    setFormDate(date ? format(date, "yyyy-MM-dd") : "")
                  }
                  placeholder="Pick a date"
                  className="w-full"
                />
                <span className="text-[11px] text-muted-foreground">
                  When this became true.
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formContent.trim()}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Save memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
