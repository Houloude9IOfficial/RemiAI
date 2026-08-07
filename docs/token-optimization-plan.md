# RemiAI — Conversation Payload & Token Optimization

**Status:** Implemented (v2.1 branch) · **Measured savings:** 80–95% of message-history tokens

---

## 1. Executive summary

Every chat request re-sent the **entire persisted conversation** to the LLM: full tool inputs
(file contents, code, HTML), full tool outputs (up to 50k chars each, base64 media, 1MB
single messages), UI-only `step-start` markers, reasoning text, and unbounded memory dumps.
A measurement of the real dev database showed **1.55M estimated tokens of history across
just the 6 largest conversations** — the direct cause of the reported 200k+ input-token
requests and the 15M-token totals on individual conversations.

This plan splits the payload into **static (cached)**, **dynamic (budget-capped)**, and
**history (optimized)** parts, and implements four concrete optimizations:

| # | Optimization | Where | Impact |
|---|---|---|---|
| 1 | Provider prompt caching (already merged) | `lib/chat/prompt-cache.ts` | Static prompt + tools billed at cache rates on every agentic step |
| 2 | History optimizer: NL tool traces, UI-part stripping, input/output caps | `lib/chat/history-optimizer.ts` | **80–95% of history tokens** |
| 3 | Rolling conversation summary | `lib/chat/summarizer.ts` + `conversations.summary*` columns | Long conversations stop growing linearly |
| 4 | Relevance-budgeted memory retrieval | `lib/chat/memories.ts` | Memory block capped at ~2k chars and ranked by relevance |
| 5 | Intent-based dynamic tool loading | `lib/chat/tool-groups.ts` | Simple chats send **11 tools (~1.1k tokens) instead of 40 (~7.2k)** |

---

## 2. Measured baseline (before)

Measured against the real SQLite database (`data/remiai.sqlite`) and the actual tool set:

| Component | Size | Est. tokens | Notes |
|---|---|---|---|
| Tool definitions (40 tools) | 24,235 chars | ~7,200 | Re-sent on **every** agentic step (4–6× per reply) |
| Static system prompt | 6,706 chars | ~1,870 | `SYSTEM_PROMPT_BASE + visual + session-files + persistence` |
| Dynamic prompt (prefs/profile/memories/changes) | varies | 500–4,000 | Memories were **all 10 latest**, file changes 5 |
| Message history (845 messages, all convs) | **11.28 MB** | ~1.5M+ | **The dominant cost** |

Pathological examples found in the DB:

- One assistant message contained **1,044,334 bytes** (17× `js_exec` + 7× `write_file` outputs).
- Four more messages were 238k–416k bytes each.
- **2,091 `step-start` parts** (pure UI markers) were persisted and re-sent.
- One conversation had a single turn with 24 `read_file` calls whose outputs were re-sent verbatim.

Why a simple "hi" burned 41k input tokens: a single reply triggers 1 + N agentic steps
(initial + each tool round), and **each step re-bills the full static payload + history**.
With 3 start-of-conversation tools that's 4 steps × ~10k tokens of static + history — before
provider caching. Provider caching fixes the static re-billing; the history optimizer fixes
the history itself.

---

## 3. Target architecture

```
                        ┌────────────────────────────────────────────────┐
                        │            REQUEST ASSEMBLY (server)           │
                        └────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌─────────────────┐        ┌────────────────────┐        ┌─────────────────────┐
│ 1. INSTRUCTIONS │        │ 2. MESSAGES        │        │ 3. TOOLS            │
│ (system)        │        │ (history)          │        │ (definitions)       │
├─────────────────┤        ├────────────────────┤        ├─────────────────────┤
│ STATIC          │        │ summary (dropped)  │        │ all enabled tools   │
│  base prompt    │◄──cached├────────────────────┤        │ with cache_control  │
│  visual/fs/etc. │        │ [earlier msgs      │        │ breakpoint on last  │
├─────────────────┤        │  → NL tool traces] │        │ tool (Anthropic)    │
│ DYNAMIC         │        ├────────────────────┤        └─────────────────────┘
│  prefs/profile  │        │ recent window      │
│  memories*      │        │  (8 turns verbatim)│
│  file changes*  │        └────────────────────┘
│  summary*       │
│  plan mode      │
└─────────────────┘        * budget-capped / regenerated
```

**Separation of concerns** — the payload now contains only what the model needs:

| Concern | Where it lives | Sent to LLM? |
|---|---|---|
| User-visible conversation | `messages` table (UI parts) | Optimized subset |
| Tool execution detail | `messages` parts (input/output) | Compacted to NL traces after 8 turns |
| Rolling summary of old turns | `conversations.summary` | Yes, injected in dynamic prompt |
| Memories | `memories` table | Only top-relevance within budget |
| Profile / preferences | `user_preferences` | Yes (small, dynamic) |
| File contents | disk (session files / directories) | Never — only references/URLs |
| UI state (`step-start`, states) | `messages` parts | **Never** (stripped) |
| Reasoning (CoT) | `messages` parts | **Never** (stripped) |

---

## 4. New conversation schema

```sql
ALTER TABLE `conversations` ADD `summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `conversations` ADD `summary_message_count` integer DEFAULT 0 NOT NULL;
```

- `summary` — compact prose recap of the earliest part of the conversation.
- `summary_message_count` — how many leading messages (by `order_index`) it covers.
  Requests drop those messages from the payload and inject the summary instead.
- The `messages` table is **unchanged**: full parts remain for the UI, edits, and
  regeneration. Only the model payload is trimmed.

The `messages` rows themselves are still the source of truth; the optimizer never mutates
them — it produces a derived, compacted copy per request.

---

## 5. Before vs after

### 5.1 File writes — content becomes a reference

**Before** (persisted, re-sent every request):

```
tool-call  session_file_write
  input:  { path: "index.html", content: "<!DOCTYPE html>…[25,000 chars of HTML]…" }
tool-result  session_file_write
  output: { ok: true, path: "index.html", url: "/api/chat/5/session-files/index.html" }
```

**After** (recent window — input compacted, output shaped):

```
tool-call  session_file_write
  input:  { path: "index.html", _contentOmitted: "[25,000 chars omitted]" }
tool-result  session_file_write
  output: [Wrote: index.html]
```

**After** (older turns — full NL trace):

```
tool-call  session_file_write → input: { path: "index.html", _contentOmitted: "[25,000 chars omitted]" }
tool-result                    → output: [Wrote: index.html]
```

> The model already wrote that content; re-sending it adds zero information. If it needs
> the file again it calls `session_file_read`/`read_file` — the file lives on disk.

### 5.2 Tool rounds — JSON blobs become traces

**Before** (per old `read_file` round, 1–50k chars):
```
assistant: [tool-call read_file { rootId: 1, relativePath: "notes.md" }]
user/tool: [tool-result { "content": "…10,000 chars of file…", "ok": true }]
```

**After** (~100 chars):
```
assistant: [tool-call read_file { rootId: 1, relativePath: "notes.md" }]
tool:      [tool-result "[Tool result compacted — {\"content\":\"…\n[+9,800 chars omitted]]"]
```

### 5.3 UI noise — dropped entirely

- `step-start` parts: dropped (2,091 occurrences in the DB).
- `reasoning` parts: dropped (the model's own prior CoT adds nothing when re-sent).

### 5.4 Memories — budget-capped & ranked

**Before:** the 10 most recent memories, always (avg 280 chars each ≈ 2.8k chars; unbounded
growth over time).

**After:** memories scored by **keyword overlap with the current request + recency**,
deduped, capped at `MEMORY_BUDGET_CHARS = 2000` chars / 12 items. `search_memories` and
`get_recent_memories` remain for on-demand recall — nothing is lost, only trimmed.

---

## 6. Measured savings (real data)

`scripts/measure-optimization.ts` applies the optimizer to the 6 largest conversations in
the dev DB (raw persisted messages → optimized model history):

| Conversation | Raw history | Optimized (keep 8) | Reduction |
|---|---|---|---|
| Landing page build (#294) | ~603k tok | ~47k tok | **92.2%** |
| C++ graphics (#130) | ~353k tok | ~81k tok | 77.1% |
| Email draft (#264) | ~170k tok | ~25k tok | 85.6% |
| Deep research (#77) | ~151k tok | ~72k tok | 52.2% |
| C++ graphics (#129) | ~146k tok | ~22k tok | 84.9% |
| C++ graphics (#128) | ~135k tok | ~22k tok | 83.6% |
| **Total (top 6)** | **~1.56M tok** | **~295k tok (keep 12)** | **81.1%** |

With `keepRecent = 8` the total is **~279k tok (−82%)**. The rolling summary adds further
compression on top once conversations pass ~30 messages (old segments collapse into a
300–600-token recap instead of compacted traces).

**Per-request "hi" estimate (Anthropic, with caching):**
before ~41k input tokens across 4 agentic steps → after: static prompt ≈1.9k + core tools
≈1.1k (cached, billed at ~0.1×), dynamic ≈ small, history ≈ 0.2k → **~95% reduction in
re-billed tokens**.

---

## 7. Context budget recommendation

| Slot | Budget | Why |
|---|---|---|
| Static system prompt | ~2k tokens | Full behavior guidance; cached via provider caching |
| Tool definitions | ~1.1–7.2k tokens | Core set on simple chats (~1.1k), full set when intent demands it; cached via provider caching (Anthropic breakpoint on last tool) |
| Dynamic prompt (prefs/profile/memories/changes/summary) | ≤2k tokens | Capped per slot (`MEMORY_BUDGET_CHARS`, 5 file changes, summary ≤600 tok) |
| Recent conversation | 8 turns verbatim | Follow-ups need the raw exchange; bounded by `RECENT_OUTPUT_MAX_CHARS` |
| Old conversation | summarized → ≤600 tokens | Continuity facts without re-billing raw bytes |
| **Total steady-state** | **~6–13k tokens/request** | Independent of conversation length; simple chats sit at the low end |

This keeps requests **flat** — the payload no longer grows linearly with conversation
length. For reference, modern models ship 100k–1M token contexts; this design keeps the
payload at ~2–5% of context while preserving quality.

---

## 8. Trade-offs (each optimization)

| Optimization | Trade-off | Mitigation |
|---|---|---|
| Prompt caching | Cached prefix must stay byte-identical; Anthropic breakpoints ≥1024 tokens apart; cache TTL 5 min | Static prompt frozen; dynamic parts placed after breakpoint; OpenAI caches automatically |
| NL tool traces (old turns) | The model can no longer re-read an old tool result from history | It can **re-run the tool**; the trace preserves tool name + args; recent 8 turns stay full |
| Input compaction (recent) | Model sees `[N chars omitted]` instead of content it just wrote | It wrote it — re-sending is pure waste; files persist on disk |
| Output cap in recent window (12k chars) | Follow-up on a giant recent result needs a re-read | 12k chars is ample for most follow-ups; re-read is one cheap tool call |
| Rolling summary | Summarization is lossy; a stale summary after regenerate may describe edited history | Summary is rebuilt every 25 new messages; regenerated content lives in the recent window; `shouldSummarize` guard |
| Memory retrieval | Rarely-relevant memories won't be injected | `search_memories`/`get_recent_memories` tools remain; dedupe avoids repeats |
| Stripping reasoning | None for same-model sessions (it already has its own CoT) | If a future flow needs CoT context, re-enable per-provider |

---

## 9. Implementation notes

### New files
- `lib/chat/history-optimizer.ts` — `optimizeMessageHistory()`, `optimizeMessageParts()`,
  `RECENT_MESSAGES_KEPT`, `RECENT_OUTPUT_MAX_CHARS`, `OLD_OUTPUT_MAX_CHARS`.
- `lib/chat/memories.ts` — `retrieveRelevantMemories()`, `MEMORY_BUDGET_CHARS`.
- `lib/chat/summarizer.ts` — `summarizeConversationBackground()`, `shouldSummarize()`,
  `SUMMARIZE_EVERY_MESSAGES`, `SUMMARIZE_RECENT_KEEP`, `SUMMARIZE_MIN_MESSAGES`.

### Modified files
- `app/api/chat/route.ts` — uses the optimizer (replaces `compactToolOutputs`), budget-capped
  memories, injects the rolling summary + drops summarized messages, triggers background
  summarization in `onFinish`, and applies dynamic tool loading.
- `lib/scheduler/index.ts` — budget-capped memories for scheduled tasks.
- `app/api/chat/start/route.ts` — budget-capped memories for the greeting context.
- `db/schema.ts` + `db/migrations/0026_conversation_summary.sql` — summary columns.
- `db/schema.ts` + `db/migrations/0027_tool_groups.sql` — dynamic tool-loading groups column.
- `db/migrations/meta/_journal.json` — registered migrations 0026 & 0027.

### Behavior preserved
- Tool-call/tool-result **pairing is preserved** (the AI SDK throws on dangling calls).
- Part shapes (`tool-${name}` + legacy `tool-invocation`) are respected.
- `convertToModelMessages` never sees mutated-shape parts.
- Background jobs are fire-and-forget and swallow errors (mirrors the title generator).

---

## 10. Future optimization ideas

1. **Client-side history trim** — `useChat` currently sends the *entire* local history in
   the POST body. The server could load history from the DB instead (it already does on page
   load), letting the client send only the recent window → saves request bandwidth too.
2. **Tool description trimming** — the 4 largest schemas (`schedule_task` 1,486 chars,
   `js_exec`/`python_exec` ~1,300, `create_visual` 1,107) embed guidance that already lives
   in `get_tool_help` topics. Halving them saves ~1.5–2k tokens/request on top of dynamic
   loading.
3. **Embedding-based memory retrieval** — replace keyword scoring with a local embedding
   model (e.g. `@xenova/transformers` or a remote API) for semantic recall.
4. **Per-tool result caching** — dedupe identical tool outputs (e.g. repeated `read_file` of
   the same file) across turns.
5. **Compact `uiMessages` in the persist pipeline** — stop storing raw outputs in `messages`
   at all; store the compacted trace + a reference, and let the UI fetch full results from
   session files. Biggest DB-size win (11.3MB → ~1MB).

---

## 11. Intent-based dynamic tool loading

### How it works

Instead of sending all ~40 tool definitions (~7.2k tokens) on every request, the chat route
registers a small **core set** and loads heavier groups on demand:

```
activeGroups = CORE ∪ classifier(latest user message)
              ∪ recency(groups used in the last 10 messages)
              ∪ stored(tool_groups from the previous request)
```

- **Classifier** — deterministic keyword/pattern scoring (no LLM call), deliberately
  generous (false positives only cost tokens; false negatives could strand the model).
- **Recency** — tool groups used in the last 10 messages stay loaded, so mid-project
  follow-ups ("make the button blue" after building a website) keep their tools.
- **Stored** — `conversations.tool_groups` persists the last request's active set in
  `onFinish` (one cheap UPDATE, no LLM call), so short replies ("yes", "do it") inherit the
  conversation's tools. It self-decays: each request overwrites the set with its own active
  groups, so a long chat-only stretch drops stale groups.
- **`load_tool_groups`** — escape hatch. The model discovers tools via `list_available_tools`
  and enables a group for the CURRENT response: the chat route re-evaluates the active tool
  set before every step (SDK `prepareStep` + `activeTools`), so a group enabled mid-stream
  becomes available to the model in the very next step — no "repeat your request" round-trip.
- A short **"Tool availability" note** is appended to the dynamic system prompt only when
  something was actually filtered out — fully-loaded conversations pay zero overhead. The
  note is rebuilt per step by `prepareStep`, so after `load_tool_groups` runs the model sees
  the group listed as loaded instead of a stale "not loaded" warning.

### Core set (always loaded, ~1.1–1.5k tokens)

context (`get_time_details`, `get_device_details`) · memory (`remember`, `get_recent_memories`,
`search_memories`) · file-index (`query_recent_changes`, `query_file_index`) · fs read basics
(`list_permitted_roots`, `read_file`) · builtins (`delay`, `web_fetch`, `ask_questions`,
`suggest_followups`, `set_run_name`, `get_tool_help`, `list_available_tools`, `load_tool_groups`).

### Conditional groups

`fs_write`, `fs_read` (listing/search/glob/media), `document_reader`, `session_files`,
`exec` (python/js), `create_visual`, `scheduling`, `todo`, `routines`, `agent`, `profile`,
`web_search`, `notion`, `context7`, `news`, `firecrawl`.

### Measured (real tool set, `scripts/measure-tools.ts`)

| Scenario | Tools | Est. tokens |
|---|---|---|
| Full set (before) | 40 | ~7,177 |
| Simple chat ("hi") | 11 | **~1,073 (−85%)** |
| "create a file and write notes" | 20 | ~3,073 |
| "build me a landing page" | 16 | ~2,219 |
| "run python + show a chart" | 14 | ~2,139 |
| "schedule reminder + research" | 15 | ~2,150 |
| "summarize the attached pdf" | 12 | ~1,356 |

### Trade-offs

| Trade-off | Mitigation |
|---|---|
| Model may need a tool that wasn't loaded | Generous classifier + recency + stored groups cover ~all real flows; `load_tool_groups` + `list_available_tools` are the escape hatch, and enabled groups take effect in the same response via per-step `prepareStep` re-evaluation |
| An unloaded tool call hard-errors the stream (AI SDK `NoSuchToolError`) | The dynamic "Tool availability" note explicitly says *only call the tools listed above*; core tools cover the start-of-conversation flow |
| Stored groups could linger after a project ends | Self-decaying: `onFinish` overwrites the stored set with the current request's groups |
| Static prompt still describes `create_visual` when unloaded | Cosmetic; the model can enable it via `load_tool_groups` |
| Scheduler keeps the full set | Intended — autonomous scheduled tasks may need any tool |
