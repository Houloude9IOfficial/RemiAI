"use client";

import { useId, useState, type ComponentType, type ReactNode } from "react";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { getToolName } from "ai";
import { decodeStreamError, STREAM_ERROR_PREFIX } from "@/lib/chat/error-payload";
import { AnimatedDisclosure } from "./AnimatedDisclosure";

type ToolPart = ToolUIPart | DynamicToolUIPart;

function formatPayload(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, (key, item) =>
    /authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|private[-_]?key|system[-_]?(prompt|instructions)/i.test(key)
      ? "[redacted]"
      : item,
  2) ?? "";
  const redacted = text
    .replace(/\bBearer\s+[\w.+/=-]+/gi, "Bearer [redacted]")
    .replace(/(\b[\w-]*(?:api[-_]?key|password|secret|token|authorization)\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&;,]+)/gi, "$1[redacted]");
  return redacted.length > 8000 ? redacted.slice(0, 8000) + "\n…" : redacted;
}

export function ToolActivityRow({ Icon, label, part, children }: {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  part?: ToolPart;
  children?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const error = part?.errorText;
  const hasDetails = Boolean(children) || (part != null && (
    part.input !== undefined || part.output !== undefined || Boolean(error)
  ));
  const icon = <Icon className="size-3.5 shrink-0" aria-hidden />;
  if (!hasDetails) return <div className="flex items-center gap-2">{icon}<span>{label}</span></div>;

  return (
    <div className="min-w-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="flex max-w-full cursor-pointer items-center gap-2 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {icon}
        <span>{label}</span>
      </button>
      <AnimatedDisclosure id={id} open={open}>
        <div className="ml-2 mt-1 space-y-2 border-l border-border py-1 pl-3 text-xs">
          {part && <ToolPayload part={part} />}
          {children}
        </div>
      </AnimatedDisclosure>
    </div>
  );
}

function ToolPayload({ part }: { part: ToolPart }) {
  const error = part.errorText;
  const fields = [
    { name: "Input", value: part.input },
    { name: "Output", value: part.output },
    { name: "Error", value: error?.includes(STREAM_ERROR_PREFIX) ? decodeStreamError(error)?.message ?? "Tool execution failed." : error },
  ];
  return (
    <>
      <p className="break-all font-mono">{getToolName(part)}</p>
      {fields.map(({ name, value }) => value !== undefined && value !== "" && (
        <div key={name}>
          <p className="font-medium">{name}</p>
          <pre className="whitespace-pre-wrap break-words font-mono">{formatPayload(value)}</pre>
        </div>
      ))}
    </>
  );
}
