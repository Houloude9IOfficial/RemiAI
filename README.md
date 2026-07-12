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
```

### Running the App
```bash
# For development
npm run dev

# For production
npm run build
npm start
```
The app will be available at `http://127.0.0.1:3000`.

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