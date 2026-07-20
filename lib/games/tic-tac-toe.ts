// ── Tic Tac Toe — Game Logic (Validation only, no hardcoded AI) ─────

export type Player = "X" | "O";
export type Cell = Player | null;
export type Board = Cell[];
export type GameStatus = "playing" | "win" | "draw";

export interface GameState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winLine: number[] | null;
  lastMove: number | null;
}

export function createInitialState(): GameState {
  return {
    board: Array(9).fill(null),
    currentPlayer: "X",
    status: "playing",
    winner: null,
    winLine: null,
    lastMove: null,
  };
}

// All 8 winning lines
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function checkWinner(board: Board): {
  winner: Player | null;
  winLine: number[] | null;
} {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], winLine: line };
    }
  }
  return { winner: null, winLine: null };
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

export function getAvailableMoves(board: Board): number[] {
  return board.reduce<number[]>((moves, cell, i) => {
    if (cell === null) moves.push(i);
    return moves;
  }, []);
}

// ── Move execution (human clicks) ──────────────────────────────────

export function makeMove(state: GameState, index: number): GameState {
  if (state.status !== "playing") return state;
  if (state.board[index] !== null) return state;
  if (state.currentPlayer !== "X") return state; // Only human moves via click

  const newBoard = [...state.board];
  newBoard[index] = "X";

  const { winner, winLine } = checkWinner(newBoard);
  const draw = !winner && isBoardFull(newBoard);

  return {
    board: newBoard,
    currentPlayer: winner || draw ? "X" : "O",
    status: winner ? "win" : draw ? "draw" : "playing",
    winner,
    winLine,
    lastMove: index,
  };
}

/** Apply the AI's chosen move. Validates that it's legal. */
export function applyAiMove(state: GameState, move: number): GameState {
  if (state.status !== "playing") return state;
  if (state.board[move] !== null) return state;
  if (state.currentPlayer !== "O") return state;

  const newBoard = [...state.board];
  newBoard[move] = "O";

  const { winner, winLine } = checkWinner(newBoard);
  const draw = !winner && isBoardFull(newBoard);

  return {
    board: newBoard,
    currentPlayer: winner || draw ? "O" : "X",
    status: winner ? "win" : draw ? "draw" : "playing",
    winner,
    winLine,
    lastMove: move,
  };
}

/** Get a random valid move (fallback if AI response is invalid). */
export function getRandomMove(board: Board): number | null {
  const available = getAvailableMoves(board);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}


