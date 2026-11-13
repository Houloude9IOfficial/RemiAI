"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRequestDuration } from "@/lib/chat/request-duration";
import { isActiveWork, isWorkActivityPart, isWorkSummary, type WorkActivityPart, type WorkActivityState } from "@/lib/chat/work-activity";
import { describeToolActivity } from "./ToolActivity";
import { ToolActivityRow } from "./ToolActivityRow";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { extractSearchTrace } from "@/lib/chat/search-trace";

const MIN_HISTORY_DURATION_MS = 2_000;

const outcomeLabels: Partial<Record<WorkActivityState["status"], string>> = {
  continuing: "Continuing the response…",
  completed: "Response completed.",
  failed: "The request failed before completion.",
  interrupted: "The response was interrupted.",
  cancelled: "Generation was stopped.",
};

function ElapsedTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      timer = setTimeout(tick, 1000 - (Math.max(0, time - startedAt) % 1000));
    };
    tick();
    return () => clearTimeout(timer);
  }, [startedAt]);

  const elapsed = Math.max(0, now - startedAt);
  return <span className="tabular-nums">{formatRequestDuration(Math.floor(elapsed / 1000) * 1000)}</span>;
}

function WorkingLabel({ startedAt }: { startedAt: number }) {
  return (
    <>
      <span className="size-1.5 shrink-0 rounded-full bg-current motion-safe:animate-pulse" aria-hidden="true" />
      <span>Working for <ElapsedTime startedAt={startedAt} /></span>
    </>
  );
}

const headerClass = "flex min-h-8 items-center gap-2 text-sm text-muted-foreground";

export function PendingWorkActivity() {
  const [startedAt] = useState(Date.now);
  return (
    <div className={cn(headerClass, "border-b border-border/70 pb-1")} aria-label="Work activity">
      <WorkingLabel startedAt={startedAt} />
    </div>
  );
}

export function WorkActivity({
  parts,
  activity,
  streaming,
  autoExpand,
  legacyDurationMs,
}: {
  parts: UIMessage["parts"];
  activity?: WorkActivityState;
  streaming: boolean;
  autoExpand: boolean;
  legacyDurationMs?: number;
}) {
  const contentId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  const savedScrollTop = useRef(0);
  const [localStart] = useState(Date.now);
  // A saved in-flight marker can outlive its stream after a disconnect.
  const recordedStatus = activity?.status ?? (streaming ? "running" : "completed");
  const status = !streaming && isActiveWork(recordedStatus) ? "interrupted" : recordedStatus;
  const active = isActiveWork(status);
  const startedAt = activity?.startedAt ?? localStart;
  const durationMs = activity
    ? activity.endedAt != null ? Math.max(0, activity.endedAt - startedAt) : undefined
    : legacyDurationMs;
  const phase = active ? "working" : status === "completed" ? "completed" : "unsuccessful";
  const [manual, setManual] = useState<{ phase: typeof phase; open: boolean }>();
  const open = manual?.phase === phase ? manual.open : active ? autoExpand : phase === "unsuccessful";

  const entries = useMemo(() => {
    const activeAttemptIndex = parts.findLastIndex(isWorkActivityPart);
    const seenTools = new Set<string>();
    let previousAttempt: WorkActivityPart | undefined;

    type SearchGroup = { rows: ReactNode[]; id: string; results: Set<string>; completed: number; failed: number; denied: number; interrupted: number; pending: boolean };
    type FetchGroup = { id: string; label: string; rows: ReactNode[] };
    const timeline: (ReactNode | SearchGroup | FetchGroup)[] = [];
    let searchGroup: SearchGroup | undefined;
    let fetchGroup: FetchGroup | undefined;
    for (const [index, part] of parts.entries()) {
      if (isWorkActivityPart(part)) {
        searchGroup = undefined;
        fetchGroup = undefined;
        const previous = previousAttempt?.data;
        previousAttempt = part;
        // The lifecycle part occupies the beginning of its attempt. Render
        // its outcome after that attempt's tools and before the next attempt.
        if (previous?.status === "continuing") {
          timeline.push(<p key={part.id}>Continued the response.</p>);
        } else if (previous && previous.status !== "completed" && !isActiveWork(previous.status)) {
          timeline.push(<p key={part.id}>{previous.message || outcomeLabels[previous.status]}</p>);
        }
      } else if (isWorkSummary(part) && part.text.trim()) {
        fetchGroup = undefined;
        timeline.push(<p key={`summary-${index}`} className="whitespace-pre-wrap break-words">{part.text.trim()}</p>);
      } else if (isToolUIPart(part) && !seenTools.has(part.toolCallId)) {
        seenTools.add(part.toolCallId);
        const runningAttempt = active && index > activeAttemptIndex;
        const { Icon, label, name, failed, denied, running } = describeToolActivity(part, runningAttempt);
        const row = <ToolActivityRow key={`tool-${part.toolCallId}`} Icon={Icon} label={label} part={part} />;
        if (name === "web_fetch" && !running && !failed && !denied) {
          searchGroup = undefined;
          if (!fetchGroup) {
            fetchGroup = { id: part.toolCallId, label, rows: [] };
            timeline.push(fetchGroup);
          }
          fetchGroup.rows.push(row);
          continue;
        }
        fetchGroup = undefined;
        if (name === "web_search") {
          if (!searchGroup) {
            searchGroup = { rows: [], id: part.toolCallId, results: new Set(), completed: 0, failed: 0, denied: 0, interrupted: 0, pending: false };
            timeline.push(searchGroup);
          }
          searchGroup.rows.push(row);
          if (failed) searchGroup.failed++;
          else if (denied) searchGroup.denied++;
          else {
            for (const result of extractSearchTrace([part])) searchGroup.results.add(result.key);
            if (!running) searchGroup.completed++;
            else if (runningAttempt) searchGroup.pending = true;
            else searchGroup.interrupted++;
          }
          continue;
        }
        searchGroup = undefined;
        timeline.push(row);
      }
    }
    return timeline.map((entry) => {
      if (!entry || typeof entry !== "object" || !("rows" in entry)) return entry;
      if (!("results" in entry)) {
        if (entry.rows.length === 1) return entry.rows[0];
        return (
          <ToolActivityRow key={`fetch-${entry.id}`} Icon={Search} label={`${entry.label} · ${entry.rows.length} ${entry.rows.length === 1 ? "result" : "results"}`}>
            {entry.rows}
          </ToolActivityRow>
        );
      }
      const { id, results, completed, pending, failed, denied, interrupted } = entry;
      const label = results.size || completed
        ? `Searched web · ${results.size} ${results.size === 1 ? "result" : "results"}`
        : pending ? "Searching web…" : "Web search";
      const outcome = [failed && `${failed} failed`, denied && `${denied} denied`, interrupted && `${interrupted} interrupted`]
        .filter(Boolean).join(" · ");
      return (
        <ToolActivityRow key={`search-${id}`} Icon={Search} label={outcome ? `${label} · ${outcome}` : label}>
          {entry.rows}
        </ToolActivityRow>
      );
    });
  }, [parts, active]);

  const hasHistory = entries.length > 0 || phase === "unsuccessful" ||
    (durationMs != null && durationMs >= MIN_HISTORY_DURATION_MS);
  const expanded = hasHistory && open;

  useLayoutEffect(() => {
    const scroll = viewport.current;
    const inner = content.current;
    if (!expanded) {
      if (scroll?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      return;
    }
    if (!scroll || !inner) return;
    if (!followTail.current) scroll.scrollTop = savedScrollTop.current;
    if (!active) return;
    const follow = () => {
      if (followTail.current) scroll.scrollTop = scroll.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [active, expanded]);

  if (!active && !hasHistory) return null;

  const label = status === "completed" ? (durationMs == null ? "Work completed" : "Worked")
    : status === "cancelled" ? "Stopped"
    : status === "interrupted" ? "Interrupted"
    : "Failed";
  const header = active ? <WorkingLabel startedAt={startedAt} /> : (
    <span>
      {label}
      {durationMs != null && ` ${status === "completed" ? "for" : "after"} ${formatRequestDuration(durationMs)}`}
    </span>
  );

  return (
    <section aria-label="Work activity" className="not-prose min-w-0">
      <div className="border-b border-border/70 pb-1">
        {hasHistory ? (
          <button
            ref={trigger}
            type="button"
            onClick={() => setManual({ phase, open: !expanded })}
            aria-expanded={expanded}
            aria-controls={contentId}
            className={cn(headerClass, "max-w-full cursor-pointer rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring")}
          >
            {header}
            <ChevronRight className={cn("size-3.5 shrink-0 motion-safe:transition-transform", expanded && "rotate-90")} aria-hidden="true" />
          </button>
        ) : (
          <div className={headerClass}>{header}</div>
        )}
      </div>
      <AnimatedDisclosure id={contentId} open={expanded}>
        <div
          ref={viewport}
          tabIndex={expanded ? 0 : undefined}
          onScroll={(event) => {
            const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
            if (!expanded) return;
            savedScrollTop.current = scrollTop;
            followTail.current = scrollHeight - scrollTop - clientHeight <= 12;
          }}
          className="max-h-56 overflow-y-auto overscroll-contain sm:max-h-72"
        >
          <div ref={content} className="space-y-2 py-2.5 pr-2 text-sm leading-relaxed text-muted-foreground">
            {entries}
            {status === "continuing" && <p>{outcomeLabels.continuing}</p>}
            {phase === "unsuccessful" && <p>{(status === recordedStatus && activity?.message) || outcomeLabels[status]}</p>}
            {status === "completed" && entries.length === 0 && <p>{outcomeLabels.completed}</p>}
          </div>
        </div>
      </AnimatedDisclosure>
    </section>
  );
}
