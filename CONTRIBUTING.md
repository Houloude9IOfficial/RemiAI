# Contributing to RemiAI

Thank you for your interest in contributing to RemiAI! This document provides guidelines and instructions to help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Database](#database)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Questions & Support](#questions--support)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone. Please:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/Houloude9IOfficial/RemiAI.git
   cd RemiAI
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/Houloude9IOfficial/RemiAI.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Start the development server**:
   ```bash
   npm run dev
   ```

The app will be available at `http://127.0.0.1:3000`. The database auto-migrates on startup, so no manual setup is needed.

## Development Setup

### Environment

- **Node.js** >= 18
- **npm**
- A code editor (VS Code recommended)

### API Keys (Optional)

Some features require API keys. You can configure these through the Settings UI once the app is running, or set them up via the tool configuration page:

1. Go to **Settings -> Providers** to add an AI provider (Anthropic, OpenAI, or Ollama)
2. Go to **Settings -> Tools** to configure external integrations (Firecrawl, Brave Search, ElevenLabs, NewsAPI, etc.)
3. Go to **Settings -> Tools -> ElevenLabs** for voice features (TTS/STT)

### Running the Website (Marketing Page)

The project includes a separate marketing website in the `website/` directory:

```bash
cd website
npm install
npm run dev
```

## Project Structure

```
RemiAI/
├── app/                    # Next.js App Router (pages & API routes)
│   ├── api/                # API routes (chat, providers, tools, etc.)
│   ├── chat/               # Chat pages
│   ├── games/              # Game pages (Tic Tac Toe, Connect 4)
│   ├── settings/           # Settings pages
│   └── talk/               # Voice talk mode page
├── components/             # React components
│   ├── chat/               # Chat-related components
│   ├── games/              # Game board components
│   ├── layout/             # Layout components
│   ├── settings/           # Settings-related components
│   ├── talk/               # Talk mode components
│   └── ui/                 # Reusable UI primitives (Base UI + custom)
├── lib/                    # Application logic
│   ├── api/                # API client functions
│   ├── audio/              # Audio hooks (TTS, STT, ambient sound)
│   ├── backup/             # Backup & restore logic
│   ├── chat/               # Chat utilities (system prompt, persist, streaming)
│   ├── fs/                 # File system operations & file watcher
│   ├── games/              # Game logic
│   ├── hooks/              # Shared React hooks
│   ├── mcp/                # MCP client & tool management
│   ├── providers/          # AI provider factory & catalog
│   ├── routines/           # Routines runner
│   ├── scheduler/          # Cron scheduler
│   ├── tools/              # Tool implementations (firecrawl, exec, etc.)
│   └── validation/         # Zod schemas & API validation
├── db/                     # Database schema & migrations
│   ├── schema.ts           # Drizzle ORM schema definitions
│   ├── index.ts            # Database client & auto-migration
│   └── migrations/         # SQL migration files
├── assets/                 # Static assets (images, previews)
├── creations/              # AI-generated projects
├── data/                   # Local app data (SQLite DB) — gitignored
└── website/                # Marketing website (separate Next.js app)
```

## Development Workflow

### Branching

- **`main`** — stable, release-ready
- **`v*.*.*`** — version branches for active development
- Create **feature branches** from the relevant version branch:
  ```bash
  git checkout v1.2.0
  git checkout -b feature/my-feature
  ```

### Making Changes

1. **Keep changes focused** — each pull request should address one concern
2. **Follow existing conventions** — match the coding style, patterns, and structure of the surrounding code
3. **Add error handling** — use the existing `useErrorHandler` hook for client errors and proper try/catch for API routes
4. **Type everything** — this is a TypeScript project; avoid `any` where possible

### Code Style

- **Formatting**: handled by ESLint (config at `eslint.config.mjs`)
- **Run the linter**:
  ```bash
  npm run lint
  ```
- **Imports**: prefer named exports over default exports
- **Comments**: use JSDoc for public functions, inline comments for complex logic

## Database

This project uses **Drizzle ORM** with **SQLite** (`better-sqlite3`).

### Schema

All tables are defined in `db/schema.ts`. Key tables include:

- `conversations` — chat conversations
- `messages` — individual messages within conversations
- `providers` — AI provider configurations (API keys, base URLs)
- `providerModels` — enabled models per provider
- `directories` — permitted file system directories with permissions
- `toolConfigs` — tool settings and API keys
- `memories` — persistent facts about the user
- `userPreferences` — user profile and AI personality settings
- `agentTasks` — spawned agent task records
- `routines` / `routineLogs` — automation routines
- `scheduledTasks` — cron-based task scheduling
- `mcpServers` — MCP server configurations
- `fileIndex` — indexed file metadata
- `backupHistory` — encrypted backup records

### Migrations

- **Auto-migration**: runs on app startup (see `db/index.ts`)
- **Generate**: `npm run db:generate` after schema changes
- **Manual migration**: `npm run db:migrate`
- **Drizzle Studio**: `npm run db:studio` (interactive DB browser)

### Migration Guidelines

- Each SQL migration file must separate statements with `--> statement-breakpoint`
- Always test migrations against a backup of your data first
- The `data/` directory contains the local SQLite DB and is gitignored

## Testing

Currently, the project does not have a dedicated test suite. When contributing:

1. **Manual testing**: run `npm run dev` and verify your changes work end-to-end
2. **Type checking**: ensure TypeScript compiles without errors
3. **Linting**: `npm run lint` should pass
4. **Edge cases**: test with empty states, error states, and boundary conditions

If you add significant new functionality, consider including basic verification steps in your pull request description.

## Pull Requests

### Before Submitting

1. **Rebase on the latest version branch**:
   ```bash
   git fetch upstream
   git rebase upstream/v1.2.0
   ```
2. **Run the linter** — `npm run lint`
3. **Verify the app starts** — `npm run dev` (check for console errors)
4. **Write a clear PR description** explaining what you changed and why

### PR Checklist

- [ ] Code follows existing conventions
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (`npm run lint`)
- [ ] Database migrations are included if schema changed
- [ ] New API routes follow the existing route pattern
- [ ] New UI components follow the existing component patterns
- [ ] Error states are handled (loading, empty, error)
- [ ] PR description clearly explains the change

### What Gets Reviewed

- Code correctness and type safety
- Adherence to project conventions (file structure, naming, patterns)
- Error handling and edge cases
- UI consistency (animations, responsive behavior, theme support)
- Database migration safety

## Coding Guidelines

### React Components

- Use functional components with hooks
- Use `"use client"` for client components (most UI components)
- Leverage Base UI primitives from `components/ui/` rather than raw HTML elements
- Use Framer Motion for animations (already a dependency)
- Use `cn()` from `@/lib/utils` for conditional class names
- Support dark/light themes via Tailwind classes (no inline color styles)

### API Routes

- Use Next.js App Router route handlers (`app/api/**/route.ts`)
- Use `NextResponse` for responses
- Use Drizzle ORM for database access (not raw SQL)
- Return proper error codes (400, 404, 409, 500)
- Use `force-dynamic` for SSE endpoints

### Tools

Tools are registered in `lib/tools/catalog.ts` and implement a specific interface. When adding a new tool:

1. Add the implementation in `lib/tools/`
2. Register it in `lib/tools/catalog.ts`
3. Add configuration fields in the tool catalog definition
4. Handle API key management through the existing `toolConfigs` database pattern

### Cross-Platform

This project supports Windows and macOS. Keep these in mind:

- Normalize file paths with `path.normalize()` and convert backslashes to forward slashes
- Use `z.coerce.number()` for IDs that may come as strings from the AI
- Test on both platforms when making file system changes

## Questions & Support

- **Issues**: open a GitHub issue for bugs or feature requests
- **Discussions**: use GitHub Discussions for questions
- **Security issues**: do not open public issues — report privately via GitHub

## License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](./LICENSE)).
