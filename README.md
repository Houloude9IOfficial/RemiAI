# RemiAI

RemiAI is a **local AI assistant** designed to help you interact with your files, run searches, and connect to external tools (MCP servers). It is built with Next.js, TypeScript, and the AI SDK libraries, offering a lightweight, self‑hosted alternative to cloud‑based assistants.

## Key Features
- **Direct Conversational Interface** – concise, tone‑matched responses.
- **File System Integration** – list, read, search, and write files in permitted directories.
- **Memory Management** – persistent user‑specific facts via `remember`, `search_memories`, and `get_recent_memories`.
- **Extensible with MCP** – call external services using namespaced tools.
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

## Made with

- [Claude Code](https://claude.com/product/claude-code) (10$ Credits)
- [FreeBuff](https://freebuff.com)
- [FreeLLMAPI](https://freellmapi.co)

## License
This project is licensed under the **MIT License** – see `LICENSE` for details.