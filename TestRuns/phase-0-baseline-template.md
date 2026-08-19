# RemiAI Phase 0 Baseline Record

Use this template for before/after measurements. Keep one copy per run or append a dated section. The application writes redacted runtime traces to the local data directory under `data/traces/` (or the configured `REMI_DATA_DIR/traces/`). No message text, file contents, prompt text, URLs, paths, or secrets should be copied into a benchmark record.

## Run metadata

- Date/time:
- RemiAI version/commit:
- Node.js version:
- Platform:
- Provider kind:
- Model:
- Network/local-model conditions:
- Trace IDs:
- Notes:

## Scenario matrix

Run each scenario at least three times where practical and report median plus range.

| Scenario | Request shape | Tool groups expected | TTFT (ms) | Final result (ms) | Input tokens | Output tokens | Provider calls | Model steps | Tool calls | DB queries | Retries/errors | Final state |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Greeting | Open a new chat | Core only | | | | | | | | | | |
| Short Q&A | One factual follow-up | Core/current-info as needed | | | | | | | | | | |
| Long conversation | Follow up after 20+ messages | Core + recent groups | | | | | | | | | | |
| File task | Read/analyze a permitted file | Files/document tools | | | | | | | | | | |
| Tool-heavy task | Multi-step local task | Classified groups | | | | | | | | | | |
| Interrupted stream | Cancel/reconnect or provider interruption | Same as task | | | | | | | | | | |

## Trace review checklist

- [ ] Trace records are present locally and use the expected date partition.
- [ ] Trace IDs correlate request, model, tool, persistence, and background events.
- [ ] Tool names and counts are visible without tool arguments or outputs.
- [ ] Model/provider calls include timing and usage where available.
- [ ] Time to first output is present for streaming calls when the provider reports it.
- [ ] Database query count/duration covers the major orchestration and persistence queries.
- [ ] Provider errors/retry budget and final state are visible.
- [ ] No user text, file contents, prompts, URLs, paths, headers, or secrets appear.
- [ ] Retention behavior removes records older than the configured local retention window.

## Interpretation

Describe changes using measured traces only. Do not claim a performance improvement unless the same scenario, provider/model, machine conditions, and workload were compared before and after.

- Baseline conclusion:
- Regression risks:
- Follow-up instrumentation gaps:
