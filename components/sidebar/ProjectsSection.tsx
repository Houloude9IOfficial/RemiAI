"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Folder, Pen, SquarePen } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api/projects";
import { useNewChat } from "@/lib/hooks/use-new-chat";
import { useSidebarPreference } from "./useSidebarPreference";

const chatRow = "block min-h-9 truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors";
const activeChat = "bg-sidebar-accent text-sidebar-foreground";
const inactiveChat = "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground";

function ProjectRow({ project, expanded, onToggle }: { project: Project; expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const chatsId = useId();
  const reduceMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = useState(3);
  const newChatMutation = useNewChat(undefined, { projectId: project.id });
  const { data: chats = [], isLoading } = useQuery({
    queryKey: ["project-chats", project.id],
    queryFn: () => projectsApi.chats(project.id),
    enabled: expanded,
  });

  return (
    <div className="space-y-1">
      <div className="group flex min-h-9 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={chatsId}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
        </button>
        <button
          type="button"
          onClick={() => newChatMutation.mutate()}
          disabled={newChatMutation.isPending}
          className="invisible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-50"
          title={`New chat in ${project.name}`}
          aria-label={`New chat in ${project.name}`}
        >
          <SquarePen className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={chatsId}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-foreground"
          title={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={chatsId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="ml-5 space-y-1 border-l border-sidebar-border/60 py-1 pl-2">
              {isLoading && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Loading chats…</p>}
              {!isLoading && chats.length === 0 && <p className="px-2.5 py-1.5 text-xs text-muted-foreground">No chats yet</p>}
              {chats.slice(0, visibleCount).map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.id}`}
                  className={`${chatRow} ${pathname === `/chat/${chat.id}` ? activeChat : inactiveChat}`}
                  title={chat.title}
                >
                  {chat.title}
                </Link>
              ))}
              {chats.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + 5)}
                  className="ml-1 inline-flex min-h-8 items-center rounded-md px-2 py-1 text-left text-xs text-muted-foreground/70 transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Show more
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProjectsSection() {
  const listId = useId();
  const reduceMotion = useReducedMotion();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [sectionValue, setSectionValue] = useSidebarPreference("remiai:sidebar-projects-open", "open");
  const [expandedValue, setExpandedValue] = useSidebarPreference("remiai:sidebar-expanded-project", "default");
  const open = sectionValue === "open";
  const activeExpanded = expandedValue === "default"
    ? projects[0]?.id
    : expandedValue === "none" ? undefined : Number(expandedValue);

  return (
    <section className={open ? "mb-5" : "mb-2"}>
      <div className="group flex items-center gap-1 px-1 pb-1.5">
        <button
          type="button"
          onClick={() => setSectionValue(open ? "closed" : "open")}
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-9 min-w-0 flex-1 items-center rounded-lg px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-sidebar-foreground"
        >
          Projects
        </button>
        <Link href="/projects" aria-label="Manage projects" title="Manage projects" className="invisible rounded-lg p-1.5 text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100">
          <Pen className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => setSectionValue(open ? "closed" : "open")}
          aria-expanded={open}
          aria-controls={listId}
          className="invisible inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-[opacity,visibility,color,background-color] hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:visible group-hover:opacity-100 focus-visible:visible focus-visible:opacity-100"
          title={open ? "Collapse projects" : "Expand projects"}
          aria-label={open ? "Collapse projects" : "Expand projects"}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={listId}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5">
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
