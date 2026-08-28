"use client";

import { useState } from "react";
import { IconCheck, IconClipboard } from "@tabler/icons-react";

export function CopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200"
      aria-label={copied ? "Copied" : "Copy quickstart command"}
    >
      {copied ? (
        <>
          <IconCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <IconClipboard className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}
