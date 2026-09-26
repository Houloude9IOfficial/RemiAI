import { z } from "zod";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, projects } from "@/db/schema";
import { deleteProjectFiles, deleteProjectFile, listProjectFiles, projectFilePath, projectFileUrl, readProjectFile, writeProjectFile } from "./storage";
import { readMediaFromResolvedPath } from "@/lib/fs/access";

export function buildProjectTools(conversationId: number): Record<string, unknown> {
  const current = async () => {
    const chat = await db.select({ projectId: conversations.projectId, memoryEnabled: conversations.memoryEnabled }).from(conversations).where(eq(conversations.id, conversationId)).get();
    if (!chat?.projectId || !chat.memoryEnabled) throw new Error("This chat must be linked to a project with Memory enabled");
    return chat.projectId;
  };
  return {
    project_list: { description: "List projects and their IDs when managing projects from this linked chat.", inputSchema: z.object({}), execute: async () => { await current(); return db.select().from(projects).orderBy(desc(projects.pinned), asc(projects.sortOrder)); } },
    project_create: { description: "Create a project when the user asks. This chat remains in its current project.", inputSchema: z.object({ name: z.string().trim().min(1).max(120), brief: z.string().max(10000).optional(), instructions: z.string().max(10000).optional() }), execute: async (input: { name: string; brief?: string; instructions?: string }) => {
      await current(); const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${projects.sortOrder}), -1) + 1` }).from(projects); return db.insert(projects).values({ ...input, sortOrder: next }).returning().get();
    } },
    project_update: { description: "Edit a project's name, brief, instructions, shared notes, or pinned state.", inputSchema: z.object({ projectId: z.coerce.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), brief: z.string().max(10000).optional(), instructions: z.string().max(10000).optional(), notes: z.string().max(20000).optional(), pinned: z.boolean().optional() }), execute: async ({ projectId, ...fields }: { projectId: number; name?: string; brief?: string; instructions?: string; notes?: string; pinned?: boolean }) => {
      await current(); return (await db.update(projects).set({ ...fields, updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId)).returning().get()) ?? { error: "Project not found" };
    } },
    project_delete: { description: "Delete a project only when the user explicitly asks. Linked chats are kept and unlinked; shared project files are deleted.", inputSchema: z.object({ projectId: z.coerce.number().int().positive() }), execute: async ({ projectId }: { projectId: number }) => {
      await current(); const deleted = await db.delete(projects).where(eq(projects.id, projectId)).returning().get(); if (deleted) await deleteProjectFiles(projectId); return { deleted: !!deleted, chatsKept: true };
    } },
    project_reorder: { description: "Set the display order of all projects by ID.", inputSchema: z.object({ ids: z.array(z.coerce.number().int().positive()) }), execute: async ({ ids }: { ids: number[] }) => {
      await current(); const rows = await db.select({ id: projects.id }).from(projects); if (rows.length !== ids.length || new Set(ids).size !== ids.length || rows.some((r) => !ids.includes(r.id))) return { error: "Provide each project ID once" }; db.transaction((tx) => ids.forEach((id, index) => { tx.update(projects).set({ sortOrder: index }).where(eq(projects.id, id)).run(); })); return { ok: true };
    } },
    project_chats: { description: "List chats linked to a project.", inputSchema: z.object({ projectId: z.coerce.number().int().positive() }), execute: async ({ projectId }: { projectId: number }) => { await current(); return db.select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt }).from(conversations).where(eq(conversations.projectId, projectId)).orderBy(desc(conversations.updatedAt)); } },
    project_link_chat: { description: "Link or unlink an existing chat to a project. Null projectId unlinks it.", inputSchema: z.object({ chatId: z.coerce.number().int().positive(), projectId: z.coerce.number().int().positive().nullable() }), execute: async ({ chatId, projectId }: { chatId: number; projectId: number | null }) => {
      await current(); if (projectId !== null && !(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get())) return { error: "Project not found" }; const row = await db.update(conversations).set({ projectId }).where(eq(conversations.id, chatId)).returning({ id: conversations.id, projectId: conversations.projectId }).get(); return row ?? { error: "Chat not found" };
    } },
    project_file_list: { description: "List files shared by the current chat's project.", inputSchema: z.object({}), execute: async () => { const id = await current(); return (await listProjectFiles(id)).map((f) => ({ path: f.path, size: f.size, isDirectory: f.isDirectory, url: f.isFile ? projectFileUrl(id, f.path) : null })); } },
    project_file_read: { description: "Read a shared project text file, up to 100 KB.", inputSchema: z.object({ path: z.string().min(1) }), execute: async ({ path }: { path: string }) => { const id = await current(); const data = await readProjectFile(id, path); return { content: data.subarray(0, 100000).toString("utf8"), truncated: data.length > 100000 }; } },
    project_file_read_media: { description: "Inspect a shared project image or video.", inputSchema: z.object({ path: z.string().min(1) }), execute: async ({ path }: { path: string }) => { const id = await current(); return readMediaFromResolvedPath(await projectFilePath(id, path), path, projectFileUrl(id, path)); } },
    project_file_write: { description: "Create or overwrite a text file shared by all chats in this project.", inputSchema: z.object({ path: z.string().min(1), content: z.string() }), execute: async ({ path, content }: { path: string; content: string }) => { const id = await current(); await writeProjectFile(id, path, Buffer.from(content)); return { ok: true, url: projectFileUrl(id, path) }; } },
    project_file_delete: { description: "Delete a shared project file or folder when the user asks.", inputSchema: z.object({ path: z.string().min(1) }), execute: async ({ path }: { path: string }) => { const id = await current(); await deleteProjectFile(id, path); return { ok: true }; } },
  };
}
