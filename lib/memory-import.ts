import { MEMORY_CATEGORIES, type MemoryCategory, isValidMemoryDate } from "@/lib/memory-categories";

export const REMI_MEMORY_EXPORT_PROMPT = `Export the durable context you have learned about me for import into RemiAI.

RemiAI stores durable facts as individual memories. Memories are organized into these categories: ${MEMORY_CATEGORIES.join(", ")}.
Remi retrieves only memories relevant to the current conversation and can search the complete memory store when needed. Memories personalize responses, but temporary details, guesses, conversation summaries, and assistant instructions should not be stored as memories.

Preserve my wording where practical, especially preferences and explicit instructions. Do not invent facts, combine unrelated facts into broad summaries, duplicate equivalent entries, or include sensitive details unless I clearly stated them and they are useful as durable context. Keep each entry concise and independently useful.

Output only the following RemiAI import format, not a conversational summary:

## General
[unknown] - Memory

## Work
[2024-01-15] - Memory

## Personal
[unknown] - Memory

Use one line per durable memory. Use one of Remi's categories as the section heading. Put the event date (when the fact became true) in [YYYY-MM-DD]; use [unknown] when no event date is known. The event date is separate from the date Remi saves the memory. Put explicit behavioral preferences in the most appropriate supported category; there is no separate Instructions category.`;

export type ImportedMemory = {
  content: string;
  category: MemoryCategory;
  memoryDate: string | null;
};

export function normalizeImportedMemory(value: Partial<ImportedMemory>): ImportedMemory | null {
  const content = typeof value.content === "string" ? value.content.trim() : "";
  if (!content) return null;
  const category = MEMORY_CATEGORIES.includes(value.category as MemoryCategory) ? value.category as MemoryCategory : "general";
  const memoryDate = typeof value.memoryDate === "string" && isValidMemoryDate(value.memoryDate) ? value.memoryDate : null;
  return { content, category, memoryDate };
}
