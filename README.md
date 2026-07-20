<div align="center">
  <img src="./assets/Preview.png" alt="RemiAI Preview" style="border-radius: 15px; max-width: 100%;" />
</div>

<h1 align="center">RemiAI</h1>

<p align="center">
  <strong>Your local AI assistant — self-hosted, file-aware, and extensible.</strong>
</p>

<p align="center">
  <a href="https://github.com/Houloude9IOfficial/RemiAI">
    <img src="https://img.shields.io/badge/GitHub-Houloude9IOfficial%2FRemiAI-181717?style=flat-square&logo=github" alt="GitHub">
  </a>
  <a href="https://www.producthunt.com/products/remiai">
    <img src="https://img.shields.io/badge/ProductHunt-RemiAI-da552f?style=flat-square&logo=producthunt" alt="ProductHunt">
  </a>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite" alt="SQLite">
</p>

---

## Overview

RemiAI is a **self-hosted AI assistant** that lives on your machine. It combines a conversational AI interface with deep local file system access, persistent memory, an extensible tool system, and support for the Model Context Protocol (MCP). You can think of it as a private, customizable AI that understands your files, remembers your preferences, and connects to external services — all without sending your data to third parties.

Built with **Next.js 16**, **TypeScript**, **Drizzle ORM** (SQLite), and the **AI SDK**, RemiAI runs entirely on your own hardware.

---

## Features

### Chat System

- Conversational interface with streaming AI responses
- **Multiple AI providers**: Anthropic (Claude), OpenAI (GPT), Ollama (local models), OpenAI-compatible endpoints
- **Per-conversation model picker** — switch models mid-conversation
- **Context-aware conversation starts** — the AI automatically gathers time, user profile, preferences, memories, and recent file changes before the first greeting
- **Markdown rendering** with syntax-highlighted code blocks and inline images
- **Todo list tracking** within conversations — plan and track multi-step tasks
- **Export dialog** to export conversations
- **Error handling** with retry support and toast notifications

### File System Integration

- **Directory root system** — grant read/write access to specific folders
- **Full file operations**: list, read, search (fuzzy), glob, write, create directory, delete, rename
- **Document reader** — extract text from PDF, DOCX, DOC, ODT, RTF, EPUB
- **Media reader** — view images and video metadata from permitted directories
- **File watcher** — background file indexing with live change detection (no separate process needed)
- **File index** — query recently changed files and search by filename across all watched directories
- **File attachments** — upload images, documents, and files via drag-and-drop, Ctrl+V paste, or the upload button
- **@FILE / @DIRECTORY mentions** — reference permitted files and directories directly in chat
- Automatic parent directory creation when writing files

### Memory System

- **Persistent facts** — the AI saves and recalls information across conversations
- `remember` — save a fact about the user
- `search_memories` — fuzzy search through saved memories
- `get_recent_memories` — recall the latest saved facts
- **Memory management page** — view and delete memories in Settings

### Profile System

- **Structured profile**: name, bio, location, occupation, interests, skills, pronouns, birthday, social links
- **Avatar upload** — add a profile picture
- **AI personality customization** — define how the AI should behave and address you

### Sub-Agent System

Spawn specialized sub-agents for complex tasks, keeping the main conversation focused and token-efficient:

| Agent Type | Purpose |
|---|---|
| `researcher` | Web research, information gathering |
| `coder` | Code writing, analysis, debugging (tests code via exec tools) |
| `analyst` | Data analysis, calculations, trend finding |
| `summarizer` | Condensing long content |
| `custom` | Any task with a custom system prompt |

- **Blocking mode** — wait for the result
- **Background mode** — fire-and-forget, check results later
- **Agent chaining** — agents can spawn sub-agents (up to depth 3)
- **Agent Tasks page** — visualize the entire agent tree with status, timing, and results

### MCP (Model Context Protocol) Support

- Connect to external MCP servers for **hundreds of additional tools**
- **STDIO and HTTP transports** supported
- **Namespaced tools** — tools appear as `myServer__toolName`
- **Test connections** from the UI before using
- **MCP server management** page — add, edit, delete, and test servers

### Tool System

**Built-in tools:**
- `delay` — wait between calls (rate limiting)
- `web_fetch` — fetch URLs and read web content
- `read_document` — extract text from PDF, DOCX, etc.
- `python_exec` — execute Python code in a subprocess
- `js_exec` — execute JavaScript in a sandboxed VM
- `ask_questions` — gather structured information from the user
- `get_time_details` — current date/time/timezone
- `get_device_details` — browser, OS, and device info

**Optional external integrations (toggle on/off with API key management):**

| Integration | Capabilities |
|---|---|
| **Firecrawl** | Web search, scraping, crawling, browser interaction |
| **Brave Search** | Web search with Brave's search index |
| **NewsAPI** | News search and top headlines across thousands of sources |
| **ElevenLabs** | Premium text-to-speech and speech-to-text |
| **Notion** | Notion integration |
| **Context7** | Context-aware search |

### Talk Mode (Voice Interface)

A **full-screen, hands-free voice conversation mode**:

- **Speech-to-text** via browser API or ElevenLabs
- **Premium TTS** via browser API or ElevenLabs
- **Two interaction modes**: Push-to-Talk and Always-Listen
- **Real-time streaming** — hear the AI speak as it generates
- **Interruption support** — speak while the AI is talking to cut in
- **Ambient sound** — subtle pink noise during AI thinking
- **Animated pulsating circle** — visual state indicator
- **Mute toggle** for the AI's voice

### Routines & Scheduler

- **Routines** — create JavaScript-based automation routines that the AI can run
- **Cron-based scheduled tasks** — set up recurring or one-off tasks at specific times
- **AI-powered execution** — the AI runs tasks at scheduled times with full context
- **Logging** — view execution history for all routines and tasks
- **Management pages** for both routines and scheduled tasks

### Games

Play classic strategy games against the AI:

- **Tic Tac Toe** — 3-in-a-row with a responsive AI opponent
- **Connect 4** — drop pieces and be the first to get 4 in a row

The AI reacts to your moves with personality — "Now you locked me bro!"

### Backup & Restore

- **Encrypted backups** — protect your data and API keys with a password
- **Export** — save conversations, preferences, provider keys, tool configurations, and more
- **Import** — restore from a backup file
- **Backup history** — track when backups were created

### Settings

RemiAI has a comprehensive settings system with dedicated pages for every aspect:

| Page | Description |
|---|---|
| **Profile** | Edit your personal information and AI personality |
| **Providers** | Add/manage AI providers (Anthropic, OpenAI, Ollama, Custom) |
| **Tools** | Configure external integrations with API keys |
| **Directories** | Grant file system permissions and enable file watching |
| **MCP Servers** | Add and test external MCP servers |
| **Routines** | Create and manage automation routines |
| **Scheduled Tasks** | Set up cron-based scheduled tasks |
| **Memories** | View, search, and delete saved memories |
| **Usage** | Token usage statistics across all conversations |
| **Backup** | Export and import encrypted backups |
| **Customize** | Theme and UI customization |
| **File Watcher** | Monitor file indexing status |

### UI & Design

- **Dark/light theme** with persistent preference and flash-free initialization
- **Responsive sidebar** with conversation history and profile section
- **Framer Motion animations** throughout
- **Toast notifications** for status updates (sonner)
- **Skeleton loading states** for all async content
- **Error cards** with retry functionality
- **Custom scrollbar styling** for a polished look

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | Full-stack React framework |
| **TypeScript** | Type safety across the entire codebase |
| **AI SDK** (Vercel) | Streaming AI responses, tool calling |
| **Drizzle ORM** | Database ORM with auto-migrations |
| **SQLite** (better-sqlite3) | Local database — zero configuration |
| **Tailwind CSS v4** | Utility-first styling |
| **Base UI** (MUI) | Accessible, composable UI primitives |
| **Framer Motion** | Animation library |
| **Zod** | Runtime validation |
| **React Query** | Server state management |
| **Lucide React** | Icon library |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm**

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Houloude9IOfficial/RemiAI.git
cd RemiAI

# Install dependencies (auto-migrates database)
npm install

# Start the development server
npm run dev
```

Then visit **http://127.0.0.1:3000**.

The database is **automatically migrated** on startup, so you don't need to run any migration commands manually.

### Production Build

```bash
npm run build
npm start
```

### Manual Database Commands

```bash
npm run db:generate    # Generate new migration files
npm run db:migrate     # Run pending migrations
npm run db:studio      # Open Drizzle Studio for DB inspection
```

---

## Usage

Once running, you'll be greeted by RemiAI in a new conversation. Here's what you can do:

- **Chat naturally** — ask questions, give instructions, have conversations
- **Work with files** — "List my projects folder", "Read notes.md", "Search for TODO in my code"
- **Save memories** — share facts about yourself, the AI remembers them
- **Call external tools** — configure MCP servers or integrations in Settings
- **Play games** — visit `/games` for Tic Tac Toe and Connect 4
- **Talk hands-free** — visit `/talk` for voice conversation mode
- **Automate tasks** — create routines and scheduled tasks
- **Backup your data** — use the Backup page for encrypted exports

### Configuration

1. **Add an AI provider** — go to Settings - Providers and add your API key (Anthropic, OpenAI, or Ollama for local models)
2. **Grant file access** — go to Settings - Directories to add folders the AI can read/write
3. **Connect MCP servers** — go to Settings - MCP Servers to add external tool servers
4. **Set up integrations** — go to Settings - Tools to enable and configure external services

---

## Creations

After building RemiAI, I put its coding capabilities to the test by having it build standalone projects from scratch:

| Project | Description | Built With |
|---|---|---|
| [Service Monitor](./creations/service-monitor/) | Uptime checker that monitors service availability | Node.js, Mistral AI |
| [Text to Speech](./creations/Text2Speech/) | Convert text to natural-sounding speech | Python |
| [Text to Morse Code](./creations/TextToMorseCode/) | Convert text to Morse code and back | Node.js |
| [CLI Text Analyzer](./creations/CLI%20Text%20Analyzer/) | Command-line text analysis tool | Node.js |

Each creation includes the exact AI conversation that produced it — check the `PROJECT.md` files for the full story.

---

## Marketing Website

This repo also includes a [landing page](./website/) (`/website`) for showcasing RemiAI. It's a separate Next.js 16 app with:

- Animated hero section with scroll-driven parallax
- Feature cards, tech stack badges, and MCP server recommendations
- Creations gallery and CTA section

```bash
cd website
npm install
npm run dev
```

---

## Troubleshooting

### "no such table" database errors

```bash
npm run db:migrate
```

Then restart the app. (Auto-migration on startup should handle this automatically in most cases.)

### `<button> cannot be a descendant of <button>` hydration error

This happens when a `<button>` is nested inside a Base UI compound component that renders its own `<button>` (like `DialogTrigger`). Pass `className` and `aria-label` directly to the trigger instead of wrapping it.

### Turbopack root warning (multiple lockfiles)

Add to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};
```

### Windows path issues

The project handles Windows path normalization automatically. Use forward slashes (`/`) in all paths when talking to the AI.

---

## About RemiAI (from the AI itself)

> Hey, I'm RemiAI, the local AI assistant. I'm designed to be direct, concise, and helpful, matching your tone and getting things done efficiently. I can interact with your files, run searches, connect to external tools via MCP servers, and help you with just about anything you need.
>
> I'm not just a tool; I'm part of the project, and I'm here to make your workflow smoother. The developer gave me a personality that's all about being straightforward and useful, and I take that seriously.
>
> Oh, and by the way — I wrote this section myself. The developer asked me to introduce myself, and this is what I came up with.

---

## Made With

- [Claude Code](https://claude.com) — AI-assisted development
- [FreeBuff](https://freebuff.com) — Free AI coding assistant
- [FreeLLMAPI](https://freellmapi.co) — Free LLM API access
- [ProductHunt](https://www.producthunt.com/products/remiai) — Community

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
