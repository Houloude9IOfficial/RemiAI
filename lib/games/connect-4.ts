// ── Connect 4 — Game Logic (Validation only, no hardcoded AI) ──────

export type Player = 1 | 2; // 1 = Human (Red), 2 = AI (Yellow)
export type Cell = Player | null;
export type Board = Cell[][];
export type GameStatus = "playing" | "win" | "draw";

export interface GameState {
  board: Board;
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winCells: [number, number][] | null;
  lastMove: { row: number; col: number } | null;
}

export const ROWS = 6;
export const COLS = 7;

export function createInitialState(): GameState {
  const board: Board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  return {
    board,
    currentPlayer: 1,
    status: "playing",
    winner: null,
    winCells: null,
    lastMove: null,
  };
}

// ── Game logic ──────────────────────────────────────────────────────

export function getLowestEmptyRow(board: Board, col: number): number | null {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) return row;
  }
  return null;
}

export function getAvailableColumns(board: Board): number[] {
  const cols: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (board[0][col] === null) cols.push(col);
  }
  return cols;
}

export function checkWin(board: Board, player: Player): [number, number][] | null {
  // Check horizontal
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      if (
        board[row][col] === player &&
        board[row][col + 1] === player &&
        board[row][col + 2] === player &&
        board[row][col + 3] === player
      ) {
        return [[row, col], [row, col + 1], [row, col + 2], [row, col + 3]];
      }
    }
  }

  // Check vertical
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 0; col < COLS; col++) {
      if (
        board[row][col] === player &&
        board[row + 1][col] === player &&
        board[row + 2][col] === player &&
        board[row + 3][col] === player
      ) {
        return [[row, col], [row + 1, col], [row + 2, col], [row + 3, col]];
      }
    }
  }

  // Check diagonal (bottom-left to top-right)
  for (let row = 3; row < ROWS; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      if (
        board[row][col] === player &&
        board[row - 1][col + 1] === player &&
        board[row - 2][col + 2] === player &&
        board[row - 3][col + 3] === player
      ) {
        return [[row, col], [row - 1, col + 1], [row - 2, col + 2], [row - 3, col + 3]];
      }
    }
  }

  // Check diagonal (top-left to bottom-right)
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      if (
        board[row][col] === player &&
        board[row + 1][col + 1] === player &&
        board[row + 2][col + 2] === player &&
        board[row + 3][col + 3] === player
      ) {
        return [[row, col], [row + 1, col + 1], [row + 2, col + 2], [row + 3, col + 3]];
      }
    }
  }

  return null;
}

export function isBoardFull(board: Board): boolean {
  return board[0].every((cell) => cell !== null);
}

// ── Move execution ──────────────────────────────────────────────────

export function makeMove(state: GameState, col: number): GameState {
  if (state.status !== "playing") return state;
  if (state.currentPlayer !== 1) return state; // Only human moves via click

  const row = getLowestEmptyRow(state.board, col);
  if (row === null) return state;

  const newBoard = state.board.map((r) => [...r]);
  newBoard[row][col] = 1;

  const winCells = checkWin(newBoard, 1);
  const draw = !winCells && isBoardFull(newBoard);

  return {
    board: newBoard,
    currentPlayer: winCells || draw ? 1 : 2,
    status: winCells ? "win" : draw ? "draw" : "playing",
    winner: winCells ? 1 : null,
    winCells,
    lastMove: { row, col },
  };
}

/** Apply the AI's chosen move. Validates that it's legal. */
export function applyAiMove(state: GameState, col: number): GameState {
  if (state.status !== "playing") return state;
  if (state.currentPlayer !== 2) return state;

  const row = getLowestEmptyRow(state.board, col);
  if (row === null) return state;

  const newBoard = state.board.map((r) => [...r]);
  newBoard[row][col] = 2;

  const winCells = checkWin(newBoard, 2);
  const draw = !winCells && isBoardFull(newBoard);

  return {
    board: newBoard,
    currentPlayer: winCells || draw ? 2 : 1,
    status: winCells ? "win" : draw ? "draw" : "playing",
    winner: winCells ? 2 : null,
    winCells,
    lastMove: { row, col },
  };
}

/** Get a random valid column (fallback if AI response is invalid). */
export function getRandomMove(board: Board): number | null {
  const available = getAvailableColumns(board);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

