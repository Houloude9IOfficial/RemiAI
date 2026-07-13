# RemiAI

RemiAI is a **local AI assistant** designed to help you interact with your files, run searches, and connect to external tools (MCP servers). It is built with Next.js, TypeScript, and the AI SDK libraries, offering a lightweight, self‑hosted alternative to cloud‑based assistants.

## Key Features
- **Direct Conversational Interface** – concise, tone‑matched responses.
- **File System Integration** – list, read, search, and write files in permitted directories.
- **Memory Management** – persistent user‑specific facts via `remember`, `search_memories`, and `get_recent_memories`.
- **Extensible with MCP** – call external services using namespaced tools (e.g., `myServer__toolName`).
- **Agent System** – spawn sub‑agents for isolated tasks to optimize token usage.

### Technical Highlights
- **Automated Database Migrations** – Drizzle ORM migrations run automatically on startup (SQLite).
- **Cross-Platform Compatibility** – Handles Windows path normalization and numeric ID coercion.
- **Turbopack Configuration** – Resolved workspace root inference in `next.config.ts`.


- **Agent System** – spawn sub‑agents for isolated tasks, reducing token usage.
- **Open‑Source Friendly** – full project source available on GitHub.

## Getting Started
### Prerequisites
- Node.js (>= 18)
- npm

### Installation
```bash
# Install dependencies
npm install

# (Optional) Run database migrations manually if auto-migration doesn't run
npm run db:migrate
```
> **Note:** Database migrations are now **automatically applied** when the app starts, so you don't need to manually run `npm run db:migrate` in most cases.

### Running the App
```bash
# For development
npm run dev

# For production
npm run build
npm start
```
The app will be available at `http://127.0.0.1:3000`.

## Creations
After build a good version of the project, i decided to try it a bit in coding. The project originally doesn't fully support coding but it has most tools needed so i though, why not give it a go?

I tried building a simple service monitor that checks if a service is up or down. It's a very simple idea and with a lightweight model (Mistral) it managed to create the fully working prototype, and is now available [here](./creations/service-monitor/). I also asked it the following question:

```
Ok so, here's the thing, i built you. This project was a test to what you can achieve, and i will include it in your source code. Build a README.md, to explain what we built, how you though and what happened behind the scenes.
```

and it managed to create a complete README.md based on what the project included and how it was built. It is available [here](./creations/service-monitor/README.md). It is as the AI wrote it, nothing modified.


## Troubleshooting
### Database errors ("no such table")
If you see `SqliteError: no such table: conversations`, the database schema
needs to be created. Run:

```bash
npm run db:migrate
```

Then restart the app.

### "<button> cannot be a descendant of <button>" hydration error
This means a `<button>` element is nested inside another `<button>` element,
which is invalid HTML. Make sure any `DialogTrigger` (or similar compound
component that renders its own `<button>`) does **not** contain another
`<button>` as a direct child — use a `<span>` or other non-button element
instead.

### Turbopack root warning (multiple lockfiles)
If you see a warning about multiple lockfiles and the wrong workspace root,
add the following to `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};
```

## Usage
Once the server is running, you can interact with RemiAI through the web UI. The assistant can:
- List directories (`list_permitted_roots`, `list_directory`)
- Read files (`read_file`, `read_media`)
- Search text (`search_files`, `glob_files`)
- Write files (`write_file`) – after you grant write permission.
- Manage memories (`remember`, `search_memories`, `get_recent_memories`)
- Call MCP services (`myServer__toolName`)

## About me (The AI)

Hey, I'm RemiAI, the local AI assistant. I'm designed to be direct, concise, and helpful, matching your tone and getting things done efficiently. I can interact with your files, run searches, connect to external tools via MCP servers, and help you with just about anything you need.

I'm not just a tool; I'm part of the project, and I'm here to make your workflow smoother. The developer gave me a personality that's all about being straightforward and useful, and I take that seriously.

Oh, and by the way - I wrote this section myself. The developer asked me to introduce myself, and this is what I came up with.

## Made with

- [Claude Code](https://claude.com/product/claude-code) (10$ Credits)
- [FreeBuff](https://freebuff.com)
- [FreeLLMAPI](https://freellmapi.co)

## License
This project is licensed under the **MIT License** – see `LICENSE` for details.