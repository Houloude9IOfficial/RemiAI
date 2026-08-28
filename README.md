<div align="center">
  <img src="./assets/RemiAIv2Dark.png" alt="RemiAI Preview" style="border-radius: 15px; max-width: 100%;" />
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

Built with **Next.js 16**, **TypeScript**, **Drizzle ORM** (SQLite), and the **AI SDK**, RemiAI runs entirely on your own hardware — in the browser, as an installable PWA, or as a native desktop app.

---

## Features

### Chat System

- Conversational interface with streaming AI responses
- **Multiple AI providers**: Anthropic (Claude), OpenAI (GPT), Google (Gemini), Mistral, Groq, OpenRouter, Ollama (local models), OpenAI-compatible endpoints
- **Per-conversation model picker** — switch models mid-conversation
- **Centered composer** on new chats — a clean, focused input in the middle of the screen that smoothly expands to the full chat input
- **Auto-generated chat titles** — new conversations are named for you in the background
- **Regenerate & media previews** — re-roll AI responses and preview images/video inline, with support for streaming ranges
- **Automatic retries** — failed AI requests are retried (up to 3 attempts) before erroring out
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

### Session Files & File Manager

Every chat gets its own **sandboxed session folder** that the AI can read and write:

- **Uploads land in the session** — files attached to a chat are stored in that chat's sandbox, and the AI can access them
- **File manager** (`/files`) — a dedicated page to manage the files associated with each chat: create, edit, delete, rename, download, and organize
- **Built-in code editor** — edit text and code files with a theme-aware editor featuring syntax highlighting (JS, Python, Markdown, JSON, SQL, HTML, CSS, YAML, and more)
- **Media previews** — images, audio, and video render inline
- **Resizable panel** — the session files panel in chat can be resized to your liking
- **Chat-scoped artifacts** — presented session-file outputs are saved as versioned metadata on the originating chat and can be reopened after reload
- **Artifact listing** — inspect saved outputs at `/api/conversations/{id}/artifacts`; file content remains in the chat's session sandbox

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
- **Accent color** — personalize the UI with your own accent color

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
- `web_fetch` — fetch URLs and read web content; successful and failed fetches are recorded as sanitized chat-scoped source provenance
- `read_document` — extract text from PDF, DOCX, etc.
- `python_exec` — execute Python code in a subprocess
- `js_exec` — execute JavaScript in a sandboxed VM
- `ask_questions` — gather structured information from the user
- `get_time_details` — current date/time/timezone
- `get_device_details` — browser, OS, and device info
- `browser_open` / `browser_click` / `browser_fill` / `browser_extract` / `browser_screenshot` / `browser_interact` — native Playwright browser automation (headless Chromium; toggle in Settings > Tools > Browser Automation)

**Optional external integrations (toggle on/off with API key management):**

| Integration | Capabilities |
|---|---|
| **Firecrawl** | Web search, scraping, crawling, browser interaction |
| **Brave Search** | Web search with Brave's search index |
| **NewsAPI** | News search and top headlines across thousands of sources |
| **ElevenLabs** | Premium text-to-speech and speech-to-text |
| **Notion** | Notion integration |
| **Context7** | Context-aware search |

Research results now include a compact in-chat Sources card and durable provenance at `/api/conversations/{id}/sources`. RemiAI stores URL, title, publisher, retrieval time, content hash, extraction status, and source status without storing fetched page bodies.

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

### Desktop App (Electron)

RemiAI is available as a **native desktop app** for macOS, Windows, and Linux:

- **System tray** with minimize-to-tray behavior
- **Native OS notifications**
- **Requires manual building**
- Cross-platform installers via `npm run dist:*` (mac DMG, Windows NSIS, Linux AppImage)

### PWA & Mobile

- **Installable** as a Progressive Web App on mobile and desktop
- **Fully responsive** dashboard — works great on phones and tablets
- Mobile-friendly sticky headers and touch-optimized interactions

### Backup & Restore

- **Encrypted backups** — protect your data and API keys with a password
- **Export** — save conversations, preferences, provider keys, tool configurations, chat-scoped artifact metadata, and more
- **Import** — restore from a backup file
- **Backup history** — track when backups were created

### Settings

RemiAI has a comprehensive settings system with dedicated pages for every aspect:

| Page | Description |
|---|---|
| **Profile** | Edit your personal information and AI personality |
| **Providers** | Add/manage AI providers (Anthropic, OpenAI, Gemini, Mistral, Groq, OpenRouter, Ollama, Custom) |
| **Tools** | Configure external integrations with API keys |
| **Directories** | Grant file system permissions and enable file watching |
| **MCP Servers** | Add and test external MCP servers |
| **Routines** | Create and manage automation routines |
| **Scheduled Tasks** | Set up cron-based scheduled tasks |
| **Memories** | View, search, and delete saved memories |
| **Tasks** | Monitor spawned sub-agents and their results |
| **Usage** | Token usage statistics across all conversations |
| **Backup** | Export and import encrypted backups |
| **Customize** | Theme, accent color, and UI customization |
| **File Watcher** | Monitor file indexing status |

### UI & Design

- **Dark/light theme** with persistent preference and flash-free initialization
- **Custom accent colors** — pick a color that matches your style
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
| **CodeMirror** | In-app code editor with syntax highlighting |
| **Electron** | Cross-platform desktop app |
| **Framer Motion** | Animation library |
| **Zod** | Runtime validation |
| **React Query** | Server state management |
| **Lucide React** | Icon library |

---

## Test Runs

Beyond coding tasks, RemiAI's tool-use and file-agent behavior is benchmarked with independent, session-isolated test runs. A generator plants errors in a messy dataset, RemiAI organizes and analyzes it blind, and a separate verification pass audits the result against ground truth.

| Test | Description | Result |
|---|---|---|
| [Northfield Supply Co. Dataset](./TestRuns/Northfield%20Supply%20Co%20Dataset.md) | Messy multi-format company files (invoices, client records, meeting notes, chat logs) with planted data inconsistencies, tests file organization, cross-document reasoning, and grounded reporting | 5/5 planted errors found, 8/8 questions correct, zero fabricated claims |

Each test run file includes the exact prompts used, expected vs. actual results, and an independently verified score.

## Getting Started

### Prerequisites

- **Node.js** >= 20 (v22 recommended — see `.nvmrc`)
- **npm**
- **nvm** or **fnm** (optional) — to auto-select the Node version via `.nvmrc`

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

The database is **automatically migrated** on startup, so you don't need to run any migration commands manually. On the first run, the server prints a one-time signup code in the terminal. Enter that code in the browser to create the first account. The code is stored only as a hash and is consumed once.

Your local database, uploaded files, provider credentials, and other app data are stored under `data/`. This directory is intentionally gitignored — protect it like application data and use the encrypted Backup page before moving or resetting an installation.

### Desktop App

Build installers for your platform:

```bash
npm run dist           # current platform
npm run dist:mac       # macOS (DMG)
npm run dist:win       # Windows (NSIS installer)
npm run dist:linux     # Linux (AppImage)
```

Or run the app in development mode:

```bash
npm run dev:electron
```

### Production Build

```bash
npm run build
npm start
```

The built-in launcher keeps the web server on `127.0.0.1` by default. Set `PORT` to change the local port:

```bash
PORT=3001 npm start
```

### Docker deployment

Docker is the recommended way to run the web application on a server. The image runs Next.js in standalone production mode as a non-root user and persists application data in `/app/data`. (The image bundles headless Chromium for the Browser Automation tool — it adds roughly 350 MB to the image.)

With Docker Compose:

```bash
docker compose up --build -d
docker compose logs -f remiai
```

The included Compose file binds the app to `127.0.0.1:3000`, so place a TLS reverse proxy such as Caddy, Nginx, or Traefik in front of it for a public URL. Do not expose the container directly over plain HTTP. The first-run signup code appears in the container logs:

```bash
docker compose logs remiai
```

The named `remiai-data` volume contains the SQLite database, uploads, API keys, and account data. Back it up before upgrades or migration work:

```bash
docker compose exec remiai sh -c 'tar -czf - -C /app/data .' > remiai-data-backup.tgz
```

To stop the service without deleting data:

```bash
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the persistent volume. Review [SECURITY.md](./SECURITY.md) before enabling remote access, MCP servers, code execution, or write access to host directories.

For a direct Docker run, publish the port only on localhost and mount a persistent volume:

```bash
docker build -t remiai .
docker volume create remiai-data
docker run -d --name remiai \
  --restart unless-stopped \
  --publish 127.0.0.1:3000:3000 \
  --volume remiai-data:/app/data \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  remiai
```

The container listens on `0.0.0.0:3000` internally. TLS termination, firewall rules, DNS, and authentication at the reverse proxy remain the operator's responsibility.

#### Deploying a released image from GHCR

Every GitHub Release with a `v`-prefixed tag automatically builds the Docker image and pushes it to the GitHub Container Registry (GHCR) — your server does **not** need to build the image itself. The workflow lives in `.github/workflows/docker-release.yml` and runs on the `release: published` event only; pushes to `main` never trigger it.

Two image tags are produced per release:

- `ghcr.io/houloude9iofficial/remiai:<tag>` — pinned to the release tag
- `ghcr.io/houloude9iofficial/remiai:latest` — always points to the newest release

**To release a new version:** merge your changes to `main` via pull request, then create a GitHub Release (Releases → Draft a new release) targeting `main` with a `v`-prefixed tag. Publishing the release triggers the build and push. No version numbers are hardcoded in the docs or configs — only `package.json` needs to be updated per release, and everything else (installer names, image tags) derives from it.

**Pull the released image with Compose.** In the included `docker-compose.yml`, replace `build: .` with the image reference (keep the rest of the service definition unchanged):

```yaml
services:
  remiai:
    image: ghcr.io/houloude9iofficial/remiai:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - remiai-data:/app/data
```

Then start it (this pulls the image on first run):

```bash
docker compose up -d
docker compose logs -f remiai
```

Everything else stays the same: the first-run signup code appears in the container logs, and all app data persists in the `remiai-data` volume. To upgrade to a newer release, re-pull and recreate:

```bash
docker compose pull
docker compose up -d
```

To pin a specific version instead of `latest`, set the tag to the release tag, e.g. `image: ghcr.io/houloude9iofficial/remiai:vX.Y.Z`.

Or run the released image directly:

```bash
docker pull ghcr.io/houloude9iofficial/remiai:latest
docker volume create remiai-data
docker run -d --name remiai \
  --restart unless-stopped \
  --publish 127.0.0.1:3000:3000 \
  --volume remiai-data:/app/data \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  ghcr.io/houloude9iofficial/remiai:latest
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
- **Manage session files** — visit `/files` to manage each chat's sandboxed files with the built-in editor
- **Save memories** — share facts about yourself, the AI remembers them
- **Call external tools** — configure MCP servers or integrations in Settings
- **Play games** — visit `/games` for Tic Tac Toe and Connect 4
- **Talk hands-free** — visit `/talk` for voice conversation mode
- **Automate tasks** — create routines and scheduled tasks
- **Install as an app** — use your browser's "Install App" option, or the native desktop build
- **Backup your data** — use the Backup page for encrypted exports

### Configuration

1. **Add an AI provider** — go to Settings - Providers and add your API key (Anthropic, OpenAI, Gemini, Mistral, Groq, OpenRouter, or Ollama for local models)
2. **Grant file access** — go to Settings - Directories to add folders the AI can read/write
3. **Connect MCP servers** — go to Settings - MCP Servers to add external tool servers
4. **Set up integrations** — go to Settings - Tools to enable and configure external services

### Authentication and password recovery

RemiAI uses a single local account. Login sessions are stored server-side and delivered through an HttpOnly, SameSite cookie. Changing the password revokes all active sessions.

If you lose the password, run the reset command on the machine hosting RemiAI:

```bash
npm run auth:reset
```

For Docker Compose, run it inside the container only if the image includes the project CLI environment; otherwise use the encrypted backup/restore workflow or recreate the account from a protected data backup. Never publish the signup code, database, or Docker volume contents.

---

## Creations

After building RemiAI, I put its coding capabilities to the test by having it build standalone projects from scratch:

| Project | Description | Built With |
|---|---|---|
| [Service Monitor](./creations/service-monitor/) | Uptime checker that monitors service availability | Node.js, Mistral AI |
| [Text to Speech](./creations/Text2Speech/) | Convert text to natural-sounding speech | Python |
| [Text to Morse Code](./creations/TextToMorseCode/) | Convert text to Morse code and back | Node.js |
| [CLI Text Analyzer](./creations/CLI%20Text%20Analyzer/) | Command-line text analysis tool | Node.js |
| [Aura](./creations/Aura/) | Minimalist personal dashboard | Vite.JS |
| [Particlefield](./creations/Particlefield/) | Generative particle art playground | HTML5, Canvas |
| [Silkon Labs](./creations/SilkonLabs/) | Landing page for an AI company | NextJS, Tailwind CSS |

Demo of Silkon Labs: [Try it out](https://remiai-creations-silkonlabs.vercel.app)

Each creation includes the exact AI conversation that produced it — check the `PROJECT.md` files for the full story.

---

## Marketing Website

This repo also includes a [landing page](./website/) (`/website`) for showcasing RemiAI. It's a separate Next.js 16 app with:

- Sticky glass header and an animated hero featuring the v2 light-theme dashboard screenshot
- Tech stack badges, a tight feature grid, and a quickstart terminal with copy-to-clipboard
- Premium light design (Inter + JetBrains Mono, blue accent) matching the app's design language

```bash
cd website
npm install
npm run dev
```

---

## Troubleshooting

> **Note on dependency security:** `package.json` ships with intentional npm `overrides` that pin a few vulnerable transitive dependencies to patched versions. Keep them in place when tidying dependencies — they exist to fix known advisories without breaking the tools that depend on the affected packages.

### "no such table" database errors

```bash
npm run db:migrate
```

Then restart the app. (Auto-migration on startup should handle this automatically in most cases.)

### Native module mismatch (`better-sqlite3`)

If the build fails with a `NODE_MODULE_VERSION` mismatch error, the native `better-sqlite3` binary was compiled for a different Node.js version than the one you're currently running. Rebuild it:

```bash
npm rebuild better-sqlite3
```

If the issue persists, try a full clean rebuild:

```bash
rm -rf node_modules
npm install
```

For the Electron desktop app, use the dedicated rebuild script:

```bash
npm run rebuild:electron
```

### `<button> cannot be a descendant of <button>` hydration error

This happens when a `<button>` is nested inside a Base UI compound component that renders its own `<button>` (like `DialogTrigger`). Pass `className` and `aria-label` directly to the trigger instead of wrapping it.

### Port already in use

If port 3000 (or 3456 for Electron) is already taken:

```bash
# Kill the process on that port
lsof -ti:3000 | xargs kill -9

# Or specify a different port
PORT=3001 npm run dev
```

### Stale build cache

If you see strange build errors after updating dependencies or switching branches:

```bash
rm -rf .next
npm run build
```

### Sharp installation issues

Next.js uses `sharp` for image processing. If it fails to install or load:

```bash
# Rebuild sharp's native bindings
npm rebuild sharp

# If that doesn't work, clear sharp's cache and reinstall
rm -rf node_modules/sharp
npm install
```

On macOS, avoid installing libvips via Homebrew — it can conflict with sharp's bundled version.

### Ollama connection refused

If you're using Ollama as a local provider and get `Connection refused`:

```bash
# Check if Ollama is running
ollama serve

# Verify the endpoint
curl http://localhost:11434/api/tags
```

Ollama must be running on `http://localhost:11434` (or your configured endpoint) before starting RemiAI.

### Browser Automation tool says Chromium is not installed

The `browser_open`/`browser_*` tools need Playwright's headless Chromium:

```bash
# Download Chromium for the web/server build
npm run playwright:install
```

The **desktop app bundles Chromium automatically** in its installers (`npm run dist:*` stages it via `npm run playwright:browsers`), so no extra step is needed there. The tool also falls back to your system Chrome/Edge if the bundled browser is unavailable.

### Missing Python for `python_exec` tool

The AI's `python_exec` tool requires Python 3. Verify it's available:

```bash
python3 --version
```

If missing, install Python from [python.org](https://python.org) or via Homebrew:

```bash
brew install python
```

### Database migration conflicts

If Drizzle reports a migration conflict after pulling changes:

```bash
# Delete the stale database (your data will be lost!)
rm -f data/remiai.sqlite

# Or snapshot-export first, then re-run migrations
npm run db:migrate
```

To avoid data loss, use the **Backup** page in Settings to export an encrypted backup before resetting.

### Windows path issues

The project handles Windows path normalization automatically. Use forward slashes (`/`) in all paths when talking to the AI.

### Electron code signing errors (macOS)

When building the macOS desktop app, you may encounter code signing errors. For development builds, skip signing:

```bash
npx electron-builder --mac --config.forceCodeSigning=false
```

For distribution builds, you'll need a valid Apple Developer ID certificate. See [electron-builder's macOS docs](https://www.electron.build/code-signing).

---

## About RemiAI (from the AI itself)

> Hey, I'm RemiAI, the local AI assistant. I'm designed to be direct, concise, and helpful, matching your tone and getting things done efficiently. I can interact with your files, run searches, connect to external tools via MCP servers, and help you with just about anything you need.
>
> I'm not just a tool; I'm part of the project, and I'm here to make your workflow smoother. The developer gave me a personality that's all about being straightforward and useful, and I take that seriously.
>
> Oh, and by the way — I wrote this section myself. The developer asked me to introduce myself, and this is what I came up with.

---

## Made With

- [FreeBuff](https://freebuff.com) — Free AI coding assistant
- [Claude Code](https://claude.com) — AI-assisted development
- [ChatGPT Codex](https://openai.com/codex) — AI-assisted development
- [Venice API](https://venice.ai) — AI-assisted development
- [FreeLLMAPI](https://freellmapi.co) — Free LLM API access
- [ProductHunt](https://www.producthunt.com/products/remiai) — Community

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
