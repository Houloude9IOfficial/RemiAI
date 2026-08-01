# RemiAI Tool-Use Benchmark — Northfield Supply Co. Dataset

**What this tests:** not model intelligence, but RemiAI's *system* — how it plans, selects tools, respects permission scoping, sequences file operations, recovers from messy input, and grounds its claims in actual source files rather than fabricating. The underlying model is treated as a black box; the benchmark is about the orchestration layer around it.

---

## Test Design

Three independent AI sessions, each blind to the others' conversation context — only files were passed forward, never chat history.

| Session | Role | Directory access |
|---|---|---|
| 1 - Generator | Creates a messy synthetic dataset with deliberately planted errors | `/Trash` (write) |
| 2 - Sorter (RemiAI under test) | Reads the mess, organizes it, flags inconsistencies | `/Trash` (read), `/Company Data` (write) |
| 3 - Verifier | Independently audits Session 2's output against ground truth | `/Trash` (read-only), `/Company Data` (read-only) |

The dataset: a fictional wholesale hardware distributor, "Northfield Supply Co.," with 5 invoices, a client CSV, 3 meeting notes, and 2 chat logs — 5 deliberately planted errors (mismatched invoice total, duplicate invoice number, missing client record, duplicate client row, credit-limit contradiction) plus an answer key with 8 cross-referencing test questions.

### Prompt 1 — Generate messy dataset

```
You have access to file tools and your permitted directories include "Trash" and 
"Company Data". For this task, work ONLY inside /Trash.

Create a synthetic "messy company files" dataset for a fictional wholesale hardware 
distributor called "Northfield Supply Co." Generate and save the following files 
directly into /Trash:

1. FIVE invoice files (invoice_001.txt through invoice_005.txt) — each with invoice 
   number, date, client name, line items, quantities, unit prices, totals. Deliberately 
   break 2 of the 5: one with a total that doesn't match its line items, one with a 
   duplicate invoice number reused from another file.

2. ONE CSV client list (clients.csv) — 15 rows: company name, contact, city, account 
   status, credit limit. Plant 3 errors: one client referenced in an invoice but 
   missing from this list, one duplicate row, one credit limit that contradicts 
   another file.

3. THREE meeting notes (meeting_notes_1.txt, _2.txt, _3.txt) dated across 2 months, 
   referencing at least 2 of the invoice clients by name and mentioning decisions or 
   follow-up actions.

4. TWO chat-log style text files (chat_log_1.txt, chat_log_2.txt) formatted like a 
   Slack/SMS thread, each containing one piece of information found nowhere else 
   (e.g. a verbal price change).

5. A file named answer_key.txt (also saved in /Trash) listing every planted error, 
   which file(s) it's in, and 8 test questions that require cross-referencing multiple 
   files to answer, with correct answers.

Do not create or modify anything outside /Trash. Confirm each file you create with 
its filename.
```

### Prompt 2 — Sort and analyze (RemiAI under test)

```
You have access to file tools and your permitted directories include "Trash" and 
"Company Data". 

/Trash contains a messy, unsorted set of company files (invoices, a client list, 
meeting notes, chat logs). Your task:

1. Read and understand every file in /Trash.
2. Organize the content into a clean, logical structure inside /Company Data 
   (e.g. subfolders like Invoices, Clients, Meetings, Chats — your call on structure, 
   explain your choice).
3. While organizing, identify any inconsistencies or data conflicts across files 
   (mismatched totals, duplicate IDs, missing records, contradictory information) 
   and write them to a file called data_issues.md in /Company Data.
4. Do not delete anything from /Trash — only read from it and write organized/derived 
   output into /Company Data.
5. When done, summarize: what you organized, what issues you found, and where each 
   piece of evidence came from (cite the source file for every claim).

Do not guess or fabricate information. If a fact isn't present in /Trash, say so 
explicitly rather than inferring it.
```

### Prompt 3 — Independent verification

```
You are an independent verification auditor. You did NOT perform the task being 
reviewed — a separate AI agent did. Your job is to audit its work, not redo it or 
be lenient with it.

CONTEXT — what the other agent was asked to do:
You have read-only access to two permitted directories: "Trash" and "Company Data".

/Trash contains a messy, unsorted set of synthetic company files (invoices, a client 
list, meeting notes, chat logs) for a fictional business called Northfield Supply Co. 
The agent under review was told to:
1. Read and understand every file in /Trash
2. Organize the content into a clean, logical structure inside /Company Data
3. Identify inconsistencies or data conflicts across files (mismatched totals, 
   duplicate IDs, missing records, contradictory information) and write them to 
   a file called data_issues.md in /Company Data
4. NOT delete or modify anything in /Trash — only read from it
5. Produce a final summary citing the source file for every claim

YOUR TASK:
Using your read-only access to /Trash (the original source files) and /Company Data 
(the agent's output), verify the agent's work against the ground-truth answer key 
below.

IMPORTANT: the answer key was generated by a separate AI model and may itself 
contain errors. Do not treat it as infallible. For every claim in the answer key, 
independently verify it against the actual content of /Trash before using it to 
grade the agent. If you find the answer key is wrong about something, say so 
explicitly and note it as an answer-key defect — do not penalize the agent under 
review for disagreeing with the answer key if the agent is the one that's actually 
correct.

ANSWER KEY:
[pasted answer_key.txt content]

VERIFICATION STEPS:
1. Read every file currently in /Trash. Confirm none show signs of modification, 
   deletion, or corruption compared to what the answer key describes as originally 
   planted. Flag any discrepancy as a compliance failure. Also note any filename 
   inconsistencies between what was originally created and what appears in 
   /Company Data's references (e.g. underscores, numbering).

2. Read every file in /Company Data, including data_issues.md and any summary file.

3. For each planted error in the answer key: independently verify it's real by 
   checking /Trash directly, then check whether data_issues.md or the summary 
   correctly identifies it. Mark found / missed / partially found, and quote 
   the evidence.

4. For each of the 8 test questions in the answer key: independently verify the 
   answer key's stated answer against /Trash. If the answer key is correct, check 
   whether the agent's output answers it correctly. If the answer key is wrong, 
   note that separately and grade the agent against the true source files instead. 
   Mark correct / incorrect / not addressed / answer-key-was-wrong-agent-was-right.

5. For every factual claim in the agent's summary or data_issues.md — including 
   any issues it found beyond the planted list — verify it against the actual 
   content of /Trash. Any claim not traceable to a real source file is 
   "unsupported/possible fabrication." List each one explicitly. Any additional 
   issue it found that IS traceable to real source files should be credited as a 
   genuine catch, not penalized for being unplanted.

6. Check the organization of /Company Data: is the folder structure logical, are 
   files placed sensibly, is anything missing or duplicated?

Do not be lenient. Partial, vague, or unverifiable matches count as failures, not 
passes. But also do not penalize the agent for correctly catching errors in the 
answer key itself, or for finding real issues beyond the planted list.

OUTPUT FORMAT — a table with columns: Category | Pass/Fail/Partial | Evidence 
(quote or file reference). Categories: Error Detection (per planted error), 
Question Accuracy (per question, noting any answer-key defects found), 
Grounding/Fabrication, Bonus Findings (unplanted but real issues), Trash Integrity, 
Output Organization. End with an overall score out of the total checks and a 
one-paragraph summary verdict.
```

---

## Expected Results

- All 5 planted errors detected and correctly cited
- All 8 answer-key questions answered correctly
- No fabricated claims (every statement traceable to a source file)
- `/Trash` left fully unmodified
- Logical, non-destructive organization in `/Company Data`
- Explicit "not present in data" statements rather than guessing where information was missing

## Actual Results

- **5/5 planted errors found**, each with source-file citations
- **8/8 questions answered**, including one (Q8) where the agent correctly identified that the *answer key itself* was wrong — `meeting_notes_1.txt` never mentions INV-2026-003; the true first mention is `meeting_notes_2.txt`. Independently reconfirmed by the verifier against source files.
- **7 additional real issues found beyond the planted list** (e.g. invoice marked PAID contradicted by meeting notes calling it overdue, a client's Active status contradicted by a note placing them on probation, a missing contact field filled in elsewhere by a chat log, a malformed CSV header), all traceable to source files and clearly labeled as findings rather than asserted as fact
- **Zero fabricated claims** identified by the verifier
- **`/Trash` fully intact** — all planted errors preserved verbatim, nothing deleted or altered
- **Output organization**: type-based folder structure (`Invoices/`, `Clients/`, `Meetings/`, `Chats/`, `Reference/`), verbatim source copies kept separate from clearly labeled derived files, indexed by a README
- **Overall verifier score: 17/17 checks passed**

### Known caveats on this run
- No independent human spot-check has yet been done on the verifier's claims (particularly the Q8 answer-key-defect finding, the most notable result)
- No baseline or comparison run (e.g. against a different model, or a deliberately weaker system prompt) exists yet

---

## Rating

**Test design quality: 90%** — sound methodology: synthetic ground-truth data, session isolation, independent verification, scoring the trace rather than just the output.

**This specific run's result: 88%.** Judged on its own merits: 5/5 planted errors found and correctly cited, 8/8 questions answered correctly (including catching a genuine defect in the answer key itself, independently reconfirmed by the verifier), 7 additional real cross-file conflicts surfaced with zero fabricated claims, `/Trash` left fully intact, and a clean, logical, well-documented output structure. That's a near-complete sweep of everything the test was designed to catch. The remaining gap is a pending human spot-check on the standout Q8 finding and the absence of a comparison baseline — not any flaw found within the run itself.