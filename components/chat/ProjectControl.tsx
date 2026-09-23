"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { projectsApi } from "@/lib/api/projects";
import { conversationsApi } from "@/lib/api/conversations";

export function ProjectControl({ conversationId, initialProjectId }: { conversationId: number; initialProjectId: number | null }) {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const { data: chat } = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => conversationsApi.get(conversationId) });
  const projectId = chat ? chat.conversation.projectId : initialProjectId;
  return <div className="flex items-center gap-1"><select aria-label="Chat project" title="Link this chat to a project" value={projectId ?? ""} onChange={async (event) => {
    const next = event.target.value ? Number(event.target.value) : null;
    try { await conversationsApi.update(conversationId, { projectId: next }); queryClient.invalidateQueries({ queryKey: ["projects"] }); queryClient.invalidateQueries({ queryKey: ["project-chats"] }); queryClient.invalidateQueries({ queryKey: ["sidebar-conversations"] }); queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] }); toast.success(next ? "Chat linked to project" : "Chat unlinked"); }
    catch (error) { toast.error(String(error)); }
  }} className="max-w-30 rounded-md border border-border bg-background px-1 py-1 text-xs text-foreground"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>;
}
