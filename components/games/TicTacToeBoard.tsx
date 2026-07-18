"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  createInitialState,
  makeMove,
  applyAiMove,
  getRandomMove,
  getAvailableMoves,
  type GameState,
  type Cell,
} from "@/lib/games/tic-tac-toe";
import { useTTS } from "@/lib/games/use-tts";
import { VolumeControl } from "@/components/games/VolumeControl";
import { RotateCcw, X, Circle } from "lucide-react";

interface TicTacToeBoardProps {
  className?: string;
}

export function TicTacToeBoard({ className }: TicTacToeBoardProps) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [reaction, setReaction] = useState<{ emoji: string; text: string } | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const tts = useTTS();

  // Refs to avoid stale closures
  const aiThinkingRef = useRef(false);
  const stateRef = useRef(state);
  const moveCountRef = useRef(moveCount);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { moveCountRef.current = moveCount; }, [moveCount]);

  // Track move history for the AI prompt
  const moveHistoryRef = useRef<string[]>([]);

  // ── AI move effect ───────────────────────────────────────────────
  useEffect(() => {
    if (state.currentPlayer !== "O" || state.status !== "playing" || aiThinkingRef.current) return;

    aiThinkingRef.current = true;
    setAiError(null);

    const delay = 600 + Math.random() * 400;

    const timer = setTimeout(async () => {
      try {
        const latestState = stateRef.current;
        const idx = moveCountRef.current;

        // Call the AI API for a move + reaction
        const res = await fetch("/api/games/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game: "tictactoe",
            board: latestState.board,
            currentPlayer: "O",
            status: latestState.status,
            moveHistory: moveHistoryRef.current,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "API error" }));
          // Fall back to random move
          const randomMove = getRandomMove(latestState.board);
          if (randomMove !== null) {
            const newState = applyAiMove(latestState, randomMove);
            setState(newState);
            setMoveCount(idx + 1);
            moveHistoryRef.current = [...moveHistoryRef.current, `O:${randomMove}`];
            setAiError(err.error ?? "AI move failed, used random fallback.");
          } else {
            setAiError("Could not make a move.");
          }
          aiThinkingRef.current = false;
          return;
        }

        const data = await res.json();

        if (data.error) {
          // Fall back to random move
          const randomMove = getRandomMove(latestState.board);
          if (randomMove !== null) {
            const newState = applyAiMove(latestState, randomMove);
            setState(newState);
            setMoveCount(idx + 1);
            moveHistoryRef.current = [...moveHistoryRef.current, `O:${randomMove}`];
            setAiError(data.error);
          }
          aiThinkingRef.current = false;
          return;
        }

        const aiMove = data.move as number;

        // Validate — if AI chose an occupied cell, use random fallback
        const available = getAvailableMoves(latestState.board);
        const validMove = available.includes(aiMove)
          ? aiMove
          : (getRandomMove(latestState.board) ?? aiMove);

        const newState = applyAiMove(latestState, validMove);

        // Track the move history
        moveHistoryRef.current = [...moveHistoryRef.current, `O:${validMove}`];

        // If AI sent a reaction, show + speak it
        if (data.reaction) {
          const reactionObj = { emoji: "🤖", text: data.reaction };
          setReaction(reactionObj);
          tts.speak(data.reaction, "🤖");
        }

        setState(newState);
        setMoveCount(idx + 1);
        aiThinkingRef.current = false;

        if (validMove !== aiMove) {
          setAiError("AI chose an invalid cell — used random fallback.");
        }
      } catch (err) {
        // Network error — fall back to random
        const latestState = stateRef.current;
        const randomMove = getRandomMove(latestState.board);
        if (randomMove !== null) {
          const newState = applyAiMove(latestState, randomMove);
          setState(newState);
          setMoveCount(moveCountRef.current + 1);
          moveHistoryRef.current = [...moveHistoryRef.current, `O:${randomMove}`];
          setAiError("Network error — used random move fallback.");
        }
        aiThinkingRef.current = false;
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      aiThinkingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPlayer, state.status]);

  const handleCellClick = useCallback(
    (index: number) => {
      if (state.currentPlayer !== "X" || state.status !== "playing" || aiThinkingRef.current) return;
      const newState = makeMove(state, index);
      if (newState === state) return;
      setState(newState);
      setMoveCount((c) => c + 1);
      setReaction(null);
      setAiError(null);
      // Track the human's move
      moveHistoryRef.current = [...moveHistoryRef.current, `X:${index}`];
    },
    [state],
  );

  const resetGame = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState(createInitialState());
    setReaction(null);
    setMoveCount(0);
    setAiError(null);
    aiThinkingRef.current = false;
    moveHistoryRef.current = [];
  }, []);

  const getCellSymbol = (cell: Cell) => {
    if (cell === "X")
      return <X className="h-10 w-10 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />;
    if (cell === "O")
      return <Circle className="h-10 w-10 text-rose-600 dark:text-rose-400" strokeWidth={2.5} />;
    return null;
  };

  const isAiThinking = state.currentPlayer === "O" && state.status === "playing";

  const statusText = () => {
    if (state.status === "win") {
      return state.winner === "X" ? "You won!" : "AI wins!";
    }
    if (state.status === "draw") return "It's a draw!";
    if (isAiThinking) return "AI is thinking...";
    return "Your turn (X)";
  };

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      {/* Status + controls */}
      <div className="flex items-center gap-4">
        <motion.div
          key={statusText()}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-sm font-medium px-3 py-1 rounded-full",
            state.status === "win" && state.winner === "X" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
            state.status === "win" && state.winner === "O" && "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
            state.status === "draw" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
            state.status === "playing" && "bg-muted text-muted-foreground",
          )}
        >
          {statusText()}
        </motion.div>

        <button
          type="button"
          onClick={resetGame}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <VolumeControl
          volume={tts.volume}
          isMuted={tts.isMuted}
          isSpeaking={tts.isSpeaking}
          onVolumeChange={tts.setVolume}
          onToggleMute={tts.toggleMute}
        />
      </div>

      {/* AI Error */}
      <AnimatePresence>
        {aiError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-[11px] text-muted-foreground/60 italic max-w-xs text-center"
          >
            {aiError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reaction banner */}
      <AnimatePresence mode="wait">
        {reaction && (
          <motion.div
            key={reaction.text + Date.now()}
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/10 text-sm"
          >
            <span className="text-lg">{reaction.emoji}</span>
            <span className="text-foreground/80 italic">{reaction.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded-2xl shadow-lg">
        {state.board.map((cell, index) => {
          const isWinCell = state.winLine?.includes(index);
          const isLastMove = state.lastMove === index;

          return (
            <motion.button
              key={index}
              type="button"
              whileHover={!cell && state.status === "playing" && state.currentPlayer === "X" ? { scale: 1.05 } : undefined}
              whileTap={!cell && state.status === "playing" && state.currentPlayer === "X" ? { scale: 0.95 } : undefined}
              onClick={() => handleCellClick(index)}
              disabled={!!cell || state.status !== "playing" || state.currentPlayer !== "X" || isAiThinking}
              className={cn(
                "relative flex h-20 w-20 items-center justify-center rounded-xl transition-all duration-200 sm:h-24 sm:w-24",
                "bg-background hover:bg-muted/50",
                "shadow-sm border border-border/40",
                isWinCell && "bg-emerald-50 border-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-500/50",
                isLastMove && !isWinCell && "ring-2 ring-primary/20",
                (!!cell || state.status !== "playing" || isAiThinking) && "cursor-default",
                !cell && state.status === "playing" && state.currentPlayer === "X" && "cursor-pointer hover:border-primary/30",
              )}
            >
              <AnimatePresence mode="popLayout">
                {cell && (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 180 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="flex items-center justify-center"
                  >
                    {getCellSymbol(cell)}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hover ghost for empty cells */}
              {!cell && state.status === "playing" && state.currentPlayer === "X" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.15 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <X className="h-10 w-10 text-blue-500" strokeWidth={2} />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
