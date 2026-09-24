"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, Plus } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api/projects";
import { useSidebarPreference } from "./useSidebarPreference";

const reveal = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.22, ease: "easeInOut" as const },
};

function ProjectRow({ project, expanded, onToggle }: { project: Project; expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["project-chats", project.id],
    queryFn: () => projectsApi.chats(project.id),
    enabled: expanded,
  });

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`sidebar-project-${project.id}-chats`}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div id={`sidebar-project-${project.id}-chats`} {...reveal} className="overflow-hidden">
            <div className="ml-5 border-l border-sidebar-border/70 py-1 pl-3">
              {isLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading chats…</p>}
              {!isLoading && chats.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No chats yet</p>}
              {chats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.id}`}
                  className={`block min-h-10 truncate rounded-lg px-3 py-2.5 text-sm transition-colors ${pathname === `/chat/${chat.id}` ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}
                  title={chat.title}
                >
                  {chat.title}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProjectsSection() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [sectionValue, setSectionValue] = useSidebarPreference("remiai:sidebar-projects-open", "open");
  const [expandedValue, setExpandedValue] = useSidebarPreference("remiai:sidebar-expanded-project", "default");
  const open = sectionValue === "open";
  const activeExpanded = expandedValue === "default"
    ? projects[0]?.id
    : expandedValue === "none" ? undefined : Number(expandedValue);

  return (
    <section className="mb-5">
      <div className="flex items-center gap-1 px-1.5 pb-0">
        <button
          type="button"
          onClick={() => setSectionValue(open ? "closed" : "open")}
          aria-expanded={open}
          aria-controls="sidebar-projects-list"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-sidebar-foreground"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          Projects
        </button>
        <Link href="/projects" aria-label="Manage projects" title="Manage projects" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
          <Plus className="h-4 w-4" />
        </Link>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="sidebar-projects-list" {...reveal} className="overflow-hidden">
            <div className="space-y-1">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  expanded={activeExpanded === project.id}
                  onToggle={() => setExpandedValue(activeExpanded === project.id ? "none" : String(project.id))}
                />
              ))}
              {projects.length === 0 && (
                <Link href="/projects" className="block rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent">
                  Create your first project
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
