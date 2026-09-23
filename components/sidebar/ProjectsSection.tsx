"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Folder, Plus } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api/projects";

function ProjectRow({ project, expanded, onToggle }: { project: Project; expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { data: chats = [] } = useQuery({ queryKey: ["project-chats", project.id], queryFn: () => projectsApi.chats(project.id), enabled: expanded });
  return <div><button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent"><Folder className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{project.name}</span>{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>{expanded && <div className="space-y-0.5 pl-7">{chats.map((chat) => <Link key={chat.id} href={`/chat/${chat.id}`} className={`block truncate rounded-md px-2 py-1.5 text-sm ${pathname === `/chat/${chat.id}` ? "bg-sidebar-accent text-sidebar-foreground" : "hover:bg-sidebar-accent"}`} title={chat.title}>{chat.title}</Link>)}{chats.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet</p>}</div>}</div>;
}

export function ProjectsSection() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [expanded, setExpanded] = useState<number | null>(null);
  const activeExpanded = expanded === null ? projects[0]?.id : expanded;
  return <section className="mb-3"><div className="flex items-center justify-between px-2 py-1"><Link href="/projects" className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70 hover:text-foreground">Projects</Link><Link href="/projects" aria-label="Manage projects" title="Manage projects" className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Plus className="h-3.5 w-3.5" /></Link></div><div className="space-y-0.5">{projects.map((project) => <ProjectRow key={project.id} project={project} expanded={activeExpanded === project.id} onToggle={() => setExpanded(activeExpanded === project.id ? -1 : project.id)} />)}</div></section>;
}
