"use client";

import { Connect4Board } from "@/components/games/Connect4Board";
import { ArrowLeft, ArrowUpFromDot } from "lucide-react";
import Link from "next/link";

export default function Connect4Page() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 py-8">
        {/* Back + header */}
        <div className="mb-6">
          <Link
            href="/games"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to games
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <ArrowUpFromDot className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Connect 4</h1>
              <p className="text-xs text-muted-foreground">
                Drop your red pieces. First to 4 in a row wins.
              </p>
            </div>
          </div>
        </div>

        {/* Game board */}
        <div className="flex justify-center py-4">
          <Connect4Board />
        </div>

        {/* Tips */}
        <div className="mt-8 rounded-xl border border-border/40 bg-muted/20 p-4">
          <h3 className="text-sm font-medium mb-2">Tips</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• The center column gives you the most control</li>
            <li>• Watch for the AI setting up multiple threats</li>
            <li>• Sometimes blocking isn&apos;t enough, you need to build your own attack</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
