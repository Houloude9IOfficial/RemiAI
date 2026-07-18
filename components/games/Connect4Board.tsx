"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  createInitialState,
  makeMove,
  applyAiMove,
  getRandomMove,
  getAvailableColumns,
  ROWS,
  COLS,
  type GameState,
  type Player,
} from "@/lib/games/connect-4";
import { RotateCcw, Circle } from "lucide-react";

interface Connect4BoardProps {
  className?: string;
}

export function Connect4Board({ className }: Connect4BoardProps) {
  const [state, setState] = useState<GameState>(createInitialState);
  const [moveCount, setMoveCount] = useState(0);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Refs to avoid stale closures
  const aiThinkingRef = useRef(false);
  const stateRef = useRef(state);
  const moveCountRef = useRef(moveCount);
  const boardRef = useRef<HTMLDivElement>(null);
  const moveHistoryRef = useRef<string[]>([]);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { moveCountRef.current = moveCount; }, [moveCount]);

  // ── AI move effect ───────────────────────────────────────────────
  useEffect(() => {
    if (state.currentPlayer !== 2 || state.status !== "playing" || aiThinkingRef.current) return;

    aiThinkingRef.current = true;
    setAiError(null);

    const delay = 800 + Math.random() * 500;

    const timer = setTimeout(async () => {
      try {
        const latestState = stateRef.current;
        const idx = moveCountRef.current;

        const res = await fetch("/api/games/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game: "connect4",
            board: latestState.board,
            currentPlayer: 2,
            status: latestState.status,
            moveHistory: moveHistoryRef.current,
            lastMove: latestState.lastMove,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "API error" }));
          const randomCol = getRandomMove(latestState.board);
          if (randomCol !== null) {
            const newState = applyAiMove(latestState, randomCol);
            setState(newState);
            setMoveCount(idx + 1);
            moveHistoryRef.current = [...moveHistoryRef.current, `Y:${randomCol}`];
            setAiError(err.error ?? "AI move failed, used random fallback.");
          } else {
            setAiError("Could not make a move.");
          }
          aiThinkingRef.current = false;
          return;
        }

        const data = await res.json();

        if (data.error) {
          const randomCol = getRandomMove(latestState.board);
          if (randomCol !== null) {
            const newState = applyAiMove(latestState, randomCol);
            setState(newState);
            setMoveCount(idx + 1);
            moveHistoryRef.current = [...moveHistoryRef.current, `Y:${randomCol}`];
            setAiError(data.error);
          }
          aiThinkingRef.current = false;
          return;
        }

        const aiCol = data.move as number;
        const available = getAvailableColumns(latestState.board);
        const validCol = available.includes(aiCol)
          ? aiCol
          : (getRandomMove(latestState.board) ?? aiCol);

        const newState = applyAiMove(latestState, validCol);
        moveHistoryRef.current = [...moveHistoryRef.current, `Y:${validCol}`];

        setState(newState);
        setMoveCount(idx + 1);
        aiThinkingRef.current = false;

        if (validCol !== aiCol) {
          setAiError("AI chose a full column — used random fallback.");
        }
      } catch (err) {
        const latestState = stateRef.current;
        const randomCol = getRandomMove(latestState.board);
        if (randomCol !== null) {
          const newState = applyAiMove(latestState, randomCol);
          setState(newState);
          setMoveCount(moveCountRef.current + 1);
          moveHistoryRef.current = [...moveHistoryRef.current, `Y:${randomCol}`];
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

  const handleColumnClick = useCallback(
    (col: number) => {
      if (state.currentPlayer !== 1 || state.status !== "playing" || aiThinkingRef.current) return;
      const newState = makeMove(state, col);
      if (newState === state) return;
      setState(newState);
      setMoveCount((c) => c + 1);
      setAiError(null);
      moveHistoryRef.current = [...moveHistoryRef.current, `R:${col}`];
    },
    [state],
  );

  const resetGame = useCallback(() => {
    setState(createInitialState());
    setMoveCount(0);
    setAiError(null);
    aiThinkingRef.current = false;
    moveHistoryRef.current = [];
  }, []);

  const isWinningCell = (row: number, col: number): boolean => {
    if (!state.winCells) return false;
    return state.winCells.some(([r, c]) => r === row && c === col);
  };

  const isLastMoveCell = (row: number, col: number): boolean => {
    if (!state.lastMove) return false;
    return state.lastMove.row === row && state.lastMove.col === col;
  };

  const isAiThinking = state.currentPlayer === 2 && state.status === "playing";

  const statusText = () => {
    if (state.status === "win") {
      return state.winner === 1 ? "You won!" : "AI wins!";
    }
    if (state.status === "draw") return "It's a draw!";
    if (isAiThinking) return "AI is thinking...";
    return "Click a column to drop your piece";
  };

  const playerPill = (player: Player) => {
    const color = player === 1 ? "bg-red-500" : "bg-yellow-400";
    return <span className={cn("inline-block h-4 w-4 rounded-full", color)} />;
  };

  const isColumnAvailable = (col: number): boolean => {
    return state.board[0][col] === null && state.status === "playing" && state.currentPlayer === 1;
  };

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      {/* Header: status + controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {playerPill(1)} You
          </span>
          <span className="text-muted-foreground/40">vs</span>
          <span className="flex items-center gap-1">
            {playerPill(2)} AI
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <motion.div
          key={statusText()}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-sm font-medium px-3 py-1 rounded-full",
            state.status === "win" && state.winner === 1 && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
            state.status === "win" && state.winner === 2 && "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
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

      {/* Board container — wraps indicators + cells for perfect alignment */}
      <div
        ref={boardRef}
        className="relative bg-gradient-to-b from-sky-900 to-slate-900 dark:from-slate-900 dark:to-black p-3 rounded-2xl shadow-xl ring-1 ring-white/10"
        onMouseLeave={() => setHoverCol(null)}
      >
        {/* ── Column hover indicators — shares exact grid with cells ── */}
        <div
          className="grid gap-1.5 mb-1.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: COLS }, (_, col) => (
            <div
              key={`indicator-${col}`}
              className="flex justify-center items-center h-5"
            >
              <AnimatePresence>
                {hoverCol === col && isColumnAvailable(col) && state.currentPlayer === 1 && (
                  <motion.div
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Circle className="h-4 w-4 text-red-400/80 fill-red-400/80" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* ── Column drop zone overlay ── */}
        <div
          className="absolute inset-0 z-10 grid"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            paddingTop: "calc(0.75rem + 1.25rem + 0.375rem)", /* board p-3 + indicator h-5 + mb-1.5 */
          }}
        >
          {Array.from({ length: COLS }, (_, col) => (
            <button
              key={`drop-${col}`}
              type="button"
              onClick={() => handleColumnClick(col)}
              onMouseEnter={() => setHoverCol(col)}
              disabled={!isColumnAvailable(col) || isAiThinking}
              className={cn(
                "h-full rounded-2xl transition-colors duration-150",
                isColumnAvailable(col) && !isAiThinking
                  ? "cursor-pointer hover:bg-white/5 active:bg-white/10"
                  : "cursor-not-allowed",
              )}
              aria-label={`Drop piece in column ${col + 1}`}
            />
          ))}
        </div>

        {/* ── Cells grid ── */}
        <div
          className="relative z-0 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {state.board.map((row, rowIdx) =>
            row.map((cell, colIdx) => {
              const win = isWinningCell(rowIdx, colIdx);
              const last = isLastMoveCell(rowIdx, colIdx);

              return (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className={cn(
                    "flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full transition-all duration-300",
                    "bg-slate-700/60 dark:bg-slate-800/50",
                    win && "ring-2 ring-white/70 shadow-lg shadow-white/20 scale-110",
                    last && !win && "ring-2 ring-white/40",
                  )}
                >
                  <AnimatePresence mode="popLayout">
                    {cell && (
                      <motion.div
                        key={`piece-${rowIdx}-${colIdx}`}
                        initial={{ y: -300, opacity: 0 }}
                        animate={{
                          y: 0,
                          opacity: 1,
                          transition: {
                            type: "spring",
                            stiffness: 200,
                            damping: 20,
                            mass: 0.8,
                          },
                        }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={cn(
                          "h-8 w-8 sm:h-10 sm:w-10 rounded-full shadow-inner shadow-black/30",
                          cell === 1
                            ? "bg-gradient-to-b from-red-400 to-red-600"
                            : "bg-gradient-to-b from-yellow-300 to-yellow-500",
                          win && "shadow-[0_0_14px_rgba(255,255,255,0.4)]",
                        )}
                      >
                        {cell === 2 && (
                          <div className="flex h-full w-full items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-yellow-200/30" />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
