"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check, FilePlus2, FileText, FolderOpen, GripVertical, LoaderCircle,
  MessageSquare, Pin, Plus, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { projectsApi, type Project } from "@/lib/api/projects";
import { conversationsApi } from "@/lib/api/conversations";
import { sessionFilesApi } from "@/lib/api/session-files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProjectDraft = Pick<Project, "name" | "brief" | "instructions" | "notes"> & { projectId: number };

function SortableProject({ project, selected, onSelect }: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-xl border transition-colors ${selected
        ? "border-primary/25 bg-primary/8 text-foreground"
        : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground"} ${isDragging ? "relative z-10 shadow-lg opacity-80" : ""}`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
        onClick={onSelect}
        aria-current={selected ? "page" : undefined}
      >
        <FolderOpen className={`size-4 shrink-0 ${selected ? "text-primary" : ""}`} />
        <span className="truncate">{project.name}</span>
        {project.pinned && <Pin className="ml-auto size-3 shrink-0 text-muted-foreground" />}
      </button>
      <button
        type="button"
        className="mr-1.5 flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
        aria-label={`Drag to reorder ${project.name}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

function ProjectGroup({ title, items, selectedId, onSelect }: {
  title: string;
  items: Project[];
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((project) => (
          <SortableProject key={project.id} project={project} selected={project.id === selectedId} onSelect={() => onSelect(project.id)} />
        ))}
      </SortableContext>
    </div>
  );
}

function ChatFiles({ chatId }: { chatId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["session-files", chatId],
    queryFn: () => sessionFilesApi.list(chatId),
  });
  if (isLoading) return <span className="text-xs text-muted-foreground">Loading files…</span>;
  const files = data?.files.filter((file) => file.isFile) ?? [];
  if (!files.length) return <span className="text-xs text-muted-foreground">No chat files</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file) => (
        <a
          key={file.path}
          href={`/api/chat/${chatId}/session-files/${file.path.split("/").map(encodeURIComponent).join("/")}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:border-primary/30 hover:text-foreground"
        >
          {file.name}
        </a>
      ))}
    </div>
  );
}

const fieldClass = "h-10 rounded-xl border-border/70 bg-background px-3.5 focus:border-primary/60 focus:ring-2 focus:ring-primary/10";
const textAreaClass = "min-h-24 resize-y rounded-xl border-border/70 bg-background px-3.5 py-3 leading-relaxed focus:border-primary/60 focus:ring-2 focus:ring-primary/10";

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0];
  const [draftOverrides, setDraftOverrides] = useState<Record<number, ProjectDraft>>({});
  const draftOverride = selected ? draftOverrides[selected.id] : undefined;
  const draft: ProjectDraft = draftOverride
    ? draftOverride
    : { projectId: selected?.id ?? 0, name: selected?.name ?? "", brief: selected?.brief ?? "", instructions: selected?.instructions ?? "", notes: selected?.notes ?? "" };
  const setDraft = (next: ProjectDraft) => setDraftOverrides((old) => ({ ...old, [next.projectId]: next }));
  const changed = !!selected && (draft.name !== selected.name || draft.brief !== selected.brief || draft.instructions !== selected.instructions || draft.notes !== selected.notes);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingFile, setEditingFile] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const { data: chats = [] } = useQuery({ queryKey: ["project-chats", selected?.id], queryFn: () => projectsApi.chats(selected!.id), enabled: !!selected });
  const { data: files = [] } = useQuery({ queryKey: ["project-files", selected?.id], queryFn: () => projectsApi.files(selected!.id), enabled: !!selected });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["project-chats"] });
    void queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };
  const run = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); refresh(); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Project action failed"); }
  };
  const create = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const row = await projectsApi.create({ name });
      queryClient.setQueryData<Project[]>(["projects"], (old = []) => [...old, row]);
      setSelectedId(row.id);
      setNewName("");
      refresh();
      toast.success("Project created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create project"); }
    finally { setCreating(false); }
  };
  const reorder = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = projects.findIndex((project) => project.id === active.id);
    const to = projects.findIndex((project) => project.id === over.id);
    if (from < 0 || to < 0 || projects[from].pinned !== projects[to].pinned) return;
    const ordered = arrayMove(projects, from, to);
    if (selected) setSelectedId(selected.id);
    queryClient.setQueryData(["projects"], ordered);
    try { await projectsApi.reorder(ordered.map((project) => project.id)); }
    catch (error) {
      queryClient.setQueryData(["projects"], projects);
      toast.error(error instanceof Error ? error.message : "Could not reorder projects");
    }
  };
  const save = async () => {
    if (!selected || !changed || saving) return;
    setSaving(true);
    try {
      const row = await projectsApi.update(selected.id, {
        name: draft.name.trim(), brief: draft.brief, instructions: draft.instructions, notes: draft.notes,
      });
      queryClient.setQueryData<Project[]>(["projects"], (old = []) => old.map((project) => project.id === row.id ? row : project));
      setDraftOverrides((old) => {
        const updated = { ...old };
        delete updated[selected.id];
        return updated;
      });
      refresh();
      toast.success("Project saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save project"); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(`Delete “${selected.name}”? Its shared files will be deleted. Linked chats and their files will be kept.`)) return;
    const id = selected.id;
    try {
      await projectsApi.remove(id);
      setSelectedId(null);
      setDraftOverrides((old) => {
        const updated = { ...old };
        delete updated[id];
        return updated;
      });
      refresh();
      toast.success("Project deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete project"); }
  };
  const newChat = async () => {
    if (!selected) return;
    let model: { providerId?: number; modelId?: string } = {};
    try { model = JSON.parse(localStorage.getItem("lastModel") ?? "{}") as typeof model; } catch { /* use no model */ }
    try {
      const chat = await conversationsApi.create({ providerId: model.providerId, modelId: model.modelId, projectId: selected.id });
      refresh();
      router.push(`/chat/${chat.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create chat"); }
  };
  const uploadFile = async (file: File) => {
    if (!selected || uploading) return;
    setUploading(true);
    try {
      await projectsApi.upload(selected.id, file);
      void queryClient.invalidateQueries({ queryKey: ["project-files", selected.id] });
      toast.success(`${file.name} uploaded`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not upload file"); }
    finally { setUploading(false); }
  };
  const saveFile = async () => {
    if (!selected || !filePath.trim()) return;
    const id = selected.id;
    await run(async () => {
      await projectsApi.writeFile(id, filePath.trim(), fileContent);
      setFilePath("");
      setFileContent("");
      setEditingFile(false);
      void queryClient.invalidateQueries({ queryKey: ["project-files", id] });
    }, "Text file saved");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-primary/[0.035] via-background to-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 md:px-8 md:py-10">
        <header className="mb-8">
          {/* <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FolderOpen className="size-5" /></div> */}
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">A home for your chats, shared files, and the context your AI remembers.</p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm lg:sticky lg:top-8">
            <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="space-y-2 p-1">
              <label htmlFor="new-project-name" className="text-xs font-semibold text-muted-foreground">New project</label>
              <div className="flex gap-2">
                <Input id="new-project-name" className={fieldClass} maxLength={120} placeholder="Enter a name" value={newName} onChange={(event) => setNewName(event.target.value)} />
                <Button type="submit" size="icon-lg" disabled={!newName.trim() || creating} aria-label="Create project">
                  {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </Button>
              </div>
            </form>
            <div className="mt-3 border-t pt-2">
              {isLoading ? <p className="px-2 py-4 text-sm text-muted-foreground">Loading projects…</p> : projects.length ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorder(event)}>
                  <ProjectGroup title="Pinned" items={projects.filter((project) => project.pinned)} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); setEditingFile(false); setFilePath(""); setFileContent(""); }} />
                  <ProjectGroup title="Projects" items={projects.filter((project) => !project.pinned)} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); setEditingFile(false); setFilePath(""); setFileContent(""); }} />
                </DndContext>
              ) : <p className="px-2 py-5 text-sm text-muted-foreground">Create your first project to get started.</p>}
            </div>
            {/* {projects.length > 1 && <p className="px-2 pt-4 text-xs text-muted-foreground">Drag the handle to change the order.</p>} */}
          </aside>

          {selected ? (
            <main className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm md:p-6">
                <div className="min-w-0">
                  {/* <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Project workspace</p> */}
                  <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">{selected.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{chats.length} {chats.length === 1 ? "chat" : "chats"} · {files.filter((file) => file.isFile).length} {files.filter((file) => file.isFile).length === 1 ? "file" : "files"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => { setSelectedId(selected.id); void run(() => projectsApi.update(selected.id, { pinned: !selected.pinned }), selected.pinned ? "Unpinned" : "Pinned"); }}>
                    <Pin className="size-4" />{selected.pinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button onClick={() => void newChat()}><Plus className="size-4" />New chat</Button>
                  <Button size="icon" variant="ghost" onClick={() => void remove()} aria-label="Delete project" title="Delete project" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button>
                </div>
              </div>

              <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm md:p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold">Project context</h3>
                  <p className="mt-1 text-sm text-muted-foreground">This information helps the AI work consistently across chats in this project.</p>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-5">
                  <div className="space-y-1.5">
                    <label htmlFor="project-name" className="text-sm font-medium">Name</label>
                    <Input id="project-name" className={fieldClass} maxLength={120} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="project-brief" className="text-sm font-medium">What is this project about?</label>
                    <Textarea id="project-brief" className={textAreaClass} maxLength={10000} placeholder="Describe the goal, scope, and important background…" value={draft.brief} onChange={(event) => setDraft({ ...draft, brief: event.target.value })} />
                    <p className="text-xs text-muted-foreground">A short brief gives every linked chat a useful starting point.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="project-instructions" className="text-sm font-medium">Instructions for the AI</label>
                    <Textarea id="project-instructions" className={textAreaClass} maxLength={10000} placeholder="For example: Keep answers concise and cite sources…" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="project-notes" className="text-sm font-medium">Shared notes</label>
                    <Textarea id="project-notes" className={textAreaClass} maxLength={20000} placeholder="Decisions, facts, and progress to remember…" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
                    <p className="text-xs text-muted-foreground">You and the AI can update these notes as the project evolves.</p>
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t pt-4">
                    {changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                    <Button type="submit" disabled={!changed || !draft.name.trim() || saving} className="min-w-32">
                      {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm md:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-semibold">Shared files</h3><p className="mt-1 text-sm text-muted-foreground">Available to every chat in this project.</p></div>
                  <Button variant="outline" onClick={() => { setFilePath(""); setFileContent(""); setEditingFile((current) => !current); }}><FilePlus2 className="size-4" />{editingFile ? "Close editor" : "New text file"}</Button>
                </div>
                <button type="button" disabled={uploading} onClick={() => uploadInputRef.current?.click()} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Upload className="size-4" /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium">{uploading ? "Uploading…" : "Choose a file to upload"}</span><span className="block text-xs text-muted-foreground">Share documents, notes, or images with this project</span></span>
                </button>
                <input ref={uploadInputRef} type="file" className="hidden" tabIndex={-1} disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.target.value = ""; }} />
                {files.filter((file) => file.isFile).length > 0 && (
                  <div className="mt-4 divide-y rounded-xl border">
                    {files.filter((file) => file.isFile).map((file) => (
                      <div key={file.path} className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-sm">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <a href={file.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline" title={file.path}>{file.path}</a>
                        {file.size < 1_000_000 && /\.(txt|md|json|csv|ts|tsx|js|jsx|css|html|xml|yaml|yml)$/i.test(file.name) && (
                          <Button variant="ghost" size="sm" onClick={async () => {
                            try {
                              const response = await fetch(file.url ?? "");
                              if (!response.ok) throw new Error("Could not read file");
                              setFilePath(file.path); setFileContent(await response.text()); setEditingFile(true);
                            } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read file"); }
                          }}>Edit</Button>
                        )}
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${file.name}`} onClick={() => {
                          if (window.confirm(`Delete ${file.path}?`)) void run(async () => {
                            await projectsApi.deleteFile(selected.id, file.path);
                            void queryClient.invalidateQueries({ queryKey: ["project-files", selected.id] });
                          }, "File deleted");
                        }}><Trash2 className="size-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                {editingFile && <form onSubmit={(event) => { event.preventDefault(); void saveFile(); }} className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-4">
                  <div className="space-y-1.5"><label htmlFor="project-file-path" className="text-sm font-medium">File name or path</label><Input id="project-file-path" className={fieldClass} required placeholder="notes/ideas.md" value={filePath} onChange={(event) => setFilePath(event.target.value)} /></div>
                  <div className="space-y-1.5"><label htmlFor="project-file-content" className="text-sm font-medium">Content</label><Textarea id="project-file-content" className={`${textAreaClass} min-h-40 font-mono text-sm`} placeholder="Write your note here…" value={fileContent} onChange={(event) => setFileContent(event.target.value)} /></div>
                  <Button type="submit" disabled={!filePath.trim()}><Check className="size-4" />Save text file</Button>
                </form>}
              </section>

              <section className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm md:p-6">
                <div className="mb-4"><h3 className="text-lg font-semibold">Chats</h3><p className="mt-1 text-sm text-muted-foreground">Conversations linked to this project. Chat files stay with each chat.</p></div>
                {chats.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-5 py-8 text-center">
                    <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground" />
                    <p className="text-sm font-medium">No chats yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Start a chat and your project context will be ready.</p>
                    <Button size="sm" className="mt-4" onClick={() => void newChat()}><Plus className="size-4" />New chat</Button>
                  </div>
                ) : <div className="divide-y rounded-xl border">
                  {chats.map((chat) => (
                    <div key={chat.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                        <Link href={`/chat/${chat.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline">{chat.title}</Link>
                        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => void run(async () => {
                          await conversationsApi.update(chat.id, { projectId: null });
                          void queryClient.invalidateQueries({ queryKey: ["project-chats", selected.id] });
                        }, "Chat unlinked")}>Unlink</Button>
                      </div>
                      <div className="pl-7"><ChatFiles chatId={chat.id} /></div>
                    </div>
                  ))}
                </div>}
              </section>
            </main>
          ) : <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">Create a project to get started.</div>}
        </div>
      </div>
    </div>
  );
}
