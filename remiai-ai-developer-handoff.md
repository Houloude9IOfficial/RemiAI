# RemiAI AI-Developer Handoff

**Purpose:** This document is the implementation handoff for the RemiAI refinement plan.  
**Primary reference:** `remiai-refinement-plan-spec.md`  
**Current repository:** RemiAI v2.2.0, Next.js 16, TypeScript, AI SDK v7, Drizzle ORM, SQLite, Tailwind v4, Base UI, Framer Motion, Electron, PWA.  
**Important product constraint:** RemiAI must remain **chat-first**. Do not build a Projects feature.

---

## 1. Mission

Improve RemiAI so a user can send a natural request in an ordinary conversation and receive a correct, grounded, complete, reusable result with minimal setup and friction.

The product should combine:

- The calm, focused interaction quality associated with Claude.
- Broad capability discoverability and multimodal workflows associated with ChatGPT.
- Strong multimodality and current-information workflows associated with Gemini.
- Directness, thinking-depth controls, and current context associated with Grok.
- Citation-first research quality associated with Perplexity.
- Repository-aware implementation loops associated with Cursor and coding agents.
- Self-hosting, extensibility, agents, MCP, skills, and local control associated with LibreChat and Open WebUI.

Do not respond by adding an unstructured list of features. Improve the path from **intent → execution → verification → result**.

---

## 2. Non-negotiable product rules

### 2.1 Chat-only workspace model

There is no Projects feature in RemiAI.

Do not add:

- A Projects page.
- A project switcher.
- A project entity/table.
- A project-creation flow.
- A second hierarchy containing projects and conversations.
- Project-scoped navigation that competes with the conversation list.

Every ordinary chat is its own durable workspace for the task at hand. The conversation may own or reference:

- Messages and run history.
- Uploaded files and session files.
- Permitted directories and file context.
- Chat instructions/personality.
- Chat-scoped memories or temporary context.
- Research sources and provenance.
- Artifacts and artifact versions.
- Agent tasks, routines, schedules, and webhook-triggered work.
- Skills, MCP servers, and enabled capabilities.
- Model and quality policy.
- Exports and backups.

If future organization is needed, use conversation search, tags, pinning, archiving, filters, or lightweight labels. Do not introduce a workspace hierarchy beyond chats.

Competitor Projects may be analyzed as a UX reference, but they are not a RemiAI feature target.

### 2.2 Preserve the current stack unless there is a demonstrated need

Prefer the existing:

- Next.js 16 App Router.
- TypeScript.
- React 19.
- AI SDK v7.
- Drizzle ORM with better-sqlite3.
- SQLite as the default local database.
- Tailwind CSS v4.
- Base UI primitives.
- Framer Motion.
- TanStack Query.
- CodeMirror.
- Electron and PWA surfaces.

A major architectural change is acceptable only when it materially improves result quality, reliability, or scale and the handoff includes migration, local-install, Electron, and backup implications.

Do not add mandatory Redis, Postgres, cloud storage, hosted telemetry, or external infrastructure for the core local installation.

### 2.3 Preserve existing user capabilities

Do not regress:

- Streaming chat.
- Provider/model selection.
- Anthropic, OpenAI, Ollama, and OpenAI-compatible providers.
- Server-side message reconstruction.
- Dynamic tool loading.
- Memory and profile behavior.
- Permitted directory access and path containment.
- Session files and file manager.
- Attachments, paste, drag/drop, and media previews.
- MCP, skills, sub-agents, routines, scheduling, webhooks, and browser automation.
- PWA and Electron behavior.
- Backup/restore and authentication.

Improve their coherence and presentation instead of replacing them casually.

### 2.4 Autonomous execution stance

The requested product direction is maximum autonomy and no routine approval prompts. Do not silently change that to an approval-heavy workflow.

Still provide reliability controls:

- Always-visible stop/cancel.
- Stop all active runs.
- Durable run status.
- Checkpoints where feasible.
- Recoverable file changes or patch records where feasible.
- External-side-effect audit entries.
- Clear partial/failure states.
- Optional user-configured silent policy limits.

These are recovery and transparency features, not a requirement to add confirmation dialogs for every action.

### 2.5 No fake completion

The assistant must not say a task is complete when required checks failed, a tool stopped early, a source was not verified, or an artifact was not actually written.

Every complex run needs:

- A goal.
- A deliverable.
- Completion criteria.
- Verification status.
- A truthful final state: completed, partially completed, failed, cancelled, or awaiting input.

---

## 3. How to work in this repository

Before editing:

1. Read `AGENTS.md`, the relevant Next.js guide under `node_modules/next/dist/docs/`, and nearby file comments.
2. Read the exact files you plan to change; do not assume the old architecture.
3. Inspect current database schema and migrations before adding fields.
4. Search for existing helpers and API conventions before creating new abstractions.
5. Keep implementation slices small enough to verify.
6. Preserve unrelated user changes and do not overwrite files broadly.
7. Do not commit, push, tag, reset, rebase, or mutate repository history.
8. Do not add dependencies when an existing library or local helper is sufficient.
9. Use forward slashes in paths returned to the AI.
10. Use `z.coerce.number()` for numeric IDs coming from models/tools.
11. Use Base UI `render`, never Radix `asChild`.
12. Separate every SQL statement in a Drizzle SQLite migration with `--> statement-breakpoint`.
13. Never run database migrations at module scope in `db/index.ts`.
14. Register every new tool in `lib/tools/catalog.ts` and `lib/chat/tool-groups.ts`.
15. Use existing error, toast, query, streaming, and file-access patterns.

When a requirement is genuinely ambiguous, ask one focused question. Otherwise make the smallest convention-compatible decision, document it, and continue.

---

## 4. Current architecture map

### Chat request and orchestration

- `app/api/chat/route.ts`
  - Validates chat deltas.
  - Reconstructs server-side conversation history.
  - Loads provider/model.
  - Builds MCP, filesystem, memory, execution, browser, media, agent, routine, schedule, session-file, and skill tools.
  - Builds system prompts.
  - Applies dynamic tool groups, history optimization, summaries, prompt caching, and streaming.
  - Persists messages and token usage.

- `app/chat/[conversationId]/page.tsx`
  - Owns conversation loading, reconnect/resume behavior, `useChat`, mode state, file panel, messages, errors, regeneration, and model changes.

- `lib/chat/history-reconstruction.ts`
  - Server source of truth for persisted messages and bounded client deltas.

- `lib/chat/history-optimizer.ts`
  - Removes UI-only parts, compacts heavy tool inputs, and limits old tool outputs.

- `lib/chat/summarizer.ts`
  - Background rolling conversation summary.

- `lib/chat/tool-groups.ts`
  - Core and conditional tool loading, intent classification, recency, persistence, and mid-stream loading.

- `lib/chat/stream-registry.ts`, `streaming-context.tsx`, `persist-interval.ts`
  - Active stream tracking, reconnect behavior, and periodic persistence.

### Chat UI

- `components/chat/ChatInput.tsx`
  - Centered/docked composer, attachments, file context, modes, code status, Bash tier, paste, drag/drop.

- `components/chat/MessageList.tsx`
  - Message rendering and active generation state.

- `components/chat/MessageBubble.tsx`
  - User/assistant output, Markdown, artifacts/visuals, tool groups, followups, copy, regenerate, and session-file presentation.

- `components/chat/ToolCallGroup.tsx`
- `components/chat/ToolCallCard.tsx`
  - Tool activity presentation.

- `components/chat/EmptyChatState.tsx`
  - New-chat experience and centered input.

- `components/chat/SessionFilesPanel.tsx`
- `components/chat/FilePickerDialog.tsx`
- `components/chat/FileAttachmentPreview.tsx`
  - Chat-scoped file interaction.

- `components/sidebar/AppSidebar.tsx`
- `components/sidebar/ConversationList.tsx`
- `components/sidebar/MobileSidebar.tsx`
  - Conversation navigation and settings entry points.

### Tools and data

- `lib/tools/catalog.ts`
  - Tool configuration and settings metadata.

- `lib/tools/agent-spawner.ts`
  - Agent task creation and chaining.

- `lib/tools/web-fetch.ts`, `lib/tools/brave-search.ts`, `lib/tools/firecrawl.ts`, `lib/research/`
  - Current web/research capabilities.

- `lib/fs/`, `lib/session-files/`, `lib/vector-store/`
  - Local file, chat sandbox, indexing, and retrieval behavior.

- `lib/providers/factory.ts`
  - Model construction.

- `db/schema.ts`
  - Conversations, messages, providers, memories, files, tools, agents, routines, scheduled tasks, webhooks, skills, backups, and auth.

---

## 5. Target architecture

## 5.1 Conversation as the only workspace primitive

Add future data relationships through `conversationId` or an equivalent existing conversation link. Do not add `projectId`.

Potential future entities:

- `artifacts` linked to a conversation and source run.
- `artifact_versions` linked to an artifact and conversation.
- `run_records` linked to a conversation.
- `run_events` linked to a run and conversation.
- `run_checkpoints` linked to a run.
- `sources` linked to a conversation and optionally a run.
- `source_claims` linked to sources and assistant output/artifacts.
- `conversation_context` only if needed; prefer extending the existing conversation row or related tables.
- `model_policies` linked directly to a conversation, if needed.

Use the existing conversation table as the natural anchor. Keep the conversation list as the primary navigation.

## 5.2 Task contract

For complex requests, derive a structured contract:

```text
Goal
Deliverable
Inputs
Constraints
Authorized resources
Completion criteria
Verification method
Quality policy
Open questions
```

Do not necessarily display this for a simple greeting. For Research, Build, Analyze, or Automate behavior, show a concise human-readable version in the conversation.

The contract should be serializable and associated with the conversation/run, not with a project.

## 5.3 Run lifecycle

Represent substantial work as a durable run:

```text
queued
planning
executing
verifying
repairing
waiting
completed
partially_completed
failed
cancelled
```

A run should have:

- Conversation ID.
- User request/message ID.
- Human-readable intent.
- Current phase.
- Started/updated/completed timestamps.
- Model/provider calls.
- Tool events.
- Token/cost estimates where available.
- Artifacts.
- Sources.
- Verification results.
- Error/recovery information.

The existing active stream registry may continue to handle live transport state, while durable run records handle restart, history, background work, and UI inspection.

## 5.4 Planner/executor/verifier

Use this sequence for complex tasks:

1. Interpret request and choose an adaptive mode.
2. Determine required capabilities.
3. Create a minimal task contract.
4. Execute model/tool steps.
5. Observe results and failures.
6. Verify using deterministic checks where possible.
7. Repair or escalate if needed.
8. Package the result/artifact with evidence.

Prefer deterministic verification:

- File exists/readability.
- JSON/schema validity.
- Typecheck/build/tests.
- URL/source resolution.
- Required report sections.
- Reproducible data calculations.
- Scheduled task persistence and next execution.
- Output containment inside the permitted root or chat session sandbox.

## 5.5 Adaptive modes inside normal chats

Modes are presentation and execution policies, not separate applications or routes:

- **Chat:** direct answer, minimal overhead.
- **Research:** web/local sources, citations, source graph, report output.
- **Build:** file changes, diffs, commands, tests, preview, acceptance checks.
- **Analyze:** documents/data/media, computation, charts, reproducible output.
- **Automate:** recurring task, background run, schedule, notifications, recovery.

The user can choose a mode in the composer or RemiAI can suggest one. The conversation remains the same before, during, and after mode changes.

## 5.6 Unified artifacts

Artifacts are outputs attached to the originating conversation/run:

- Markdown/rich documents.
- Code and file changes.
- HTML previews.
- Charts/dashboards.
- Research reports.
- Data tables/notebooks.
- Images/audio/video derivatives.
- PDF/JSON/CSV/ZIP/SVG exports.

Each artifact needs:

- Conversation ID.
- Source run ID.
- Title/type.
- Preview/source.
- Version information.
- Provenance/inputs.
- Export/download.
- Continue/edit action.
- Complete/partial/failed status.

Do not create a global artifact workspace that competes with chats. Artifacts may be searchable globally later, but opening one should return the user to its conversation.

---

## 6. Implementation phases

Do not attempt to implement every phase in one pass. Complete a phase, run its gate, report results, and then continue.

## Phase 0 — Baseline and instrumentation

### Objective

Measure the existing product before changing core behavior.

### Tasks

- Define a run/trace identifier that can flow through chat requests, model calls, tools, retries, persistence, and background work.
- Measure:
  - Request validation time.
  - Conversation reconstruction time.
  - Database query count/duration.
  - Prompt assembly time.
  - Active tool names and estimated definition size.
  - Time to first token.
  - Tool execution durations.
  - Agent/model step count.
  - Retries and provider errors.
  - Input/output tokens.
  - Final run state.
- Add local-first redaction and retention behavior for traces.
- Create a repeatable benchmark record format under `TestRuns/` or a suitable existing evaluation location.
- Baseline at least:
  - Greeting.
  - Short Q&A.
  - Long conversation.
  - File task.
  - Tool-heavy task.
  - Interrupted stream.

### Likely files

- `app/api/chat/route.ts`
- `lib/chat/stream-registry.ts`
- `lib/chat/persist-interval.ts`
- `lib/providers/factory.ts`
- Existing evaluation/test locations.
- Possibly a new focused observability module under `lib/observability/`.

### Acceptance criteria

- A trace can explain where time/tokens were spent.
- Simple chat does not load irrelevant heavy tools.
- Tracing does not block or materially delay the stream.
- Sensitive message/file contents are not logged by default.
- `npm test`, `npm run build`, and `npm run build:electron` remain valid.

## Phase 1 — Calm adaptive chat foundation

### Objective

Make current capability breadth easier to use while staying entirely conversation-first.

### Tasks

- Keep the sidebar centered on new chat, conversation search/list, chat-scoped files/artifacts/runs, and settings.
- Do not add Projects navigation or a project creation path.
- Improve empty-chat suggestions so they describe outcomes:
  - Research a question.
  - Analyze a file.
  - Build or fix code.
  - Create a document/chart.
  - Schedule an operation.
- Add contextual setup prompts only when a missing provider, directory, integration, or browser capability is needed.
- Add concise mode and quality policy controls to the composer.
- Improve message activity grouping by intent/phase rather than raw tool name.
- Add readable run status, stop, continue, retry, and partial-result states.
- Preserve raw tool details behind expansion for debugging/power users.
- Review keyboard navigation, mobile drawers, reduced motion, focus, and screen-reader labels.

### Likely files

- `components/chat/ChatInput.tsx`
- `components/chat/EmptyChatState.tsx`
- `components/chat/MessageList.tsx`
- `components/chat/MessageBubble.tsx`
- `components/chat/ToolCallGroup.tsx`
- `components/chat/ToolCallCard.tsx`
- `components/sidebar/AppSidebar.tsx`
- `components/sidebar/ConversationList.tsx`
- `components/sidebar/MobileSidebar.tsx`
- `app/globals.css`
- Relevant settings components.

### Acceptance criteria

- A new user can send a first message without navigating through the settings tree.
- No new Projects terminology appears in RemiAI navigation or empty states.
- A complex run has a clear intent, work status, result, and recovery action.
- Raw tool calls remain available but do not dominate the default UI.
- Desktop and mobile remain usable.

## Phase 2 — Chat-scoped artifacts and context

### Objective

Make outputs durable and reusable without introducing Projects.

### Tasks

- Add artifact records linked to conversations and runs.
- Attach artifacts to the originating conversation.
- Add preview, source/edit, version, download/export, and continue actions.
- Unify visual cards, session-file presentations, document outputs, charts, and generated files around artifact metadata.
- Add a conversation context inspector showing:
  - Attachments.
  - Session files.
  - Permitted directories used.
  - Memories used.
  - Tools/integrations used.
  - Models used.
  - Sources used.
- Add conversation export/import of chat-scoped artifacts and provenance where practical.
- Keep the existing `/files` and session panel relationships understandable; opening an artifact should preserve a route back to its conversation.

### Likely files

- `db/schema.ts`
- `db/migrations/`
- `components/chat/VisualCard.tsx`
- `components/chat/SessionFilesPresentCard.tsx`
- `components/chat/SessionFilesPanel.tsx`
- `components/chat/MessageBubble.tsx`
- `lib/session-files/`
- `lib/backup/`
- Relevant conversation APIs.

### Acceptance criteria

- A user can create an output in a normal chat, reopen the conversation later, preview it, edit/continue it, and export it.
- No project table, project route, or project switcher is introduced.
- Artifact records survive reload and backup/restore tests.
- Failed/partial artifacts are labeled truthfully.

## Phase 3 — Research-to-report

### Objective

Make RemiAI better than general chatbots at grounded local-plus-web research.

### Tasks

- Add a Research mode inside normal chats.
- Create source/provenance records linked to the conversation/run.
- Store URL, title, publisher, retrieval time, content hash, extraction status, and source status.
- Link claims or report sections to supporting sources where practical.
- Show freshness, weak support, duplication, and disagreement states.
- Combine local files and web sources in one evidence view.
- Produce a cited report artifact in the conversation.
- Support Markdown/PDF/HTML export while retaining citations.

### Likely files

- `lib/tools/web-fetch.ts`
- Search integrations under `lib/tools/`
- `lib/research/`
- `app/api/chat/route.ts`
- `db/schema.ts` and migrations.
- Research/result UI components.

### Acceptance criteria

- Research tasks expose sources as part of the answer.
- A reviewer can identify which sources support important claims.
- Unsupported or disputed claims are not presented as verified facts.
- A report can be exported and reopened from the original conversation.
- Search failures and inaccessible pages produce clear partial states.

## Phase 4 — Idea-to-working-product

### Objective

Make normal chat capable of completing software work, not merely generating code blocks.

### Tasks

- Add Build mode inside the current conversation.
- Add task contract and definition-of-done display.
- Add file-change ledger and diff presentation.
- Use permitted directories for persistent code and session files for temporary chat deliverables.
- Run typecheck/build/tests where appropriate.
- Add preview/check steps for web outputs.
- Add repair loop after failed tests/builds.
- Add checkpoint/recovery behavior for interrupted runs.
- Produce a final changed-file and verification summary as a chat artifact/result.

### Likely files

- `app/api/chat/route.ts`
- `lib/tools/exec.ts`
- `lib/tools/exec-sandbox.ts`
- `lib/fs/tools.ts`
- `lib/fs/access.ts`
- `lib/session-files/`
- `components/chat/MessageBubble.tsx`
- `components/chat/ToolCallGroup.tsx`
- `components/files/FileEditor.tsx`
- New diff/result components only if existing components cannot support it.

### Acceptance criteria

- Build tasks show files changed, commands/tests run, and verification status.
- The assistant does not claim success when checks fail.
- Existing files use edit/diff-style operations where supported instead of unnecessary whole-file rewrites.
- Paths are contained, normalized, and displayed with forward slashes.
- A failed run can be continued or clearly restarted.

## Phase 5 — Provider-neutral result quality

### Objective

Improve result quality regardless of which configured provider is selected.

### Tasks

- Add provider/model capability metadata.
- Add per-conversation quality policy:
  - Fast.
  - Balanced.
  - Quality first.
  - User-selected model.
- Add complexity estimation using deterministic signals first.
- Add adaptive escalation only when expected quality benefit justifies cost/latency.
- Add optional parallel model answers and judge/verifier behavior for high-value tasks.
- Record model strategy in the run trace.
- Allow users to inspect, override, or disable routing.

### Likely files

- `lib/providers/factory.ts`
- Provider API/configuration modules.
- `app/api/chat/route.ts`
- New focused routing/policy modules under `lib/providers/` or `lib/chat/`.
- Provider/model settings UI.

### Acceptance criteria

- Quality routing improves benchmark completion/correctness.
- Simple requests do not incur unnecessary extra calls.
- Provider failures degrade gracefully.
- Users retain control of provider/model selection.
- The run explains the selected strategy without exposing private chain-of-thought.

## Phase 6 — Continuous personal agent in chats

### Objective

Make routines, background agents, scheduled tasks, and webhooks feel like durable extensions of ordinary conversations.

### Tasks

- Unify background runs around conversation-linked durable records.
- Add checkpoints, retries, failure recovery, and run history.
- Link every result/artifact back to the originating conversation.
- Add queue/steer behavior where compatible with current streaming architecture.
- Add desktop/mobile notifications.
- Add stop-all and emergency recovery controls.
- Keep the conversation list as the place to find the work.

### Likely files

- `lib/tools/agent-spawner.ts`
- `lib/scheduler/`
- `lib/routines/`
- `lib/webhooks/`
- `components/settings/ScheduledTaskList.tsx`
- `components/settings/RoutineList.tsx`
- `components/settings/WebhookList.tsx`
- `app/api/`
- `db/schema.ts` and migrations.

### Acceptance criteria

- A scheduled/background task can be found through its originating conversation.
- Every run has a durable result state.
- Failed background work is visible and recoverable.
- No separate project/workspace destination is required.

## Phase 7 — Optional platform expansion

### Objective

Support teams and remote access without harming local single-user simplicity.

### Tasks

- Add optional remote/device pairing.
- Add multi-user accounts and conversation-level permissions.
- Add shared chat links where appropriate.
- Add storage/queue adapters only as optional deployment capabilities.
- Add plugin/skill capability manifests.
- Add operations documentation.

### Acceptance criteria

- Local SQLite operation remains the default simple install.
- Conversation permissions are explicit.
- Web, PWA, and Electron behavior remains coherent.
- No project hierarchy is introduced as a prerequisite for teams.

---

## 7. UI requirements

### 7.1 Composer

The composer is the primary capability launcher.

It should support:

- Text and multimodal attachments.
- Directory/file context.
- Mode selection with plain-language descriptions.
- Quality policy.
- Optional model selection.
- Context summary for the current chat.
- Stop/send/continue/queue states that never conflict.

Do not expose every tool as a permanent chip. Use progressive disclosure.

### 7.2 Normal chat result hierarchy

For complex assistant turns, render:

1. Intent.
2. Optional plan.
3. Compact work phases.
4. Final result.
5. Evidence/sources/files/tests.
6. Contextual next actions.

Raw tool calls are expandable, not the primary output.

### 7.3 Conversation navigation

The sidebar should prioritize:

- New chat.
- Search.
- Recent chats.
- Chat-scoped artifacts/runs.
- Files.
- Tasks.
- Settings/profile.

Do not add “Projects,” “project switcher,” or project creation.

### 7.4 Mobile

Prioritize composer, conversation continuity, run status, stop/continue, artifact viewing, and chat file drawers.

### 7.5 Accessibility

Every changed surface must include:

- Keyboard operation.
- Visible focus.
- Screen-reader labels.
- Reduced-motion support.
- Adequate contrast in light/dark/custom accent themes.
- Mobile touch targets.

---

## 8. Data and migration rules

Before schema changes:

1. Inspect `db/schema.ts` and current migration sequence.
2. Decide whether the data truly needs a new table or can use the existing conversation/message/session-file records.
3. Prefer `conversationId` links. Never add `projectId` for this plan.
4. Generate a migration through the repository's Drizzle workflow.
5. Ensure each SQL statement is separated by `--> statement-breakpoint`.
6. Test fresh database migration and upgrade migration.
7. Confirm encrypted backup export/import covers the new data.
8. Do not write to the real database during build/module import.

Likely chat-scoped schema additions may include artifacts, artifact versions, source records, run records, run events, and checkpoints. Do not add all of them preemptively. Add the smallest schema needed for the current vertical slice.

---

## 9. Testing requirements

### Existing required checks

Run the relevant checks after each implementation slice:

```bash
npm test
npm run build
npm run build:electron
npm run lint
```

`npm run lint` has a pre-existing baseline. Report new errors in changed files separately from unrelated baseline errors.

### Required automated coverage

Add focused tests for:

- Conversation-scoped artifact ownership.
- Run state transitions.
- Partial/failure completion.
- Provider retry and fallback behavior.
- Source/provenance association.
- Claim/source support behavior.
- File/path containment and forward-slash normalization.
- Conversation export/import.
- Chat reload/reconnect after a run.
- No duplicate messages on retry/regeneration.
- Dynamic tool loading and tool registration.
- Schema migration behavior.

### Manual UI checks

For each changed UI surface, test:

- New empty chat.
- Chat with no provider configured.
- Chat with attachments loading/failed/ready.
- Streaming response.
- Tool-heavy response.
- Error and retry.
- Stop/cancel.
- Continue/resume.
- Regenerate.
- Long conversation.
- Light/dark theme.
- Mobile layout.
- Keyboard navigation.
- Reduced motion.
- PWA and Electron where relevant.

### Workflow acceptance checks

At minimum, verify:

1. Research request → sources → cited result/artifact inside one chat.
2. Build request → file changes → tests/preview → honest completion inside one chat.
3. Analyze request → file/media processing → reproducible result inside one chat.
4. Automation request → scheduled/background run → result linked back to one chat.

---

## 10. Performance requirements

Instrument and compare before/after:

- Time to first token.
- Time to final result.
- Prompt assembly duration.
- Tool-definition count and estimated size.
- Input/output tokens.
- Model step count.
- Tool duration.
- Retry count.
- Database work.
- Memory/file processing cost.
- UI render/scroll behavior.

Required behavior:

- Greetings do not load irrelevant heavy tools.
- Long chats do not resend unnecessary heavy payloads.
- Background title/summary work does not block visible response.
- Failed requests do not duplicate messages.
- More verification must improve result quality enough to justify its cost.
- Local operation remains viable on modest hardware.

Do not claim a performance improvement without a before/after trace or benchmark.

---

## 11. Security and reliability requirements

Even with maximum autonomy:

- Preserve permitted-directory path containment.
- Preserve independent read/write permissions.
- Normalize Windows paths to forward slashes in model-visible output.
- Keep browser automation and external integrations explicit in run history.
- Redact secrets from traces and UI.
- Preserve encrypted backup guarantees.
- Provide stop/cancel and stop-all behavior.
- Make irreversible or external outcomes visible after the fact.
- Never weaken authentication or local binding while optimizing UX.
- Treat Bash full mode, MCP, routines, webhooks, browser automation, and external APIs as high-impact capabilities.

Do not add hidden network calls or telemetry to the local product.

---

## 12. Documentation requirements

Update user-facing documentation for every released slice. Documentation should be task-oriented:

- Start chatting.
- Attach files.
- Give a chat access to directories.
- Research with citations.
- Build from a conversation.
- Analyze data/media.
- Create an artifact in chat.
- Schedule a task from chat.
- Resume or recover a run.
- Export and back up a conversation.
- Understand local privacy and autonomy.

Do not document Projects as a RemiAI feature. If competitor Projects are mentioned, clearly label them as competitor context only.

---

## 13. Required implementation report after each phase

The AI developer must report:

```markdown
## Phase report

### Goal

### Files changed

### Data/migration changes

### User-visible behavior

### Tests run

### Build/lint status

### Performance comparison

### Known limitations

### Follow-up work

### Chat-only compliance
- [ ] No Projects route/page/entity/switcher added
- [ ] New data is linked to conversations/runs
- [ ] Artifacts remain discoverable from their originating chat
- [ ] No second workspace hierarchy introduced
```

Do not move to the next phase if the current phase has failing acceptance criteria unless the user explicitly accepts the limitation.

---

## 14. Copy/paste delegation prompt

Use the following prompt when sending this plan to an AI developer:

> You are implementing the RemiAI refinement plan in this repository. Read `AGENTS.md`, `remiai-refinement-plan-spec.md`, and this handoff before making changes. Work in small vertical phases, beginning with the current phase only. Inspect the existing code and conventions before editing. Preserve existing behavior, local SQLite simplicity, PWA/Electron parity, authentication, file permissions, backup behavior, and dynamic tool registration.
>
> **Critical product constraint:** RemiAI is chat-first. Do not build a Projects feature. Do not add a project page, project switcher, project entity, project creation flow, `projectId`, or a second workspace hierarchy. Every artifact, file, source, memory, run, mode, automation, and export must remain attached to an ordinary conversation or its run. Use conversation search/tags/filters if organization is needed.
>
> Optimize for the user’s final result: understand intent, execute reliably, verify completion, present evidence, and produce a reusable result. Do not claim completion when checks fail. Maximum autonomy is desired, so avoid routine approval prompts, but provide stop/cancel, stop-all, checkpoint, recovery, audit, and truthful partial-result behavior.
>
> Use existing libraries and patterns. Do not add dependencies without justification. Respect Base UI `render` instead of `asChild`, Drizzle migration breakpoints, startup migration rules, Windows path normalization, numeric ID coercion, and the requirement to register new tools in both the catalog and dynamic tool groups.
>
> Before implementation, state:
>
> 1. The exact phase and acceptance criteria being implemented.
> 2. The files you expect to touch and why.
> 3. Any schema/migration impact.
> 4. How chat-only behavior is preserved.
> 5. How the change will be tested.
>
> Implement only the agreed phase. Run the relevant tests/build/type checks. Report changed files, behavior, tests, failures, performance impact, limitations, and chat-only compliance. Never commit, push, tag, reset, or rebase.

---

## 15. Definition of done

The refinement is successful when a user can stay in ordinary chats and:

1. Ask a natural question or request.
2. Attach or reference local files when needed.
3. Switch or receive a suitable mode without leaving the conversation.
4. Watch meaningful progress rather than raw tool noise.
5. Let RemiAI use configured models and tools autonomously.
6. Receive citations/evidence when research is involved.
7. Receive diffs/tests/previews when building is involved.
8. Receive reproducible calculations/artifacts when analyzing is involved.
9. Schedule or resume automation from the same conversation.
10. Reopen, inspect, continue, export, or back up the work from the chat.
11. Understand failures and recover without losing context.
12. Never need a Projects feature to organize or complete the work.

The winning metric is not feature count. It is the percentage of real conversation requests that become correct, grounded, complete, and reusable results.
