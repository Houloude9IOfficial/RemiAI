import { z } from "zod";
import { TOOL_CATALOG } from "./catalog";
import type { ToolDefinition } from "./catalog";

// ---------------------------------------------------------------------------
// Help topics — extracted from the old system prompt tutorials
// ---------------------------------------------------------------------------

const TOOL_HELP_DOCS: Record<string, string> = {
  "filesystem": `## Filesystem tools — how they work

**Every filesystem tool needs a \`rootId\` (a number), NOT a file path string.**

1. First call \`list_permitted_roots\` to discover available roots.
2. It returns objects with \`id\` (the numeric rootId), \`path\`, \`label\`, and permissions.
3. Pass the numeric \`id\` as \`rootId\` to all other tools (\`list_directory\`, \`read_file\`, \`search_files\`, \`glob_files\`, \`write_file\`).
4. Then pass a \`relativePath\` (a string) to reach subdirectories inside that root.

**⚠️ IMPORTANT — only listed roots are accessible:** "list_permitted_roots" returns ONLY roots you have at least read or write access to. Roots with no access are intentionally omitted — never guess rootIds or attempt to access an unlisted directory; the attempt will be denied. If a requested file isn't in any listed root, tell the user you can't access it.

**Example workflow:**
- \`list_permitted_roots\` → returns [{ id: 1, path: "/Users/me/Docs", label: "Docs" }]
- \`list_directory({ rootId: 1 })\` → browse root
- \`list_directory({ rootId: 1, relativePath: "projects" })\` → browse subdirectory
- \`read_file({ rootId: 1, relativePath: "projects/notes.md" })\` → read a file

**Available filesystem tools:**
| Tool | Purpose |
|---|---|
| \`list_permitted_roots\` | List directory roots you have access to (read and/or write), with permissions. Roots you have no access to are omitted. Always call this first. |
| \`list_directory\` | List files and subdirectories inside a root. |
| \`read_file\` | Read text content. Supports URL for chat-uploaded files OR rootId+relativePath for directory files. Max 100KB. |
| \`read_media\` | Read media files (images/videos) from directory roots. For images returns a base64 thumbnail. |
| \`search_files\` | Fuzzy search for text across files in a root. |
| \`glob_files\` | Find files by glob pattern (e.g. "**/*.md"). |
| \`write_file\` | Write or append to a file. Creates parent dirs automatically. |
| \`create_directory\` | Create directories. Creates parent dirs automatically. |
| \`delete_directory\` | Permanently deletes a directory and ALL contents. |
| \`rename_item\` | Rename or move a file/directory within the same root.`,

  "absolute-paths": `## How to compute relativePath from an absolute file path

When the user gives you an **absolute file path** (like \`/Users/me/Docs/projects/notes.md\`):

1. Call \`list_permitted_roots\` to see all available roots and their \`path\` values.
2. For each root, check if the user's path **starts with** the root's \`path\` field.
3. If it does — compute \`relativePath\` by **stripping the root's path** from the absolute path:
   - root.path = "/Users/me/Docs", user's file = "/Users/me/Docs/projects/notes.md"
   - \`relativePath\` = \`projects/notes.md\`
4. If **none** of the roots contain the file's path, tell the user to add that directory as a new root.

**macOS notes:**
- On macOS, \`/var\` is a symlink to \`/private/var\`. A file at \`/var/folders/...\` resolves to \`/private/var/folders/...\`.
- macOS temp/screenshot files (\`/var/folders/.../T/...\`) are NOT inside any normal configured root. You cannot read them unless the user adds that temp directory.
- macOS screenshots often have **spaces** in filenames like \`Screenshot 2026-07-13 at 12.46.06 PM.png\`. Include spaces as-is in \`relativePath\`.
- macOS file paths with spaces do NOT need escaping.

**Windows users**: Always use forward slashes (\`/\`) in \`relativePath\`.`,

  "@FILE-references": `## @FILE references — how to handle file markers in user messages

The user can reference files and directories using \`📄\` (file) or \`📁\` (directory) markers followed by a path:

| User types | Meaning |
|---|---|
| \`📄 Documents/report.pdf\` | File "report.pdf" in the "Documents" root directory |
| \`📁 Projects/src\` | Directory "src" in the "Projects" root directory |

### How to resolve:
1. Call \`list_permitted_roots\` to discover all available roots.
2. Match the root label from the reference to a root's label.
3. Extract the relative path — it's everything after the root label and "/".
4. Use the appropriate filesystem tool with the correct rootId and relativePath.

If a file reference doesn't match any configured root, tell the user the referenced root doesn't exist.`,

  "memory": `## Memory system — tools and usage

**Tools available:**
| Tool | Parameters | Purpose |
|---|---|---|
| \`remember\` | \`content\` (string) | Save a fact about the user. |
| \`search_memories\` | \`query\` (string) | Search saved memories. |
| \`get_recent_memories\` | (none) | Get the last 10 saved memories. Call at conversation start. |

### When to save memories:
- User expresses preferences ("I love X", "I like Y")
- User mentions their job, profession, or what they work on
- User talks about hobbies, interests, or passions
- User shares something about their background, location, or context
- User mentions a tool, technology, language, or framework they use
- User expresses an opinion, a goal, or a constraint

### How to save good memories:
- Be specific — "The user loves NodeJS and works on full-stack JavaScript" is better than "The user likes JavaScript"
- Be concise — keep each memory to 1-2 sentences
- Do it immediately — call \`remember\` in the SAME response where you learn the fact`,

  "profile": `## Profile system — view and update user's permanent profile

**Tools available:**
| Tool | Parameters | Purpose |
|---|---|---|
| \`get_profile\` | (none) | Get the user's complete profile (name, bio, location, occupation, interests, skills, pronouns, social links, preferences). |
| \`update_profile\` | Any profile field | Update one or more fields in the user's profile. |

### When to use profile tools:
- User asks "What do you know about me?" → call \`get_profile\`
- User tells you something permanent about themselves → call \`update_profile\`
- You need their name or background → call \`get_profile\` instead of guessing

### Profile vs. Memories:
| Situation | Use |
|---|---|
| User says "I'm a software engineer at Google" | \`update_profile({ occupation: "Software Engineer at Google" })\` |
| User says "I love NodeJS" | \`remember({ content: "The user loves NodeJS." })\` |
| User says "I live in San Francisco" | \`update_profile({ location: "San Francisco, CA" })\` |
| User says "I use VS Code" | \`remember({ content: "The user uses VS Code as their editor." })\` |

**Profile fields** are for structured, permanent information. **Memories** are for facts, preferences, and ephemeral context.`,

  "todo": `## Todo list — plan and track multi-step tasks

**Tools available:**
| Tool | Purpose |
|---|---|
| \`todos_init\` | Create or replace a todo list with tasks and unique IDs. |
| \`todos_update\` | Update status of items (pending, in_progress, completed, failed, skipped). Add optional notes. |
| \`todos_view\` | View the current todo list with all statuses and progress. |

### When to use:
- **At the start of a complex task**: Call \`todos_init\` to break down the request into clear steps.
- **As you complete each step**: Call \`todos_update\` to mark items.
- **To check progress**: Call \`todos_view\` to see the current state.

### Best practices:
- Create the todo list BEFORE you start executing.
- Use clear, action-oriented task descriptions.
- Update statuses as you work, not just at the end.
- Use notes to record brief context.`,

  "ask-questions": `## Ask Questions tool

Use \`ask_questions\` to gather multiple pieces of structured information from the user at once.

### How to use:
1. Call \`ask_questions\` with 1-7 questions, each with:
   - A unique \`id\` (kebab-case, e.g. "tech-stack")
   - The \`question\` text (clear and specific)
   - 2-3 \`options\` (predefined answer choices)
   - \`allowCustom\` (boolean, default true)
2. After the tool returns, present the questions to the user in your text response
3. Ask the user to respond with their answers
4. When they reply, process their answers

### When to use:
- Setting up a project: ask about tech stack, features, design preferences
- Gathering requirements
- Preferences and decision-making
- Onboarding new users

### Example:
\`\`\`
ask_questions({
  title: "Project Setup",
  questions: [
    { id: "tech-stack", question: "What tech stack?", options: ["Next.js", "React + Vite", "Plain HTML/CSS/JS"] },
    { id: "styling", question: "Styling approach?", options: ["Tailwind CSS", "CSS Modules", "Styled Components"] },
  ],
})
\`\`\``,

  "suggest-followups": `## Suggest Followups tool

Use \`suggest_followups\` to offer the user 2-6 clickable followup questions at the bottom of your response.

### How to use:
1. Call \`suggest_followups({ suggestions: [...] })\` with 2-6 complete question strings.
2. These appear as clickable chips below your response text.
3. The user can click any suggestion to send it as their next message.

### When to use:
- After explaining a concept — offer deeper exploration
- After completing a task — suggest next steps
- When the user seems engaged — suggest related topics

### Good example:
\`\`\`
suggest_followups({
  suggestions: [
    "What is the difference between var, let, and const?",
    "Show me a real-world example",
    "How does hoisting work in JavaScript?",
  ]
})
\`\`\`

### Tips:
- Each suggestion must be a complete, self-contained question or prompt
- Vary the types: deep dive, example, related concept
- 3-4 suggestions is the sweet spot
- Don't use on every response — only when followups make sense
- ⚠️ Never use meta-questions like "What do you want to do next?" or "What should I do next?" — every suggestion must be a specific, actionable prompt
- Call \`suggest_followups\` at most once per response — if called multiple times, only the last set is shown`,

  "agent-spawner": `## Agent Spawner — spawn sub-agents for complex tasks

**Tools available:**
| Tool | Purpose |
|---|---|
| \`spawn_agent\` | Spawn a specialised sub-agent (researcher, coder, analyst, summarizer, or custom). |
| \`get_agent_result\` | Check the result of a background agent task. |

### Available agent types:
| Type | Best for |
|---|---|
| \`researcher\` | Researching topics, reading web pages, gathering information. |
| \`coder\` | Writing, analyzing, debugging, or refactoring code. |
| \`analyst\` | Analyzing data, performing calculations, finding trends. |
| \`summarizer\` | Condensing long content into concise summaries. |
| \`custom\` | Any task with a custom system prompt. |

### When to use:
- **Offload deep research** — spawn a researcher agent instead of making 10+ tool calls yourself.
- **Avoid token bloat** — offload complex work to a sub-agent and just get the summary.
- **Run parallel tasks** — start a background agent and continue the conversation.
- **Decompose complex problems** — agent chaining lets sub-agents spawn their own sub-agents (max depth: 3).

### Execution modes:
- **Blocking** (\`wait_for_completion: true\`, default): waits for result before continuing.
- **Background** (\`wait_for_completion: false\`): starts in background, check later with \`get_agent_result\`.

### Agent chaining:
Sub-agents can spawn their own sub-agents (up to 3 levels deep). Each agent in the chain has full access to \`spawn_agent\` and \`get_agent_result\`.`,

  "scheduled-tasks": `## Scheduled Tasks — execute tasks at a future time

**Tools available:**
| Tool | Parameters | Purpose |
|---|---|---|
| \`schedule_task\` | \`triggerAt\`, \`task\`, \`timezone\` (optional), \`schedule\` (cron, optional) | Schedule a task for future execution. |
| \`list_scheduled_tasks\` | \`includeCompleted\` (optional), \`limit\` (optional) | List scheduled tasks. |
| \`update_scheduled_task\` | \`taskId\`, \`triggerAt\`, \`task\`, \`timezone\`, \`schedule\` | Update a pending task. |
| \`cancel_scheduled_task\` | \`taskId\` | Cancel a pending task. |

### ⚠️ CRITICAL: Timezone handling — must use get_time_details first
When scheduling tasks, you MUST call \`get_time_details()\` FIRST to get the user's timezone info. Then pass the \`triggerAt\` in the USER'S local time (NOT converted to UTC) and include the ENTIRE \`utcOffset\` value as the \`timezone\` parameter.

**Correct workflow:**
\`\`\`
get_time_details()
// Returns: timezone: "Europe/Bucharest", utcOffset: "UTC+03:00"

schedule_task({
  triggerAt: "2026-07-19T23:59",    // User's local time, NOT UTC
  timezone: "UTC+03:00"             // Pass utcOffset AS-IS from get_time_details
})
\`\`\`

### When to use:
- Time-sensitive lookups ("Check at midnight if results are out")
- Reminders ("Remind me at 3pm to call the dentist")
- One-off future tasks
- Recurring tasks with cron expressions

### How it works:
1. Call \`get_time_details\` for timezone offset.
2. Call \`schedule_task\` with trigger time in user's local time + timezone offset.
3. System converts to UTC and stores the task.
4. A background scheduler checks for due tasks every 15 seconds.
5. When triggered, the AI executes the task and sends a desktop notification.`,

  "newsapi": `## NewsAPI tools (when configured)

If the user has configured a NewsAPI API key, you have access to:
| Tool | Parameters | Purpose |
|---|---|---|
| \`news_search\` | \`query\`, \`language\`, \`sortBy\`, \`pageSize\`, \`from\` | Search articles from thousands of sources worldwide. |
| \`news_top_headlines\` | \`country\`, \`category\`, \`query\`, \`sources\`, \`pageSize\` | Get top headlines and breaking news. |

### Location-aware news workflow:
Results are already localized automatically: the \`country\` for top headlines and the \`language\` for search default to the user's region/locale (derived from their browser). You can still override them explicitly:
1. Call \`get_profile\` to find the user's location for more detail.
2. Derive the 2-letter ISO country code (e.g. "San Francisco, CA" → \`us\`).
3. Pass the country code to \`news_top_headlines({ country: "us" })\` to override the default.

### When to use each:
| Scenario | Use |
|---|---|
| User wants news about a specific topic | \`news_search\` |
| User asks "What's happening today?" | \`news_top_headlines\` |
| User wants local news | \`news_top_headlines({ country })\` |
| Deep research or older articles | \`news_search\` with \`from\` date |

Note: \`country\` and \`sources\` cannot be used together. \`category\` and \`sources\` also cannot be used together.`,

  "firecrawl": `## Firecrawl tools (when configured)

If the user has configured a Firecrawl API key, you have access to:
| Tool | Parameters | Purpose |
|---|---|---|
| \`fc_search\` | \`query\`, \`limit\`, \`sources\` | Web search using Firecrawl. |
| \`fc_scrape\` | \`url\`, \`formats\`, \`onlyMainContent\` | Scrape a single URL as markdown. |
| \`fc_crawl\` | \`url\`, \`maxPages\`, \`includePaths\`/ \`excludePaths\` | Crawl a multi-page website. |
| \`fc_interact\` | \`scrapeId\`, \`prompt\` or \`code\` | Interact with a live browser session. |
| \`fc_stop_interaction\` | \`scrapeId\` | Stop an active browser interaction. |

### Firecrawl interaction workflow:
1. Call \`fc_scrape\` on a URL to get a \`scrapeId\`.
2. Call \`fc_interact\` with that \`scrapeId\` and a prompt or code.
3. Chain multiple interactions — the session persists.
4. Call \`fc_stop_interaction\` when done to clean up.`,

  "brave-search": `## Brave Search tool (when configured)

If the user has configured a Brave Search API key, you have access to:
| Tool | Parameters | Purpose |
|---|---|---|
| \`brave_web_search\` | \`query\` (required), \`count\` (optional, default 10, max 20) | Search the web using Brave Search. |

### When to use:
- **General web search** — Use \`brave_web_search\` when you need current information from the web.
- **Complement with web_fetch** — After getting search results, use \`web_fetch\` to read specific pages.
- **Compare with Firecrawl** — If Firecrawl is also configured, use Firecrawl (\`fc_search\`/\`fc_scrape\`) for more advanced scraping and crawling. Use Brave for quick, simple web searches.

### Localization:
Results are automatically localized to the user's country and language (derived from their browser locale/timezone), so searches return results relevant to their region.

### Example:
\`\`\`
brave_web_search({ query: "React 19 release date features", count: 5 })
\`\`\``,

  "notion": `## Notion tools (when configured)

If the user has configured a Notion integration token, you have read-only access to their Notion workspace:
| Tool | Parameters | Purpose |
|---|---|---|
| \`notion_search_pages\` | \`query\` (required) | Search for pages in the Notion workspace. Returns titles, IDs, and URLs. |
| \`notion_get_page\` | \`pageId\` (required, UUID from search) | Get the full content of a page as text blocks. |

### Workflow: search → read

1. **Always call \`notion_search_pages\` first** with a search query to find the page you need.
2. **Get a real \`pageId\`** from the search results — it's a UUID like \`359eed26-0bc3-8148-bb31-cb5b182a3219\`. Do NOT make up or guess the ID.
3. **Call \`notion_get_page\`** with that exact \`pageId\` to read the page content.

### Example:
\`\`\`
// Step 1: Find the page
notion_search_pages({ query: "meeting notes" })
// Returns: [{ id: "359eed26-...", title: "Weekly Meeting Notes", url: "..." }]

// Step 2: Read the page content
notion_get_page({ pageId: "359eed26-0bc3-8148-bb31-cb5b182a3219" })
// Returns: [{ type: "h1", text: "Weekly Meeting" }, { type: "list_item", text: "Discussed Q3 roadmap" }]
\`\`\`

### ⚠️ Important:
- Only pages **shared with the integration** will appear in search results. If a page doesn't show up, the user needs to open that page in Notion, click Share, and add their integration.
- The \`pageId\` must be a real UUID from search results — never pass placeholders or made-up IDs.
- Notion access is **read-only** — you cannot create or modify pages.`,

  "context7": `## Context7 tool (when configured)

If the user has configured a Context7 API key, you have access to:
| Tool | Parameters | Purpose |
|---|---|---|
| \`context7_get_docs\` | \`library\` (required), \`query\` (optional) | Fetch up-to-date documentation and code examples for libraries/frameworks. |

### When to use:
- **Library documentation** — When the user asks about a specific library or framework, use \`context7_get_docs\` to get accurate, version-specific docs.
- **Code examples** — Get real usage examples for API calls, configuration, or patterns.
- **Migration guides** — When the user wants to upgrade or migrate between versions, get the official migration docs.

### Examples:
\`\`\`
// Get general docs about a library
context7_get_docs({ library: "next.js" })

// Ask a specific question
context7_get_docs({ library: "prisma", query: "connecting to PostgreSQL" })

// Get API docs
context7_get_docs({ library: "react", query: "useActionState" })
\`\`\`

### Tips:
- Be specific with the \`library\` name (e.g. "next.js" not just "next").
- Use the \`query\` parameter to narrow down to exactly what the user needs.
- Works well combined with web search — search for context first, then dig deeper with Context7.`,

  "code-execution": `## Code execution tools

| Tool | Parameters | Purpose |
|---|---|---|
| \`python_exec\` | \`code\`, \`timeout\` (optional, default 30s, max 120s) | Execute Python code in a subprocess. Returns stdout, stderr, exit code. |
| \`js_exec\` | \`code\`, \`timeout\` (optional, default 15s, max 60s) | Execute JavaScript in a sandboxed Node.js VM. Supports console.log, await. No fs/network/timers access. |
| \`bash_execute\` | \`command\`, \`timeout\` (optional, default 30s, max 120s) | Run a Bash command in the session's permitted project directory (sandboxed) or with full device access (full mode). Returns stdout, stderr, exit code. |

### ⚠️ bash_execute is for COMMANDS ONLY
Never use \`bash_execute\` to create, edit, or delete files or folders. Use the dedicated file tools instead:
- **Session files** (\`session_file_write\`, \`session_file_edit\`, \`session_file_delete\`) for drafts and chat-scoped deliverables.
- **Permitted-directory tools** (\`write_file\`, \`edit_file\`, \`create_directory\`, \`delete_directory\`, \`rename_item\`) for real projects.

Use \`bash_execute\` only for actual commands: running/testing code, starting servers or builds, checking processes, installing packages, inspecting the system.

### Timeouts
All three tools accept a \`timeout\` parameter (ms). If a command exceeds it, the process tree is terminated and the partial console output captured up to that point is returned with \`timedOut: true\`.

### Use cases:
- Run calculations, algorithms, or data processing
- Test code snippets before writing to files
- Generate or transform data
- Solve programming problems

For \`python_exec\`: use print() to see output.
For \`js_exec\`: use console.log() to see output. \`await\` is supported at top level.
For \`bash_execute\`: run shell commands, CLI tools, and scripts. Relative project paths only in sandboxed mode.`,

  "document-reader": `## Document reader tool

| Tool | Parameters | Purpose |
|---|---|---|
| \`read_document\` | \`url\` (for uploads) OR \`rootId\` + \`relativePath\` (for directory files) | Extract text from PDF, DOCX, DOC, ODT, RTF, EPUB files. |

Use \`read_document\` INSTEAD of \`read_file\` when the user asks you to read a PDF, DOCX, Word document, or other document format. The \`read_file\` tool only works on plain text files (.md, .txt, .csv, .json, etc.).

**Two calling conventions:**
1. Pass \`url\` for chat-uploaded files (e.g. "/api/chat/uploads/123/report.pdf")
2. Pass \`rootId\` + \`relativePath\` for files in configured directories

Max file size: 50 MB. Uses pdf-parse for PDFs and mammoth for DOCX files.`,

  "scaffolding": `## Writing files & project scaffolding

### Creating new projects or file structures

When the user asks you to scaffold a project:

1. **Plan first** — use \`todos_init\` to list all the files you'll create.
2. **Use \`write_file\` for files** — it automatically creates parent directories, so you don't need separate \`create_directory\` calls.
3. **Use \`create_directory\` only for empty folders** that won't have files written to them yet.
4. **Create all files together** — call multiple \`write_file\` tools in the same response.

**Example — scaffolding a project:**
\`\`\`
// ✅ DO this — let write_file create dirs automatically
todos_init({ items: [
  { id: "write-index", task: "Create src/index.ts" },
  { id: "write-header", task: "Create src/components/Header.tsx" },
] })
write_file({ rootId: 1, relativePath: "src/index.ts", content: "..." })
write_file({ rootId: 1, relativePath: "src/components/Header.tsx", content: "..." })
\`\`\`

### General rules:
- Always confirm with the user before overwriting existing files.
- Use \`write_file\` with \`mode: "append"\` when adding to existing files.
- For new files, use the default (overwrite mode).`,

  "web-fetch": `## Web Fetch tool

\`web_fetch\` reads web pages, REST APIs, or any publicly accessible URL. Returns HTTP status code, content type, and body text (up to 100K chars).

**Upload URL support:** When the URL points to a chat upload (\`/api/chat/uploads/...\`), \`web_fetch\` reads the file directly from disk instead of making an HTTP request. This works with both path-only and full localhost URLs.

For advanced scraping/crawling, use the Firecrawl tools instead (if configured).`,

  "mcp-tools": `## MCP tools

MCP servers provide additional tools beyond the built-in ones. Each MCP tool is namespaced with its server name like \`serverName__toolName\`.

Use them when the user asks for capabilities your built-in tools don't cover. For example, if the user says "check my database" and there's a PostgreSQL MCP server configured, you'd use \`postgres__query\`.

MCP tools are automatically loaded when you start a conversation and available alongside all built-in tools.`,

  "file-index": `## File Index — query recent changes and search indexed files

**Tools available:**
| Tool | Parameters | Purpose |
|---|---|---|
| \`query_recent_changes\` | \`limit\` (number, optional, default 20) | Get recently modified, added, or deleted files. Sorted by most recent. |
| \`query_file_index\` | \`pattern\` (string), \`limit\` (number, optional, default 50) | Search the file index by path pattern to find files by name or path fragment. |

### When to use:
- **At conversation start** — call \`query_recent_changes\` to see recent activity.
- **When the user mentions a file but you're not sure where it is** — call \`query_file_index\`.
- **When the user asks "what have I been working on?"** — call \`query_recent_changes\`.

### Important notes:
- Only files from directories with **Watch** enabled are indexed.
- The file watcher runs automatically. It indexes existing files on startup and tracks live changes.
- Files you create or modify through AI tools are also automatically indexed.
- Only metadata (path, size, modification time, content hash) is stored — not file contents.
- Use \`search_files\` or \`read_file\` to actually read file contents.`,

  "start-of-conversation": `## Start of conversation — gather context before responding

When the user sends their **first message** in a new conversation, call these tools **together** (in parallel):

1. **\`get_time_details\`** — Find out current date, time, timezone. Tailor time-aware responses.
2. **\`query_recent_changes\`** — See what files the user has been working on.
3. **\`get_recent_memories\`** — Remind yourself of saved facts about the user.

Then use what you learned to craft a personalized, context-aware response.

**Note:** If the user's message is very urgent (e.g. "Help!"), skip context gathering and reply directly.`,

  "file-attachments": `## File attachments — how to handle uploaded files

When the user attaches a file, it is saved into this conversation's session files under an \`uploads/\` folder and included as a markdown reference:
- **Images**: \`![filename](/api/chat/{id}/session-files/uploads/{filename})\`
- **Other files**: \`[filename](/api/chat/{id}/session-files/uploads/{filename})\`

These files live in the session sandbox, so you can also discover/read them with \`session_file_list\`, \`session_file_read\`, and \`session_file_read_media\`, and the user can manage them in the session files panel.

**Images — YOU CAN SEE THEM NATIVELY.** The system automatically reads uploaded images and passes them directly to your vision encoder. You do NOT need to call any tool.

**Documents (PDFs, DOCX, etc.)**: Call \`read_document({ url })\` with the file's URL.

**Plain text files (.txt, .md, .json, .csv, .log)**: Call \`read_file({ url })\` or \`web_fetch\`.

**Videos attached to a chat message**: Call \`read_media({ url })\` for metadata.

**Important:**
- Images are ALREADY visible — do NOT call \`read_media\` for chat-uploaded images.
- \`read_media\` is for files in directory roots (rootId + relativePath) or video metadata.`,

  "routines": `## Routines — create and run reusable JavaScript automation scripts

**Tools available:**
| Tool | Parameters | Purpose |
|---|---|---|
| \`create_routine\` | \`name\`, \`description\` (optional), \`code\` | Create a new reusable JavaScript routine. |
| \`run_routine\` | \`name\`, \`timeout\` (optional, default 30s, max 120s) | Execute a saved routine and get its output. |
| \`list_routines\` | (none) | List all saved routines with descriptions and last run status. |
| \`update_routine\` | \`name\`, \`newName\`, \`description\`, \`code\`, \`enabled\` (all optional except name) | Modify an existing routine. |
| \`delete_routine\` | \`name\` | Permanently delete a routine and all its run logs. |
| \`get_routine_logs\` | \`name\`, \`limit\` (optional, default 25, max 100) | Get the recent run history for a routine. |

### When to use:
- **Create reusable automation** — Save JavaScript scripts that can be run on demand later.
- **Run saved scripts** — Execute previously created routines by name.
- **Debug and monitor** — Check run logs to see past results and troubleshoot failures.

### Important notes:
- Routines run in an **isolated sandbox** with \`console.log()\` for output and top-level \`await\` support.
- They persist across conversations and can also be run from Settings > Routines.
- Routine names must be **kebab-case** (lowercase, numbers, hyphens, underscores).
- Disabled by default — must be enabled in Settings > Tools first.`,

  "delay": `## Delay tool

| Tool | Parameters | Purpose |
|---|---|---|
| \`delay\` | \`ms\` (required, max 300,000 = 5 minutes) | Wait for a specified number of milliseconds before continuing. |

### When to use:
- **Rate-limiting** between consecutive API requests to respect service limits.
- **Waiting for external systems** to process data (e.g. wait a few seconds after triggering a build).
- **Throttling** your own tool call chains to avoid overwhelming services.

### Example:
\`\`\`
// Wait 2 seconds between API calls
delay({ ms: 2000 })
// Then make the next call...
\`\`\`

### Tips:
- Use \`1_000\` for 1 second, \`10_000\` for 10 seconds.
- Max wait is 5 minutes (300,000 ms).
- The tool reports both the requested and actual wait time (actual may differ slightly).`,

  "create-visual": `## Create Visual — render dynamic visuals in the chat

The \`create_visual\` tool lets you generate SVG or HTML visuals and display them directly inline in the chat. This is perfect for when you want to show the user a visual representation instead of plain text.

### Two content types:

| Type | Best for |
|---|---|
| **SVG** (\`type: "svg"\`) | Charts (bar, line, pie, area), diagrams, graphs, icons, any 2D graphics |
| **HTML** (\`type: "html"\`) | Rich cards, dashboards, stats panels, comparison grids, timelines, layouts |

### Design guidelines:
- **Use a TRANSPARENT background** by default — do NOT add background colors to the root SVG or HTML body. The visual should blend seamlessly into the chat theme.
- Prefer theme tokens when needed: \`var(--chat-bg)\`, \`var(--chat-fg)\`, \`var(--chat-muted)\`, \`var(--chat-border)\`, \`var(--chat-primary)\` (injected by the chat UI).
- Keep it **clean and minimal** — use whitespace, subtle colors, and clear typography.
- Use responsive widths (\`100%\`) so visuals adapt to the chat container.
- Visuals are **centered by default** — only set \`options.align\` to left or right when the layout calls for it (e.g. pairing with text on the opposite side).
- For SVG: use a \`viewBox\` for scalability. Include axis labels for charts.
- For HTML: use flexbox/grid for layout. Subtle shadows and rounded corners look great.
- Font sizes: 14-16px for body text, 20-32px for headings/metrics.

### When to use:
- User asks about data trends → create a chart
- User wants to see progress → create a timeline or step-by-step
- User wants a summary → create metrics cards or a dashboard
- User wants to understand a process → create a flow diagram
- User asks for visual comparison → create a comparison table

### Parameter hints:
- \`title\` — A short, descriptive header shown above the visual
- \`content\` — The raw SVG markup or HTML markup
- \`options.caption\` — Optional footnote/text shown below the visual
- \`options.width\` / \`options.height\` — Control dimensions if the default doesn't work
- \`options.align\` — Alignment of the visual card: \`"center"\` (default), \`"left"\`, or \`"right"\`. Users can also re-align any visual directly in the chat.

### Example — a simple bar chart:
\`\`\`
create_visual({
  type: "svg",
  title: "Monthly Revenue",
  content: '<svg viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg"><rect x="50" y="200" width="40" height="80" fill="#6366f1" rx="4"/><rect x="110" y="150" width="40" height="130" fill="#6366f1" rx="4"/><rect x="170" y="100" width="40" height="180" fill="#6366f1" rx="4"/><text x="70" y="295" text-anchor="middle" font-size="12" fill="#6b7280">Jan</text><text x="130" y="295" text-anchor="middle" font-size="12" fill="#6b7280">Feb</text><text x="190" y="295" text-anchor="middle" font-size="12" fill="#6b7280">Mar</text></svg>'
})
\`\`\`

### Example — a metrics card:
\`\`\`
create_visual({
  type: "html",
  title: "Project Overview",
  content: '<div style="display:flex;gap:16px;flex-wrap:wrap"><div style="background:rgba(99,102,241,0.1);border-radius:12px;padding:20px;min-width:140px"><p style="font-size:12px;color:#6b7280;margin:0 0 4px">Total Users</p><p style="font-size:28px;font-weight:700;margin:0;color:#6366f1">2,847</p></div><div style="background:rgba(34,197,94,0.1);border-radius:12px;padding:20px;min-width:140px"><p style="font-size:12px;color:#6b7280;margin:0 0 4px">Active Today</p><p style="font-size:28px;font-weight:700;margin:0;color:#22c55e">1,203</p></div><div style="background:rgba(234,179,8,0.1);border-radius:12px;padding:20px;min-width:140px"><p style="font-size:12px;color:#6b7280;margin:0 0 4px">Revenue</p><p style="font-size:28px;font-weight:700;margin:0;color:#eab308">$12.4k</p></div></div>'
})
\`\`\``,

  "session-files": `## Session Files — a private file workspace for each conversation

Every conversation has its own private **session files** sandbox. Files you create there are shown to the user in a side panel and can be downloaded together as a .zip archive (e.g. a complete generated website).

### Tools
| Tool | Parameters | Purpose |
|---|---|---|
| \`session_file_list\` | \`path\` (optional) | List files in the conversation's sandbox (each entry includes its \`url\`). |
| \`session_file_read\` | \`path\`, \`offset\`, \`limit\` (optional) | Read a file's text content (max 1 MB per read). |
| \`session_file_read_media\` | \`path\` | Inspect an image/video in the sandbox — returns the actual pixels as a data URL. |
| \`session_file_write\` | \`path\`, \`content\`, \`mode\` (overwrite/append) | Create or modify a file. Creates parent folders automatically. |
| \`session_file_mkdir\` | \`path\` | Create an empty folder (rarely needed — writes create folders automatically). |
| \`session_file_move\` | \`from\`, \`to\` | Rename or move a file/folder within the sandbox. |
| \`session_file_download\` | \`path\` | Get a download link for a single file; present it as a markdown link. |
| \`session_file_delete\` | \`path\` | Permanently delete a file or folder. |
| \`session_present_file\` | \`path\`, \`message\` (optional) | Open the file panel straight to one file in the built-in viewer. |
| \`session_present_files\` | \`paths\` (optional), \`message\` (optional) | Open the file panel so the user can view/download the files. |

### File URLs — referencing sandbox files in the chat
Every sandbox file has a canonical URL: **\`/api/chat/{conversationId}/session-files/{path}\`** (e.g. \`/api/chat/5/session-files/assets/earth.jpg\`). The list/present results include these URLs. Use them to:
- **Show images** in your reply: \`![earth.jpg](/api/chat/5/session-files/assets/earth.jpg)\`
- **Link files** for the user to open/download: \`[report.pdf](/api/chat/5/session-files/output/report.pdf?download=1)\`
- **Read files with URL-based tools**: \`read_file({ url })\`, \`read_media({ url })\`, \`read_document({ url })\`, \`web_fetch({ url })\` all accept these URLs (read directly from disk).

### Workflow — generating a website
1. \`session_file_write({ path: "index.html", content: "..." })\` — repeat for each file (styles.css, app.js, ...).
2. \`session_present_files({ message: "Your website is ready!" })\` — opens the panel with a Download .zip button.

### ⚠️ Always present files you create
After writing or editing session files, **always** call \`session_present_file\` (single file — opens the panel straight to it) or \`session_present_files\` (multiple). Never finish a reply that created files without presenting them.

### Rules
- Always use **forward slashes** (/) in paths.
- **User uploads**: Files the user attaches to chat messages are stored here under an \`uploads/\` folder \u2014 list/read them like any other session file.
- The sandbox is **scoped to this conversation** — other chats can't see these files, and they don't touch the user's real directories.
- Deleting a conversation removes its sandbox files.`,

  "elevenlabs": `## ElevenLabs Voice (when configured)

ElevenLabs provides premium AI voice capabilities. When configured with an API key, it powers two features:

### Features:
| Feature | What it does |
|---|---|
| **Text-to-Speech (TTS)** | AI responses are spoken aloud with lifelike ElevenLabs voices instead of the system voice. |
| **Speech-to-Text (STT)** | Enables voice input in Talk mode — speak naturally and have it transcribed. |

### Configuration (in Settings > Tools > ElevenLabs):
1. **Get an API key** from https://elevenlabs.io/app/settings/api-keys
2. **Enable TTS** — Toggle "Text-to-Speech" on to use ElevenLabs voice for AI responses.
3. **Enable STT** — Toggle "Speech-to-Text" on to enable voice input in Talk mode.
4. **Choose a Voice** — Select from available voice profiles (Adam, Rachel, Bella, Josh, etc.).

### How it works:
- **TTS**: When enabled, AI responses in the chat are automatically spoken using the selected ElevenLabs voice instead of the system's built-in TTS.
- **STT**: When enabled, the Talk mode page shows a microphone button. Click to speak, and your speech is transcribed using the browser's native speech recognition.

### Notes:
- STT uses the **browser's built-in speech recognition**, not ElevenLabs' API. It works in Chrome, Edge, and Safari, but **not Firefox**.
- The AI does NOT have tools for ElevenLabs — it's purely a client-side audio feature configured in settings.`,
};

// ---------------------------------------------------------------------------
// Keyword synonyms — map common search terms to canonical topic names.
// This helps lower-end models that might guess the wrong topic name.
// ---------------------------------------------------------------------------

const KEYWORD_SYNONYMS: Record<string, string> = {
  files: "filesystem",
  file: "filesystem",
  folders: "filesystem",
  directory: "filesystem",
  directories: "filesystem",
  "read file": "filesystem",
  "write file": "filesystem",
  path: "absolute-paths",
  "file path": "absolute-paths",
  "absolute path": "absolute-paths",
  memories: "memory",
  remember: "memory",
  "save fact": "memory",
  "@file": "@FILE-references",
  "emoji": "@FILE-references",
  "file reference": "@FILE-references",
  schedule: "scheduled-tasks",
  scheduling: "scheduled-tasks",
  task: "scheduled-tasks",
  "news api": "newsapi",
  news: "newsapi",
  "web search": "firecrawl",
  scraping: "firecrawl",
  crawl: "firecrawl",
  brave: "brave-search",
  "brave search": "brave-search",
  notion: "notion",
  "notion search": "notion",
  "notion page": "notion",
  context7: "context7",
  "context 7": "context7",
  "get docs": "context7",
  documentation: "context7",
  "library docs": "context7",
  "code exec": "code-execution",
  python: "code-execution",
  javascript: "code-execution",
  js: "code-execution",
  pytest: "code-execution",
  bash: "code-execution",
  shell: "code-execution",
  pdf: "document-reader",
  docx: "document-reader",
  document: "document-reader",
  "spawn agent": "agent-spawner",
  "agent spawn": "agent-spawner",
  subagent: "agent-spawner",
  "todo list": "todo",
  todos: "todo",
  plan: "todo",
  "project setup": "scaffolding",
  "project scaffold": "scaffolding",
  "create project": "scaffolding",
  question: "ask-questions",
  "ask question": "ask-questions",
  poll: "ask-questions",
  followup: "suggest-followups",
  "follow up": "suggest-followups",
  suggestion: "suggest-followups",
  "suggest followup": "suggest-followups",
  "user profile": "profile",
  "change profile": "profile",
  bio: "profile",
  "file index": "file-index",
  "recent change": "file-index",
  index: "file-index",
  "upload": "file-attachments",
  attachment: "file-attachments",
  "attach file": "file-attachments",
  image: "file-attachments",
  "context gather": "start-of-conversation",
  greeting: "start-of-conversation",
  "first message": "start-of-conversation",
  mcp: "mcp-tools",
  "external tool": "mcp-tools",
  "fetch url": "web-fetch",
  "http request": "web-fetch",
  routine: "routines",
  routines: "routines",
  "create routine": "routines",
  "run routine": "routines",
  "javascript script": "routines",
  script: "routines",
  automation: "routines",
  wait: "delay",
  "rate limit": "delay",
  "rate limiting": "delay",
  throttle: "delay",
  eleven: "elevenlabs",
  "eleven labs": "elevenlabs",
  tts: "elevenlabs",
  "text to speech": "elevenlabs",
  stt: "elevenlabs",
  "speech to text": "elevenlabs",
  "voice settings": "elevenlabs",
  voice: "elevenlabs",
  "create visual": "create-visual",
  "create-visual": "create-visual",
  chart: "create-visual",
  graph: "create-visual",
  diagram: "create-visual",
  timeline: "create-visual",
  dashboard: "create-visual",
  "data viz": "create-visual",
  visualization: "create-visual",
  "metrics card": "create-visual",
  "session file": "session-files",
  "session files": "session-files",
  "session sandbox": "session-files",
  sandbox: "session-files",
  "present files": "session-files",
  "download zip": "session-files",
  website: "session-files",
  "generate website": "session-files",
  artifact: "session-files",
};

// ---------------------------------------------------------------------------
// Available topics list (used in tool description and listing)
// ---------------------------------------------------------------------------

const TOPIC_NAMES = Object.keys(TOOL_HELP_DOCS).sort();

function getAvailableTopicsText(): string {
  return TOPIC_NAMES.map((t) => `- \`${t}\``).join("\n");
}

// Use a shorter inline list for the tool description (the full list is in the
// system prompt and is returned when the user asks for an invalid topic)
const SHORT_TOPIC_LIST =
  "filesystem, memory, profile, todo, file-index, ask-questions, suggest-followups, agent-spawner, scheduled-tasks, routines, delay, create-visual, session-files, newsapi, firecrawl, brave-search, notion, context7, elevenlabs, code-execution, document-reader, @FILE-references, scaffolding, absolute-paths, web-fetch, mcp-tools, file-attachments, start-of-conversation";

// ---------------------------------------------------------------------------
// Cached listing for list_available_tools — built once from TOOL_CATALOG
// ---------------------------------------------------------------------------

interface ToolGroup {
  name: string;
  description: string;
  category: ToolDefinition["category"];
  togglable: boolean;
  requiresApiKey: boolean;
  tools: Array<{
    name: string;
    description: string;
  }>;
  helpTopic: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  filesystem: "Filesystem operations",
  context: "Environment context",
  code_execution: "Code execution",
  document_reader: "Document reader",
  memory: "Memory & recall",
  profile: "User profile",
  brave_search: "Web search (Brave)",
  notion: "Notion workspace",
  context7: "Library documentation (Context7)",
  file_index: "File index lookup",
  delay: "Delay / wait",
  ask_questions: "Ask user questions",
  web_fetch: "Web fetching",
  todo: "Todo list",
  agent_spawner: "Agent spawning",
  routines: "Routines",
  newsapi: "News search",
  scheduling: "Scheduled tasks",
  elevenlabs: "ElevenLabs voice",
  create_visual: "Dynamic visuals (SVG / HTML)",
  session_files: "Session files (per-chat sandbox)",
  firecrawl: "Web scraping (Firecrawl)",
};

const HELP_TOPIC_MAP: Record<string, string | null> = {
  filesystem: "filesystem",
  context: null,
  code_execution: "code-execution",
  document_reader: "document-reader",
  memory: "memory",
  profile: "profile",
  brave_search: "brave-search",
  notion: "notion",
  context7: "context7",
  file_index: "file-index",
  delay: "delay",
  ask_questions: "ask-questions",
  web_fetch: "web-fetch",
  todo: "todo",
  agent_spawner: "agent-spawner",
  routines: "routines",
  newsapi: "newsapi",
  scheduling: "scheduled-tasks",
  elevenlabs: "elevenlabs",
  create_visual: "create-visual",
  session_files: "session-files",
  firecrawl: "firecrawl",
};

function buildToolGroups(): ToolGroup[] {
  return TOOL_CATALOG.map((def) => ({
    name: def.name,
    description: def.description,
    category: def.category,
    togglable: def.togglable,
    requiresApiKey: def.requiresApiKey,
    tools: def.toolNames.map((name) => ({
      name,
      description:
        CATEGORY_LABELS[def.id] ?? def.name,
    })),
    helpTopic: HELP_TOPIC_MAP[def.id] ?? null,
  }));
}

const TOOL_GROUPS = buildToolGroups();

// ---------------------------------------------------------------------------
// Tool builder
// ---------------------------------------------------------------------------

/**
 * Build the \`get_tool_help\` tool that the AI can call to get detailed
 * usage documentation for any tool or feature on demand.
 *
 * This replaces the verbose tutorials that used to live in the system prompt.
 * By moving them to an on-demand tool, we save ~10k+ tokens per message.
 */
export function buildToolHelpTool(): Record<string, any> {
  return {
    get_tool_help: {
      description: `Get detailed usage guidance and examples for a tool or feature. Call when unsure how to use a tool or want workflow examples. Topics: ${SHORT_TOPIC_LIST}.`,
      parameters: z.object({
        topic: z
          .string()
          .min(1)
          .describe(`The topic or tool you want help with. Examples: "filesystem", "memory", "scaffolding". Topics: ${SHORT_TOPIC_LIST}`),
      }),
      execute: async ({ topic }: { topic: string }) => {
        const normalizedTopic = topic.toLowerCase().trim();

        // 1. Try exact match first
        if (TOOL_HELP_DOCS[normalizedTopic]) {
          return {
            topic,
            content: TOOL_HELP_DOCS[normalizedTopic],
          };
        }

        // 2. Try keyword synonym map
        const synonymMatch = KEYWORD_SYNONYMS[normalizedTopic];
        if (synonymMatch && TOOL_HELP_DOCS[synonymMatch]) {
          return {
            topic: synonymMatch,
            matchedAs: `(matched synonym "${normalizedTopic}" → "${synonymMatch}")`,
            content: TOOL_HELP_DOCS[synonymMatch],
          };
        }

        // 3. Try partial match against keywords too
        for (const [keyword, canonicalTopic] of Object.entries(
          KEYWORD_SYNONYMS,
        )) {
          if (
            normalizedTopic.includes(keyword) ||
            keyword.includes(normalizedTopic)
          ) {
            return {
              topic: canonicalTopic,
              matchedAs: `(matched keyword "${keyword}" → "${canonicalTopic}")`,
              content: TOOL_HELP_DOCS[canonicalTopic],
            };
          }
        }

        // 4. Try partial match against topic names
        const matches = TOPIC_NAMES.filter(
          (name) =>
            name.includes(normalizedTopic) ||
            normalizedTopic.includes(name),
        );

        if (matches.length === 1) {
          return {
            topic: matches[0],
            content: TOOL_HELP_DOCS[matches[0]],
          };
        }

        if (matches.length > 1) {
          return {
            topic,
            content: `Multiple topics matched "${topic}". Please choose one:\n\n${matches
              .map((m) => `- \`${m}\``)
              .join("\n")}`,
          };
        }

        // 5. Fallback — return list of available topics
        return {
          topic,
          content: `No documentation found for "${topic}". Available topics:\n\n${getAvailableTopicsText()}\n\nTry one of these, or use a broader search term.`,
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// list_available_tools tool builder
// ---------------------------------------------------------------------------

/**
 * Build the \`list_available_tools\` tool that the AI can call to discover
 * what tools are available, optionally filtered by keyword or category.
 *
 * This helps the AI find the right tool for a task without needing to know
 * the exact tool name upfront. Each result includes a \`helpTopic\` that can
 * be passed to \`get_tool_help\` for detailed usage guidance.
 */
export function buildListAvailableToolsTool(): Record<string, any> {
  return {
    list_available_tools: {
      description: `List available tools grouped by category, with names and brief descriptions. Filter by keyword (e.g. "search", "file", "web") or category (builtin, integration, memory). Each result includes a \`helpTopic\` for get_tool_help.`,
      parameters: z.object({
        query: z
          .string()
          .optional()
          .describe("Optional keyword to filter tools (matches names, groups, descriptions). Examples: 'search', 'file', 'web', 'news'."),
        category: z
          .enum(["builtin", "integration", "memory"])
          .optional()
          .describe("'builtin' = always-available; 'integration' = needs an API key; 'memory' = memory tools"),
      }),
      execute: async ({
        query,
        category,
      }: {
        query?: string | null;
        category?: string | null;
      }) => {
        let groups = TOOL_GROUPS;

        // Filter by category
        if (category) {
          groups = groups.filter(
            (g) => g.category === category,
          );
        }

        // Filter by keyword
        if (query) {
          const q = query.toLowerCase().trim();
          groups = groups
            .map((g) => {
              // Filter individual tools within the group
              const matchingTools = g.tools.filter(
                (t) =>
                  t.name.toLowerCase().includes(q) ||
                  g.name.toLowerCase().includes(q) ||
                  g.description.toLowerCase().includes(q),
              );
              return { ...g, tools: matchingTools };
            })
            .filter((g) => g.tools.length > 0);
        }

        // Build the response
        return {
          totalGroups: groups.length,
          totalTools: groups.reduce((sum, g) => sum + g.tools.length, 0),
          query: query ?? null,
          category: category ?? null,
          groups: groups.map((g) => ({
            name: g.name,
            description: g.description,
            category: g.category,
            togglable: g.togglable,
            requiresApiKey: g.requiresApiKey,
            toolCount: g.tools.length,
            tools: g.tools.map((t) => t.name),
            helpTopic: g.helpTopic,
            hint: g.helpTopic
              ? `For detailed usage guidance, call: get_tool_help({ topic: "${g.helpTopic}" })`
              : undefined,
          })),
          // If no query, show summary counts
          summary: !query
            ? {
                builtin: groups.filter((g) => g.category === "builtin").length,
                integration: groups.filter((g) => g.category === "integration").length,
                memory: groups.filter((g) => g.category === "memory").length,
                tip: "Use the 'query' parameter to narrow by keyword, or 'category' to filter by type (builtin/integration/memory).",
              }
            : undefined,
          // Remind about help topics
          tip: "For detailed workflow examples and parameter guidance on any tool, call get_tool_help({ topic: '...' }) with the helpTopic from any group above.",
        };
      },
    },
  };
}
