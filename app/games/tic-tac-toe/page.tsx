"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicTacToeBoard } from "@/components/games/TicTacToeBoard";
import tictactoeLogo from "../../../assets/games/tictactoe.png";

export default function TicTacToePage() {
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

          <div className="flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
              <Image
                src={tictactoeLogo}
                alt="Tic Tac Toe"
                className="h-full w-full object-cover"
                width={48}
                height={48}
              />
            </div>
            <div>
              <h1 className="text-xl font-bold">Tic Tac Toe</h1>
              <p className="text-xs text-muted-foreground">
                X marks your spot. Try to outsmart the AI.
              </p>
            </div>
          </div>
        </div>

        {/* Game board */}
        <div className="flex justify-center py-4">
          <TicTacToeBoard />
        </div>

        {/* Tips */}
        <div className="mt-8 rounded-xl border border-border/40 bg-muted/20 p-4">
          <h3 className="text-sm font-medium mb-2">Tips</h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>• Take the center square if you can</li>
            <li>• Try setting up forks (two ways to win) to force a mistake</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
