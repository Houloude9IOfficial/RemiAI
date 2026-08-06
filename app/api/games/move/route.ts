import { NextResponse } from "next/server";
import { generateText } from "ai";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { providers, providerModels } from "@/db/schema";
import { getLanguageModel } from "@/lib/providers/factory";

// ── Types ──────────────────────────────────────────────────────────

interface TicTacToeRequest {
  game: "tictactoe";
  board: (string | null)[];
  currentPlayer: "X" | "O";
  status: string;
  moveHistory: string[];
}

interface Connect4Request {
  game: "connect4";
  board: (number | null)[][];
  currentPlayer: number;
  status: string;
  moveHistory: string[];
  lastMove: { row: number; col: number } | null;
}

type GameMoveRequest = TicTacToeRequest | Connect4Request;

interface GameMoveResponse {
  move: number;
  explanation?: string;
}

// ── Prompt builders ────────────────────────────────────────────────

function renderTicTacToeBoard(board: (string | null)[]): string {
  const symbols = board.map((c) => c ?? " ");
  return [
    ` ${symbols[0]} │ ${symbols[1]} │ ${symbols[2]} `,
    `───┼───┼───`,
    ` ${symbols[3]} │ ${symbols[4]} │ ${symbols[5]} `,
    `───┼───┼───`,
    ` ${symbols[6]} │ ${symbols[7]} │ ${symbols[8]} `,
  ].join("\n");
}

function renderConnect4Board(board: (number | null)[][]): string {
  return board
    .map((row) =>
      row
        .map((cell) => {
          if (cell === 1) return "R";
          if (cell === 2) return "Y";
          return ".";
        })
        .join(" "),
    )
    .join("\n");
}

function buildTicTacToePrompt(req: TicTacToeRequest): string {
  const boardStr = renderTicTacToeBoard(req.board);
  const available = req.board
    .map((c, i) => (c === null ? String(i) : null))
    .filter(Boolean)
    .join(", ");
  const history =
    req.moveHistory.length > 0
      ? req.moveHistory.join(", ")
      : "No moves yet.";

  return `You are RemiAI playing Tic Tac Toe. You play as O. The human plays as X.

Here is the current board (human=O):

${boardStr}

Board cell indices:
 0 │ 1 │ 2
───┼───┼───
 3 │ 4 │ 5
───┼───┼───
 6 │ 7 │ 8

Available moves (empty cells): ${available}
Move history: ${history}
Game status: ${req.status}

RULES:
- You are O. Pick one of the available moves above.
- Think 1-2 moves ahead. Block the human's threats and build your own.
- Respond with valid JSON ONLY — no other text before or after.

Your task: Pick the best strategic move and explain your reasoning briefly.

Respond with JSON:
{
  "move": <number of chosen empty cell>,
  "explanation": "<brief 1-sentence reasoning>"
}`;
}

function buildConnect4Prompt(req: Connect4Request): string {
  const boardStr = renderConnect4Board(req.board);
  const availableCols: number[] = [];
  for (let col = 0; col < req.board[0].length; col++) {
    if (req.board[0][col] === null) availableCols.push(col);
  }
  const moveHistory =
    req.moveHistory.length > 0
      ? req.moveHistory.join(", ")
      : "No moves yet.";

  return `You are RemiAI playing Connect 4. You play as Y (Yellow, player 2). The human plays as R (Red, player 1).

Here is the current board (row 0 = top, . = empty):
${boardStr}

Columns are numbered 0-6 (left to right).
Available columns (not full): ${availableCols.join(", ")}

Move history: ${moveHistory}
Game status: ${req.status}

RULES:
- Pieces drop to the lowest empty row in the chosen column.
- Get 4 in a row (horizontal, vertical, or diagonal) to win.
- Pick one of the available columns above.
- Respond with valid JSON ONLY — no other text.

Your task: Pick the best strategic column and explain your reasoning briefly.

Respond with JSON:
{
  "move": <column number 0-6 from available columns>,
  "explanation": "<brief 1-sentence reasoning>"
}`;
}

// ── API Route ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GameMoveRequest;

    if (!body.game || !body.board) {
      return NextResponse.json(
        { error: "Missing game or board in request" },
        { status: 400 },
      );
    }

    // ── Find a configured provider ──────────────────────────────────
    const provider = await db
      .select()
      .from(providers)
      .where(eq(providers.enabled, true))
      .get();

    if (!provider) {
      return NextResponse.json(
        {
          error:
            "No AI provider is configured. Go to Settings > Models & Providers to set one up.",
        },
        { status: 400 },
      );
    }

    // ── Find a model for this provider ─────────────────────────────
    let modelId: string | null = null;

    // Try the default model first
    const defaultModel = await db
      .select()
      .from(providerModels)
      .where(
        and(eq(providerModels.providerId, provider.id), eq(providerModels.isDefault, true)),
      )
      .get();

    if (defaultModel) {
      modelId = defaultModel.modelId;
    } else {
      // Fall back to any enabled model
      const anyModel = await db
        .select()
        .from(providerModels)
        .where(
          and(eq(providerModels.providerId, provider.id), eq(providerModels.enabled, true)),
        )
        .get();
      if (anyModel) {
        modelId = anyModel.modelId;
      }
    }

    if (!modelId) {
      return NextResponse.json(
        {
          error:
            "No models available for your provider. Go to Settings > Models & Providers to add one.",
        },
        { status: 400 },
      );
    }

    // ── Build the prompt ───────────────────────────────────────────
    let systemPrompt: string;
    if (body.game === "tictactoe") {
      systemPrompt = buildTicTacToePrompt(body as TicTacToeRequest);
    } else if (body.game === "connect4") {
      systemPrompt = buildConnect4Prompt(body as Connect4Request);
    } else {
      return NextResponse.json({ error: "Unknown game" }, { status: 400 });
    }

    // ── Call the AI model ──────────────────────────────────────────
    const model = getLanguageModel(provider, modelId);

    const userMessage = "Make your move and (optionally) trash-talk me.";

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxRetries: 3,
    });

    const rawText = result.text.trim();

    // ── Parse the JSON response ────────────────────────────────────
    // Try to parse the entire response as JSON first
    let parsed: GameMoveResponse;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Try to extract JSON from code fences
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          return NextResponse.json(
            {
              error: "AI returned invalid JSON. Try again.",
              raw: rawText.slice(0, 500),
            },
            { status: 422 },
          );
        }
      } else {
        return NextResponse.json(
          {
            error: "AI response was not valid JSON. Try again.",
            raw: rawText.slice(0, 500),
          },
          { status: 422 },
        );
      }
    }

  // ── Validate the move ──────────────────────────────────────────
    const move = parsed.move;

    if (typeof move !== "number" || move < 0) {
      return NextResponse.json(
        { error: "AI returned an invalid move value.", raw: rawText.slice(0, 500) },
        { status: 422 },
      );
    }

    return NextResponse.json({
      move,
      explanation: parsed.explanation ?? null,
    });
  } catch (err) {
    console.error("Game move API error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}
